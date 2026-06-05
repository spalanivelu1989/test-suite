# Knowledge Platform — Planner Memory & Generator Reuse

How the test-suite gets faster and cheaper the more it runs against the same app:
the **Planner** remembers its previous plan, and the **Generator** reuses
previously-generated tests when a planned scenario semantically matches one it has
seen before. This document explains both mechanisms and the PostgreSQL / pgvector
machinery underneath.

> Authoritative decisions live in `docs/adr/0002-local-embedder.md` and
> `docs/adr/0003-hybrid-additive-matching.md`. This doc is the operator/engineer
> reference; the ADRs are the "why we will not re-litigate this" record.

---

## 1. The one rule that makes the design coherent

There is **exactly one coverage-decision layer: the Generator.** The Planner never
decides what is "already covered." This avoids two stages de-duplicating against
history with different logic and disagreeing (an earlier bug: the Planner silently
dropped covered flows, so the Generator never got a reuse candidate and nothing
was ever copied forward).

| Stage         | Knows about prior runs?                            | Job                                                      |
| ------------- | -------------------------------------------------- | -------------------------------------------------------- |
| **Planner**   | Only its **previous plan** (as reference _memory_) | Crawl the live URL, write `plan.md`                      |
| **Generator** | Yes — the app's **previous specs + embeddings**    | Per scenario: **`reuse`** (copy) or **`new`** (generate) |

Memory ≠ coverage decision. The Planner is handed raw prior-plan _text_; it never
receives a reuse/skip verdict. Reuse is computed solely by the Generator.

---

## 2. Planner memory (faster re-planning)

On a re-run of a known URL the Planner used to explore from scratch every time.
Now it is handed the **previous run's `plan.md`** for the same URL as reference
memory — an accelerator, not a substitute.

### How it works

1. `KnowledgeService.getLastPlan(url)` fetches the most recent prior plan for the
   app (normalized origin) from the `raw_reports` table:

   ```sql
   SELECT report->>'planMarkdown' AS plan
     FROM raw_reports
    WHERE app_id = $1 AND report->>'planMarkdown' IS NOT NULL
    ORDER BY created_at DESC
    LIMIT 1
   ```

   (`raw_reports.report` is the full `RunReport` stored verbatim as JSONB; the
   plan text is the `planMarkdown` field.)

2. In the planning stage (`src/orchestrator/stages.ts` → `planTests`), if a prior
   plan exists it is injected into the Planner prompt as a `MEMORY` block, clipped
   to **~16,000 chars (~4k tokens)**, wrapped in `<previous-plan>…</previous-plan>`,
   followed by an explicit instruction:

   > Still open the browser and crawl the live site yourself. Reuse the sections
   > that still apply, revise anything that changed, and ADD any new or obvious
   > flows you discover — do NOT blindly copy it, and do NOT omit a current flow
   > just because it is absent here.

3. The run event `🧠 Loaded previous plan as memory` is emitted.

### Properties

- **Best-effort & guarded.** Wrapped so a cold/missing/failing KB just yields _no_
  memory — the planner prompt is then byte-identical to a first-ever run and the
  run never breaks.
- **First run on a URL** → no prior plan → no memory block (KB-independent prompt).
- **Independence preserved.** The Planner is told to still crawl, so newly-added
  pages/removed features are caught; the memory only saves re-derivation effort.
- **Not a coverage decision.** `getLastPlan` returns plain text, never a reuse
  verdict — so the single-decision-layer property (§1) holds.

---

## 3. Generator reuse (copy instead of regenerate)

For each scenario in `plan.md`, the Generator decides **`reuse | new`** by matching
the scenario against the app's previously-stored specs. This is a **2-way**
decision (there is no middle "extend" tier — that tier carried no source and was
silently skipped, leaving planned flows with no test).

```
reuse  →  copy the prior spec's source into the workspace verbatim (tagged), no LLM
new    →  generate the test from scratch with the browser agent
```

### The decision (`src/knowledge/retrieve/coverageDecision.ts`)

Per scenario, over all of the app's stored specs, pick the best match by
`max(lexical, semantic)`, then:

```
confident = (lexical ≥ REUSE_THRESHOLD)  OR  (cosine ≥ SEM_REUSE)
reuse   if  confident  AND  the matched spec's last run passed (or healed)
new     otherwise   — weak match, OR a strong match whose prior run FAILED
```

| Constant          | Value    | Meaning                            |
| ----------------- | -------- | ---------------------------------- |
| `REUSE_THRESHOLD` | **0.80** | lexical overlap-coefficient bar    |
| `SEM_REUSE`       | **0.82** | cosine-similarity bar (embeddings) |

Either signal alone can clear the bar (**hybrid OR**). The decision **errs to
`new`** — a near-miss regenerates rather than copying a possibly-wrong test, so a
borderline match never masks a coverage gap.

**Two signals:**

- **Lexical** — `overlapCoefficient(scenarioTokens, specTokens) = |∩| / min(|a|,|b|)`.
  Robust to length asymmetry (short scenario title vs. longer spec intent). Spec
  tokens = `significantTokens(title + filename)`; scenario tokens =
  `significantTokens(scenario name)`. An exact title match → overlap `1.0`.
- **Semantic** — cosine similarity between the scenario's embedding and the spec's
  embedding (see §4). `0` if either embedding is missing.

**The `passed` gate:** reuse requires the matched spec's most recent outcome to be
`passed` or `healed`. A strong match whose prior run **failed** is regenerated (we
never copy a known-broken test forward).

### Copying forward (`src/orchestrator/stages.ts` → `applyGeneratorKnowledge`)

- For each `reuse`, the prior spec's source is fetched (`readSpecCode` reads it out
  of `raw_reports.report.generatedSpecs[].code`), written into the workspace, and
  tagged with a header marker `@kp-reused` (constant `REUSE_MARKER`).
- The Generator prompt then says **"do NOT regenerate"** the copied scenarios and
  **"generate every other scenario — do not skip any."**
- **Fallback:** a `reuse` whose source can't actually be copied (budget-trimmed or
  missing) is _not_ skipped — it falls back into the "generate" set. No planned
  scenario is ever left without a test.

### Run-stream signal

```
🧠 Coverage decisions: 3 reuse, 12 new — 3 spec(s) copied forward, 12 to generate
```

---

## 4. Embeddings

### Model (`src/knowledge/embeddings/embed.ts`, ADR-0002)

- **`Xenova/bge-small-en-v1.5`** run locally in-process via
  `@huggingface/transformers` (transformers.js). No network, no per-call cost.
- **384 dimensions**, **mean-pooled + L2-normalized**. Because vectors are
  L2-normalized, cosine similarity == dot product.
- **Lazy-loaded** on first embed and cached for the process.
- **Symmetric**: scenarios and specs are embedded the same way (both are short
  titles/intents — no asymmetric query/document prefix).
- The `Embedder` interface is a seam: `LocalEmbedder` in prod, `FakeEmbedder`
  (deterministic, injected vectors) in tests, a hosted provider (e.g. Voyage) as a
  future drop-in — all the same shape.

### What text is embedded

| Side                      | Embedded text                                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Scenario** (query time) | the scenario **name** from `plan.md`                                                                          |
| **Spec** (ingest time)    | **intent text** = test title + numbered step-comments (`// 1. Click …`), joined. Excludes volatile selectors. |

### When embeddings are produced

- **At ingest** (`ingestRun`): each spec's intent text is embedded _before_
  persisting, **best-effort and cached** (see §5). Failure → `null` embedding →
  that spec is lexical-only.
- **At query time** (generation): each scenario name is embedded
  (`withEmbeddings`), best-effort. Embedder off/failing → `null` → lexical-only.

---

## 5. PostgreSQL & pgvector

All knowledge lives in Postgres. SQL is centralized in
`src/knowledge/store/repo.ts`; schema is forward-only migrations in
`src/knowledge/store/migrations/`.

### Schema (tables)

| Table                | Purpose                                                                                                                                                                     |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps`               | one row per app (normalized origin), `run_count`                                                                                                                            |
| `runs`               | one row per run (`run_id`, `app_id`, `url`, `crawl_mode`, `created_at`)                                                                                                     |
| `flows`              | known user flows per app (`app_id`, `flow_id`, `name`)                                                                                                                      |
| `specs`              | generated test specs — `file`, `title`, `flow_id`, `content_hash`, `reused`, `tokens[]`, **`embedding vector(384)`**, `embedding_model`                                     |
| `plan_scenarios`     | parsed plan scenario names + tokens per run                                                                                                                                 |
| `test_results`       | per-flow outcome per run (`passed`/`failed`/`healed`/…)                                                                                                                     |
| `coverage_snapshots` | curated-coverage % + `missing_flows` per run                                                                                                                                |
| `edges`              | typed graph relations (PRODUCED, TESTS, COVERS, SUPERSEDES, …)                                                                                                              |
| `raw_reports`        | the full `RunReport` JSONB, verbatim — the rebuild source of truth, and the source of both **planner memory** (`planMarkdown`) and **reuse copy** (`generatedSpecs[].code`) |

### pgvector (migration `0002_pgvector.sql`)

```sql
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE specs ADD COLUMN IF NOT EXISTS embedding       vector(384);
ALTER TABLE specs ADD COLUMN IF NOT EXISTS embedding_model TEXT;

-- Approximate nearest-neighbour (cosine) for fast top-k semantic search.
CREATE INDEX IF NOT EXISTS specs_embedding_hnsw
  ON specs USING hnsw (embedding vector_cosine_ops);
```

- **`vector(384)`** — column dimension is fixed by the embedder's `dims`. Changing
  models means a new column dimension / migration.
- **`embedding_model`** — records _which_ model produced each vector, so the cache
  (below) and any future model swap stay correct.
- **HNSW index** with `vector_cosine_ops` — approximate nearest-neighbour for fast
  top-k cosine search.

### Two different ways cosine is used — important

1. **The reuse decision (primary path)** computes cosine **in-process** in
   JavaScript. `readSpecsForApp(appId)` loads _all_ of the app's non-reused specs
   (with their embeddings parsed from text), and `decideForSpecs` calls
   `cosineSim(a, b)` per candidate. The pgvector HNSW index is **not** on this
   path — it's a per-app linear scan, which is fine because one app has few specs.

2. **`findSimilarSpecs(query, appId, k)` (the top-k API)** uses pgvector's index:

   ```sql
   SELECT s.run_id, s.file, s.title, (s.embedding <=> $2::vector) AS dist
     FROM specs s
    WHERE s.app_id = $1 AND s.reused = false AND s.embedding IS NOT NULL
    ORDER BY s.embedding <=> $2::vector
    LIMIT $3
   ```

   - `<=>` is pgvector's **cosine distance** operator.
   - Distance → similarity (vectors are normalized): **`sim = 1 − dist`**.
   - `ORDER BY … <=> …` is what the HNSW index accelerates.

### Vector serialization

pgvector's text form is `[1,2,3]`. Helpers in `repo.ts`:

- `toSqlVector(number[]) → "[…]" | null` (writes; `null` when empty).
- `parseSqlVector("[…]") → number[] | null` (reads `embedding::text`).

### Embedding cache (`embeddingForHash`)

Re-embedding identical specs is wasted compute. At ingest, before embedding a
spec, we check for an existing vector with the **same `content_hash` + same
`embedding_model`**:

```sql
SELECT embedding::text FROM specs
 WHERE content_hash = $1 AND embedding_model = $2 AND embedding IS NOT NULL
 LIMIT 1
```

Identical source ⇒ identical vector, so a cache hit reuses it and the model is
never called. (`content_hash = sha1(spec source)`.)

---

## 6. Degradation & safety (never break a run)

The Knowledge Layer is **best-effort and safe-defaulting** — it can fail or be
absent and the test run still completes.

- **No `KNOWLEDGE_DATABASE_URL`** → a _Disabled_ service: every method returns an
  empty/`null` default, no DB touched. The pipeline runs "cold" (plan + generate
  from scratch, every run).
- **DB unreachable / query throws** → `withKb(...)` wrappers catch, emit an
  `error` knowledge event, and return the safe default.
- **Embedder off or failing** → embeddings are `null`, semantic score is `0`
  everywhere, and the decision **reduces exactly to lexical-only** (Phase-1
  behavior). This is the **additive guarantee** (ADR-0003): semantic matching only
  ever _adds_ reuse; turning it off is never _worse_ than lexical alone.
- **Disable embeddings explicitly** with `EMBEDDINGS_ENABLED=false`.

---

## 7. End-to-end lifecycle on a re-run

```
                ┌───────────────────────── Knowledge (Postgres + pgvector) ──────────────────────────┐
                │  raw_reports(planMarkdown, generatedSpecs[].code)   specs(embedding, tokens, …)     │
                └───────────────▲───────────────────────────────────────────▲────────────────────────┘
                                │ getLastPlan(url)                           │ readSpecsForApp(appId)
                                │  (prior plan = MEMORY)                     │  (+ embeddings)
        ┌───────────────────────┴───────┐                  ┌────────────────┴──────────────────────────┐
  URL → │ PLANNER  (crawls live site)    │ → plan.md →      │ GENERATOR                                   │
        │  prompt += <previous-plan>     │                  │  embed each scenario name (best-effort)     │
        │  "still crawl, revise, add new"│                  │  decideForSpecs: max(lexical, cosine)       │
        └────────────────────────────────┘                 │   reuse → copy spec (@kp-reused)            │
                                                            │   new   → generate with browser agent       │
                                                            └────────────────┬────────────────────────────┘
                                                                             │ run → heal → validate
                                                                             ▼
                                                              ingestRun(RunReport): embed specs (cached),
                                                              persist apps/runs/specs/results/raw_reports
```

Each completed run is ingested (idempotent by `runId`), which embeds its specs and
stores the full report — feeding the _next_ run's planner memory and generator
reuse.

---

## 8. Calibration (`bin/knowledge-calibrate.ts`)

`SEM_REUSE` is tuned against a labeled paraphrase set with the real bge-small
model, optimizing two metrics:

- **M1** — paraphrase recall (catch reworded scenarios lexical alone misses).
- **M2** — false-reuse rate (must stay ≤ 5%): never copy a test for a genuinely
  different scenario.

`SEM_REUSE = 0.82` is conservative by design: only very-high similarity copies a
prior test forward; anything weaker regenerates. Run with:

```
npm run knowledge:calibrate
```

> The shipped labeled set is small and partly model-generated — treat calibration
> numbers as strong evidence, not the final production figure (verify against real
> runs).

---

## 9. Configuration

| Env var                    | Effect                                                            |
| -------------------------- | ----------------------------------------------------------------- |
| `KNOWLEDGE_DATABASE_URL`   | Postgres connection. **Absent → KB disabled (cold runs).**        |
| `EMBEDDINGS_ENABLED=false` | Force lexical-only (no embedder).                                 |
| `EMBEDDING_MODEL`          | Override the local model id (default `Xenova/bge-small-en-v1.5`). |

Migrations: `npm run knowledge:migrate`. Backfill embeddings for existing specs:
`npm run knowledge:embed-backfill`.

---

## 10. Key files

| Concern                                     | File                                                                |
| ------------------------------------------- | ------------------------------------------------------------------- |
| Reuse decision (lexical OR semantic, 2-way) | `src/knowledge/retrieve/coverageDecision.ts`                        |
| Embedder (bge-small, cosine, L2-norm)       | `src/knowledge/embeddings/embed.ts`                                 |
| All SQL + vector serialization + cache      | `src/knowledge/store/repo.ts`                                       |
| Schema migrations                           | `src/knowledge/store/migrations/0001_init.sql`, `0002_pgvector.sql` |
| Ingest + embed-at-ingest                    | `src/knowledge/ingest/ingestRun.ts`, `extract.ts`                   |
| Service facade + degradation                | `src/knowledge/index.ts`                                            |
| Planner memory + generator wiring           | `src/orchestrator/stages.ts`                                        |
| Public types / interface                    | `src/knowledge/types.ts`                                            |
| Calibration harness                         | `bin/knowledge-calibrate.ts`                                        |

---

## 11. Glossary

- **Cold run** — KB disabled/empty; plan + generate everything from scratch.
- **Reuse / copy-forward** — copying a prior passing spec verbatim instead of
  regenerating it (tagged `@kp-reused`).
- **Hybrid match** — lexical OR semantic; either clears the reuse bar.
- **Additive guarantee** — with embeddings off, the decision is identical to
  lexical-only; semantic never makes it worse.
- **Intent text** — title + numbered step-comments; what a spec is embedded from.
- **Overlap coefficient** — `|A ∩ B| / min(|A|, |B|)`; the lexical similarity metric.
