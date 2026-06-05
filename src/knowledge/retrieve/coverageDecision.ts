import type { Pool } from "pg";
import { significantTokens } from "../../coverage/coverage";
import { cosineSim } from "../embeddings/embed";
import { readSpecsForApp, type SpecRow } from "../store/repo";
import type { CoverageAction, CoverageDecision, ScenarioInput } from "../types";

// reuse | extend | new via HYBRID matching (Spec R5, ADR-0003). Lexical (Phase 1)
// OR semantic (Phase 2) clears the bar; err to `new` when uncertain; `reuse`
// needs the matched spec's last run passed.
//
//   per scenario, over specs:
//     lex = overlapCoefficient(scTokens, specTokens)         (Phase 1)
//     sem = cosineSim(scenarioEmbedding, specEmbedding)      (0 if either missing)
//   select  = spec maximizing max(lex, sem)
//   reuse   if (lex ≥ REUSE OR sem ≥ SEM_REUSE)  AND last passed
//   extend  if (lex ≥ EXTEND OR sem ≥ SEM_EXTEND)
//   new     otherwise                                        (err to new)
//
// ADDITIVE GUARANTEE (R8/N3): when embeddings are absent, sem = 0 everywhere, so
// selection (max(lex,0)=lex) and thresholding (sem<SEM_* always) reduce EXACTLY
// to the Phase 1 lexical decider — never a different or worse decision.

export const REUSE_THRESHOLD = 0.8;
export const EXTEND_THRESHOLD = 0.45;
// Semantic thresholds — CALIBRATED in T15 against the labeled set with the real
// bge-small model (see implementation-notes 2026-06-05): SEM_EXTEND=0.60 gives
// 95% paraphrase recall at 0% false-reuse. SEM_REUSE stays conservative (0.82):
// only very-high similarity → `reuse` (skip); moderate paraphrases → `extend`
// (still produce/augment a test), protecting against masked coverage gaps.
export const SEM_REUSE = 0.82;
export const SEM_EXTEND = 0.6;

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
 * Pure core (T12-testable without a DB): decide each scenario against existing
 * specs using both lexical tokens and (optional) embeddings.
 */
export function decideForSpecs(
  scenarios: ScenarioInput[],
  specs: SpecRow[],
  thresholds?: { semReuse?: number; semExtend?: number },
): CoverageDecision[] {
  const semReuse = thresholds?.semReuse ?? SEM_REUSE;
  const semExtend = thresholds?.semExtend ?? SEM_EXTEND;
  return scenarios.map((sc) => {
    const scTokens = significantTokens(sc.name);
    let bestSpec: SpecRow | null = null;
    let bestLex = 0;
    let bestSem = 0;
    let bestCombined = -1;
    for (const s of specs) {
      const lex = overlapCoefficient(scTokens, new Set(s.tokens));
      const sem = semScore(sc.embedding, s.embedding);
      const combined = Math.max(lex, sem);
      if (combined > bestCombined) {
        bestCombined = combined;
        bestSpec = s;
        bestLex = lex;
        bestSem = sem;
      }
    }

    if (
      bestSpec === null ||
      (bestLex < EXTEND_THRESHOLD && bestSem < semExtend)
    ) {
      return {
        scenario: sc.name,
        action: "new",
        score: Math.max(bestLex, bestSem),
      };
    }

    const matchedSpec = {
      runId: bestSpec.runId,
      file: bestSpec.file,
      title: bestSpec.title,
      flowId: bestSpec.flowId ?? undefined,
      lastOutcome: bestSpec.lastOutcome ?? undefined,
    };

    // reuse (skip) only when a strong signal AND the prior run passed; the
    // boundary errs to `extend` (still produces a test), never silently skips.
    const action: CoverageAction =
      (bestLex >= REUSE_THRESHOLD || bestSem >= semReuse) &&
      passed(bestSpec.lastOutcome)
        ? "reuse"
        : "extend";

    return {
      scenario: sc.name,
      action,
      matchedSpec,
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
