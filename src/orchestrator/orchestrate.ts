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
import type {
  Flow,
  ProgressEvent,
  RunConfig,
  RunReport,
  TestResult,
} from "../types";
import {
  designTests,
  evolveTests,
  discoverTests,
  regenerateMissingScenarios,
  validateTests,
  type StageDeps,
} from "./stages";
import { createKnowledgeService, type KnowledgeService } from "../knowledge";
import { createBusinessContextService } from "../knowledge/business/service";
import { loadAuthFromEnv } from "../auth/credentials";
import { captureHealDeltas } from "../knowledge/heal/captureHeal";
import { normalizeFailure } from "../knowledge/heal/signature";
import type { HealingPrecedent } from "../knowledge/types";
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
  /** Knowledge Layer (R1). Defaults to env-configured; disabled when no DB. */
  knowledge?: KnowledgeService;
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
 * Phase 3: gather prior successful heals for this run's failures, deduped by
 * failure signature (R7). Best-effort — the KnowledgeService never throws, so a
 * cold/disabled KB just yields no precedents and the Evolver runs as before.
 */
async function collectHealingPrecedents(
  knowledge: KnowledgeService,
  url: string,
  results: TestResult[],
): Promise<HealingPrecedent[]> {
  const appId = knowledge.appIdFor(url);
  const failed = results.filter(
    (r) => r.outcome === "failed" || !!r.failureReason,
  );
  const seen = new Set<string>();
  const out: HealingPrecedent[] = [];
  for (const r of failed) {
    const signature = normalizeFailure(r.failureReason);
    if (!signature || seen.has(signature)) continue;
    seen.add(signature);
    const matches = await knowledge.getHealingPrecedents({
      signature,
      appId,
      flowId: r.flowId,
    });
    out.push(...matches);
  }
  return out;
}

/**
 * T17: run the four-agent pipeline (Discoverer → Designer → Evolver → Reporter) for
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

  // Optional form-login: when TARGET_USERNAME/PASSWORD are set, the agents log in
  // before exploring and the suite runs authenticated via a saved storage state.
  // Unset → null → pipeline runs exactly as before (graceful degradation).
  const auth = loadAuthFromEnv();
  const ws = await (
    deps.makeWorkspace ??
    ((id: string) => createWorkspace(id, undefined, { authEnabled: !!auth }))
  )(runId);
  if (auth)
    emit(
      "planning",
      "🔐 Login enabled — the agent will authenticate before exploring the app",
    );
  if (config.focus)
    emit(
      "planning",
      `🎯 Focus set — the run is scoped to: ${config.focus.length > 120 ? config.focus.slice(0, 120) + "…" : config.focus}`,
    );
  // Knowledge Layer: env-configured by default, disabled (cold) when no DB.
  // Its events are bridged onto the run's progress stream (no silent magic).
  const knowledge =
    deps.knowledge ??
    createKnowledgeService({
      onEvent: (e) => {
        if (e.kind === "ingested")
          emit("done", `Knowledge: ingested run (${e.flows} flow(s))`);
      },
    });
  // Authored OKF business context (read from `business-context/`); cold when the dir
  // is absent. Primes the Discoverer/Designer prompts with domain knowledge.
  const businessContext =
    deps.stageDeps?.businessContext ?? createBusinessContextService();
  const stageDeps: StageDeps = {
    ...deps.stageDeps,
    abortController: deps.abortController,
    knowledge: deps.stageDeps?.knowledge ?? knowledge,
    businessContext,
  };
  let agentRuns = 0;

  // 1. Discoverer → Markdown plan
  checkCancelled();
  emit("planning", "Discoverer: exploring the app and writing a test plan");
  const plan = await discoverTests(
    ws,
    config.url,
    onAgent("planning", "discoverer"),
    stageDeps,
    {
      crawlMode: config.crawlMode,
      maxPages: config.maxPages,
      auth: auth ?? undefined,
      focus: config.focus,
      testsPerPage: config.testsPerPage,
    },
  );
  agentRuns++;
  checkCancelled();
  if (plan.isError)
    throw new StageError("Discoverer failed to produce a test plan");

  // 2. Designer → Playwright specs
  emit("generating", "Designer: writing Playwright tests from the plan");
  const gen = await designTests(
    ws,
    onAgent("generating", "designer"),
    stageDeps,
    {
      crawlMode: config.crawlMode,
      maxPages: config.maxPages,
      url: config.url,
      auth: auth ?? undefined,
      focus: config.focus,
      testsPerPage: config.testsPerPage,
    },
  );
  if (gen.trimmedCount > 0) {
    emit(
      "generating",
      `Plan trimmed: ${gen.trimmedCount} scenario(s) removed to stay within budget`,
    );
  }
  agentRuns++;
  checkCancelled();
  if (gen.isError) throw new StageError("Designer produced no tests");

  // 2b. Validation: statically inspect the generated specs (correctness,
  // meaningful assertions, robustness, relevance) before we run/heal them.
  emit(
    "validating",
    "Validator: checking generated specs for correctness and relevance",
  );
  let validation = await validateTests(ws);
  emit(
    "validating",
    `Validation score ${validation.score}/100 — ${validation.errorCount} error(s), ${validation.warningCount} warning(s)` +
      (validation.missingFlows.length
        ? `, ${validation.missingFlows.length} plan flow(s) without a test`
        : ""),
    {
      score: validation.score,
      errors: validation.errorCount,
      warnings: validation.warningCount,
      missingFlows: validation.missingFlows.length,
    },
  );
  checkCancelled();

  // 2c. Completeness gate: if the Designer ran out of turns and left planned
  // scenarios unwritten, re-run it for ONLY those before we test/heal. A single
  // targeted pass — the goal is to stop "8 planned → 2 generated" from shipping
  // silently, not to loop indefinitely.
  if (validation.missingFlows.length > 0) {
    emit(
      "generating",
      `↻ ${validation.missingFlows.length} planned scenario(s) have no spec — regenerating just those`,
    );
    await regenerateMissingScenarios(
      ws,
      validation.missingFlows,
      onAgent("generating", "designer"),
      stageDeps,
      {
        crawlMode: config.crawlMode,
        maxPages: config.maxPages,
        url: config.url,
        auth: auth ?? undefined,
        focus: config.focus,
      },
    );
    agentRuns++;
    checkCancelled();

    // Re-validate so the report and Evolver see the post-retry coverage.
    validation = await validateTests(ws);
    emit(
      "validating",
      `Re-validation after completeness retry: score ${validation.score}/100` +
        (validation.missingFlows.length
          ? ` — ${validation.missingFlows.length} flow(s) still without a test`
          : " — all planned scenarios now have a spec"),
      {
        score: validation.score,
        missingFlows: validation.missingFlows.length,
      },
    );
    checkCancelled();
  }

  // 3. Initial run (pre-heal), then Evolver, then re-run for flake + heal reconciliation
  emit("running", "Running generated tests");
  const initial = await captureResults(ws);
  checkCancelled();

  // Snapshot specs BEFORE healing so we can diff what the Evolver changed (ADR-0004).
  const preHealSpecs = await readGeneratedSpecs(ws);

  // Feed validation findings to the Evolver so it fixes flagged anti-patterns too.
  // Healing precedents (prior fixes for similar failures) are injected best-effort.
  emit("healing", "Evolver: repairing failures and quarantining the unfixable");
  const precedents = await collectHealingPrecedents(
    knowledge,
    config.url,
    initial,
  );
  // Trusted distilled principles (global heal lessons + this app's) for the Evolver.
  const healPlaybooks = await knowledge.getPlaybooks({
    kind: "global",
    key: "all",
  });
  // Surface what past learning was actually applied (no silent magic) so a run's
  // memory use is visible in the event stream, not only in the DB.
  if (precedents.length)
    emit(
      "healing",
      `🩹 Applying ${precedents.length} known fix(es) from past runs`,
    );
  if (healPlaybooks.length)
    emit("healing", `🧠 ${healPlaybooks.length} learned principle(s) applied`);
  await evolveTests(
    ws,
    onAgent("healing", "evolver"),
    stageDeps,
    validation,
    precedents,
    healPlaybooks,
    auth ?? undefined,
  );
  agentRuns++;
  checkCancelled();

  emit("flake-check", "Re-running to check reliability");
  const flake = await assessSuiteFlakiness(ws, deps.reruns ?? 3);
  checkCancelled();
  const { results, healSuccessRate } = reconcileHealing(initial, flake.results);

  // 4. Reporter
  emit("reporting", "Reporter: aggregating results and recommendations");
  const specs = await readGeneratedSpecs(ws);

  // Reconstruct what the Evolver fixed by diffing pre/post-heal specs (ADR-0004).
  // `initial` carries the pre-heal failures + reasons (the signature source);
  // `results` carries the post-heal outcome (healed/fixme).
  const healingEvents = captureHealDeltas(
    preHealSpecs,
    specs,
    initial,
    results,
    {
      runId,
      appId: knowledge.appIdFor(config.url),
    },
  );

  const planMarkdown = await readPlan(ws);
  const coverage = coverageFromResults(deps.curatedFlows, results);
  const narrative = await generateNarrative(
    results,
    specs,
    deps.claude,
    config.url,
    { onEvent: (message) => emit("reporting", message) },
  );

  let screenshots: { filename: string; base64: string }[] = [];
  try {
    const screenshotsDir = join(ws.root, "screenshots");
    const files = await readdir(screenshotsDir);
    const pngs = files.filter((f) => f.endsWith(".png")).sort();
    for (const f of pngs) {
      const data = await readFile(join(screenshotsDir, f));
      screenshots.push({
        filename: f,
        base64: data.toString("base64"),
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
    validation,
    crawlMode: config.crawlMode,
  });
  // Phase 3: attach captured heals so ingestRun persists them (ADR-0004).
  report.healingEvents = healingEvents;

  // T9/R11: new execution data becomes knowledge. Best-effort — ingestRun never
  // throws, so a KB hiccup cannot fail a completed run.
  await knowledge.ingestRun(report);

  emit("done", "Run complete", {
    successRate: Math.round(report.successRate.rate * 100),
    coverage: coverage.percent,
  });
  return report;
}
