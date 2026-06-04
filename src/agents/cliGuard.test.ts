import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createCliGuard,
  isForbiddenTool,
  mergeHooks,
  DEFAULT_FORBIDDEN_PREFIXES,
} from "./cliGuard";

// The guard's PreToolUse hook is the first (only) callback in its config.
function preHook(guard: ReturnType<typeof createCliGuard>) {
  const matchers = (guard.hooks as { PreToolUse: { hooks: Function[] }[] })
    .PreToolUse;
  return matchers[0].hooks[0] as (
    input: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
}

test("isForbiddenTool matches MCP browser tools, not the CLI path", () => {
  const p = DEFAULT_FORBIDDEN_PREFIXES;
  assert.equal(
    isForbiddenTool("mcp__playwright-test__browser_navigate", p),
    true,
  );
  assert.equal(isForbiddenTool("mcp__anything__else", p), true);
  // The contracted path and the agents' real tools are never blocked.
  assert.equal(isForbiddenTool("Bash", p), false);
  assert.equal(isForbiddenTool("Read", p), false);
  assert.equal(isForbiddenTool("Write", p), false);
  assert.equal(isForbiddenTool("Edit", p), false);
});

test("createCliGuard denies an MCP browser tool with a reason", async () => {
  const denied: string[] = [];
  const guard = createCliGuard({ onDeny: (r) => denied.push(r) });
  const hook = preHook(guard);

  const out = await hook({
    hook_event_name: "PreToolUse",
    tool_name: "mcp__playwright-test__browser_click",
  });

  const decision = (
    out as {
      hookSpecificOutput?: {
        permissionDecision?: string;
        permissionDecisionReason?: string;
      };
    }
  ).hookSpecificOutput;
  assert.equal(decision?.permissionDecision, "deny");
  assert.match(decision?.permissionDecisionReason ?? "", /playwright-cli/);
  assert.equal(denied.length, 1);
  assert.deepEqual(guard.stats(), {
    denials: 1,
    blockedTools: ["mcp__playwright-test__browser_click"],
  });
});

test("createCliGuard lets the Bash/CLI path through", async () => {
  const guard = createCliGuard();
  const hook = preHook(guard);

  for (const tool of ["Bash", "Read", "Write", "Edit", "MultiEdit"]) {
    const out = await hook({ hook_event_name: "PreToolUse", tool_name: tool });
    assert.deepEqual(out, { continue: true }, `${tool} should pass`);
  }
  assert.equal(guard.stats().denials, 0);
});

test("createCliGuard ignores non-PreToolUse events", async () => {
  const guard = createCliGuard();
  const hook = preHook(guard);
  const out = await hook({
    hook_event_name: "PostToolUse",
    tool_name: "mcp__playwright-test__browser_click",
  });
  assert.deepEqual(out, { continue: true });
  assert.equal(guard.stats().denials, 0);
});

test("custom forbiddenPrefixes override the default", async () => {
  const guard = createCliGuard({ forbiddenPrefixes: ["browser_"] });
  const hook = preHook(guard);

  const blocked = await hook({
    hook_event_name: "PreToolUse",
    tool_name: "browser_navigate",
  });
  assert.equal(
    (blocked as { hookSpecificOutput?: { permissionDecision?: string } })
      .hookSpecificOutput?.permissionDecision,
    "deny",
  );

  // mcp__ is no longer forbidden under the override.
  const allowed = await hook({
    hook_event_name: "PreToolUse",
    tool_name: "mcp__foo__bar",
  });
  assert.deepEqual(allowed, { continue: true });
});

test("mergeHooks concatenates matchers per event without clobbering", () => {
  const a = { PreToolUse: [{ hooks: ["A"] }] };
  const b = {
    PreToolUse: [{ hooks: ["B"] }],
    PostToolUse: [{ hooks: ["C"] }],
  };
  const merged = mergeHooks(a as never, b as never) as Record<
    string,
    unknown[]
  >;

  assert.deepEqual(merged.PreToolUse, [{ hooks: ["A"] }, { hooks: ["B"] }]);
  assert.deepEqual(merged.PostToolUse, [{ hooks: ["C"] }]);
});

test("mergeHooks tolerates undefined sides", () => {
  const only = { PreToolUse: [{ hooks: ["A"] }] };
  assert.deepEqual(mergeHooks(undefined, only as never), only);
  assert.deepEqual(mergeHooks(only as never, undefined), only);
});
