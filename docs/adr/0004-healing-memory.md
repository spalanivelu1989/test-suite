# ADR-0004 — Healing memory via deterministic pre/post-heal diff capture

> A durable Architecture Decision Record. Lives in `docs/adr/` so that future
> stages and reviews read it and do not re-litigate a settled decision.

- **Status:** Accepted
- **Date:** 2026-06-07
- **Deciders:** tel@tarento.com (with Claude as Planner)
- **Relates to:** Spec `specs/knowledge-platform-phase-3/spec.md` R1/R2/R3/C2;
  Plan `D1`; the locator-DB opportunity in `docs/improvements.md`; builds on
  ADR-0001 (Postgres) and ADR-0002/0003 (embedder + hybrid matching)

## Context

The Healer agent repairs failing specs by editing files in the workspace and
re-running until green; its only structured output is `{toolCalls, isError}`
(`src/orchestrator/stages.ts`). The _fix itself_ — which brittle locator became
which resilient one, what failure it resolved — is never captured. So Run B
regenerates the spec from scratch and the Healer re-discovers the identical fix,
burning Anthropic API calls and wall-clock on a solved problem
(`docs/improvements.md`). Phase 3 needs to **capture how each issue was fixed** so
the Healer (and Generator) can reuse it. The question is _how_ to capture a fix
without destabilizing the run hot-path or the agent.

## Decision

We will capture heals **deterministically by diffing the pre-heal spec files
against the post-heal spec files** at the orchestrator seam (both states are
already in hand in `orchestrate.ts`: the generated specs, and the healed specs
re-read after `healTests`). A pure `captureHealDeltas(pre, post, results)` emits
one append-only `HealingEvent` per changed locator — `{failureSignature, before,
after, strategy, outcome}` — where `strategy` comes from a rule-based classifier
and `failureSignature` from a normalizer over `failure_reason`. Events are
persisted via migration `0003` (`healing_events`, with a `failure_embedding
vector(384)` + HNSW index), embedded best-effort at ingest (reusing the Phase 2
embedder + content-hash cache), and retrieved with the **same hybrid lexical-OR-
semantic matcher** as Phase 2. **The Healer agent is not changed, and no new LLM
call runs on the hot-path.**

## Alternatives considered

- **Structured heal-log from the Healer agent.** Have the Healer emit a JSON
  record of each fix. Rejected as the primary path: it changes the agent's
  contract, couples capture to the agent's per-run output (which is non-
  deterministic and can be incomplete), and adds parsing brittleness. Diffing the
  files we already have is deterministic and agent-agnostic.
- **Parse the agent transcript / tool calls.** Reconstruct the fix from the
  Healer's `toolCalls`. Rejected: brittle, format-coupled, and lossy versus a
  direct before/after file diff.
- **Store only the healed code, no delta.** We already keep the final spec.
  Rejected: the _delta_ (what was brittle → what worked, and for which failure) is
  exactly the reusable signal; the final code alone doesn't tell the Generator
  what pattern to avoid.
- **Pure-semantic or exact-signature-only precedent match.** Rejected: pure-
  semantic loses the lexical fallback (breaks the additive guarantee when
  embeddings are absent); exact-signature-only misses paraphrased failures.
  Hybrid OR (reusing ADR-0003's matcher) keeps both.

## Consequences

- **Easier:** no Healer-agent change; capture is a pure, unit-testable function;
  no hot-path LLM cost; reuses the proven Phase 2 embedder, cache, HNSW, and
  hybrid matcher; precedents make repeat heals faster and let the Generator emit
  resilient locators first time (the locator DB from `docs/improvements.md`).
- **Harder / cost:** a file diff can misattribute an edit if the Healer changed
  more than the failing locator in a file — mitigated by line-scoped diff hunks,
  a strategy-classifier confidence, and storing raw `before`/`after` for audit.
  Failure signatures depend on `failure_reason` text being consistent — mitigated
  by a tunable normalizer and the lexical+semantic hybrid tolerating variation.
- **Safety position:** every new read is best-effort (`withKb`); with the KB or
  embeddings absent, capture and retrieval no-op and the pipeline behaves exactly
  as Phase 2 — never throws, never worse (Spec R13/N2).

## Re-litigation guard

Do **not** re-propose "just have the Healer emit a structured fix log" or "parse
the agent transcript" in future reviews. Diff-based capture was chosen
deliberately so capture stays deterministic, agent-agnostic, and off the hot-path
LLM. Revisit only if the Healer's edits stop being attributable from file diffs
(e.g. it begins rewriting whole files), at which point a structured heal-log
becomes a planned change — not a fresh debate. The precedent match stays **hybrid
and a successful-heal-only** signal; do not weaken it to recommend fixes from runs
that did not pass.
