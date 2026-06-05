# Brief — Knowledge Platform · Phase 2 (Semantic Test Reuse via pgvector)

> Stage 1 (Clarify) deliverable. One page. Frames the problem before any spec.
> Phase 2 of the platform; builds on Phase 1 (shipped). Background RFC:
> `docs/pgvector-integration-plan.md`.

- **Status:** Approved
- **Date:** 2026-06-05
- **Author:** tel@tarento.com (framed with Claude as Interviewer)

---

## Problem

Phase 1's Generator decides `reuse | extend | new` per planned scenario by
**lexical** token-overlap. It catches similarly-worded duplicates but is **blind
to meaning** — it misses paraphrases. "Submit the contact form" and "Send us a
message via the Contact Us widget" share almost no words, so lexical says "new"
and a **duplicate test gets generated**. Every reworded-but-equivalent scenario
slips through, inflating the suite and undercutting the duplicate-avoidance the
Knowledge Platform exists to deliver.

## Business goal

Make test reuse understand **meaning, not just words** — so the system recognizes
a scenario it has already tested even when it's phrased differently, and stops
regenerating it. This raises the recall behind duplicate-avoidance and keeps the
generated suite lean as it grows. It's the next compounding step: Phase 1 gave
the pipeline memory; Phase 2 makes that memory _semantic_.

## Why now

Phase 1 just shipped to `main`, and we deliberately chose Postgres (ADR-0001) so
this step would be additive. We've verified **pgvector 0.8.2 is already available**
in our Postgres, and the `specs` table already carries `content_hash` (embedding
cache key). So Phase 2 is a column + a module + a hybrid decision — cheap to land
now and the natural follow-on while the design is fresh.

## Audience

Internal — the **Generator agent** is the direct consumer (it gets
semantically-aware reuse/extend/new decisions), and the dev/QA team benefits from
a cleaner, non-redundant suite on repeat runs. Job-to-be-done: "Don't make me a
near-duplicate test just because I worded the scenario differently this time."

## Success — observable

**Primary metric — paraphrase recall (M1).** On a labeled set of reworded
duplicates that **Phase-1 lexical marks `new`**, Phase 2 must correctly flag
**≥70%** as `reuse`/`extend`. Measured against a **Claude-generated,
human-verified** paraphrase set derived from the 10 curated tarento flows
(`fixtures/tarento-flows.json`).
**Paired guardrail metric — false-reuse ≤5% (M2, precision ≥95%).** Of scenarios
Phase 2 marks `reuse`/`extend`, **≤5%** were actually NOT covered. This is the
counterweight: a masked coverage gap is worse than a duplicate test, so recall
gains must not come from over-merging.

## Constraints

- **Storage:** `pgvector` — `embedding vector(384)` column on `specs` + an HNSW
  cosine index (additive migration `0002`).
- **Embedder: LOCAL, in-process** — `@huggingface/transformers` running
  `Xenova/bge-small-en-v1.5` (384 dims). No API key, offline, CI-friendly. A
  pluggable `Embedder` interface keeps a hosted provider (Voyage) a config swap.
- **Hybrid matching:** `reuse|extend|new` fires when **lexical OR semantic**
  clears the bar (max recall), still **erring to `new`** when uncertain, with
  `reuse` requiring the prior run passed. Lexical (Phase 1) remains the fallback.
- **Graceful degradation (unchanged):** no model / no pgvector / embed failure →
  fall back to Phase 1 lexical. Semantic is strictly **additive recall** — it can
  never break a run or make behavior worse than Phase 1.
- **Latency:** retrieval + scenario-embedding stays **≤500ms warm** (batch-embed
  in one call); the one-time model cold-load is measured/named separately, not
  counted in the budget.

## Out of scope

- Healing memory + playbooks (Phase 3); graph DB / Neo4j / governance /
  multi-agent (Phase 4).
- Embedding `plan_scenarios` or `flows` beyond `specs`.
- **Building** a hosted embedding provider — the interface is ready; only the
  local impl ships.
- Any user-facing UI.

## Prior art

Phase 1's lexical `coverageDecision` (the seam this extends) and ADR-0001 (we
chose Postgres specifically to enable pgvector without a re-platform). The full
technical approach is mapped in `docs/pgvector-integration-plan.md`.

## Risks

- **Over-merge masks a coverage gap** (the central risk). Mitigated by the ≤5%
  false-reuse bar, erring to `new` near thresholds, and requiring last-run-passed
  for `reuse`. The guardrail metric makes it observable.
- **Local-model quality:** `bge-small` may not hit ≥70% recall on hard
  paraphrases. **Named contingency:** if recall < 70% after threshold
  calibration, switch to hosted **Voyage** embeddings (a dimension change +
  re-embed backfill) — an accepted scope change, not a redesign.
- **Dimension lock-in:** `vector(384)` is fixed at migration time; the Voyage
  fallback needs a new column + backfill (`embedding_model` stored per row to
  manage it).
- **Determinism:** embeddings aren't bit-identical across hardware/model
  versions. Acceptable here — they're used for ranking/matching, not a hard gate
  — provided we pin the model + version (assumption to record in the Spec).
- **Seeding:** the recall metric needs the labeled paraphrase set built and two
  tarento.com runs to measure against.

---

## Open questions

- **Q1:** Size/composition of the labeled paraphrase set (how many pairs, how
  hard) — finalize in Record; build before measuring.
- **Q2:** `SEM_REUSE` / `SEM_EXTEND` cosine thresholds — calibrate during Forge
  against the curated tarento flows; record the chosen values.
- **Q3:** Whether to also embed `plan_scenarios` for scenario↔scenario matching —
  deferred; revisit if scenario-level reuse becomes valuable.

---

_Stage 1 (Clarify) artifact. Approve at the Human Gate, then proceed to
`/craft-framework:record`. Keep this to ONE page._
