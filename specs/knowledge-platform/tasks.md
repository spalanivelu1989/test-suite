# Tasks — Knowledge-Driven Testing Platform · Phase 1

> Stage 3 (Assemble) deliverable. The ordered, traceable build checklist that
> pairs with `plan.md`. Each task is small (one clear outcome).

- **Targets Spec version:** v0.1.0
- **Status:** Approved
- **Last updated:** 2026-06-05

**Legend:** `[ ]` todo · `[x]` done · `[P]` may run in parallel with other `[P]`
tasks at the same dependency level.

---

## Task list

### T1 — Postgres client, pool, and env contract [P]

- **Covers:** R2, N1
- **Depends on:** —
- **Parallel:** yes
- **Done-when:** `pg` added; `KNOWLEDGE_DATABASE_URL` read from env (`.env.example` updated); `src/knowledge/store/db.ts` exports `getPool()` (a single `pg.Pool` stashed on `globalThis`, mirroring `getRunStore`) and a `healthCheck()`; a connectivity smoke test passes against a local/Neon DB.

### T2 — SQL migration runner + initial schema

- **Covers:** R2 (I2)
- **Depends on:** T1
- **Parallel:** no
- **Done-when:** `store/migrate.ts` applies forward-only files from `store/migrations/`; `0001_init.sql` creates `apps, runs, specs, flows, plan_scenarios, test_results, coverage_snapshots, edges, raw_reports(JSONB)` with B-tree indexes on `app_id/run_id/outcome/created_at` and the documented keys; running the migration on an empty DB yields the full schema; re-running is a no-op.

### T3 — KnowledgeService interface + shared types [P]

- **Covers:** R1 (I1, I4, I6)
- **Depends on:** —
- **Parallel:** yes
- **Done-when:** `src/knowledge/types.ts` defines `KnowledgeService`, `ContextPack`, `CoverageDecision`, `AppProfile`, `CoverageMap`, `KnowledgeEvent`; `index.ts` exports `createKnowledgeService()` returning a safe **no-op default** (used when the KB is disabled); `tsc --noEmit` clean.

### T4 — App-origin normalization [P]

- **Covers:** R5
- **Depends on:** —
- **Parallel:** yes
- **Done-when:** `appId.ts normalizeOrigin(url)` lowercases, drops leading `www.`, strips path/query/fragment/trailing slash; unit-proven that `http://www.x.com/`, `https://x.com/p?q=1` → same id and a different origin → different id (AC5).

### T5 — `withKb` best-effort wrapper

- **Covers:** R4, N3
- **Depends on:** T3
- **Parallel:** no
- **Done-when:** `safety.ts withKb(fn, fallback)` runs `fn`, and on any throw/timeout logs and returns `fallback` — never rethrows; unit-proven a throwing fn yields the fallback and emits a log, not an exception.

### T6 — Repository upserts (idempotent) + edges

- **Covers:** R2, R3, N5
- **Depends on:** T2, T3
- **Parallel:** no
- **Done-when:** `store/repo.ts` writes apps/runs/specs/flows/plan_scenarios/test_results/coverage_snapshots/edges with `ON CONFLICT … DO UPDATE` keyed so re-writing a run produces no duplicates; every write/read is scoped by `app_id`; raw `RunReport` stored to `raw_reports` as JSONB (AC15).

### T7 — RunReport extractor [P]

- **Covers:** R3
- **Depends on:** T3, T4
- **Parallel:** yes
- **Done-when:** `ingest/extract.ts` maps a `RunReport` → entity rows (app via `normalizeOrigin`, run, specs from `generatedSpecs`, flows, plan-scenarios, results, coverage); **defensive** — missing/malformed fields are skipped, never thrown (RK5); unit-proven on a full and a partial `RunReport`.

### T8 — `ingestRun` (idempotent, best-effort)

- **Covers:** R3, R11, N1, N2
- **Depends on:** T5, T6, T7
- **Parallel:** no
- **Done-when:** `ingest/ingestRun.ts` runs extract→upsert in one transaction, idempotent by `runId`, wrapped in `withKb`; ingesting the same report twice yields one run + no dup children (SC2/AC2); carries the inline ASCII pipeline diagram (per plan).

### T9 — Wire ingestion at the run-completion seam

- **Covers:** R11
- **Depends on:** T8
- **Parallel:** no
- **Done-when:** `orchestrate.ts` calls `knowledge.ingestRun(report)` after `buildReport`, threading a `KnowledgeService` through deps; a completed run produces queryable rows (AC1); with the KB unreachable the run still completes and reports, error logged not thrown (AC3).

### T10 — AppKnowledge aggregate read query

- **Covers:** R6, R7, N5
- **Depends on:** T6
- **Parallel:** no
- **Done-when:** `repo.ts` exposes one app-scoped query returning known pages, flows with last outcome, and coverage for an `appId`; a cross-app test shows only the queried app's data (AC16/N5).

### T11 — `getAppProfile` / `getCoverageMap` [P]

- **Covers:** R6, R7
- **Depends on:** T10
- **Parallel:** yes
- **Done-when:** `retrieve/appProfile.ts` projects the aggregate into `getAppProfile(url)` (pages, covered flows + last outcome, gaps — AC6) and `getCoverageMap(appId)` (covered vs uncovered known flows — AC7); both `withKb`-safe (empty result when KB down/cold).

### T12 — `planCoverageDecision` (reuse | extend | new) [P]

- **Covers:** R9
- **Depends on:** T4, T10
- **Parallel:** yes
- **Done-when:** `retrieve/coverageDecision.ts` scores each scenario vs existing specs/flows by **overlap-coefficient** on `significantTokens` (reuse `coverage.ts`); thresholds reuse ≥0.80 & last-passed / extend 0.45–0.80 / new <0.45, **near-threshold → new**; returns `{action, matchedSpec?, score, lastOutcome?}`; unit-proven exact→reuse, partial→extend, none/paraphrase→new (AC9/SC7-9); carries the inline decision diagram.

### T13 — Token-bounded context-pack assembler

- **Covers:** R8, R10, N4
- **Depends on:** T11, T12
- **Parallel:** no
- **Done-when:** `assemble/contextPack.ts` builds a Planner pack (≤~1200 tok: known flows + gaps) and a Generator pack (≤~2000 tok: decisions + existing spec refs), ranked recency+passRate then truncated; cold/KB-down → empty packs; carries the inline retrieval/degradation diagram.

### T14 — Inject Planner context pack

- **Covers:** R8
- **Depends on:** T13
- **Parallel:** no
- **Done-when:** `stages.ts planTests` prepends the `withKb`-fetched Planner pack to the planner prompt; on a 2nd run the prompt contains a bounded knowledge block naming covered flows/gaps (AC8); a `KnowledgeEvent` announces what was loaded.

### T15 — Inject Generator pack + copy reused specs

- **Covers:** R10
- **Depends on:** T13
- **Parallel:** no
- **Done-when:** `stages.ts generateTests` injects the decisions + existing specs; scenarios marked `reuse` are **not** re-emitted and their prior spec is **copied** into `.runs/<id>/tests/` tagged `reused` (D4); only `new`/`extend` are generated (AC10); decisions surfaced as events.

### T16 — Unit tests (no DB) [P]

- **Covers:** R4, R5, R8, R9, R10, N3
- **Depends on:** T4, T5, T7, T12, T13
- **Parallel:** yes
- **Done-when:** `tsx --test` suites for `appId`, `withKb`, `extract`, `coverageDecision`, `contextPack` pass (incl. AC5, AC9, paraphrase→new, empty-pack-when-cold); no Postgres required.

### T17 — Integration tests vs test Postgres [P]

- **Covers:** R3, R6, R7, N1
- **Depends on:** T8, T11
- **Parallel:** yes
- **Done-when:** against a disposable test DB (per-test transaction rollback): `ingestRun`→query round-trip (AC1), double-ingest idempotency (AC2), `getAppProfile`/`getCoverageMap` (AC6/AC7), and ingest-completeness count (N1) pass.

### T18 — NFR tests: rebuild, degradation, latency, isolation [P]

- **Covers:** R12, N2, N3, N4, N5
- **Depends on:** T8, T11, T13
- **Parallel:** yes
- **Done-when:** replay-into-fresh-DB reproduces identical entity counts/keys (AC12/N2); failing-pool run completes with errors logged not thrown (AC3/N3); `getAppProfile`+`planCoverageDecision` timed ≤500ms (AC13/N4); two-app seed shows no cross-app leakage (AC16/N5).

### T19 — Cold/degraded regression guard

- **Covers:** R4
- **Depends on:** T14, T15
- **Parallel:** no
- **Done-when:** a first-ever-run (no history) and a KB-unreachable run both produce pipeline output matching a no-knowledge run — empty packs, no errors, no behavior change (AC11/AC4/SC10/SC4).

### T20 — Interface-substitution check

- **Covers:** R1
- **Depends on:** T9, T14, T15
- **Parallel:** no
- **Done-when:** substituting a fake `KnowledgeService` in a test changes the injected context packs with **no other pipeline edits**, proving the pipeline consumes the KB only via the interface (AC14/C3).

---

## Coverage matrix — requirements → tasks

| Requirement | Covered by task(s) | Covered? |
| ----------- | ------------------ | -------- |
| R1          | T3, T20            | ✅       |
| R2          | T1, T2, T6         | ✅       |
| R3          | T6, T7, T8, T17    | ✅       |
| R4          | T5, T16, T19       | ✅       |
| R5          | T4, T16            | ✅       |
| R6          | T10, T11, T17      | ✅       |
| R7          | T10, T11, T17      | ✅       |
| R8          | T13, T14           | ✅       |
| R9          | T12, T16           | ✅       |
| R10         | T13, T15           | ✅       |
| R11         | T8, T9             | ✅       |
| R12         | T8, T18            | ✅       |
| N1          | T1, T8, T17        | ✅       |
| N2          | T8, T18            | ✅       |
| N3          | T5, T18, T19       | ✅       |
| N4          | T13, T18           | ✅       |
| N5          | T6, T10, T18       | ✅       |

> **Gate check:** every requirement and NFR maps to ≥1 task (no gaps); every task
> (T1–T20) cites a requirement/NFR (no scope creep). Open questions Q1–Q5 are
> resolved as plan decisions D8/D2/D5/D7/D4 — their calibration (thresholds Q2,
> metric labels Q1) lands during Forge and is recorded in `implementation-notes.md`.

---

_Stage 3 (Assemble) artifact. Approve alongside `plan.md` at the Human Gate, then
proceed to `/craft-framework:forge`. The Builder works tasks in dependency order,
dispatching `[P]` tasks in parallel where possible._
