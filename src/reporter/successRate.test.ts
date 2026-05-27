import assert from "node:assert/strict";
import { test } from "node:test";
import type { TestResult } from "../types";
import { bucketResults, computeSuccessRate } from "./successRate";

const results: TestResult[] = [
  { flowId: "a", fileName: "a.spec.ts", outcome: "passed" },
  { flowId: "b", fileName: "b.spec.ts", outcome: "healed", healed: true },
  { flowId: "c", fileName: "c.spec.ts", outcome: "failed" },
  { flowId: "d", fileName: "d.spec.ts", outcome: "fixme" },
  { flowId: "e", fileName: "e.spec.ts", outcome: "flaky", flaky: true },
];

test("computeSuccessRate counts passed+healed over all planned (fixme not-passed)", () => {
  const sr = computeSuccessRate(results);
  assert.equal(sr.total, 5);
  assert.equal(sr.passed, 2); // passed + healed
  assert.equal(sr.rate, 0.4);
});

test("computeSuccessRate is 0 for an empty suite", () => {
  assert.equal(computeSuccessRate([]).rate, 0);
});

test("bucketResults splits passed / needs-attention / where-to-improve", () => {
  const b = bucketResults(results);
  assert.deepEqual(
    b.passed.map((r) => r.flowId),
    ["a"],
  );
  assert.deepEqual(b.needsAttention.map((r) => r.flowId).sort(), ["c", "d"]);
  assert.deepEqual(b.whereToImprove.map((r) => r.flowId).sort(), ["b", "e"]);
});
