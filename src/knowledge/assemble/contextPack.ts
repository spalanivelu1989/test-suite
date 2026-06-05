import type { CoverageDecision, GeneratorPack, SpecRef } from "../types";

// Token-bounded context pack (Spec R10/N4, Plan D7). Pure assembly — the service
// decides cold/warm/KB-down BEFORE calling this. Only the Generator receives a
// pack; the Planner is KB-agnostic (see ADR-0003), so there is no planner pack.
//
//   generating → warm: buildGeneratorPack(decisions, specs) | cold/down: {}
//
// Budget is char-approximated (~4 chars/token) to keep prompts small.

const GENERATOR_CODE_BUDGET_CHARS = 8_000; // ~2000 tokens of reused spec source

function clip(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

/** R10: decisions + (bounded) existing spec source for the Generator. */
export function buildGeneratorPack(
  decisions: CoverageDecision[],
  specs: SpecRef[],
  codeBudgetChars = GENERATOR_CODE_BUDGET_CHARS,
): GeneratorPack {
  let used = 0;
  const bounded = specs.map((s) => {
    if (s.code && used < codeBudgetChars) {
      const code = clip(s.code, codeBudgetChars - used);
      used += code.length;
      return { ...s, code };
    }
    return { ...s, code: undefined };
  });
  return { decisions, specs: bounded };
}
