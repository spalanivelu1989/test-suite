import type {
  HookCallback,
  HookJSONOutput,
  Options,
} from "@anthropic-ai/claude-agent-sdk";
import { isAbsolute, relative, resolve } from "node:path";

// Filesystem-scope enforcement (hooks = law, prompts = guidelines).
//
// Pipeline agents run with `cwd: ws.root` but are NOT otherwise sandboxed to it:
// cliGuard fences off MCP tools and crawlGate fences off off-scope *URLs*, but
// neither stops a file read. So an agent told to "read all the failing test
// files" can `Read`/`Grep`/`cat ../<other-run>/…` and wander into sibling run
// dirs (.runs/<other>, .migration-runs/…) or the repo's business-context — then
// confabulate that unrelated material into its work (e.g. a portfolio run's
// Tester narrating "the TCO-related failing tests" lifted from another app's run).
//
// A PreToolUse "deny" applies even under bypassPermissions (same boundary the
// other guards use), so this is where workspace isolation can be *enforced*: deny
// any file-touching tool whose path resolves outside the run workspace, and deny
// Bash commands carrying an absolute / parent-traversal path that escapes it.
// Module resolution that node itself does for `npx playwright test` (walking up to
// the repo's node_modules) is unaffected — only explicit path *arguments* are checked.

/** Tool → the input fields that name a filesystem path we must keep in scope. */
const FILE_PATH_FIELDS: Record<string, string[]> = {
  Read: ["file_path"],
  Write: ["file_path"],
  Edit: ["file_path"],
  MultiEdit: ["file_path"],
  NotebookEdit: ["notebook_path"],
  LS: ["path"],
  Glob: ["path"],
  Grep: ["path"],
};

export interface FsGuardConfig {
  /** The run workspace; every file path must resolve inside this dir. */
  workspaceRoot: string;
  /** Surfaced to the run log each time the guard blocks a tool. */
  onDeny?: (reason: string) => void;
}

export interface FsGuard {
  /** Drop into the SDK `query({ options: { hooks } })` (compose via mergeHooks). */
  hooks: Options["hooks"];
  /** Inspectable state, for logging and tests. */
  stats: () => { denials: number; escapes: string[] };
}

/**
 * True if `target` resolves to `root` or a descendant of it. Lexical check
 * (no symlink resolution): an absolute target is resolved as-is, a relative one
 * against `root`. `~`-prefixed paths are treated as escapes since the shell, not
 * us, expands them to the home dir.
 */
export function isWithinRoot(root: string, target: string): boolean {
  if (target === "~" || target.startsWith("~/")) return false;
  const rootResolved = resolve(root);
  const targetResolved = isAbsolute(target)
    ? resolve(target)
    : resolve(rootResolved, target);
  const rel = relative(rootResolved, targetResolved);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

/**
 * Find the first path-like token in a Bash command that escapes `root`. Only
 * tokens that clearly denote an out-of-tree location are checked — absolute
 * paths (`/…`), parent traversal (`..`, `../…`, `…/../…`) and home (`~`) — so
 * in-workspace relative args (`tests/foo.spec.ts`) and non-path tokens (verbs,
 * `npx`, URLs, grep patterns without slashes) never trip it. Best-effort defense
 * in depth, not a full shell parser.
 */
export function bashPathEscape(command: string, root: string): string | null {
  const tokens = command.split(/[\s'"=|&;()<>]+/).filter(Boolean);
  for (const raw of tokens) {
    if (raw.startsWith("-")) continue; // flags
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) continue; // URLs (http://, file://…)
    const looksOutOfTree =
      raw.startsWith("/") ||
      raw.startsWith("~") ||
      raw === ".." ||
      raw.startsWith("../") ||
      raw.includes("/../") ||
      raw.endsWith("/..");
    if (!looksOutOfTree) continue;
    if (!isWithinRoot(root, raw)) return raw;
  }
  return null;
}

function denialReason(detail: string): string {
  return (
    `${detail} is outside this run's workspace. Pipeline agents are sandboxed to ` +
    "their own run directory — only read, run, and edit files inside it. Do not " +
    "reach into sibling run dirs or the repository."
  );
}

/**
 * Build a filesystem-scope guard for one agent run. The returned `hooks` deny any
 * file-touching tool (or Bash path argument) that escapes `workspaceRoot`.
 */
export function createFsGuard(cfg: FsGuardConfig): FsGuard {
  const root = cfg.workspaceRoot;
  let denials = 0;
  const escapes: string[] = [];

  const deny = (detail: string): HookJSONOutput => {
    denials++;
    escapes.push(detail);
    const reason = denialReason(detail);
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
    const toolInput = (input.tool_input ?? {}) as Record<string, unknown>;

    const fields = FILE_PATH_FIELDS[input.tool_name];
    if (fields) {
      for (const field of fields) {
        const value = toolInput[field];
        if (typeof value === "string" && !isWithinRoot(root, value)) {
          return deny(`"${value}"`);
        }
      }
    }

    if (input.tool_name === "Bash") {
      const command =
        typeof toolInput.command === "string" ? toolInput.command : "";
      const escape = bashPathEscape(command, root);
      if (escape) return deny(`The path "${escape}"`);
    }

    return { continue: true };
  };

  return {
    hooks: { PreToolUse: [{ hooks: [preToolUse] }] },
    stats: () => ({ denials, escapes: [...escapes] }),
  };
}
