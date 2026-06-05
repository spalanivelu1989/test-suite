# Tasks — Knowledge Platform · Phase 2 (Semantic Test Reuse)

> Stage 3 (Assemble) deliverable. The ordered, traceable build checklist that
> pairs with `plan.md`. Each task is small (one clear outcome).

- **Targets Spec version:** v0.1.0
- **Status:** Approved
- **Last updated:** 2026-06-05

**Legend:** `[ ]` todo · `[x]` done · `[P]` may run in parallel with other `[P]`
tasks at the same dependency level.

---

## Task list

### T1 — Embedder interface + cosine/normalize + fake [P]

- **Covers:** R1, N3
- **Depends on:** —
- **Parallel:** yes
- **Done-when:** `embeddings/embed.ts` defines the `Embedder` interface (`id`, `dims`, `embed(texts)→number[][]`), an L2-normalize helper, and `cosineSim(a,b)`; a `FakeEmbedder` (deterministic vectors) is exported for tests; `tsc --noEmit` clean.

### T2 — LocalEmbedder (bge-small via transformers.js)

- **Covers:** R1, N2
- **Depends on:** T1
- **Parallel:** no
- **Done-when:** `@huggingface/transformers` added; `LocalEmbedder` runs `Xenova/bge-small-en-v1.5`, mean-pools + L2-normalizes, returns 384-dim vectors, batches input, and lazy-loads + caches the model (first call loads, later calls reuse); a manual smoke embed returns a 384-length unit vector.

### T3 — Migration `0002_pgvector.sql` [P]

- **Covers:** R2
- **Depends on:** —
- **Parallel:** yes
- **Done-when:** `store/migrations/0002_pgvector.sql` runs `CREATE EXTENSION IF NOT EXISTS vector`, adds `specs.embedding vector(384)` + `specs.embedding_model text`, and an HNSW cosine index; `npm run knowledge:migrate` applies it; re-running is a no-op (AC1).

### T4 — Types: +embedding fields, +findSimilarSpecs [P]

- **Covers:** R6 (I3, I4)
- **Depends on:** —
- **Parallel:** yes
- **Done-when:** `types.ts` adds `embedding: number[]|null` to `SpecRow`, optional `embedding?` to `ScenarioInput`, a `SpecMatch` type, and `findSimilarSpecs(query, appId, k)` to `KnowledgeService`; the disabled service implements it (returns `[]`); `tsc` clean.

### T5 — repo: persist + read embeddings + hash cache lookup

- **Covers:** R3, R9, N5
- **Depends on:** T3, T4
- **Parallel:** no
- **Done-when:** `persistRun` writes `embedding`/`embedding_model`; `readSpecsForApp` returns `embedding`; `embeddingForHash(content_hash, model)` returns an existing embedding for reuse (cache) or null; all app-scoped.

### T6 — repo: findNearestSpecs (HNSW NN query) [P]

- **Covers:** R6
- **Depends on:** T3, T4
- **Parallel:** yes
- **Done-when:** `findNearestSpecs(pool, appId, queryEmbedding, k)` returns the k nearest specs by cosine (`ORDER BY embedding <=> $q LIMIT k`, `WHERE app_id`, non-null embeddings only) with scores.

### T7 — extract: per-spec intentText [P]

- **Covers:** R3 (D5)
- **Depends on:** T4
- **Parallel:** yes
- **Done-when:** `extract.ts` produces `intentText` per spec = title + step comments (fallback: title); unit-proven it excludes volatile selector lines.

### T8 — ingestRun: embed-at-ingest (cached, best-effort)

- **Covers:** R3, R8, R9, N5
- **Depends on:** T2, T5, T7
- **Parallel:** no
- **Done-when:** `ingestRun` reuses a cached embedding by `content_hash`+model, else `withKb(embedder.embed(intentText))`; persists `embedding`+`embedding_model`; an embed failure stores a null embedding and ingestion still commits (AC3/AC4); carries the inline embed-at-ingest diagram.

### T9 — Hybrid decideForSpecs (lexical OR semantic)

- **Covers:** R5, R8, R10
- **Depends on:** T1, T4
- **Parallel:** no
- **Done-when:** `decideForSpecs` (pure) computes `lex` (Phase 1) and `sem = cosineSim` (0 when either embedding null); `reuse` if `lex≥0.80 OR sem≥SEM_REUSE` AND last-passed; `extend` if `lex≥0.45 OR sem≥SEM_EXTEND`; else `new`; errs to `new` near thresholds; `SEM_REUSE`/`SEM_EXTEND` are named constants; carries the inline decision diagram.

### T10 — Service: embed scenarios at query time + findSimilarSpecs + wire

- **Covers:** R5, R6, R7, R8, N1
- **Depends on:** T2, T6, T9
- **Parallel:** no
- **Done-when:** `assembleContext("generating")` batch-embeds the scenarios (`withKb`, null on failure), loads specs with embeddings, calls the hybrid `decideForSpecs`, and feeds the Generator path (unchanged wiring); `findSimilarSpecs` embeds the query and calls `findNearestSpecs`; carries the inline query-time/degrade diagram.

### T11 — Backfill job

- **Covers:** R4, R9
- **Depends on:** T2, T5
- **Parallel:** no
- **Done-when:** `bin/knowledge-embed-backfill.ts` embeds specs with a null/mismatched-model embedding for the current model, in batches, idempotent (a second run embeds nothing); a `knowledge:embed-backfill` npm script runs it.

### T12 — Unit tests: cosine, hybrid decision, no-regression [P]

- **Covers:** R1, R5, R8, N3, N4
- **Depends on:** T1, T9
- **Parallel:** yes
- **Done-when:** `tsx --test` (no DB, no model): `cosineSim`/normalize; hybrid decisions (low-lex/high-sem→reuse, mid→extend, low/low→new, near-threshold→new, high-lex/low-sem→reuse — AC5/AC6); **additive-no-regression** — embeddings off ⇒ output identical to the lexical decider (AC7/N3); determinism repeat (N4).

### T13 — Integration tests vs pgvector DB [P]

- **Covers:** R2, R3, R4, R6, R9, N5
- **Depends on:** T8, T10, T11
- **Parallel:** yes
- **Done-when:** against a pgvector test DB: embed→store→`findNearestSpecs` round-trip; ingest cache-by-hash (no re-embed, AC3); `findSimilarSpecs` ranks the paraphrased spec first (AC8); backfill idempotency (AC10); model-mismatch re-embed (AC11); `count(embedding IS NULL AND model=current)=0` (N5). Uses a deterministic embedder.

### T14 — Degradation + latency + generator-skip tests [P]

- **Covers:** R7, R8, N1, N2
- **Depends on:** T10
- **Parallel:** yes
- **Done-when:** embedder-throws and pgvector-absent → lexical decisions, no error (SC7–SC9); warm retrieval+scenario-embed ≤500 ms (N1); cold-load vs warm timing (N2); on a 2nd run the Generator does not re-emit a paraphrased `reuse` spec (AC9).

### T15 — M1/M2 calibration + measurement harness

- **Covers:** R10, M1, M2
- **Depends on:** T9, T12
- **Parallel:** no
- **Done-when:** a Claude-generated, human-verified labeled paraphrase set (DEP4) is built from the curated tarento flows; a harness runs it through `decideForSpecs` to compute **paraphrase recall** and **false-reuse**; `SEM_REUSE`/`SEM_EXTEND` are calibrated (recall ≥70% AND false-reuse ≤5% where achievable) and the chosen values + results recorded in `implementation-notes.md`. (Final live numbers via `/measure`.)

---

## Coverage matrix — requirements → tasks

| Requirement | Covered by task(s)    | Covered? |
| ----------- | --------------------- | -------- |
| R1          | T1, T2, T12           | ✅       |
| R2          | T3, T13               | ✅       |
| R3          | T5, T7, T8, T13       | ✅       |
| R4          | T11, T13              | ✅       |
| R5          | T9, T10, T12, T15     | ✅       |
| R6          | T4, T6, T10, T13      | ✅       |
| R7          | T10, T14              | ✅       |
| R8          | T8, T9, T10, T12, T14 | ✅       |
| R9          | T5, T8, T11, T13      | ✅       |
| R10         | T9, T15               | ✅       |
| N1          | T10, T14              | ✅       |
| N2          | T2, T14               | ✅       |
| N3          | T12                   | ✅       |
| N4          | T12                   | ✅       |
| N5          | T5, T8, T13           | ✅       |

> **Gate check:** every requirement and NFR maps to ≥1 task (no gaps); every task
> (T1–T15) cites a requirement/NFR (no scope creep). Open questions: Q1 (labeled-set
> composition) + Q2 (threshold values) land in **T15**; Q3 (embed scenarios) stays
> deferred. M1/M2 final numbers need DEP4 + two live tarento.com runs (`/measure`).

---

_Stage 3 (Assemble) artifact. Approve alongside `plan.md` at the Human Gate, then
proceed to `/craft-framework:forge`. The Builder works tasks in dependency order,
dispatching `[P]` tasks in parallel where possible._
