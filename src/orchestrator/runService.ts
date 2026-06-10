import { propagateAttributes, startActiveObservation } from "@langfuse/tracing";
import { createClaudeClient } from "../claude/client";
import type { Flow, RunConfig, RunReport } from "../types";
import { runPipeline } from "./orchestrate";
import tarentoData from "../../fixtures/tarento-flows.json" with { type: "json" };

// Wires the orchestrator to its real implementations (Claude client, curated
// flows, Playwright/Agent-SDK runtime) and runs it to a report. This is the
// "pipeline runner" the Run Manager injects; the run *lifecycle* (start/cancel,
// persistence, abort registry) now lives in runManager/manager.ts.

const tarentoFlows: Flow[] = (tarentoData.flows as Flow[]).map((f) => ({
  id: f.id,
  name: f.name,
  steps: f.steps ?? [],
}));

/**
 * Pick the curated-flow baseline (M1 denominator). For the reference app
 * (tarento.com) use the fixture; for any other site there is no curated baseline,
 * so coverage is measured against the flows the agent itself discovered.
 */
export function loadCuratedFlows(url: string): Flow[] {
  try {
    if (/(^|\.)tarento\.com$/i.test(new URL(url).hostname)) return tarentoFlows;
  } catch {
    /* fall through */
  }
  return [];
}

/** Wire the orchestrator to real implementations and run it to a report. */
export async function runToReport(
  runId: string,
  config: RunConfig,
  emit?: Parameters<typeof runPipeline>[2]["emit"],
  abortController?: AbortController,
): Promise<RunReport> {
  const claude = createClaudeClient();
  const crawlMode = config.crawlMode ?? "standard";

  // Root Langfuse trace for the whole run. `sessionId` = runId groups every
  // observation (planner/generator/healer agents + the Reporter narrative) under
  // one trace in the Sessions view. When tracing is disabled (no LANGFUSE_* keys)
  // these helpers are non-recording no-ops and the pipeline runs unchanged.
  return propagateAttributes(
    {
      traceName: "test-suite-run",
      sessionId: runId,
      tags: [crawlMode],
      // Metadata values must be strings; numbers are stringified.
      metadata: {
        url: config.url,
        crawlMode,
        maxPages: String(config.maxPages ?? ""),
      },
    },
    () =>
      startActiveObservation("test-suite-run", async (root) => {
        root.update({
          input: {
            url: config.url,
            crawlMode,
            maxPages: config.maxPages,
          },
        });
        try {
          // stageDeps default to the real Agent SDK runtime; the workspace runs the suite.
          const report = await runPipeline(runId, config, {
            claude,
            curatedFlows: loadCuratedFlows(config.url),
            emit,
            abortController,
          });
          root.update({
            output: {
              successRate: report.successRate.rate,
              passed: report.successRate.passed,
              total: report.successRate.total,
              coveragePercent: report.coverage.percent,
              flakeRate: report.flakeRate,
              healSuccessRate: report.healSuccessRate,
              claudeCallCount: report.claudeCallCount,
            },
          });
          return report;
        } catch (err) {
          root.update({
            level: "ERROR",
            statusMessage: err instanceof Error ? err.message : String(err),
          });
          throw err;
        }
      }),
  );
}
