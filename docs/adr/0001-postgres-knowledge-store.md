# ADR-0001 — PostgreSQL as the knowledge store (departing the no-DB posture)

> A durable Architecture Decision Record. Lives in `docs/adr/` so that future
> stages and reviews read it and do not re-litigate a settled decision.

- **Status:** Accepted
- **Date:** 2026-06-05
- **Deciders:** tel@tarento.com (with Claude as Planner)
- **Relates to:** Spec `specs/knowledge-platform/spec.md` R2/C1/C2; Plan `D1`;
  `docs/knowledge-platform-architecture.md`; supersedes the de-facto "no DB"
  posture recorded in `src/runStore/store.ts`

## Context

The AI UI Testing Tool has, by design, run with **no database** — an in-memory
run store on `globalThis` plus best-effort disk persistence under `.runs/`
(`src/runStore/store.ts` explicitly cites the Constitution's "keep it simple"
rule). The Knowledge Platform (Phase 1) requires **cross-run, queryable memory**:
ingest every completed `RunReport`, then let future Planner/Generator runs detect
existing coverage. That capability cannot be met by per-process memory or by
scanning loose JSON files at scale — it needs a real, concurrently-writable,
queryable store with relations. This forces a deliberate choice about whether,
and how, to add a database.

## Decision

We will use **PostgreSQL** (managed/serverless — **Neon**) as the knowledge
store, accessed only behind the `KnowledgeService` interface. Phase 1 uses
structured tables + an `edges` relations table + the raw `RunReport` as `JSONB`;
**no `pgvector`/embeddings yet** (Phase 2). The artifacts (`.runs/` + `RunReport`)
remain the source of truth; Postgres is a **derived, rebuildable index**.

## Alternatives considered

- **Stay no-DB (in-memory + disk-scan).** Rejected: cannot serve cross-run
  queries, coverage aggregation, or concurrent runs; re-scanning `.runs/*` JSON
  per query does not scale and has no relations/indexes.
- **Embedded SQLite + `sqlite-vec`.** Rejected as the _primary_ path: viable and
  zero-ops, but single-writer concurrency is poor for parallel runs, and it would
  force a later "SQLite→Postgres" migration given the platform's multi-agent
  ambition. Retained only as a documented fallback for strictly single-user/local
  use (architecture doc §3.3).
- **Dedicated vector DB (Pinecone/Chroma) and/or Neo4j now.** Rejected: solve
  problems Phase 1 doesn't have; Postgres + `pgvector` + recursive CTEs cover
  structured, semantic, and graph needs in one engine when we reach them.
- **An agent-memory framework (LangChain/Mem0/Letta).** Rejected: imposes
  abstractions that fight the Claude Agent SDK + Playwright-CLI pipeline; we need
  ~4 capabilities, cheaper to own.

## Consequences

- **Easier:** real cross-run queries, coverage detection, concurrent runs,
  multi-tenant isolation via `app_id`, and a clean path to Phase 2 (`pgvector`
  columns on existing tables) and Phase 4 (graph via recursive CTEs/AGE) with no
  storage migration.
- **Harder / cost:** introduces a database dependency the project did not have —
  a connection string to manage, migrations to run, and a local-dev story.
  Mitigated by serverless Postgres (no server to operate) and by making all KB
  access best-effort (a run never fails because the KB is down — Spec R4/N3).
- **Constitutional position:** rule 3 ("keep it simple — simplest approach that
  satisfies the **Spec**") is honored, not broken: the Spec requires cross-run
  memory, and Postgres is the simplest thing that satisfies _that_ requirement.

## Re-litigation guard

Do **not** re-propose "just use SQLite / in-memory / scan the JSON files" in
future reviews. That path was evaluated and rejected specifically because the
platform requires concurrent writers and a non-migrating path to semantic
(`pgvector`) and graph queries. SQLite is recorded as a fallback **only** for a
strictly single-user/local deployment with no database allowed — outside that
constraint, the Postgres decision stands. Revisit only if the platform's
direction changes to single-user/offline-only.
