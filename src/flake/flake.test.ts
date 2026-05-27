import assert from "node:assert/strict";
import { test } from "node:test";
import type { TestResult } from "../types";
import { detectFlakes } from "./flake";

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
