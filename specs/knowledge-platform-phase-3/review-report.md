# Review Report — Knowledge Platform · Phase 3 (Healing Memory & Playbooks)

> Stage 5 (Test & Tune) deliverable. Proves the work is correct, clean, and
> faithful to the Spec — "looks done" isn't done. Each layer gets a verdict
> backed by **evidence, not claims**.

- **Spec version reviewed:** v0.1.0
- **Date:** 2026-06-07
- **Reviewer:** Claude (Reviewer role) for tel@tarento.com
- **Branch:** `phase-3-healing-playbooks`

---

## Verdict summary

| Layer         | Question                | Verdict                                 |
| ------------- | ----------------------- | --------------------------------------- |
| 1 — Function  | Does it work?           | **PASS**                                |
| 2 — Quality   | Is it clean?            | **PASS**                                |
| 3 — Alignment | Does it match the Spec? | **PASS** (with accepted minor CONCERNS) |

**Overall recommendation:** **Ship it** — outcome metrics (M1/M2/M3) to be
confirmed later via `/craft-framework:measure` (data-gated, as in Phase 1/2).

---

## Layer 1 — Function (does it work?)

| Check / test                            | Result | Evidence                                                                                    |
| --------------------------------------- | ------ | ------------------------------------------------------------------------------------------- |
| Type safety (`tsc --noEmit`)            | Pass   | Clean, whole project.                                                                       |
| Full DB suite (`npm run test:db`)       | Pass   | **209 tests, 209 pass, 0 fail, 0 skipped** against real Postgres + pgvector.                |
| Migration `0003`                        | Pass   | `knowledge:migrate` → "Applied 1 migration(s): 0003\_…"; idempotent by `schema_migrations`. |
| No regression (Phase 1/2)               | Pass   | The 201 pre-existing DB tests remain green alongside the new ones.                          |
| Heal capture (pure)                     | Pass   | `heal/captureHeal.test.ts`, `signature.test.ts`, `strategy.test.ts`.                        |
| Precedent retrieval (hybrid + HNSW)     | Pass   | `heal/integration.test.ts` (semantic match via 384-d index), `healingPrecedents.test.ts`.   |
| Distillation → trusted playbook → no-op | Pass   | `distill/integration.test.ts` (AC10/AC11/AC17), `distill/cluster.test.ts`.                  |
| Additive-no-regression guard            | Pass   | `orchestrator/healPrompt.test.ts` — features-off prompt identical to Phase 2.               |

**Verdict: PASS** — every runnable layer is green against a real database; ~33
new tests, zero failures.

## Layer 2 — Quality (is it clean?)

- **Depth / deletion test.** The new modules are deep, not pass-throughs:
  `heal/{signature,strategy,captureHeal}`, `retrieve/healingPrecedents`,
  `distill/{cluster,promote,summarize,run}` each concentrate one real concern
  (deleting any would scatter logic, not concentrate it). Service methods are
  thin but consistent with the established `withKb` best-effort pattern and add
  real work (embed + score), so not shallow.
- **Safety.** All new reads/writes go through best-effort `withKb`; SQL is fully
  parameterized (the one dynamic fragment in `readSuccessfulHealingEvents` is a
  fixed `ORDER BY` string + `$n` placeholders, no interpolated input). Append-only
  events; playbooks upserted, never deleted — provenance retained.
- **Additive guarantee.** Load-bearing "never worse than Phase 2" is _proven_,
  not asserted: `healPrompt.test.ts` shows the Healer prompt is byte-identical
  with features off; disabled-service paths return empties.
- **Diagrams.** Substantive ASCII flow diagrams present and current in
  `captureHeal.ts`, `healingPrecedents.ts`, `cluster.ts`, and (restored this
  stage) `distill/run.ts`. The pre/post-heal snapshot and contextPack-injection
  points are documented with inline comments rather than dedicated diagrams —
  acceptable; noted as Minor.
- **Found & fixed during review:** `runs.crawl_mode` was never persisted, so the
  procedural-playbook aggregation (R15) was dead code. Fixed by threading
  `crawlMode` through `RunReport → buildReport → extract → persistRun`, with a new
  AC17 test. (See Layer 3.)

**Verdict: PASS** — clean, safe, deep; the one real defect (dead R15 path) was
fixed in-stage with a regression test.

## Layer 3 — Alignment (does it match the Spec?)

| Acceptance criterion                                       | Verifies     | Evidence                                                                                  | Verdict             |
| ---------------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------- | ------------------- |
| AC1 captureHealDeltas → one event/hunk                     | R1           | `captureHeal.test.ts`                                                                     | Pass                |
| AC2 strategy classifier                                    | R2           | `strategy.test.ts` (all 6 strategies)                                                     | Pass                |
| AC3 signature collapse                                     | R3           | `signature.test.ts` (ids/lines/timestamps)                                                | Pass                |
| AC4 migration 0003 + re-run no-op                          | R4,R9        | `knowledge:migrate` applied; runner idempotent                                            | Pass                |
| AC5 persist events; re-ingest no dup                       | R4,N5        | `heal/integration.test.ts` idempotent test                                                | Pass                |
| AC6 embedder throws → null emb, commits                    | R5,R13       | `heal/integration.test.ts` throwing-embedder test                                         | Pass                |
| AC7 precedent nearest successful, app-scoped, hybrid       | R6           | `heal/integration.test.ts` + `healingPrecedents.test.ts`                                  | Pass                |
| AC8 healer prompt has precedent / unchanged when none      | R7,N2        | `healPrompt.test.ts`                                                                      | Pass                |
| AC9 generator pack has locator hint                        | R8           | `healingPrecedents.test.ts` `deriveLocatorHints` + wiring                                 | Pass                |
| AC10 distill writes playbook w/ principle+evidence+support | R9,R10,R14   | `distill/integration.test.ts`                                                             | Pass                |
| AC11 second distill no-op                                  | R9,N5        | `distill/integration.test.ts` no-op test                                                  | Pass                |
| AC12 no API key → template principle                       | R10          | `cluster.test.ts` template-fallback test                                                  | Pass                |
| AC13 support≥N→trusted; below→episodic                     | R11,R16      | `cluster.test.ts` promote + `distill/integration.test.ts`                                 | Pass                |
| AC14 only trusted injected; episodic never                 | R11,R12,N6   | `readTrustedPlaybooks` `WHERE status='trusted'`; integration asserts all trusted          | Pass                |
| AC15 budgeted block into Planner/Generator/Healer          | R12          | `healPrompt.test.ts` (Healer) + `formatPlaybooks` budget + Generator/Planner wiring (tsc) | Pass                |
| AC16 disabled → identical to Phase 2                       | R13,N2       | `healPrompt.test.ts` + disabled-service tests                                             | Pass                |
| AC17 procedural app playbook                               | R15          | `distill/integration.test.ts` procedural test (after crawl_mode fix)                      | Pass                |
| AC18 contradicted trusted demoted, not deleted             | R11,R14,SC16 | `cluster.test.ts` `nextStatus` demotion; upsert retains `evidence_run_ids`                | Pass (unit-level)   |
| AC19 capture ≤200ms; precedent ≤300ms warm                 | N1,N4        | Not explicitly timed                                                                      | **CONCERN (minor)** |

**Drift check** (read `implementation-notes.md`):

- **Built but not specified:** none. (The diff-based capture, global-vs-app
  playbook scoping, and injected-summarizer seam are all Plan/ADR decisions.)
- **Specified but not built:** **T23 — M1/M2/M3 calibration** is deferred to
  `/measure`. It needs the labeled recurring-failure set (DEP4) and live runs;
  thresholds ship as documented provisional constants. Same deferral pattern
  Phase 1/2 used for their outcome metrics — an **accepted CONCERN**, not missing
  behavior.
- **Intent legitimately changed?** No spec change required. R15 was always
  specified (Should); review fixed its wiring rather than re-scoping it. Spec
  stays **v0.1.0**.

**Verdict: PASS** — all 14 Must requirements (R1–R14) have passing ACs; both
Shoulds (R15, R16) covered. Two minor accepted CONCERNS (AC19 timing not
measured; M1/M2/M3 deferred to `/measure`).

---

## Issues by severity

| Severity | Issue                                                               | Affected | Action                                                                                                                       |
| -------- | ------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Blocker  | none                                                                | —        | —                                                                                                                            |
| Major    | Procedural playbooks (R15) were dead — `crawl_mode` never persisted | R15/AC17 | **Fixed in-stage**: threaded `crawlMode` end-to-end + AC17 test                                                              |
| Minor    | NFR timings (N1 ≤200ms, N4 ≤300ms) not explicitly measured          | AC19     | Capture is pure/local and retrieval is one indexed query — plausible; add a timing assertion in a follow-up or at `/measure` |
| Minor    | M1/M2/M3 metrics + threshold calibration deferred                   | T23/R16  | Run `/craft-framework:measure` after DEP4 + live tarento.com runs                                                            |
| Minor    | A couple of Plan-named diagram spots use inline comments, not ASCII | —        | Acceptable; substantive flow diagrams present                                                                                |

---

## Recommendation

- [x] **Ship it** — all layers PASS (only minor, accepted CONCERNS).
- [ ] Loop back to Stage 1 / 2 / 3.

Shipping proves the work was _built correctly_. Outcome metrics (heal-precedent
reuse ≥60%, bad-fix propagation ≤5%, trusted-playbook precision ≥90%) require
real repeat runs — close the loop with `/craft-framework:measure` once the
labeled set exists and Phase 3 has run live.

## Learnings to record

- Diff-based heal capture (no agent change, no hot-path LLM) integrated cleanly
  on the existing pre/post-heal seam — the ADR-0004 bet held.
- A new requirement that reads an existing column (R15 ← `runs.crawl_mode`) can be
  silently dead if nothing ever _wrote_ that column. Review's "trace the data to
  its source" caught it; worth a default check when a Should depends on legacy
  schema.
- Integration fakes must match the `vector(384)` dimension or best-effort `withKb`
  hides the rollback as "0 rows" — a quiet failure mode to watch.

---

_Stage 5 (Test & Tune) artifact. Present at the final Human Gate for the
ship / loop-back decision. Update `STATE.md` with the outcome._
