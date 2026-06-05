import type { Pool } from "pg";
import { significantTokens } from "../../coverage/coverage";
import { readSpecsForApp, type SpecRow } from "../store/repo";
import type { CoverageAction, CoverageDecision, ScenarioInput } from "../types";

// reuse | extend | new via lexical overlap (Spec R9, Plan D5). Erring toward
// `new`/`extend` when uncertain so a real gap is never masked as covered (SC9).
//
//   overlap = |scenario ∩ spec| / min(|scenario|, |spec|)   (overlap coefficient)
//     ≥ 0.80 AND last run passed → reuse   (skip generation, copy prior spec)
//     0.45 .. 0.80               → extend   (augment the existing spec)
//     < 0.45 / paraphrase miss   → new      (generate fresh)

export const REUSE_THRESHOLD = 0.8;
export const EXTEND_THRESHOLD = 0.45;

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

/**
 * Pure core (T16-testable without a DB): decide each scenario against a set of
 * existing specs.
 */
export function decideForSpecs(
  scenarios: ScenarioInput[],
  specs: SpecRow[],
): CoverageDecision[] {
  return scenarios.map((sc) => {
    const scTokens = significantTokens(sc.name);
    let bestSpec: SpecRow | null = null;
    let bestScore = 0;
    for (const s of specs) {
      const score = overlapCoefficient(scTokens, new Set(s.tokens));
      if (bestSpec === null || score > bestScore) {
        bestSpec = s;
        bestScore = score;
      }
    }

    if (bestSpec === null || bestScore < EXTEND_THRESHOLD) {
      return { scenario: sc.name, action: "new", score: bestScore };
    }

    const matchedSpec = {
      runId: bestSpec.runId,
      file: bestSpec.file,
      title: bestSpec.title,
      flowId: bestSpec.flowId ?? undefined,
      lastOutcome: bestSpec.lastOutcome ?? undefined,
    };

    // reuse (skip) only when strongly overlapping AND last run passed; the
    // boundary errs to `extend` (still produces a test), never silently skips.
    const action: CoverageAction =
      bestScore >= REUSE_THRESHOLD && passed(bestSpec.lastOutcome)
        ? "reuse"
        : "extend";

    return {
      scenario: sc.name,
      action,
      matchedSpec,
      score: bestScore,
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
