# Future implementation ideas — embedding model options

> Forward-looking notes (not a settled decision). Captures candidate embedding
> models for the pgvector semantic-reuse path, why we might switch, and what a
> switch actually costs. The current decision of record stays
> [ADR-0002 — Local in-process embedder (bge-small)](adr/0002-local-embedder.md);
> this doc is the input for a future ADR if/when we upgrade.

- **Status:** Exploratory / backlog
- **Date:** 2026-06-24
- **Current model:** `Xenova/bge-small-en-v1.5` (384d), in-process via
  `@huggingface/transformers`, mean-pooled + L2-normalized. See
  `src/knowledge/embeddings/embed.ts`.

## Why revisit

The reuse matcher embeds short text (spec titles, step comments) and compares by
cosine similarity to decide `reuse` vs `new`. bge-small is the smallest/fastest
option but also the lowest quality of the practical local models. Two questions
came up: (1) should we switch to `nomic-embed-text`, and (2) is there something
better than either.

Key reframe: **our inputs are short.** nomic's headline feature — 8192-token
context — is wasted on titles, so its main advantage does not apply here. The
metric that maps to our task ("find a reusable spec") is **retrieval (nDCG@10)**,
not the MTEB average.

## Candidates (live MTEB English v1 figures)

> MTEB v1 scale, for comparability. MTEB v2 (2026) scores are **not** directly
> comparable. Numbers fetched 2026-06-24; treat as approximate — re-check the
> leaderboard before committing.

| Model                             | MTEB avg  | Retrieval (nDCG@10) | Dims | Params | Notes                                                                         |
| --------------------------------- | --------- | ------------------- | ---- | ------ | ----------------------------------------------------------------------------- |
| `bge-small-en-v1.5` _(current)_   | 62.17     | 51.68               | 384  | 33M    | smallest/fastest; ~30 MB download                                             |
| `nomic-embed-text-v1.5`           | 62.28     | ~53.0               | 768  | 137M   | needs `search_query:`/`search_document:` prefixes; 8k context (unused for us) |
| **`bge-base-en-v1.5`**            | **63.55** | **53.25**           | 768  | 109M   | same family, no mandatory prefixes; low-risk drop-in                          |
| `snowflake-arctic-embed-m` (v1.5) | ~61.5     | **55.14**           | 768  | 109M   | retrieval-tuned; highest retrieval per byte                                   |
| `mxbai-embed-large-v1`            | **64.68** | 54.39               | 1024 | 335M   | best overall avg; heaviest column + slowest embed                             |

### Reading the table

- **nomic vs bge-small:** ~53.0 vs 51.68 retrieval — a real but small (~1.3 pt)
  gain, at the cost of 768-dim columns, prefix plumbing, and ~4.5× the model
  size. Not justified on its own for short titles.
- **`snowflake-arctic-embed-m`** — highest retrieval (55.14) at the _same_
  768d/109M as bge-base; tuned for exactly our task. **Best pure-retrieval pick.**
- **`bge-base-en-v1.5`** — beats both current candidates, same BGE family
  (familiar calibration behavior), no mandatory prefixes. **Safest upgrade.**
- **`mxbai-embed-large-v1`** — best average but 1024d/335M for only marginal
  retrieval gain over arctic-m; heavier on every axis.

### Rough rankings

- **Quality (retrieval):** arctic-embed-m ≈ bge-base > nomic > bge-small
- **Speed / footprint:** bge-small > bge-base ≈ arctic > nomic > mxbai

## Recommendation (for a future decision)

Prefer **`snowflake-arctic-embed-m`** (most retrieval accuracy per byte) or
**`bge-base-en-v1.5`** (lowest-risk drop-in). Both beat `nomic-embed-text` on the
metric we care about at lower or equal cost. Only choose nomic if we later embed
long documents (its 8k context), which short titles don't use.

**Caveat that dominates the choice:** the gaps here are small enough that
**re-calibrating the reuse threshold will move recall more than the model swap
will**. So: pick arctic-m or bge-base, then re-run calibration.

## What a switch actually costs

Switching is not an `EMBEDDING_MODEL` env flip — the store is hardwired to 384
dims. Required work:

1. **Widen the vector columns** 384 → 768 (or 1024 for mxbai) via a new
   migration (`0006_*`). pgvector dimension is part of the column _type_, so this
   is drop-column + recreate + **full re-embed**, not an in-place `ALTER`.
   Affected columns: `specs.embedding`, `specs.pattern_embedding`,
   `specs.title_embedding` (migrations 0002/0004/0005) and
   `healing_playbooks.failure_embedding` (0003).
2. **`src/knowledge/embeddings/embed.ts`:** bump `dims` (currently 384, line 46),
   change the default model, and — for nomic — add query/document prefix handling
   (the embedder is deliberately symmetric today; see the comment at line 42).
3. **Re-embed** via the existing backfill scripts (`knowledge-embed-backfill`,
   `knowledge-pattern-backfill`, `knowledge-title-backfill`); they already detect
   a model switch (`embedding_model IS DISTINCT FROM $1`) and repopulate once the
   columns are widened.
4. **Re-calibrate** thresholds with `bin/knowledge-calibrate.ts` and update the
   value in `src/knowledge/constants.ts`.
5. **Record the decision** in a new ADR and supersede/annotate ADR-0002.

Runtime note: arctic-embed-m, bge-base, and mxbai all ship ONNX weights, so they
drop into the existing `@huggingface/transformers` `feature-extraction` pipeline
and keep the in-process, no-API-key design ADR-0002 chose. (Ollama's
`nomic-embed-text` would mean a network HTTP embedder and abandons that property —
avoid.)

## Sources

- [BAAI/bge-base-en-v1.5 (Hugging Face — MTEB table)](https://huggingface.co/BAAI/bge-base-en-v1.5)
- [MTEB Leaderboard (Hugging Face)](https://huggingface.co/spaces/mteb/leaderboard)
- [Best Ollama Embedding Models 2026 (morphllm)](https://www.morphllm.com/ollama-embedding-models)
- [Introducing Snowflake Arctic-embed (Snowflake)](https://www.snowflake.com/en/blog/introducing-snowflake-arctic-embed-snowflakes-state-of-the-art-text-embedding-family-of-models/)
- [Nomic Embed paper (arXiv)](https://arxiv.org/pdf/2402.01613)
