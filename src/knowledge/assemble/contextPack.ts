import type { CoverageDecision, GeneratorPack, SpecRef } from "../types";

// Pure assembly of the Generator's context pack (Spec R10/N4, Plan D7). The
// service decides cold/warm/KB-down BEFORE calling this; only the Generator
// receives a pack — the Planner is KB-agnostic (see ADR-0003), so there is no
// planner pack.
//
//   generating → warm: buildGeneratorPack(decisions, specs) | cold/down: {}
//
// `specs[].code` is the copy-forward payload: a `reuse` spec is written verbatim
// to the tests dir (tagged @kp-reused) and is NEVER injected into the Generator
// prompt — the prompt only carries the "already covered, do not regenerate" list
// of scenario names. So the source is deliberately NOT token-bounded here:
// bounding it silently dropped reuse specs past the budget (the tail of a large
// suite), forcing them to be regenerated every run despite confirmed coverage.
// If a future prompt ever renders spec source inline, bound it at that injection
// point — not here, where it would re-break copy-forward.
export function buildGeneratorPack(
  decisions: CoverageDecision[],
  specs: SpecRef[],
): GeneratorPack {
  return { decisions, specs };
}
