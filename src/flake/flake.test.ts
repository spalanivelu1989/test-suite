import assert from "node:assert/strict";
import { test } from "node:test";
import type { GeneratedTest, TestResult } from "../types";
import { assessFlakiness, detectFlakes } from "./flake";

const r = (flowId: string, outcome: TestResult["outcome"]): TestResult => ({
  flowId,
  fileName: `${flowId}.spec.ts`,
  outcome,
});

test("detectFlakes flags a flow whose outcome diverges across runs", () => {
  const runs = [
    [r("a", "passed"), r("b", "passed")],
    [r("a", "failed"), r("b", "passed")],
  ];
  const { results, flakeRate } = detectFlakes(runs);
  const a = results.find((x) => x.flowId === "a")!;
  const b = results.find((x) => x.flowId === "b")!;
  assert.equal(a.flaky, true);
  assert.equal(a.outcome, "flaky");
  assert.equal(b.flaky, false);
  assert.equal(b.outcome, "passed");
  assert.equal(flakeRate, 0.5);
});

test("detectFlakes returns 0 rate when all runs agree", () => {
  const runs = [[r("a", "passed")], [r("a", "passed")], [r("a", "passed")]];
  assert.equal(detectFlakes(runs).flakeRate, 0);
});

test("assessFlakiness runs the suite the requested number of times", async () => {
  let calls = 0;
  const tests: GeneratedTest[] = [
    { flowId: "a", fileName: "a.spec.ts", code: "", valid: true },
  ];
  const runOnce = async () => {
    calls += 1;
    return [r("a", calls === 2 ? "failed" : "passed")];
  };
  const { results, flakeRate } = await assessFlakiness(tests, runOnce, 3);
  assert.equal(calls, 3);
  assert.equal(results[0].outcome, "flaky");
  assert.equal(flakeRate, 1);
});
