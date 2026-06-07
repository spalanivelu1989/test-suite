# Brief — Knowledge Platform · Phase 3 (Healing Memory & Playbook Distillation)

> Stage 1 (Clarify) deliverable. One page. Frames the problem before any spec.
> Phase 3 of the platform; builds on Phase 1 (shipped) and Phase 2 (shipped).
> Background: `docs/knowledge-platform-architecture.md` §3.6, §4.2; the locator-DB
> opportunity in `docs/improvements.md`.

- **Status:** Approved
- **Date:** 2026-06-07
- **Author:** tel@tarento.com (framed with Claude as Interviewer)

---

## Problem

The platform now remembers **what** was tested (Phase 1) and recognizes it by
**meaning** (Phase 2) — but it learns nothing from **how problems were solved**.
Two compounding gaps remain:

1. **Healing is amnesiac.** When the Healer repairs a broken locator in Run A
   (e.g. swaps a brittle `#btn-7f3a` for `getByRole('button', {name:'Send'})`),
   Run B regenerates the test from scratch and the Healer must re-discover the
   exact same fix — burning Anthropic API calls and wall-clock on a solved
   problem (`docs/improvements.md`). The fix itself is never captured: the Healer
   edits files in place and returns only `{toolCalls, isError}`.
2. **Success teaches nothing.** Across many runs the same lessons recur
   ("`networkidle` waits flake on SPA routes", "accordion panels need explicit
   visibility waits"), but nothing distills these episodes into reusable
   principles. Every agent starts each run without the accumulated wisdom of all
   prior runs.

## Business goal

Make the agents **learn from their own fixes and successes** so each run is
faster and more resilient than the last. Capture every heal as reusable
evidence, and distill recurring episodes into **playbooks** — generated,
evidence-linked principles that the Planner, Generator, and Healer read on every
future run. This is the step that turns "memory" into "learning": Phase 1 gave
the pipeline memory, Phase 2 made it semantic, Phase 3 makes it **improve over
time**.

## Why now

Phases 1 and 2 shipped to `main`, and they were chosen specifically so this step
is additive — Postgres (ADR-0001) and `pgvector` (ADR-0002/0003) are already in
place, the `ingestRun → persistRun → KnowledgeService` seam is proven, and the
hybrid lexical-OR-semantic matcher is reusable for failure-signature matching.
The healing-amnesia cost is real and recurring today on every repeat run. The
architecture already specifies Phase 3 ("Healing memory + playbooks", §3.6/§4.2);
this Brief opens it.

## Audience

Internal — the **Healer agent** is the direct consumer of healing precedents
(stop re-solving solved failures), the **Generator agent** consumes resilient-
locator hints and playbooks (write better specs the first time), the **Planner**
consumes procedural playbooks (pick better crawl strategies), and the dev/QA team
benefits from faster, more reliable repeat runs. Job-to-be-done: "Don't make my
agents relearn the same fix and the same lesson on every run."

## Success — observable

**Primary metric — heal-precedent reuse (M1).** On repeat runs of an app with a
recurring failure class, **≥60%** of heals that match a prior successful heal are
resolved using the precedent (fewer Healer iterations / no cold re-discovery),
measured against a labeled set of recurring failure→fix pairs derived from the
curated tarento flows.
**Paired guardrail — no bad-fix propagation (M2).** Of specs the Generator emits
using a locator hint or playbook, **≤5%** regress (introduce a first-run failure
the hint was meant to prevent). Learned lore must not make things worse — only
`trusted` (evidence-backed) playbooks are ever injected.
**Secondary — principle precision (M3).** Of `trusted` playbooks, **≥90%** are
judged correct/actionable on human review (no hallucinated lore).

## Constraints

- **Storage:** additive migration `0003` — `healing_events` and `playbooks`
  tables, each with a `vector(384)` column (failure signature / principle) + HNSW
  cosine index. Reuses the Phase 2 embedder; no new dimension.
- **Heal capture is DETERMINISTIC:** reconstruct each fix by **diffing pre-heal
  vs post-heal spec files** (both already in hand in `orchestrate.ts`) + a
  rule-based strategy classifier. **No change to the Healer agent**, no extra
  per-run LLM call on the hot path.
- **Distillation is OFF the hot-path:** a separate batched, incremental CLI job
  (`bin/knowledge-distill.ts`), like the Phase 2 backfill. A run never waits on it.
- **Trust gate:** new playbooks are `episodic`; only `trusted` ones are injected
  into prompts (auto-promote at support ≥ N with no contradicting evidence, or
  manual approval). Injection is **token-budgeted**.
- **Additive-only / graceful degradation (unchanged):** KB down / no embeddings /
  no playbooks → agents run exactly as Phase 2, never throws, never worse.
- **One LLM touch-point, bounded:** the only new LLM use is the off-hot-path
  cluster→principle summarizer (reusing `createClaudeClient`), with a
  deterministic strategy-template fallback when no key is configured.

## Out of scope

- Graph DB / Neo4j / recursive-CTE reasoning, governance, multi-agent (Phase 4).
- A user-facing playbook/heal-history UI (event-stream surfacing only this phase).
- Auto-applying a precedent's patch without the Healer (we _advise_ the agent, we
  don't bypass it).
- Procedural crawl-strategy _auto-selection_ — Phase 3 surfaces the procedural
  playbook as advice; wiring it into automatic mode selection is deferred.

## Prior art

Phase 1 `ingestRun`/`persistRun`/`coverageDecision` (the seams this extends),
Phase 2's `Embedder` + hybrid matcher (reused for failure-signature retrieval),
the locator-DB opportunity in `docs/improvements.md`, and the agent-memory model
(episodic/semantic/procedural) in `docs/knowledge-platform-architecture.md` §3.6.

## Risks

- **Hallucinated playbooks** (central risk): the LLM invents a plausible-but-wrong
  principle. Mitigated by the trust gate (evidence-linked, support-count promotion),
  M3 precision review, and deterministic-fallback templating.
- **Bad-fix propagation:** a heal that "passed" but was fragile becomes a hint that
  spreads. Mitigated by requiring the precedent's run passed _and stayed passing_,
  the M2 guardrail, and re-weighting (not deleting) on contradiction.
- **Diff-based capture misattributes a fix** (e.g. unrelated edits in the same
  file). Mitigated by line-scoped diffs, strategy classification confidence, and
  storing raw before/after for audit.
- **Distillation cost/complexity:** clustering + LLM summarization could grow
  unbounded. Mitigated by incremental watermark, batch caps, and deterministic
  clustering (LLM only summarizes a bounded cluster).
- **Seeding:** M1/M3 need a labeled recurring-failure set + repeat tarento runs.

---

## Open questions

- **Q1:** Composition/size of the labeled recurring-failure→fix set for M1/M3 —
  finalize in Record; build before measuring.
- **Q2:** Precedent-match threshold and playbook **promotion** rule (support-count
  N, contradiction handling) — calibrate during Forge.
- **Q3:** Strategy taxonomy — the closed set of `HealStrategy` values — finalize in
  Record (start from: role-locator, regex-text, wait-visibility, assertion-fix,
  fixme, other).
- **Q4:** Whether procedural (crawl-strategy) playbooks ship in 3b or defer to a
  3c — lean defer; revisit in Assemble.

---

_Stage 1 (Clarify) artifact. Approve at the Human Gate, then proceed to
`/craft-framework:record`. Keep this to ONE page._
