# Deepening Design — The Run Manager (Candidate B)

**Date:** 2026-05-29
**Source:** `architecture-review.md` → Candidate B (Top recommendation)
**Status:** ✅ Built directly on 2026-05-29 — typecheck clean, 68 unit tests pass
(9 new for the Run Manager + persistence), production build compiles all routes.

This document is the outcome of the grilling loop on Candidate B. It defines the
**shape** of the deepened module — its seam, what sits behind it, what's
injected, and what changes in the callers — so a future build pass has an
unambiguous target.

---

## The problem being solved (recap)

A run's live state is split across **three representations** kept in sync by hand:
the in-memory store (`globalThis.__runStore`), a parallel abort-controller map
(`globalThis.__runAborts`), and disk (`.runs/<id>/run.json`). "Persist after every
transition" is enforced by convention — `runService` calls `persistRun(...)` by
hand after every mutation — so a forgotten call silently drifts disk from memory
and can show users a wrong status. The "memory-then-disk" reconciliation is
re-derived per API route.

**Deletion test:** delete the proposed owner and this glue (per-transition
persistence, abort registration, memory-vs-disk reconciliation) reappears across
every route — confirming it concentrates real, currently-duplicated complexity.

---

## The deepened module: **Run Manager**

A single module owns a run's whole life. Callers use a small interface and never
touch the underlying records.

### Interface (the seam = the test surface)

| Operation       | Async?              | Used by                 | Behaviour                                                                  |
| --------------- | ------------------- | ----------------------- | -------------------------------------------------------------------------- |
| `start(config)` | sync (returns id)   | `POST /api/runs`        | create record, register stop-button, kick off background pipeline, persist |
| `cancel(id)`    | sync (returns bool) | `DELETE` (when live)    | abort the work, mark cancelled, persist                                    |
| `remove(id)`    | async               | `DELETE /api/runs/[id]` | remove from memory **and** purge disk workspace                            |
| `get(id)`       | async               | `GET .../report`        | look up one run: memory first, fall back to disk                           |
| `list()`        | async               | `GET /api/runs`         | all runs, memory + disk merged; **memory wins**                            |
| `peek(id)`      | sync                | `GET .../stream` (SSE)  | in-memory-only, instant; for the 0.4s polling loop                         |

The `get`/`peek` split is deliberate: routes need the durable memory-then-disk
view; the progress stream polls in a tight loop and only ever watches a still-live
(in-memory) run, so it must not hit disk 2–3×/second.

### Behind the seam (private — callers never see these)

- the in-memory record (the existing **pure** `RunStore`, unchanged in spirit),
- the per-run stop-buttons (abort controllers) — the `__runAborts` map, folded in,
- the disk-saving adapter,
- the background pipeline runner.

We go from **two global maps + scattered saving** to **one Run Manager** (still a
`globalThis` singleton, because Next.js duplicates module instances across routes
and HMR — same reason the store is global today).

### Injected for tests (the adapters)

- **pipeline runner** (`runToReport`) — so lifecycle tests don't run a real browser/Claude,
- **disk-saving adapter** (save / list / purge `run.json`) — so tests use a fake or temp dir,
- (optional) **clock** — for deterministic timestamps.

### The invariant the Run Manager guarantees

> Every state transition is persisted, and every started run has a registered
> stop-button that is cleaned up when the run reaches a terminal state.

Callers **cannot** violate this, because they can no longer reach the store
directly. Persistence stops being a caller responsibility and becomes a property
of the owner.

---

## Design decisions (crystallized in the grilling loop)

1. **Pure store, wrapped.** `runStore/store.ts` stays a plain in-memory structure
   with no disk knowledge. The Run Manager holds it privately and adds
   coordination. Keeps the store trivially testable; makes the Manager the sole
   owner of the sync rule.
2. **`get`/`list` async (memory→disk); `peek` sync (memory-only).** Keeps the
   polling hot-path cheap.
3. **Authority model.** Memory is authoritative while a run is live; disk takes
   over after a restart. Saving is best-effort (logs, never throws). The
   "memory wins on merge" rule lives in **one** place — inside `list()`.
4. **Untangle A from B (user choice: "absorb it").** `persistRun`,
   `listPersistedRuns`, `getRunsRoot` **move out of** `workspace.ts` into the Run
   Manager's saving adapter. `workspace.ts` is left owning only a run's _test
   files_ (create workspace, read plan, read generated specs) — clean Candidate-A
   territory.
5. **Live progress unchanged (user choice: "keep polling").** The SSE stream keeps
   its 0.4s cadence but asks `manager.peek(id)` instead of the raw store. The
   deepening is about ownership, not about rewriting the progress transport.

---

## Caller changes (the leverage)

| Caller                  | Before                                                            | After                   |
| ----------------------- | ----------------------------------------------------------------- | ----------------------- |
| `POST /api/runs`        | `startRun(config)`                                                | `manager.start(config)` |
| `DELETE /api/runs/[id]` | `cancelRun` + `store.remove` + `rm` dir                           | `manager.remove(id)`    |
| `GET /api/runs`         | `store.list()` + `listPersistedRuns()` + hand-rolled `byId` merge | `manager.list()`        |
| `GET .../report`        | `store.get(id)` ?? `listPersistedRuns().find(...)`                | `manager.get(id)`       |
| `GET .../stream`        | `store.get(id)` (raw)                                             | `manager.peek(id)`      |

The memory-vs-disk reconciliation, today duplicated in the list and report routes,
is written **once** inside the Manager.

---

## What the new test surface unlocks

Today the lifecycle is only exercisable by reaching into `globalThis` and the
filesystem. Through the Run Manager's seam (fake pipeline runner + fake saving
adapter), these become straightforward unit tests:

- start → progress event → `peek` reflects it; disk has the latest snapshot,
- start → `cancel` → status is `cancelled`, stop-button fired, disk persisted,
- start → complete → drop the in-memory copy (simulate restart) → `get` rebuilds
  it from disk,
- `list()` merge: a run live in memory and stale on disk → memory version wins,
- `remove` → gone from both memory and disk.

---

## Human Gate — not building yet

Proposing this deepening is the deliverable. This is a **contained refactor**
(one new module, file moves out of `workspace.ts`, five call-site swaps, no
behaviour change visible to users), so it can either be built directly or run
through a short C.R.A.F.T. **Record → Assemble → Forge** pass if you want the
usual spec/tasks rigor and per-task commits. Your call.
