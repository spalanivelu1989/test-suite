import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeFailure, signatureTokens } from "./signature";

test("normalizeFailure: empty/nullish → ''", () => {
  assert.equal(normalizeFailure(null), "");
  assert.equal(normalizeFailure(undefined), "");
  assert.equal(normalizeFailure(""), "");
});

test("normalizeFailure: two reasons differing only in dynamic ids/lines/timestamps collapse (AC3)", () => {
  const a = normalizeFailure(
    "TimeoutError: locator '#btn-7f3a2' not found (app.spec.ts:42:13) @ 2026-06-07T12:04:55Z",
  );
  const b = normalizeFailure(
    "TimeoutError: locator '#btn-9c2b8' not found (app.spec.ts:88:5) @ 2026-06-07T13:31:02Z",
  );
  assert.equal(a, b);
  assert.ok(a.includes("timeouterror"));
  assert.ok(a.includes("locator"));
  assert.ok(a.includes("not found"));
  // no digits or hex survive
  assert.ok(!/\d/.test(a));
});

test("normalizeFailure: strips uuids, absolute paths, and clock times", () => {
  const s = normalizeFailure(
    "Error at /Users/x/proj/tests/home.spec.ts handle 550e8400-e29b-41d4-a716-446655440000 failed 09:15:00",
  );
  assert.ok(!s.includes("users"));
  assert.ok(!/[0-9a-f]{8}-/.test(s));
  assert.ok(s.includes("error"));
  assert.ok(s.includes("failed"));
});

test("normalizeFailure: genuinely different failures stay distinct", () => {
  const timeout = normalizeFailure("TimeoutError: locator not found");
  const assertion = normalizeFailure("expect(received).toHaveText mismatch");
  assert.notEqual(timeout, assertion);
});

test("signatureTokens: significant tokens only (len>3)", () => {
  const toks = signatureTokens("timeouterror locator not found");
  assert.ok(toks.includes("timeouterror"));
  assert.ok(toks.includes("locator"));
  assert.ok(toks.includes("found"));
  assert.ok(!toks.includes("not")); // length 3 dropped
});
