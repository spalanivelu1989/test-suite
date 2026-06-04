import type { ClaudeClient } from "../claude/client";
import type { NamedFlow } from "../coverage/coverage";
import { coverageFromResults } from "../coverage/coverage";
import {
  readGeneratedSpecs,
  readPlan,
  type Workspace,
} from "../agents/workspace";
import { createWorkspace } from "../agents/workspace";
import {
  assessSuiteFlakiness,
  captureResults,
  reconcileHealing,
} from "../results/parse";
import { buildReport } from "../reporter/report";
import { generateNarrative } from "../reporter/narrative";
import type { Flow, ProgressEvent, RunConfig, RunReport } from "../types";
import { generateTests, healTests, planTests, type StageDeps } from "./stages";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

export interface OrchestratorDeps {
  /** Powers the Reporter narrative (the agents are driven by the Agent SDK). */
  claude: ClaudeClient;
  curatedFlows: Flow[];
  emit?: (event: Omit<ProgressEvent, "at">) => void;
  /** Injected stage runner/agent loader (tests stub these). */
  stageDeps?: StageDeps;
  reruns?: number;
  /** Override workspace creation in tests. */
  makeWorkspace?: (runId: string) => Promise<Workspace>;
  /** Stops the pipeline (and the agent subprocesses) when the user cancels. */
  abortController?: AbortController;
}

class StageError extends Error {}

/** Thrown when a run is stopped by the user mid-pipeline. */
export class CancelledError extends Error {
  constructor(message = "Run stopped by user") {
    super(message);
    this.name = "CancelledError";
  }
}

/**
 * T17: run the four-agent pipeline (Planner → Generator → Healer → Reporter) for
 * one URL, emitting per-stage progress, and produce the rich RunReport (R12).
 */
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
  const onAgent =
    (stage: ProgressEvent["stage"], label: string) =>
    (e: { kind: string; tool?: string; text?: string }) => {
      if (e.kind === "tool" && e.tool) {
        emit(stage, `[${label}] tool: ${e.tool}`);
      } else if (e.kind === "text" && e.text) {
        // Truncate long text to keep the log readable (first 200 chars).
        const snippet =
          e.text.length > 200 ? e.text.slice(0, 200) + "…" : e.text;
        emit(stage, `[${label}] ${snippet}`);
      }
    };

  // Abort early at every checkpoint so a stopped run doesn't start more work.
  const checkCancelled = () => {
    if (deps.abortController?.signal.aborted) throw new CancelledError();
  };

  const ws = await (deps.makeWorkspace ?? createWorkspace)(runId);
  const stageDeps: StageDeps = {
    ...deps.stageDeps,
    abortController: deps.abortController,
  };
  let agentRuns = 0;

  // 1. Planner → Markdown plan
  checkCancelled();
  emit("planning", "Planner: exploring the app and writing a test plan");
  const plan = await planTests(
    ws,
    config.url,
    onAgent("planning", "planner"),
    stageDeps,
    { crawlMode: config.crawlMode, maxPages: config.maxPages },
  );
  agentRuns++;
  checkCancelled();
  if (plan.isError)
    throw new StageError("Planner failed to produce a test plan");

  // 2. Generator → Playwright specs
  emit("generating", "Generator: writing Playwright tests from the plan");
  const gen = await generateTests(
    ws,
    onAgent("generating", "generator"),
    stageDeps,
    { crawlMode: config.crawlMode, maxPages: config.maxPages },
  );
  if (gen.trimmedCount > 0) {
    emit(
      "generating",
      `Plan trimmed: ${gen.trimmedCount} scenario(s) removed to stay within budget`,
    );
  }
  agentRuns++;
  checkCancelled();
  if (gen.isError) throw new StageError("Generator produced no tests");

  // 3. Initial run (pre-heal), then Healer, then re-run for flake + heal reconciliation
  emit("running", "Running generated tests");
  const initial = await captureResults(ws);
  checkCancelled();

  emit("healing", "Healer: repairing failures and quarantining the unfixable");
  await healTests(ws, onAgent("healing", "healer"), stageDeps);
  agentRuns++;
  checkCancelled();

  emit("flake-check", "Re-running to check reliability");
  const flake = await assessSuiteFlakiness(ws, deps.reruns ?? 3);
  checkCancelled();
  const { results, healSuccessRate } = reconcileHealing(initial, flake.results);

  // 4. Reporter
  emit("reporting", "Reporter: aggregating results and recommendations");
  const specs = await readGeneratedSpecs(ws);
  const planMarkdown = await readPlan(ws);
  const coverage = coverageFromResults(deps.curatedFlows, results);
  const narrative = await generateNarrative(results, specs, deps.claude, config.url);

  let screenshots: { filename: string; base64: string }[] = [];
  try {
    const screenshotsDir = join(ws.root, "screenshots");
    const files = await readdir(screenshotsDir);
    const pngs = files.filter(f => f.endsWith(".png")).sort();
    for (const f of pngs) {
      const data = await readFile(join(screenshotsDir, f));
      screenshots.push({
        filename: f,
        base64: data.toString("base64")
      });
    }
  } catch (err) {
    // screenshots folder may not exist or be empty
  }

  const report = buildReport({
    runId,
    url: config.url,
    results,
    coverage,
    flakeRate: flake.flakeRate,
    healSuccessRate,
    // Agent stages run via the Agent SDK (not the narrative client); count both.
    claudeCallCount: agentRuns + deps.claude.calls.length,
    fixPrompts: narrative.fixPrompts,
    issues: narrative.issues,
    recommendations: narrative.recommendations,
    better: narrative.better,
    recommendationsText: narrative.recommendationsText,
    summary: narrative.summary,
    testSummary: narrative.testSummary,
    planMarkdown,
    generatedSpecs: specs,
    flows: deps.curatedFlows,
    screenshots,
  });
  emit("done", "Run complete", {
    successRate: Math.round(report.successRate.rate * 100),
    coverage: coverage.percent,
  });
  return report;
}
