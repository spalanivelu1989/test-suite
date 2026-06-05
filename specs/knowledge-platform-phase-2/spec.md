# Spec — Knowledge Platform · Phase 2 (Semantic Test Reuse via pgvector)

> Stage 2 (Record) deliverable. The single source of truth and contract for
> everything that follows: **if it isn't in this Spec, it doesn't get built.**
> Describes WHAT "done" means, never HOW to build it (that is Stage 3).

- **Version:** v0.1.0
- **Status:** Approved
- **Source Brief:** `specs/knowledge-platform-phase-2/brief.md`
- **Last updated:** 2026-06-05

---

## Overview

Phase 2 adds **embedding-based semantic matching** to the Knowledge Platform so
the Generator recognizes a scenario it has already tested even when it's worded
differently. Phase 1 decides `reuse | extend | new` by **lexical** token-overlap,
which misses paraphrases ("Submit the contact form" vs "Send a message via Contact
Us") and regenerates duplicates. Phase 2 stores a **`pgvector` embedding** per
generated spec and makes the coverage decision **hybrid** — `reuse`/`extend` when
**lexical OR semantic** similarity clears the bar. Embeddings come from a **local,
in-process** model (no API key). The change is strictly **additive**: when
embeddings are unavailable it falls back to Phase 1 lexical and never behaves
worse. Background: `docs/pgvector-integration-plan.md`.

## Requirements

| ID  | Requirement (what the result must do)                                                                                                                                                                                                                                                                                                     | Priority |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| R1  | Provide an **`Embedder`** interface and a **local** implementation (`@huggingface/transformers`, `Xenova/bge-small-en-v1.5`, **384 dims**, mean-pool + L2-normalize) that embeds text in **batches**. The interface is pluggable so a hosted provider is a config swap (not built this phase).                                            | Must     |
| R2  | Extend the `specs` table with an **`embedding vector(384)`** column and an **`embedding_model`** column, plus an **HNSW cosine index**, via an additive migration (`0002`, incl. `CREATE EXTENSION vector`). Re-running the migration is a no-op.                                                                                         | Must     |
| R3  | **Embed each spec at ingest** from its intent text (title + step comments), **cached by `content_hash`** (unchanged specs are not re-embedded). Off the run hot-path and **best-effort** — an embed failure leaves a null embedding and never throws.                                                                                     | Must     |
| R4  | Provide a **backfill** job that embeds existing specs lacking an embedding **for the current model**, in batches, **idempotent** (a second run embeds nothing).                                                                                                                                                                           | Must     |
| R5  | Make the coverage decision **hybrid**: per planned scenario, compute lexical overlap (Phase 1) **and** semantic cosine similarity; choose `reuse \| extend \| new` when **lexical OR semantic** clears its threshold, **erring to `new`** when uncertain, with `reuse` requiring the matched spec's prior run passed.                     | Must     |
| R6  | Provide **`findSimilarSpecs(query, appId, k)`** — embed `query`, return the `k` nearest specs by cosine (HNSW), **scoped to the app**, with scores.                                                                                                                                                                                       | Must     |
| R7  | **Wire the hybrid decision into the Generator** path (it already consumes `CoverageDecision[]`) so the Generator skips/reuses semantically-matched duplicates — a minimal change, no re-architecture.                                                                                                                                     | Must     |
| R8  | **Additive-only safety:** if the embedder is unavailable, the model fails to load, pgvector is absent, or an embed call fails, the system **falls back to Phase 1 lexical** — never throws, and **never produces a worse decision than Phase 1** (semantic only _adds_ `reuse`/`extend`; it never downgrades a lexical `reuse` to `new`). | Must     |
| R9  | **Tag embeddings with their model** (`embedding_model` per row) so mixed-model states are detectable and a model switch triggers a re-embed — never a cross-dimension/cross-model comparison.                                                                                                                                             | Must     |
| R10 | **Calibrate** the `SEM_REUSE` / `SEM_EXTEND` cosine thresholds against the curated tarento flows and **record** the chosen values (not guessed).                                                                                                                                                                                          | Should   |

## Scenarios

| ID   | Given / When                                                                                           | Then (expected behavior)                                                                                                                                          | Covers |
| ---- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| SC1  | A spec is ingested                                                                                     | Its intent text is embedded and stored in `embedding` with `embedding_model`; re-ingesting unchanged content (same `content_hash`) does NOT re-embed (cache hit). | R3     |
| SC2  | A 2nd run plans a scenario that is a **paraphrase** of an existing covered spec (no lexical overlap)   | Semantic similarity ≥ `SEM_REUSE` and the prior run passed → decision = **`reuse`**; the duplicate is NOT generated.                                              | R5,R7  |
| SC3  | A scenario is semantically **related but not equivalent** (mid similarity)                             | Decision = `extend`.                                                                                                                                              | R5     |
| SC4  | A **genuinely new** scenario (low lexical AND low semantic)                                            | Decision = `new` — protects precision (no over-merge).                                                                                                            | R5     |
| SC5  | Semantic similarity sits **near the threshold** (uncertain)                                            | Decision errs to `new` — never silently `reuse` (a masked gap is worse than a duplicate).                                                                         | R5     |
| SC6  | A scenario matches **lexically** but not semantically                                                  | Still `reuse`/`extend` (lexical OR semantic) — never worse than Phase 1.                                                                                          | R5,R8  |
| SC7  | The embedding **model cannot load** (offline first run / download fails)                               | All specs degrade to lexical-only decisions; the run completes; a single "embeddings unavailable — lexical only" notice is logged, no error.                      | R8     |
| SC8  | The **pgvector extension is absent** in the database                                                   | Embedding/semantic features disable; lexical fallback; logged. The run is unaffected.                                                                             | R8     |
| SC9  | An **embed call throws** mid-ingest                                                                    | That spec is stored with a null embedding; ingestion still completes (best-effort).                                                                               | R3,R8  |
| SC10 | `findSimilarSpecs("send a message", appId, 3)` on an app whose contact-form spec is worded differently | Returns the contact-form spec ranked first, scoped to that app.                                                                                                   | R6     |
| SC11 | The **backfill** runs over specs with null embeddings                                                  | Populates their embeddings; a second backfill run embeds nothing (idempotent).                                                                                    | R4     |
| SC12 | The embedding **model is switched** (e.g. 384→1024)                                                    | Rows tagged with the old model are detected and re-embedded by the backfill; no cross-dimension comparison ever happens.                                          | R9     |

## User experience

Phase 2 ships **no new GUI**; the consumer is the Generator agent, and the
operator observes through the existing live progress stream.

- **Primary journey:** An operator re-runs an app. The Generator's coverage event
  — `🧠 Coverage decisions: N reuse, M extend, K new` — now reflects **semantic
  catches**: a paraphrased duplicate that Phase 1 showed as `new` now shows as
  `reuse`, and that spec is not regenerated. The final suite is leaner for the
  same coverage.
- **Two states — each is a design:**
  - **Semantic-active (warm):** embeddings present → hybrid decisions; the event
    stream shows the richer reuse/extend counts.
  - **Degraded:** no model / no pgvector / embed failure → identical to Phase 1
    lexical, plus a single logged "embeddings unavailable — lexical only" notice.
    The run never fails or changes outcome.
- **UX principle — no silent magic:** every reuse/extend decision stays on the
  event stream and is traceable; semantic matching adds reasons, it doesn't hide
  them. (A `findSimilarSpecs` debugging surface is available to callers but is not
  a UI this phase.)

## Constraints

| ID  | Constraint                                                                                                                                                                                                                    |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | Storage = **`pgvector`**: `embedding vector(384)` on `specs` + an HNSW **cosine** index; additive migration `0002`. (pgvector ≥0.8 verified available locally; Neon ships it.)                                                |
| C2  | Embedder = **local, in-process**: `@huggingface/transformers` / `Xenova/bge-small-en-v1.5` (384d), mean-pool + L2-normalize. **No API key.** A pluggable `Embedder` interface keeps a hosted provider (Voyage) a config swap. |
| C3  | Matching = **hybrid** (lexical OR semantic), **err to `new`** when uncertain, `reuse` requires the matched spec's last run passed. Phase 1 lexical remains the fallback.                                                      |
| C4  | **Additive-only / graceful degradation** (extends Phase 1 R4/N3): never throws, never a worse decision than Phase 1.                                                                                                          |
| C5  | Retrieval + scenario-embedding budget = **≤500 ms warm**; the one-time model cold-load is measured/named separately (N2), not counted in N1.                                                                                  |
| C6  | **Reuse Phase 1 seams** — extend `coverageDecision.ts`, the `specs` table, `ingestRun`, and the `KnowledgeService` interface; do not re-architect.                                                                            |
| C7  | Must respect `CONSTITUTION.md`: simplicity, **determinism over flakiness** (embedding non-determinism is bounded — see A3 — and used for ranking, not a hard gate), nothing ships unverified.                                 |

## Assumptions

| ID  | Assumption                                                                                                                                                                            | If wrong → impact                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| A1  | `bge-small-en-v1.5` (384d) can reach **≥70%** paraphrase recall on the tarento-derived set after threshold calibration.                                                               | Trigger the named contingency: switch to hosted **Voyage** embeddings (new dims + re-embed backfill). |
| A2  | A **Claude-generated, human-verified** paraphrase set is valid ground truth for M1/M2.                                                                                                | M1/M2 are not meaningfully measurable; a better labeled set is needed.                                |
| A3  | Embedding **non-determinism** (across hardware/model version) is acceptable because embeddings rank/match, not gate; pinning model+version keeps decisions stable on a given machine. | If rankings flip across machines, pin a fixed quantized model artifact.                               |
| A4  | Cosine similarity on L2-normalized bge embeddings **separates** near-duplicates (~0.9+) from unrelated (<0.6) with a tunable mid-band.                                                | Thresholds can't cleanly separate reuse/extend/new; a stronger model is required.                     |
| A5  | Per-app spec counts stay **modest** enough that HNSW + per-scenario nearest-neighbor stays within the ≤500 ms budget.                                                                 | Need batching/index tuning or a candidate cap.                                                        |

## Non-functional requirements

| ID  | NFR (system quality)                   | Target (measurable)                                                                                         | How measured                                                                                        |
| --- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| N1  | **Retrieval latency (warm)**           | retrieval + scenario-embedding ≤ **500 ms** with the model loaded                                           | Time the calls in a run with the model warm; assert ≤500 ms.                                        |
| N2  | **Model cold-load**                    | first embedding loads + caches the model in ≤ **30 s**; later process starts reuse the cache                | Time the first embed vs. a subsequent one; assert cache reuse.                                      |
| N3  | **Additive safety (no regression)**    | with embeddings disabled, the hybrid decider returns decisions **identical** to the Phase 1 lexical decider | Run the hybrid decider with embeddings off over fixed inputs; diff vs. lexical decider = identical. |
| N4  | **Decision determinism (fixed model)** | same scenario/spec pair → same decision across repeats on one machine                                       | Repeat the decision N times; assert identical outcome.                                              |
| N5  | **Embedding completeness**             | after ingest (model available), **100%** of specs have a non-null embedding tagged with the current model   | `count(specs WHERE embedding IS NULL AND model=current) = 0`.                                       |

## Dependencies

| ID   | Dependency                                                                                   | Type                  | Owner | Status                  |
| ---- | -------------------------------------------------------------------------------------------- | --------------------- | ----- | ----------------------- |
| DEP1 | Phase 1 Knowledge Platform (shipped) — the `specs` table, `ingestRun`, `coverageDecision`    | Sequencing            | Team  | Done (merged to main)   |
| DEP2 | `pgvector` extension in every Postgres environment                                           | Technical             | Team  | Verified local (0.8.2)  |
| DEP3 | `@huggingface/transformers` npm dep + the `bge-small-en-v1.5` model weights (cached)         | Technical             | Team  | To add                  |
| DEP4 | A **Claude-generated, human-verified paraphrase set** derived from the curated tarento flows | Sequencing / Team     | Team  | To build (before M1/M2) |
| DEP5 | Two live tarento.com runs (`ANTHROPIC_API_KEY` + Playwright CLI) to measure M1/M2            | Sequencing / External | User  | Open                    |

## Success metrics

| ID  | Metric (outcome that should move)          | Baseline                           | Target                   | How measured                                                                                                                 |
| --- | ------------------------------------------ | ---------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| M1  | **Paraphrase recall** (the new capability) | 0% (lexical catches none of these) | **≥70%**                 | On the labeled paraphrase set (reworded duplicates that Phase-1 lexical marks `new`), % that Phase 2 flags `reuse`/`extend`. |
| M2  | **False-reuse rate** (precision guardrail) | n/a (new)                          | **≤5%** (precision ≥95%) | Of scenarios Phase 2 marks `reuse`/`extend` on the labeled set, % that were actually NOT covered.                            |

## Acceptance criteria

| ID   | Acceptance criterion (observable / testable)                                                                                                                  | Verifies |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| AC1  | Migration `0002` creates the `vector` extension, `embedding vector(384)` + `embedding_model` on `specs`, and an HNSW cosine index; re-running is a no-op.     | R2       |
| AC2  | The local `Embedder` embeds a batch of texts → 384-dim L2-normalized vectors; a fake `Embedder` is substitutable in tests.                                    | R1       |
| AC3  | Ingesting a spec stores a non-null embedding + `embedding_model`; re-ingesting unchanged content (same `content_hash`) does not re-embed (cache hit).         | R3,N5    |
| AC4  | With the embedder forced to throw, ingestion completes and the spec is stored with a null embedding; no error surfaced.                                       | R3,R8    |
| AC5  | `decideForSpecs` (hybrid, pure): low-lexical/high-semantic vs a passed spec → `reuse`; mid → `extend`; low/low → `new`; near-threshold → `new`.               | R5       |
| AC6  | A high-lexical/low-semantic match still yields `reuse`/`extend` — never worse than Phase 1.                                                                   | R5,R8    |
| AC7  | With embeddings disabled, the hybrid decider returns decisions **identical** to the Phase 1 lexical decider on the same inputs (regression guard).            | R8,N3    |
| AC8  | `findSimilarSpecs(query, appId, k)` returns the semantically-nearest spec first for a paraphrased query, scoped to the app.                                   | R6       |
| AC9  | On a 2nd run, the Generator does NOT regenerate a paraphrased duplicate (marked `reuse`) that Phase 1 would have regenerated — observable in decisions/specs. | R7       |
| AC10 | The backfill populates embeddings for specs lacking them for the current model; a second run embeds nothing (idempotent).                                     | R4       |
| AC11 | Specs carry `embedding_model`; a row tagged with a different model is detected and re-embedded by the backfill (no cross-dimension comparison).               | R9       |
| AC12 | Retrieval + scenario-embedding (model warm) completes ≤500 ms (timed).                                                                                        | N1       |
| AC13 | On the labeled paraphrase set, Phase 2 flags **≥70%** as `reuse`/`extend` (M1) AND **≤5%** false-reuse (M2).                                                  | R5,R10   |

> **Coverage rule:** every **Must** requirement (R1–R9) has ≥1 acceptance criterion; R10 (Should) is covered by AC13.

## Out of scope

- Healing memory + playbooks (Phase 3); graph DB / Neo4j / governance / multi-agent (Phase 4).
- Embedding `plan_scenarios` or `flows` beyond `specs`.
- **Building** a hosted embedding provider — the `Embedder` interface is ready; only the local impl ships.
- Any user-facing UI (a "similar tests" view is deferred).

## Future vision

- **What this unlocks:** with semantic matching in place, the platform can do
  intelligent suite _merge_ (not just dedupe), surface "tests like this", and feed
  semantic similarity into healing (Phase 3) and graph reasoning (Phase 4).
- **Likely next steps (v2+):** hosted-embedder option (Voyage) for higher recall;
  embedding scenarios/flows for scenario-level reuse; a coverage/similarity UI;
  per-app threshold auto-tuning.
- **Deliberately deferred:** hosted provider build, Healer wiring, UI, embedding
  beyond specs.

## Open questions

| ID  | Question                                                                                                           | Status                             |
| --- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| Q1  | Size/composition of the labeled paraphrase set (how many pairs, how hard).                                         | Open (Record→build before measure) |
| Q2  | The `SEM_REUSE` / `SEM_EXTEND` cosine threshold values — calibrate during Forge against the curated tarento flows. | Open (Forge; record values)        |
| Q3  | Whether to also embed `plan_scenarios` for scenario↔scenario matching.                                             | Open (deferred)                    |

---

## Change log

| Version | Date       | Change       | Reason |
| ------- | ---------- | ------------ | ------ |
| v0.1.0  | 2026-06-05 | Initial spec | —      |

---

_Stage 2 (Record) artifact. Approve at the Human Gate, then proceed to
`/craft-framework:assemble`. Must respect every rule in `CONSTITUTION.md`._
