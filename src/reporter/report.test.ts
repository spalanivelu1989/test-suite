import assert from "node:assert/strict";
import { test } from "node:test";
import type { CoverageSummary, TestResult } from "../types";
import {
  buildReport,
  type ReportInput,
  reportToJson,
  summarize,
} from "./report";

const results: TestResult[] = [
  { flowId: "home", fileName: "home.spec.ts", outcome: "passed" },
  { flowId: "c", fileName: "c.spec.ts", outcome: "failed", failureReason: "x" },
  { flowId: "h", fileName: "h.spec.ts", outcome: "healed", healed: true },
  { flowId: "q", fileName: "q.spec.ts", outcome: "fixme" },
];
const coverage: CoverageSummary = {
  curatedTotal: 2,
  testedCount: 2,
  percent: 100,
  missingFlows: [],
};

const base: ReportInput = {
  runId: "r1",
  url: "https://x.com",
  results,
  coverage,
  flakeRate: 0.1,
  healSuccessRate: 0.5,
  claudeCallCount: 4,
  fixPrompts: [{ test: "c", problem: "selector", change: "use getByRole" }],
  issues: ["slow"],
  better: "better prose",
  recommendationsText: "rec prose",
  recommendations: ["add labels"],
  summary: ["simple summary"],
  planMarkdown: "# Plan",
  generatedSpecs: [{ file: "home.spec.ts", code: "x" }],
};

test("buildReport assembles all rich fields incl. success rate", () => {
  const report = buildReport(base);
  assert.equal(report.runId, "r1");
  assert.equal(report.coverage.percent, 100);
  assert.equal(report.successRate.total, 4);
  assert.equal(report.successRate.passed, 2); // passed + healed
  assert.equal(report.successRate.rate, 0.5);
  assert.equal(report.fixPrompts.length, 1);
  assert.deepEqual(report.issues, ["slow"]);
  assert.equal(report.better, "better prose");
  assert.equal(report.recommendationsText, "rec prose");
  assert.deepEqual(report.summary, ["simple summary"]);
  assert.equal(report.planMarkdown, "# Plan");
  assert.ok(report.generatedAt);
  assert.doesNotThrow(() => JSON.parse(reportToJson(report)));
});

test("summarize counts outcomes including fixme", () => {
  const s = summarize(buildReport(base));
  assert.deepEqual(s, {
    total: 4,
    passed: 1,
    failed: 1,
    flaky: 0,
    healed: 1,
    fixme: 1,
  });
});
