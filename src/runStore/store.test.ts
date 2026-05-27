import assert from "node:assert/strict";
import { test } from "node:test";
import type { RunReport } from "../types";
import { createRunStore } from "./store";

const fakeReport: RunReport = {
  runId: "x",
  url: "https://example.com",
  generatedAt: new Date().toISOString(),
  flows: [],
  results: [],
  coverage: { curatedTotal: 0, testedCount: 0, percent: 0, missingFlows: [] },
  flakeRate: 0,
  healSuccessRate: 0,
  claudeCallCount: 0,
  successRate: { rate: 0, passed: 0, total: 0 },
  fixPrompts: [],
  issues: [],
  recommendations: [],
  planMarkdown: null,
  generatedSpecs: [],
};

test("create assigns an id and queued/pending state", () => {
  const store = createRunStore();
  const run = store.create({ url: "https://example.com" });
  assert.ok(run.id);
  assert.equal(run.status, "pending");
  assert.equal(run.stage, "queued");
  assert.equal(store.get(run.id)?.id, run.id);
});

test("addEvent appends and advances the stage to running", () => {
  const store = createRunStore();
  const run = store.create({ url: "https://example.com" });
  store.addEvent(run.id, { stage: "planning", message: "started planning" });
  const updated = store.get(run.id)!;
  assert.equal(updated.events.length, 1);
  assert.equal(updated.stage, "planning");
  assert.equal(updated.status, "running");
  assert.ok(updated.events[0].at);
});

test("complete stores the report and marks completed/done", () => {
  const store = createRunStore();
  const run = store.create({ url: "https://example.com" });
  store.complete(run.id, fakeReport);
  const done = store.get(run.id)!;
  assert.equal(done.status, "completed");
  assert.equal(done.stage, "done");
  assert.equal(done.report, fakeReport);
});

test("fail records the error and marks failed/error", () => {
  const store = createRunStore();
  const run = store.create({ url: "https://bad" });
  store.fail(run.id, "unreachable");
  const failed = store.get(run.id)!;
  assert.equal(failed.status, "failed");
  assert.equal(failed.stage, "error");
  assert.equal(failed.error, "unreachable");
});
