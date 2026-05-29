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
  // stageDeps default to the real Agent SDK runtime; the workspace runs the suite.
  return runPipeline(runId, config, {
    claude,
    curatedFlows: loadCuratedFlows(config.url),
    emit,
    abortController,
  });
}
