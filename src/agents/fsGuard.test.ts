import assert from "node:assert/strict";
import { test } from "node:test";
import { join } from "node:path";
import { bashPathEscape, createFsGuard, isWithinRoot } from "./fsGuard";

const ROOT = "/work/.runs/run-1";

// The guard's PreToolUse hook is the first (only) callback in its config.
function preHook(guard: ReturnType<typeof createFsGuard>) {
  const matchers = (guard.hooks as { PreToolUse: { hooks: Function[] }[] })
    .PreToolUse;
  return matchers[0].hooks[0] as (
    input: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
}

function decisionOf(out: Record<string, unknown>): string | undefined {
  return (
    out as {
      hookSpecificOutput?: { permissionDecision?: string };
    }
  ).hookSpecificOutput?.permissionDecision;
}

test("isWithinRoot accepts the root and its descendants", () => {
  assert.equal(isWithinRoot(ROOT, ROOT), true);
  assert.equal(isWithinRoot(ROOT, "tests/foo.spec.ts"), true);
  assert.equal(isWithinRoot(ROOT, "./tests/foo.spec.ts"), true);
  assert.equal(isWithinRoot(ROOT, join(ROOT, "tests/foo.spec.ts")), true);
  // A descendant reached via an absolute path is still in scope.
  assert.equal(isWithinRoot(ROOT, `${ROOT}/screenshots/a.png`), true);
});

test("isWithinRoot rejects parent traversal, siblings, absolute and home paths", () => {
  assert.equal(isWithinRoot(ROOT, ".."), false);
  assert.equal(isWithinRoot(ROOT, "../run-2/tests/x.spec.ts"), false);
  assert.equal(isWithinRoot(ROOT, "tests/../../run-2/x"), false);
  assert.equal(isWithinRoot(ROOT, "/work/.migration-runs/m/tests/x"), false);
  assert.equal(isWithinRoot(ROOT, "/etc/passwd"), false);
  assert.equal(isWithinRoot(ROOT, "~"), false);
  assert.equal(isWithinRoot(ROOT, "~/secrets"), false);
});

test("bashPathEscape flags only out-of-tree path tokens", () => {
  // In-scope or non-path commands pass (returns null).
  assert.equal(bashPathEscape("npx playwright test", ROOT), null);
  assert.equal(
    bashPathEscape("npx playwright test tests/foo.spec.ts", ROOT),
    null,
  );
  assert.equal(bashPathEscape("ls tests && cat tests/a.ts", ROOT), null);
  assert.equal(
    bashPathEscape("npx playwright-cli goto https://example.com", ROOT),
    null,
  );
  // Escapes are caught.
  assert.equal(
    bashPathEscape("cat ../run-2/tests/x.spec.ts", ROOT),
    "../run-2/tests/x.spec.ts",
  );
  assert.equal(bashPathEscape("ls ..", ROOT), "..");
  assert.equal(
    bashPathEscape("grep -r TCO /work/.runs/run-2", ROOT),
    "/work/.runs/run-2",
  );
  assert.equal(
    bashPathEscape("cat ~/.aws/credentials", ROOT),
    "~/.aws/credentials",
  );
});

test("guard denies Read outside the workspace, allows inside", async () => {
  const denied: string[] = [];
  const guard = createFsGuard({
    workspaceRoot: ROOT,
    onDeny: (r) => denied.push(r),
  });
  const hook = preHook(guard);

  const out = await hook({
    hook_event_name: "PreToolUse",
    tool_name: "Read",
    tool_input: { file_path: "../run-2/tests/leak.spec.ts" },
  });
  assert.equal(decisionOf(out), "deny");
  assert.equal(denied.length, 1);

  const ok = await hook({
    hook_event_name: "PreToolUse",
    tool_name: "Read",
    tool_input: { file_path: "tests/own.spec.ts" },
  });
  assert.equal(decisionOf(ok), undefined);
  assert.equal((ok as { continue?: boolean }).continue, true);
});

test("guard denies a Bash command that reaches a sibling run dir", async () => {
  const guard = createFsGuard({ workspaceRoot: ROOT });
  const hook = preHook(guard);

  const out = await hook({
    hook_event_name: "PreToolUse",
    tool_name: "Bash",
    tool_input: { command: "grep -rn TCO ../../.migration-runs" },
  });
  assert.equal(decisionOf(out), "deny");
  assert.equal(guard.stats().denials, 1);
});

test("guard lets the Tester's own suite run pass", async () => {
  const guard = createFsGuard({ workspaceRoot: ROOT });
  const hook = preHook(guard);

  const out = await hook({
    hook_event_name: "PreToolUse",
    tool_name: "Bash",
    tool_input: {
      command: "npx playwright test tests/own.spec.ts --reporter=list",
    },
  });
  assert.equal((out as { continue?: boolean }).continue, true);
  assert.equal(guard.stats().denials, 0);
});
