import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  type Options,
  query as sdkQuery,
} from "@anthropic-ai/claude-agent-sdk";
import { startObservation } from "@langfuse/tracing";
import { boundText } from "../observability/langfuse";

/** A parsed Playwright agent definition (from `.claude/agents/<name>.md`). */
export interface AgentDef {
  name: string;
  description: string;
  tools: string[];
  model?: string;
  systemPrompt: string;
}

/** Parse a Claude Code agent markdown file: YAML-ish frontmatter + body prompt. */
export function parseAgentFile(content: string): AgentDef {
  const m = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error("agent file missing frontmatter");
  const [, fm, body] = m;
  const get = (key: string): string => {
    const line = fm.match(new RegExp(`^${key}:\\s*(.*)$`, "m"));
    return line ? line[1].trim() : "";
  };
  const toolsRaw = get("tools");
  return {
    name: get("name"),
    description: get("description"),
    tools: toolsRaw
      ? toolsRaw
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : [],
    model: get("model") || undefined,
    systemPrompt: body.trim(),
  };
}

export async function loadAgent(
  name: string,
  agentsDir = ".claude/agents",
): Promise<AgentDef> {
  const content = await readFile(join(agentsDir, `${name}.md`), "utf8");
  return parseAgentFile(content);
}

/** Progress events emitted as an agent runs — fed to the run store / SSE. */
export type AgentEvent =
  | { kind: "text"; text: string }
  | { kind: "tool"; tool: string }
  | { kind: "result"; isError: boolean; text: string };

export interface RunAgentOptions {
  agent: AgentDef;
  prompt: string;
  cwd: string;
  onEvent?: (e: AgentEvent) => void;
  /** Injected in tests; defaults to the real SDK query. */
  queryFn?: typeof sdkQuery;
  mcpServerName?: string;
  maxTurns?: number;
  /** Aborts the underlying agent subprocess when the run is stopped. */
  abortController?: AbortController;
  /** SDK lifecycle hooks — used to code-enforce crawl scope (see crawlGate). */
  hooks?: Options["hooks"];
  /**
   * Inactivity guard (ms): if no SDK event arrives for this long, abort the
   * agent. Stops a stage hanging forever when the subprocess stream never
   * delivers a terminal `result` (e.g. a lingering browser child holds stdio
   * open). Defaults to {@link DEFAULT_IDLE_TIMEOUT_MS}; pass `Infinity` to disable.
   */
  idleTimeoutMs?: number;
  /** Hard wall-clock cap (ms) for the whole agent run. Off by default. */
  maxDurationMs?: number;
  /**
   * Extra environment variables for the agent's tool subprocess (e.g. login
   * credentials the agent references as "$TARGET_PASSWORD" rather than typing as
   * a shell-mangle-prone literal). Merged OVER the inherited process env, so the
   * agent keeps PATH/ANTHROPIC_API_KEY/etc. Omit → the SDK inherits as usual.
   */
  env?: Record<string, string>;
}

/**
 * Default inactivity guard: 10 min of *complete silence* (no tool call, no text,
 * no result) is unambiguously a hung stream, not slow work — a full Playwright
 * suite still streams tool events well inside this. Tuned to never false-positive
 * on legitimately slow agents while guaranteeing a stage cannot hang forever.
 */
export const DEFAULT_IDLE_TIMEOUT_MS = 10 * 60_000;

export interface RunAgentResult {
  resultText: string;
  toolCalls: string[];
  isError: boolean;
  /** True when the run was aborted by the idle/duration guard (not a normal end). */
  timedOut?: boolean;
}

/**
 * T4: run a single Playwright agent definition via the Agent SDK,
 * streaming progress. One agent per call (D2 — the orchestrator chains
 * discoverer→designer→evolver sequentially).
 */
export async function runAgent(opts: RunAgentOptions): Promise<RunAgentResult> {
  const queryFn = opts.queryFn ?? sdkQuery;
  const toolCalls: string[] = [];
  let resultText = "";
  let isError = false;
  let timedOut = false;

  // Langfuse generation for this agent run. The Agent SDK drives Claude in a
  // subprocess, so the per-turn LLM calls can't be auto-instrumented — instead we
  // record the whole run as one generation and attach the model, token usage, and
  // cost the SDK reports in its terminal `result` message. Nests under the active
  // run trace; a non-recording no-op when tracing is disabled.
  const generation = startObservation(
    `agent:${opts.agent.name}`,
    {
      model: opts.agent.model,
      input: boundText(opts.prompt).text,
      metadata: {
        agent: opts.agent.name,
        tools: opts.agent.tools.join(","),
        maxTurns: opts.maxTurns ?? 150,
      },
    },
    { asType: "generation" },
  );
  let usage:
    | {
        input?: number;
        output?: number;
        cacheRead?: number;
        cacheWrite?: number;
      }
    | undefined;
  let costUsd: number | undefined;
  let numTurns: number | undefined;
  let modelUsed: string | undefined;

  // A local controller we can abort on timeout. If the caller passed one (run
  // stop), chain it so either source aborts the agent.
  const control = new AbortController();
  if (opts.abortController) {
    if (opts.abortController.signal.aborted) control.abort();
    else
      opts.abortController.signal.addEventListener("abort", () =>
        control.abort(),
      );
  }

  const idleMs = opts.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let hardTimer: ReturnType<typeof setTimeout> | undefined;
  const fireTimeout = (why: string) => {
    timedOut = true;
    resultText = `agent aborted: ${why}`;
    control.abort();
  };
  const armIdle = () => {
    if (!Number.isFinite(idleMs)) return;
    clearTimeout(idleTimer);
    idleTimer = setTimeout(
      () => fireTimeout(`no activity for ${Math.round(idleMs / 1000)}s`),
      idleMs,
    );
  };
  if (opts.maxDurationMs && Number.isFinite(opts.maxDurationMs)) {
    hardTimer = setTimeout(
      () => fireTimeout(`exceeded ${Math.round(opts.maxDurationMs! / 1000)}s`),
      opts.maxDurationMs,
    );
  }

  const iterator = queryFn({
    prompt: opts.prompt,
    options: {
      systemPrompt: opts.agent.systemPrompt,
      cwd: opts.cwd,
      allowedTools: opts.agent.tools,
      model: opts.agent.model,
      // Agents make many browser calls per test; 60 was too low (a real
      // multi-flow run exhausted it mid-generation). 150 gives headroom.
      maxTurns: opts.maxTurns ?? 150,
      permissionMode: "bypassPermissions",
      // The timeout/stop guard aborts THIS controller (chained to the caller's).
      abortController: control,
      // PreToolUse hook denials apply even under bypassPermissions, so the crawl
      // gate can hard-block out-of-scope navigation.
      hooks: opts.hooks,
      // Pass a full env (inherited + extras) so the agent's shell keeps PATH/API
      // keys AND gets any injected credentials. Only set when extras are given so
      // default inheritance is untouched for non-auth runs.
      ...(opts.env
        ? { env: { ...(process.env as Record<string, string>), ...opts.env } }
        : {}),
    },
  });

  try {
    armIdle(); // start the inactivity clock before the first message
    for await (const msg of iterator) {
      armIdle(); // any activity resets it
      if (msg.type === "assistant") {
        for (const block of msg.message.content) {
          if (block.type === "text" && block.text) {
            opts.onEvent?.({ kind: "text", text: block.text });
          } else if (block.type === "tool_use") {
            toolCalls.push(block.name);
            opts.onEvent?.({ kind: "tool", tool: block.name });
          }
        }
      } else if (msg.type === "result") {
        isError = msg.subtype !== "success";
        resultText =
          "result" in msg && typeof msg.result === "string" ? msg.result : "";
        // Pull model/token/cost telemetry off the terminal result for the span.
        usage = {
          input: msg.usage?.input_tokens,
          output: msg.usage?.output_tokens,
          cacheRead: msg.usage?.cache_read_input_tokens,
          cacheWrite: msg.usage?.cache_creation_input_tokens,
        };
        costUsd = msg.total_cost_usd;
        numTurns = msg.num_turns;
        modelUsed = Object.keys(msg.modelUsage ?? {})[0];
        opts.onEvent?.({ kind: "result", isError, text: resultText });
      }
    }
  } catch (err) {
    // The SDK rejects the iterator (not a result message) when the Claude Code
    // subprocess exits non-zero — notably on maxTurns ("Reached maximum number
    // of turns") or when we abort on timeout. Swallow it so partial work
    // survives: the stage decides success from artifacts produced (e.g. spec
    // count), not the turn cap — and a hung stream becomes a clean stage exit.
    isError = true;
    if (!timedOut)
      resultText = err instanceof Error ? err.message : String(err);
    opts.onEvent?.({ kind: "result", isError, text: resultText });
  } finally {
    clearTimeout(idleTimer);
    clearTimeout(hardTimer);
    // Close out the generation with the run's outcome, usage, and cost.
    const usageDetails: Record<string, number> = {};
    if (usage?.input !== undefined) usageDetails.input = usage.input;
    if (usage?.output !== undefined) usageDetails.output = usage.output;
    if (usage?.cacheRead !== undefined)
      usageDetails.cache_read_input_tokens = usage.cacheRead;
    if (usage?.cacheWrite !== undefined)
      usageDetails.cache_creation_input_tokens = usage.cacheWrite;
    generation
      .update({
        // Prefer the configured model; fall back to whatever the SDK reported.
        ...((opts.agent.model ?? modelUsed)
          ? { model: opts.agent.model ?? modelUsed }
          : {}),
        output: boundText(resultText).text,
        ...(Object.keys(usageDetails).length ? { usageDetails } : {}),
        ...(costUsd !== undefined ? { costDetails: { total: costUsd } } : {}),
        metadata: {
          toolCallCount: toolCalls.length,
          distinctTools: Array.from(new Set(toolCalls)).join(","),
          numTurns,
          isError,
          timedOut,
        },
        ...(isError
          ? {
              level: "ERROR" as const,
              statusMessage: resultText.slice(0, 500),
            }
          : {}),
      })
      .end();
  }

  return { resultText, toolCalls, isError, timedOut };
}
