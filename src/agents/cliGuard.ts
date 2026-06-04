import type {
  HookCallback,
  HookJSONOutput,
  Options,
} from "@anthropic-ai/claude-agent-sdk";

// CLI-only enforcement (hooks = law, prompts = guidelines).
//
// Every pipeline agent is contracted to drive the browser the SAME way: by
// shelling out to `npx playwright-cli ...` through the Bash tool. The prompts
// say so — but a prompt is a request, not a guarantee. LEARNINGS 2026-06-01
// records exactly how that failed: when an MCP browser server (playwright-test)
// was enabled, the agents preferred its convenient native `mcp__playwright-test__browser_*`
// tools and ignored the CLI entirely. Under `permissionMode: "bypassPermissions"`,
// an agent's per-definition `allowedTools` list does NOT fence it off an enabled
// server, so removing the tools from frontmatter changed nothing.
//
// A PreToolUse "deny" decision, however, DOES apply under bypassPermissions (the
// same boundary the crawl gate relies on). So this guard is the one place where
// the CLI-only contract can be *enforced* rather than merely asked for: it denies
// any tool whose name matches a forbidden prefix, pushing the agent back onto the
// `npx playwright-cli` + Bash path the prompts intend.

/**
 * Tool-name prefixes that are hard-denied. Defaults to every MCP tool: the
 * agents have no legitimate MCP tool in their allow-lists, and the only browser
 * driver they are permitted is the playwright-cli over Bash. Blocking the whole
 * `mcp__` namespace fails safe against a server being re-enabled in the future.
 */
export const DEFAULT_FORBIDDEN_PREFIXES = ["mcp__"];

export interface CliGuardConfig {
  /** Override the default forbidden prefixes (`mcp__`). */
  forbiddenPrefixes?: string[];
  /** Surfaced to the run log each time the guard blocks a tool. */
  onDeny?: (reason: string) => void;
}

export interface CliGuard {
  /** Drop into the SDK `query({ options: { hooks } })` (compose via mergeHooks). */
  hooks: Options["hooks"];
  /** Inspectable state, for logging and tests. */
  stats: () => { denials: number; blockedTools: string[] };
}

/** True if `toolName` starts with any forbidden prefix. */
export function isForbiddenTool(toolName: string, prefixes: string[]): boolean {
  return prefixes.some((p) => toolName.startsWith(p));
}

function denialReason(toolName: string): string {
  return (
    `Tool "${toolName}" is disabled in this pipeline. Drive the browser only by ` +
    "running `npx playwright-cli ...` through the Bash tool — do not call MCP " +
    "browser tools."
  );
}

/**
 * Build a CLI-only guard. The returned `hooks` deny any forbidden tool at the
 * tool boundary, enforcing (not requesting) the playwright-cli path for one
 * agent run.
 */
export function createCliGuard(cfg: CliGuardConfig = {}): CliGuard {
  const prefixes = cfg.forbiddenPrefixes ?? DEFAULT_FORBIDDEN_PREFIXES;
  let denials = 0;
  const blockedTools: string[] = [];

  const deny = (toolName: string): HookJSONOutput => {
    denials++;
    blockedTools.push(toolName);
    const reason = denialReason(toolName);
    cfg.onDeny?.(reason);
    return {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: reason,
      },
    };
  };

  const preToolUse: HookCallback = async (input) => {
    if (input.hook_event_name !== "PreToolUse") return { continue: true };
    if (isForbiddenTool(input.tool_name, prefixes)) {
      return deny(input.tool_name);
    }
    return { continue: true };
  };

  return {
    hooks: { PreToolUse: [{ hooks: [preToolUse] }] },
    stats: () => ({ denials, blockedTools: [...blockedTools] }),
  };
}

/**
 * Merge two SDK hook configs, concatenating the matcher arrays for each event so
 * both sets of hooks run. Used to layer the CLI guard onto the crawl gate without
 * either clobbering the other.
 */
export function mergeHooks(
  a: Options["hooks"],
  b: Options["hooks"],
): Options["hooks"] {
  const out: Record<string, unknown[]> = {};
  for (const src of [a, b]) {
    if (!src) continue;
    for (const [event, matchers] of Object.entries(src)) {
      out[event] = [...(out[event] ?? []), ...(matchers as unknown[])];
    }
  }
  return out as Options["hooks"];
}
