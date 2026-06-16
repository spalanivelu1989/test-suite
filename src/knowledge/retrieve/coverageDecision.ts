import type { Pool } from "pg";
import { norm, significantTokens } from "../../coverage/coverage";
import { cosineSim } from "../embeddings/embed";
import { readSpecsForApp, type SpecRow } from "../store/repo";
import type { CoverageAction, CoverageDecision, ScenarioInput } from "../types";

// reuse | new via HYBRID matching (Spec R5, ADR-0003). Lexical (Phase 1) OR
// semantic (Phase 2) clears the bar; err to `new` when uncertain.
//
// TIGHTEN-THEN-COPY (2-way): a planned scenario is either a CONFIDENT match to a
// previously passing spec — copied forward verbatim (`reuse`, fast, no LLM) — or
// it is regenerated from scratch (`new`). There is no middle "extend" tier: that
// tier carried no source for the designer to work from and was skipped, leaving
// planned flows with no test at all. Now every scenario ends with a test —
// copied when we are confident it is the same flow, freshly built otherwise.
//
//   per scenario, over specs:
//     lex = overlapCoefficient(scTokens, specTokens)         (Phase 1)
//     sem = cosineSim(scenarioEmbedding, specEmbedding)      (0 if either missing)
//   select  = spec maximizing max(lex, sem)
//   reuse   if (lex ≥ REUSE OR sem ≥ SEM_REUSE)  AND last passed
//   new     otherwise — weak match, OR strong match whose prior run failed
//
// ADDITIVE GUARANTEE (R8/N3): when embeddings are absent, sem = 0 everywhere, so
// selection (max(lex,0)=lex) and thresholding (sem<SEM_REUSE always) reduce
// EXACTLY to the Phase 1 lexical decider — never a different or worse decision.

export const REUSE_THRESHOLD = 0.8;
// Semantic reuse threshold — CALIBRATED in T15 against the labeled set with the
// real bge-small model (see implementation-notes 2026-06-05): SEM_REUSE=0.82
// gives strong paraphrase recall at 0% false-reuse. Conservative by design —
// only very-high similarity copies a prior test forward; anything weaker
// regenerates, so a near-miss never masks a coverage gap by skipping the test.
export const SEM_REUSE = 0.82;

// HYBRID semantic score (migration 0005). The query is always a bare title
// (ScenarioInput.name); specs.embedding encodes title + step comments (D5), a
// DIFFERENT space in which an exact-title query tops out ~0.79 — below SEM_REUSE,
// so reuse never fired. We blend two cosines against the one title query:
//   semTitle  = cos(query, spec.title_embedding)   symmetric → exact title ~1.0
//   semIntent = cos(query, spec.embedding)          title+steps → disambiguates
//   sem       = w·semTitle + (1−w)·semIntent
// w=0.5 lifts exact matches to ~0.90 (clears 0.82) while structurally-similar but
// DIFFERENT tests stay ~0.77 (below 0.82): their lower semIntent drags the blend
// down. Backward-compatible — a spec with no step comments has
// title_embedding == embedding, so the blend equals the value SEM_REUSE was tuned
// against; a spec with no title_embedding falls back to semIntent for both terms.
export const SEM_TITLE_WEIGHT = 0.5;

/** Overlap coefficient — robust to length asymmetry (short scenario vs long spec). */
export function overlapCoefficient(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / Math.min(a.size, b.size);
}

function passed(outcome: string | null | undefined): boolean {
  return outcome === "passed" || outcome === "healed";
}

function semScore(
  scEmb: number[] | null | undefined,
  specEmb: number[] | null,
): number {
  return scEmb && scEmb.length && specEmb && specEmb.length
    ? cosineSim(scEmb, specEmb)
    : 0;
}

/**
 * Hybrid semantic similarity of a title query to a spec (see SEM_TITLE_WEIGHT).
 * Blends the symmetric title cosine with the richer title+steps cosine. When the
 * spec has no title_embedding (un-backfilled), semTitle falls back to semIntent,
 * so the blend reduces to today's pure-`embedding` score.
 */
function hybridSem(scEmb: number[] | null | undefined, spec: SpecRow): number {
  const semIntent = semScore(scEmb, spec.embedding);
  const semTitle =
    spec.titleEmbedding && spec.titleEmbedding.length
      ? semScore(scEmb, spec.titleEmbedding)
      : semIntent;
  return SEM_TITLE_WEIGHT * semTitle + (1 - SEM_TITLE_WEIGHT) * semIntent;
}

/**
 * Pure core (T12-testable without a DB): decide each scenario against existing
 * specs using both lexical tokens and (optional) embeddings.
 */
export function decideForSpecs(
  scenarios: ScenarioInput[],
  specs: SpecRow[],
  thresholds?: { semReuse?: number },
): CoverageDecision[] {
  const semReuse = thresholds?.semReuse ?? SEM_REUSE;
  return scenarios.map((sc) => {
    const scTokens = significantTokens(sc.name);
    let bestSpec: SpecRow | null = null;
    let bestLex = 0;
    let bestSem = 0;
    let bestCombined = -1;
    for (const s of specs) {
      const lex = overlapCoefficient(scTokens, new Set(s.tokens));
      const sem = hybridSem(sc.embedding, s);
      const combined = Math.max(lex, sem);
      if (combined > bestCombined) {
        bestCombined = combined;
        bestSpec = s;
        bestLex = lex;
        bestSem = sem;
      }
    }

    // `reuse` (copy forward) only on a CONFIDENT signal AND a passing prior run.
    // Everything else — no match, a weak match, or a strong match whose prior
    // run failed — is `new`: regenerated from scratch, never silently skipped.
    const confident = bestLex >= REUSE_THRESHOLD || bestSem >= semReuse;

    // Fix 2 — cross-flow guard. A confident TITLE match is not enough if the
    // scenario and the matched spec belong to DIFFERENT flows/pages: two unrelated
    // workflows can share a title (a newsletter "Submit form" vs a support "Submit
    // form"), and reusing the wrong one silently hides a coverage gap. Only blocks
    // when BOTH flows are known; if either is absent (today's callers) the decision
    // is unchanged. Compared via the same norm() that produced the spec's flowId.
    const sameFlow =
      !sc.flowId ||
      !bestSpec?.flowId ||
      norm(sc.flowId) === norm(bestSpec.flowId);

    const action: CoverageAction =
      bestSpec !== null && confident && passed(bestSpec.lastOutcome) && sameFlow
        ? "reuse"
        : "new";

    if (action === "new" || bestSpec === null) {
      return {
        scenario: sc.name,
        action: "new",
        score: Math.max(bestLex, bestSem),
      };
    }

    return {
      scenario: sc.name,
      action: "reuse",
      matchedSpec: {
        runId: bestSpec.runId,
        file: bestSpec.file,
        title: bestSpec.title,
        flowId: bestSpec.flowId ?? undefined,
        lastOutcome: bestSpec.lastOutcome ?? undefined,
      },
      score: Math.max(bestLex, bestSem),
      lastOutcome: bestSpec.lastOutcome ?? undefined,
    };
  });
}

/** R9: decide each planned scenario against an app's existing specs. */
export async function planCoverageDecision(
  pool: Pool,
  appId: string,
  scenarios: ScenarioInput[],
): Promise<CoverageDecision[]> {
  const specs = await readSpecsForApp(pool, appId);
  return decideForSpecs(scenarios, specs);
}
