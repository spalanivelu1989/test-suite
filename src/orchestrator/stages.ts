import { type AgentEvent, loadAgent, runAgent } from "../agents/runtime";
import {
  readGeneratedSpecs,
  readPlan,
  type Workspace,
} from "../agents/workspace";
import { createCrawlGate } from "../agents/crawlGate";
import { createCliGuard, mergeHooks } from "../agents/cliGuard";
import {
  type CrawlMode,
  CRAWL_MODE_DEPTH,
  CRAWL_MODE_SCENARIOS_PER_PAGE,
  effectivePageBudget,
  type ValidationReport,
} from "../types";
import {
  formatValidationForHealer,
  validateSuite,
} from "../validator/validate";

// The four pipeline stages (T6–T8 + results). Each stage runs one agent in the
// run workspace via the runtime; deps are injectable so the orchestration is
// unit-testable without a live browser/Claude.

export interface StageDeps {
  runner?: typeof runAgent;
  loadAgentFn?: typeof loadAgent;
  /** Forwarded to the agent runtime so a stopped run kills the agent subprocess. */
  abortController?: AbortController;
}

export interface PlanResult {
  planMarkdown: string | null;
  toolCalls: string[];
  isError: boolean;
}

export interface PlanOptions {
  /** Crawl strategy (replaces the old maxDepth number). Default: "standard". */
  crawlMode?: CrawlMode;
  /** Maximum number of unique pages to visit. Default: 10. */
  maxPages?: number;
}

/**
 * Build the mode-specific crawl-scope instruction block injected into the
 * planner prompt.  Each mode gets an unambiguous, concrete directive so the LLM
 * cannot "interpret" it loosely.
 */
function buildPlannerConstraints(
  crawlMode: CrawlMode,
  maxPages: number,
  url: string,
): string[] {
  const depth = CRAWL_MODE_DEPTH[crawlMode];
  const scenariosPerPage = CRAWL_MODE_SCENARIOS_PER_PAGE[crawlMode];
  const pageBudget = effectivePageBudget(crawlMode, maxPages);
  const maxScenarios = pageBudget * scenariosPerPage;

  const lines: string[] = [
    "IMPORTANT — hard crawl-scope constraints (you MUST respect these exactly):",
  ];

  switch (crawlMode) {
    case "direct":
      lines.push(
        `MODE: Direct page only. Test ONLY the entry URL (${url}).`,
        "Do NOT navigate to, click into, or test any other page or URL.",
        "Your entire plan must describe tests that run solely on the entry page.",
      );
      break;
    case "standard":
      lines.push(
        `MODE: Standard depth. Explore only the direct links found on the entry page ${url} (depth = 1).`,
        "Do NOT follow links that appear on sub-pages (depth ≥ 2).",
        `Stop after visiting at most ${maxPages} unique pages.`,
      );
      break;
    case "deep":
      lines.push(
        `MODE: Deep crawl (depth ≤ ${depth}). You may follow links up to ${depth} hops away from ${url}.`,
        `Stop after visiting at most ${maxPages} unique pages.`,
      );
      break;
    case "aggressive":
      lines.push(
        `MODE: Aggressive crawl. Explore as broadly as possible, up to ${depth} hops from ${url}.`,
        `Stop after visiting at most ${maxPages} unique pages.`,
      );
      break;
  }

  lines.push(
    `SCENARIO CAP: Your plan MUST contain at most ${maxScenarios} test scenarios in total (${pageBudget} page(s) × ${scenariosPerPage} scenarios/page).`,
    "Do not exceed this cap under any circumstances — trim lower-priority scenarios if needed.",
  );

  return lines;
}

/** T6: run the Planner → it explores the live app and saves a Markdown plan. */
export async function planTests(
  ws: Workspace,
  url: string,
  onEvent?: (e: AgentEvent) => void,
  deps: StageDeps = {},
  options: PlanOptions = {},
): Promise<PlanResult> {
  const load = deps.loadAgentFn ?? loadAgent;
  const run = deps.runner ?? runAgent;
  const agent = await load("playwright-test-planner");

  const crawlMode: CrawlMode = options.crawlMode ?? "standard";
  const maxPages = options.maxPages ?? 10;

  const constraintLines = buildPlannerConstraints(crawlMode, maxPages, url);

  // Code-enforced crawl scope: the gate hard-denies out-of-scope navigation at
  // the tool boundary, so the depth/page limits hold even if the agent ignores
  // the prompt constraints above.
  const gate = createCrawlGate({
    mode: crawlMode,
    maxPages,
    entryUrl: url,
    workspaceRoot: ws.root,
    stageName: "1-planner",
    onDeny: (reason) =>
      onEvent?.({ kind: "text", text: `🛑 Crawl limit enforced: ${reason}` }),
  });

  // CLI-only enforcement: hard-deny any MCP browser tool so the agent must drive
  // the browser through `npx playwright-cli` (see cliGuard / LEARNINGS 2026-06-01).
  const guard = createCliGuard({
    onDeny: (reason) =>
      onEvent?.({ kind: "text", text: `🛑 Tool blocked: ${reason}` }),
  });

  const prompt = [
    `Create a comprehensive Playwright test plan for the web application at ${url}.`,
    "Open the browser with playwright-cli first, then explore the app and identify the primary",
    "user flows (navigation, key content pages, forms, search). Save the finished plan",
    `with the Write tool to exactly this absolute path: ${ws.specsDir}/plan.md`,
    "— write it there and nowhere else (do NOT write to the repository's own specs/ directory or any other path).",
    ...constraintLines,
  ].join(" ");

  const res = await run({
    agent,
    prompt,
    cwd: ws.root,
    onEvent,
    abortController: deps.abortController,
    hooks: mergeHooks(guard.hooks, gate.hooks),
  });
  const planMarkdown = await readPlan(ws);
  return {
    planMarkdown,
    toolCalls: res.toolCalls,
    // A saved plan = success even if the agent hit its turn cap; only a missing
    // plan is fatal (graceful degradation — found via a live maxTurns cutoff).
    isError: !planMarkdown,
  };
}

export interface GenerateResult {
  specs: { file: string; code: string }[];
  toolCalls: string[];
  isError: boolean;
  /** How many scenarios were in the (possibly trimmed) plan. */
  scenarioCount: number;
  /** How many scenarios were trimmed away (0 if within budget). */
  trimmedCount: number;
}

export interface GenerateOptions {
  /** Crawl mode — used to compute the scenario ceiling. Default: "standard". */
  crawlMode?: CrawlMode;
  /** Maximum pages — used to compute the scenario ceiling. Default: 10. */
  maxPages?: number;
}

/**
 * Trim a plan's Markdown to at most `maxScenarios` scenario sections (#### headings).
 * Returns the trimmed markdown and counts.
 */
export function trimPlan(
  planMarkdown: string,
  maxScenarios: number,
): { trimmed: string; total: number; removed: number } {
  // Split at every #### boundary, keeping the delimiter via a look-ahead.
  const parts = planMarkdown.split(/(?=^#### )/m);
  const header = parts[0]; // everything before the first ####
  const scenarios = parts.slice(1);
  const total = scenarios.length;

  if (total <= maxScenarios) {
    return { trimmed: planMarkdown, total, removed: 0 };
  }

  const kept = scenarios.slice(0, maxScenarios);
  const trimmed =
    header +
    kept.join("") +
    `\n\n> ⚠️  Plan was trimmed: ${total - maxScenarios} scenario(s) removed to stay within the ${maxScenarios}-scenario budget.\n`;
  return { trimmed, total, removed: total - maxScenarios };
}

/** T7: run the Generator → turn each plan scenario into a Playwright spec file. */
export async function generateTests(
  ws: Workspace,
  onEvent?: (e: AgentEvent) => void,
  deps: StageDeps = {},
  options: GenerateOptions = {},
): Promise<GenerateResult> {
  const load = deps.loadAgentFn ?? loadAgent;
  const run = deps.runner ?? runAgent;
  const agent = await load("playwright-test-generator");

  const crawlMode: CrawlMode = options.crawlMode ?? "standard";
  const maxPages = options.maxPages ?? 10;
  const scenariosPerPage = CRAWL_MODE_SCENARIOS_PER_PAGE[crawlMode];
  const pageBudget = effectivePageBudget(crawlMode, maxPages);
  const maxScenarios = pageBudget * scenariosPerPage;

  // Read and (if necessary) trim the plan before the generator sees it.
  const rawPlan = await readPlan(ws);
  let scenarioCount = 0;
  let trimmedCount = 0;

  if (rawPlan) {
    const { trimmed, total, removed } = trimPlan(rawPlan, maxScenarios);
    scenarioCount = Math.min(total, maxScenarios);
    trimmedCount = removed;

    if (removed > 0) {
      onEvent?.({
        kind: "text",
        text: `⚠️  Plan trimmed: ${removed} scenario(s) removed (budget: ${maxScenarios} max for ${crawlMode} mode with ${pageBudget} page(s)).`,
      });
      // Write the trimmed plan back so the generator reads it from the workspace.
      await ws.writePlan(trimmed);
    }
  }

  // Scale maxTurns proportionally: ~10 turns/scenario, minimum 80.
  const maxTurns = Math.max(80, scenarioCount * 10);

  const prompt = [
    `Read the Markdown test plan at ${ws.specsDir}/plan.md.`,
    "Write each test scenario (#### N.M <Scenario Title>) into its own separate spec file.",
    "Do NOT group multiple scenarios into a single file.",
    "For each scenario, open the page using playwright-cli and execute its steps using the CLI commands via Bash.",
    "After a scenario has been explored, use the Write tool to save it to an absolute path under",
    `${ws.testsDir}/ named <fs-friendly-scenario-title>.spec.ts`,
    `(e.g. 'Add Valid Todo' → ${ws.testsDir}/add-valid-todo.spec.ts).`,
    "Write spec files there and nowhere else (do NOT write to the repository's own tests/ directory).",
    `Use the seed at ${ws.seedPath} as the starting template.`,
  ].join(" ");

  const gate = createCrawlGate({
    mode: "aggressive",
    maxPages: 999,
    entryUrl: "",
    workspaceRoot: ws.root,
    stageName: "2-generator",
  });

  const guard = createCliGuard({
    onDeny: (reason) =>
      onEvent?.({ kind: "text", text: `🛑 Tool blocked: ${reason}` }),
  });

  const res = await run({
    agent,
    prompt,
    cwd: ws.root,
    onEvent,
    abortController: deps.abortController,
    maxTurns,
    hooks: mergeHooks(guard.hooks, gate.hooks),
  });
  const specs = await readGeneratedSpecs(ws);
  return {
    specs,
    toolCalls: res.toolCalls,
    // Any generated specs = proceed, even if the agent hit its turn cap; only
    // zero specs is fatal. We still test what was generated.
    isError: specs.length === 0,
    scenarioCount,
    trimmedCount,
  };
}

/**
 * Validation stage: statically inspect the generated specs (no browser, no LLM)
 * for structure/assertion/robustness/relevance issues, scored against the plan.
 * Pure read of workspace files — its findings are surfaced in the report and fed
 * to the Healer so flagged anti-patterns get fixed alongside runtime failures.
 */
export async function validateTests(ws: Workspace): Promise<ValidationReport> {
  const [specs, plan] = await Promise.all([
    readGeneratedSpecs(ws),
    readPlan(ws),
  ]);
  return validateSuite(specs, plan);
}

export interface HealResult {
  toolCalls: string[];
  isError: boolean;
}

/** T8: run the Healer → execute the suite, repair failures, quarantine the unfixable. */
export async function healTests(
  ws: Workspace,
  onEvent?: (e: AgentEvent) => void,
  deps: StageDeps = {},
  validation?: ValidationReport,
): Promise<HealResult> {
  const load = deps.loadAgentFn ?? loadAgent;
  const run = deps.runner ?? runAgent;
  const agent = await load("playwright-test-healer");

  const validationBlock = validation
    ? formatValidationForHealer(validation)
    : "";
  const prompt = [
    "Run the generated test suite by executing npx playwright test via Bash. For each failing test, debug it by",
    "running it specifically or inspecting the page using playwright-cli, fix the spec (resilient locators, corrected assertions)",
    "using Edit/Write tools, and re-run until it passes. If a test cannot be fixed and you are confident it is a genuine failure,",
    "mark it test.fixme() with a comment explaining what is happening. Do not ask questions.",
    ...(validationBlock ? ["\n\n" + validationBlock] : []),
  ].join(" ");

  const gate = createCrawlGate({
    mode: "aggressive",
    maxPages: 999,
    entryUrl: "",
    workspaceRoot: ws.root,
    stageName: "3-healer",
  });

  const guard = createCliGuard({
    onDeny: (reason) =>
      onEvent?.({ kind: "text", text: `🛑 Tool blocked: ${reason}` }),
  });

  const res = await run({
    agent,
    prompt,
    cwd: ws.root,
    onEvent,
    abortController: deps.abortController,
    hooks: mergeHooks(guard.hooks, gate.hooks),
  });
  return { toolCalls: res.toolCalls, isError: res.isError };
}
