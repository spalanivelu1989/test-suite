import assert from "node:assert/strict";
import { test } from "node:test";
import { createClaudeClient } from "../claude/client";
import type { GeneratedTest, TestResult } from "../types";
import { healFailures, isLocatorFailure } from "./heal";

test("isLocatorFailure recognizes locator-type errors only", () => {
  assert.equal(isLocatorFailure("locator not found"), true);
  assert.equal(isLocatorFailure("Timed out waiting for selector"), true);
  assert.equal(isLocatorFailure("expect(received).toBe(expected)"), false);
  assert.equal(isLocatorFailure(undefined), false);
});

const FIXED = `import { test, expect } from '@playwright/test';
test('a', async ({ page }) => { await page.goto('https://x.com'); });`;

test("healFailures repairs a locator failure that then passes", async () => {
  const tests: GeneratedTest[] = [
    { flowId: "a", fileName: "a.spec.ts", code: "old", valid: true },
  ];
  const results: TestResult[] = [
    {
      flowId: "a",
      fileName: "a.spec.ts",
      outcome: "failed",
      failureReason: "locator not found",
    },
  ];
  const claude = createClaudeClient({
    sdk: {
      messages: {
        create: async () => ({ content: [{ type: "text", text: FIXED }] }),
      },
    },
  });
  const runOnce = async () => [
    { flowId: "a", fileName: "a.spec.ts", outcome: "passed" as const },
  ];

  const { results: out, healSuccessRate } = await healFailures(
    tests,
    results,
    claude,
    runOnce,
  );
  assert.equal(out[0].outcome, "healed");
  assert.equal(out[0].healed, true);
  assert.equal(healSuccessRate, 1);
});

test("healFailures leaves non-locator failures untouched", async () => {
  const tests: GeneratedTest[] = [
    { flowId: "a", fileName: "a.spec.ts", code: "x", valid: true },
  ];
  const results: TestResult[] = [
    {
      flowId: "a",
      fileName: "a.spec.ts",
      outcome: "failed",
      failureReason: "assertion mismatch",
    },
  ];
  const claude = createClaudeClient({
    sdk: {
      messages: {
        create: async () => ({ content: [{ type: "text", text: FIXED }] }),
      },
    },
  });
  const { results: out, healSuccessRate } = await healFailures(
    tests,
    results,
    claude,
    async () => [],
  );
  assert.equal(out[0].outcome, "failed");
  assert.equal(healSuccessRate, 0);
  assert.equal(claude.calls.length, 0);
});
