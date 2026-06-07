import assert from "node:assert/strict";
import { test } from "node:test";
import type { TestResult } from "../../types";
import { captureHealDeltas, diffHunks } from "./captureHeal";

const ctx = { runId: "r1", appId: "https://tarento.com" };

test("diffHunks: pairs removed/added lines, ignores unchanged + whitespace-only", () => {
  const hunks = diffHunks(
    "import x;\nawait page.locator('#a').click();\nexpect(true);",
    "import x;\nawait page.getByRole('button').click();\nexpect(true);",
  );
  assert.equal(hunks.length, 1);
  assert.ok(hunks[0].before.includes("locator('#a')"));
  assert.ok(hunks[0].after.includes("getByRole"));
});

test("diffHunks: identical text → no hunks", () => {
  assert.deepEqual(diffHunks("a\nb\nc", "a\nb\nc"), []);
});

test("captureHealDeltas: one event per changed hunk in a healed spec (AC1)", () => {
  const pre = [
    {
      file: "tests/home.spec.ts",
      code: "await page.locator('#btn-7f3a').click();",
    },
  ];
  const post = [
    {
      file: "tests/home.spec.ts",
      code: "await page.getByRole('button', { name: 'Send' }).click();",
    },
  ];
  const results: TestResult[] = [
    {
      flowId: "home",
      fileName: "home.spec.ts",
      outcome: "healed",
      failureReason:
        "TimeoutError: locator '#btn-7f3a' not found (home.spec.ts:1:7)",
      healed: true,
    },
  ];
  const events = captureHealDeltas(pre, post, results, ctx);
  assert.equal(events.length, 1);
  const e = events[0];
  assert.equal(e.runId, "r1");
  assert.equal(e.appId, ctx.appId);
  assert.equal(e.flowId, "home");
  assert.equal(e.strategy, "role-locator");
  assert.equal(e.outcome, "healed");
  assert.ok(e.before.includes("locator"));
  assert.ok(e.after.includes("getByRole"));
  assert.ok(e.failureSignature.includes("timeouterror"));
  assert.ok((e.tokens ?? []).includes("locator"));
});

test("captureHealDeltas: unchanged spec → no events", () => {
  const spec = [{ file: "a.spec.ts", code: "expect(1).toBe(1);" }];
  const results: TestResult[] = [
    { flowId: "a", fileName: "a.spec.ts", outcome: "passed" },
  ];
  assert.deepEqual(captureHealDeltas(spec, spec, results, ctx), []);
});

test("captureHealDeltas: changed spec but passing/irrelevant result → skipped", () => {
  const pre = [{ file: "a.spec.ts", code: "const a = 1;" }];
  const post = [{ file: "a.spec.ts", code: "const a = 2;" }];
  const results: TestResult[] = [
    { flowId: "a", fileName: "a.spec.ts", outcome: "passed" }, // no failure
  ];
  assert.deepEqual(captureHealDeltas(pre, post, results, ctx), []);
});

test("captureHealDeltas: quarantined test → outcome fixme, strategy fixme", () => {
  const pre = [
    { file: "b.spec.ts", code: "await page.locator('#x').click();" },
  ];
  const post = [
    { file: "b.spec.ts", code: "test.fixme(); // genuine upstream failure" },
  ];
  const results: TestResult[] = [
    {
      flowId: "b",
      fileName: "b.spec.ts",
      outcome: "fixme",
      failureReason: "boom",
    },
  ];
  const events = captureHealDeltas(pre, post, results, ctx);
  assert.equal(events.length, 1);
  assert.equal(events[0].outcome, "fixme");
  assert.equal(events[0].strategy, "fixme");
});

test("captureHealDeltas: new spec with no pre counterpart → skipped (heals modify existing)", () => {
  const post = [{ file: "new.spec.ts", code: "expect(1).toBe(2);" }];
  const results: TestResult[] = [
    {
      flowId: "n",
      fileName: "new.spec.ts",
      outcome: "failed",
      failureReason: "x",
    },
  ];
  assert.deepEqual(captureHealDeltas([], post, results, ctx), []);
});
