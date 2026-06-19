import assert from "node:assert/strict";
import { test } from "node:test";
import type { TestResult } from "../types";
import { buildDiff } from "./diff";
import type { SourceSpec } from "./types";

function srcSpec(
  file: string,
  sourceOutcome: SourceSpec["sourceOutcome"],
): SourceSpec {
  return {
    file,
    title: file.replace(/\.spec\.ts$/, ""),
    code: "",
    sourceOutcome,
  };
}

function res(
  fileName: string,
  outcome: TestResult["outcome"],
  extra: Partial<TestResult> = {},
): TestResult {
  return { flowId: fileName, fileName, outcome, ...extra };
}

test("buildDiff classifies a mixed suite and tallies the summary", () => {
  const specs = [
    srcSpec("pass.spec.ts", "passed"),
    srcSpec("regress.spec.ts", "passed"),
    srcSpec("login.spec.ts", "passed"),
    srcSpec("wobble.spec.ts", "passed"),
    srcSpec("broken.spec.ts", "failed"),
  ];
  const results = [
    res("pass.spec.ts", "passed"),
    res("regress.spec.ts", "failed", {
      failureReason: "locator.click: waiting for getByRole('button')",
    }),
    res("login.spec.ts", "failed", {
      failureReason: "redirected to SSO login (401)",
    }),
    res("wobble.spec.ts", "flaky", { flaky: true }),
    res("broken.spec.ts", "failed", {
      failureReason: "expect(...).toBeVisible() failed",
    }),
  ];

  const { diff, summary } = buildDiff(specs, results);

  const byFile = Object.fromEntries(
    diff.map((d) => [d.file, d.classification]),
  );
  assert.equal(byFile["pass.spec.ts"], "ok");
  assert.equal(byFile["regress.spec.ts"], "behavioral");
  assert.equal(byFile["login.spec.ts"], "infra");
  assert.equal(byFile["wobble.spec.ts"], "flaky");
  assert.equal(byFile["broken.spec.ts"], "pre-existing");

  assert.deepEqual(summary, {
    total: 5,
    stillPassing: 1,
    behavioral: 1,
    infra: 1,
    flaky: 1,
    preExisting: 1,
    healed: 0,
  });
});

test("buildDiff marks a passing-but-modified spec as healed and counts it", () => {
  const specs = [
    srcSpec("a.spec.ts", "passed"),
    srcSpec("b.spec.ts", "passed"),
  ];
  const results = [res("a.spec.ts", "passed"), res("b.spec.ts", "passed")];
  const healed = new Set(["b.spec.ts"]);
  const { diff, summary } = buildDiff(specs, results, healed);
  const byFile = Object.fromEntries(
    diff.map((d) => [d.file, d.classification]),
  );
  assert.equal(byFile["a.spec.ts"], "ok");
  assert.equal(byFile["b.spec.ts"], "healed");
  assert.equal(summary.stillPassing, 1);
  assert.equal(summary.healed, 1);
});

test("buildDiff attributes un-run specs to setup failure as infra, not regressions", () => {
  const specs = [
    srcSpec("a.spec.ts", "passed"),
    srcSpec("b.spec.ts", "passed"),
  ];
  // Suite aborted (login failed) → no results at all.
  const { diff, summary } = buildDiff(
    specs,
    [],
    new Set(),
    "auth did not complete",
  );
  assert.equal(summary.behavioral, 0);
  assert.equal(summary.infra, 2);
  assert.ok(diff.every((d) => d.classification === "infra"));
  assert.match(diff[0].failureReason ?? "", /auth did not complete/);
});

test("buildDiff treats a spec with no result as a failed (did-not-run) regression", () => {
  const { diff } = buildDiff([srcSpec("ghost.spec.ts", "passed")], []);
  assert.equal(diff[0].targetOutcome, "failed");
  assert.equal(diff[0].classification, "behavioral");
  assert.equal(diff[0].failureReason, "spec did not run");
});

test("buildDiff matches by basename even when source path has a directory", () => {
  const specs = [srcSpec("flows/checkout.spec.ts", "passed")];
  const results = [res("checkout.spec.ts", "passed")];
  const { diff } = buildDiff(specs, results);
  assert.equal(diff[0].classification, "ok");
});
