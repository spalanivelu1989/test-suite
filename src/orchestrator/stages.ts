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
  effectiveScenarioCap,
  MAX_TOTAL_TESTS,
  type ValidationReport,
} from "../types";
import {
  formatValidationForEvolver,
  parsePlanScenarios,
  validateSuite,
} from "../validator/validate";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { REUSE_MARKER, type KnowledgeService } from "../knowledge";
import type { BusinessContextService } from "../knowledge/business/types";
import type { HealingPrecedent, Playbook } from "../knowledge/types";
import {
  type AuthCredentials,
  authEnvFor,
  buildDesignerAuthPreamble,
  buildEvolverAuthPreamble,
  buildDiscovererAuthPreamble,
} from "../auth/credentials";

/** Max precedents injected into the Evolver prompt (token budget, C5/D8). */
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
export function formatPrecedentsForEvolver(
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
  /** Knowledge Layer — injects history into the Discoverer/Designer prompts (R8/R10). */
  knowledge?: KnowledgeService;
  /** Authored OKF business context — primes the Discoverer/Designer with domain knowledge. */
  businessContext?: BusinessContextService;
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
  /** Form-login credentials; when set, the Discoverer logs in before exploring. */
  auth?: AuthCredentials;
  /** Free-text focus directive scoping the plan to one in-page flow/platform. */
  focus?: string;
  /** Per-page test rate; overrides the per-mode default rate when set. */
  testsPerPage?: number;
}

/**
 * Build the mode-specific crawl-scope instruction block injected into the
 * discoverer prompt.  Each mode gets an unambiguous, concrete directive so the LLM
 * cannot "interpret" it loosely.
 */
function buildDiscovererConstraints(
  crawlMode: CrawlMode,
  maxPages: number,
  url: string,
  testsPerPage?: number,
): string[] {
  const depth = CRAWL_MODE_DEPTH[crawlMode];
  const pageBudget = effectivePageBudget(crawlMode, maxPages);
  const rate =
    testsPerPage && testsPerPage > 0
      ? testsPerPage
      : CRAWL_MODE_SCENARIOS_PER_PAGE[crawlMode];
  const maxScenarios = effectiveScenarioCap(crawlMode, maxPages, testsPerPage);
  // True when the page×rate product was clamped down to the global ceiling.
  const clamped = maxScenarios < Math.round(pageBudget * rate);

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
    `SCENARIO CAP: Your plan MUST contain at most ${maxScenarios} test scenarios in total ` +
      `(${pageBudget} page(s) × ${rate} tests/page` +
      (clamped ? `, capped at the ${MAX_TOTAL_TESTS}-test ceiling).` : ").") +
      " Do not exceed this cap under any circumstances — trim lower-priority scenarios if needed.",
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

/** T6: run the Discoverer → it explores the live app and saves a Markdown plan. */
export async function discoverTests(
  ws: Workspace,
  url: string,
  onEvent?: (e: AgentEvent) => void,
  deps: StageDeps = {},
  options: PlanOptions = {},
): Promise<PlanResult> {
  const load = deps.loadAgentFn ?? loadAgent;
  const run = deps.runner ?? runAgent;
  const agent = await load("playwright-test-discoverer");

  const crawlMode: CrawlMode = options.crawlMode ?? "standard";
  const maxPages = options.maxPages ?? 10;

  const constraintLines = buildDiscovererConstraints(
    crawlMode,
    maxPages,
    url,
    options.testsPerPage,
  );

  // Code-enforced crawl scope: the gate hard-denies out-of-scope navigation at
  // the tool boundary, so the depth/page limits hold even if the agent ignores
  // the prompt constraints above.
  const gate = createCrawlGate({
    mode: crawlMode,
    maxPages,
    entryUrl: url,
    workspaceRoot: ws.root,
    stageName: "1-discoverer",
    onDeny: (reason) =>
      onEvent?.({ kind: "text", text: `🛑 Crawl limit enforced: ${reason}` }),
  });

  // CLI-only enforcement: hard-deny any MCP browser tool so the agent must drive
  // the browser through `npx playwright-cli` (see cliGuard / LEARNINGS 2026-06-01).
  const guard = createCliGuard({
    onDeny: (reason) =>
      onEvent?.({ kind: "text", text: `🛑 Tool blocked: ${reason}` }),
  });

  // The Discoverer crawls the target URL independently and writes the plan from what
  // it observes. It carries NO coverage/reuse knowledge — de-duplication against
  // prior runs is the Designer's job alone (one decision layer, see ADR-0003).
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

  // Authored OKF business context: the app's purpose + workflow/screen map, so the
  // Discoverer crawls toward real business flows instead of blindly by link. Best-
  // effort and budgeted; no matching bundle → prompt unchanged (runs cold).
  let businessLines: string[] = [];
  try {
    const overview = await deps.businessContext?.getBusinessOverview(url);
    if (overview) {
      businessLines = ["\n\n" + overview.block];
      const plus = overview.platforms.length
        ? ` (+ ${overview.platforms.join(", ")})`
        : "";
      onEvent?.({
        kind: "text",
        text: `📘 Loaded business context: ${overview.appTitle}${plus}`,
      });
    }
  } catch {
    businessLines = [];
  }

  // When the app is behind a login screen, the Discoverer must authenticate (and
  // save the session for the rest of the pipeline) before it can see anything.
  const authPreamble = options.auth
    ? buildDiscovererAuthPreamble(options.auth, url, ws.authStatePath) + "\n\n"
    : "";

  // A user-supplied focus narrows the run to one in-page flow/platform that the
  // URL/depth crawl scope cannot isolate. Placed before the breadth instructions
  // (and crawl constraints) so it dominates how the Discoverer explores.
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
      ...businessLines,
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
    // the prompt/traces too). Only the Discoverer logs in; later stages state-load.
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
  /** Entry URL — used to scope knowledge retrieval for the Designer (R10). */
  url?: string;
  /** Form-login credentials; when set, the Designer loads the saved session. */
  auth?: AuthCredentials;
  /** Free-text focus directive; mirrors the Discoverer so generation stays scoped. */
  focus?: string;
  /** Per-page test rate; overrides the per-mode default rate when set. */
  testsPerPage?: number;
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
 * T15: shape the Designer with the app's existing coverage. Copies each
 * confidently-matched (`reuse`) spec into the workspace (tagged) so the suite
 * stays runnable without regenerating it (D4), and returns prompt lines telling
 * the designer to skip ONLY the specs actually copied and build everything else.
 * Best-effort: returns [] when there is no knowledge service, url, plan, or KB.
 */
/**
 * Build the Designer's authored business-context block: the rules/screens relevant to
 * the plan's scenarios, telling the Designer to assert against intended behaviour.
 * Independent of the knowledge service. Best-effort: [] when there is no business
 * service, url, plan, or matching bundle.
 */
async function applyBusinessContext(
  rawPlan: string | null,
  deps: StageDeps,
  options: GenerateOptions,
  onEvent?: (e: AgentEvent) => void,
): Promise<string[]> {
  if (!deps.businessContext || !options.url || !rawPlan) return [];
  const scenarios = parsePlanScenarios(rawPlan).map((s) => s.name);
  if (scenarios.length === 0) return [];
  try {
    const ctx = await deps.businessContext.getBusinessContext(
      options.url,
      scenarios,
    );
    if (!ctx) return [];
    onEvent?.({
      kind: "text",
      text: `📘 Business rules in context: ${ctx.concepts.length} concept(s)`,
    });
    return ["\n\n" + ctx.block];
  } catch {
    return [];
  }
}

async function applyDesignerKnowledge(
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
    gen = pack.designer;
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

/** T7: run the Designer → turn each plan scenario into a Playwright spec file. */
export async function designTests(
  ws: Workspace,
  onEvent?: (e: AgentEvent) => void,
  deps: StageDeps = {},
  options: GenerateOptions = {},
): Promise<GenerateResult> {
  const load = deps.loadAgentFn ?? loadAgent;
  const run = deps.runner ?? runAgent;
  const agent = await load("playwright-test-designer");

  const crawlMode: CrawlMode = options.crawlMode ?? "standard";
  const maxPages = options.maxPages ?? 10;
  const pageBudget = effectivePageBudget(crawlMode, maxPages);
  // Honor a user-selected test budget (maxTests) when present; otherwise derive
  // from page count × per-page rate. Same source of truth as the Discoverer cap.
  const maxScenarios = effectiveScenarioCap(
    crawlMode,
    maxPages,
    options.testsPerPage,
  );

  // Read and (if necessary) trim the plan before the designer sees it.
  const rawPlan = await readPlan(ws);
  let scenarioCount = 0;
  let trimmedCount = 0;

  if (rawPlan) {
    const { trimmed, removed } = trimPlan(rawPlan, maxScenarios);
    trimmedCount = removed;

    if (removed > 0) {
      onEvent?.({
        kind: "text",
        text: `⚠️  Plan trimmed: ${removed} scenario(s) removed (budget: ${maxScenarios} max for ${crawlMode} mode with ${pageBudget} page(s)).`,
      });
      // Write the trimmed plan back so the designer reads it from the workspace.
      await ws.writePlan(trimmed);
    }

    // Count scenarios with the format-robust parser. trimPlan only recognises
    // the "#### N.M" heading form, but the Discoverer also emits "### Scenario N:";
    // counting via trimPlan alone silently yields 0 and pins maxTurns to its
    // floor — the bug behind under-generation. parsePlanScenarios handles both.
    const planForCount = removed > 0 ? trimmed : rawPlan;
    scenarioCount = Math.min(
      parsePlanScenarios(planForCount).length,
      maxScenarios,
    );
  }

  // Scale maxTurns with the scenario count, over a generous floor so a deep
  // single-workflow run has enough turns to BOTH explore the live DOM and write
  // every spec. At the old floor of 80, exploration-heavy runs exhausted the
  // budget before writing more than one spec (leaving most scenarios untested).
  const maxTurns = Math.max(120, scenarioCount * 18);

  // T15: coverage-aware generation. Decide reuse|new per scenario; copy each
  // reused spec into the workspace so the suite stays runnable (D4); tell the
  // designer to skip the copied ones. Best-effort — empty when cold or KB down.
  const knowledgeLines = await applyDesignerKnowledge(
    ws,
    rawPlan,
    deps,
    options,
    onEvent,
  );

  // Authored OKF business rules for the scenarios being generated, so the Designer
  // asserts against intended behaviour. Independent of the knowledge service (it can
  // fire even when the KB is cold); best-effort — empty when no bundle matches.
  const businessLines = await applyBusinessContext(
    rawPlan,
    deps,
    options,
    onEvent,
  );

  const authLines =
    options.auth && options.url
      ? [buildDesignerAuthPreamble(options.url, ws.authStatePath)]
      : [];

  // Carry the same focus into generation: the plan is already scoped, but this
  // guards against generating a spec for any stray out-of-focus scenario and
  // reminds the Designer to perform the platform selection before each flow.
  const focusLines = options.focus ? [buildFocusBlock(options.focus)] : [];

  const prompt = [
    ...focusLines,
    `Read the Markdown test plan at ${ws.specsDir}/plan.md.`,
    "Generate a spec for EVERY scenario in the plan — do not stop early or skip any.",
    "Work through the scenarios ONE AT A TIME, in order. For each scenario:",
    "(1) explore it with playwright-cli via Bash, then",
    "(2) IMMEDIATELY use the Write tool to save its spec before moving to the next scenario.",
    "Do NOT do all the exploration first and defer every Write to the end — interleave",
    "explore-then-write per scenario, so that if you run low on turns the scenarios you have",
    "already finished are safely saved to disk rather than lost.",
    "Write each scenario into its own separate spec file; do NOT group multiple scenarios into one file.",
    "Save each spec to an absolute path under",
    `${ws.testsDir}/ named <fs-friendly-scenario-title>.spec.ts`,
    `(e.g. 'Add Valid Todo' → ${ws.testsDir}/add-valid-todo.spec.ts).`,
    "Write spec files there and nowhere else (do NOT write to the repository's own tests/ directory).",
    `Use the seed at ${ws.seedPath} as the starting template.`,
    ...businessLines,
    ...knowledgeLines,
    ...authLines,
  ].join(" ");

  const gate = createCrawlGate({
    mode: "aggressive",
    maxPages: 999,
    entryUrl: "",
    workspaceRoot: ws.root,
    stageName: "2-designer",
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
 * Completeness gate: re-run the Designer for ONLY the planned scenarios the
 * validator found unwritten. The first pass can exhaust its turn budget on live
 * exploration and leave most scenarios untested; this targeted second pass fills
 * the gaps without touching specs that already exist. Best-effort — a failed or
 * partial retry leaves the existing suite intact (callers re-validate after).
 */
export async function regenerateMissingScenarios(
  ws: Workspace,
  missingScenarios: string[],
  onEvent?: (e: AgentEvent) => void,
  deps: StageDeps = {},
  options: GenerateOptions = {},
): Promise<GenerateResult> {
  const load = deps.loadAgentFn ?? loadAgent;
  const run = deps.runner ?? runAgent;
  const agent = await load("playwright-test-designer");

  const focusLines = options.focus ? [buildFocusBlock(options.focus)] : [];
  const authLines =
    options.auth && options.url
      ? [buildDesignerAuthPreamble(options.url, ws.authStatePath)]
      : [];
  const missingList = missingScenarios.map((s) => `  - ${s}`).join("\n");

  const prompt = [
    ...focusLines,
    `Read the Markdown test plan at ${ws.specsDir}/plan.md.`,
    "Some scenarios from the plan were NOT yet turned into spec files. Generate spec files for",
    "ONLY these missing scenarios (match them to the plan by title):",
    missingList,
    `Do NOT regenerate, overwrite, or modify any spec that already exists under ${ws.testsDir}/ —`,
    "generate ONLY the missing scenarios listed above.",
    "Work through them ONE AT A TIME: explore a scenario with playwright-cli via Bash, then",
    "IMMEDIATELY use the Write tool to save its spec before moving to the next — never defer",
    "every Write to the end.",
    "Write each scenario into its own separate spec file under",
    `${ws.testsDir}/ named <fs-friendly-scenario-title>.spec.ts.`,
    `Use the seed at ${ws.seedPath} as the starting template.`,
    ...authLines,
  ].join(" ");

  // Generous budget for the stragglers — these are exactly the scenarios the
  // first pass ran out of turns on, so do not start from the low floor.
  const maxTurns = Math.max(120, missingScenarios.length * 18);

  const gate = createCrawlGate({
    mode: "aggressive",
    maxPages: 999,
    entryUrl: "",
    workspaceRoot: ws.root,
    stageName: "2-designer-retry",
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
    isError: specs.length === 0,
    scenarioCount: missingScenarios.length,
    trimmedCount: 0,
  };
}

/**
 * Validation stage: statically inspect the generated specs (no browser, no LLM)
 * for structure/assertion/robustness/relevance issues, scored against the plan.
 * Pure read of workspace files — its findings are surfaced in the report and fed
 * to the Evolver so flagged anti-patterns get fixed alongside runtime failures.
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

/** T8: run the Evolver → execute the suite, repair failures, quarantine the unfixable. */
export async function evolveTests(
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
  const agent = await load("playwright-test-evolver");

  const validationBlock = validation
    ? formatValidationForEvolver(validation)
    : "";
  const authBlock = auth ? buildEvolverAuthPreamble(ws.authStatePath) : "";
  // Phase 3: surface prior successful fixes for similar failures (R7) and trusted
  // principles (R12). Best-effort and token-budgeted; with none, the prompt is
  // identical to Phase 2 (N2).
  const precedentBlock = formatPrecedentsForEvolver(precedents);
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
    stageName: "3-evolver",
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
