import assert from "node:assert/strict";
import { test } from "node:test";
import type { TestResult } from "../types";
import { classifySpec, isInfraFailure, targetOutcomeOf } from "./classify";

test("isInfraFailure flags auth/network failures", () => {
  assert.equal(
    isInfraFailure("Redirected to login page, sign in required"),
    true,
  );
  assert.equal(isInfraFailure("XSUAA session expired"), true);
  assert.equal(
    isInfraFailure("Request failed with status 401 Unauthorized"),
    true,
  );
  assert.equal(isInfraFailure("net::ERR_CONNECTION_REFUSED"), true);
  assert.equal(isInfraFailure("getaddrinfo ENOTFOUND host"), true);
});

test("isInfraFailure does NOT flag locator/element failures (real regressions)", () => {
  // A locator timeout means the element is gone — that's behavioral, not infra.
  assert.equal(
    isInfraFailure(
      "TimeoutError: locator.click: waiting for getByRole('button', { name: 'Export' })",
    ),
    false,
  );
  assert.equal(isInfraFailure("expect(received).toBeVisible() failed"), false);
  assert.equal(isInfraFailure(undefined), false);
});

test("targetOutcomeOf collapses outcomes", () => {
  const r = (o: TestResult["outcome"], flaky = false): TestResult => ({
    flowId: "f",
    fileName: "f.spec.ts",
    outcome: o,
    flaky,
  });
  assert.equal(targetOutcomeOf(r("passed")), "passed");
  assert.equal(targetOutcomeOf(r("healed")), "passed");
  assert.equal(targetOutcomeOf(r("flaky")), "flaky");
  assert.equal(targetOutcomeOf(r("passed", true)), "flaky"); // flaky flag wins
  assert.equal(targetOutcomeOf(r("failed")), "failed");
  assert.equal(targetOutcomeOf(r("fixme")), "failed");
  assert.equal(targetOutcomeOf(undefined), "failed");
});

test("classifySpec: passed on target → ok", () => {
  assert.equal(
    classifySpec({ sourceOutcome: "passed", targetOutcome: "passed" }),
    "ok",
  );
});

test("classifySpec: flaky → flaky", () => {
  assert.equal(
    classifySpec({ sourceOutcome: "passed", targetOutcome: "flaky" }),
    "flaky",
  );
});

test("classifySpec: auth failure → infra", () => {
  assert.equal(
    classifySpec({
      sourceOutcome: "passed",
      targetOutcome: "failed",
      failureReason: "redirected to SSO login",
    }),
    "infra",
  );
});

test("classifySpec: passed on source, real failure on target → behavioral", () => {
  assert.equal(
    classifySpec({
      sourceOutcome: "passed",
      targetOutcome: "failed",
      failureReason: "locator.click: waiting for getByRole('button')",
    }),
    "behavioral",
  );
});

test("classifySpec: passed on target but needed a fix → healed (surface, don't trust)", () => {
  assert.equal(
    classifySpec({
      sourceOutcome: "passed",
      targetOutcome: "passed",
      healed: true,
    }),
    "healed",
  );
});

test("classifySpec: healed flag is ignored when the spec still failed", () => {
  assert.equal(
    classifySpec({
      sourceOutcome: "passed",
      targetOutcome: "failed",
      failureReason: "locator.click: waiting for getByRole('button')",
      healed: true,
    }),
    "behavioral",
  );
});

test("classifySpec: failed on source too → pre-existing (not a migration regression)", () => {
  assert.equal(
    classifySpec({
      sourceOutcome: "failed",
      targetOutcome: "failed",
      failureReason: "expect(...).toBeVisible() failed",
    }),
    "pre-existing",
  );
});
