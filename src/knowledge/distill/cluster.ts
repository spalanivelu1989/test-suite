// Episode clustering for distillation (Spec R10, ADR-0005). Pure and
// deterministic: groups recurring heals by repair strategy and failure-signature
// similarity (cosine when embeddings exist, else lexical token overlap) so the
// LLM only ever summarizes a bounded, coherent cluster. No DB, no LLM, no I/O.
//
//   episodes ──group by strategy──► within strategy: greedy single-link merge
//                                    by max(cosine, lexical) ≥ CLUSTER_THRESHOLD
//                                         │
//                                         ▼
//   Cluster[]  (signature exemplar, runIds, supportCount, contradictions)

import { cosineSim } from "../embeddings/embed";
import { overlapCoefficient } from "../retrieve/coverageDecision";
import type { HealStrategy } from "../types";

/** One healing episode fed to the distiller. */
export interface EpisodeInput {
  runId: string;
  signature: string;
  tokens: string[];
  strategy: HealStrategy;
  embedding: number[] | null;
  before: string;
  after: string;
}

/** A coherent group of episodes that share a failure pattern + repair strategy. */
export interface Cluster {
  strategy: HealStrategy;
  /** Representative (first-seen) signature for the cluster. */
  signature: string;
  episodes: EpisodeInput[];
  /** Distinct supporting runs — the support count for promotion. */
  runIds: string[];
  supportCount: number;
  /** Distinct runs that healed the SAME signature with a DIFFERENT strategy. */
  contradictions: number;
  exemplar: { before: string; after: string };
}

/** Similarity threshold to merge two episodes into one cluster. */
export const CLUSTER_THRESHOLD = 0.6;

function similar(a: EpisodeInput, b: EpisodeInput, threshold: number): boolean {
  const sem =
    a.embedding?.length && b.embedding?.length
      ? cosineSim(a.embedding, b.embedding)
      : 0;
  const lex = overlapCoefficient(new Set(a.tokens), new Set(b.tokens));
  return Math.max(sem, lex) >= threshold;
}

/**
 * Cluster episodes deterministically. `fixme` episodes are excluded — a
 * quarantine is not a reusable fix worth a principle.
 */
export function clusterEpisodes(
  episodes: EpisodeInput[],
  opts: { threshold?: number } = {},
): Cluster[] {
  const threshold = opts.threshold ?? CLUSTER_THRESHOLD;
  const usable = episodes.filter((e) => e.strategy !== "fixme" && e.signature);

  // Group by strategy first so clusters never mix repair kinds.
  const byStrategy = new Map<HealStrategy, EpisodeInput[]>();
  for (const e of usable) {
    const arr = byStrategy.get(e.strategy) ?? [];
    arr.push(e);
    byStrategy.set(e.strategy, arr);
  }

  const clusters: Cluster[] = [];
  for (const [strategy, group] of byStrategy) {
    const buckets: EpisodeInput[][] = [];
    for (const ep of group) {
      const bucket = buckets.find((b) => similar(b[0], ep, threshold));
      if (bucket) bucket.push(ep);
      else buckets.push([ep]);
    }
    for (const bucket of buckets) {
      const runIds = [...new Set(bucket.map((e) => e.runId))];
      clusters.push({
        strategy,
        signature: bucket[0].signature,
        episodes: bucket,
        runIds,
        supportCount: runIds.length,
        contradictions: 0, // filled below across strategies
        exemplar: { before: bucket[0].before, after: bucket[0].after },
      });
    }
  }

  // Contradictions: a signature healed by >1 strategy across runs. For each
  // cluster, count distinct runs that fixed the same signature a DIFFERENT way.
  for (const c of clusters) {
    const cRuns = new Set(c.runIds);
    const conflicting = new Set<string>();
    for (const other of clusters) {
      if (other === c || other.strategy === c.strategy) continue;
      for (const ep of other.episodes) {
        if (
          ep.signature === c.signature &&
          !cRuns.has(ep.runId) // a different run, different strategy, same failure
        ) {
          conflicting.add(ep.runId);
        }
      }
    }
    c.contradictions = conflicting.size;
  }

  return clusters;
}
