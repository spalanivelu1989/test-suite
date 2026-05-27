import type { ClaudeClient } from "../claude/client";
import type { NamedFlow } from "../coverage/coverage";
import { computeCoverage } from "../coverage/coverage";
import type { PageFetcher } from "../crawler/crawl";
import { crawl } from "../crawler/crawl";
import { assessFlakiness } from "../flake/flake";
import { identifyFlows } from "../flows/identify";
import { generateValidTest } from "../generator/validate";
import { healFailures } from "../healer/heal";
import { buildReport } from "../reporter/report";
import type {
  GeneratedTest,
  ProgressEvent,
  RunConfig,
  RunReport,
  TestResult,
} from "../types";

export interface OrchestratorDeps {
  claude: ClaudeClient;
  /** Opens a page fetcher (Playwright in prod). Closed after crawl if closable. */
  openFetcher: () => Promise<PageFetcher & { close?: () => Promise<void> }>;
  /** Executes generated tests (the runner). Injected for testability. */
  runTests: (tests: GeneratedTest[]) => Promise<TestResult[]>;
  curatedFlows: NamedFlow[];
  /** T15b: receives an ordered progress event per stage. */
  emit?: (event: Omit<ProgressEvent, "at">) => void;
  /** Re-runs for flake assessment (M2 uses 3). */
  reruns?: number;
}

/** T15a + T15b: run the full pipeline for one URL, emitting progress per stage. */
export async function runPipeline(
  runId: string,
  config: RunConfig,
  deps: OrchestratorDeps,
): Promise<RunReport> {
  const emit = (
    stage: ProgressEvent["stage"],
    message: string,
    data?: Record<string, unknown>,
  ) => deps.emit?.({ stage, message, data });

  emit("crawling", `Crawling ${config.url}`);
  const fetcher = await deps.openFetcher();
  let crawlResult;
  try {
    crawlResult = await crawl(config, fetcher);
  } finally {
    await fetcher.close?.();
  }
  emit("crawling", `Discovered ${crawlResult.pages.length} pages`, {
    pages: crawlResult.pages.length,
  });

  emit("identifying", "Identifying user flows");
  const flows = await identifyFlows(crawlResult, deps.claude);
  emit("identifying", `Identified ${flows.length} flows`, {
    flows: flows.length,
  });

  emit("generating", "Generating Playwright tests");
  const tests = await Promise.all(
    flows.map((f) => generateValidTest(f, crawlResult, deps.claude)),
  );

  emit("running", "Running tests");
  emit("flake-check", "Checking for flaky tests");
  const flake = await assessFlakiness(tests, deps.runTests, deps.reruns ?? 3);

  emit("healing", "Healing locator failures");
  const heal = await healFailures(
    tests,
    flake.results,
    deps.claude,
    deps.runTests,
  );

  emit("reporting", "Building report");
  const coverage = computeCoverage(deps.curatedFlows, flows);
  const report = buildReport({
    runId,
    url: config.url,
    flows,
    results: heal.results,
    coverage,
    flakeRate: flake.flakeRate,
    healSuccessRate: heal.healSuccessRate,
    claudeCallCount: deps.claude.calls.length,
    fixPrompts: [],
    issues: [],
    recommendations: [],
    planMarkdown: null,
    generatedSpecs: [],
  });
  emit("done", "Run complete", { coverage: coverage.percent });
  return report;
}
