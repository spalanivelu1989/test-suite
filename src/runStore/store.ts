import { randomUUID } from "node:crypto";
import type {
  ProgressEvent,
  Run,
  RunConfig,
  RunReport,
  RunStage,
} from "../types";

// In-memory run store (D6). v1 keeps state in process memory — no DB, per the
// simplicity rule and the "fresh tests per run" scope (D7). Lost on restart,
// which is acceptable for v1.

export interface RunStore {
  create(config: RunConfig): Run;
  get(id: string): Run | undefined;
  list(): Run[];
  setStage(id: string, stage: RunStage): Run;
  addEvent(id: string, event: Omit<ProgressEvent, "at">): Run;
  complete(id: string, report: RunReport): Run;
  fail(id: string, error: string): Run;
  /** Mark a run as stopped by the user. No-op if the run is already terminal. */
  cancel(id: string, message: string): Run;
  remove(id: string): boolean;
}

/** True once a run can no longer change state. */
function isTerminal(run: Run): boolean {
  return (
    run.status === "completed" ||
    run.status === "failed" ||
    run.status === "cancelled"
  );
}

class RunNotFoundError extends Error {
  constructor(id: string) {
    super(`Run not found: ${id}`);
    this.name = "RunNotFoundError";
  }
}

export function createRunStore(): RunStore {
  const runs = new Map<string, Run>();

  function require(id: string): Run {
    const run = runs.get(id);
    if (!run) throw new RunNotFoundError(id);
    return run;
  }

  function touch(run: Run): Run {
    run.updatedAt = new Date().toISOString();
    return run;
  }

  return {
    create(config) {
      const now = new Date().toISOString();
      const run: Run = {
        id: randomUUID(),
        config,
        status: "pending",
        stage: "queued",
        events: [],
        createdAt: now,
        updatedAt: now,
      };
      runs.set(run.id, run);
      return run;
    },

    get(id) {
      return runs.get(id);
    },

    list() {
      return [...runs.values()];
    },

    setStage(id, stage) {
      const run = require(id);
      run.stage = stage;
      if (stage !== "queued" && run.status === "pending")
        run.status = "running";
      return touch(run);
    },

    addEvent(id, event) {
      const run = require(id);
      run.events.push({ ...event, at: new Date().toISOString() });
      run.stage = event.stage;
      if (event.stage !== "queued" && run.status === "pending") {
        run.status = "running";
      }
      return touch(run);
    },

    complete(id, report) {
      const run = require(id);
      run.report = report;
      run.status = "completed";
      run.stage = "done";
      return touch(run);
    },

    fail(id, error) {
      const run = require(id);
      run.error = error;
      run.status = "failed";
      run.stage = "error";
      return touch(run);
    },

    cancel(id, message) {
      const run = require(id);
      if (isTerminal(run)) return run;
      run.error = message;
      run.status = "cancelled";
      run.stage = "cancelled";
      return touch(run);
    },
    remove(id) {
      return runs.delete(id);
    },
  };
}

/**
 * Process-wide singleton so API routes and the orchestrator share run state.
 * Stored on globalThis because Next.js can duplicate module instances across
 * route files and HMR reloads — a plain module-level variable is not shared.
 */
const globalForStore = globalThis as unknown as { __runStore?: RunStore };
export function getRunStore(): RunStore {
  if (!globalForStore.__runStore || !globalForStore.__runStore.remove) {
    globalForStore.__runStore = createRunStore();
  }
  return globalForStore.__runStore;
}
