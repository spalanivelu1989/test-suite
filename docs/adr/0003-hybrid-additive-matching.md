# ADR-0003 — Hybrid (lexical OR semantic), additive-only matching

> A durable Architecture Decision Record. Lives in `docs/adr/` so future stages
> and reviews read it and do not re-litigate a settled decision.

- **Status:** Accepted
- **Date:** 2026-06-05
- **Deciders:** tel@tarento.com (with Claude as Interviewer/Planner)
- **Relates to:** Spec `specs/knowledge-platform-phase-2/` R5/R8/N3/C3/C4; Plan `D2`

## Context

Phase 2 adds semantic matching to the existing lexical `reuse | extend | new`
decision. How the two signals combine determines both the recall win and the
risk. The decision must raise recall (catch paraphrases) without (a) regressing
Phase 1 behavior or (b) over-merging (marking genuinely-new scenarios as reuse,
masking coverage gaps).

## Decision

Matching is **hybrid and additive**: a scenario is `reuse`/`extend` when
**lexical OR semantic** clears its respective threshold (max recall), still
**erring to `new`** when uncertain, with `reuse` requiring the matched spec's last
run passed. When embeddings are absent/failed, semantic score = 0, so the
decision is **identical to Phase 1 lexical** (additive-only — never worse).

## Alternatives considered

- **Replace lexical with pure semantic.** Rejected: throws away a cheap, precise,
  deterministic signal; would regress on exact/near-exact wording; and a single
  model becomes a single point of failure with no fallback.
- **Weighted blend (`α·lex + β·sem`).** Rejected for now: couples two signals on
  different scales into one tunable that's harder to reason about and calibrate;
  OR-of-thresholds is simpler, independently calibratable, and trivially proves
  the "never worse than Phase 1" property. Revisit only if OR over-merges.
- **Semantic as a gate over lexical (AND).** Rejected: would _reduce_ recall below
  lexical (the opposite of the goal) and could downgrade a Phase-1 reuse.

## Consequences

- **Easier:** the additive-safety guarantee (R8/N3) is provable by setting
  embeddings off and diffing against the lexical decider; each threshold is tuned
  independently; semantic only ever _adds_ reuse/extend.
- **Harder:** OR-logic can over-merge if the semantic threshold is too loose —
  hence the paired precision guardrail (M2 ≤5% false-reuse) and the err-to-`new`
  - last-passed rules.

## Re-litigation guard

Do **not** re-propose "replace lexical with pure semantic" or "AND-gate the two."
The OR/additive design is the load-bearing safety contract: Phase 2 must never
behave worse than Phase 1, and that property depends on semantic being purely
additive recall with an independent threshold. A weighted blend may be revisited
**only** if calibration shows OR-of-thresholds over-merges beyond the M2 bar.
