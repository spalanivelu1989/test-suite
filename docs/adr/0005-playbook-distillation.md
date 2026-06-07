# ADR-0005 — Off-hot-path playbook distillation with a trust gate

> A durable Architecture Decision Record. Lives in `docs/adr/` so that future
> stages and reviews read it and do not re-litigate a settled decision.

- **Status:** Accepted
- **Date:** 2026-06-07
- **Deciders:** tel@tarento.com (with Claude as Planner)
- **Relates to:** Spec `specs/knowledge-platform-phase-3/spec.md` R9/R10/R11/R12/C3/C4/C5;
  Plan `D3/D4/D5`; `docs/knowledge-platform-architecture.md` §3.6/§4.2; builds on
  ADR-0004 (healing memory)

## Context

Phase 3 must turn many raw episodes (healings, failures, successes) into reusable
**principles** — "playbooks" like "`networkidle` waits flake on SPA routes; use
explicit element waits" — that the Planner, Generator, and Healer read on every
future run, so the agents grow more knowledgeable over time
(`docs/knowledge-platform-architecture.md` §3.6). Two risks dominate: (1) doing
this work **inline** would couple run latency to an open-ended clustering/LLM step
on the hot-path; (2) an LLM that summarizes episodes can **hallucinate a
plausible-but-wrong principle**, and injecting unverified lore into prompts would
degrade every downstream run. We need a design that is cheap on the hot-path and
keeps bad principles out of agent prompts.

## Decision

We will distill playbooks in a **separate, off-hot-path, incremental CLI job**
(`bin/knowledge-distill.ts`, like the Phase 2 backfill), driven by a stored
watermark so re-runs with no new episodes are no-ops. The job **clusters
deterministically** (failure-signature embedding cosine + strategy) and uses an
LLM **only to summarize a bounded cluster** into `{principle, antipattern,
recommendation}` (via the existing `createClaudeClient`), with a **deterministic
strategy-template fallback** when no `ANTHROPIC_API_KEY` is configured. Every
playbook stores `evidenceRunIds` and starts `status='episodic'`. A **trust gate**
governs use: **only `status='trusted'` playbooks are ever injected** into prompts;
promotion is rule-based (`supportCount ≥ N` with no contradicting evidence) or
manual, and contradiction **re-weights/demotes, never deletes** (provenance is
retained). Injection is **token-budgeted** and scoped to the app + stage.

## Alternatives considered

- **Distill inline at run end.** Rejected: couples run latency to LLM clustering;
  a run should never wait on learning (Spec N3). The off-path CLI keeps the hot-
  path clean and makes re-runs idempotent via the watermark.
- **LLM-free templating only.** Generate principles purely from the dominant
  strategy with no LLM. Rejected as the default: the principles are thin and miss
  cross-episode insight. Kept as the **no-key fallback** so the job always works.
- **LLM-per-episode.** Summarize every episode individually. Rejected: cost
  blow-up and noisy, redundant principles; clustering first bounds cost to the
  number of clusters and yields generalizable lessons.
- **Inject all playbooks (no trust gate).** Rejected: this is the central risk —
  a hallucinated or fragile principle would reach every prompt. The
  episodic→trusted gate (evidence + support count) keeps unverified lore out
  while still letting memory accumulate.
- **Manual curation only.** Rejected as the default: doesn't scale and defeats
  "agents learn automatically." Manual approval is retained as an override on top
  of auto-promotion.

## Consequences

- **Easier:** the run hot-path issues zero distillation/LLM calls (N3); re-runs
  are idempotent (watermark); principles are good when a key exists and still
  produced (templated) when it doesn't; the trust gate guarantees only evidence-
  backed lore reaches prompts (N6); contradiction handling keeps the corpus self-
  correcting without losing audit history.
- **Harder / cost:** needs a scheduler or manual trigger to run the CLI (it is not
  automatic at run end); the LLM summarizer can still produce a weak principle —
  bounded by the trust gate, the M3 ≥90% precision review, and the template
  fallback; clustering/promotion thresholds (`N`, cosine cut) must be calibrated
  and recorded (Spec R16).
- **Safety position:** `getPlaybooks` and injection are best-effort (`withKb`);
  with the KB disabled, embeddings absent, or nothing yet `trusted`, prompts are
  identical to Phase 2 — never throws, never worse (Spec R13/N2).

## Re-litigation guard

Do **not** re-propose "distill inline at run end" or "inject all playbooks without
a trust gate" in future reviews. Off-hot-path distillation was chosen so a run
never waits on learning, and the trust gate exists specifically to keep
hallucinated/fragile principles out of agent prompts — both are load-bearing for
the "never worse than Phase 2" guarantee. The LLM summarizer stays **bounded to a
cluster with a deterministic fallback**; do not move to per-episode LLM calls or
make the LLM mandatory. Revisit only if a real scheduler makes near-real-time
distillation worthwhile _and_ the trust gate is preserved.
