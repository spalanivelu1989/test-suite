# Integration Plan — pgvector (Knowledge Platform Phase 2: semantic reuse)

> Status: **Proposal / RFC** · Date: 2026-06-05
> Goal: add embedding-based **semantic** matching so the Generator catches
> _paraphrased_ duplicate tests that Phase 1's lexical matching misses.
> Input to a CRAFT Phase 2 cycle (Clarify → Record → Assemble → Forge → Test).

---

## 0. Why (the problem Phase 2 closes)

Phase 1 decides `reuse | extend | new` per planned scenario by **lexical**
token-overlap (`coverageDecision.ts` → `overlapCoefficient` on `significantTokens`).
It works when wording is similar, but is blind to meaning:

```
"Submit the contact form"  vs  "Send us a message via the Contact Us widget"
  → almost no shared words → lexical says NEW → a duplicate test is generated ✗
```

**pgvector fixes exactly this:** store an _embedding_ (a vector capturing meaning)
per spec; "is this similar?" becomes a vector-distance query, so semantically
equivalent but reworded scenarios match. This raises the recall behind the
Spec's **M2 (duplicate-avoidance)** beyond what lexical can reach.

**Good news (verified):** `pgvector 0.8.2` is already available in the local
Postgres build, and `specs` already has `content_hash` (embedding cache key) +
`tokens` (lexical). Phase 2 is genuinely _additive_ — new column, new module, a
hybrid decision — not a re-platform. This is the payoff of ADR-0001.

## 1. What Phase 1 gives us (the seams)

| Seam                              | Phase-1 reality                            | Phase-2 change                                      |
| --------------------------------- | ------------------------------------------ | --------------------------------------------------- |
| `specs` table                     | `tokens text[]`, `content_hash`            | + `embedding vector(N)`, `embedding_model text`     |
| `ingest/extract.ts`               | computes `tokens` from intent text         | also produce intent text for embedding              |
| `ingest/ingestRun.ts`             | sync extract → SQL upsert                  | + async embed step (best-effort, cached)            |
| `retrieve/coverageDecision.ts`    | `decideForSpecs(scenarios, specs)` lexical | **hybrid**: lexical ∪ semantic, pure-core preserved |
| `store/repo.ts` `readSpecsForApp` | returns tokens                             | also returns embeddings (or NN query)               |
| `KnowledgeService`                | `planCoverageDecision`, `assembleContext`  | + `findSimilarSpecs(query, appId, k)`               |
| `safety.ts withKb`                | wraps all KB calls                         | wraps embedding calls too (degrade to lexical)      |

## 2. Embedding provider — DECIDED: local (2026-06-05)

**Decision:** ship Phase 2 with a **local, in-process embedder** — no API key, no
per-call cost, offline, CI/test-friendly, and consistent with the validator's
hermetic ethos. A pluggable `Embedder` interface keeps a hosted provider (Voyage)
a one-line config swap if quality later demands it.

**Committed specifics:**

| Choice         | Value                                                        | Why                                                                                                                                                              |
| -------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Library        | **`@huggingface/transformers`** (transformers.js, ONNX/WASM) | Pure-JS/WASM — no native build headaches; portable across dev/CI/macOS-arm64. (`fastembed` is a faster native alternative if onnxruntime-node installs cleanly.) |
| Model          | **`Xenova/bge-small-en-v1.5`**                               | Strong small embedding model; good quality/size balance; ~30 MB, cached on first use. (`all-MiniLM-L6-v2` = lighter fallback.)                                   |
| **Dimensions** | **384** → `vector(384)`                                      | Fixed by the model; pins the column type                                                                                                                         |
| Pooling        | mean-pool + L2-normalize                                     | Normalized vectors → cosine distance is the right metric for the HNSW index                                                                                      |
| Loading        | lazy, singleton, cached on disk                              | First embed downloads the model once; subsequent runs are instant                                                                                                |

**Degradation (unchanged contract):** if the model fails to load or embed, the
spec gets a null embedding and the system falls back to **Phase 1 lexical** —
semantic is strictly additive recall and can never break a run.

The interface (a hosted provider — Voyage `voyage-3-lite` / OpenAI
`text-embedding-3-small` — is a drop-in alternative behind it):

```ts
interface Embedder {
  readonly id: string; // e.g. "local:bge-small-en-v1.5"
  readonly dims: number; // fixes the vector(N) column
  embed(texts: string[]): Promise<number[][]>; // batched
}
```

> **Dimension lock-in:** `vector(384)` fixes the dimension at migration time.
> Switching to a hosted model later (e.g. Voyage 1024-dim) needs a new column +
> a re-embed backfill. We store `embedding_model` per row so mixed-model states
> are detectable and re-embeddable. Re-tuning `SEM_REUSE`/`SEM_EXTEND` is also
> model-specific.

## 3. Design

### 3.1 Schema (migration `0002_pgvector.sql`)

```sql
CREATE EXTENSION IF NOT EXISTS vector;
ALTER TABLE specs ADD COLUMN embedding vector(384);     -- 384 = bge-small-en-v1.5
ALTER TABLE specs ADD COLUMN embedding_model text;
-- Approximate-NN index for fast top-k (cosine). Built when rows exist.
CREATE INDEX specs_embedding_hnsw
  ON specs USING hnsw (embedding vector_cosine_ops);
```

(Optionally embed `plan_scenarios` too, so scenario↔scenario matching is possible;
not required for the Generator decision, which matches scenario→spec.)

### 3.2 Embedder + cache

- `src/knowledge/embeddings/embed.ts` — the `Embedder` interface + a
  `LocalEmbedder` (default) and a `HostedEmbedder` (optional).
- **Cache by `content_hash`**: a spec whose hash already has an embedding is not
  re-embedded. Cheap, deterministic, and makes re-ingest free.
- All embedding calls wrapped in `withKb` → on failure, the spec simply has a
  null embedding and the system falls back to lexical for it (graceful).

### 3.3 Ingest path (write-time embedding)

```
RunReport ─► extractRun (tokens, intent text)
          ─► for specs missing/changed embedding:  Embedder.embed([...intent])   [best-effort]
          ─► persistRun: write rows + embedding + embedding_model               [one txn]
```

Intent text per spec = `title + plan-step comments` (fallback: title). Embedding
runs **off the run hot-path** (ingest already happens post-completion), so latency
is non-critical (N-budget unaffected).

### 3.4 Retrieval — hybrid decision (the heart)

Keep the **pure, testable core**; only the data-fetch becomes vector-aware.

```
For each planned scenario:
  lexScore = overlapCoefficient(scenarioTokens, specTokens)        # Phase 1, unchanged
  semScore = cosineSim(scenarioEmbedding, specEmbedding)           # NEW (pgvector)

  reuse   if (lexScore ≥ 0.80 OR semScore ≥ SEM_REUSE)  AND last run passed
  extend  if (lexScore ≥ 0.45 OR semScore ≥ SEM_EXTEND)
  new     otherwise                                                 # err to new
```

- `combineDecision(lex, sem, lastOutcome)` is a **pure function** → unit-tested with
  fake embeddings (no DB, no model). This preserves Phase 1's test style.
- **Candidate fetch**: per scenario, a pgvector NN query returns the top-k nearest
  specs (`ORDER BY embedding <=> $q LIMIT k`, scoped `WHERE app_id`), using the
  HNSW index; lexical score is computed in JS over those candidates. (At small
  per-app counts, loading all specs and scoring both in JS is also fine — same
  pure core.)
- `SEM_REUSE` / `SEM_EXTEND` thresholds are **calibrated** against the curated
  tarento set before measuring (cosine sim: near-dup ≈ 0.9+, related ≈ 0.7–0.85).
- Using **OR (max recall)** is deliberate: keep every lexical hit _and_ add the
  semantic ones lexical missed; the `new`-when-uncertain bias still guards against
  false skips.

### 3.5 New interface method

```ts
findSimilarSpecs(query: string, appId: string, k: number): Promise<SpecMatch[]>
```

Embeds `query`, runs the NN search, returns ranked specs + scores. Powers a
debugging view and future "show me similar tests" UX; the Generator decision uses
it internally.

### 3.6 Dependencies & config

- **npm dependency:** `@huggingface/transformers` (the only new runtime dep; pure
  JS/WASM/ONNX, no native build). Model weights are fetched on first use and cached
  under the HF cache dir — commit nothing, download once.
- **Env (all optional, sensible defaults):**
  - `EMBEDDINGS_ENABLED` — default **on** when the model loads; `false` forces
    lexical-only (Phase 1 behavior).
  - `EMBEDDING_PROVIDER` — default **`local`**; `voyage`/`openai` switch providers.
  - `EMBEDDING_MODEL` — default **`Xenova/bge-small-en-v1.5`**.
  - hosted-only: `VOYAGE_API_KEY` / `OPENAI_API_KEY` (unused for local).
- **Graceful degradation (unchanged contract):** model fails to load, pgvector
  absent, or an embed call throws → fall back to **Phase 1 lexical** for those
  specs. Semantic is strictly _additive recall_; it can never break a run or
  worsen Phase-1 behavior.

## 4. Backfill

Existing specs have no embeddings. A one-off job
(`bin/knowledge-embed-backfill.ts`) embeds all specs lacking an embedding for the
current model, in batches, cached by `content_hash`. Idempotent and re-runnable;
also the recovery path after a model switch.

## 5. Testing

- **Unit (no DB, no model):** `combineDecision` with fake embeddings — prove the
  paraphrase case (low lexical + high semantic → reuse/extend) and that semantic
  never downgrades a lexical reuse. Fake `Embedder` returns deterministic vectors.
- **Integration (pgvector test DB):** store + NN round-trip; `findSimilarSpecs`
  returns the nearer spec first; backfill populates embeddings.
- **Degradation:** embedder throws / pgvector absent → falls back to lexical, no
  error (mirrors Phase 1 N3 tests).
- **Metric:** a small labeled paraphrase set → measure semantic catches that
  lexical missed (the M2 improvement).
- CI: hosted-provider tests skip without a key; local-model tests gated behind a
  flag if the model download is too heavy for CI (run in a nightly job).

## 6. Risks & mitigations

| Risk                                     | Mitigation                                                                                                             |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| pgvector not installed in some env       | Verified locally (0.8.2); Neon ships it; migration `CREATE EXTENSION` guarded; doc the prerequisite                    |
| Dimension lock-in on model switch        | Store `embedding_model`; backfill job re-embeds; new column if dims change                                             |
| Embedding quality too low (local model)  | Pluggable `Embedder` → switch to Voyage via config; calibrate thresholds; semantic is additive so worst case = Phase 1 |
| Query-time latency (embedding scenarios) | Batch-embed all scenarios in one call; cache; NN via HNSW index; keep within the N4 budget                             |
| Local model download size / CI weight    | Lazy-load + cache the model; gate heavy tests to nightly                                                               |
| Semantic false-positives (over-merge)    | OR-logic still biases to `new` near thresholds; require last-passed for reuse; tune `SEM_REUSE` conservatively         |

## 7. Phased rollout (within Phase 2)

| Step                   | Deliverable                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------ |
| **2a — Foundation**    | `Embedder` interface + local impl; `0002_pgvector.sql`; embed-at-ingest + cache; backfill job                |
| **2b — Hybrid match**  | `combineDecision` pure core; NN fetch in `repo`; `findSimilarSpecs`; threshold calibration vs tarento        |
| **2c — Wire + verify** | Generator already consumes decisions → minimal change; unit/integration/degradation tests; measure M2 uplift |

Each step ships independently; 2a adds storage with zero behavior change, 2b/2c
turn on semantic recall.

## 8. How it enters CRAFT

This is a new increment → its own cycle:

1. **Clarify** — confirm the embedding-provider decision (§2) and the M2 target uplift.
2. **Record** — Spec v0.2.0 of the knowledge-platform: requirements for the
   embedding column, embedder, hybrid decision, `findSimilarSpecs`, degradation,
   backfill; acceptance criteria; an ADR for the provider choice.
3. **Assemble → Forge → Test** per the 2a/2b/2c steps.

This RFC is the input to Clarify/Record, not a substitute — it maps the territory
so the Spec can commit to a precise first slice.

```

```
