// Distillation core (Spec R9/R10/R11/R15, ADR-0005). Pulled out of the CLI so it
// is testable against a real pool. Incremental via the watermark: a no-op when no
// new heals have landed. Reclusters over ALL healed episodes each run so support
// counts stay correct and the upsert is idempotent.
//
//   watermark ──► new episodes? ──no──► no-op
//        │ yes
//        ▼
//   ALL healed episodes ──cluster──► summarize (LLM│template) ──► upsert
//        │                                              (episodic→trusted by
//        ▼                                               support N, no contradiction)
//   procedural aggregates (app × crawl-mode × coverage) ──► upsert
//        │
//        ▼  advance watermark

import { createHash } from "node:crypto";
import type { Pool } from "pg";
import type { Embedder } from "../embeddings/embed";
import {
  latestEpisodeAt,
  readEpisodesSince,
  readProceduralAggregates,
  readWatermark,
  setWatermark,
  upsertPlaybook,
} from "../store/repo";
import { clusterEpisodes } from "./cluster";
import { confidenceFor, nextStatus } from "./promote";
import { type Summarizer, summarizeCluster } from "./summarize";

const sha1 = (s: string) =>
  createHash("sha1").update(s).digest("hex").slice(0, 16);

export interface DistillOptions {
  /** Optional LLM summarizer; omitted → deterministic templates (C4). */
  summarize?: Summarizer;
  /** Optional embedder for principle vectors (best-effort). */
  embedder?: Embedder;
  /** Min repeated runs for a procedural playbook (R15). */
  proceduralMinRuns?: number;
}

export interface DistillResult {
  noop: boolean;
  playbooks: number;
  trusted: number;
  procedural: number;
  episodes: number;
}

/** Run one distillation pass over the knowledge base. */
export async function runDistillation(
  pool: Pool,
  opts: DistillOptions = {},
): Promise<DistillResult> {
  const proceduralMinRuns = opts.proceduralMinRuns ?? 2;

  // Incremental gate: nothing new since last run → no-op (N3/SC8/AC11).
  const watermark = await readWatermark(pool);
  const fresh = await readEpisodesSince(pool, watermark);
  if (fresh.length === 0) {
    return { noop: true, playbooks: 0, trusted: 0, procedural: 0, episodes: 0 };
  }

  // Recluster over ALL healed episodes so support counts are correct & stable.
  const all = await readEpisodesSince(pool, "1970-01-01T00:00:00Z");
  const clusters = clusterEpisodes(all);

  let trusted = 0;
  for (const c of clusters) {
    const principle = await summarizeCluster(c, opts.summarize);
    const signal = {
      supportCount: c.supportCount,
      contradictions: c.contradictions,
    };
    const status = nextStatus(signal);
    if (status === "trusted") trusted++;

    let embedding: number[] | null = null;
    if (opts.embedder) {
      try {
        [embedding] = await opts.embedder.embed([principle.principle]);
      } catch {
        embedding = null; // best-effort
      }
    }

    await upsertPlaybook(pool, {
      id: `global:all:${c.strategy}:${sha1(c.signature)}`,
      scope: { kind: "global", key: "all" },
      principle: principle.principle,
      antipattern: principle.antipattern,
      recommendation: principle.recommendation,
      evidenceRunIds: c.runIds,
      supportCount: c.supportCount,
      confidence: confidenceFor(signal),
      status,
      embedding,
    });
  }

  // Procedural playbooks: best crawl strategy per app (R15) — advice only.
  let procedural = 0;
  for (const agg of await readProceduralAggregates(pool)) {
    if (agg.runs < proceduralMinRuns) continue;
    const signal = { supportCount: agg.runs, contradictions: 0 };
    await upsertPlaybook(pool, {
      id: `app:${agg.appId}:procedural:${sha1(agg.crawlMode)}`,
      scope: { kind: "app", key: agg.appId },
      principle: `For this app, ${agg.crawlMode} crawl mode averaged ${agg.avgPercent}% coverage over ${agg.runs} runs.`,
      recommendation: `Prefer ${agg.crawlMode} mode for this app unless coverage gaps demand a deeper crawl.`,
      evidenceRunIds: [],
      supportCount: agg.runs,
      confidence: confidenceFor(signal),
      status: nextStatus(signal),
      embedding: null,
    });
    procedural++;
  }

  const newest = await latestEpisodeAt(pool);
  if (newest) await setWatermark(pool, newest);

  return {
    noop: false,
    playbooks: clusters.length,
    trusted,
    procedural,
    episodes: all.length,
  };
}
