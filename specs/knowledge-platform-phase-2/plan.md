# Plan (Design) — Knowledge Platform · Phase 2 (Semantic Test Reuse)

> Stage 3 (Assemble) deliverable. Defines **HOW** to build what the Spec
> describes. Pairs with `tasks.md`. Every design choice traces to a requirement
> or constraint in the Spec.

- **Targets Spec version:** v0.1.0
- **Status:** Approved
- **Last updated:** 2026-06-05

---

## Approach

Phase 2 is **additive** to the Phase 1 Knowledge Layer (`src/knowledge/`). We add
one new capability — embeddings — and thread it through the existing seams:
embed each spec at ingest, store the vector in `pgvector`, and make the existing
`coverageDecision` **hybrid** (lexical OR semantic). The whole change is wrapped
in the Phase 1 best-effort/never-throw contract, and the **decision core stays a
pure function** so the load-bearing "never worse than Phase 1" property (R8/N3)
is provable by setting embeddings off and diffing against the lexical decider.
Two durable choices are fixed in **ADR-0002** (local embedder) and **ADR-0003**
(hybrid/additive matching).

## Architecture & structure

```
src/knowledge/
  embeddings/
    embed.ts            # NEW: Embedder interface + LocalEmbedder (bge-small) + cosineSim   (R1, I1)
    embed.test.ts       # NEW: fake embedder, cosine, normalization
  store/
    migrations/
      0002_pgvector.sql # NEW: CREATE EXTENSION vector; specs.embedding vector(384) +        (R2, I2)
                        #      embedding_model; HNSW cosine index
    repo.ts             # EDIT: persist embedding/model; readSpecsForApp +embedding;          (R3,R6,R9)
                        #       findNearestSpecs() NN query; embeddingForHash() cache lookup
  ingest/
    extract.ts          # EDIT: add intentText per spec (title + step comments)               (R3)
    ingestRun.ts        # EDIT: embed specs (best-effort, cached by content_hash) → persist    (R3, R9)
  retrieve/
    coverageDecision.ts # EDIT: decideForSpecs becomes HYBRID (lexical OR semantic), pure      (R5, R8)
  index.ts              # EDIT: service embeds scenarios at query time; add findSimilarSpecs   (R5,R6,R7,R8)
  types.ts              # EDIT: SpecRow/ScenarioInput +embedding; + findSimilarSpecs on iface  (I3,I4)
bin/
  knowledge-embed-backfill.ts  # NEW: backfill embeddings for specs missing them (idempotent)  (R4)
docs/adr/0002-local-embedder.md · 0003-hybrid-additive-matching.md   # NEW
```

No new top-level module — Phase 2 deepens the existing `src/knowledge/`.

## Components / modules

| Component                             | Responsibility                                                                                                             | Addresses      |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------- |
| `embeddings/embed.ts`                 | `Embedder` interface + `LocalEmbedder` (transformers.js, bge-small, 384d, L2-norm, batched, lazy-load+cache) + `cosineSim` | R1, N2         |
| `0002_pgvector.sql`                   | `vector` extension + `embedding vector(384)` + `embedding_model` + HNSW cosine index                                       | R2, C1         |
| `store/repo.ts` (edit)                | persist embedding+model; `readSpecsForApp` returns embeddings; `findNearestSpecs` (HNSW); `embeddingForHash` (cache)       | R3, R6, R9, N5 |
| `ingest/extract.ts` (edit)            | produce per-spec `intentText` (title + step comments)                                                                      | R3             |
| `ingest/ingestRun.ts` (edit)          | embed specs best-effort, reuse cached embedding by `content_hash`, persist; null on failure                                | R3, R8, R9     |
| `retrieve/coverageDecision.ts` (edit) | **hybrid** `decideForSpecs` — lexical OR semantic, err to `new`, `reuse` needs last-passed; pure                           | R5, R8         |
| `index.ts` (edit)                     | service embeds scenarios at query time (best-effort); `findSimilarSpecs`; wires hybrid into the Generator path             | R5, R6, R7, R8 |
| `bin/knowledge-embed-backfill.ts`     | embed specs lacking an embedding for the current model; idempotent, model-tagged                                           | R4, R9         |

## Data flow

**1 — Embed at ingest (best-effort, cached).**

```
ingestRun(report)
  extractRun → specs[] (intentText, content_hash)
  for each spec:
     emb = embeddingForHash(content_hash, model)         # cache hit → reuse  [R3 cache]
           ?? withKb( embedder.embed([intentText]) )      # miss → embed; on fail → null  [R8/SC9]
  persistRun(... embedding, embedding_model ...)          # one txn
        any embed failure → null embedding, ingest still commits
```

**2 — Hybrid decision at generation (the heart).** Degrades to lexical when
embeddings are absent (semScore = 0).

```
assembleContext("generating", url, scenarios)
  scenarioEmbs = withKb( embedder.embed(scenario names) )  ?? null      # batch; budget N1
  specs = readSpecsForApp(appId)            # now includes spec.embedding
  decideForSpecs(scenarios+embs, specs):
     per scenario, over specs:
        lex = overlapCoefficient(scTokens, spec.tokens)            # Phase 1
        sem = (scEmb && spec.embedding) ? cosineSim(scEmb, spec.embedding) : 0
     reuse  if (lex ≥ 0.80 OR sem ≥ SEM_REUSE)  AND spec last passed
     extend if (lex ≥ 0.45 OR sem ≥ SEM_EXTEND)
     new    otherwise                                              # err to new  [SC5]
  → Generator prompt (Phase 1 wiring, unchanged) skips/reuses matched specs
```

> **Additive guarantee:** embeddings off ⇒ `sem = 0` everywhere ⇒ identical to
> Phase 1 lexical (N3/AC7). Semantic can only _raise_ an action, never lower it.

**3 — findSimilarSpecs (uses the HNSW index).**

```
findSimilarSpecs(query, appId, k):
  q = embed(query)  →  SELECT ... ORDER BY embedding <=> q LIMIT k  WHERE app_id   # HNSW cosine
```

| File / module                                | Diagram it should carry                                  |
| -------------------------------------------- | -------------------------------------------------------- |
| `src/knowledge/ingest/ingestRun.ts`          | embed-at-ingest (cache → embed → null-on-fail → persist) |
| `src/knowledge/retrieve/coverageDecision.ts` | the hybrid lexical-OR-semantic decision branching        |
| `src/knowledge/index.ts` (`assembleContext`) | query-time embed + degrade-to-lexical path               |

## Interfaces / Contracts

| ID  | Interface                                | Producer              | Consumer                  | Shape (inline/link)                                                                           | Versioning                                                    |
| --- | ---------------------------------------- | --------------------- | ------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| I1  | `Embedder`                               | `embeddings/embed.ts` | ingest + retrieve         | `{ id, dims, embed(texts: string[]): Promise<number[][]> }` (L2-normalized)                   | Additive; hosted impls satisfy the same shape                 |
| I2  | pgvector schema delta                    | `0002_pgvector.sql`   | `repo.ts`                 | `specs.embedding vector(384)`, `specs.embedding_model text`, HNSW cosine index                | Forward-only migration; dim change = new migration + backfill |
| I3  | `SpecRow` / `ScenarioInput` (+embedding) | `types.ts`/`repo.ts`  | `decideForSpecs`, service | `SpecRow{ …, embedding: number[]\|null }`, `ScenarioInput{ name, id?, embedding?: number[] }` | Additive optional field; null ⇒ lexical                       |
| I4  | `findSimilarSpecs`                       | `index.ts`            | API/UI/debug              | `(query, appId, k) → SpecMatch[] {file,title,score}`                                          | Additive method on `KnowledgeService`                         |
| I5  | Embedder config (env)                    | environment           | `index.ts`/`embed.ts`     | `EMBEDDINGS_ENABLED`, `EMBEDDING_PROVIDER=local`, `EMBEDDING_MODEL`                           | Env contract; absent ⇒ lexical                                |

## Dependencies & integration points

- **`@huggingface/transformers`** (new npm dep; pure JS/WASM/ONNX). Model weights
  cached on first use.
- **`pgvector`** extension (verified 0.8.2 local; Neon ships it) — DEP2.
- Extends Phase 1 (`specs`, `ingestRun`, `coverageDecision`, `KnowledgeService`) —
  no re-architecture (C6).
- A **labeled paraphrase set** (Claude-generated, human-verified) for M1/M2 — DEP4.

## Key decisions (ADRs)

| ID  | Decision                                                                                                 | Options considered                                                  | Why not (rejected)                                                                                  | Consequences                                                                                           | Driven by  |
| --- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------- |
| D1  | **Local embedder** (bge-small via transformers.js) → **ADR-0002**                                        | local; Voyage; OpenAI; fastembed(native)                            | hosted = key+cost+network (kept as contingency); fastembed = native-binding portability             | no key/offline/CI; ~30 MB load; 384-dim lock; quality risk → Voyage trigger                            | R1, C2, A1 |
| D2  | **Hybrid OR, additive** matching → **ADR-0003**                                                          | OR-of-thresholds; pure-semantic; weighted blend; AND-gate           | pure/AND regress recall & lose fallback; blend couples scales, harder to prove "never worse"        | provable additive safety; independent thresholds; OR can over-merge → M2 guardrail                     | R5, R8, N3 |
| D3  | **Decision computes `sem` in JS over the app's loaded specs**; HNSW index powers `findSimilarSpecs` only | JS-over-loaded-specs; pgvector NN per scenario for the decision too | per-app spec counts are modest (A5) → JS is simple, keeps `decideForSpecs` pure & DB-free for tests | trivial additive-no-regression test; switch to NN-candidate fetch later without changing the signature | R5, A5, N3 |
| D4  | **Embed at ingest, cached by `content_hash`** (reuse an existing embedding for the same hash+model)      | embed-at-ingest+cache; embed-at-query; no cache                     | query-time-only re-embeds repeatedly (latency); no-cache re-embeds unchanged specs                  | re-ingest of unchanged specs makes no model call (AC3); off the hot path                               | R3, N1     |
| D5  | **Intent text = title + step comments**                                                                  | title-only; title+steps; full code                                  | title-only is thin; full code embeds volatile selectors (noise)                                     | richer match signal without selector noise; symmetric with scenario-name embedding                     | R3         |
| D6  | **Thresholds `SEM_REUSE`/`SEM_EXTEND` as named constants, calibrated in Forge**                          | hard-code now; calibrate vs tarento                                 | guessing risks M1/M2; calibration needs the labeled set                                             | tuned values recorded in implementation-notes; conservative `SEM_REUSE`                                | R10, Q2    |

## Risks & mitigations

| ID  | Risk                                                  | Likelihood | Impact | Mitigation                                                                                             |
| --- | ----------------------------------------------------- | ---------- | ------ | ------------------------------------------------------------------------------------------------------ |
| RK1 | Over-merge (semantic marks new as reuse → masked gap) | Med        | High   | OR still errs to `new`; `reuse` needs last-passed; M2 ≤5% guardrail measured; conservative `SEM_REUSE` |
| RK2 | bge-small misses ≥70% recall                          | Med        | Med    | ADR-0002 Voyage contingency (trigger: M1<70% post-calibration); thresholds tuned                       |
| RK3 | pgvector absent in an env                             | Low        | Med    | Verified local; Neon ships it; migration guarded; embeddings disable → lexical (SC8)                   |
| RK4 | Embedding adds query latency                          | Med        | Med    | Batch-embed scenarios once; ≤500 ms warm budget (N1); model warm-load excluded (N2)                    |
| RK5 | Model cold-load / download in CI                      | Med        | Low    | Lazy-load + cache; gate heavy embed tests to a nightly job; fake embedder in unit tests                |
| RK6 | Dimension/model drift (mixed embeddings)              | Low        | Med    | `embedding_model` per row; backfill re-embeds mismatches; never cross-dimension compare (R9/SC12)      |
| RK7 | Embedding non-determinism across machines             | Low        | Low    | Used for ranking not a gate (A3); pin model+version; determinism test on one machine (N4)              |

## Test strategy

- **Layers:** **unit** (`tsx --test`) for `cosineSim`/normalization, the **hybrid
  `decideForSpecs`** with a **fake `Embedder`** (deterministic vectors), and the
  **additive-no-regression diff** (embeddings off ⇒ identical to lexical);
  **integration** (pgvector test DB) for embed→store→`findNearestSpecs` round-trip,
  ingest cache-by-hash, and backfill idempotency; **degradation** (embedder throws
  / pgvector absent ⇒ lexical, no error).
- **Environments:** local + CI Postgres with pgvector; unit tests need no DB/model
  (fake embedder); the real model runs in a **nightly** job + manual calibration.
- **Fixtures:** the **Claude-generated/human-verified paraphrase set** (DEP4) +
  the curated tarento flows; fake embedder returns fixed vectors that encode the
  intended near/related/unrelated geometry.
- **NFR coverage:** N1 — time warm retrieval+embed ≤500 ms; N2 — first vs later
  embed (cold-load + cache); N3 — embeddings-off diff vs lexical decider; N4 —
  repeat-decision determinism; N5 — `count(specs WHERE embedding IS NULL AND model=current)=0`.
- **M1/M2:** a **calibration/measurement harness** runs the labeled set through
  `decideForSpecs` to compute paraphrase recall (≥70%) and false-reuse (≤5%) —
  produced in Forge; final numbers via `/measure` after live runs.
- **Deliberately not tested in unit CI:** the real bge-small model (nightly +
  calibration), and live M1/M2 (need DEP4 + two tarento runs).

---

## Requirements coverage (design level)

| Requirement / NFR | Addressed by                                                                 |
| ----------------- | ---------------------------------------------------------------------------- |
| R1                | `embeddings/embed.ts` Embedder + LocalEmbedder (I1)                          |
| R2                | `0002_pgvector.sql` (I2)                                                     |
| R3                | `extract.ts` intentText + `ingestRun.ts` embed-at-ingest cached by hash (D4) |
| R4                | `bin/knowledge-embed-backfill.ts`                                            |
| R5                | hybrid `decideForSpecs` (D2/ADR-0003)                                        |
| R6                | `repo.findNearestSpecs` + `index.findSimilarSpecs` (I4)                      |
| R7                | service wires decisions into the Generator path (Phase 1 seam)               |
| R8                | additive design: `sem=0` when off ⇒ identical to lexical; all calls `withKb` |
| R9                | `embedding_model` column + backfill mismatch re-embed                        |
| R10               | `SEM_REUSE`/`SEM_EXTEND` constants + Forge calibration (D6)                  |
| N1                | query-time batch embed + ≤500 ms test                                        |
| N2                | lazy-load+cache; cold-load test                                              |
| N3                | embeddings-off diff test (D3 keeps decision pure)                            |
| N4                | determinism repeat test                                                      |
| N5                | embedding-completeness query                                                 |

---

_Stage 3 (Assemble) artifact. Architecture Gate (3a) approves this `plan.md`
before tasks are cut. Must respect every rule in `CONSTITUTION.md`._
