import { type AgentEvent, loadAgent, runAgent } from "../agents/runtime";
import {
  readGeneratedSpecs,
  readPlan,
  type Workspace,
} from "../agents/workspace";
import {
  type CrawlMode,
  CRAWL_MODE_DEPTH,
  CRAWL_MODE_SCENARIOS_PER_PAGE,
} from "../types";

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
  const maxScenarios = maxPages * scenariosPerPage;

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
    `SCENARIO CAP: Your plan MUST contain at most ${maxScenarios} test scenarios in total (${maxPages} pages × ${scenariosPerPage} scenarios/page).`,
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

  const prompt = [
    `Create a comprehensive Playwright test plan for the web application at ${url}.`,
    "Open the browser with playwright-cli first, then explore the app and identify the primary",
    "user flows (navigation, key content pages, forms, search). Save the finished",
    "plan as a Markdown file directly under the specs/ directory (e.g. specs/plan.md) using the Write tool.",
    ...constraintLines,
  ].join(" ");

  const res = await run({
    agent,
    prompt,
    cwd: ws.root,
    onEvent,
    abortController: deps.abortController,
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
  const maxScenarios = maxPages * scenariosPerPage;

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
        text: `⚠️  Plan trimmed: ${removed} scenario(s) removed (budget: ${maxScenarios} max for ${crawlMode} mode with ${maxPages} pages).`,
      });
      // Write the trimmed plan back so the generator reads it from the workspace.
      await ws.writePlan(trimmed);
    }
  }

  // Scale maxTurns proportionally: ~10 turns/scenario, minimum 80.
  const maxTurns = Math.max(80, scenarioCount * 10);

  const prompt = [
    "Read the Markdown test plan saved under the specs/ directory.",
    "Group tests by narrative: produce ONE spec file per top-level plan section",
    "(### N. <Section Title>), with every scenario in that section as a separate test()",
    "inside a single test.describe('<Section Title>', ...) block.",
    "For each scenario, open the page using playwright-cli and execute its steps using the CLI commands via Bash.",
    "After all scenarios for a section have been explored, use the Write tool ONCE to save",
    "the combined file as tests/<fs-friendly-section-title>.spec.ts (e.g. 'Quick Links Section'",
    "→ tests/quick-links-section.spec.ts). Use seed.spec.ts as the seed.",
    "Do NOT emit one file per scenario.",
  ].join(" ");

  const res = await run({
    agent,
    prompt,
    cwd: ws.root,
    onEvent,
    abortController: deps.abortController,
    maxTurns,
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

export interface HealResult {
  toolCalls: string[];
  isError: boolean;
}

/** T8: run the Healer → execute the suite, repair failures, quarantine the unfixable. */
export async function healTests(
  ws: Workspace,
  onEvent?: (e: AgentEvent) => void,
  deps: StageDeps = {},
): Promise<HealResult> {
  const load = deps.loadAgentFn ?? loadAgent;
  const run = deps.runner ?? runAgent;
  const agent = await load("playwright-test-healer");

  const prompt = [
    "Run the generated test suite by executing npx playwright test via Bash. For each failing test, debug it by",
    "running it specifically or inspecting the page using playwright-cli, fix the spec (resilient locators, corrected assertions)",
    "using Edit/Write tools, and re-run until it passes. If a test cannot be fixed and you are confident it is a genuine failure,",
    "mark it test.fixme() with a comment explaining what is happening. Do not ask questions.",
  ].join(" ");

  const res = await run({
    agent,
    prompt,
    cwd: ws.root,
    onEvent,
    abortController: deps.abortController,
  });
  return { toolCalls: res.toolCalls, isError: res.isError };
}
