import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createCrawlGate,
  normalizeUrl,
  parseAllCli,
  parsePageUrl,
  parsePlaywrightCli,
} from "./crawlGate";

// A PreToolUse hook decision for a Bash command: returns the denial reason, or
// null when the command is allowed.
async function denyReason(
  gate: ReturnType<typeof createCrawlGate>,
  command: string,
): Promise<string | null> {
  const pre = gate.hooks?.PreToolUse?.[0].hooks[0];
  assert.ok(pre, "PreToolUse hook is registered");
  const out = await pre(
    {
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: { command },
      tool_use_id: "t",
    } as never,
    "t",
    { signal: new AbortController().signal },
  );
  const sp = (
    out as {
      hookSpecificOutput?: {
        permissionDecision?: string;
        permissionDecisionReason?: string;
      };
    }
  ).hookSpecificOutput;
  return sp?.permissionDecision === "deny"
    ? (sp.permissionDecisionReason ?? "denied")
    : null;
}

// Feed a "Page URL:" observation through the PostToolUse hook (simulates a click
// or redirect landing on a new page).
async function observe(
  gate: ReturnType<typeof createCrawlGate>,
  url: string,
): Promise<void> {
  const post = gate.hooks?.PostToolUse?.[0].hooks[0];
  assert.ok(post);
  await post(
    {
      hook_event_name: "PostToolUse",
      tool_name: "Bash",
      tool_input: { command: "npx playwright-cli snapshot" },
      tool_response: `### Page\n- Page URL: ${url}\n### Snapshot`,
      tool_use_id: "t",
    } as never,
    "t",
    { signal: new AbortController().signal },
  );
}

test("normalizeUrl canonicalizes host/hash/trailing slash, keeps query", () => {
  assert.equal(
    normalizeUrl("https://EXAMPLE.com/a/#x"),
    "https://example.com/a",
  );
  assert.equal(normalizeUrl("https://example.com/"), "https://example.com/");
  assert.equal(
    normalizeUrl("https://example.com/p?q=2"),
    "https://example.com/p?q=2",
  );
  assert.equal(normalizeUrl("not a url"), null);
});

test("parsePlaywrightCli extracts verb past the session flag and the URL arg", () => {
  assert.deepEqual(
    parsePlaywrightCli("npx playwright-cli -s=session1 goto https://x.com/a"),
    {
      verb: "goto",
      urlArg: "https://x.com/a",
      targetRef: "https://x.com/a",
      session: "session1",
    },
  );
  assert.deepEqual(parsePlaywrightCli("npx playwright-cli snapshot"), {
    verb: "snapshot",
    urlArg: undefined,
    targetRef: undefined,
    session: undefined,
  });
  assert.equal(parsePlaywrightCli("echo hello"), null);
});

test("parseAllCli finds every call in a chained command", () => {
  const parsed = parseAllCli(
    "npx playwright-cli open https://x.com && npx playwright-cli snapshot",
  );
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].verb, "open");
  assert.equal(parsed[1].verb, "snapshot");
});

test("parsePageUrl reads the CLI's Page URL line", () => {
  assert.equal(
    parsePageUrl("### Page\n- Page URL: https://x.com/a\n"),
    "https://x.com/a",
  );
  assert.equal(parsePageUrl("no url here"), null);
});

test("non-navigation commands are always allowed", async () => {
  const gate = createCrawlGate({
    mode: "standard",
    maxPages: 5,
    entryUrl: "https://x.com",
  });
  assert.equal(await denyReason(gate, "npx playwright-cli snapshot"), null);
  assert.equal(
    await denyReason(gate, "npx playwright-cli eval '() => 1'"),
    null,
  );
  assert.equal(await denyReason(gate, "ls -la"), null);
});

test("off-site navigation is denied in every mode", async () => {
  const gate = createCrawlGate({
    mode: "aggressive",
    maxPages: 50,
    entryUrl: "https://x.com",
  });
  assert.equal(
    await denyReason(gate, "npx playwright-cli open https://x.com"),
    null,
  );
  const reason = await denyReason(
    gate,
    "npx playwright-cli goto https://evil.com/p",
  );
  assert.match(reason ?? "", /different site/i);
});

test("direct mode denies any navigation away from the entry URL", async () => {
  const gate = createCrawlGate({
    mode: "direct",
    maxPages: 5,
    entryUrl: "https://x.com",
  });
  assert.equal(
    await denyReason(gate, "npx playwright-cli open https://x.com"),
    null,
  );
  const reason = await denyReason(
    gate,
    "npx playwright-cli goto https://x.com/about",
  );
  assert.match(reason ?? "", /direct mode/i);
});

test("depth limit denies going one hop too deep", async () => {
  // standard = depth 1: entry (0) → /a (1) allowed; /a → /b would be depth 2.
  const gate = createCrawlGate({
    mode: "standard",
    maxPages: 10,
    entryUrl: "https://x.com",
  });
  assert.equal(
    await denyReason(gate, "npx playwright-cli open https://x.com"),
    null,
  );
  assert.equal(
    await denyReason(gate, "npx playwright-cli goto https://x.com/a"),
    null,
  );
  const reason = await denyReason(
    gate,
    "npx playwright-cli goto https://x.com/b",
  );
  assert.match(reason ?? "", /depth limit/i);
});

test("page budget denies opening pages beyond the cap", async () => {
  // deep allows depth 3, so depth won't be the limiter; cap pages at 2.
  const gate = createCrawlGate({
    mode: "deep",
    maxPages: 2,
    entryUrl: "https://x.com",
  });
  assert.equal(
    await denyReason(gate, "npx playwright-cli open https://x.com"),
    null,
  ); // page 1
  assert.equal(
    await denyReason(gate, "npx playwright-cli goto https://x.com/a"),
    null,
  ); // page 2
  const reason = await denyReason(
    gate,
    "npx playwright-cli goto https://x.com/a/b",
  );
  assert.match(reason ?? "", /page budget/i);
});

test("a click that lands out of scope blocks all further navigation", async () => {
  const gate = createCrawlGate({
    mode: "direct",
    maxPages: 5,
    entryUrl: "https://x.com",
  });
  await denyReason(gate, "npx playwright-cli open https://x.com"); // record entry
  await observe(gate, "https://x.com"); // confirm entry
  // A click navigates away (direct mode violation) — gate flips to blocked.
  await observe(gate, "https://x.com/somewhere-else");
  assert.equal(gate.stats().blocked, true);
  const reason = await denyReason(
    gate,
    "npx playwright-cli goto https://x.com",
  );
  assert.match(reason ?? "", /budget exhausted/i);
});

test("revisiting an already-seen page does not consume budget", async () => {
  const gate = createCrawlGate({
    mode: "deep",
    maxPages: 1,
    entryUrl: "https://x.com",
  });
  assert.equal(
    await denyReason(gate, "npx playwright-cli open https://x.com"),
    null,
  );
  // Same page again (e.g. reload via goto) — still within the 1-page budget.
  assert.equal(
    await denyReason(gate, "npx playwright-cli goto https://x.com"),
    null,
  );
});
