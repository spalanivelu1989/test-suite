# Knowledge Database — Tables & What Goes In Them

> Plain-language reference for the `knowledge` Postgres database that powers the
> Knowledge Platform (Phases 1–3). Explains every table, what data it holds, and
> **which process writes it and when**. Schema source of truth:
> `src/knowledge/store/migrations/0001_init.sql`, `0002_pgvector.sql`,
> `0003_healing_playbooks.sql`. Companion: `docs/knowledge-platform-architecture.md`.

- **Last updated:** 2026-06-07
- **Local dev DB:** `postgres://…@localhost:5433/knowledge`

---

## The key idea: three writers, three timings

Every table gets data, but not from one place. Knowing _who writes what, and when_
is the fastest way to understand the database:

| Writer                                             | Trigger                                                         | Tables it fills                                                                                                |
| -------------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **`ingestRun`** (`src/knowledge/ingest/`)          | **End of every test run** (best-effort, never blocks the run)   | apps, runs, specs, test_results, flows, plan_scenarios, coverage_snapshots, edges, raw_reports, healing_events |
| **Distillation job** (`npm run knowledge:distill`) | **Off to the side**, on demand / scheduled — _not_ during a run | playbooks, distill_watermark                                                                                   |
| **Migration tool** (`npm run knowledge:migrate`)   | **Once at setup** (and when a new migration ships)              | schema_migrations                                                                                              |

One-sentence model:

> **Per run** → `ingestRun` files away "what happened." **Now and then** → the
> distillation job turns raw heals into reusable wisdom. **Once at setup** → the
> migration tool records itself.

---

## Group 1 — Written at the end of every test run (`ingestRun` → `persistRun`)

When a run finishes, the orchestrator hands the complete `RunReport` to
`ingestRun`, which normalizes it and writes these ten tables in one transaction.
It is **idempotent by `run_id`** (re-ingesting the same run replaces its rows,
never duplicates) and **append-only across runs** (a new run never mutates an old
one). If the database is down, ingestion is skipped silently — a run never fails
because the knowledge base is unavailable.

| Table                  | What it holds (plain English)                                                                                                                                                              | Key columns                                                                                                                                           | Example                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| **apps**               | One row per website/app ever tested — its identity and activity.                                                                                                                           | `app_id` (normalized origin), `first_seen`, `last_seen`, `run_count`                                                                                  | `https://www.tarento.com`, run_count 3                     |
| **runs**               | One row per individual test run.                                                                                                                                                           | `run_id`, `app_id`, `url`, `status`, `crawl_mode`, `created_at`                                                                                       | run `32a232e6`, mode `standard`                            |
| **specs**              | Each generated test (spec) — its file, title, the flow it covers, a content fingerprint, and its **semantic embedding** (the pgvector "meaning fingerprint"). Drives duplicate-avoidance.  | `run_id`, `app_id`, `file`, `title`, `flow_id`, `content_hash`, `reused`, `tokens`, `embedding vector(384)`, `embedding_model`                        | "Submit contact form" + its 384-number vector              |
| **test_results**       | The outcome of each test in the run, and why it failed if it did.                                                                                                                          | `run_id`, `flow_id`, `file`, `outcome` (passed/failed/healed/flaky/fixme), `failure_reason`                                                           | `home.spec.ts → passed`                                    |
| **flows**              | The distinct user journeys known for an app.                                                                                                                                               | `app_id`, `flow_id`, `name`                                                                                                                           | `services`, `about`, `case-studies`                        |
| **plan_scenarios**     | The scenarios the Planner wrote into this run's plan.                                                                                                                                      | `run_id`, `app_id`, `ordinal`, `name`, `tokens`                                                                                                       | "View the services section"                                |
| **coverage_snapshots** | A per-run scorecard: how much of the app was covered.                                                                                                                                      | `run_id`, `app_id`, `curated_total`, `tested_count`, `percent`, `missing_flows`                                                                       | 8 of 10 flows, 80%                                         |
| **edges**              | The relationship graph — how entities connect.                                                                                                                                             | `app_id`, `src_type`, `src_id`, `rel`, `dst_type`, `dst_id`                                                                                           | `run → PRODUCED → spec`, `spec → TESTS → flow`             |
| **raw_reports**        | The **complete original `RunReport` kept verbatim as JSONB** — the source of truth everything else is derived from and can be rebuilt from.                                                | `run_id`, `app_id`, `report` (JSONB)                                                                                                                  | the full run report blob                                   |
| **healing_events**     | Each fix the Healer made: the failure it resolved, the before→after code, the repair strategy, and a **semantic embedding of the failure** (for precedent matching). Append-only evidence. | `run_id`, `app_id`, `flow_id`, `file`, `failure_signature`, `failure_embedding vector(384)`, `before_snippet`, `after_snippet`, `strategy`, `outcome` | `#btn-7f3a → getByRole('button')`, strategy `role-locator` |

---

## Group 2 — Written by the distillation job (`npm run knowledge:distill`)

This runs **separately from any test run** (on demand or scheduled). It reads the
accumulated `healing_events`, clusters recurring failures, and turns them into
generalized, evidence-linked principles.

| Table                 | What it holds                                                                                                                                                                         | Key columns                                                                                                                                                                                                       | Example                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **playbooks**         | Distilled **principles** learned across many runs, each with linked evidence, a support count, and a **trust status**. Only `trusted` playbooks are ever injected into agent prompts. | `id`, `scope_kind` (app/global/componentType), `scope_key`, `principle`, `antipattern`, `recommendation`, `evidence_run_ids`, `support_count`, `confidence`, `status` (episodic/trusted), `embedding vector(384)` | "Brittle CSS selectors flake; use role locators." (trusted, global) |
| **distill_watermark** | A single bookkeeping row — the timestamp of the last successful distillation — so the job only processes _new_ heals and a re-run with nothing new is a no-op.                        | `id` (always 1), `last_run_at`                                                                                                                                                                                    | one timestamp                                                       |

---

## Group 3 — Written by the migration tool (`npm run knowledge:migrate`)

| Table                 | What it holds                                                                                  | Key columns          | Example                                                |
| --------------------- | ---------------------------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------ |
| **schema_migrations** | A record of which database-setup scripts have already been applied, so each runs exactly once. | `name`, `applied_at` | `0001_init`, `0002_pgvector`, `0003_healing_playbooks` |

---

## How the agents _read_ these tables (the "memory" channels)

The same tables that `ingestRun` writes are what give the agents their cross-run
memory. Each agent reads a different slice:

| Agent         | Reads from                                       | To answer                                                        |
| ------------- | ------------------------------------------------ | ---------------------------------------------------------------- |
| **Planner**   | `raw_reports` (latest plan) + `playbooks`        | "What did I plan last time? What principles apply?"              |
| **Generator** | `specs` (+ embeddings) across **all** prior runs | "Have we already tested this? Reuse it or build new?"            |
| **Healer**    | `healing_events` (precedents) + `playbooks`      | "Have I fixed a failure like this before? What's the known fix?" |

See `docs/knowledge-platform-architecture.md` §3.6 for the long-vs-short-term
memory model behind this.

---

## Snapshot of row counts (point-in-time, 2026-06-07)

```
       table        | rows
--------------------+------
 apps               |   27
 coverage_snapshots |   30
 distill_watermark  |    1
 edges              |   69
 flows              |   40
 healing_events     |    8
 plan_scenarios     |   37
 playbooks          |    2
 raw_reports        |   30
 runs               |   30
 schema_migrations  |    3
 specs              |   31
 test_results       |   31
```

> **Caveat — real vs. test data.** At this snapshot, most rows in
> `healing_events` and `playbooks` (and many `apps`/`runs`) are from
> **integration-test fixtures** (synthetic `*.example.com` apps), not real
> tarento experience. Genuine healing memory and playbooks accumulate once live
> runs execute with the heal-capture in place. To see only real data, filter out
> the test apps, e.g. `WHERE app_id NOT LIKE '%example.com'`.

---

## Handy queries

```sql
-- Apps we know about, most recently tested first
SELECT app_id, run_count, last_seen FROM apps ORDER BY last_seen DESC;

-- Coverage history for one app — is it growing?
SELECT r.created_at, cs.percent, cs.tested_count, cs.curated_total
FROM coverage_snapshots cs JOIN runs r USING (run_id)
WHERE cs.app_id = 'https://www.tarento.com' ORDER BY r.created_at;

-- Healing precedents recorded for an app
SELECT failure_signature, strategy, outcome, created_at
FROM healing_events WHERE app_id = 'https://www.tarento.com' ORDER BY created_at;

-- Trusted, injectable playbooks
SELECT scope_kind, scope_key, principle, support_count
FROM playbooks WHERE status = 'trusted' ORDER BY support_count DESC;

-- Reach into the verbatim report JSON without any schema
SELECT report->>'url' AS url,
       jsonb_array_length(report->'generatedSpecs') AS specs,
       report->'coverage'->>'percent' AS coverage_pct
FROM raw_reports;
```

(See `docs/sql.txt` for the original connection + query cheat-sheet.)
