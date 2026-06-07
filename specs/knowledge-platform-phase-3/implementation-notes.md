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
