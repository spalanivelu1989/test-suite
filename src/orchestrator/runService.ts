import { createClaudeClient } from "../claude/client";
import type { NamedFlow } from "../coverage/coverage";
import { createPlaywrightFetcher } from "../crawler/playwrightFetcher";
import { runTests } from "../runner/runner";
import { getRunStore } from "../runStore/store";
import type { RunConfig, RunReport } from "../types";
import { runPipeline } from "./orchestrate";
import tarentoData from "../../fixtures/tarento-flows.json" with { type: "json" };

const tarentoFlows: NamedFlow[] = (tarentoData.flows as NamedFlow[]).map(
  (f) => ({
    id: f.id,
    name: f.name,
  }),
);

/**
 * Pick the curated-flow baseline (M1 denominator). For the reference app
 * (tarento.com) use the fixture; for any other site there is no curated baseline,
 * so coverage is measured against the flows the agent itself discovered.
 */
export function loadCuratedFlows(url: string): NamedFlow[] {
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
): Promise<RunReport> {
  const claude = createClaudeClient();
  return runPipeline(runId, config, {
    claude,
    openFetcher: () => createPlaywrightFetcher(),
    runTests,
    curatedFlows: loadCuratedFlows(config.url),
    emit,
  });
}

/**
 * Start a run in the background and return its id immediately (R8). Progress and
 * completion are written to the shared in-memory store; the API streams them.
 */
export function startRun(config: RunConfig): string {
  const store = getRunStore();
  const run = store.create(config);
  void (async () => {
    try {
      const report = await runToReport(run.id, config, (e) =>
        store.addEvent(run.id, e),
      );
      store.complete(run.id, report);
    } catch (err) {
      store.fail(run.id, err instanceof Error ? err.message : String(err));
    }
  })();
  return run.id;
}
