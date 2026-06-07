# Implementation Notes — Knowledge Platform · Phase 3

> Stage 4 (Forge) running log. Dated entries for decisions the Spec/Plan left
> open, tradeoffs, and anything that diverged from the Plan. Short by design.

---

## 2026-06-07 — Forge kickoff (branch `phase-3-healing-playbooks`)

- **Batching of the task list.** The Plan's tasks T1–T12 (Phase 3a) are tightly
  coupled through the `KnowledgeService` interface — adding a method forces both
  `DisabledKnowledgeService` and `PgKnowledgeService` to move together to keep
  `tsc` green. So I build 3a as one coherent vertical slice and run the checks
  (`tsc --noEmit` + `npm run test:unit`) at the slice boundary, committing as one
  atomic unit, rather than fragmenting per-file in a way that never compiles in
  between. Same approach for 3b. Each task's _outcome_ is still met and tracked
  in `tasks.md`; the atomic save is per-slice, not per-file.

## 2026-06-07 — Phase 3a (healing memory) built

- **Heal capture seam (T7).** Confirmed `orchestrate.ts` already re-reads specs
  post-heal; added a `preHealSpecs = readGeneratedSpecs(ws)` snapshot _before_
  `healTests` and diff the two with `captureHealDeltas`. No Healer-agent change
  (ADR-0004 holds).
- **`HealingEvent` lives in `knowledge/types.ts`; `RunReport` references it via a
  `import type` (erased at compile).** Avoids a runtime import cycle between the
  root `types.ts` and `knowledge/types.ts`. `TestResult` stayed in root types, so
  capture imports it from `../../types`.
- **Failure-signature normalizer order matters (T2).** Must strip ISO datetimes
  first, then `file:line:col`, then bare clock-times — otherwise the clock-time
  rule eats `42:13` out of a file location and the `.ts` leaks into the
  signature. Locked by a unit test.
- **Precedent threshold = 0.6 (`PRECEDENT_THRESHOLD`), provisional.** Mirrors the
  Phase-2 reuse bar's spirit; real calibration is T23 against the labeled
  recurring-failure set. Recorded here so it's not mistaken for a tuned value.
- **HNSW narrows, JS scores (D7).** `readSuccessfulHealingEvents` returns the
  actual `failure_embedding` vectors (not just HNSW order) so the pure
  `selectPrecedents` computes real hybrid lexical-OR-cosine — keeps the
  additive-no-regression property trivially testable.
- **BLOCKER (environment, not design): local Postgres down.** `postgresql@18`
  (brew) is in an error state and the project's `KNOWLEDGE_DATABASE_URL` points at
  `:5433` while the service tries to bind `:5432`. Could not run the DB
  integration tests (T12) in this session; they are written and **auto-skip**
  without a DB (same gate as Phase 2). tsc is clean and all 166 runnable unit
  tests pass. Action: start Postgres on :5433, run `npm run knowledge:migrate`
  (applies `0003`) then `npm run test:db`.

## 2026-06-07 — Phase 3b (playbook distillation) built

- **Distill core extracted to `distill/run.ts`; CLI is a thin wrapper.** Mirrors
  the Phase-2 calibrate pattern (testable core + thin `bin/`). The DB integration
  test calls `runDistillation(pool, opts)` directly.
- **Recluster-over-all, watermark-as-gate (D3).** Rather than incrementally
  merging support, each run reclusters ALL healed episodes (correct, stable
  support counts) but is gated by the watermark: zero new heals since last run →
  no-op. Keeps idempotency simple and support math obviously correct.
- **Heal-derived playbooks are `global`; procedural playbooks are `app`.** A
  locator/wait lesson learned on one app applies everywhere, so heal principles
  use scope `global:all`; "which crawl mode covers this app" is inherently
  app-scoped. Injection queries both (global + app) for each agent.
- **Summarizer is injected, not imported (C4).** `summarizeCluster(cluster,
summarize?)` takes an optional `(prompt)=>Promise<string>`. The CLI wires
  `createClaudeClient` only when `ANTHROPIC_API_KEY` is set; tests pass a fake or
  omit it (template fallback). No hard Claude dependency in the core.
- **Contradiction signal is computed in clustering.** A signature healed by >1
  strategy across runs marks each cluster's `contradictions`, which `nextStatus`
  uses to demote — satisfies AC18 deterministically without extra tracking.
- **Provisional thresholds (calibration deferred — T23).** `PRECEDENT_THRESHOLD`
  0.6, `CLUSTER_THRESHOLD` 0.6, `PROMOTE_SUPPORT_N` 2 are named constants. Real
  M1/M2/M3 calibration needs the labeled recurring-failure set (DEP4) and repeat
  tarento.com runs — deferred to `/craft-framework:measure`, the same pattern
  Phase 1/2 used for their outcome metrics. Not fabricating numbers here.

## 2026-06-07 — Forge status

- **Built & verified (code):** T1–T22 — all of Phase 3a + 3b + the additive-no-
  regression guard (T21) + ADRs (T22). `tsc --noEmit` clean; **181 unit tests
  pass, 0 fail** (26 DB-gated tests auto-skip without Postgres).
- **Pending:** T23 (metrics calibration — needs DEP4 labeled set + live runs →
  `/measure`).

## 2026-06-07 — DB blocker resolved; full DB suite green

- Brought `postgresql@18` up on **:5433** directly (`pg_ctl -o "-p 5433"`; its
  `postgresql.conf` defaults to 5432, which is why the brew service mismatched).
  Created/where-present the `knowledge` DB, confirmed pgvector 0.8.x, ran
  `knowledge:migrate` → **`0003` applied cleanly**.
- **`npm run test:db`: 207 tests, 207 pass, 0 fail, 0 skipped.** Validates
  migration 0003, healing-event persist + idempotency (re-ingest no-dup),
  semantic precedent retrieval through the 384-d HNSW index, and the full
  distillation → trusted-playbook → second-run-no-op flow. No regression in the
  201 Phase-1/2 DB tests.
- **Gotcha:** integration `FakeEmbedder` must be constructed with **dims=384**
  (it pads) to match the `vector(384)` columns; a 3-d fake makes the insert throw
  and best-effort `withKb` silently rolls back (0 rows). Matches the Phase-2
  `semantic.integration.test.ts` pattern.
