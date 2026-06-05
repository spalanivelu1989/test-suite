import type {
  AppProfile,
  CoverageDecision,
  GeneratorPack,
  SpecRef,
} from "../types";

// Token-bounded context packs (Spec R8/R10/N4, Plan D7). Pure assembly — the
// service decides cold/warm/KB-down BEFORE calling these:
//
//   stage=planning  → warm: buildPlannerPack(profile)   | cold/down: {} (no pack)
//   stage=generating→ warm: buildGeneratorPack(decisions, specs)
//
// Budgets are char-approximated (~4 chars/token) to keep prompts small.

const PLANNER_BUDGET_CHARS = 4_800; // ~1200 tokens
const GENERATOR_CODE_BUDGET_CHARS = 8_000; // ~2000 tokens of reused spec source

function clip(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

/** R8: the "what we already know about this app" block for the Planner. */
export function buildPlannerPack(
  profile: AppProfile,
  budgetChars = PLANNER_BUDGET_CHARS,
): string {
  const covered = profile.coveredFlows.map((f) => f.name);
  const gaps = profile.gaps.map((f) => f.name);
  const lines = [
    `KNOWLEDGE — what we already know about ${profile.url} ` +
      `(${profile.runCount} prior run(s), ${profile.flows.length} known flow(s)):`,
  ];
  if (covered.length)
    lines.push(
      `Already covered (do not re-plan unless re-verifying): ${covered.join(", ")}.`,
    );
  if (gaps.length)
    lines.push(
      `Known but UNTESTED — focus exploration here: ${gaps.join(", ")}.`,
    );
  if (!covered.length && !gaps.length)
    lines.push("No flows recorded yet — explore broadly.");
  return clip(lines.join("\n"), budgetChars);
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
