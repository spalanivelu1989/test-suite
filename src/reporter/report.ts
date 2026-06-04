import type {
  CoverageSummary,
  FixPrompt,
  Flow,
  RunReport,
  TestResult,
} from "../types";
import { computeSuccessRate } from "./successRate";

export interface ReportInput {
  runId: string;
  url: string;
  results: TestResult[];
  coverage: CoverageSummary;
  flakeRate: number;
  healSuccessRate: number;
  claudeCallCount: number;
  fixPrompts: FixPrompt[];
  issues: string[];
  recommendations: string[];
  better?: string;
  recommendationsText?: string;
  summary?: string[];
  testSummary?: string;
  planMarkdown: string | null;
  generatedSpecs: { file: string; code: string }[];
  flows?: Flow[];
  screenshots?: { filename: string; base64: string }[];
}

/** T15: assemble the canonical rich JSON report (R11, R16, R17). Pure. */
export function buildReport(input: ReportInput): RunReport {
  return {
    runId: input.runId,
    url: input.url,
    generatedAt: new Date().toISOString(),
    flows: input.flows ?? [],
    results: input.results,
    coverage: input.coverage,
    flakeRate: input.flakeRate,
    healSuccessRate: input.healSuccessRate,
    claudeCallCount: input.claudeCallCount,
    successRate: computeSuccessRate(input.results),
    fixPrompts: input.fixPrompts,
    issues: input.issues,
    recommendations: input.recommendations,
    better: input.better ?? "",
    recommendationsText: input.recommendationsText ?? "",
    summary: input.summary ?? [],
    testSummary: input.testSummary ?? "",
    planMarkdown: input.planMarkdown,
    generatedSpecs: input.generatedSpecs,
    screenshots: input.screenshots ?? [],
  };
}

export function reportToJson(report: RunReport): string {
  return JSON.stringify(report, null, 2);
}

/** Convenience outcome counts used by the renderers and UI. */
export function summarize(report: RunReport): {
  total: number;
  passed: number;
  failed: number;
  flaky: number;
  healed: number;
  fixme: number;
} {
  const by = (o: TestResult["outcome"]) =>
    report.results.filter((r) => r.outcome === o).length;
  return {
    total: report.results.length,
    passed: by("passed"),
    failed: by("failed"),
    flaky: by("flaky"),
    healed: by("healed"),
    fixme: by("fixme"),
  };
}
