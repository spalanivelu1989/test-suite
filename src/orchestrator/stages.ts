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
  parsePlanScenarios,
  validateSuite,
} from "../validator/validate";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { REUSE_MARKER, type KnowledgeService } from "../knowledge";
import type { HealingPrecedent, Playbook } from "../knowledge/types";
import {
  type AuthCredentials,
  authEnvFor,
  buildGeneratorAuthPreamble,
  buildHealerAuthPreamble,
  buildPlannerAuthPreamble,
} from "../auth/credentials";

/** Max precedents injected into the Healer prompt (token budget, C5/D8). */
const MAX_HEAL_PRECEDENTS = 5;

/** Max playbooks injected into any agent prompt (token budget, C5/D8). */
const MAX_PLAYBOOKS = 6;

/** Render trusted playbooks as a compact "Learned principles" block (R12). */
export function formatPlaybooks(playbooks: Playbook[] = []): string {
  if (playbooks.length === 0) return "";
  const lines = playbooks
    .slice(0, MAX_PLAYBOOKS)
    .map((p, i) => `${i + 1}. ${p.principle} → ${p.recommendation}`)
    .join("\n");
  return [
    "LEARNED PRINCIPLES from prior runs (apply where relevant):",
    lines,
  ].join("\n");
}

/** Render prior fixes as a compact, budgeted prompt block (R7). Empty → "". */
export function formatPrecedentsForHealer(
  precedents: HealingPrecedent[],
): string {
  if (precedents.length === 0) return "";
  const lines = precedents
    .slice(0, MAX_HEAL_PRECEDENTS)
    .map((p, i) => {
      const before = p.before.replace(/\s+/g, " ").trim().slice(0, 160);
      const after = p.after.replace(/\s+/g, " ").trim().slice(0, 160);
      return `${i + 1}. [${p.strategy}] failure "${p.failureSignature}" was fixed by: ${before} -> ${after}`;
    })
    .join("\n");
  return [
    "KNOWN FIXES from prior runs (apply the matching one before improvising):",
    lines,
  ].join("\n");
}

// The four pipeline stages (T6–T8 + results). Each stage runs one agent in the
// run workspace via the runtime; deps are injectable so the orchestration is
// unit-testable without a live browser/Claude.

export interface StageDeps {
  runner?: typeof runAgent;
  loadAgentFn?: typeof loadAgent;
  /** Forwarded to the agent runtime so a stopped run kills the agent subprocess. */
  abortController?: AbortController;
  /** Knowledge Layer — injects history into the Planner/Generator prompts (R8/R10). */
  knowledge?: KnowledgeService;
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
  /** Form-login credentials; when set, the Planner logs in before exploring. */
  auth?: AuthCredentials;
  /** Free-text focus directive scoping the plan to one in-page flow/platform. */
  focus?: string;
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

/**
 * Build a high-priority FOCUS directive from the user's free-text instruction.
 * Returns "" when there is no focus, so callers can unconditionally concatenate.
 *
 * This is the only lever that can scope a run to ONE in-page flow/platform when
 * URL/depth scoping (crawlMode, maxPages, the crawl gate) cannot — e.g. several
 * platforms living behind a single page with no unique sub-URL. The directive is
 * deliberately strong ("ONLY", "ignore everything else") so a stray sibling flow
 * never sneaks into the plan or the generated specs.
 */
export function buildFocusBlock(focus: string | undefined): string {
  const trimmed = focus?.trim();
  if (!trimmed) return "";
  return [
    "🎯 FOCUS — SCOPE THIS RUN TO ONE TARGET ONLY (highest priority, overrides breadth):",
    trimmed,
    "Test ONLY the flow/platform described above. Do NOT plan, explore, or generate tests for any",
    "other platform, section, or flow on the page — even if it is visible, linked, or obviously testable.",
    "If the target requires selecting it first (a tab, dropdown, card, or toggle), perform that selection,",
    "then fill its input fields and complete that workflow end to end. When in doubt about whether something",
    "belongs in scope, leave it out.",
  ].join("\n");
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

  // The Planner crawls the target URL independently and writes the plan from what
  // it observes. It carries NO coverage/reuse knowledge — de-duplication against
  // prior runs is the Generator's job alone (one decision layer, see ADR-0003).
  // It IS given the previous plan for this URL as reference "memory" (best-effort,
  // guarded): an accelerator only — it must still crawl, revise, and add new flows.
  const PLAN_MEMORY_BUDGET_CHARS = 16_000; // ~4k tokens
  let memoryLines: string[] = [];
  try {
    const prior = deps.knowledge ? await deps.knowledge.getLastPlan(url) : null;
    if (prior) {
      const clipped =
        prior.length > PLAN_MEMORY_BUDGET_CHARS
          ? prior.slice(0, PLAN_MEMORY_BUDGET_CHARS - 1) + "…"
          : prior;
      memoryLines = [
        "\n\nMEMORY — you have planned this same app before. Your PREVIOUS plan is included below for reference; it may be out of date.",
        "Still open the browser and crawl the live site yourself. Reuse the sections that still apply, revise anything that changed, and ADD any new or obvious flows you discover — do NOT blindly copy it, and do NOT omit a current flow just because it is absent here.",
        `\n<previous-plan>\n${clipped}\n</previous-plan>\n`,
      ];
      onEvent?.({ kind: "text", text: "🧠 Loaded previous plan as memory" });
    }
  } catch {
    memoryLines = [];
  }

  // Phase 3: trusted procedural principles for this app (best crawl strategy) plus
  // global lessons (R12). Best-effort and budgeted; none → prompt unchanged (N2).
  let playbookLines: string[] = [];
  try {
    if (deps.knowledge) {
      const appId = deps.knowledge.appIdFor(url);
      const [app, global] = await Promise.all([
        deps.knowledge.getPlaybooks({ kind: "app", key: appId }),
        deps.knowledge.getPlaybooks({ kind: "global", key: "all" }),
      ]);
      const block = formatPlaybooks([...app, ...global]);
      if (block) playbookLines = ["\n\n" + block];
    }
  } catch {
    playbookLines = [];
  }

  // When the app is behind a login screen, the Planner must authenticate (and
  // save the session for the rest of the pipeline) before it can see anything.
  const authPreamble = options.auth
    ? buildPlannerAuthPreamble(options.auth, url, ws.authStatePath) + "\n\n"
    : "";

  // A user-supplied focus narrows the run to one in-page flow/platform that the
  // URL/depth crawl scope cannot isolate. Placed before the breadth instructions
  // (and crawl constraints) so it dominates how the Planner explores.
  const focusBlock = options.focus
    ? buildFocusBlock(options.focus) + "\n\n"
    : "";

  const prompt =
    authPreamble +
    focusBlock +
    [
      `Create a comprehensive Playwright test plan for the web application at ${url}.`,
      "Open the browser with playwright-cli first, then explore the app and identify the primary",
      "user flows (navigation, key content pages, forms, search). Save the finished plan",
      `with the Write tool to exactly this absolute path: ${ws.specsDir}/plan.md`,
      "— write it there and nowhere else (do NOT write to the repository's own specs/ directory or any other path).",
      ...constraintLines,
      ...memoryLines,
      ...playbookLines,
    ].join(" ");

  const res = await run({
    agent,
    prompt,
    cwd: ws.root,
    onEvent,
    abortController: deps.abortController,
    hooks: mergeHooks(guard.hooks, gate.hooks),
    // Inject credentials as env vars so the agent references "$TARGET_PASSWORD"
    // instead of typing a shell-mangle-prone literal (keeps the secret out of
    // the prompt/traces too). Only the Planner logs in; later stages state-load.
    ...(options.auth ? { env: authEnvFor(options.auth) } : {}),
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
  /** Entry URL — used to scope knowledge retrieval for the Generator (R10). */
  url?: string;
  /** Form-login credentials; when set, the Generator loads the saved session. */
  auth?: AuthCredentials;
  /** Free-text focus directive; mirrors the Planner so generation stays scoped. */
  focus?: string;
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

/**
 * T15: shape the Generator with the app's existing coverage. Copies each
 * confidently-matched (`reuse`) spec into the workspace (tagged) so the suite
 * stays runnable without regenerating it (D4), and returns prompt lines telling
 * the generator to skip ONLY the specs actually copied and build everything else.
 * Best-effort: returns [] when there is no knowledge service, url, plan, or KB.
 */
async function applyGeneratorKnowledge(
  ws: Workspace,
  rawPlan: string | null,
  deps: StageDeps,
  options: GenerateOptions,
  onEvent?: (e: AgentEvent) => void,
): Promise<string[]> {
  if (!deps.knowledge || !options.url || !rawPlan) return [];
  const scenarios = parsePlanScenarios(rawPlan).map((s) => ({
    id: s.id,
    name: s.name,
  }));
  if (scenarios.length === 0) return [];

  // Guarded so even a misbehaving service can never fail generation (N3).
  let gen;
  let playbookBlock = "";
  try {
    const pack = await deps.knowledge.assembleContext(options.url, scenarios);
    gen = pack.generator;
    playbookBlock = formatPlaybooks(pack.playbooks); // R12, budgeted
  } catch {
    return [];
  }
  if (!gen || gen.decisions.length === 0) {
    // No coverage decisions, but trusted principles can still guide generation.
    return playbookBlock ? ["\n\n" + playbookBlock] : [];
  }

  const codeByKey = new Map(
    gen.specs
      .filter((s) => s.code)
      .map((s) => [`${s.runId}:${s.file}`, s.code!]),
  );
  const reuse = gen.decisions.filter((d) => d.action === "reuse");
  const newCount = gen.decisions.filter((d) => d.action === "new").length;

  // Copy each confident match forward. A `reuse` whose source is genuinely
  // unavailable (e.g. the prior run's raw report was pruned) is NOT skipped — it
  // falls back to generation, so no planned scenario is ever left without a test.
  // Source is no longer token-bounded, so a covered scenario is never dropped
  // merely because earlier specs in the suite filled a prompt budget.
  const copied: string[] = [];
  for (const d of reuse) {
    const ms = d.matchedSpec;
    const code = ms && codeByKey.get(`${ms.runId}:${ms.file}`);
    if (!ms || !code) continue;
    const header = `// ${REUSE_MARKER} from run ${ms.runId} — already covered "${d.scenario}"\n`;
    await writeFile(join(ws.testsDir, ms.file), header + code, "utf8");
    copied.push(d.scenario);
  }

  const toGenerate = gen.decisions.length - copied.length;
  onEvent?.({
    kind: "text",
    text: `🧠 Coverage decisions: ${reuse.length} reuse, ${newCount} new — ${copied.length} spec(s) copied forward, ${toGenerate} to generate`,
  });

  const lines = ["\n\nKNOWLEDGE — existing test coverage for this app:"];
  if (copied.length)
    lines.push(
      `Already covered and ALREADY ADDED to the suite — do NOT regenerate: ${copied
        .map((s) => `"${s}"`)
        .join(", ")}.`,
    );
  lines.push(
    "Generate tests for every other scenario in the plan — do not skip any.",
  );
  // Phase 3: resilient-locator hints distilled from this app's past heals (R8).
  if (gen.locatorHints?.length) {
    lines.push(
      "RESILIENT LOCATORS — apply these lessons from prior healed failures:",
      ...gen.locatorHints.map((h) => `- ${h}`),
    );
  }
  // Phase 3: trusted distilled principles (R12, budgeted).
  if (playbookBlock) lines.push("\n\n" + playbookBlock);
  return lines;
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

  // T15: coverage-aware generation. Decide reuse|new per scenario; copy each
  // reused spec into the workspace so the suite stays runnable (D4); tell the
  // generator to skip the copied ones. Best-effort — empty when cold or KB down.
  const knowledgeLines = await applyGeneratorKnowledge(
    ws,
    rawPlan,
    deps,
    options,
    onEvent,
  );

  const authLines =
    options.auth && options.url
      ? [buildGeneratorAuthPreamble(options.url, ws.authStatePath)]
      : [];

  // Carry the same focus into generation: the plan is already scoped, but this
  // guards against generating a spec for any stray out-of-focus scenario and
  // reminds the Generator to perform the platform selection before each flow.
  const focusLines = options.focus ? [buildFocusBlock(options.focus)] : [];

  const prompt = [
    ...focusLines,
    `Read the Markdown test plan at ${ws.specsDir}/plan.md.`,
    "Write each test scenario (#### N.M <Scenario Title>) into its own separate spec file.",
    "Do NOT group multiple scenarios into a single file.",
    "For each scenario, open the page using playwright-cli and execute its steps using the CLI commands via Bash.",
    "After a scenario has been explored, use the Write tool to save it to an absolute path under",
    `${ws.testsDir}/ named <fs-friendly-scenario-title>.spec.ts`,
    `(e.g. 'Add Valid Todo' → ${ws.testsDir}/add-valid-todo.spec.ts).`,
    "Write spec files there and nowhere else (do NOT write to the repository's own tests/ directory).",
    `Use the seed at ${ws.seedPath} as the starting template.`,
    ...knowledgeLines,
    ...authLines,
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
  precedents: HealingPrecedent[] = [],
  playbooks: Playbook[] = [],
  auth?: AuthCredentials,
): Promise<HealResult> {
  const load = deps.loadAgentFn ?? loadAgent;
  const run = deps.runner ?? runAgent;
  const agent = await load("playwright-test-healer");

  const validationBlock = validation
    ? formatValidationForHealer(validation)
    : "";
  const authBlock = auth ? buildHealerAuthPreamble(ws.authStatePath) : "";
  // Phase 3: surface prior successful fixes for similar failures (R7) and trusted
  // principles (R12). Best-effort and token-budgeted; with none, the prompt is
  // identical to Phase 2 (N2).
  const precedentBlock = formatPrecedentsForHealer(precedents);
  const playbookBlock = formatPlaybooks(playbooks);
  const prompt = [
    "Run the generated test suite by executing npx playwright test via Bash. For each failing test, debug it by",
    "running it specifically or inspecting the page using playwright-cli, fix the spec (resilient locators, corrected assertions)",
    "using Edit/Write tools, and re-run until it passes. If a test cannot be fixed and you are confident it is a genuine failure,",
    "mark it test.fixme() with a comment explaining what is happening. Do not ask questions.",
    ...(precedentBlock ? ["\n\n" + precedentBlock] : []),
    ...(playbookBlock ? ["\n\n" + playbookBlock] : []),
    ...(validationBlock ? ["\n\n" + validationBlock] : []),
    ...(authBlock ? [authBlock] : []),
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
