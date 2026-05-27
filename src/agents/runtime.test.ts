import assert from "node:assert/strict";
import { test } from "node:test";
import { type AgentEvent, parseAgentFile, runAgent } from "./runtime";

const SAMPLE = `---
name: playwright-test-planner
description: Plans tests
tools: Read, mcp__playwright-test__browser_navigate, mcp__playwright-test__planner_save_plan
model: sonnet
---

You are a planner. Explore and save a plan.`;

test("parseAgentFile splits frontmatter and body", () => {
  const def = parseAgentFile(SAMPLE);
  assert.equal(def.name, "playwright-test-planner");
  assert.equal(def.model, "sonnet");
  assert.deepEqual(def.tools, [
    "Read",
    "mcp__playwright-test__browser_navigate",
    "mcp__playwright-test__planner_save_plan",
  ]);
  assert.match(def.systemPrompt, /You are a planner/);
});

test("parseAgentFile throws without frontmatter", () => {
  assert.throws(() => parseAgentFile("no frontmatter here"));
});

// Fake SDK query: yields one assistant message (text + tool_use) then a result.
function fakeQuery(messages: unknown[]) {
  return (() => {
    async function* gen() {
      for (const m of messages) yield m;
    }
    return gen();
  }) as never;
}

test("runAgent streams events, collects tool calls and result", async () => {
  const events: AgentEvent[] = [];
  const messages = [
    {
      type: "assistant",
      message: {
        content: [
          { type: "text", text: "exploring" },
          { type: "tool_use", name: "mcp__playwright-test__browser_navigate" },
          { type: "tool_use", name: "mcp__playwright-test__planner_save_plan" },
        ],
      },
    },
    { type: "result", subtype: "success", result: "plan saved" },
  ];

  const out = await runAgent({
    agent: parseAgentFile(SAMPLE),
    prompt: "plan https://x.com",
    cwd: "/tmp/run",
    onEvent: (e) => events.push(e),
    queryFn: fakeQuery(messages),
  });

  assert.equal(out.isError, false);
  assert.equal(out.resultText, "plan saved");
  assert.deepEqual(out.toolCalls, [
    "mcp__playwright-test__browser_navigate",
    "mcp__playwright-test__planner_save_plan",
  ]);
  assert.ok(events.some((e) => e.kind === "tool"));
  assert.ok(events.some((e) => e.kind === "result" && !e.isError));
});

test("runAgent flags an error result", async () => {
  const out = await runAgent({
    agent: parseAgentFile(SAMPLE),
    prompt: "x",
    cwd: "/tmp/run",
    queryFn: fakeQuery([
      { type: "result", subtype: "error_max_turns", result: "" },
    ]),
  });
  assert.equal(out.isError, true);
});
