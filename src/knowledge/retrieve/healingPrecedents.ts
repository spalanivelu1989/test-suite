// Healing-precedent selection (Spec R6, ADR-0004). The pure, DB-free core that
// ranks prior SUCCESSFUL heals against a new failure using the SAME hybrid signal
// as coverageDecision: lexical signature-token overlap OR semantic cosine. Kept
// pure so the additive-no-regression property is trivially testable (no candidate
// ⇒ no precedent ⇒ Phase-2 prompt unchanged).
//
//   per candidate heal:
//     lex = overlapCoefficient(queryTokens, eventTokens)
//     sem = (qEmb && evEmb) ? cosineSim(qEmb, evEmb) : 0
//   keep  max(lex, sem) ≥ threshold,  sort desc,  take k

import { cosineSim } from "../embeddings/embed";
import { overlapCoefficient } from "./coverageDecision";
import type { HealStrategy, HealingPrecedent } from "../types";

/** A stored healing event as loaded for matching (successful heals only). */
export interface HealingEventRow {
  runId: string;
  file: string;
  flowId: string | null;
  failureSignature: string;
  strategy: HealStrategy;
  before: string;
  after: string;
  tokens: string[];
  embedding: number[] | null;
}

/** Default precedent-match bar — calibrated in Forge (T23), recorded in notes. */
export const PRECEDENT_THRESHOLD = 0.6;

export interface PrecedentQuery {
  tokens: string[];
  embedding?: number[] | null;
}

/**
 * Rank candidate heals against a query failure; return the top-k above the bar.
 * `events` are assumed already app-scoped and successful (outcome 'healed').
 */
export function selectPrecedents(
  query: PrecedentQuery,
  events: HealingEventRow[],
  opts: { k?: number; threshold?: number } = {},
): HealingPrecedent[] {
  const k = opts.k ?? 3;
  const threshold = opts.threshold ?? PRECEDENT_THRESHOLD;
  const qTokens = new Set(query.tokens);

  return events
    .map((ev) => {
      const lex = overlapCoefficient(qTokens, new Set(ev.tokens));
      const sem =
        query.embedding && query.embedding.length && ev.embedding?.length
          ? cosineSim(query.embedding, ev.embedding)
          : 0;
      return { ev, score: Math.max(lex, sem) };
    })
    .filter((s) => s.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map(({ ev, score }) => ({
      runId: ev.runId,
      file: ev.file,
      flowId: ev.flowId,
      failureSignature: ev.failureSignature,
      strategy: ev.strategy,
      before: ev.before,
      after: ev.after,
      score,
    }));
}

/**
 * Derive resilient-locator hints for the Generator (R8) from an app's successful
 * heals: surface the repair strategies seen for a flow so new specs avoid the
 * known-brittle pattern. Deterministic, dedup'd, most-common first.
 */
export function deriveLocatorHints(
  events: HealingEventRow[],
  flowId?: string | null,
): string[] {
  const HINTS: Partial<Record<HealStrategy, string>> = {
    "role-locator":
      "Prefer getByRole/getByLabel/getByText over brittle CSS/id selectors — these were healed before.",
    "regex-text":
      "Use regex/partial text matches for dynamic content — exact text matches were healed before.",
    "wait-visibility":
      "Add an explicit visibility/wait before interacting — missing waits flaked before.",
  };
  const counts = new Map<HealStrategy, number>();
  for (const ev of events) {
    if (flowId && ev.flowId && ev.flowId !== flowId) continue;
    if (!HINTS[ev.strategy]) continue;
    counts.set(ev.strategy, (counts.get(ev.strategy) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([s]) => HINTS[s] as string);
}
