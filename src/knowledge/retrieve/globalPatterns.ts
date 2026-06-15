import type { CoverageDecision, PatternHint, ScenarioInput } from "../types";

// PROTOTYPE — Global pattern-retrieval tier (cross-app knowledge transfer).
//
// The app-scoped reuse tier (decideForSpecs) copies a prior spec's SOURCE forward
// verbatim, so it MUST stay app-scoped: selectors/routes are bound to one origin.
// This tier is different in kind. It never copies code and never produces a
// `reuse` decision. It retrieves, from OTHER apps, the titles of similar prior
// scenarios that PASSED — purely as few-shot "here's how this workflow was tested
// elsewhere" context for the Designer, which still generates a fresh spec against
// the current DOM. Read-only inspiration, never executed.
//
//   per `new` scenario, over cross-app passing specs (HNSW nearest):
//     sem = cosine(scenarioEmbedding, specEmbedding)
//   keep  hints with sem ≥ PATTERN_RELEVANCE, top-k, never the current app
//
// Why a LOWER bar than SEM_REUSE (0.82): reuse asks "is this the SAME test?" (must
// be near-certain — a wrong copy is a broken test). A pattern asks "is this a
// RELEVANT example?" — a looser, ranked, advisory signal the Designer can ignore.
//
// ADDITIVE GUARANTEE: this tier only ever ADDS `patterns` to the Designer pack and
// only for scenarios already decided `new`. It cannot change a `reuse`/`new`
// decision, so with the feature flag off (default) the pipeline is byte-identical.

/** Relevance floor for a cross-app pattern hint — deliberately below SEM_REUSE. */
export const PATTERN_RELEVANCE = 0.7;
/**
 * Hints surfaced PER scenario: only the single top-scoring match above the floor
 * is passed to the generator as reference (no runner-ups).
 */
export const PATTERN_K = 1;
/** Overall cap across all `new` scenarios (one top match each), to bound the prompt. */
export const PATTERN_BUDGET = 8;
/** Cap each hint's abstracted-workflow skeleton so a long spec can't flood the prompt. */
export const PATTERN_WORKFLOW_MAXLEN = 240;

/** One cross-app candidate spec returned by the nearest-neighbor read. */
export interface GlobalPatternRow {
  appId: string;
  runId: string;
  file: string;
  title: string | null;
  flowId: string | null;
  /** Cosine similarity to the query scenario, 0..1 (1 − HNSW distance). */
  score: number;
  /** Abstracted workflow text (title + steps, entities stripped) — pattern_text. */
  patternText?: string | null;
}

/**
 * Trim an abstracted pattern_text into a compact, selector-free workflow skeleton
 * for the Designer prompt: collapse whitespace and cap length on a word boundary.
 */
export function workflowSkeleton(
  patternText: string | null | undefined,
  maxLen = PATTERN_WORKFLOW_MAXLEN,
): string | undefined {
  const text = (patternText ?? "").replace(/\s+/g, " ").trim();
  if (!text) return undefined;
  if (text.length <= maxLen) return text;
  const cut = text.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/**
 * Pure core (DB-free, unit-testable like decideForSpecs/selectPrecedents):
 * rank one scenario's cross-app candidates into advisory pattern hints.
 * Filters below the relevance floor, drops untitled rows, caps to `k`.
 */
export function selectGlobalPatterns(
  scenario: string,
  candidates: GlobalPatternRow[],
  opts?: { minScore?: number; k?: number },
): PatternHint[] {
  const minScore = opts?.minScore ?? PATTERN_RELEVANCE;
  const k = opts?.k ?? PATTERN_K;
  return candidates
    .filter((c) => c.title && c.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((c) => ({
      scenario,
      patternTitle: c.title as string,
      sourceApp: c.appId,
      flowId: c.flowId ?? undefined,
      score: c.score,
      workflow: workflowSkeleton(c.patternText),
    }));
}

/**
 * Pure cross-scenario merge: dedupe identical patterns surfaced for multiple
 * scenarios (same title+source), keep the highest-scoring occurrence, and cap to
 * a global budget so a large plan can't flood the Designer prompt.
 */
export function mergePatternHints(
  perScenario: PatternHint[][],
  budget = PATTERN_BUDGET,
): PatternHint[] {
  const best = new Map<string, PatternHint>();
  for (const h of perScenario.flat()) {
    const key = `${h.sourceApp}::${h.patternTitle}`;
    const prev = best.get(key);
    if (!prev || h.score > prev.score) best.set(key, h);
  }
  return [...best.values()].sort((a, b) => b.score - a.score).slice(0, budget);
}

/** The scenarios this tier should retrieve for: only those decided `new`. */
export function scenariosNeedingPatterns(
  decisions: CoverageDecision[],
  scenarios: ScenarioInput[],
): ScenarioInput[] {
  const newNames = new Set(
    decisions.filter((d) => d.action === "new").map((d) => d.scenario),
  );
  return scenarios.filter(
    (s) => newNames.has(s.name) && s.embedding && s.embedding.length > 0,
  );
}
