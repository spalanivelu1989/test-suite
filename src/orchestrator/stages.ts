import { type AgentEvent, loadAgent, runAgent } from "../agents/runtime";
import {
  readGeneratedSpecs,
  readPlan,
  type Workspace,
} from "../agents/workspace";

// The four pipeline stages (T6–T8 + results). Each stage runs one agent in the
// run workspace via the runtime; deps are injectable so the orchestration is
// unit-testable without a live browser/Claude.

export interface StageDeps {
  runner?: typeof runAgent;
  loadAgentFn?: typeof loadAgent;
}

export interface PlanResult {
  planMarkdown: string | null;
  toolCalls: string[];
  isError: boolean;
}

/** T6: run the Planner → it explores the live app and saves a Markdown plan. */
export async function planTests(
  ws: Workspace,
  url: string,
  onEvent?: (e: AgentEvent) => void,
  deps: StageDeps = {},
): Promise<PlanResult> {
  const load = deps.loadAgentFn ?? loadAgent;
  const run = deps.runner ?? runAgent;
  const agent = await load("playwright-test-planner");

  const prompt = [
    `Create a comprehensive Playwright test plan for the web application at ${url}.`,
    "Call planner_setup_page first, then explore the app and identify the primary",
    "user flows (navigation, key content pages, forms, search). Save the finished",
    "plan as a Markdown file under the specs/ directory using planner_save_plan.",
  ].join(" ");

  const res = await run({ agent, prompt, cwd: ws.root, onEvent });
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
}

/** T7: run the Generator → turn each plan scenario into a Playwright spec file. */
export async function generateTests(
  ws: Workspace,
  onEvent?: (e: AgentEvent) => void,
  deps: StageDeps = {},
): Promise<GenerateResult> {
  const load = deps.loadAgentFn ?? loadAgent;
  const run = deps.runner ?? runAgent;
  const agent = await load("playwright-test-generator");

  const prompt = [
    "Read the Markdown test plan saved under the specs/ directory.",
    "For each scenario in the plan, generate a Playwright test: call generator_setup_page,",
    "execute the steps with the browser tools, then call generator_write_test to save it",
    "as tests/<fs-friendly-scenario-name>.spec.ts. Use seed.spec.ts as the seed.",
    "Generate one test file per scenario.",
  ].join(" ");

  const res = await run({ agent, prompt, cwd: ws.root, onEvent });
  const specs = await readGeneratedSpecs(ws);
  return {
    specs,
    toolCalls: res.toolCalls,
    // Any generated specs = proceed, even if the agent hit its turn cap; only
    // zero specs is fatal. We still test what was generated.
    isError: specs.length === 0,
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
    "Run the generated test suite with test_run. For each failing test, debug it with",
    "test_debug, fix the spec (resilient locators, corrected assertions) and re-run until",
    "it passes. If a test cannot be fixed and you are confident it is a genuine failure,",
    "mark it test.fixme() with a comment explaining what is happening. Do not ask questions.",
  ].join(" ");

  const res = await run({ agent, prompt, cwd: ws.root, onEvent });
  return { toolCalls: res.toolCalls, isError: res.isError };
}
