import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { query as sdkQuery } from "@anthropic-ai/claude-agent-sdk";

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
}

export interface RunAgentResult {
  resultText: string;
  toolCalls: string[];
  isError: boolean;
}

const DEFAULT_MCP = {
  "playwright-test": {
    type: "stdio" as const,
    command: "npx",
    args: ["playwright", "run-test-mcp-server", "--headless"],
  },
};

/**
 * T4: run a single Playwright agent definition via the Agent SDK against the
 * playwright-test MCP, streaming progress. One agent per call (D2 — the
 * orchestrator chains planner→generator→healer sequentially).
 */
export async function runAgent(opts: RunAgentOptions): Promise<RunAgentResult> {
  const queryFn = opts.queryFn ?? sdkQuery;
  const toolCalls: string[] = [];
  let resultText = "";
  let isError = false;

  const iterator = queryFn({
    prompt: opts.prompt,
    options: {
      systemPrompt: opts.agent.systemPrompt,
      cwd: opts.cwd,
      mcpServers: DEFAULT_MCP,
      allowedTools: opts.agent.tools,
      model: opts.agent.model,
      maxTurns: opts.maxTurns ?? 60,
      permissionMode: "bypassPermissions",
    },
  });

  for await (const msg of iterator) {
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
      opts.onEvent?.({ kind: "result", isError, text: resultText });
    }
  }

  return { resultText, toolCalls, isError };
}
