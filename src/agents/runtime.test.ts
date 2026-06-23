import assert from "node:assert/strict";
import { test } from "node:test";
import { type AgentEvent, parseAgentFile, runAgent } from "./runtime";

const SAMPLE = `---
name: playwright-test-discoverer
description: Plans tests
tools: Read, Bash, Write
model: sonnet
---

You are a discoverer. Explore and save a plan.`;

test("parseAgentFile splits frontmatter and body", () => {
  const def = parseAgentFile(SAMPLE);
  assert.equal(def.name, "playwright-test-discoverer");
  assert.equal(def.model, "sonnet");
  assert.deepEqual(def.tools, ["Read", "Bash", "Write"]);
  assert.match(def.systemPrompt, /You are a discoverer/);
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
          { type: "tool_use", name: "Bash" },
          { type: "tool_use", name: "Write" },
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
  assert.deepEqual(out.toolCalls, ["Bash", "Write"]);
  assert.ok(events.some((e) => e.kind === "tool"));
  assert.ok(events.some((e) => e.kind === "result" && !e.isError));
});

test("runAgent survives a thrown iterator (maxTurns), preserving partial work", async () => {
  const events: AgentEvent[] = [];
  // SDK yields tool calls, then rejects the iterator (subprocess exited
  // non-zero on maxTurns) rather than emitting a clean result message.
  const throwingQuery = (() => {
    async function* gen() {
      yield {
        type: "assistant",
        message: {
          content: [
            {
              type: "tool_use",
              name: "Write",
            },
          ],
        },
      };
      throw new Error(
        "Claude Code returned an error result: Reached maximum number of turns (150)",
      );
    }
    return gen();
  }) as never;

  const out = await runAgent({
    agent: parseAgentFile(SAMPLE),
    prompt: "generate",
    cwd: "/tmp/run",
    onEvent: (e) => events.push(e),
    queryFn: throwingQuery,
  });

  assert.equal(out.isError, true);
  assert.match(out.resultText, /maximum number of turns/);
  assert.deepEqual(out.toolCalls, ["Write"]);
  assert.ok(events.some((e) => e.kind === "result" && e.isError));
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

// Regression for run 928c24b7…: the Tester finished its work but the SDK stream
// never delivered a terminal `result` and never closed (a lingering browser
// child held stdio open), so `for await` blocked forever. The idle guard must
// abort and return instead of hanging.
test("runAgent: idle guard aborts a never-terminating stream (no hang)", async () => {
  // Yields one message, then hangs until aborted — never emits a `result`.
  const hangingQuery = ((args: {
    options: { abortController: AbortController };
  }) => {
    const signal = args.options.abortController.signal;
    async function* gen() {
      yield {
        type: "assistant",
        message: { content: [{ type: "text", text: "working" }] },
      };
      await new Promise<void>((_, reject) => {
        if (signal.aborted) return reject(new Error("aborted"));
        signal.addEventListener("abort", () => reject(new Error("aborted")));
      });
    }
    return gen();
  }) as never;

  const out = await runAgent({
    agent: parseAgentFile(SAMPLE),
    prompt: "heal",
    cwd: "/tmp/run",
    queryFn: hangingQuery,
    idleTimeoutMs: 40, // 40ms of silence → abort
  });

  assert.equal(out.timedOut, true);
  assert.equal(out.isError, true);
  assert.match(out.resultText, /no activity/);
});

test("runAgent: hard duration cap aborts a stream that streams forever", async () => {
  // Streams a tool event every 10ms forever — idle never trips; the wall-clock
  // cap must stop it.
  const steadyQuery = ((args: {
    options: { abortController: AbortController };
  }) => {
    const signal = args.options.abortController.signal;
    async function* gen() {
      while (!signal.aborted) {
        yield {
          type: "assistant",
          message: { content: [{ type: "tool_use", name: "Bash" }] },
        };
        await new Promise<void>((res, reject) => {
          const t = setTimeout(res, 10);
          signal.addEventListener("abort", () => {
            clearTimeout(t);
            reject(new Error("aborted"));
          });
        });
      }
      throw new Error("aborted");
    }
    return gen();
  }) as never;

  const out = await runAgent({
    agent: parseAgentFile(SAMPLE),
    prompt: "heal",
    cwd: "/tmp/run",
    queryFn: steadyQuery,
    idleTimeoutMs: Infinity, // idle disabled — only the hard cap can stop it
    maxDurationMs: 60,
  });

  assert.equal(out.timedOut, true);
  assert.match(out.resultText, /exceeded/);
});

test("runAgent: a clean stream is not flagged as timed out", async () => {
  const out = await runAgent({
    agent: parseAgentFile(SAMPLE),
    prompt: "x",
    cwd: "/tmp/run",
    queryFn: fakeQuery([{ type: "result", subtype: "success", result: "ok" }]),
    idleTimeoutMs: 1000,
  });
  assert.equal(out.isError, false);
  assert.notEqual(out.timedOut, true);
});
