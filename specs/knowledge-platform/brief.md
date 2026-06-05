# Brief — Knowledge-Driven Testing Platform · Phase 1 (History-Aware Planner + Generator)

> Stage 1 (Clarify) deliverable. One page. Frames the problem before any spec.
> Phase 1 of a larger platform mapped in `docs/knowledge-platform-architecture.md`.

- **Status:** Approved
- **Date:** 2026-06-05
- **Author:** tel@tarento.com (framed with Claude as Interviewer)

---

## Problem

Every test run today is amnesiac. The agents (Planner → Generator → Validator →
Healer → Reporter) start from scratch on every run: per-run artifacts are written
under `.runs/<id>/` and then forgotten. Re-running the same app re-explores the
same pages and re-plans flows already tested last time — wasted effort, no sense
of "what we already know about this app." Without a memory, none of the bigger
goals (reuse, dedupe, learn-from-fixes) are even possible.

## Business goal

Lay the foundation for a knowledge-driven testing platform by giving the pipeline
a **persistent, queryable memory of past runs**. Phase 1 proves the keystone
capability — _the system can recognize what it has already tested for an app and
act on it_ — which every later phase (richer reuse, healing memory, multi-agent)
builds on. Winning = the **Planner** stops being blind to history (explores gaps,
not knowns) **and** the **Generator** stops re-creating tests that already exist
(reuse/extend/new instead of regenerate).

## Why now

The validation stage (Spec v0.3.0) just made generated-test _quality_ observable;
the natural next lever is making test _history_ reusable. The architecture is
already mapped and the integration seams exist (run-completion for ingest, prompt
assembly for retrieval), so the foundational slice is cheap to land now and
unblocks the rest of the roadmap.

## Audience

Internal — the **agents themselves** are the first consumers (the Planner reads an
app profile to focus on gaps; the Generator reads existing specs to avoid
duplicates), and the dev/QA team who run the tool benefits from less duplicate
exploration and a cleaner, non-redundant suite. Job-to-be-done: "When I test an
app I've tested before, don't start from zero or re-create tests I already have —
know what's already covered and build only what's missing."

## Success — observable

**Primary metric — coverage-detection accuracy (Planner).** On a _second_ run of
tarento.com, the Knowledge Base must correctly identify which of the 10 curated
primary flows (`fixtures/tarento-flows.json`) were already covered by the first
run: **≥90% recall and ≥80% precision** against that hand-labeled set.
**Primary metric — duplicate-avoidance (Generator).** On that second run, the
Generator **regenerates ≤20% of already-covered flows** (i.e. ≥80% correctly
skipped or reused via the reuse/extend/new decision), measured by lexical
matching. **Secondary gate — ingestion reliability:** 100% of completed runs are
ingested and queryable, and the index is rebuildable by replaying `ingestRun` over
the artifact log. (The Spec formalizes these as M1/M2/M3.)

## Constraints

- **New storage dependency: PostgreSQL** (managed/serverless — **Neon**; per-dev
  Neon branch; one env var `KNOWLEDGE_DATABASE_URL`). Phase 1 uses **structured
  tables + `edges` + `JSONB` only — no embeddings/pgvector** (that's Phase 2).
- **Graceful degradation is non-negotiable:** ingestion/retrieval are best-effort
  and **never throw** (mirrors `runManager/persistence.ts` "log, never throw"); a
  run must complete even if the KB is unreachable. Execution never depends on the KB.
- **Knowledge/Execution separation:** new `src/knowledge/` `KnowledgeService`;
  the existing pipeline is touched only at three seams — `ingestRun(report)` at run
  completion, a **Planner** context pack, and a **Generator** context pack +
  per-scenario `reuse | extend | new` decision, both in `src/orchestrator/stages.ts`.
- **Generator dedupe is lexical-only this slice:** the reuse/extend/new decision
  uses `coverage.ts` token-overlap, **not embeddings**. Paraphrased duplicates
  (same intent, different words) are knowingly out until Phase 2.
- **App identity = normalized origin** (scheme+host, drop `www`, ignore
  path/query); pages live at the Page level under an App.
- Reuse `src/coverage/coverage.ts` (`norm`/`significantTokens`) for coverage
  matching; `RunReport` is the ingestion payload (no new artifact schema).

## Out of scope

- **Embeddings / semantic (paraphrase-robust) dedupe** (Phase 2), \*\*healing memory
  - playbooks** (Phase 3), **graph DB / Neo4j / governance / multi-agent\*\* (Phase 4).
- **Healer** knowledge consumption — Phase 1 wires the **Planner** and **Generator**
  only; the Healer is untouched.
- **No backfill** of existing `.runs/*` — new runs only from migration forward
  (re-run tarento.com once to seed history for the metric).
- **No user-facing UI** — Phase 1 is pipeline-internal (KnowledgeService API +
  Planner/Generator injection); a coverage view is a later slice.

## Prior art

Internal: the v0.1.0→v0.3.0 build already established the event-sourced-ish
substrate (`.runs/`, `ProgressEvent`, `RunReport`) this depends on, and
`coverage.ts` already does flow matching. External: agent-memory frameworks
(LangChain/Mem0/Letta) were evaluated and **rejected** in the RFC in favor of an
in-house `KnowledgeService` over Postgres (less abstraction fighting the Claude
Agent SDK pipeline).

## Risks

- **Constitution departure:** adding a database breaks the de-facto "no DB,
  in-memory + best-effort disk" posture (rule 3, "keep it simple"). Deliberate
  trade for the platform's concurrency/multi-agent future — must be ratified in
  the Spec, not assumed. Serverless Postgres keeps ops near-zero.
- **Metric attainability:** `coverage.ts` token-overlap matching may not hit
  ≥90%/≥80% without tuning, and it's known to over-credit generic tokens
  (`implementation-notes.md`, 2026-05-27). The labeled tarento set must be defined
  precisely so both Planner and Generator metrics are honest.
- **Lexical-only recall:** the Generator's reuse/extend/new decision will miss
  paraphrased duplicates (same intent, reworded). Accepted for this slice; Phase 2
  embeddings raise recall. The ≤20%-duplicate bar is measured on lexical matches.
- **Over-aggressive reuse:** if the reuse threshold is too loose, the Generator
  skips a flow that wasn't really covered → a coverage gap masked as "reused". The
  reuse/extend/new threshold must err toward "new" when uncertain (tune in Record).
- **Seeding:** with no backfill, the metrics need two real tarento.com runs
  (needs `ANTHROPIC_API_KEY` + Playwright CLI) before they can be measured.
- **Scope creep:** "knowledge platform" invites pulling Phase 2–4 work forward;
  the slice must stay Planner+Generator, structured/lexical-only, no Healer.

---

## Open questions

- **Q1:** Exact labeling of the 10 curated flows as "covered by run 1" — by flow
  id, by tested spec title overlap, or manual tag? (Resolve in Record; defines the
  denominator for **both** the coverage-detection and duplicate-avoidance metrics.)
- **Q2:** The `reuse | extend | new` threshold (token-overlap score that counts a
  scenario as already-covered), tuned to err toward "new" when uncertain. (Record.)
- **Q3:** Where the App profile / Generator context pack get size-bounded so they
  never bloat the agent prompts. (Token budget — Record/Assemble.)
- **Q4:** Migration ownership & runner (e.g. `node-pg-migrate`/Drizzle, run on
  deploy vs. on boot) — mechanics deferred to Assemble.

---

_Stage 1 (Clarify) artifact. Approve at the Human Gate, then proceed to
`/craft-framework:record`. Keep this to ONE page._
