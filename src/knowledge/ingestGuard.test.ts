import assert from "node:assert/strict";
import { test } from "node:test";
import type { RunReport } from "../types";
import { createKnowledgeService, type KnowledgeEvent } from "./index";

// The ingestRun safety guard: a live PgKnowledgeService must REFUSE to persist a
// synthetic `test-<uuid>` run into a non-test database, even when one is wired up
// (e.g. an exported KNOWLEDGE_DATABASE_URL during `test:unit`). The guard returns
// before any pool query, so this exercises real production code with no live DB.

// Minimal report — the guard only reads `runId`, never reaching the ingest path.
function fakeReport(runId: string): RunReport {
  return { runId, url: "https://x.com" } as unknown as RunReport;
}

test("ingestRun refuses to persist a test- run into a non-test DB", async () => {
  const events: KnowledgeEvent[] = [];
  const svc = createKnowledgeService({
    databaseUrl: "postgres://u@localhost:5432/knowledge", // production-looking
    embedder: null, // skip LocalEmbedder load
    onEvent: (e) => events.push(e),
  });
  assert.equal(svc.enabled, true); // it IS a live service…

  // …yet ingest is refused and never touches the pool (resolves instantly).
  await svc.ingestRun(fakeReport("test-fc70b034-0b82-4207-b7ee-79865e085988"));
  await svc.close();

  const skipped = events.find((e) => e.kind === "skipped");
  assert.ok(skipped, "expected a 'skipped' event");
  assert.match(
    (skipped as { reason: string }).reason,
    /non-test database "knowledge"/,
  );
  assert.ok(
    !events.some((e) => e.kind === "ingested"),
    "must not have ingested",
  );
});

// The positive paths — a real run into a production DB, and a test- run into a
// *test* DB — both proceed past this guard; they're covered by the DB integration
// suites (which run against knowledge_test). Here we only assert the refusal, the
// one path that must hold with no DB and no env isolation.
