# Implementation Notes — Knowledge Platform · Phase 2 (Forge)

Live log maintained during Stage 4 (Forge). Each entry: a decision made the
moment it happened — gaps, tradeoffs, changes vs the Plan, assumptions.

---

### [2026-06-05] Environment: pgvector enabled, HF hub reachable

**Type:** Decision · **Task:** Forge setup

`CREATE EXTENSION vector` succeeded on the local `knowledge` db (pgvector 0.8.2).
The HF model hub is reachable (307 → CDN), so `Xenova/bge-small-en-v1.5` can
download on first use. Per the plan, unit + integration tests use a deterministic
`FakeEmbedder` (no network, no model); the real `LocalEmbedder` is exercised by a
manual smoke check + the nightly/calibration path, not the fast unit suite.

### [2026-06-05] Real cosine geometry from bge-small (informs T15 calibration)

**Type:** Decision · **Task:** T2 (R1), feeds R10/D6/Q2

Smoke test of `LocalEmbedder` on a real paraphrase pair:
"Submit the contact form" vs "Send a message via the Contact Us widget" →
cosine **0.79**; vs "Browse the product catalogue" (unrelated) → **0.46**.
So bge-small separates paraphrase (~0.8) from unrelated (~0.46) cleanly. Starting
thresholds for calibration: `SEM_REUSE ≈ 0.80`, `SEM_EXTEND ≈ 0.55` (the 0.79
paraphrase lands as `extend` under SEM_REUSE=0.80 — still avoids a pure
duplicate). Final values tuned against the labeled set in T15.

### [2026-06-05] Symmetric embedding (no bge query-prefix)

**Type:** Decision · **Task:** T2 (R1)

bge recommends an asymmetric "Represent this sentence…" prefix for query↔passage
retrieval. We embed specs and scenarios **symmetrically** (no prefix) because both
sides are short titles of the same kind and we want title↔title similarity, not
query↔document. Revisit if recall underperforms in T15.

### [2026-06-05] Embedding cache is GLOBAL by content_hash + model

**Type:** Decision · **Task:** T8/T13 (R3)

`embeddingForHash` matches on `content_hash` + `embedding_model` with no app/run
scope — so two specs with identical source (anywhere) share one embedding and the
model is called once. Correct and efficient (identical code ⇒ identical vector).
Surfaced by a test-isolation bug: a sibling test pre-populated the cache for a
shared spec template, so the cache test's "first" ingest hit cache. Fixed by
giving that test a unique spec title (novel hash). Not a product issue.
