import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { before, test } from "node:test";
import type { RunReport } from "../types";
import { createKnowledgeService, type KnowledgeEvent } from "./index";
import { migrate } from "./store/migrate";
import { closeAllPools, getPool } from "./store/db";
import { countRuns } from "./store/repo";

// Integration + NFR tests against a real Postgres (T17/T18). Skipped when no
// KNOWLEDGE_DATABASE_URL is set, so `npm run test:unit` stays green without a DB.
const DB = process.env.KNOWLEDGE_DATABASE_URL;
const opts = { skip: DB ? false : "KNOWLEDGE_DATABASE_URL not set" };

// Each test uses a unique origin → isolation without truncation.
function uniqueUrl(): string {
  return `https://kp-${randomUUID().slice(0, 8)}.example.com/`;
}

function report(
  runId: string,
  url: string,
  over: Partial<RunReport> = {},
): RunReport {
  return {
    runId,
    url,
    flows: [{ id: "hero", name: "Hero CTA" }],
    results: [
      { flowId: "Hero CTA", fileName: "hero.spec.ts", outcome: "passed" },
    ],
    generatedSpecs: [
      {
        file: "hero.spec.ts",
        code: `import { test, expect } from '@playwright/test';\ntest('Hero CTA', async ({ page }) => { await expect(page).toHaveTitle(/x/); });`,
      },
    ],
    planMarkdown:
      "# Plan\n## Scenario 1 — Hero CTA\n## Scenario 2 — Footer Links\n",
    coverage: {
      curatedTotal: 2,
      testedCount: 1,
      percent: 50,
      missingFlows: ["Footer Links"],
    },
    ...over,
  } as unknown as RunReport;
}

function svc(onEvent?: (e: KnowledgeEvent) => void) {
  return createKnowledgeService({ databaseUrl: DB, onEvent });
}

/** Fail loudly if the best-effort layer swallowed a real error during a test. */
function errorTrap() {
  const errors: string[] = [];
  return {
    onEvent: (e: KnowledgeEvent) => {
      if (e.kind === "error") errors.push(`${e.op}: ${e.message}`);
    },
    assertClean: () => assert.deepEqual(errors, [], "no swallowed KB errors"),
  };
}

before(async () => {
  if (DB) await migrate(DB);
});

test("ingestRun → query round-trip (AC1)", opts, async () => {
  const trap = errorTrap();
  const k = svc(trap.onEvent);
  const url = uniqueUrl();
  await k.ingestRun(report("r-" + randomUUID(), url));
  trap.assertClean();

  const profile = await k.getAppProfile(url);
  assert.ok(profile, "profile present");
  assert.equal(profile!.runCount, 1);
  assert.ok(profile!.coveredFlows.some((f) => f.name === "Hero CTA"));
  await k.close();
});

test(
  "double-ingest is idempotent — one run, no dup specs (AC2)",
  opts,
  async () => {
    const k = svc();
    const url = uniqueUrl();
    const appId = k.appIdFor(url);
    const runId = "r-" + randomUUID();
    await k.ingestRun(report(runId, url));
    await k.ingestRun(report(runId, url)); // again

    const pool = getPool(DB!);
    assert.equal(await countRuns(pool, appId), 1);
    const specs = await pool.query(
      "SELECT count(*)::int n FROM specs WHERE app_id=$1",
      [appId],
    );
    assert.equal(specs.rows[0].n, 1);
    await k.close();
  },
);

test("getAppProfile + getCoverageMap (AC6/AC7)", opts, async () => {
  const k = svc();
  const url = uniqueUrl();
  await k.ingestRun(report("r-" + randomUUID(), url));
  const map = await k.getCoverageMap(k.appIdFor(url));
  assert.ok(map);
  assert.ok(map!.covered.includes("Hero CTA"));
  // Gap comes from the snapshot's missing_flows, and a flow is never both.
  assert.ok(map!.uncovered.includes("Footer Links"));
  assert.ok(!map!.covered.includes("Footer Links"));
  await k.close();
});

test(
  "raw RunReport is stored and retrievable as JSONB (AC15)",
  opts,
  async () => {
    const k = svc();
    const url = uniqueUrl();
    const runId = "raw-" + randomUUID();
    await k.ingestRun(report(runId, url));

    const pool = getPool(DB!);
    const row = await pool.query<{ report: RunReport }>(
      "SELECT report FROM raw_reports WHERE run_id = $1",
      [runId],
    );
    assert.equal(row.rowCount, 1);
    // It round-trips as structured JSON, not a string.
    assert.equal(row.rows[0].report.runId, runId);
    assert.equal(row.rows[0].report.url, url);
    assert.ok(Array.isArray(row.rows[0].report.generatedSpecs));
    await k.close();
  },
);

test("ingestion completeness — K runs ingested (N1)", opts, async () => {
  const k = svc();
  const url = uniqueUrl();
  const appId = k.appIdFor(url);
  for (let i = 0; i < 3; i++)
    await k.ingestRun(report(`r-${randomUUID()}`, url));
  assert.equal(await countRuns(getPool(DB!), appId), 3);
  await k.close();
});

test(
  "rebuild from raw_reports reproduces identical entity counts (N2/AC12)",
  opts,
  async () => {
    const k = svc();
    const url = uniqueUrl();
    const appId = k.appIdFor(url);
    const reports = [
      report("r-" + randomUUID(), url),
      report("r-" + randomUUID(), url),
    ];
    for (const r of reports) await k.ingestRun(r);

    const pool = getPool(DB!);
    const before = await countRuns(pool, appId);
    // Simulate replay: delete this app's rows, then re-ingest the same reports.
    await pool.query("DELETE FROM apps WHERE app_id=$1", [appId]); // cascades
    assert.equal(await countRuns(pool, appId), 0);
    for (const r of reports) await k.ingestRun(r);
    assert.equal(await countRuns(pool, appId), before);
    await k.close();
  },
);

test(
  "app-scoped isolation — no cross-app leakage (N5/AC16)",
  opts,
  async () => {
    const k = svc();
    const urlA = uniqueUrl();
    const urlB = uniqueUrl();
    await k.ingestRun(report("a-" + randomUUID(), urlA));
    await k.ingestRun(report("b-" + randomUUID(), urlB));

    const pa = await k.getAppProfile(urlA);
    const pb = await k.getAppProfile(urlB);
    assert.equal(pa!.appId, k.appIdFor(urlA));
    assert.equal(pb!.appId, k.appIdFor(urlB));
    assert.notEqual(pa!.appId, pb!.appId);
    // Each profile sees only its own run.
    assert.equal(pa!.runCount, 1);
    assert.equal(pb!.runCount, 1);
    await k.close();
  },
);

test("retrieval overhead ≤500ms (N4/AC13)", opts, async () => {
  const k = svc();
  const url = uniqueUrl();
  await k.ingestRun(report("r-" + randomUUID(), url));
  const scenarios = [{ name: "Hero CTA" }, { name: "Footer Links" }];

  const start = process.hrtime.bigint();
  await k.getAppProfile(url);
  await k.planCoverageDecision(scenarios, k.appIdFor(url));
  const ms = Number(process.hrtime.bigint() - start) / 1e6;
  assert.ok(ms <= 500, `retrieval took ${ms.toFixed(1)}ms`);
  await k.close();
});

test(
  "reuse decision on a 2nd run; failed prior → new (R9/R10)",
  opts,
  async () => {
    const k = svc();
    const url = uniqueUrl();
    // Run 1 covers "Hero CTA" passing.
    await k.ingestRun(report("r1-" + randomUUID(), url));
    // Run 2 plans the same scenario → should be reuse.
    const decisions = await k.planCoverageDecision(
      [{ name: "Hero CTA" }],
      k.appIdFor(url),
    );
    assert.equal(decisions[0].action, "reuse");

    // A failed prior run must NOT yield reuse.
    const url2 = uniqueUrl();
    await k.ingestRun(
      report("rf-" + randomUUID(), url2, {
        results: [
          { flowId: "Hero CTA", fileName: "hero.spec.ts", outcome: "failed" },
        ],
      } as Partial<RunReport>),
    );
    const d2 = await k.planCoverageDecision(
      [{ name: "Hero CTA" }],
      k.appIdFor(url2),
    );
    assert.notEqual(d2[0].action, "reuse");
    await k.close();
  },
);

test(
  "degradation — a bad DB URL never throws, returns empties (N3)",
  opts,
  async () => {
    const bad = createKnowledgeService({
      databaseUrl: "postgres://nope@127.0.0.1:1/none",
    });
    // None of these throw; all return safe defaults.
    await assert.doesNotReject(() =>
      bad.ingestRun(report("x", "https://x.com")),
    );
    assert.equal(await bad.getAppProfile("https://x.com"), null);
    const dec = await bad.planCoverageDecision(
      [{ name: "A" }],
      "https://x.com",
    );
    assert.equal(dec[0].action, "new");
    await bad.close();
  },
);

test("disabled service (no URL) runs cold without errors (R4/SC10)", async () => {
  // Empty string forces the disabled path regardless of process.env.
  const k = createKnowledgeService({ databaseUrl: "" });
  assert.equal(k.enabled, false);
  await k.ingestRun(report("x", "https://x.com"));
  assert.equal(await k.getAppProfile("https://x.com"), null);
  assert.deepEqual(await k.assembleContext("https://x.com"), {});
  await k.close();
});

test("close all pools", opts, async () => {
  await closeAllPools();
});
