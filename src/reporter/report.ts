import type { CoverageSummary, Flow, RunReport, TestResult } from "../types";

export interface ReportInput {
  runId: string;
  url: string;
  flows: Flow[];
  results: TestResult[];
  coverage: CoverageSummary;
  flakeRate: number;
  healSuccessRate: number;
  claudeCallCount: number;
}

/** T13: assemble the canonical JSON report (R11). Pure. */
export function buildReport(input: ReportInput): RunReport {
  return {
    runId: input.runId,
    url: input.url,
    generatedAt: new Date().toISOString(),
    flows: input.flows,
    results: input.results,
    coverage: input.coverage,
    flakeRate: input.flakeRate,
    healSuccessRate: input.healSuccessRate,
    claudeCallCount: input.claudeCallCount,
  };
}

export function reportToJson(report: RunReport): string {
  return JSON.stringify(report, null, 2);
}

/** Convenience counts used by both renderers (T14) and the UI (T21). */
export function summarize(report: RunReport): {
  total: number;
  passed: number;
  failed: number;
  flaky: number;
  healed: number;
} {
  const total = report.results.length;
  const by = (o: TestResult["outcome"]) =>
    report.results.filter((r) => r.outcome === o).length;
  return {
    total,
    passed: by("passed"),
    failed: by("failed"),
    flaky: by("flaky"),
    healed: by("healed"),
  };
}
