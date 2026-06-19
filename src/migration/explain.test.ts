import assert from "node:assert/strict";
import { test } from "node:test";
import {
  describeLocator,
  explainFailure,
  extractLocatorTarget,
  heuristicExplain,
  type ExplainInput,
} from "./explain";

function input(over: Partial<ExplainInput> = {}): ExplainInput {
  return {
    title: "Some test",
    file: "a.spec.ts",
    sourceOutcome: "passed",
    targetOutcome: "failed",
    classification: "behavioral",
    ...over,
  };
}

test("extractLocatorTarget pulls the role name, text, or null", () => {
  assert.equal(
    extractLocatorTarget("getByRole('button', { name: 'iVolve Migration' })"),
    "iVolve Migration",
  );
  assert.equal(
    extractLocatorTarget("getByText('Interface Count Calculator')"),
    "Interface Count Calculator",
  );
  assert.equal(extractLocatorTarget("Test timeout of 30000ms exceeded"), null);
});

test("describeLocator resolves the INNERMOST target, not the outer scope", () => {
  // The failing element is the spinbutton; 'Percent (%)' is only the container.
  const d = describeLocator(
    "getByRole('tabpanel', { name: 'Percent (%)' }).getByRole('spinbutton')",
  );
  assert.equal(d.target, "number field");
  assert.equal(d.targetKind, "role");
  assert.equal(d.scope, "Percent (%)");
  assert.equal(d.chained, true);
});

test("heuristicExplain: element not found names the element + hedges the cause", () => {
  const e = heuristicExplain(
    input({
      failureReason:
        "expect(locator).toBeVisible() failed Locator: getByRole('button', { name: 'Export' }) element(s) not found",
      buildMismatch: true,
    }),
  );
  assert.match(e.summary, /Export/);
  // Must NOT assert "renamed, moved, or removed" as the confident single cause.
  assert.doesNotMatch(e.why, /renamed, moved, or removed/);
  assert.match(e.why, /missing|different label|not rendered/i);
  assert.match(e.why, /different build/);
  assert.equal(e.source, "heuristic");
});

test("heuristicExplain: SCOPED lookup blames the target, not the container (regression)", () => {
  // The exact failure that was mislabeled "couldn't find 'Percent (%)' — removed".
  const e = heuristicExplain(
    input({
      failureReason:
        "expect(locator).toHaveValue(expected) failed\n" +
        "Locator: getByRole('tabpanel', { name: 'Percent (%)' }).getByRole('spinbutton')\n" +
        'Expected: "15"\nTimeout: 5000ms\nError: element(s) not found',
      buildMismatch: true,
    }),
  );
  assert.match(e.summary, /couldn't locate the number field/i);
  // 'Percent (%)' is named only as the SCOPE, never claimed removed.
  assert.match(e.why, /Percent \(%\)/);
  assert.doesNotMatch(e.why, /renamed, moved, or removed/);
  assert.match(e.why, /not necessarily a removed feature/i);
  assert.match(e.fix, /less structure-dependent|its own label/i);
});

test("heuristicExplain: value mismatch (element found) is NOT mislabeled as missing", () => {
  const e = heuristicExplain(
    input({
      failureReason:
        "expect(locator).toHaveValue(expected) failed\n" +
        'Locator: getByRole("spinbutton", { name: "Number of Units" })\n' +
        'Expected string: "3"\nReceived string: "2"\n' +
        'Call log:\n  - locator resolved to <input value="2" />',
    }),
  );
  assert.match(e.summary, /value didn't match/i);
  assert.doesNotMatch(e.summary, /couldn't find|couldn't locate/i);
  assert.match(e.why, /element exists|was found/i);
});

test("heuristicExplain: strict-mode (ambiguous selector) is NOT reported as missing", () => {
  const e = heuristicExplain(
    input({
      failureReason:
        "expect(locator).toBeVisible() failed Locator: getByRole('status').filter({ hasText: 'Demo Data Loaded' }) " +
        "Error: strict mode violation: getByRole('status') resolved to 2 elements",
    }),
  );
  assert.match(e.summary, /more than one/i);
  assert.doesNotMatch(e.why, /renamed, moved, or removed/);
  assert.match(e.fix, /\.first\(\)|specific|one element/i);
  assert.equal(e.source, "heuristic");
});

test("heuristicExplain: timeout", () => {
  const e = heuristicExplain(
    input({ failureReason: "Test timeout of 30000ms exceeded." }),
  );
  assert.match(e.summary, /ran out of time/i);
  assert.match(e.fix, /stalls|first step/i);
});

test("heuristicExplain: assertion mismatch", () => {
  const e = heuristicExplain(
    input({ failureReason: "expect(received).toHaveText() ..." }),
  );
  assert.match(e.summary, /value didn't match/i);
});

test("heuristicExplain: infra/auth failure", () => {
  const e = heuristicExplain(
    input({
      classification: "infra",
      failureReason: "Did not run — auth did not complete, redirected to login",
    }),
  );
  assert.match(e.summary, /couldn't run/i);
  assert.match(e.fix, /login|credentials|IdP/i);
});

test("explainFailure falls back to heuristic when no claude client", async () => {
  const e = await explainFailure(
    input({ failureReason: "Test timeout of 30000ms exceeded." }),
  );
  assert.equal(e.source, "heuristic");
});

test("explainFailure uses the LLM when it returns valid JSON", async () => {
  const claude = {
    model: "test",
    calls: [],
    async complete() {
      return 'Here you go: {"summary":"S","why":"W","fix":"F"} done';
    },
  };
  const e = await explainFailure(input(), claude as never);
  assert.deepEqual(
    { summary: e.summary, why: e.why, fix: e.fix, source: e.source },
    { summary: "S", why: "W", fix: "F", source: "ai" },
  );
});

test("explainFailure falls back to heuristic when the LLM throws", async () => {
  const claude = {
    model: "test",
    calls: [],
    async complete() {
      throw new Error("rate limited");
    },
  };
  const e = await explainFailure(
    input({ failureReason: "getByRole('button', { name: 'X' }) not found" }),
    claude as never,
  );
  assert.equal(e.source, "heuristic");
  assert.match(e.summary, /"X"|X/);
});
