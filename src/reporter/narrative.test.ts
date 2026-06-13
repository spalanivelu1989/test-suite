import assert from "node:assert/strict";
import { test } from "node:test";
import { createClaudeClient } from "../claude/client";
import type { TestResult } from "../types";
import {
  generateNarrative,
  narrativeMaxTokens,
  parseNarrative,
} from "./narrative";

test("parseNarrative extracts fixPrompts/issues/recommendations from fenced JSON", () => {
  const text =
    'Here:\n```json\n{"fixPrompts":[{"test":"contact","problem":"selector missing","change":"use getByRole"}],"issues":["form has no validation"],"recommendations":["add aria labels"],"better":"some gap","recommendationsText":"some action","summary":["user can submit forms"],"testSummary":"3 passed, 1 failed (75%)."}\n```';
  const n = parseNarrative(text);
  assert.equal(n.fixPrompts.length, 1);
  assert.equal(n.fixPrompts[0].test, "contact");
  assert.deepEqual(n.issues, ["form has no validation"]);
  assert.deepEqual(n.recommendations, ["add aria labels"]);
  assert.equal(n.better, "some gap");
  assert.equal(n.recommendationsText, "some action");
  assert.deepEqual(n.summary, ["user can submit forms"]);
  assert.equal(n.testSummary, "3 passed, 1 failed (75%).");
});

test("parseNarrative returns empty structure on garbage", () => {
  const n = parseNarrative("no json");
  assert.deepEqual(n, {
    fixPrompts: [],
    issues: [],
    recommendations: [],
    better: "",
    recommendationsText: "",
    summary: [],
    testSummary: "",
  });
});

test("generateNarrative calls Claude and parses the response", async () => {
  const claude = createClaudeClient({
    sdk: {
      messages: {
        create: async () => ({
          content: [
            {
              type: "text",
              text: '{"fixPrompts":[],"issues":["slow page"],"recommendations":["cache assets"],"better":"performance lag","recommendationsText":"optimise build","summary":["tested routing"],"testSummary":"1 failed (0%)."}',
            },
          ],
        }),
      },
    },
  });
  const results: TestResult[] = [
    { flowId: "a", fileName: "a.spec.ts", outcome: "failed" },
  ];
  const n = await generateNarrative(results, [], claude);
  assert.deepEqual(n.issues, ["slow page"]);
  assert.equal(n.better, "performance lag");
  assert.equal(n.recommendationsText, "optimise build");
  assert.deepEqual(n.summary, ["tested routing"]);
  assert.equal(n.testSummary, "1 failed (0%).");
  // A usable response on the first attempt → exactly one call, no retry.
  assert.equal(claude.calls.length, 1);
  assert.equal(claude.calls[0].purpose, "report-narrative");
});

test("generateNarrative retries once when the first response is unparseable", async () => {
  let attempt = 0;
  const claude = createClaudeClient({
    sdk: {
      messages: {
        create: async () => {
          attempt += 1;
          // First attempt: garbage (no JSON). Second: a valid narrative.
          const text =
            attempt === 1
              ? "the model rambled and produced no json"
              : '{"fixPrompts":[],"issues":[],"recommendations":[],"better":"","recommendationsText":"","summary":["tested routing"],"testSummary":"1 passed (100%)."}';
          return { content: [{ type: "text", text }] };
        },
      },
    },
  });
  const events: string[] = [];
  const results: TestResult[] = [
    { flowId: "a", fileName: "a.spec.ts", outcome: "passed" },
  ];
  const n = await generateNarrative(
    results,
    [],
    claude,
    "https://example.com",
    {
      onEvent: (m) => events.push(m),
    },
  );
  assert.equal(n.testSummary, "1 passed (100%).");
  assert.deepEqual(n.summary, ["tested routing"]);
  assert.equal(claude.calls.length, 2); // retried exactly once
  assert.equal(events.length, 1); // one "retrying" notice, no final-failure notice
  assert.match(events[0], /retr/i);
});

test("generateNarrative emits a failure event and returns empty after all attempts fail", async () => {
  const claude = createClaudeClient({
    sdk: {
      messages: {
        create: async () => ({
          content: [{ type: "text", text: "still no json here" }],
        }),
      },
    },
  });
  const events: string[] = [];
  const results: TestResult[] = [
    { flowId: "a", fileName: "a.spec.ts", outcome: "passed" },
  ];
  const n = await generateNarrative(results, [], claude, undefined, {
    onEvent: (m) => events.push(m),
  });
  assert.equal(n.testSummary, "");
  assert.deepEqual(n.summary, []);
  assert.equal(claude.calls.length, 2); // first attempt + one retry
  // A retry notice plus a final "no summary" notice.
  assert.equal(events.length, 2);
  assert.match(events[events.length - 1], /no summary/i);
});

test("generateNarrative recovers and emits when the Claude call throws", async () => {
  let attempt = 0;
  const claude = createClaudeClient({
    sdk: {
      messages: {
        create: async () => {
          attempt += 1;
          if (attempt === 1) throw new Error("network blip");
          return {
            content: [
              {
                type: "text",
                text: '{"fixPrompts":[],"issues":[],"recommendations":[],"better":"","recommendationsText":"","summary":[],"testSummary":"1 passed (100%)."}',
              },
            ],
          };
        },
      },
    },
  });
  const events: string[] = [];
  const results: TestResult[] = [
    { flowId: "a", fileName: "a.spec.ts", outcome: "passed" },
  ];
  const n = await generateNarrative(results, [], claude, undefined, {
    onEvent: (m) => events.push(m),
  });
  assert.equal(n.testSummary, "1 passed (100%).");
  assert.equal(claude.calls.length, 2);
  assert.equal(events.length, 1);
  assert.match(events[0], /failed/i);
});

test("narrativeMaxTokens scales with test count and is capped", () => {
  assert.equal(narrativeMaxTokens(0), 4096);
  assert.equal(narrativeMaxTokens(10), 4096 + 10 * 600);
  // Ceiling holds for very large suites.
  assert.equal(narrativeMaxTokens(1000), 16000);
});

test("generateNarrative skips the call for an empty suite", async () => {
  const claude = createClaudeClient({
    sdk: {
      messages: {
        create: async () => ({ content: [{ type: "text", text: "{}" }] }),
      },
    },
  });
  const n = await generateNarrative([], [], claude);
  assert.equal(claude.calls.length, 0);
  assert.deepEqual(n.fixPrompts, []);
});

test("parseNarrative repairs truncated JSON output", () => {
  const truncatedText =
    'Here:\n```json\n{"fixPrompts":[],"issues":["slow page"],"better":"performance lag","recommendationsText":"optimise build","summary":["tested routing"';
  const n = parseNarrative(truncatedText);
  assert.deepEqual(n.issues, ["slow page"]);
  assert.equal(n.better, "performance lag");
  assert.equal(n.recommendationsText, "optimise build");
  assert.deepEqual(n.summary, ["tested routing"]);
});

test("parseNarrative repairs key-truncated JSON output by falling back to last complete key-value pair", () => {
  const truncatedText =
    '{"fixPrompts":[],"issues":["slow page"],"better":"performance lag","recommendationsText":"optimise build","summary';
  const n = parseNarrative(truncatedText);
  assert.deepEqual(n.issues, ["slow page"]);
  assert.equal(n.better, "performance lag");
  assert.equal(n.recommendationsText, "optimise build");
  assert.deepEqual(n.summary, []);
});
