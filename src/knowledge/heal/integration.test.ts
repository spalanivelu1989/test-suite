import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { before, test } from "node:test";
import type { RunReport } from "../../types";
import { FakeEmbedder } from "../embeddings/embed";
import { createKnowledgeService } from "../index";
import { closeAllPools, getPool } from "../store/db";
import { migrate } from "../store/migrate";
import type { HealingEvent } from "../types";

// Phase 3 healing-memory integration tests against a real Postgres (T12). Skipped
// when no KNOWLEDGE_DATABASE_URL is set, so `npm run test:unit` stays green.
const DB = process.env.KNOWLEDGE_DATABASE_URL;
const opts = { skip: DB ? false : "KNOWLEDGE_DATABASE_URL not set" };

function uniqueUrl(): string {
  return `https://heal-${randomUUID().slice(0, 8)}.example.com/`;
}

// Deterministic vectors so semantic geometry is controlled (no real model).
const VECS: Record<string, number[]> = {
  "timeouterror locator not found": [1, 0, 0],
  "expect tohavetext mismatch": [0, 1, 0],
};
// 384-d to match the vector(384) columns (FakeEmbedder pads).
const embedder = new FakeEmbedder(VECS, 384);

function healEvent(over: Partial<HealingEvent> = {}): HealingEvent {
  return {
    runId: "",
    appId: "",
    flowId: "home",
    file: "home.spec.ts",
    failureSignature: "timeouterror locator not found",
    before: "page.locator('#btn-7f3a')",
    after: "page.getByRole('button', { name: 'Send' })",
    strategy: "role-locator",
    outcome: "healed",
    ...over,
  };
}

function report(runId: string, url: string, events: HealingEvent[]): RunReport {
  return {
    runId,
    url,
    flows: [{ id: "home", name: "Home" }],
    results: [{ flowId: "Home", fileName: "home.spec.ts", outcome: "healed" }],
    generatedSpecs: [{ file: "home.spec.ts", code: "test('home', () => {});" }],
    planMarkdown: "# Plan\n## Scenario 1 — Home\n",
    coverage: {
      curatedTotal: 1,
      testedCount: 1,
      percent: 100,
      missingFlows: [],
    },
    flakeRate: 0,
    healSuccessRate: 1,
    claudeCallCount: 0,
    successRate: { total: 1, passed: 1, rate: 1, byOutcome: {} as never },
    fixPrompts: [],
    issues: [],
    recommendations: [],
    generatedAt: "2026-06-07T00:00:00Z",
    healingEvents: events,
  } as RunReport;
}

before(async () => {
  if (DB) await migrate(DB);
});

test(
  "ingest persists healing events; precedent retrieval finds a similar prior heal (AC5/AC7)",
  opts,
  async () => {
    const url = uniqueUrl();
    const svc = createKnowledgeService({ databaseUrl: DB, embedder });
    const appId = svc.appIdFor(url);
    try {
      await svc.ingestRun(report("run-A", url, [healEvent()]));

      const pool = getPool(DB!);
      const count = await pool.query(
        "SELECT count(*)::int AS n FROM healing_events WHERE app_id=$1",
        [appId],
      );
      assert.equal(count.rows[0].n, 1);

      // A paraphrased failure (no lexical overlap) still matches semantically.
      const precedents = await svc.getHealingPrecedents({
        signature: "timeouterror locator not found",
        appId,
        flowId: "home",
      });
      assert.equal(precedents.length, 1);
      assert.equal(precedents[0].strategy, "role-locator");
      assert.ok(precedents[0].after.includes("getByRole"));
    } finally {
      await svc.close();
    }
  },
);

test(
  "re-ingesting the same runId does not duplicate healing events (idempotent, AC5/N5)",
  opts,
  async () => {
    const url = uniqueUrl();
    const svc = createKnowledgeService({ databaseUrl: DB, embedder });
    const appId = svc.appIdFor(url);
    try {
      await svc.ingestRun(report("run-B", url, [healEvent(), healEvent()]));
      await svc.ingestRun(report("run-B", url, [healEvent(), healEvent()]));
      const pool = getPool(DB!);
      const count = await pool.query(
        "SELECT count(*)::int AS n FROM healing_events WHERE run_id=$1",
        ["run-B"],
      );
      assert.equal(count.rows[0].n, 2);
    } finally {
      await svc.close();
    }
  },
);

test("disabled service returns no precedents (cold path, R13)", async () => {
  const svc = createKnowledgeService({ databaseUrl: undefined });
  const out = await svc.getHealingPrecedents({
    signature: "x",
    appId: "https://x.com",
  });
  assert.deepEqual(out, []);
  await svc.close();
});

test(
  "embedder throwing mid-ingest → null embedding, ingest still commits (AC6/SC6)",
  opts,
  async () => {
    const url = uniqueUrl();
    const throwing = {
      id: "throwing",
      dims: 384,
      async embed(): Promise<number[][]> {
        throw new Error("embed boom");
      },
    };
    const svc = createKnowledgeService({ databaseUrl: DB, embedder: throwing });
    const appId = svc.appIdFor(url);
    try {
      await svc.ingestRun(report("run-C", url, [healEvent()]));
      const pool = getPool(DB!);
      const res = await pool.query(
        "SELECT count(*)::int AS n, count(failure_embedding)::int AS embedded FROM healing_events WHERE app_id=$1",
        [appId],
      );
      assert.equal(res.rows[0].n, 1); // event persisted
      assert.equal(res.rows[0].embedded, 0); // but embedding is null
    } finally {
      await svc.close();
    }
  },
);

test("teardown pools", opts, async () => {
  await closeAllPools();
});
