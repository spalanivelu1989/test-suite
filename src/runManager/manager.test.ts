import assert from "node:assert/strict";
import { test } from "node:test";
import type { Run, RunConfig, RunReport } from "../types";
import { createRunStore } from "../runStore/store";
import type { RunPersistence } from "./persistence";
import { createRunManager, type PipelineRunner } from "./manager";

const CONFIG: RunConfig = { url: "https://example.com" };

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

function makeReport(runId: string, url: string): RunReport {
  return {
    runId,
    url,
    generatedAt: new Date().toISOString(),
    flows: [],
    results: [],
    coverage: { curatedTotal: 0, testedCount: 0, percent: 0, missingFlows: [] },
    flakeRate: 0,
    healSuccessRate: 0,
    claudeCallCount: 0,
    successRate: { rate: 1, passed: 0, total: 0 },
    fixPrompts: [],
    issues: [],
    recommendations: [],
    planMarkdown: null,
    generatedSpecs: [],
  };
}

/** A fake disk persistence backed by a Map — survives across "restarts". */
function memPersistence() {
  const disk = new Map<string, Run>();
  const persistence: RunPersistence = {
    async save(run) {
      disk.set(run.id, clone(run));
    },
    async get(id) {
      const r = disk.get(id);
      return r ? clone(r) : undefined;
    },
    async list() {
      return [...disk.values()].map(clone);
    },
    async remove(id) {
      return disk.delete(id);
    },
  };
  return { persistence, disk };
}

/** A runner that emits one event then finishes successfully. */
const immediateRunner: PipelineRunner = async (id, config, emit) => {
  emit({ stage: "planning", message: "exploring" });
  return makeReport(id, config.url);
};

async function waitFor(cond: () => boolean, tries = 200): Promise<void> {
  for (let i = 0; i < tries; i++) {
    if (cond()) return;
    await new Promise((r) => setTimeout(r, 2));
  }
  throw new Error("waitFor: condition never met");
}

test("start runs the pipeline, reflects progress, and persists completion", async () => {
  const store = createRunStore();
  const { persistence, disk } = memPersistence();
  const mgr = createRunManager({
    store,
    persistence,
    runPipeline: immediateRunner,
  });

  const id = mgr.start(CONFIG);
  await waitFor(() => store.get(id)?.status === "completed");

  const run = mgr.peek(id)!;
  assert.equal(run.status, "completed");
  assert.ok(run.events.some((e) => e.stage === "planning"));
  assert.ok(run.report);
  // Disk holds the latest snapshot without any caller calling persist by hand.
  assert.equal(disk.get(id)?.status, "completed");
});

test("cancel aborts an in-flight run and is idempotent", async () => {
  const store = createRunStore();
  const { persistence, disk } = memPersistence();
  // A runner that only ends when the run is aborted.
  const hangingRunner: PipelineRunner = (_id, _config, _emit, ctrl) =>
    new Promise((_resolve, reject) => {
      ctrl.signal.addEventListener("abort", () => reject(new Error("aborted")));
    });
  const mgr = createRunManager({
    store,
    persistence,
    runPipeline: hangingRunner,
  });

  const id = mgr.start(CONFIG);
  assert.equal(mgr.cancel(id), true);
  await waitFor(() => store.get(id)?.status === "cancelled");

  assert.equal(disk.get(id)?.status, "cancelled");
  assert.equal(mgr.cancel(id), false); // already terminal
  assert.equal(mgr.cancel("unknown"), false);
});

test("get rebuilds a run from disk after an in-memory 'restart'", async () => {
  const { persistence } = memPersistence();
  const store1 = createRunStore();
  const mgr1 = createRunManager({
    store: store1,
    persistence,
    runPipeline: immediateRunner,
  });
  const id = mgr1.start(CONFIG);
  await waitFor(() => store1.get(id)?.status === "completed");

  // Fresh store = the server restarted; same disk.
  const mgr2 = createRunManager({
    store: createRunStore(),
    persistence,
    runPipeline: immediateRunner,
  });
  assert.equal(mgr2.peek(id), undefined); // memory is empty
  const recovered = await mgr2.get(id);
  assert.equal(recovered?.id, id);
  assert.equal(recovered?.status, "completed");
});

test("list merges memory and disk with memory winning", async () => {
  const store = createRunStore();
  const { persistence } = memPersistence();
  const mgr = createRunManager({ store, persistence });

  const run = store.create(CONFIG); // pending, in memory
  await persistence.save({ ...run, status: "completed", stage: "done" }); // stale disk copy

  const all = await mgr.list();
  assert.equal(all.length, 1); // not duplicated
  assert.equal(all[0].status, "pending"); // memory wins
});

test("remove clears a run from both memory and disk", async () => {
  const store = createRunStore();
  const { persistence } = memPersistence();
  const mgr = createRunManager({ store, persistence });

  const run = store.create(CONFIG);
  await persistence.save(run);

  assert.equal(await mgr.remove(run.id), true);
  assert.equal(store.get(run.id), undefined);
  assert.equal(await persistence.get(run.id), undefined);
  assert.equal(await mgr.remove(run.id), false); // nothing left to remove
});
