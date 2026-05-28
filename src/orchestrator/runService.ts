import { createClaudeClient } from "../claude/client";
import { getRunStore } from "../runStore/store";
import type { Flow, RunConfig, RunReport } from "../types";
import { persistRun } from "../agents/workspace";
import { runPipeline } from "./orchestrate";
import tarentoData from "../../fixtures/tarento-flows.json" with { type: "json" };

const tarentoFlows: Flow[] = (tarentoData.flows as Flow[]).map(
  (f) => ({
    id: f.id,
    name: f.name,
    steps: f.steps ?? [],
  }),
);

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
  // stageDeps + suiteExec default to the real Agent SDK runtime + Playwright CLI.
  return runPipeline(runId, config, {
    claude,
    curatedFlows: loadCuratedFlows(config.url),
    emit,
    abortController,
  });
}

/**
 * Process-wide registry of in-flight runs' abort controllers. Kept off the Run
 * object (controllers aren't serializable) and on globalThis for the same reason
 * the run store is: Next.js can duplicate module instances across routes/HMR.
 */
const globalForAborts = globalThis as unknown as {
  __runAborts?: Map<string, AbortController>;
};
function abortRegistry(): Map<string, AbortController> {
  if (!globalForAborts.__runAborts) globalForAborts.__runAborts = new Map();
  return globalForAborts.__runAborts;
}

/**
 * Stop an in-flight run (R8): abort its agent subprocess and mark it cancelled.
 * Returns false if the run is unknown or already in a terminal state.
 */
export function cancelRun(runId: string): boolean {
  const store = getRunStore();
  const run = store.get(runId);
  if (!run) return false;
  if (
    run.status === "completed" ||
    run.status === "failed" ||
    run.status === "cancelled"
  ) {
    return false;
  }
  abortRegistry().get(runId)?.abort();
  const cancelled = store.cancel(runId, "Run stopped by user");
  void persistRun(cancelled);
  return true;
}

/**
 * Start a run in the background and return its id immediately (R8). Progress and
 * completion are written to the shared in-memory store; the API streams them.
 */
export function startRun(config: RunConfig): string {
  const store = getRunStore();
  const run = store.create(config);
  void persistRun(run);
  const controller = new AbortController();
  abortRegistry().set(run.id, controller);
  void (async () => {
    try {
      const report = await runToReport(
        run.id,
        config,
        (e) => {
          const updated = store.addEvent(run.id, e);
          void persistRun(updated);
        },
        controller,
      );
      if (controller.signal.aborted) return; // cancelRun already marked it
      const completed = store.complete(run.id, report);
      void persistRun(completed);
    } catch (err) {
      const terminal = controller.signal.aborted
        ? store.cancel(run.id, "Run stopped by user")
        : store.fail(run.id, err instanceof Error ? err.message : String(err));
      void persistRun(terminal);
    } finally {
      abortRegistry().delete(run.id);
    }
  })();
  return run.id;
}
