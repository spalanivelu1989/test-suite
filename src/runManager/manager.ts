import type { ProgressEvent, Run, RunConfig, RunReport } from "../types";
import { getRunStore, type RunStore } from "../runStore/store";
import { diskPersistence, type RunPersistence } from "./persistence";
import { runToReport } from "../orchestrator/runService";

// The Run Manager (Candidate B). One module owns a run's whole life: it
// coordinates the in-memory store, the per-run abort controllers, and disk
// persistence behind one small interface. "Persist after every state change"
// and "clean up the abort controller when terminal" become invariants of this
// owner, not rules every caller must remember — callers can't reach the records
// directly. Replaces the hand-wired persistence + parallel abort registry that
// used to live in orchestrator/runService.ts.

/** Drives one run to a finished report. Injectable so lifecycle tests need no browser/Claude. */
export type PipelineRunner = (
  runId: string,
  config: RunConfig,
  emit: (event: Omit<ProgressEvent, "at">) => void,
  abortController: AbortController,
) => Promise<RunReport>;

export interface RunManager {
  /** Create a run, start it in the background, and return its id immediately (R8). */
  start(config: RunConfig): string;
  /** Stop an in-flight run. False if unknown or already terminal. */
  cancel(id: string): boolean;
  /** Remove a run from memory and purge its disk workspace. False if it existed nowhere. */
  remove(id: string): Promise<boolean>;
  /** Look up one run: memory first, then disk. */
  get(id: string): Promise<Run | undefined>;
  /** Every run, memory and disk merged — memory wins (it's freshest). */
  list(): Promise<Run[]>;
  /** In-memory-only, synchronous peek for the live SSE poll loop (no disk hit). */
  peek(id: string): Run | undefined;
}

export interface RunManagerDeps {
  store?: RunStore;
  persistence?: RunPersistence;
  runPipeline?: PipelineRunner;
}

export function createRunManager(deps: RunManagerDeps = {}): RunManager {
  const store = deps.store ?? getRunStore();
  const persistence = deps.persistence ?? diskPersistence;
  const runPipeline: PipelineRunner = deps.runPipeline ?? runToReport;
  // The per-run stop-buttons, kept inside the owner (was globalThis.__runAborts).
  const aborts = new Map<string, AbortController>();

  function isTerminal(run: Run): boolean {
    return (
      run.status === "completed" ||
      run.status === "failed" ||
      run.status === "cancelled"
    );
  }

  function cancel(id: string): boolean {
    const run = store.get(id);
    if (!run || isTerminal(run)) return false;
    aborts.get(id)?.abort();
    const cancelled = store.cancel(id, "Run stopped by user");
    void persistence.save(cancelled);
    return true;
  }

  function start(config: RunConfig): string {
    const run = store.create(config);
    void persistence.save(run);
    const controller = new AbortController();
    aborts.set(run.id, controller);

    void (async () => {
      try {
        const report = await runPipeline(
          run.id,
          config,
          (event) => {
            const updated = store.addEvent(run.id, event);
            void persistence.save(updated);
          },
          controller,
        );
        if (controller.signal.aborted) return; // cancel() already marked it
        const completed = store.complete(run.id, report);
        void persistence.save(completed);
      } catch (err) {
        const terminal = controller.signal.aborted
          ? store.cancel(run.id, "Run stopped by user")
          : store.fail(
              run.id,
              err instanceof Error ? err.message : String(err),
            );
        void persistence.save(terminal);
      } finally {
        aborts.delete(run.id);
      }
    })();

    return run.id;
  }

  async function remove(id: string): Promise<boolean> {
    const live = store.get(id);
    if (live && (live.status === "running" || live.status === "pending")) {
      cancel(id); // terminate subprocesses before purging
    }
    const inMemory = store.remove(id);
    const onDisk = await persistence.remove(id);
    return inMemory || onDisk;
  }

  async function get(id: string): Promise<Run | undefined> {
    return store.get(id) ?? (await persistence.get(id));
  }

  async function list(): Promise<Run[]> {
    const persisted = await persistence.list();
    const byId = new Map<string, Run>();
    for (const r of persisted) byId.set(r.id, r);
    for (const r of store.list()) byId.set(r.id, r); // in-memory wins on conflict
    return [...byId.values()];
  }

  function peek(id: string): Run | undefined {
    return store.get(id);
  }

  return { start, cancel, remove, get, list, peek };
}

/**
 * Process-wide singleton. On globalThis for the same reason the store is: Next.js
 * duplicates module instances across route files and HMR, so a plain module-level
 * variable would not be shared. Folding the abort registry inside takes us from
 * two global maps + scattered persistence down to one owner.
 */
const globalForManager = globalThis as unknown as {
  __runManager?: RunManager;
};
export function getRunManager(): RunManager {
  if (!globalForManager.__runManager) {
    globalForManager.__runManager = createRunManager();
  }
  return globalForManager.__runManager;
}
