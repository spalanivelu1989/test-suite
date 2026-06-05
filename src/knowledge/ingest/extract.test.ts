import assert from "node:assert/strict";
import { test } from "node:test";
import type { RunReport } from "../../types";
import { extractRun } from "./extract";

function sampleReport(): RunReport {
  return {
    runId: "run-1",
    url: "https://www.tarento.com/home?ref=x",
    flows: [
      { id: "hero-cta", name: "Hero Get in Touch CTA" },
      { id: "footer", name: "Footer Links" },
    ],
    results: [
      {
        flowId: "Hero Get in Touch CTA",
        fileName: "hero.spec.ts",
        outcome: "passed",
      },
    ],
    generatedSpecs: [
      {
        file: "hero.spec.ts",
        code: `import { test, expect } from '@playwright/test';\ntest('Hero Get in Touch CTA', async ({ page }) => {});`,
      },
    ],
    planMarkdown: "# Plan\n## Scenario 1 — Hero Get in Touch CTA\n",
    coverage: {
      curatedTotal: 2,
      testedCount: 1,
      percent: 50,
      missingFlows: ["Footer Links"],
    },
  } as unknown as RunReport;
}

test("extractRun derives appId from normalized origin", () => {
  const ex = extractRun(sampleReport());
  assert.equal(ex.appId, "https://tarento.com");
  assert.equal(ex.run.runId, "run-1");
});

test("extractRun pulls specs, flows, results, plan scenarios, coverage", () => {
  const ex = extractRun(sampleReport());
  assert.equal(ex.specs.length, 1);
  assert.equal(ex.specs[0].title, "Hero Get in Touch CTA");
  assert.equal(ex.specs[0].flowId, "hero get in touch cta"); // norm()
  assert.ok(ex.specs[0].tokens.includes("hero"));
  // 3 flow keys: two curated (hero-cta, footer) + the tested flowId, which is
  // keyed differently than the curated id (token-overlap reconciles them at
  // coverage time, not by exact key) — see implementation-notes 2026-06-05.
  assert.equal(ex.flows.length, 3);
  const names = ex.flows.map((f) => f.name);
  assert.ok(names.includes("Footer Links"));
  assert.ok(names.includes("Hero Get in Touch CTA"));
  assert.equal(ex.testResults.length, 1);
  assert.equal(ex.planScenarios.length, 1);
  assert.equal(ex.coverage?.testedCount, 1);
});

test("extractRun emits PRODUCED + TESTS + COVERS edges", () => {
  const ex = extractRun(sampleReport());
  const rels = ex.edges.map((e) => e.rel);
  assert.ok(rels.includes("PRODUCED"));
  assert.ok(rels.includes("TESTS"));
  assert.ok(rels.includes("COVERS"));
});

test("extractRun is defensive — a partial report does not throw (RK5)", () => {
  const partial = { runId: "r2", url: "https://x.com" } as unknown as RunReport;
  assert.doesNotThrow(() => extractRun(partial));
  const ex = extractRun(partial);
  assert.equal(ex.specs.length, 0);
  assert.equal(ex.coverage, null);
});
