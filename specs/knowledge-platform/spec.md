# Spec — Knowledge-Driven Testing Platform · Phase 1 (History-Aware Planner + Generator)

> Stage 2 (Record) deliverable. The single source of truth and contract for
> everything that follows: **if it isn't in this Spec, it doesn't get built.**
> Describes WHAT "done" means, never HOW to build it (that is Stage 3).

- **Version:** v0.1.0
- **Status:** Approved
- **Source Brief:** `specs/knowledge-platform/brief.md`
- **Last updated:** 2026-06-05

---

## Overview

Phase 1 of the Knowledge-Driven Testing Platform gives the existing pipeline a
**persistent, queryable memory of past runs**. A new `src/knowledge/`
**Knowledge Layer** (the `KnowledgeService`) ingests every completed `RunReport`
into PostgreSQL, then feeds two agents on subsequent runs: the **Planner** learns
what's already been tested for an app (so it explores gaps), and the **Generator**
learns which planned scenarios already have tests (so it reuses/extends rather than
regenerating). The execution pipeline is unchanged except at three narrow seams.
This proves the platform keystone — _the system recognizes what it already tested
and acts on it_ — and is the foundation every later phase builds on. Full
architecture context: `docs/knowledge-platform-architecture.md`.

## Requirements

| ID  | Requirement (what the result must do)                                                                                                                                                                                                                                                                          | Priority |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| R1  | Provide a **Knowledge Layer** as a `src/knowledge/` `KnowledgeService` behind a behavioral interface; the execution pipeline depends on the knowledge base **only** through that interface (Knowledge/Execution separation).                                                                                   | Must     |
| R2  | Persist knowledge in **PostgreSQL**: structured tables for the entities (App, Run, Spec, Flow, PlanScenario, TestResult, CoverageSnapshot), an `edges` relations table, and the raw `RunReport` as `JSONB`. **No embeddings/pgvector** this phase.                                                             | Must     |
| R3  | `ingestRun(report: RunReport)` normalizes a completed report into entities + edges, **idempotent by `runId`** (re-ingesting the same run upserts — never duplicates).                                                                                                                                          | Must     |
| R4  | All knowledge-base access (ingestion **and** retrieval) is **best-effort and never throws**: a run completes and reports even if the KB is unreachable or errors; failures are logged. Execution never depends on the KB being available.                                                                      | Must     |
| R5  | Key an **App** by **normalized origin** — scheme + host, lowercased, drop leading `www.`, ignore path, query, fragment, and trailing slash. All runs against the same origin aggregate to one App; individual URLs are recorded at the Page level.                                                             | Must     |
| R6  | `getAppProfile(url)` returns what is known about an app from prior runs: known pages, known flows, per-flow coverage (tested? last outcome), and a coverage summary.                                                                                                                                           | Must     |
| R7  | `getCoverageMap(appId)` returns, for the app, which known/curated flows are covered by prior runs and which are gaps.                                                                                                                                                                                          | Must     |
| R8  | Inject a **bounded Planner context pack** ("what we already know about this app": known pages, covered flows, gaps) into the Planner prompt before it explores, so it focuses on untested areas.                                                                                                               | Must     |
| R9  | `planCoverageDecision(scenarios, appId)` returns, per planned scenario, a decision **`reuse \| extend \| new`** with evidence (matched existing spec, overlap score, last outcome), computed via `coverage.ts` token-overlap (**lexical, no embeddings**). The threshold **errs toward `new`** when uncertain. | Must     |
| R10 | Inject a **Generator context pack** (existing specs + the per-scenario decisions) so the Generator **reuses/extends** already-covered scenarios and generates only `new`/`extend` ones — it does not regenerate a scenario marked `reuse`.                                                                     | Must     |
| R11 | New execution data becomes knowledge **automatically**: `ingestRun` is wired at the run-completion seam, with no manual step.                                                                                                                                                                                  | Must     |
| R12 | The knowledge index is **rebuildable**: replaying `ingestRun` over the stored reports reconstructs identical structured state (Postgres is a derived index; the artifacts/`RunReport` remain the source of truth).                                                                                             | Should   |

## Scenarios

| ID   | Given / When                                                                              | Then (expected behavior)                                                                                                                                       | Covers    |
| ---- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| SC1  | A run completes                                                                           | `ingestRun` records the App (by normalized origin), the Run, its Specs/Flows/PlanScenarios/TestResults/CoverageSnapshot, and `edges`; all queryable.           | R3,R5,R11 |
| SC2  | The same run's report is ingested twice (retry/crash recovery)                            | Idempotent — exactly one Run and no duplicated child rows.                                                                                                     | R3        |
| SC3  | Postgres is **unreachable** when a run completes                                          | The run still completes and produces its report; the ingestion failure is logged, never thrown.                                                                | R4        |
| SC4  | Postgres is **unreachable** when the Planner/Generator starts                             | Context packs are empty; both agents proceed exactly as today (cold), no failure.                                                                              | R4,R8,R10 |
| SC5  | Second run of a known app                                                                 | The Planner receives an app profile (known pages, covered flows, gaps) and is directed at gaps.                                                                | R6,R8     |
| SC6  | Second run of a known app                                                                 | For each planned scenario `planCoverageDecision` returns `reuse\|extend\|new`; the Generator skips/reuses covered scenarios and generates only `new`/`extend`. | R7,R9,R10 |
| SC7  | A planned scenario **partially** overlaps an existing spec                                | Decision = `extend` (not full `reuse`, not `new`).                                                                                                             | R9        |
| SC8  | A planned scenario is a **paraphrase** of an existing one (same intent, different tokens) | Lexical matching misses it → decision = `new`; a duplicate is generated. **Known limitation** this phase (Phase 2 embeddings fix it).                          | R9        |
| SC9  | Overlap score sits **near the threshold** (uncertain)                                     | Decision errs to `new` — never silently `reuse` (so a real gap is not masked as covered).                                                                      | R9        |
| SC10 | **First-ever** run of an app (no history)                                                 | Empty profile and no decisions; both agents behave exactly as today — no regression.                                                                           | R6,R9     |
| SC11 | Replaying `ingestRun` over the stored reports into a **fresh** database                   | Reproduces identical structured state (entity counts + keys).                                                                                                  | R12       |

## User experience

Phase 1 ships **no new GUI**; the "users" are the agents and the dev/QA operator
who re-runs an app. The experience is observable through the existing live
progress stream and the report.

- **Primary journey:** An operator re-runs a previously tested app. In the live
  progress stream they see the Planner acknowledge known coverage and the
  Generator skip/reuse already-covered scenarios; the finished report shows fewer
  regenerated specs than a cold run for the same coverage.
- **Three states — each is a design:**
  - **Cold** (no history for this app) → behaves exactly as today; a progress
    note says "No prior history for <app> — full exploration."
  - **Warm** (history exists) → a progress event announces what was loaded, e.g.
    "Loaded history for <app>: N known flows, M gaps", and per-scenario decisions
    (`reuse`/`extend`/`new`) are surfaced so the behavior is explainable.
  - **Degraded** (KB unreachable) → behaves as Cold, plus a single logged notice
    "Knowledge base unavailable — proceeding without history." The run never fails.
- **UX principle — no silent magic:** every knowledge-driven decision is
  announced on the event stream, so a reused/skipped scenario is always traceable
  to why. No dead ends: an empty/absent KB degrades to today's behavior, never an
  error.
- **Observability surface:** progress events for "knowledge loaded" and
  per-scenario decisions; the report reflects which specs were reused vs newly
  generated. (A dedicated coverage-history UI is deferred — Future vision.)

## Constraints

| ID  | Constraint                                                                                                                                                                                                                                                                                                                                                                                                            |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | Storage engine = **PostgreSQL** (managed/serverless — **Neon**); connection via `KNOWLEDGE_DATABASE_URL`. Structured tables + `edges` + `JSONB` only — **no pgvector/embeddings** this phase.                                                                                                                                                                                                                         |
| C2  | **Constitutional reconciliation (rule 3 "keep it simple"):** Phase 1 adds a database, departing the de-facto "no DB, in-memory + best-effort disk" posture (`runStore/store.ts`). This is **not** a violation: cross-run memory cannot be satisfied without persistence, so Postgres is the simplest approach that satisfies _this Spec's_ requirements. Ratified here, deliberately, as a platform-foundation trade. |
| C3  | **Knowledge/Execution separation:** the pipeline is touched only at **three seams** — `ingestRun(report)` at run completion, the Planner context pack, and the Generator context pack + `planCoverageDecision` — all in `src/orchestrator/`. Agent logic is otherwise unchanged (only prompt assembly).                                                                                                               |
| C4  | Generator dedupe is **lexical-only** (`coverage.ts` `norm`/`significantTokens` token-overlap); no semantic/paraphrase matching this phase.                                                                                                                                                                                                                                                                            |
| C5  | `RunReport` (`src/types.ts`) is the **ingestion payload** — no new run-artifact schema is introduced.                                                                                                                                                                                                                                                                                                                 |
| C6  | **New runs only** — no backfill of existing `.runs/*`.                                                                                                                                                                                                                                                                                                                                                                |
| C7  | Must respect `CONSTITUTION.md`: Spec-as-contract, nothing ships unverified, determinism over flakiness (the KB must not introduce non-determinism or flakiness into runs).                                                                                                                                                                                                                                            |

## Assumptions

| ID  | Assumption                                                                                                                                       | If wrong → impact                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| A1  | `coverage.ts` token-overlap, after threshold tuning, is accurate enough to reach M1's ≥90% recall / ≥80% precision on the curated tarento flows. | M1 misses; semantic matching (Phase 2 embeddings) must be pulled forward. |
| A2  | The 10 curated flows in `fixtures/tarento-flows.json` are a valid ground-truth label set for "covered" on tarento.com.                           | M1/M2 are not meaningfully measurable; a better labeled set is needed.    |
| A3  | `RunReport` carries enough (flows, generatedSpecs, results, coverage, plan) to reconstruct per-flow coverage at ingest.                          | Ingestion cannot derive coverage; runs must capture more data first.      |
| A4  | Erring toward `new` on uncertain overlap keeps false-skips low, so real gaps are not masked as `reuse`.                                          | Coverage gaps masked as reused → M1 precision and trust drop.             |
| A5  | Normalized-origin App identity correctly aggregates the apps under test (no two distinct apps share an origin; no one app spans origins).        | Runs mis-aggregate; profiles/coverage maps mix unrelated apps.            |

## Non-functional requirements

| ID  | NFR (system quality)                    | Target (measurable)                                                                                           | How measured                                                                                            |
| --- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| N1  | **Ingestion completeness**              | 100% of completed runs (KB reachable) produce a queryable Run record.                                         | Over a test window, `count(runs in DB) == count(completed runs)`.                                       |
| N2  | **Rebuildability** (event-sourced)      | Replaying `ingestRun` over the stored `RunReport`s into a fresh DB reproduces identical entity counts + keys. | Rebuild into an empty database; diff entity counts/keys = identical.                                    |
| N3  | **Non-blocking / graceful degradation** | With the KB unreachable, run success rate and outcome are unaffected; **zero** runs fail due to the KB.       | Run the pipeline with Postgres down / an injected KB error; run completes; KB errors logged not thrown. |
| N4  | **Retrieval latency overhead**          | `getAppProfile` + `planCoverageDecision` add **≤ 500 ms** total to a run (negligible vs. agent time).         | Time the calls within a run; assert ≤ 500 ms.                                                           |
| N5  | **App-scoped isolation**                | Every retrieval is scoped to one App; no run sees another App's specs/flows.                                  | Cross-app test: seed two Apps; assert each profile/decision returns only its own App's data.            |

## Dependencies

| ID   | Dependency                                                                              | Type                  | Owner     | Status                 |
| ---- | --------------------------------------------------------------------------------------- | --------------------- | --------- | ---------------------- |
| DEP1 | Managed/serverless PostgreSQL instance (Neon), pgvector-capable image (for Phase 2)     | External / Technical  | User/Team | To provision (Phase 0) |
| DEP2 | `KNOWLEDGE_DATABASE_URL` env var configured in every environment                        | Technical             | Team      | Open                   |
| DEP3 | Two real tarento.com runs (needs `ANTHROPIC_API_KEY` + Playwright CLI) to measure M1/M2 | Sequencing / External | User      | Open                   |
| DEP4 | Postgres client + migration tool/runner (chosen in Assemble)                            | Technical             | Team      | Open (Assemble)        |
| DEP5 | `src/coverage/coverage.ts` `norm`/`significantTokens` (exported) for lexical matching   | Technical             | Team      | Done                   |

## Success metrics

> The Brief's "ingestion reliability" gate is a system property → recorded as
> **N1/N2** above. The two outcome metrics below prove the platform is _useful_.

| ID  | Metric (outcome that should move)     | Baseline                              | Target                                                              | How measured                                                                                                                      |
| --- | ------------------------------------- | ------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| M1  | Coverage-detection accuracy (Planner) | None (no memory today)                | **≥90% recall, ≥80% precision**                                     | On a 2nd tarento.com run, compare KB-flagged covered flows vs. the hand-labeled curated-flow set (`fixtures/tarento-flows.json`). |
| M2  | Duplicate-avoidance (Generator)       | ~100% regenerated (cold run baseline) | **≤20% of already-covered flows regenerated** (≥80% reused/skipped) | On that 2nd run, count covered flows the Generator regenerated vs. reused/skipped, per `planCoverageDecision` + emitted specs.    |

## Acceptance criteria

| ID   | Acceptance criterion (observable / testable)                                                                                                                                                                 | Verifies  |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| AC1  | After a completed run, querying the KB returns an App (keyed by normalized origin), the Run, its Specs/Flows/PlanScenarios/TestResults/CoverageSnapshot, and `edges`.                                        | R3,R5,R11 |
| AC2  | Ingesting the same `RunReport` twice yields exactly one Run and no duplicated child rows.                                                                                                                    | R3        |
| AC3  | With Postgres unreachable, a triggered run completes and produces its report; logs show an ingestion error and no error is surfaced to the run.                                                              | R4        |
| AC4  | With Postgres unreachable, Planner and Generator run with empty context packs and the pipeline output matches a no-knowledge run (no failure).                                                               | R4,R8,R10 |
| AC5  | Two URLs that normalize to the same origin (e.g. `http://www.x.com/`, `https://x.com/p?q=1`) map to one App; two different origins map to two Apps.                                                          | R5        |
| AC6  | `getAppProfile(url)` returns known pages, covered flows with last outcome, and gaps for a previously-run app.                                                                                                | R6        |
| AC7  | `getCoverageMap(appId)` lists covered vs. uncovered known flows for the app.                                                                                                                                 | R7        |
| AC8  | On a 2nd run, the Planner prompt contains a bounded knowledge block naming covered flows and gaps (observable in the prompt/log).                                                                            | R8        |
| AC9  | `planCoverageDecision` returns `reuse\|extend\|new` per scenario with matched-spec + overlap-score evidence: exact-title repeat → `reuse`, partial overlap → `extend`, none → `new`; near-threshold → `new`. | R9        |
| AC10 | On a 2nd run, the Generator prompt is shaped by the decisions and it does **not** re-emit specs for scenarios marked `reuse`.                                                                                | R10       |
| AC11 | A first-ever run of an unknown app behaves identically to today (empty packs, no errors) — regression guard.                                                                                                 | R6,R9     |
| AC12 | Replaying `ingestRun` over the stored `RunReport`s into a fresh database reproduces identical entity counts and keys.                                                                                        | R12,N2    |
| AC13 | `getAppProfile` + `planCoverageDecision` add ≤ 500 ms to a run (timed).                                                                                                                                      | N4        |
| AC14 | The pipeline consumes the KB only via the `KnowledgeService` interface — verified by substituting a fake `KnowledgeService` in a test and observing context packs change with no other pipeline edits.       | R1,C3     |
| AC15 | The raw `RunReport` is retrievable as `JSONB` for each ingested run.                                                                                                                                         | R2        |
| AC16 | Seeding two Apps, each profile/coverage/decision query returns only its own App's data (no cross-app leakage).                                                                                               | N5        |

> **Coverage rule:** every **Must** requirement (R1–R11) has ≥1 acceptance criterion; R12 (Should) is covered by AC12.

## Out of scope

- **Embeddings / semantic (paraphrase-robust) dedupe** (Phase 2), **healing memory + playbooks** (Phase 3), **graph DB / Neo4j / governance / multi-agent** (Phase 4).
- **Healer** knowledge consumption — Phase 1 wires the **Planner** and **Generator** only.
- **Backfill** of existing `.runs/*` — new runs only.
- **User-facing UI** (a coverage-history view) — pipeline-internal this phase.
- Distillation of episodic runs into semantic playbooks / "successful strategies."

## Future vision

- **What this unlocks:** with memory in place, every later capability — semantic
  reuse, intelligent suite merge, learning from heals, identifying winning
  strategies, multi-agent workflows — becomes incremental additions on the same
  `KnowledgeService` + Postgres.
- **Likely next steps (v2+):** Phase 2 `pgvector` columns + semantic retrieval
  (paraphrase-robust dedupe, `findSimilarSpecs`); Phase 3 healing memory +
  distilled playbooks + validation anti-patterns; Phase 4 graph reasoning,
  governance/provenance, feedback re-weighting, and an extracted Knowledge service
  for multi-agent use; a coverage-history UI.
- **Deliberately deferred:** embeddings, Healer wiring, backfill, UI, hard
  reuse-gating.

## Open questions

| ID  | Question                                                                                                                                                                                                | Status                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Q1  | Exact labeling of the 10 curated flows as "covered by run 1" — by flow id, tested-spec title overlap, or manual tag? (Defines M1/M2 denominator.)                                                       | Open (resolve in Assemble/before measure) |
| Q2  | The `reuse\|extend\|new` overlap-score threshold (and the "extend" band), tuned to err toward `new`.                                                                                                    | Open (Assemble; tune pre-measure)         |
| Q3  | Token budget bounding the Planner/Generator context packs so they never bloat the prompts.                                                                                                              | Open (Assemble)                           |
| Q4  | Migration ownership & runner (e.g. `node-pg-migrate`/Drizzle; run on deploy vs. on boot) and local-dev DB mechanics (Neon branch).                                                                      | Open (Assemble)                           |
| Q5  | On a `reuse` decision (R10), does the new run **reference** the prior spec, or **copy** it into `.runs/<id>/tests/` so each run is self-contained? (Surfaced at the v0.1.0 gate; deferred to Assemble.) | Open (Assemble)                           |

---

## Change log

| Version | Date       | Change       | Reason |
| ------- | ---------- | ------------ | ------ |
| v0.1.0  | 2026-06-05 | Initial spec | —      |

---

_Stage 2 (Record) artifact. This is the most important review in the framework —
approve at the Human Gate only when it exactly matches intent, then proceed to
`/craft-framework:assemble`. Must respect every rule in `CONSTITUTION.md`._
