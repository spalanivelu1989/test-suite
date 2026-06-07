import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { before, test } from "node:test";
import type { RunReport } from "../../types";
import { FakeEmbedder } from "../embeddings/embed";
import { createKnowledgeService } from "../index";
import { closeAllPools, getPool } from "../store/db";
import { migrate } from "../store/migrate";
import type { HealingEvent } from "../types";
import { runDistillation } from "./run";

// Phase 3b distillation integration tests (T20). Skipped without a DB.
const DB = process.env.KNOWLEDGE_DATABASE_URL;
const opts = { skip: DB ? false : "KNOWLEDGE_DATABASE_URL not set" };

const embedder = new FakeEmbedder(
  { "timeouterror locator not found": [1, 0, 0] },
  3,
);

function healEvent(): HealingEvent {
  return {
    runId: "",
    appId: "",
    flowId: "home",
    file: "home.spec.ts",
    failureSignature: "timeouterror locator not found",
    before: "page.locator('#a')",
    after: "page.getByRole('button')",
    strategy: "role-locator",
    outcome: "healed",
  };
}

function report(runId: string, url: string): RunReport {
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
    healingEvents: [healEvent()],
  } as RunReport;
}

before(async () => {
  if (DB) await migrate(DB);
});

test(
  "distill: 2 runs with the same heal → a trusted global playbook (AC10/AC13)",
  opts,
  async () => {
    const svc = createKnowledgeService({ databaseUrl: DB, embedder });
    try {
      await svc.ingestRun(report(`d-${randomUUID().slice(0, 8)}`, uniqueUrl()));
      await svc.ingestRun(report(`d-${randomUUID().slice(0, 8)}`, uniqueUrl()));

      const r = await runDistillation(getPool(DB!), {});
      assert.equal(r.noop, false);
      assert.ok(r.trusted >= 1, "expected at least one trusted playbook");

      const trusted = await svc.getPlaybooks({ kind: "global", key: "all" });
      assert.ok(trusted.some((p) => p.principle.length > 0));
      assert.ok(trusted.every((p) => p.status === "trusted")); // trusted-only (N6)
    } finally {
      await svc.close();
    }
  },
);

test(
  "distill: a second run with no new heals is a no-op (AC11/SC8)",
  opts,
  async () => {
    const pool = getPool(DB!);
    await runDistillation(pool, {}); // drain anything pending
    const again = await runDistillation(pool, {});
    assert.equal(again.noop, true);
  },
);

test("teardown", opts, async () => {
  await closeAllPools();
});

function uniqueUrl(): string {
  return `https://distill-${randomUUID().slice(0, 8)}.example.com/`;
}
