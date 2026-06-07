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

test("captureHealDeltas: signature from the INITIAL failure; one event per hunk (AC1)", () => {
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
  // Pre-heal: the test FAILED with a reason. Post-heal: it now passes (healed).
  const initial: TestResult[] = [
    {
      flowId: "home",
      fileName: "home.spec.ts",
      outcome: "failed",
      failureReason:
        "TimeoutError: locator '#btn-7f3a' not found (home.spec.ts:1:7)",
    },
  ];
  const final: TestResult[] = [
    {
      flowId: "home",
      fileName: "home.spec.ts",
      outcome: "healed",
      healed: true,
    },
  ];
  const events = captureHealDeltas(pre, post, initial, final, ctx);
  assert.equal(events.length, 1);
  const e = events[0];
  assert.equal(e.flowId, "home");
  assert.equal(e.strategy, "role-locator");
  assert.equal(e.outcome, "healed");
  assert.ok(e.after.includes("getByRole"));
  assert.ok(e.failureSignature.includes("timeouterror"));
  assert.ok((e.tokens ?? []).includes("locator"));
});

test("captureHealDeltas: REGRESSION — healed test that reads 'passed' post-heal is still captured with a real signature", () => {
  // This is run 32a232e6's bug: the heal succeeded so the FINAL outcome is
  // 'passed' with no reason; the signature must still come from the INITIAL
  // failure, and the event must NOT be dropped.
  const pre = [{ file: "svc.spec.ts", code: "page.locator('#x').click();" }];
  const post = [
    { file: "svc.spec.ts", code: "page.getByRole('link').click();" },
  ];
  const initial: TestResult[] = [
    {
      flowId: "services",
      fileName: "svc.spec.ts",
      outcome: "failed",
      failureReason: "Error: strict mode violation, locator '#x' resolved to 3",
    },
  ];
  const final: TestResult[] = [
    { flowId: "services", fileName: "svc.spec.ts", outcome: "passed" }, // reads passed!
  ];
  const events = captureHealDeltas(pre, post, initial, final, ctx);
  assert.equal(events.length, 1, "a successful heal must still be captured");
  assert.equal(events[0].outcome, "healed");
  assert.ok(
    events[0].failureSignature.length > 0,
    "signature must not be empty",
  );
  assert.ok(events[0].failureSignature.includes("strict"));
});

test("captureHealDeltas: unchanged spec → no events", () => {
  const spec = [{ file: "a.spec.ts", code: "expect(1).toBe(1);" }];
  const init: TestResult[] = [
    { flowId: "a", fileName: "a.spec.ts", outcome: "passed" },
  ];
  assert.deepEqual(captureHealDeltas(spec, spec, init, init, ctx), []);
});

test("captureHealDeltas: changed spec that was already passing (proactive edit) → skipped", () => {
  const pre = [{ file: "a.spec.ts", code: "const a = 1;" }];
  const post = [{ file: "a.spec.ts", code: "const a = 2;" }];
  const passing: TestResult[] = [
    { flowId: "a", fileName: "a.spec.ts", outcome: "passed" }, // never failed
  ];
  assert.deepEqual(captureHealDeltas(pre, post, passing, passing, ctx), []);
});

test("captureHealDeltas: quarantined test → outcome fixme, strategy fixme", () => {
  const pre = [
    { file: "b.spec.ts", code: "await page.locator('#x').click();" },
  ];
  const post = [
    { file: "b.spec.ts", code: "test.fixme(); // genuine upstream failure" },
  ];
  const initial: TestResult[] = [
    {
      flowId: "b",
      fileName: "b.spec.ts",
      outcome: "failed",
      failureReason: "boom",
    },
  ];
  const final: TestResult[] = [
    { flowId: "b", fileName: "b.spec.ts", outcome: "fixme" },
  ];
  const events = captureHealDeltas(pre, post, initial, final, ctx);
  assert.equal(events.length, 1);
  assert.equal(events[0].outcome, "fixme");
  assert.equal(events[0].strategy, "fixme");
});

test("captureHealDeltas: new spec with no pre counterpart → skipped (heals modify existing)", () => {
  const post = [{ file: "new.spec.ts", code: "expect(1).toBe(2);" }];
  const initial: TestResult[] = [
    {
      flowId: "n",
      fileName: "new.spec.ts",
      outcome: "failed",
      failureReason: "x",
    },
  ];
  assert.deepEqual(captureHealDeltas([], post, initial, initial, ctx), []);
});
