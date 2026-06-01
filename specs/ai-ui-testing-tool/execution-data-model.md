# Execution Data — Storage & Handling

**Date:** 2026-06-01
**Status:** 📖 Reference — describes the system as built (`src/types.ts`,
`src/runStore/`, `src/runManager/`, `src/agents/workspace.ts`, `app/api/runs/`).

This document explains **how the project stores and handles execution data** —
the "extra information about how things are run": the inputs a run was launched
with, its live lifecycle state, the progress trace, and the final results. It is
the companion reference to `run-manager-design.md` (which covers _ownership_ of
that data) — this one covers _what the data is, where it lives, and how it flows_.

---

## 1. The unit of execution: a **Run**

Everything the system knows about one execution is gathered in a single record,
the `Run` (`src/types.ts:149`). One run = one launch of the pipeline against one
URL.

```ts
interface Run {
  id: string; // UUID
  config: RunConfig; // the "how to run" inputs (url, crawlMode, maxPages)
  status: RunStatus; // coarse lifecycle: pending | running | completed | failed | cancelled
  stage: RunStage; // fine pipeline stage: queued → planning → … → done
  events: ProgressEvent[]; // append-only timeline of what happened, when
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp, bumped on every mutation
  report?: RunReport; // final results (nullable until the run finishes)
  error?: string; // failure/cancel reason
}
```

The `Run` is the **one vocabulary** every module agrees on — crawler, generator,
runner, reporter, store, API, and UI all read and write this shape
(`src/types.ts:1`).

### The three kinds of execution data on a Run

| Kind                 | Field(s)                       | What it captures                                           | Defined at           |
| -------------------- | ------------------------------ | ---------------------------------------------------------- | -------------------- |
| **Inputs / context** | `config: RunConfig`            | URL under test, crawl strategy, page budget                | `types.ts:46`        |
| **Live state**       | `status`, `stage`, `updatedAt` | Where the run is in its lifecycle right now                | `types.ts:55`, `:68` |
| **Progress trace**   | `events: ProgressEvent[]`      | Timestamped log of every stage transition + message        | `types.ts:76`        |
| **Results**          | `report: RunReport`            | Per-test outcomes, coverage, flake/heal rates, AI insights | `types.ts:128`       |

---

## 2. Inputs — `RunConfig` (how the run was launched)

```ts
interface RunConfig {
  url: string;
  crawlMode?: CrawlMode; // "direct" | "standard" | "deep" | "aggressive" (default "standard")
  maxPages?: number; // page-visit ceiling (default 10)
}
```

`crawlMode` is the central knob for "how things run." It drives two derived
budgets through lookup tables in `types.ts`:

| Mode         | Max depth (`CRAWL_MODE_DEPTH`) | Scenarios / page (`CRAWL_MODE_SCENARIOS_PER_PAGE`) |
| ------------ | ------------------------------ | -------------------------------------------------- |
| `direct`     | 0                              | 8                                                  |
| `standard`   | 1                              | 5                                                  |
| `deep`       | 3                              | 4                                                  |
| `aggressive` | 10                             | 3                                                  |

The depth feeds the Planner prompt; the per-page scenario count feeds the
Generator's scenario ceiling and scales its `maxTurns` (`types.ts:18-35`).

---

## 3. Live state — status & stage

Two enums track lifecycle at different granularities:

- **`RunStage`** (`types.ts:55`) — the fine-grained pipeline position:
  `queued → planning → generating → running → flake-check → healing → reporting → done`,
  plus the terminal `cancelled` / `error`.
- **`RunStatus`** (`types.ts:68`) — the coarse status the UI shows:
  `pending → running → completed | failed | cancelled`.

Stage and status move together: setting a stage auto-promotes status to
`running`; reaching a terminal state sets the matching coarse status. Every
mutation calls `touch()`, which refreshes `updatedAt`.

---

## 4. Progress trace — `ProgressEvent[]`

```ts
interface ProgressEvent {
  at: string; // ISO timestamp
  stage: RunStage; // which stage emitted it
  message: string; // human-readable progress line
  data?: Record<string, unknown>; // optional structured payload
}
```

Each pipeline stage emits events through `deps.emit(stage, message, data)`
(`src/orchestrator/orchestrate.ts`). The store appends them to `events`, and the
SSE stream replays them to the browser live (see §8).

---

## 5. Results — `RunReport`

The canonical, render-once-read-many results object (`types.ts:128`):

```ts
interface RunReport {
  runId;
  url;
  generatedAt;
  flows: Flow[]; // the planned user flows
  results: TestResult[]; // per-test outcomes
  coverage: CoverageSummary; // tested ÷ curated, missing flows
  flakeRate;
  healSuccessRate; // reliability metrics
  claudeCallCount; // how many Claude calls the run made
  successRate: SuccessRate; // passed ÷ planned
  fixPrompts: FixPrompt[]; // concrete "problem → change" prompts
  issues;
  recommendations;
  summary?; // AI-generated narrative
  planMarkdown;
  generatedSpecs; // the artifacts produced
}
```

A `TestResult` (`types.ts:92`) is the per-test execution record — `outcome`
(`passed | failed | flaky | healed | fixme`), plus `flaky`/`healed` flags set by
the flake-check and healing stages. Markdown and HTML reports both render _from_
this one JSON object — it is the single source of truth for results.

---

## 6. Where it's stored — three layers

The same `Run` lives in up to three places at once, each with a distinct job.
There is **no database** — storage is file-based by design for v1.

| Layer                | Location                                                                                                   | Role                                                                | Lifetime                 |
| -------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------ |
| **In-memory store**  | `src/runStore/store.ts` — `Map<string, Run>` pinned to `globalThis.__runStore`                             | Authoritative while the server is up; the hot path for live polling | Lost on restart          |
| **Disk persistence** | `src/runManager/persistence.ts` → `.runs/<id>/run.json`                                                    | Durable snapshot; whole `Run` re-serialized on every state change   | Until the run is removed |
| **Workspace files**  | `.runs/<id>/` (`specs/plan.md`, `tests/*.spec.ts`, `seed.spec.ts`, `playwright.config.ts`, `results.json`) | The actual generated artifacts + raw Playwright output              | Until the run is removed |

### The `.runs/<id>/` directory

Everything about one execution is co-located under one folder:

```
.runs/<id>/
├── run.json              # the entire Run object (metadata, state, events, report)
├── seed.spec.ts          # Playwright seed template
├── playwright.config.ts  # generated Playwright config
├── specs/
│   └── plan.md           # Planner's Markdown test plan
├── tests/
│   └── *.spec.ts         # Generator's Playwright tests
└── results.json          # raw Playwright JSON reporter output
```

### Why globalThis

The in-memory store is a `globalThis` singleton because Next.js duplicates module
instances across routes and HMR; a plain module-level `Map` would fragment into
several stores. Same reasoning applies to the Run Manager that wraps it.

---

## 7. How execution data flows (create → update → terminal)

The **Run Manager** (`src/runManager/manager.ts`) owns the lifecycle and enforces
one invariant: _every state transition is persisted._ Callers can't reach the
store directly, so persistence is a property of the owner, not a thing each route
must remember to do (see `run-manager-design.md`).

1. **Create** — `POST /api/runs` → `manager.start(config)`: create the `Run`
   (`pending` / `queued`), persist it immediately, register a stop-button
   (abort controller), kick off the background pipeline. Returns the id at once
   (`202 Accepted`).
2. **Emit** — each pipeline stage calls `emit(stage, message, data)` →
   `store.setStage()` / `store.addEvent()` → re-persist `run.json`.
3. **Terminal** — pipeline finishes → `store.complete(runId, report)`; on
   error/abort → `store.fail()` / `store.cancel()`. Final persist; stop-button
   cleaned up.

The store mutators (`src/runStore/store.ts`) — `create`, `setStage`, `addEvent`,
`complete`, `fail`, `cancel` — are pure in-memory operations; the Manager pairs
each with a disk save.

---

## 8. How execution data is read (the API surface)

| Route                       | Manager call                | Reads from                             | Notes                                           |
| --------------------------- | --------------------------- | -------------------------------------- | ----------------------------------------------- |
| `GET /api/runs`             | `manager.list()`            | memory + disk merged (**memory wins**) | dashboard list                                  |
| `POST /api/runs`            | `manager.start(config)`     | —                                      | validates `RunConfig`, returns id               |
| `GET /api/runs/[id]/report` | `manager.get(id)`           | memory, falling back to disk           | serves JSON / Markdown / HTML                   |
| `GET /api/runs/[id]/stream` | `manager.peek(id)`          | **memory only**                        | SSE, ~0.4s poll; never hits disk                |
| `DELETE /api/runs/[id]`     | `manager.cancel` + `remove` | —                                      | aborts, drops from memory, purges `.runs/<id>/` |

The `get` (durable, memory→disk) vs `peek` (in-memory-only) split keeps the live
progress stream off the filesystem during its tight polling loop.

---

## 9. Durability detail — inferring legacy runs

Disk is treated as a recoverable source of truth, not just a cache.
`loadOrInferRun` (`persistence.ts:97`) handles run folders that predate the
`run.json` convention: when metadata is missing it **synthesizes** a minimal
`Run` by inspecting the workspace —

- `results.json` present ⇒ status `completed` / stage `done`, otherwise
  `pending` / `queued`;
- the tested URL is recovered by grepping `page.goto('…')` out of any saved spec
  (`persistence.ts:140`);
- timestamps come from the directory's `birthtime` / `mtime`.

So even a run with no metadata file still surfaces correctly in the dashboard.

---

## 10. Design principles (why it's shaped this way)

1. **One vocabulary.** The `Run` / `RunConfig` / `RunReport` types in `types.ts`
   are the shared contract across every module.
2. **Persist after every transition — as an invariant.** Owned by the Run
   Manager, not enforced by convention in each caller.
3. **Memory authoritative live, disk authoritative after restart.** The
   "memory wins on merge" rule lives in exactly one place: `list()`.
4. **Best-effort saves.** Persistence logs but never throws — a disk hiccup
   can't crash a run.
5. **File-based, no DB (v1).** Each run is isolated under `.runs/<id>/`; fresh
   tests per run, acceptable to lose in-memory state on restart.
6. **Co-location.** Metadata, generated tests, and raw results share one
   per-run directory, so a run is a single self-describing folder.

---

## Related docs

- `run-manager-design.md` — who _owns_ this data and the lifecycle seam.
- `architecture-review.md` — the deepening candidates that produced the Run Manager.
- `spec.md` — the full requirement set (R1, R8, R11, R16, … referenced in `types.ts`).
