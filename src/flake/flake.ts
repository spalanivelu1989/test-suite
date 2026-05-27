import type { GeneratedTest, TestResult } from "../types";

/**
 * Compare results across N identical runs (R7). A flow whose outcome diverges
 * across runs is flagged flaky. flakeRate = flaky flows / total flows.
 */
export function detectFlakes(runs: TestResult[][]): {
  results: TestResult[];
  flakeRate: number;
} {
  if (runs.length === 0) return { results: [], flakeRate: 0 };

  const flowIds = [...new Set(runs.flat().map((r) => r.flowId))];
  const results: TestResult[] = flowIds.map((flowId) => {
    const perRun = runs.map((run) => run.find((r) => r.flowId === flowId));
    const base = perRun.find((r) => r) ?? {
      flowId,
      fileName: "",
      outcome: "failed" as const,
    };
    const outcomes = new Set(perRun.map((r) => r?.outcome ?? "missing"));
    const flaky = outcomes.size > 1;
    return {
      ...base,
      flaky,
      outcome: flaky ? "flaky" : base.outcome,
    };
  });

  const flakyCount = results.filter((r) => r.flaky).length;
  const flakeRate = results.length === 0 ? 0 : flakyCount / results.length;
  return { results, flakeRate };
}

export type RunOnce = (tests: GeneratedTest[]) => Promise<TestResult[]>;

/**
 * Run the tests `reruns` times on the unchanged app and assess flakiness.
 * `reruns` includes the first run (default 3 per M2's measurement definition).
 */
export async function assessFlakiness(
  tests: GeneratedTest[],
  runOnce: RunOnce,
  reruns = 3,
): Promise<{ results: TestResult[]; flakeRate: number }> {
  const runs: TestResult[][] = [];
  for (let i = 0; i < Math.max(1, reruns); i++) {
    runs.push(await runOnce(tests));
  }
  return detectFlakes(runs);
}
