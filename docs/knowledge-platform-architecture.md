# Knowledge-Driven Testing Platform — Architecture Recommendation

> Status: **Proposal / RFC** · Date: 2026-06-05 · Author: Architecture review
> Audience: maintainers of the AI UI Testing Tool
> Goal: evolve the tool so every historical run becomes reusable context for
> future agents — store, retrieve, reason over, and reuse knowledge across runs.

---

## 0. TL;DR — the recommendation

Adopt a **Hybrid, layered architecture** with three ideas doing the heavy lifting:

1. **Knowledge Layer / Execution Layer separation.** The existing pipeline
   (`orchestrate.ts`, `stages.ts`, `workspace.ts`, `runManager/`) is the
   **Execution Layer** and stays almost untouched. A new `src/knowledge/` module
   is the **Knowledge Layer**. They meet at exactly two narrow seams: an
   **ingestion** call when a run completes, and a **retrieval** call when an
   agent prompt is built.

2. **Event-sourced artifacts as the source of truth.** You already write
   immutable per-run artifacts under `.runs/<id>/` plus a `ProgressEvent` stream
   and a canonical `RunReport`. We **formalize** that as the append-only event
   log — never mutate a run — and _derive_ every index from it. This makes the
   knowledge base rebuildable from scratch and trustworthy.

3. **A hybrid retrieval index** over those artifacts, on a **single PostgreSQL
   database**: **structured tables + `JSONB`** for precise filtering and the raw
   `RunReport`, **`pgvector`** for semantic "have we tested something like this
   before", and **graph relations** (an `edges` table traversed with recursive
   CTEs, or Apache AGE) for multi-hop reasoning ("which fix heals which failure
   class"). Postgres collapses what would otherwise be three stores into one
   engine. Use **managed/serverless Postgres (Neon/Supabase)** to keep operational
   overhead low.

**Not recommended as a starting point:** standing up Neo4j or a separate
knowledge microservice on day one, or reaching for an agent-memory framework
(LangChain/LlamaIndex/Mem0/Letta). They solve problems you don't have yet or
impose abstractions that fight the Claude Agent SDK + Playwright-CLI pipeline. The
design keeps them as _promotion targets_, reachable without rewriting agents.
**SQLite + `sqlite-vec`** remains documented in §3.3 as a zero-dependency fallback
if this ever needs to run strictly single-user/local with no database at all.

The single most valuable early capability is **coverage-aware generation**: before
the Generator writes anything, the Knowledge Layer tells it which planned
scenarios are already covered (reuse), which are near-duplicates (skip), and which
are genuinely new (generate). That one loop delivers most of the "avoid duplicate
generation / merge intelligently / reuse modules" goals — and it needs only the
structured tables (no embeddings), so Phase 1 ships value before pgvector is even
turned on.

> **Storage decision (2026-06-05):** PostgreSQL + `pgvector` is the chosen
> storage engine, preferably managed/serverless (Neon). Rationale: it consolidates
> the structured, semantic, and graph tiers into one engine; supports concurrent
> runs and multiple apps/tenants; and avoids a "SQLite-now, migrate-later" hop
> given the platform's multi-agent ambition. The trade-off accepted: the project
> takes on running a database (mitigated by serverless Postgres). Everything below
> assumes Postgres; the SQLite variant is retained only as a fallback note.

---

## 1. Where this plugs into the current system

| Current module                    | Role today                                             | Change                                                                                                                                                                |
| --------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/orchestrator/orchestrate.ts` | Drives Planner→Generator→Validator→run→Healer→Reporter | Add 1 ingestion call after `buildReport`; pass a `KnowledgeService` into stage deps                                                                                   |
| `src/orchestrator/stages.ts`      | Builds each agent's prompt                             | Add a retrieval call that prepends a **context pack** to planner/generator/healer prompts (same place `buildPlannerConstraints` / the generator prompt are assembled) |
| `src/agents/workspace.ts`         | Owns `.runs/<id>/` files                               | Add a `manifest.json` per run (what artifacts exist + content hashes). Otherwise unchanged                                                                            |
| `src/runManager/persistence.ts`   | Saves `run.json`, `report.html`                        | Ingestion rides the **same completion seam** (`store.complete` → `save`)                                                                                              |
| `src/reporter/report.ts`          | Produces the canonical `RunReport`                     | `RunReport` becomes the **ingestion payload** — no new schema invented                                                                                                |
| `src/coverage/coverage.ts`        | Token-overlap flow matching                            | Reused verbatim for cross-run coverage/dedupe (`norm`, `significantTokens`)                                                                                           |
| `src/validator/validate.ts`       | Static findings + scores                               | Findings feed the **anti-pattern playbook**; scores rank "trusted" specs                                                                                              |
| `src/types.ts`                    | Domain model                                           | Source of the knowledge entity shapes (`Run`, `RunReport`, `TestResult`, `ValidationReport`, `CoverageSummary`, `Flow`)                                               |

The seams already exist. Nothing about the agents' control flow changes; they just
receive richer prompts and emit one extra event on completion.

---

## 2. Architecture options — evaluation & comparison

Each row rated for **this** project (Node/Next.js, in-process, ~tens of apps,
hundreds–thousands of runs, no DB today). Scores: ◐ partial, ● strong, ○ weak.

| Approach                                                 | Pros                                                                                                            | Cons                                                                                       | Scalability             | Complexity         | Retrieval quality                        | Agent reasoning                          | Ops overhead           |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------- | ------------------ | ---------------------------------------- | ---------------------------------------- | ---------------------- |
| **RAG (retrieval-augmented generation)**                 | Simple mental model; great for "find similar past spec/flow"; pairs naturally with prompt injection             | Chunks lose structure & relations; no notion of "current best suite"; stale chunks mislead | ● (vector index scales) | ◐                  | ● for similarity, ○ for exact/relational | ◐ (recall good, precision needs filters) | ◐ (embeddings + store) |
| **Agent Memory Systems** (episodic/semantic/procedural)  | Matches the mental model of "agents that learn"; distinguishes raw episodes from distilled lessons              | Ill-defined without a store underneath; consolidation/forgetting is real work              | ●                       | ◐–●                | ● when distilled                         | ● (the point)                            | ◐                      |
| **LLM Wiki / Knowledge Base** (curated docs/playbooks)   | Human-readable, governable, auditable; perfect for "successful strategies" & anti-patterns; cheap to inject     | Manual curation rots; not great for fine-grained per-spec lookup                           | ●                       | ○                  | ◐ (coarse-grained)                       | ● for strategy, ○ for specifics          | ○                      |
| **Vector Database** (Chroma/LanceDB/pgvector/sqlite-vec) | Best semantic recall; mature tooling                                                                            | A vector store alone has no truth/relations; embedding drift; "similar ≠ correct"          | ●                       | ◐                  | ● semantic, ○ structured                 | ◐                                        | ◐ managed / ○ embedded |
| **Knowledge Graph (Neo4j)**                              | Excellent for relations & multi-hop ("flows on page", "fix→failure class", "spec supersedes spec"); explainable | New DB + query language; overkill early; ingestion mapping is non-trivial                  | ●                       | ● (high)           | ● relational, ○ semantic                 | ● relational reasoning                   | ● (server, backups)    |
| **Hybrid Memory** (structured + vector + graph)          | Covers precision **and** recall **and** relations; degrades gracefully                                          | Most moving parts; needs a coherent assembly layer                                         | ●                       | ●–◐ (if staged)    | ●                                        | ●                                        | ◐ (if embedded-first)  |
| **Long- vs Short-term memory split**                     | Clean separation: durable KB vs per-run working context (token-budgeted)                                        | Not an architecture by itself — a discipline applied to the above                          | ●                       | ○                  | n/a                                      | ● (prevents context bloat)               | ○                      |
| **Event-Sourced architecture**                           | Immutable truth; rebuildable indexes; perfect audit/provenance; you already half-have it                        | Read models need derivation; eventual consistency to reason about                          | ●                       | ◐                  | n/a (substrate)                          | ◐ (enables episodic memory)              | ◐                      |
| **Knowledge Layer / Execution Layer separation**         | Clean boundary; agents stay simple; KB swappable without touching agents; enables future multi-agent            | Requires disciplined interface design up front                                             | ●                       | ○ (organizational) | n/a (enabler)                            | ● (scales to many agents)                | ○                      |

### Reading of the table

- **No single approach wins.** Vector-only gives "similar but maybe wrong";
  graph-only gives relations but weak semantics; wiki-only gives strategy but not
  specifics; event-sourcing gives truth but no retrieval.
- **The winners compose:** _event-sourced truth_ (substrate) → _structured +
  vector + light graph_ (hybrid index) → _long/short-term memory discipline_
  (assembly) → _knowledge/execution separation_ (boundary). That composition is
  the recommendation.

---

## 3. Recommended architecture (the composition)

```
┌──────────────────────────── EXECUTION LAYER (exists) ───────────────────────────┐
│  Next.js UI ─► RunManager ─► Orchestrator ─► [Planner → Generator → Validator     │
│                                              → run → Healer → Reporter]           │
│  Per-run immutable artifacts:  .runs/<id>/{plan.md, specs/, tests/, screenshots/, │
│                                results.json, run.json, report.html, manifest.json}│
└───────────────┬───────────────────────────────────────────────▲──────────────────┘
   ingest(report)│  (on run complete)                 context pack│ (on prompt build)
┌───────────────▼───────────────────────────────────────────────┴──────────────────┐
│                              KNOWLEDGE LAYER (new: src/knowledge/)                 │
│                                                                                    │
│  Ingestion ─► normalize RunReport → entities + edges + embeddings + blobs          │
│                                                                                    │
│  ┌── Artifact store (truth) ──────────┐  ┌── PostgreSQL (one engine) ───┐          │
│  │ content-addressed blobs (.runs +   │  │ tables+JSONB: apps, runs,    │          │
│  │ knowledge/blobs/), append-only     │  │ specs, flows, results,       │          │
│  │ event log — rebuild source         │  │ healings, validations,       │          │
│  └────────────────────────────────────┘  │ coverage, approvals          │          │
│                                           │ pgvector: embeddings (HNSW)  │          │
│  (promote later, only under pressure:     │ edges + recursive CTEs/AGE:  │          │
│   S3 blobs · Neo4j graph · own service)   │ graph relations              │          │
│                                           └──────────────────────────────┘          │
│  Retrieval (hybrid: filter → semantic → graph-expand → re-rank)                    │
│  Distillation (episodic → semantic playbooks)   Knowledge API (TS iface + opt HTTP)│
└────────────────────────────────────────────────────────────────────────────────────┘
```

### 3.1 Data model (entities)

Derived directly from `src/types.ts` — no new vocabulary.

| Entity                    | Keyed by                                  | Source field(s)                                  | Notes                                                 |
| ------------------------- | ----------------------------------------- | ------------------------------------------------ | ----------------------------------------------------- |
| **App** (target)          | normalized domain+path of `RunConfig.url` | `run.config.url`                                 | The cross-run anchor. Everything hangs off App        |
| **Run**                   | `run.id`                                  | `Run`                                            | Immutable episode; `createdAt`, `crawlMode`, `status` |
| **Page** (crawl result)   | (appId, url)                              | Planner output / `plan.md`                       | Discovered pages + interactive elements               |
| **Flow**                  | (appId, normalized name)                  | `RunReport.flows`, `fixtures/tarento-flows.json` | Curated + discovered; the coverage anchor             |
| **PlanScenario**          | (runId, ordinal)                          | `plan.md` via `parsePlanScenarios`               | Bridges plan → spec → flow                            |
| **Spec** (generated test) | content hash + (appId, title)             | `RunReport.generatedSpecs[]`                     | The reusable unit; carries embedding                  |
| **TestResult**            | (runId, fileName)                         | `RunReport.results[]`                            | outcome, failureReason, healed, flaky                 |
| **HealingEvent**          | (runId, fileName)                         | reconciled pre/post + healer diff                | failure class → fix; the "learn from fixes" gold      |
| **ValidationFinding**     | (runId, file, rule)                       | `RunReport.validation`                           | feeds anti-pattern playbook                           |
| **CoverageSnapshot**      | (runId)                                   | `RunReport.coverage`                             | per-run coverage of curated flows                     |
| **Approval / Feedback**   | (runId or specId, user, ts)               | new UI events                                    | first-class signal; re-weights retrieval              |
| **Artifact** (blob)       | content hash                              | screenshots, traces, logs                        | content-addressed; never re-embedded                  |
| **Playbook** (distilled)  | (scope, key)                              | distillation job                                 | semantic memory: strategies & anti-patterns           |

### 3.2 Relationships (graph edges — a Postgres `edges` table, traversed with recursive CTEs)

```
App        1──*  Run            App        1──*  Flow         App        1──*  Page
Run        1──*  PlanScenario   Run        1──*  Spec         Run        1──*  TestResult
Spec       *──1  PlanScenario   Spec       *──*  Flow (TESTS) Flow       *──*  Page (APPEARS_ON)
Spec       1──*  HealingEvent   Spec       1──*  ValidationFinding
Spec       *──1  Spec (DERIVED_FROM / SUPERSEDES)   Run *──1 Run (SUPERSEDES per app)
Approval   *──1  Run|Spec       HealingEvent *──1 FailureClass (PATTERN_OF)
```

These are the multi-hop questions the graph answers: _"for app X, what is the
current-best spec for flow Y, what healed it last time it broke, and was it
approved?"_ — one traversal, not five queries.

### 3.3 Storage architecture (PostgreSQL as the single engine)

| Concern                | Tech                                                          | Holds                                                  | Notes                                                                     |
| ---------------------- | ------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------- |
| **Truth**              | filesystem (`.runs/` + `knowledge/blobs/`), content-addressed | raw artifacts, append-only event log                   | Large blobs stay on disk/object store; Postgres holds references + hashes |
| **Structured + raw**   | **PostgreSQL** tables + **`JSONB`**                           | entities, `edges`, materialized views, raw `RunReport` | ACID; concurrent runs; multi-tenant via `app_id`/schema                   |
| **Semantic**           | **`pgvector`** (extension, same DB)                           | `embedding vector(N)` columns + metadata               | HNSW index, cosine ops — vectors live beside the rows they describe       |
| **Graph**              | **`edges` table + recursive CTEs** (or **Apache AGE**)        | typed relations (TESTS, HEALED_BY, SUPERSEDES, …)      | Multi-hop in SQL; AGE only if Cypher-style queries become routine         |
| **Lexical (optional)** | **`tsvector`** full-text                                      | keyword search over specs/plans/failures               | Combine with pgvector for hybrid lexical+semantic in one query            |

**Postgres is the keystone** — it consolidates the structured, semantic, graph,
and lexical concerns into **one database**, so there is no multi-store
synchronization to manage. Run it **managed/serverless (Neon or Supabase)** to
keep ops light: no server to babysit, point-in-time backups included, and a
serverless driver that fits Next.js. For local dev, a `docker compose` Postgres
with the `pgvector` image. Everything is still **rebuildable from the Truth tier**
(replay `ingestRun` over the artifact log), so the database is an index, never the
irreplaceable record.

**Connection management (Next.js):** create a single `pg.Pool` and stash it on
`globalThis` — the same pattern `getRunStore()` already uses (`src/runStore/store.ts`)
to survive Next.js module duplication and HMR. On serverless/edge, use the
provider's pooled/HTTP driver (e.g. Neon serverless) to avoid connection
exhaustion.

**Promotion targets (only under real pressure):** dedicated **Neo4j** if graph
traversal dominates cost and AGE isn't enough; a managed **vector DB** only if
embedding volume outgrows pgvector's HNSW at your scale; object storage (S3) for
blobs at multi-node scale. None of these change the agents or the
`KnowledgeService` interface.

> **SQLite fallback (not the chosen path):** if the project ever must run strictly
> single-user/local with zero database dependency, the identical schema runs on
> **SQLite (`better-sqlite3`) + `sqlite-vec`** in one file. The layering, ingestion,
> retrieval, and agent seams are unchanged — only `store/db.ts` and `store/vectors.ts`
> differ. Documented so the door stays open; Postgres is the recommendation.

### 3.4 Indexing strategy (Postgres index types)

- **Structured:** **B-tree** indexes on `app_id`, `run_id`, `flow_id`, `outcome`,
  `rule`, `created_at`. A **materialized view** `current_best_suite(app_id)` =
  latest approved + validated + passing spec per flow (`REFRESH` after ingest).
- **Semantic (`pgvector`):** embed _normalized intent text_, not raw code. For a
  Spec: `title + plan steps + assertion summary` (strip volatile selectors). Also
  embed Flow `name+steps`, failure `reason`, and healing `rationale`. Store an
  `embedding vector(N)` column with `(entity_id, app_id, kind)`; index with
  **HNSW** (`USING hnsw (embedding vector_cosine_ops)`) so semantic search is
  fast and always **app-filterable** (`WHERE app_id = ? ORDER BY embedding <=> ?`).
- **JSONB / arrays:** **GIN** index on the raw-`RunReport` `JSONB` column and on
  the coverage token-set arrays, so containment queries (`@>`) are fast.
- **Coverage fingerprints:** per App, store covered-flow token-sets
  (`significantTokens` from `coverage.ts`) as a `text[]`/`JSONB` with a GIN index →
  "is this scenario already covered?" is an indexed containment check before any
  LLM call.
- **Lexical (optional):** a `tsvector` column + **GIN** index for keyword search;
  fuse with the pgvector rank for hybrid lexical+semantic retrieval.
- **Dedup keys:** Spec content hash (exact, B-tree/unique) + embedding cosine ≥ τ
  (near-dup, via the HNSW index).

### 3.5 Retrieval strategy (hybrid, staged — precision then recall then relations)

```
query(stage, appId, task)
  1. STRUCTURED PRE-FILTER   → WHERE app_id=? [AND flow/recency/outcome]   (precise, cheap)
  2. SEMANTIC SEARCH         → vector top-k within the filtered set        (recall)
  3. GRAPH EXPAND            → pull healings/validations/approvals for hits (reasoning context)
  4. RE-RANK                 → score = w1·recency + w2·passRate + w3·approved
                                       + w4·validationScore − w5·flake      (trust)
  5. ASSEMBLE                → token-budgeted ContextPack (long→short memory)
```

This beats pure-RAG (adds structure + relations + trust) and pure-graph (adds
semantics), and every stage is independently testable.

### 3.6 Agent memory strategy (long vs short term)

- **Long-term memory = the Knowledge Layer.** Durable, cross-run, cross-app.
  Split into:
  - _Episodic_ — individual runs/results/healings (raw, append-only).
  - _Semantic_ — distilled Playbooks ("`networkidle` waits flake on SPA routes",
    "accordion panels need explicit visibility waits"), produced by the
    distillation job from many episodes. This is the LLM-wiki layer, but
    _generated and evidence-linked_, not hand-curated.
  - _Procedural_ — successful crawl/generation strategies per app or component
    type (e.g., "for this app, depth-1 standard mode covered 90% in 8 specs").
- **Short-term memory = the per-run ContextPack.** Assembled fresh at each agent
  boundary, **token-budgeted**, scoped to the target App + current task, then
  discarded. Prevents context bloat and keeps each agent's prompt focused.

---

## 4. Workflows

### 4.1 Knowledge ingestion (new execution data → knowledge)

Hook point: **run completion**, the same seam as `RunStore.complete` →
`persistence.save`. One call, idempotent by `runId`:

```ts
// in orchestrate.ts, after buildReport(...)
await knowledge.ingestRun(report); // fire-and-forget-safe; logs, never throws
```

`ingestRun(report: RunReport)`:

1. Upsert **App** from `report.url`.
2. Insert **Run**, **Specs**, **TestResults**, **ValidationFindings**,
   **CoverageSnapshot**, **HealingEvents** (from healed=true results + pre/post
   reconciliation) into the Postgres tables + `edges` (one transaction).
3. Content-address blobs (screenshots/traces/logs) into `knowledge/blobs/`;
   write/refresh `.runs/<id>/manifest.json`.
4. Compute embeddings for spec-intent, flows, failures, healings → `pgvector`
   columns.
5. Update App coverage fingerprints and the `current_best_suite` view.
6. Emit a `knowledge:ingested` event for observability.

Append-only: ingestion **never mutates** a prior run. Re-ingesting the same
`runId` is a no-op/upsert, so it's crash-safe and replayable.

### 4.2 Knowledge update / consolidation

- **Runs** are immutable. **Derived views** (current-best-suite, coverage map,
  playbooks) are recomputed/upserted — never hand-edited.
- **Distillation job** (async, batched, off the run hot-path): scans recent
  episodes, clusters failures/healings/validations, writes **Playbook** entries
  with links back to evidence. Re-runs incrementally.
- **Feedback/approvals** are events that **re-weight**, never delete: approved
  specs gain rank; rejected patterns gain negative weight (so a bad pattern stops
  being suggested without erasing history).
- **Drift handling:** if a later run shows an App's pages/flows changed
  materially, mark stale flows `superseded` (don't delete) so retrieval prefers
  current reality but history stays auditable.

### 4.3 Context assembly (per agent)

`assembleContext(stage, appId, task) → ContextPack` (token-budgeted):

- **Planner** (before exploration): App profile — known pages, prior flows,
  coverage map, known-flaky areas, the crawl strategy that worked best last time.
  → _"Here's what we already know about this app; focus exploration on gaps."_
- **Generator** (before generating, per planned scenario): `planCoverageDecision`
  returns `reuse | extend | new` per scenario with evidence (existing spec,
  similarity, last outcome), plus reusable snippets/locators and validation
  lessons. → _"Reuse these, extend that, only generate these; avoid `networkidle`
  here; don't duplicate spec #N."_
- **Healer** (on a failure): `getHealingPrecedents(failure)` — how this failure
  class / locator / app was fixed before. → _"This broke before; the fix was X."_
- **Validator** stays deterministic; optionally consults learned anti-patterns to
  prioritize findings.

### 4.4 How "intelligent merge / dedupe" actually works

Before the Generator runs, for each candidate PlanScenario:

```
match = coverageFingerprint(appId).match(scenario)           // token overlap (coverage.ts)
       ⊕ semanticSearch(scenario.embedding, appId, k)        // near-duplicate specs
decision =
  exact/near-dup & last outcome passed   → REUSE  (skip generation, link spec)
  partial overlap                        → EXTEND (prompt Generator to augment existing spec)
  no match                               → NEW    (generate fresh)
```

The Generator's prompt is shaped by these decisions, so it physically cannot
re-generate a covered scenario. After validation+approval, the
`current_best_suite` view is updated — that materialized view _is_ the
"intelligently merged suite" for the app.

---

## 5. Code organization

### 5.1 Folder structure

```
src/knowledge/
  index.ts                 # KnowledgeService factory + public interface
  types.ts                 # ContextPack, SpecMatch, AppProfile, CoverageDecision, Playbook
  store/
    db.ts                  # pg.Pool (stashed on globalThis), migrations runner
    migrations/            # 0001_init.sql, 0002_edges.sql, 0003_pgvector.sql, ...
    blobs.ts               # content-addressed blob store (.runs + knowledge/blobs)
    vectors.ts             # pgvector adapter (embedding columns + HNSW), behind an interface
  ingest/
    ingestRun.ts           # RunReport → entities/edges/embeddings/blobs (idempotent)
    extract.ts             # plan scenarios, healing events, failure classes
  retrieve/
    query.ts               # hybrid retrieval (filter→semantic→graph→rerank)
    coverage.ts            # planCoverageDecision (reuses src/coverage)
    healing.ts             # getHealingPrecedents
  assemble/
    contextPack.ts         # per-stage, token-budgeted assembly
  distill/
    playbooks.ts           # episodic → semantic consolidation job
  api/
    service.ts             # in-process KnowledgeService impl
    http.ts                # optional: thin HTTP facade for future multi-agent
  embeddings/
    embed.ts               # embedding provider (local model or Anthropic-adjacent), cached
knowledge/                 # runtime data (gitignored): blobs/ (Postgres holds rows+vectors)
docs/knowledge-platform-architecture.md   # this file
# DB connection via env: KNOWLEDGE_DATABASE_URL (e.g. postgres://… or Neon URL)
```

This mirrors the existing module idioms (`Workspace`, `RunPersistence`,
`RunStore`): a behavioral interface, callers never touch SQL or paths.

### 5.2 Service architecture

- **Phase 1–3: in-process client to a managed DB.** `KnowledgeService` is a module
  the orchestrator constructs (like `createWorkspace` / `getRunStore`) and threads
  through `StageDeps`. It talks to **managed/serverless Postgres** over a pooled
  connection — there is **no new service of your own to run**; the database is the
  only external dependency, and serverless Postgres keeps that near zero-ops. This
  is the one deliberate departure from the original "no DB" posture, accepted for
  the platform's concurrency and multi-agent needs.
- **Phase 4+: extractable.** Because everything goes through the
  `KnowledgeService` interface and an optional `api/http.ts` facade, the layer can
  later run as its **own service** (same Postgres + pgvector, optionally Neo4j/AGE)
  shared by many agents **without changing a single agent prompt or stage** — only
  the service wiring. Postgres being a networked DB from day one means this
  extraction is a deployment change, not a re-architecture.

### 5.3 Knowledge API (the contract)

```ts
interface KnowledgeService {
  // ingestion
  ingestRun(report: RunReport): Promise<void>;
  recordFeedback(e: FeedbackEvent): Promise<void>; // approval / rejection

  // app-level retrieval
  getAppProfile(url: string): Promise<AppProfile>; // pages, flows, coverage, flaky areas
  getCoverageMap(appId: string): Promise<CoverageMap>;

  // generation support
  planCoverageDecision(
    scenarios: PlanScenario[],
    appId: string,
  ): Promise<CoverageDecision[]>; // reuse | extend | new + evidence
  findSimilarSpecs(
    query: string,
    appId: string,
    k: number,
  ): Promise<SpecMatch[]>;

  // healing support
  getHealingPrecedents(failure: FailureKey): Promise<HealingPrecedent[]>;

  // distilled memory
  getPlaybooks(scope: PlaybookScope): Promise<Playbook[]>;

  // the one call agents actually use
  assembleContext(
    stage: RunStage,
    appId: string,
    task: TaskRef,
  ): Promise<ContextPack>;
}
```

`assembleContext` is the façade agents call; the granular methods exist for the UI
("show me coverage for this app") and for testing.

---

## 6. Memory management patterns

- **Token budget per ContextPack** (e.g. ≤ N tokens/stage); re-rank then truncate.
- **Tiered retention:** hot (recent N runs/app) fully indexed; cold archived to
  blobs, summarized into playbooks, dropped from the vector index.
- **Summarize-on-consolidate:** distillation replaces many episodes with one
  evidence-linked playbook entry → bounded growth.
- **Content-addressing** dedupes identical screenshots/traces across runs.
- **Embedding cache** keyed by content hash (don't re-embed unchanged specs).
- **Per-App namespaces** in every index so retrieval is always app-scoped first
  (precision + future multi-tenant isolation for free).
- **Recency/trust decay:** old, never-approved, flaky knowledge sinks in ranking
  rather than being deleted.

---

## 7. Observability & governance

- **Provenance:** every ContextPack records _which knowledge items were injected
  into which agent in which run_, surfaced on the existing `ProgressEvent`
  stream. You can always answer "why did the Generator reuse spec #N?".
- **Ingestion/retrieval metrics:** items ingested, embedding latency, retrieval
  hit-rate, mean re-rank score, cache hit-rate.
- **Effectiveness loop (closes M-style metrics):** do reused specs pass more often
  than freshly generated ones? Does healing-precedent injection raise heal
  success? Track and report — this is how you prove the KB is _working_, not just
  _present_.
- **Governance / safety:**
  - **Secret & PII scrubbing** on ingest for logs/screenshots (URLs, tokens,
    form values) before anything is stored or embedded.
  - **Approval-gated promotion:** only validated + approved specs become
    "trusted" / part of `current_best_suite`; unapproved stays episodic.
  - **Retention/TTL policy** per App; right-to-delete = drop App namespace +
    blobs (truth tier is the only place data must be erased).
  - **Determinism & rebuildability:** Postgres indexes are reproducible from the
    artifact Truth tier (replay `ingestRun`), so a
    bad migration or embedding model swap is recoverable by replay.
  - **Access scoping** per App/tenant from day one (namespaces), even if a single
    user today.

---

## 8. Phased implementation roadmap

Each phase is independently shippable and delivers value alone. Effort is relative.

| Phase                                  | Goal                                        | Build                                                                                                                                                                 | Agents gain                                           | Tier used              | Effort |
| -------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ---------------------- | ------ |
| **0 — Formalize substrate**            | Trustworthy event log                       | per-run `manifest.json`; content-address blobs; declare `.runs/` append-only; provision **managed Postgres (Neon)** + `pgvector` extension + migration runner         | (none yet)                                            | Truth + empty DB       | S      |
| **1 — Structured KB + ingestion**      | History-aware planning & coverage detection | `src/knowledge/` skeleton; **Postgres schema** (tables + `edges` + `JSONB`); `ingestRun()` at completion seam; `getAppProfile`/`getCoverageMap`; Planner context pack | **Planner** loads prior pages/flows/coverage          | Postgres (structured)  | M      |
| **2 — Semantic retrieval + dedupe**    | Reuse & avoid duplicate generation          | add **`pgvector` columns + HNSW**; embeddings; hybrid retrieval; `planCoverageDecision`; `findSimilarSpecs`; Generator context pack + merge decisions                 | **Generator** reuses/extends/skips; intelligent merge | Postgres (+ pgvector)  | M–L    |
| **3 — Healing memory + playbooks**     | Learn from fixes & strategies               | `HealingEvent` extraction; `getHealingPrecedents`; distillation → Playbooks; validation anti-patterns                                                                 | **Healer** uses precedents; all agents get playbooks  | Postgres               | M      |
| **4 — Graph, governance, multi-agent** | Multi-hop reasoning, scale, provenance      | recursive-CTE/AGE graph queries (or Neo4j **if** needed); provenance on event stream; feedback re-weighting; HTTP API facade                                          | parallel/multi-agent workflows; explainability        | Postgres (+ AGE/Neo4j) | L      |

**Recommended first slice (highest value / lowest risk): Phase 1.** It's pure
structured data on Postgres, reuses `coverage.ts`, needs no embeddings, and
immediately makes the Planner history-aware and gives the UI a real coverage view.
Phase 0 does the one-time Postgres provisioning so Phase 1 is schema + ingestion
only. Phase 2 then just adds `pgvector` columns to the same tables — the big reuse
win, no new store.

---

## 9. Risks & mitigations

| Risk                                                  | Mitigation                                                                                                                                       |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| "Similar ≠ correct" — reusing a stale/wrong past spec | Trust re-ranking (approval + validation score + recency); reuse only above threshold _and_ last-passed; drift supersession                       |
| Embedding/index drift over model changes              | The artifact Truth tier is authoritative; Postgres indexes are rebuildable by replaying `ingestRun`; embeddings keyed by content hash + model id |
| Ingestion on the run hot-path slows runs              | Make `ingestRun` async/best-effort (mirror `persistence.save` "log, never throw"); heavy distillation is off-path                                |
| Knowledge bloat / context overflow                    | Token-budgeted packs; consolidation; tiered retention                                                                                            |
| New DB dependency (departs the "no DB" posture)       | Use **managed/serverless Postgres** (Neon) — no server to run; one connection string; fully rebuildable from the Truth tier                      |
| Postgres connection exhaustion in Next.js/serverless  | Single pooled `pg.Pool` on `globalThis` (mirrors `getRunStore`); use the serverless/HTTP driver on edge runtimes                                 |
| Scope creep into Neo4j/microservices too early        | One Postgres engine already covers structured + vector + graph; Neo4j/AGE/own-service are _promotion targets_ gated on real query/scale pressure |
| Stored secrets/PII from logs & screenshots            | Scrub-on-ingest; per-App TTL/delete; approval-gated trust                                                                                        |

---

## 10. How this enters CRAFT

This is a **new initiative**, not a tweak — it deserves the process that just
caught the validation-stage drift. Recommended path:

1. **Clarify** (`/craft-framework:clarify`) — frame the problem & success metric
   (e.g. "reused-spec pass-rate ≥ freshly-generated; ≥X% duplicate generation
   avoided"). Optionally **Shape** to pick the first slice (Phase 1).
2. **Record** — turn this RFC's Phase-1 scope into Spec requirements + acceptance
   criteria (the entities, `ingestRun`, `getAppProfile`, Planner context pack).
3. **Assemble → Forge → Test & Tune** per phase, one slice at a time.

This document is the **input** to Clarify/Record, not a substitute for them — it
maps the territory so the Spec can commit to a precise first slice.

```

```
