# Review Report — Knowledge-Driven Testing Platform · Phase 1

> Stage 5 (Test & Tune) deliverable. Proves the work is correct, clean, and
> faithful to the Spec — "looks done" isn't done. Each layer's verdict is backed
> by evidence, not claims.

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

**Overall recommendation:** **Ship it** — all 16 acceptance criteria pass; the
Layer-3 CONCERNS are accepted, documented interpretations (not defects), and the
two outcome metrics (M1/M2) are measured post-ship via `/craft-framework:measure`,
by design.

---

## Layer 1 — Function (does it work?)

| Check / test                        | Result | Evidence                                                                                                                                              |
| ----------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Type safety                         | Pass   | `npm run typecheck` (`tsc --noEmit`) clean                                                                                                            |
| Full unit + integration + NFR suite | Pass   | `npm run test:db` → **144 tests, 144 pass, 0 fail, 0 skipped**                                                                                        |
| CI-safe degradation (no DB)         | Pass   | `npm run test:unit` → 134 pass, 10 DB-tests skip cleanly (no Postgres needed)                                                                         |
| Live end-to-end                     | Pass   | Manual run vs local Postgres: ingest run 1 → run 2 Planner pack "covered: Hero CTA; gap: Footer Links" → decisions "Hero CTA→reuse, Footer Links→new" |
| Migration idempotency               | Pass   | `knowledge:migrate` applies `0001_init.sql` once; re-run = "No pending migrations"                                                                    |

**Verdict: PASS** — comprehensive automated evidence (144 green) plus a live
end-to-end demonstration of the core history-aware loop.

## Layer 2 — Quality (is it clean?)

**Module depth (deletion test).** All modules are deep or justified:

- `KnowledgeService` (`index.ts`, 211 LOC) — large behavior behind a small
  interface; the pipeline imports only this. **Deep.**
- `store/repo.ts` (257) — all SQL concentrated behind behavioral ops; callers
  never touch SQL. **Deep.**
- `ingest/extract.ts` (191) — the RunReport→entities transform. **Deep.**
- `safety.ts withKb` (53) — thin but **passes the deletion test**: removing it
  scatters try/catch across every call site; it concentrates the R4/N3
  never-throw invariant in one place.
- `ingest/ingestRun.ts` (36) — thin, but it is the transaction boundary; folding
  it into the service would mix transaction control with service logic. **Kept.**
- No shallow pass-throughs found. `getCoverageMap`/`getAppProfile` are genuine
  projections of one aggregate read, not duplicate queries.

**Inline diagrams (Plan-mandated).** Present and accurate in all three named
files: `ingest/ingestRun.ts` (ingestion pipeline), `assemble/contextPack.ts`
(cold/warm/down degradation), `retrieve/coverageDecision.ts` (reuse|extend|new
thresholds). No stale diagrams.

**Safety / determinism.** Every KB call is best-effort (`withKb`), with a
belt-and-suspenders guard also at the two orchestrator seams — slightly redundant
with `withKb` but defensible: it guarantees a misbehaving service implementation
(not just a DB error) can never fail a run (N3). App-scoped queries everywhere
(N5). No secrets are read or logged. No UI in this phase (nothing to review there).

**Verdict: PASS** — deep modules, accurate diagrams, the never-throw invariant
concentrated and double-guarded. Minor: the seam-level guards duplicate `withKb`
slightly; acceptable for the reliability guarantee.

## Layer 3 — Alignment (does it match the Spec?)

| Acceptance criterion                            | Verifies  | Evidence                                                                                   | Verdict |
| ----------------------------------------------- | --------- | ------------------------------------------------------------------------------------------ | ------- |
| AC1 ingest → queryable rows                     | R3,R5,R11 | `integration.test` "ingestRun → query round-trip (AC1)"                                    | Pass    |
| AC2 double-ingest idempotent                    | R3        | "double-ingest is idempotent — one run, no dup specs (AC2)"                                | Pass    |
| AC3 KB down → run completes, logged not thrown  | R4        | "degradation — bad DB URL never throws (N3)" + wiring T19 + orchestrate cold path          | Pass    |
| AC4 KB down → empty packs, matches no-knowledge | R4,R8,R10 | wiring "T19 throwing KB never fails stage" + "disabled service runs cold"                  | Pass    |
| AC5 origin normalization                        | R5        | `appId.test` (www/path/query collapse; distinct origins differ; ports)                     | Pass    |
| AC6 getAppProfile                               | R6        | "getAppProfile + getCoverageMap (AC6/AC7)"                                                 | Pass    |
| AC7 getCoverageMap                              | R7        | same + asserts gap "Footer Links" present, never both covered+gap                          | Pass    |
| AC8 Planner prompt has knowledge block          | R8        | wiring "T14/T20 substituted service injects Planner pack"                                  | Pass    |
| AC9 reuse\|extend\|new w/ evidence              | R9        | `coverageDecision.test` (exact→reuse, partial→extend, paraphrase→new, failed-prior→extend) | Pass    |
| AC10 Generator skips `reuse` specs              | R10       | wiring "T15 reuse skips regeneration + copies prior spec (@kp-reused)"                     | Pass    |
| AC11 first-ever run identical to today          | R6,R9     | "disabled service runs cold" + wiring T19 + existing orchestrate cold test                 | Pass    |
| AC12 rebuild → identical counts                 | R12,N2    | "rebuild from raw_reports reproduces identical entity counts (N2/AC12)"                    | Pass    |
| AC13 retrieval ≤500ms                           | N4        | "retrieval overhead ≤500ms (N4/AC13)" (timed)                                              | Pass    |
| AC14 KB consumed only via interface             | R1,C3     | wiring "T20 substitute fake → packs change, no other pipeline edits"                       | Pass    |
| AC15 raw RunReport as JSONB                     | R2        | "raw RunReport is stored and retrievable as JSONB (AC15)" (added this review)              | Pass    |
| AC16 app-scoped isolation                       | N5        | "app-scoped isolation — no cross-app leakage (N5/AC16)"                                    | Pass    |

**NFRs:** N1 (completeness), N2 (rebuild), N3 (degradation), N4 (≤500ms), N5
(isolation) each have a dedicated passing test.

**Drift check** (from `implementation-notes.md`):

- **Built but not specified:** none. Every module traces to R1–R12.
- **Specified but not built:** none of the acceptance criteria. The two
  **outcome metrics** M1 (coverage-detection ≥90%/≥80%) and M2 (duplicate-avoidance
  ≤20%) are **not yet measured** — they require two live tarento.com runs
  (`ANTHROPIC_API_KEY` + Playwright CLI), unavailable in this build environment.
  This is expected: metrics are tracked post-ship via `/measure`, distinct from
  the acceptance criteria that prove "built correctly."
- **Interpretations (accepted CONCERNS):**
  1. **`knownPages` = distinct tested entry URLs**, not a full crawl-page map
     (R6 says "known pages"). `RunReport` carries no structured page list; this is
     an honest narrowing, logged in notes. Candidate Spec clarification at next
     revision; not a blocker.
  2. **Curated flow ids vs tested flowIds are keyed separately**; the profile
     collapses them by name and derives gaps from `coverage_snapshots.missing_flows`
     (the M1-aligned signal). A flow is never both covered and a gap (fixed +
     tested this build).
- **Intent legitimately changed?** No requirement changed. New spec version: **n/a**
  (the two interpretations above are documented; optional minor clarification to
  R6 deferred to the user).

**Verdict: CONCERNS** — all 16 ACs pass; the CONCERNS are documented
interpretations and the post-ship metric measurement, none blocking.

---

## Issues by severity

| Severity | Issue                                                          | Affected | Action                                                                              |
| -------- | -------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------- |
| Blocker  | none                                                           | —        | —                                                                                   |
| Major    | M1/M2 outcome metrics unmeasured (needs live tarento.com runs) | M1, M2   | Run `/craft-framework:measure` after two real runs; calibrate Q1/Q2 thresholds then |
| Minor    | `knownPages` = tested URLs, not full crawl pages               | R6       | Documented in notes; optionally clarify R6 in a future Spec revision                |
| Minor    | Seam-level guards duplicate `withKb` slightly                  | N3       | Accept — buys defense against a misbehaving service impl, not just DB errors        |
| Minor    | Lexical matching misses paraphrased duplicates (by design)     | R9, M2   | Phase 2 (embeddings); decisions err to `new` so no false skips                      |

---

## Recommendation

- [x] **Ship it** — all layers acceptable; the single Major is a post-ship
      measurement step (`/measure`), not a build defect.
- [ ] Loop back to Stage 1 / 2 / 3.

## Learnings to record

- An end-to-end sanity check caught a bug the unit tests missed (a flow shown as
  both covered and a gap) — **always run one live round-trip**, not just unit
  tests, for data-shape correctness.
- Best-effort/never-throw (`withKb`) made the KB-absent path trivial and is what
  let the build proceed fully offline-of-Neon against a local Postgres.
- Acceptance criteria that assert a _stored representation_ (AC15 JSONB) need a
  test that reads the store directly — a rebuild test that re-ingests in-memory
  objects does not prove the round-trip. (Gap found and closed during review.)

---

_Stage 5 (Test & Tune) artifact. Present at the final Human Gate for the
ship / loop-back decision. Update `STATE.md` with the outcome._
