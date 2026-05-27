import assert from "node:assert/strict";
import { test } from "node:test";
import { createClaudeClient } from "../claude/client";
import type { TestResult } from "../types";
import { generateNarrative, parseNarrative } from "./narrative";

test("parseNarrative extracts fixPrompts/issues/recommendations from fenced JSON", () => {
  const text =
    'Here:\n```json\n{"fixPrompts":[{"test":"contact","problem":"selector missing","change":"use getByRole"}],"issues":["form has no validation"],"recommendations":["add aria labels"]}\n```';
  const n = parseNarrative(text);
  assert.equal(n.fixPrompts.length, 1);
  assert.equal(n.fixPrompts[0].test, "contact");
  assert.deepEqual(n.issues, ["form has no validation"]);
  assert.deepEqual(n.recommendations, ["add aria labels"]);
});

test("parseNarrative returns empty structure on garbage", () => {
  const n = parseNarrative("no json");
  assert.deepEqual(n, { fixPrompts: [], issues: [], recommendations: [] });
});

test("generateNarrative calls Claude and parses the response", async () => {
  const claude = createClaudeClient({
    sdk: {
      messages: {
        create: async () => ({
          content: [
            {
              type: "text",
              text: '{"fixPrompts":[],"issues":["slow page"],"recommendations":["cache assets"]}',
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
  assert.equal(claude.calls[0].purpose, "report-narrative");
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
