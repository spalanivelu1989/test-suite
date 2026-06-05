# Review Report — Knowledge Platform · Phase 2 (Semantic Test Reuse)

> Stage 5 (Test & Tune) deliverable. Proves the work is correct, clean, and
> faithful to the Spec — "looks done" isn't done. Each verdict is backed by
> evidence, not claims.

- **Spec version reviewed:** v0.1.0
- **Date:** 2026-06-05
- **Reviewer:** Claude (Reviewer role)

---

## Verdict summary

| Layer         | Question                | Verdict  |
| ------------- | ----------------------- | -------- |
| 1 — Function  | Does it work?           | PASS     |
| 2 — Quality   | Is it clean?            | PASS     |
| 3 — Alignment | Does it match the Spec? | CONCERNS |

**Overall recommendation:** **Ship it** — all 13 acceptance criteria pass with
evidence; the Layer-3 CONCERNS are the human-verification-pending labeled set and
the post-ship live measurement (by design via `/measure`), not defects.

---

## Layer 1 — Function (does it work?)

| Check / test                       | Result | Evidence                                                                                                    |
| ---------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------- |
| Type safety                        | Pass   | `npm run typecheck` clean                                                                                   |
| Full suite (with DB)               | Pass   | `npm run test:db` → **162 tests, 162 pass, 0 fail**                                                         |
| CI-safe (no DB)                    | Pass   | `npm run test:unit` → 143 pass, 19 DB-tests skip cleanly                                                    |
| Real-model geometry                | Pass   | smoke: paraphrase 0.79 vs unrelated 0.46 (clear separation)                                                 |
| **M1/M2 calibration (real model)** | Pass   | `knowledge:calibrate` → **95% paraphrase recall at 0% false-reuse** (SEM_EXTEND=0.60) — clears M1≥70%/M2≤5% |
| **N1 warm latency (real model)**   | Pass   | warm embed of 5 scenarios = **3.8 ms** (budget 500 ms)                                                      |
| Backfill idempotency               | Pass   | run 1 re-embedded 180 runs; run 2 "Nothing to backfill"                                                     |

**Verdict: PASS** — comprehensive automated evidence plus real-model measurements
of the two things that mattered most (recall/precision and latency).

## Layer 2 — Quality (is it clean?)

**Additive design (the load-bearing property).** The hybrid `decideForSpecs` is a
pure function with `embedding` optional; with `sem = 0` it provably reduces to the
exact Phase 1 lexical decider. This makes "never worse than Phase 1" (R8/N3) a
literal diff test (AC7), and the 6 Phase 1 lexical tests pass unchanged under the
hybrid decider — strong evidence of a clean, non-regressive extension.

**Module depth.** `Embedder` is a deep module (a model behind a 3-method
interface), swappable for `FakeEmbedder` or a hosted provider. The vector
serialization, NN query, and cache live behind `repo.ts` behavioral ops — callers
never touch SQL or pgvector syntax. No shallow pass-throughs.

**Diagrams.** `ingestRun.ts` (embed-at-ingest) and `coverageDecision.ts` (hybrid
branching + the additive guarantee) carry accurate inline diagrams. **Finding
(fixed during review):** the plan named `index.ts`/`assembleContext` for a
query-time/degrade diagram that was missing — added it this review.

**Safety.** Every embedding call is best-effort (`withKb`); embedder failure,
pgvector absence, or model-load failure all degrade to lexical, never throw. App-
scoped queries throughout. No UI in this phase.

**Verdict: PASS** — deep modules, a provable additive-safety design, diagrams now
complete and accurate.

## Layer 3 — Alignment (does it match the Spec?)

| Acceptance criterion                                     | Verifies | Evidence                                                                 | Verdict |
| -------------------------------------------------------- | -------- | ------------------------------------------------------------------------ | ------- |
| AC1 migration: extension + columns + HNSW, re-run no-op  | R2       | `knowledge:migrate` applied 0002; re-run "No pending"; idempotent runner | Pass    |
| AC2 Embedder → 384-d L2-norm vectors; fake substitutable | R1       | `embed.test.ts` + smoke (384-len unit vector)                            | Pass    |
| AC3 ingest cache by content_hash (no re-embed)           | R3,N5    | integration "cached by content_hash" (1 embed call across 2 ingests)     | Pass    |
| AC4 embedder throws → null embedding, no error           | R3,R8    | integration "degradation: embedder throws"                               | Pass    |
| AC5 hybrid: reuse/extend/new/near-threshold              | R5       | `coverageDecision.test` hybrid cases                                     | Pass    |
| AC6 high-lex/low-sem still reuse/extend                  | R5,R8    | Phase 1 lexical tests pass under hybrid + no-regression test             | Pass    |
| AC7 embeddings off ⇒ identical to lexical                | R8,N3    | "ADDITIVE no-regression" test                                            | Pass    |
| AC8 findSimilarSpecs ranks nearest first                 | R6       | integration "findSimilarSpecs ranks the semantically-nearest first"      | Pass    |
| AC9 Generator skips paraphrased duplicate                | R7       | integration "paraphrase on a 2nd run → reuse" + Phase 1 copy/skip wiring | Pass    |
| AC10 backfill populates + idempotent                     | R4       | manual: 180 re-embedded, then "Nothing to backfill"                      | Pass    |
| AC11 model-mismatch re-embed                             | R9       | integration "model switch re-embeds" (embedding_model → m2)              | Pass    |
| AC12 retrieval+embed ≤500 ms warm                        | N1       | integration ≤500 ms (fake) + **real model 3.8 ms**                       | Pass    |
| AC13 ≥70% recall AND ≤5% false-reuse on labeled set      | R5,R10   | calibration **95% / 0%** (⚠ synthetic, human-verify pending)             | Pass\*  |

**NFRs:** N1 (3.8 ms real + fake test), N2 (lazy-load + cache), N3 (no-regression
diff), N4 (determinism test), N5 (completeness query) — each verified.

**Drift check** (from `implementation-notes.md`):

- **Built but not specified:** none. Every module traces to R1–R10.
- **Specified but not built:** none of the ACs. The **live** M1/M2 numbers (vs.
  real tarento.com runs) are not yet measured — by design, via `/measure`.
- **Decisions/interpretations (accepted):**
  1. **Calibrated thresholds** SEM_REUSE=0.82, SEM_EXTEND=0.60 (Q2 resolved) —
     recorded with the sweep result. Confirms **ADR-0002**: local bge-small is
     sufficient; the Voyage contingency was not needed.
  2. **Symmetric embedding** (no bge query prefix) — recall did not underperform,
     so retained.
  3. **Global content-hash embedding cache** — correct, efficient; noted.
- **Intent legitimately changed?** No requirement changed. New spec version: **n/a**.

**Verdict: CONCERNS** — all 13 ACs pass; AC13's number rests on a
**Claude-generated labeled set that still needs human verification**, and live
M1/M2 await `/measure`. Neither blocks shipping the mechanism.

---

## Issues by severity

| Severity | Issue                                                                              | Affected     | Action                                                                                                           |
| -------- | ---------------------------------------------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------- |
| Blocker  | none                                                                               | —            | —                                                                                                                |
| Major    | M1/M2 numbers rest on a synthetic, unverified labeled set; live numbers unmeasured | M1, M2, AC13 | **Human-verify `fixtures/paraphrase-set.json`**, then `/measure` after two real tarento.com runs                 |
| Minor    | AC12 automated test uses the fake embedder                                         | N1           | Mitigated — real-model warm latency measured manually (3.8 ms); a nightly real-model timing would close it fully |
| Minor    | Plan-named `index.ts` inline diagram was missing                                   | —            | Fixed during this review                                                                                         |
| Minor    | Labeled set is small (20 paraphrases / 8 negatives)                                | M1,M2        | Expand + diversify before trusting the production number                                                         |

---

## Recommendation

- [x] **Ship it** — all layers acceptable; the single Major is a post-ship
      measurement + human-verification step, not a build defect.
- [ ] Loop back to Stage 1 / 2 / 3.

## Learnings to record

- A real-model calibration harness turned an abstract target ("≥70% recall") into
  a concrete, tunable result (95% / 0%) and _picked_ the threshold from data — far
  better than guessing a constant. Build the measurement harness as part of the
  feature, not after.
- The "additive, pure-function-with-optional-input" pattern made the
  never-worse-than-baseline guarantee a one-line diff test. Reuse it whenever
  layering a new signal onto an existing decision.
- A metric whose ground truth is AI-generated must carry a visible "needs human
  verification" flag, or the number reads as more trustworthy than it is.

---

_Stage 5 (Test & Tune) artifact. Present at the final Human Gate for the
ship / loop-back decision. Update `STATE.md` with the outcome._
