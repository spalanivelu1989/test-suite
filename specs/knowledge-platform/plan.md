# Plan (Design) — Knowledge-Driven Testing Platform · Phase 1

> Stage 3 (Assemble) deliverable. Defines **HOW** to build what the Spec
> describes. Pairs with `tasks.md`. Every design choice traces back to a
> requirement or constraint in the Spec.

- **Targets Spec version:** v0.1.0
- **Status:** Approved
- **Last updated:** 2026-06-05

---

## Approach

A new **Knowledge Layer** (`src/knowledge/`) exposes one deep module —
`KnowledgeService` — over PostgreSQL. The existing execution pipeline is touched
at exactly **three seams** in `src/orchestrator/`: (1) `ingestRun(report)` after
the Reporter builds the canonical `RunReport`; (2) a **Planner** context pack
injected into the planner prompt; (3) a **Generator** context pack +
`planCoverageDecision` injected into the generator prompt. Every KB call is
wrapped so it is **best-effort and never throws** (mirrors
`runManager/persistence.ts`). The `RunReport` is the source payload; Postgres is a
**derived, rebuildable index** (event-sourced). Matching reuses
`src/coverage/coverage.ts` (`norm`/`significantTokens`) — lexical only, no
embeddings (Phase 2). Storage rationale is fixed in **ADR-0001**.

## Architecture & structure

```
src/knowledge/
  index.ts                 # createKnowledgeService() factory + re-exports          (R1)
  types.ts                 # KnowledgeService iface, ContextPack, CoverageDecision,  (I1,I4,I6)
                           #   AppProfile, CoverageMap, KnowledgeEvent
  appId.ts                 # normalizeOrigin(url) → appId                            (R5)
  safety.ts                # withKb(): best-effort wrapper (log, never throw)        (R4,N3)
  store/
    db.ts                  # pg.Pool on globalThis; getPool(); health check          (R2,N1,RK4)
    migrate.ts             # forward-only SQL migration runner                       (D2,Q4)
    migrations/            # 0001_init.sql (tables+edges), 0002_raw_jsonb.sql ...     (R2)
    repo.ts                # SQL read/write: upserts, AppKnowledge aggregate query    (R2,R6,R7,N5)
  ingest/
    ingestRun.ts           # RunReport → entities+edges+JSONB, idempotent            (R3,R11,N1)
    extract.ts             # derive specs/flows/plan-scenarios/coverage from report  (R3,A3)
  retrieve/
    appProfile.ts          # getAppProfile(url) / getCoverageMap(appId)              (R6,R7)
    coverageDecision.ts    # planCoverageDecision(): reuse|extend|new + evidence     (R9,D5,Q2)
  assemble/
    contextPack.ts         # token-bounded Planner + Generator packs                 (R8,R10,N4,D7,Q3)
  knowledge.service.ts     # KnowledgeService impl wiring the above behind withKb    (R1,R4)

src/orchestrator/
  orchestrate.ts           # + ingestRun() at completion; thread KnowledgeService    (R11,C3)
  stages.ts                # + Planner & Generator context-pack injection            (R8,R10,C3,D4,Q5)

docs/adr/0001-postgres-knowledge-store.md    # storage decision (D1)
knowledge/                 # gitignored runtime: nothing in P1 (Postgres holds rows)
```

## Components / modules

| Component                                    | Responsibility                                                                                                    | Addresses            |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------- |
| `KnowledgeService` (iface + impl)            | The whole Knowledge Layer behind one small interface; all pipeline access goes through it                         | R1, C3               |
| `store/db.ts` + `migrate.ts` + `migrations/` | Postgres pool (globalThis), schema as forward-only SQL migrations                                                 | R2, N1, D2           |
| `store/repo.ts`                              | All SQL: idempotent upserts; the `AppKnowledge` aggregate read query (one query → profile + coverage); app-scoped | R2, R6, R7, N5       |
| `appId.ts`                                   | Normalize a URL to an `appId` (origin) so runs aggregate                                                          | R5                   |
| `safety.ts` (`withKb`)                       | One place that makes every KB call best-effort: log, return a safe default, never throw                           | R4, N3               |
| `ingest/ingestRun.ts` + `extract.ts`         | Normalize a `RunReport` into entities/edges/JSONB; idempotent by `runId`                                          | R3, R11, N1, N2      |
| `retrieve/appProfile.ts`                     | `getAppProfile` / `getCoverageMap` as projections of `AppKnowledge`                                               | R6, R7               |
| `retrieve/coverageDecision.ts`               | `planCoverageDecision`: lexical overlap → `reuse\|extend\|new` + evidence                                         | R9, D5               |
| `assemble/contextPack.ts`                    | Build token-bounded Planner & Generator packs from the above                                                      | R8, R10, N4, D7      |
| `orchestrate.ts` / `stages.ts` wiring        | The three seams: ingest at completion; inject packs; copy reused specs                                            | R8, R10, R11, C3, D4 |

## Data flow

**1 — Ingestion (run completion → knowledge).** Best-effort; a failure never
touches the run.

```
Reporter builds RunReport ─► orchestrate.complete
        │
        ▼
   withKb( ingestRun(report) )                         [R3,R4,R11]
        │  normalizeOrigin(report.url) → appId         [R5]
        │  extract: app, run, specs, flows,
        │           plan-scenarios, results, coverage  [extract.ts, A3]
        ▼
   repo.upsert (ON CONFLICT(runId/hash) DO UPDATE)     [idempotent — R3 / SC2]
        │  tables + edges + raw RunReport JSONB         [R2 / AC15]
        ▼
   emit KnowledgeEvent "ingested: N flows"  ── on ANY error ─► log, swallow [N3 / SC3]
```

**2 — Retrieval (prompt assembly → agents).** Planner and Generator seams.

```
stages.planTests ─► withKb( assembleContext("planning", url) )
                         │  getAppProfile(url)  (cold/none ⇒ empty)   [R6,R8]
                         ▼  token-bound + rank (recency, passRate)    [D7,N4]
                    Planner prompt += "What we already know …"  ── KB down ─► empty pack ⇒ today's behavior [SC4,SC10]

stages.generateTests ─► withKb( planCoverageDecision(scenarios, appId) )    [R9]
                         │   per scenario: overlap(scenario, existing specs/flows)
                         │     ≥0.80 & last passed → reuse
                         │     0.45–0.80          → extend     (err toward new) [D5,SC7,SC9]
                         │     <0.45 / paraphrase → new                          [SC8]
                         ▼
                    Generator prompt += decisions + existing specs   [R10]
                    for each `reuse`: copy prior spec into .runs/<id>/tests/ tagged reused [D4,Q5]
                    Generator generates only `new`/`extend`          [R10 / M2]
```

**3 — Rebuild (event-sourced index).** `migrate fresh-db → replay ingestRun over
stored RunReports → identical entity counts/keys` (N2 / AC12).

| File / module                                | Diagram it should carry                                                                         |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `src/knowledge/ingest/ingestRun.ts`          | The ingestion pipeline (extract → upsert → edges → emit), incl. the best-effort/idempotent path |
| `src/knowledge/assemble/contextPack.ts`      | Retrieval + degradation (cold/warm/KB-down → which pack)                                        |
| `src/knowledge/retrieve/coverageDecision.ts` | The `reuse\|extend\|new` threshold branching                                                    |

## Interfaces / Contracts

| ID  | Interface                | Producer                       | Consumer                        | Shape (inline or link)                                                                                                                                                         | Versioning policy                                             |
| --- | ------------------------ | ------------------------------ | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| I1  | `KnowledgeService` (TS)  | `src/knowledge`                | `src/orchestrator`              | `ingestRun(report)`, `getAppProfile(url)`, `getCoverageMap(appId)`, `planCoverageDecision(scenarios,appId)`, `assembleContext(stage,url)` — all `Promise`, all safe-defaulting | Additive only; new methods don't break callers                |
| I2  | Postgres schema          | `store/migrations/`            | `store/repo.ts`                 | tables: `apps, runs, specs, flows, plan_scenarios, test_results, coverage_snapshots, edges, raw_reports(JSONB)`                                                                | Forward-only numbered migrations; never edit a shipped one    |
| I3  | Ingestion payload        | `src/reporter` (`RunReport`)   | `ingest/ingestRun.ts`           | `RunReport` (`src/types.ts`) — already the canonical artifact                                                                                                                  | Owned by `types.ts`; ingest maps defensively (RK5)            |
| I4  | `ContextPack`            | `assemble/contextPack.ts`      | `stages.ts` prompt builders     | `{ planner?: string; generator?: { decisions: CoverageDecision[]; specs: SpecRef[] } }`, token-bounded                                                                         | Additive; packs are advisory strings/data                     |
| I5  | `KNOWLEDGE_DATABASE_URL` | environment (Neon)             | `store/db.ts`                   | Postgres connection URL                                                                                                                                                        | Env contract (DEP2); absent ⇒ KB disabled, pipeline runs cold |
| I6  | `CoverageDecision`       | `retrieve/coverageDecision.ts` | Generator wiring in `stages.ts` | `{ scenario, action: 'reuse'\|'extend'\|'new', matchedSpec?, score, lastOutcome? }`                                                                                            | Additive                                                      |

## Dependencies & integration points

- **`pg`** (node-postgres) client; **plain SQL migrations** via a tiny runner (D2). No ORM.
- **Neon** managed Postgres; `KNOWLEDGE_DATABASE_URL` env (DEP1, DEP2).
- **`src/coverage/coverage.ts`** `norm`/`significantTokens` — already exported (DEP5).
- **`src/types.ts` `RunReport`** — the ingestion payload (I3).
- Integration seams: `src/orchestrator/orchestrate.ts` (completion) and `stages.ts` (planner/generator prompts).
- Test DB: a disposable Postgres (CI service container or Neon branch) for integration/NFR tests (DEP4).

## Key decisions (ADRs)

| ID  | Decision                                                                                                     | Options considered                                                                                        | Why not (each rejected)                                                                                                             | Consequences                                                                                          | Driven by       |
| --- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------- |
| D1  | **PostgreSQL** knowledge store → **ADR-0001**                                                                | Postgres; SQLite+sqlite-vec; in-memory/JSON-scan; vector DB/Neo4j now                                     | SQLite: weak concurrent writers + forces later migration; in-memory: no cross-run queries; vector/Neo4j: solve non-Phase-1 problems | Real queries/concurrency; new DB dependency (mitigated by serverless + best-effort)                   | R2, C1, C2      |
| D2  | **Plain `pg` + SQL-file migrations** (no ORM)                                                                | `pg`+SQL; Drizzle; Prisma; Kysely                                                                         | ORMs add a dependency + abstraction for a ~9-table surface (rule 3); migration magic hides the schema                               | Hand-written SQL/migrations; full control; slightly more boilerplate                                  | C7, Q4          |
| D3  | **`withKb` best-effort wrapper** for all KB calls                                                            | One wrapper; try/catch per call site; hard dependency                                                     | Per-call try/catch scatters the invariant; hard dependency violates R4/N3                                                           | One place enforces "never throw"; passes deletion test (folding it scatters error handling)           | R4, N3          |
| D4  | **Copy reused specs into the run** (tagged `reused`)                                                         | Copy into `.runs/<id>/tests/`; reference-only                                                             | Reference-only ⇒ the run can't execute/validate the reused flow ⇒ incomplete suite/report (defeats the tool's purpose)              | Each run self-contained; needs a `reused` provenance marker so M2 isn't credited as generation        | R10, Q5         |
| D5  | **Overlap-coefficient** lexical match, thresholds reuse ≥0.80 / extend 0.45–0.80 / new <0.45, **err to new** | Overlap-coefficient; Jaccard; count-cosine                                                                | Jaccard penalizes a short scenario vs a long spec (length asymmetry); cosine needs vectors                                          | Deterministic, reuses `coverage.ts`; thresholds **calibrated** against the tarento set before measure | R9, Q2          |
| D6  | **App = normalized origin** (scheme+host, drop `www`, strip path/query/fragment/trailing slash)              | Origin; full URL; registrable-domain                                                                      | Full URL fragments one app into many; registrable-domain merges unrelated subdomains                                                | Clean cross-run aggregation; subdomains are distinct apps (acceptable)                                | R5              |
| D7  | **Token-bounded packs** (Planner ≤~1200 tok; Generator pack ≤~2000 tok), rank by recency+passRate, truncate  | Bounded; unbounded; fixed top-N                                                                           | Unbounded bloats prompts (N4 latency/cost); fixed-N ignores relevance                                                               | Predictable prompt size; least-relevant items dropped first                                           | R8, R10, N4, Q3 |
| D8  | **M1/M2 ground truth = curated flows + credited coverage**                                                   | `fixtures/tarento-flows.json` + run-1 coverage credit, audited once; manual-only tagging; spec-title-only | Manual-only doesn't scale/repeat; title-only is noisy                                                                               | Repeatable metric using existing `coverageFromResults`; one-time manual audit validates labels        | Q1, M1, M2      |

## Risks & mitigations

| ID  | Risk                                                          | Likelihood | Impact | Mitigation                                                                                                       |
| --- | ------------------------------------------------------------- | ---------- | ------ | ---------------------------------------------------------------------------------------------------------------- |
| RK1 | Lexical match misses paraphrased duplicates → over-generation | High       | Med    | Err to `new`; measure M2 on lexical matches honestly; Phase 2 embeddings raise recall                            |
| RK2 | Over-aggressive `reuse` masks a real coverage gap             | Med        | High   | Threshold errs to `new` + requires last-outcome passed; M1 precision tracks it; cold-run regression guard (SC10) |
| RK3 | KB latency/availability slows or blocks runs                  | Med        | High   | `withKb` best-effort + ≤500ms budget (N4) + short pool/query timeout; KB-down ⇒ cold run                         |
| RK4 | Postgres connection exhaustion under Next.js HMR/serverless   | Med        | Med    | Single pooled `pg.Pool` on `globalThis` (mirrors `getRunStore`); serverless driver on edge                       |
| RK5 | `RunReport` shape drifts and breaks ingest                    | Low        | Med    | Store raw JSONB + rebuildable; `extract.ts` maps defensively (missing fields → skip, not throw)                  |
| RK6 | Copied reused specs double-counted as "generated" in M2       | Med        | Med    | Provenance marker (`reused`) on the copied spec; M2 counts only newly-generated specs                            |
| RK7 | Unit tests need a real Postgres (no SQLite shortcut)          | Med        | Low    | Test DB via CI service container / Neon branch; per-test schema or transaction rollback for isolation            |

## Test strategy

- **Layers:** **unit** (`tsx --test`, repo idiom) for `appId`, `extract`,
  `coverageDecision`, `contextPack`, `withKb`; **integration** for
  `ingestRun → repo` round-trips and `getAppProfile`/`getCoverageMap` against a
  real test Postgres; **degradation** tests with an injected failing pool;
  **rebuild** test (N2); **isolation** test (N5); **latency** assertion (N4).
- **Environments:** local + CI. Test Postgres = CI service container (or Neon
  branch). Pure-logic units (`appId`, `coverageDecision`, `contextPack`) run with
  no DB; DB-touching tests use a disposable schema with transaction rollback per
  test (RK7).
- **Fixtures:** synthetic `RunReport`s (incl. malformed/partial for RK5); the
  curated `fixtures/tarento-flows.json`; a two-app fixture for N5.
- **Coverage of NFRs:** N1 — ingest K runs, assert `count(runs)==K`; N2 — rebuild
  into empty DB, diff entity counts/keys; N3 — failing-pool run completes, errors
  logged not thrown; N4 — time `getAppProfile`+`planCoverageDecision`, assert
  ≤500ms; N5 — two-app seed, assert no cross-app leakage.
- **Deliberately not tested now:** M1/M2 need two live tarento.com runs
  (`ANTHROPIC_API_KEY` + Playwright CLI) — measured via `/craft-framework:measure`
  after Forge, not in unit CI. Semantic/paraphrase matching is out of scope
  (Phase 2).

---

## Requirements coverage (design level)

| Requirement / NFR | Addressed by (component / decision / contract)                 |
| ----------------- | -------------------------------------------------------------- |
| R1                | `KnowledgeService` iface + impl (I1); all access via it        |
| R2                | `store/db.ts` + migrations + `repo.ts` (I2); raw JSONB (AC15)  |
| R3                | `ingest/ingestRun.ts` + `extract.ts`; idempotent upsert        |
| R4                | `safety.ts withKb` (D3) wraps every KB call                    |
| R5                | `appId.ts normalizeOrigin` (D6)                                |
| R6                | `retrieve/appProfile.ts getAppProfile` ← `repo` AppKnowledge   |
| R7                | `retrieve/appProfile.ts getCoverageMap` (projection)           |
| R8                | `assemble/contextPack.ts` planner pack + `stages.ts` injection |
| R9                | `retrieve/coverageDecision.ts` (D5)                            |
| R10               | Generator pack + `stages.ts` injection + copy-reused (D4)      |
| R11               | `orchestrate.ts` ingest at completion seam                     |
| R12               | Rebuild path (event-sourced); `ingestRun` replay               |
| N1                | `repo` upsert + ingest completeness test                       |
| N2                | Rebuild test; raw JSONB enables replay                         |
| N3                | `withKb` (D3); degradation test                                |
| N4                | Token-bounded packs (D7); latency assertion                    |
| N5                | App-scoped queries in `repo` (every query filters `app_id`)    |

---

_Stage 3 (Assemble) artifact. Architecture Gate (3a) approves this `plan.md`
before tasks are cut. Must respect every rule in `CONSTITUTION.md`._
