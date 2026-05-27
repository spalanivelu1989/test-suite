import assert from "node:assert/strict";
import { test } from "node:test";
import type { CoverageSummary, Flow, TestResult } from "../types";
import { buildReport, reportToJson, summarize } from "./report";

const flows: Flow[] = [{ id: "home", name: "Home", steps: [] }];
const results: TestResult[] = [
  { flowId: "home", fileName: "home.spec.ts", outcome: "passed" },
  { flowId: "c", fileName: "c.spec.ts", outcome: "failed", failureReason: "x" },
  { flowId: "h", fileName: "h.spec.ts", outcome: "healed", healed: true },
];
const coverage: CoverageSummary = {
  curatedTotal: 2,
  testedCount: 2,
  percent: 100,
  missingFlows: [],
};

test("buildReport assembles all fields with a timestamp", () => {
  const report = buildReport({
    runId: "r1",
    url: "https://x.com",
    flows,
    results,
    coverage,
    flakeRate: 0.1,
    healSuccessRate: 0.5,
    claudeCallCount: 4,
  });
  assert.equal(report.runId, "r1");
  assert.equal(report.coverage.percent, 100);
  assert.equal(report.claudeCallCount, 4);
  assert.ok(report.generatedAt);
  assert.doesNotThrow(() => JSON.parse(reportToJson(report)));
});

test("summarize counts outcomes", () => {
  const report = buildReport({
    runId: "r1",
    url: "https://x.com",
    flows,
    results,
    coverage,
    flakeRate: 0,
    healSuccessRate: 0,
    claudeCallCount: 0,
  });
  const s = summarize(report);
  assert.deepEqual(s, { total: 3, passed: 1, failed: 1, flaky: 0, healed: 1 });
});
