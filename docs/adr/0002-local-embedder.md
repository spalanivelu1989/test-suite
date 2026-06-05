# ADR-0002 — Local in-process embedder (bge-small) for semantic test reuse

> A durable Architecture Decision Record. Lives in `docs/adr/` so future stages
> and reviews read it and do not re-litigate a settled decision.

- **Status:** Accepted
- **Date:** 2026-06-05
- **Deciders:** tel@tarento.com (with Claude as Interviewer/Planner)
- **Relates to:** Spec `specs/knowledge-platform-phase-2/` R1/C2/A1; Plan `D1`

## Context

Phase 2 needs text embeddings to match paraphrased test scenarios. The choice of
provider shapes dependencies, cost, offline/CI behavior, and the `vector(N)`
column dimension. Anthropic offers no native embeddings API; the realistic
options are a local in-process model or a hosted provider (Voyage/OpenAI).

## Decision

We will use a **local, in-process embedder**: `@huggingface/transformers`
(transformers.js, ONNX/WASM) running **`Xenova/bge-small-en-v1.5`** (384 dims,
mean-pool + L2-normalize). All access is behind a pluggable **`Embedder`**
interface, so a hosted provider is a config swap, not a rewrite.

## Alternatives considered

- **Hosted — Voyage AI (`voyage-3-lite`).** Rejected as the default: higher
  quality, but adds a vendor + `VOYAGE_API_KEY`, per-token cost, and a network
  dependency. Kept as the **named contingency** (A1) if local recall < target.
- **Hosted — OpenAI (`text-embedding-3-small`).** Rejected: another provider/key/
  cost; no advantage over Voyage for this use.
- **`fastembed` (native onnxruntime-node).** Rejected as default: faster, but
  native bindings are less portable across dev/CI; transformers.js (WASM) is the
  safer default. Reconsider if embedding throughput becomes a bottleneck.

## Consequences

- **Easier:** no API key, works offline, keeps CI/tests hermetic, matches the
  validator's deterministic-ish ethos, zero per-call cost.
- **Harder / cost:** a ~30 MB model download on first use (cached); lower semantic
  quality than frontier models — may not hit the ≥70% recall target on hard
  paraphrases (mitigated by the Voyage contingency); a fixed 384-dim column.

## Re-litigation guard

Do **not** re-propose "just use a hosted embedding API" as the default in future
reviews. Local-first was chosen deliberately for no-key/offline/CI and
graceful-degradation reasons. Switching to Voyage is **already specified as a
contingency** triggered only by `M1 (paraphrase recall) < 70%` after threshold
calibration — at which point it is a planned dimension change + re-embed, not a
fresh debate. Revisit the default only if that trigger fires or the project's
offline/no-key constraint is dropped.
