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

### [2026-06-05] T15 calibration result: thresholds SEM_REUSE=0.82, SEM_EXTEND=0.60

**Type:** Decision · **Task:** T15 (R10/M1/M2/Q2)

Ran `bin/knowledge-calibrate.ts` with the REAL bge-small model over the labeled
set (20 paraphrases — 19 lexically-missed — + 8 negatives). Sweep result:
- SEM_EXTEND 0.55 → recall 100% but **false-reuse 13%** (over-merges).
- SEM_EXTEND **0.60 → recall 95%, false-reuse 0%** ✅ (chosen).
- SEM_EXTEND 0.62 → 84%/0%; 0.65 → 79%/0%.
SEM_REUSE (0.75–0.85) doesn't move the combined reuse+extend metric; kept at
**0.82** so only very-high similarity skips a test, moderate ones `extend`.
**M1 95% / M2 0% clears the Spec targets (≥70% / ≤5%).**

**CAVEATS (honest):** the labeled set is small and **Claude-generated — needs
human verification** before the numbers are trusted; intents are hand-authored,
not real tarento specs. Final M1/M2 against two live tarento.com runs are measured
via `/craft-framework:measure`. This calibration is strong evidence the approach
works and the thresholds are well-chosen, not the final production number.

### [2026-06-05] Post-merge fix: coverage decision collapsed to 2-way (`reuse | new`)

**Type:** Decision/Fix · **Relates to:** R10/D4, ADR-0003 (amended)

Diagnosed from run `e95e6824-…`: planner produced 25 scenarios, generator emitted
only **4 spec files**. Cause — the `extend` tier (moderate match) carried no spec
source and the generator prompt said "generate new scenarios only", so the 21
`extend` scenarios were **silently dropped** (validation 56/100, "21 flows without
a test"). The planner had also already deduped against the KB, so the generator
re-suppressing flows was a second, conflicting dedup.

Per the user's "tighten-then-copy" choice, removed the middle tier:
- `coverageDecision.ts` — `decideForSpecs` now returns `reuse | new`; removed
  `EXTEND_THRESHOLD`/`SEM_EXTEND` and the `semExtend` threshold param. Copy bar
  unchanged (lex ≥ 0.80 OR sem ≥ 0.82, AND last passed). Strong-match-but-failed
  now → `new` (regenerate) instead of `extend`.
- `types.ts` — `CoverageAction = "reuse" | "new"`; `decision` event drops `extend`.
- `index.ts` — `tally` drops `extend`.
- `stages.ts` (`applyGeneratorKnowledge`) — removed the contradictory `extend`
  prompt block; prompt now skips ONLY specs actually copied and says "generate
  every other scenario — do not skip any". A `reuse` whose source can't be copied
  now falls back to generation (no silent drop).
- `bin/knowledge-calibrate.ts` — `isCovered` = `reuse` only; sweep over `SEM_REUSE`.
- Tests updated (coverageDecision/integration); typecheck + 143 unit tests pass.

**Not changed:** the planner-side KB dedup (the double-dedup smell) is left as-is;
revisit if the planner and generator still disagree on coverage in practice.

### [2026-06-05] Architecture: Planner is KB-agnostic — one decision layer

**Type:** Decision/Refactor · **Relates to:** R8/R10, ADR-0003 (amendment 2)

User direction: "The planner should not have knowledge of the existing runs. The
planner's job is to crawl the target URL [and write plan.md]. It is the job of the
generator to decide whether to write a new test or copy a test from the last run
based on cosine similarity."

This reverses the planner-side knowledge injection (both the original "skip
covered flows" and the short-lived "re-list covered flows for reuse"). Prior-run
de-duplication is now the Generator's responsibility alone, via its `reuse | new`
coverage decision. Removed:
- `stages.ts` `planTests`: all KB wiring — the planner prompt is crawl-only.
- `index.ts`: the `planning` branch of `assembleContext`; signature is now
  `assembleContext(url, scenarios?)` (generator context only).
- `contextPack.ts`: `buildPlannerPack` + `PLANNER_BUDGET_CHARS`.
- `types.ts`: `KnowledgeStage`, `ContextPack.planner`, the `loaded` event.
- `orchestrate.ts`: the `loaded` → "Knowledge: N known/M gap" planning message.
- Tests updated: contextPack (dropped planner-pack tests), knowledgeWiring T14/T20
  (now asserts the planner prompt carries NO knowledge with or without a KB),
  integration disabled-service assertion.

Typecheck clean; 141 unit tests pass (was 143 — removed 2 buildPlannerPack tests).
