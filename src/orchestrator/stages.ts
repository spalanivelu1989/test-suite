import { type AgentEvent, loadAgent, runAgent } from "../agents/runtime";
import { readPlan, type Workspace } from "../agents/workspace";

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
    // A run with no saved plan is a planner failure even if the agent "succeeded".
    isError: res.isError || !planMarkdown,
  };
}
