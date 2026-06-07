# Spec — Knowledge Platform · Phase 3 (Healing Memory & Playbook Distillation)

> Stage 2 (Record) deliverable. The single source of truth and contract for
> everything that follows: **if it isn't in this Spec, it doesn't get built.**
> Describes WHAT "done" means, never HOW to build it (that is Stage 3).

- **Version:** v0.1.0
- **Status:** Approved
- **Source Brief:** `specs/knowledge-platform-phase-3/brief.md`
- **Last updated:** 2026-06-07

---

## Overview

Phase 3 makes the agents **learn from how they fix problems and what succeeds**.
It adds two capabilities on top of the shipped Phase 1/2 Knowledge Layer:

1. **Healing memory** — capture every Healer fix as a structured, append-only
   `HealingEvent` (failure signature, before/after snippet, repair strategy,
   outcome), reconstructed **deterministically by diffing pre-heal vs post-heal
   spec files** (no change to the Healer agent, no hot-path LLM call). Retrieve
   precedents for similar failures and feed them to the **Healer** (stop
   re-solving solved failures) and to the **Generator** as resilient-locator
   hints (write better specs first time).
2. **Playbook distillation** — an **off-hot-path** batched job clusters recurring
   healings/failures/successes and distills them into **playbooks**: generated,
   evidence-linked principles ("`networkidle` waits flake on SPA routes"). A
   **trust gate** keeps unverified lore out of prompts; only `trusted` playbooks
   are injected, token-budgeted, into the Planner/Generator/Healer.

The change is strictly **additive**: when the KB is unavailable, embeddings are
absent, or no playbooks are trusted, every agent behaves exactly as Phase 2 —
never throws, never worse. Background: `docs/knowledge-platform-architecture.md`
§3.6/§4.2; `docs/improvements.md`.

## Requirements

| ID  | Requirement (what the result must do)                                                                                                                                                                                                                                                                                                                            | Priority |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| R1  | **Capture heals deterministically.** Reconstruct each fix by diffing the pre-heal spec files against the post-heal spec files (both available in `orchestrate.ts`) into `HealingEvent`s — `{runId, appId, flowId, file, failureSignature, before, after, strategy, outcome}`. No change to the Healer agent; no hot-path LLM call.                               | Must     |
| R2  | **Classify repair strategy** with a deterministic, rule-based classifier over the diff, into a closed `HealStrategy` set (`role-locator`, `regex-text`, `wait-visibility`, `assertion-fix`, `fixme`, `other`). Unknown → `other` (never throws).                                                                                                                 | Must     |
| R3  | **Normalize the failure signature** from `test_results.failure_reason` into a stable key (strip line numbers, timestamps, dynamic ids) so equivalent failures collapse to one signature.                                                                                                                                                                         | Must     |
| R4  | **Persist healing events** via additive migration `0003`: a `healing_events` table with a `failure_embedding vector(384)` column + HNSW cosine index. Ingestion is idempotent by `runId` (delete-by-run then insert, matching `persistRun`).                                                                                                                     | Must     |
| R5  | **Embed the failure signature at ingest**, cached and best-effort (reuse the Phase 2 embedder + cache pattern); an embed failure leaves a null embedding and never blocks ingestion.                                                                                                                                                                             | Must     |
| R6  | **Retrieve healing precedents** — `getHealingPrecedents(failure)` returns the top-k **successful** prior heals for a similar failure, app-scoped, via **hybrid** match (lexical signature overlap OR semantic cosine), reusing the Phase 2 matcher.                                                                                                              | Must     |
| R7  | **Feed precedents to the Healer:** before healing, inject matched precedents (strategy + before→after) into the Healer prompt. Best-effort and token-budgeted; absent precedents change nothing.                                                                                                                                                                 | Must     |
| R8  | **Feed locator hints to the Generator:** derive resilient-locator hints from accumulated successful heals for the app and inject them into the Generator's context pack so new specs avoid known-brittle patterns.                                                                                                                                               | Must     |
| R9  | **Distill playbooks off the hot-path** — a batched, **incremental** (watermarked) CLI job (`bin/knowledge-distill.ts`) clusters recent healing events / failures / successes and writes `playbooks` rows with `{principle, antipattern?, recommendation, scope, evidenceRunIds, supportCount, embedding, status}`. A second run with no new episodes is a no-op. | Must     |
| R10 | **Cluster deterministically** (failure-signature embedding cosine + strategy), with the **LLM used only to summarize a bounded cluster** into a principle (reuse `createClaudeClient`); a **deterministic strategy-template fallback** produces a principle when no API key is configured.                                                                       | Must     |
| R11 | **Trust gate:** new playbooks are `status='episodic'`; only `status='trusted'` playbooks are ever injected into prompts. Promotion is rule-based (support ≥ N, no contradicting evidence) or manual; promotion is re-weighting, never deletion.                                                                                                                  | Must     |
| R12 | **Retrieve + inject playbooks** — `getPlaybooks(scope)` returns relevant `trusted` playbooks; `assembleContext` injects a **token-budgeted** "Learned principles" block scoped to the app + stage into the Planner/Generator/Healer prompts.                                                                                                                     | Must     |
| R13 | **Additive-only safety:** KB disabled / no embeddings / no trusted playbooks / distillation never run → the Planner, Generator, and Healer behave **identically to Phase 2** — never throws, never a worse outcome. New `KnowledgeService` methods return empties when disabled.                                                                                 | Must     |
| R14 | **Provenance & audit:** every playbook stores `evidenceRunIds`; every healing event stores raw `before`/`after`. No principle exists without linked evidence.                                                                                                                                                                                                    | Must     |
| R15 | **Procedural playbooks from successful runs** — aggregate passing runs by app + crawl strategy into `scope='app'` procedural principles ("depth-1 standard covered 90% in 8 specs"). Surfaced as advice only (no auto-selection this phase).                                                                                                                     | Should   |
| R16 | **Calibrate** the precedent-match threshold and the playbook **promotion** rule (support N, contradiction handling) and **record** the chosen values (not guessed).                                                                                                                                                                                              | Should   |

## Scenarios

| ID   | Given / When                                                                             | Then (expected behavior)                                                                                                                                       | Covers     |
| ---- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| SC1  | A run heals a failing spec (brittle CSS → role locator)                                  | A `HealingEvent` is captured with `strategy='role-locator'`, `outcome='healed'`, and the before/after snippet from the diff; persisted under `runId`.          | R1,R2,R4   |
| SC2  | The same spec content is healed and the run is re-ingested (same `runId`)                | Ingestion is idempotent — healing events for that run are replaced, not duplicated.                                                                            | R4         |
| SC3  | Two runs report the "same" timeout failure with different dynamic element ids            | Both normalize to one `failureSignature` (ids/line numbers/timestamps stripped).                                                                               | R3         |
| SC4  | A 2nd run hits a failure semantically similar to a prior **successful** heal             | `getHealingPrecedents` returns that heal first (app-scoped); the Healer prompt includes its strategy + before→after.                                           | R5,R6,R7   |
| SC5  | The Generator builds a spec for a flow with a known brittle-locator heal history         | The Generator context pack includes a resilient-locator hint for that flow; the new spec avoids the brittle pattern.                                           | R8         |
| SC6  | An embed call throws while embedding a failure signature at ingest                       | The event is stored with a null `failure_embedding`; ingestion still commits; precedent match degrades to lexical for it.                                      | R5,R13     |
| SC7  | The distillation job runs over recent episodes with a recurring SPA-wait failure cluster | A `playbook` is written: principle ("`networkidle` flakes on SPA routes"), recommendation, `evidenceRunIds`, `supportCount≥cluster size`, `status='episodic'`. | R9,R10,R14 |
| SC8  | The distillation job runs again with no new episodes                                     | It is a no-op (watermark unchanged); no duplicate playbooks.                                                                                                   | R9         |
| SC9  | No `ANTHROPIC_API_KEY` is configured when distillation runs                              | Clustering still runs; each cluster gets a **deterministic strategy-template** principle; the job completes.                                                   | R10        |
| SC10 | A playbook reaches `supportCount ≥ N` with no contradicting evidence                     | It is promoted to `status='trusted'`.                                                                                                                          | R11,R16    |
| SC11 | A new (still `episodic`) playbook exists                                                 | It is **NOT** injected into any agent prompt; only `trusted` ones are.                                                                                         | R11,R12    |
| SC12 | A run executes with trusted playbooks present for the app                                | The Planner/Generator/Healer prompts carry a token-budgeted "Learned principles" block scoped to the app + stage.                                              | R12        |
| SC13 | The KB is disabled (no `databaseUrl`) on a run                                           | No heal capture, no precedents, no playbooks injected; the pipeline runs exactly as Phase 2 — no error.                                                        | R13        |
| SC14 | All embeddings unavailable (no model) during a run and distillation                      | Precedent match + clustering degrade to lexical/strategy-only; agents behave as Phase 2; no error.                                                             | R13        |
| SC15 | Several passing runs of one app used depth-1 standard mode at high coverage              | A procedural `scope='app'` playbook records the strategy + observed coverage; surfaced as advice (not auto-applied).                                           | R15        |
| SC16 | A trusted playbook later gets contradicting evidence (a heal it recommended regressed)   | It is **re-weighted** (confidence down / demoted), never silently deleted; provenance retained.                                                                | R11,R14    |

## User experience

Phase 3 ships **no new GUI**; the consumers are the agents, and the operator
observes through the existing live progress stream and the off-hot-path CLI.

- **Primary journey (repeat run):** An operator re-runs an app. The Healer's event
  stream now shows `🩹 Applying 2 known fixes (precedent)` where it previously
  cold-solved, and finishes healing in fewer iterations. The Generator's stream
  shows `🧠 3 learned principles applied`. The suite reaches green faster.
- **Distillation journey (operator/cron):** `npm run knowledge:distill` runs off
  the hot path and prints `distilled N playbooks (M promoted to trusted)`.
- **Three states — each is a design:**
  - **Learning-active (warm):** healing events + trusted playbooks present →
    precedents and principles injected; richer event stream.
  - **Capturing-only:** events captured but nothing trusted yet → behaves as
    Phase 2 for prompts; memory is accumulating silently.
  - **Degraded:** KB down / no embeddings / no playbooks → identical to Phase 2,
    plus a single logged notice. The run never fails or changes outcome.
- **UX principle — no silent magic, no unverified lore:** every injected precedent
  or playbook is evidence-linked and surfaced on the stream; only `trusted`,
  evidence-backed principles are ever used.

## Constraints

| ID  | Constraint                                                                                                                                                                                |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | Storage = additive migration `0003`: `healing_events` + `playbooks` tables, each with a `vector(384)` column + HNSW **cosine** index. Reuses the Phase 2 embedder/dimension (no new dim). |
| C2  | Heal capture = **deterministic diff** of pre/post-heal spec files + rule-based strategy classifier. **No Healer-agent change; no hot-path LLM call.**                                     |
| C3  | Distillation = **off the hot-path**, batched, **incremental (watermarked)** CLI (`bin/knowledge-distill.ts`), like the Phase 2 backfill. A run never waits on it.                         |
| C4  | The **only** new LLM use is the cluster→principle summarizer (`createClaudeClient`), off-hot-path, bounded; a deterministic strategy-template fallback covers the no-key case.            |
| C5  | **Trust gate:** only `status='trusted'` playbooks are injected; injection is **token-budgeted**; promotion re-weights, never deletes.                                                     |
| C6  | **Additive-only / graceful degradation** (extends Phase 1 R4/N3 + Phase 2 R8): never throws, never a worse outcome than Phase 2.                                                          |
| C7  | **Reuse existing seams** — extend `extract.ts`, `persistRun`/`repo.ts`, `ingestRun.ts`, `coverageDecision`/`contextPack`, `KnowledgeService`, `stages.ts`; do not re-architect.           |
| C8  | Must respect `CONSTITUTION.md`: simplicity, determinism over flakiness (capture + clustering are deterministic; the LLM only narrates a fixed cluster), nothing ships unverified.         |

## Assumptions

| ID  | Assumption                                                                                                            | If wrong → impact                                                                         |
| --- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| A1  | Pre/post-heal spec file diffs are reliably attributable to the heal (Healer edits are localized to the failing spec). | Misattributed fixes; mitigate with line-scoped diffs + classifier confidence + raw audit. |
| A2  | `failure_reason` text is consistent enough that normalization yields stable signatures.                               | Signatures fragment; precedent recall drops; need a richer normalizer.                    |
| A3  | bge-small cosine separates "same failure class" from "different failure" well enough for precedent retrieval.         | Precedents mismatch; tighten threshold or add strategy as a hard filter.                  |
| A4  | A bounded cluster summarized by Claude yields a correct, generalizable principle ≥90% of the time (M3).               | More clusters fall back to templates; trust gate + review catch bad ones.                 |
| A5  | Per-app healing-event volume stays modest enough for in-job clustering within batch caps.                             | Need batching/candidate caps in the distillation job.                                     |
| A6  | "Last run passed and stayed passing" is a sufficient signal that a heal is good enough to recommend.                  | Fragile fixes propagate; M2 guardrail + contradiction re-weighting catch them.            |

## Non-functional requirements

| ID  | NFR (system quality)                   | Target (measurable)                                                                                    | How measured                                                                               |
| --- | -------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| N1  | **Hot-path overhead (capture)**        | heal capture + event persistence adds ≤ **200 ms** to ingestion (no LLM, local diff)                   | Time ingestion with/without capture; assert ≤200 ms added.                                 |
| N2  | **Additive safety (no regression)**    | with learning disabled, Planner/Generator/Healer prompts + decisions are **identical** to Phase 2      | Diff prompts/decisions with Phase 3 features off vs Phase 2 over fixed inputs = identical. |
| N3  | **Distillation is off-hot-path**       | a normal run issues **zero** distillation/LLM-summarizer calls; distillation runs only via the CLI     | Assert no summarizer call in the run path; only the CLI triggers it.                       |
| N4  | **Precedent retrieval latency (warm)** | `getHealingPrecedents` ≤ **300 ms** with the model warm                                                | Time the call warm; assert ≤300 ms.                                                        |
| N5  | **Idempotency**                        | re-ingest same `runId` → no duplicate healing events; re-run distillation with no new episodes → no-op | Count rows after a second run; assert unchanged.                                           |
| N6  | **Trust isolation**                    | **0** `episodic` playbooks appear in any agent prompt                                                  | Inspect assembled prompts; assert only `trusted` injected.                                 |

## Dependencies

| ID   | Dependency                                                                                          | Type                  | Owner | Status                    |
| ---- | --------------------------------------------------------------------------------------------------- | --------------------- | ----- | ------------------------- |
| DEP1 | Phase 1 Knowledge Platform (shipped) — `persistRun`, `ingestRun`, `KnowledgeService`, `edges`       | Sequencing            | Team  | Done (merged to main)     |
| DEP2 | Phase 2 (shipped) — `Embedder`/`LocalEmbedder`, `cosineSim`, hybrid matcher, pgvector + HNSW        | Sequencing            | Team  | Done (merged to main)     |
| DEP3 | Pre/post-heal spec snapshots available at the orchestrator seam (`orchestrate.ts`)                  | Technical             | Team  | Available (verify)        |
| DEP4 | A labeled **recurring failure→fix** set derived from the curated tarento flows (M1/M3 ground truth) | Sequencing / Team     | Team  | To build (before metrics) |
| DEP5 | `ANTHROPIC_API_KEY` for the distillation summarizer (optional — template fallback otherwise)        | Technical             | User  | Optional                  |
| DEP6 | Repeat tarento.com runs producing recurring heals to measure M1/M2/M3                               | Sequencing / External | User  | Open                      |

## Success metrics

| ID  | Metric (outcome that should move)   | Baseline       | Target   | How measured                                                                                                    |
| --- | ----------------------------------- | -------------- | -------- | --------------------------------------------------------------------------------------------------------------- |
| M1  | **Heal-precedent reuse**            | 0% (no memory) | **≥60%** | On recurring failure→fix pairs, % of heals resolved via a matched precedent (fewer Healer iterations vs cold).  |
| M2  | **Bad-fix propagation** (guardrail) | n/a (new)      | **≤5%**  | Of specs emitted using a hint/playbook, % that regress (introduce a first-run failure the hint should prevent). |
| M3  | **Trusted-playbook precision**      | n/a (new)      | **≥90%** | Of `trusted` playbooks, % judged correct/actionable on human review.                                            |

## Acceptance criteria

| ID   | Acceptance criterion (observable / testable)                                                                                                                                                               | Verifies     |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| AC1  | Given pre/post-heal spec sets, `captureHealDeltas` (pure) emits one `HealingEvent` per changed locator with correct before/after + outcome.                                                                | R1           |
| AC2  | The strategy classifier maps a role-locator swap → `role-locator`, a regex text fix → `regex-text`, an added visibility wait → `wait-visibility`, a `test.fixme()` → `fixme`, and anything else → `other`. | R2           |
| AC3  | Two failure_reason strings differing only in dynamic ids/line numbers/timestamps normalize to the **same** signature.                                                                                      | R3           |
| AC4  | Migration `0003` creates `healing_events` + `playbooks` (+ `failure_embedding`/`embedding` vector(384) + HNSW); re-running is a no-op.                                                                     | R4,R9        |
| AC5  | Ingesting a healed run stores its events; re-ingesting the same `runId` replaces, not duplicates (idempotent).                                                                                             | R4,N5        |
| AC6  | With the embedder forced to throw, the event stores a null `failure_embedding` and ingestion still commits.                                                                                                | R5,R13       |
| AC7  | `getHealingPrecedents` returns the nearest **successful** prior heal for a paraphrased/equivalent failure, app-scoped (hybrid lexical OR semantic).                                                        | R6           |
| AC8  | With precedents present, the Healer prompt contains the matched strategy + before→after; with none, the prompt is unchanged from Phase 2.                                                                  | R7,N2        |
| AC9  | With heal history for a flow, the Generator context pack contains a resilient-locator hint for that flow.                                                                                                  | R8           |
| AC10 | `knowledge:distill` over a recurring-failure cluster writes a playbook with principle, `evidenceRunIds`, `supportCount`, `status='episodic'`.                                                              | R9,R10,R14   |
| AC11 | A second `knowledge:distill` with no new episodes is a no-op (no new/dup playbooks; watermark unchanged).                                                                                                  | R9,N5        |
| AC12 | With no `ANTHROPIC_API_KEY`, distillation still produces a deterministic strategy-template principle per cluster.                                                                                          | R10,SC9      |
| AC13 | A playbook with `supportCount ≥ N` and no contradicting evidence is promoted to `trusted`; one below N stays `episodic`.                                                                                   | R11,R16      |
| AC14 | Only `trusted` playbooks appear in any assembled prompt; `episodic` ones never do (inspected).                                                                                                             | R11,R12,N6   |
| AC15 | A run with trusted playbooks injects a token-budgeted "Learned principles" block scoped to app + stage into Planner/Generator/Healer.                                                                      | R12          |
| AC16 | With the KB disabled (and separately, embeddings disabled), prompts + decisions are **identical** to Phase 2; no error (regression guard).                                                                 | R13,N2       |
| AC17 | A passing-run aggregation produces a procedural `scope='app'` playbook recording the crawl strategy + observed coverage.                                                                                   | R15          |
| AC18 | A contradicted trusted playbook is re-weighted/demoted (not deleted); provenance retained.                                                                                                                 | R11,R14,SC16 |
| AC19 | Heal capture + event persistence adds ≤200 ms to ingestion; `getHealingPrecedents` ≤300 ms warm.                                                                                                           | N1,N4        |

> **Coverage rule:** every **Must** requirement (R1–R14) has ≥1 acceptance
> criterion; the **Should** requirements (R15, R16) are covered by AC17 and AC13.

## Out of scope

- Graph DB / Neo4j / recursive-CTE reasoning, governance, multi-agent (Phase 4).
- A user-facing playbook/heal-history UI (event-stream + CLI output only).
- Auto-applying a precedent patch without the Healer, or auto-selecting a crawl
  strategy from a procedural playbook (advice only this phase).
- Distilling validation findings beyond what the cluster job already ingests.

## Future vision

- **What this unlocks:** a locator DB and a living, evidence-linked playbook
  corpus — the substrate for Phase 4 graph reasoning ("which fixes relate to which
  components") and for auto-selecting crawl strategies from procedural memory.
- **Likely next steps (v2+):** auto-apply high-confidence precedents; procedural
  strategy auto-selection; a playbook/heal-history review UI; cross-app global
  playbooks; approval workflow with explicit human curation.
- **Deliberately deferred:** UI, auto-apply, graph reasoning, governance.

## Open questions

| ID  | Question                                                                                 | Status                             |
| --- | ---------------------------------------------------------------------------------------- | ---------------------------------- |
| Q1  | Composition/size of the labeled recurring failure→fix set for M1/M3.                     | Open (Record→build before measure) |
| Q2  | Precedent-match threshold + playbook promotion rule (support N, contradiction handling). | Open (Forge; record values)        |
| Q3  | Final `HealStrategy` taxonomy (closed set).                                              | Open (Record; start from 6 values) |
| Q4  | Do procedural (crawl-strategy) playbooks ship in 3b or defer to 3c?                      | Open (Assemble; lean defer)        |

---

## Change log

| Version | Date       | Change       | Reason |
| ------- | ---------- | ------------ | ------ |
| v0.1.0  | 2026-06-07 | Initial spec | —      |

---

_Stage 2 (Record) artifact. Approve at the Human Gate, then proceed to
`/craft-framework:assemble`. Must respect every rule in `CONSTITUTION.md`._
