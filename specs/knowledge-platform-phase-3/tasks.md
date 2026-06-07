# Tasks — Knowledge Platform · Phase 3 (Healing Memory & Playbooks)

> Stage 3 (Assemble) deliverable. The ordered, traceable build checklist that
> pairs with `plan.md`. Each task is small (one clear outcome).

- **Targets Spec version:** v0.1.0
- **Status:** Approved
- **Last updated:** 2026-06-07

**Legend:** `[ ]` todo · `[x]` done · `[P]` may run in parallel with other `[P]`
tasks at the same dependency level.

---

## Phase 3a — Healing memory

### T1 — [x] Types: HealingEvent, HealStrategy, HealingPrecedent [P]

- **Covers:** R1, R2, R6 (I1, I4)
- **Depends on:** —
- **Parallel:** yes
- **Done-when:** `types.ts` defines `HealStrategy` (closed set: `role-locator`, `regex-text`, `wait-visibility`, `assertion-fix`, `fixme`, `other`), `HealingEvent` (per I1), and `HealingPrecedent`; `getHealingPrecedents` is added to `KnowledgeService`; the disabled service returns `[]`; `tsc --noEmit` clean.

### T2 — [x] Failure-signature normalizer [P]

- **Covers:** R3
- **Depends on:** —
- **Parallel:** yes
- **Done-when:** `heal/signature.ts` `normalizeFailure(reason)` strips dynamic ids, line/column numbers, timestamps, and absolute paths to a stable key; unit-proven that two reasons differing only in those collapse to one signature (AC3).

### T3 — [x] Strategy classifier [P]

- **Covers:** R2
- **Depends on:** T1
- **Parallel:** yes
- **Done-when:** `heal/strategy.ts` `classifyStrategy(before, after)` returns the right `HealStrategy` for: role-locator swap, regex text fix, added visibility/explicit wait, assertion change, `test.fixme()`, and unknown→`other`; pure, table-driven tests (AC2); never throws.

### T4 — [x] captureHealDeltas (pure diff core)

- **Covers:** R1, N1
- **Depends on:** T1, T2, T3
- **Parallel:** no
- **Done-when:** `heal/captureHeal.ts` `captureHealDeltas(preSpecs, postSpecs, results)` emits one `HealingEvent` per changed locator (line-scoped before/after, `strategy`, `signature`, `outcome` healed|fixme); pure (no DB/LLM); carries the inline capture diagram; unit-proven over pre/post fixtures (AC1).

### T5 — [x] Migration 0003 (healing_events + playbooks) [P]

- **Covers:** R4, R9
- **Depends on:** —
- **Parallel:** yes
- **Done-when:** `store/migrations/0003_healing_playbooks.sql` creates `healing_events` (+ `failure_embedding vector(384)` + HNSW cosine index) and `playbooks` (+ `embedding vector(384)` + HNSW + `status`), plus a `distill_watermark` store; `npm run knowledge:migrate` applies it; re-running is a no-op (AC4).

### T6 — [x] extract: carry healingEvents

- **Covers:** R1, R3
- **Depends on:** T1, T2
- **Parallel:** no
- **Done-when:** `extract.ts` puts `healingEvents` on `ExtractedRun` (with `failureSignature` + lexical signature tokens) sourced from `report.healingEvents`; unit-proven the shape round-trips.

### T7 — [x] orchestrate: pre/post-heal snapshot → captureHealDeltas

- **Covers:** R1
- **Depends on:** T4
- **Parallel:** no
- **Done-when:** `orchestrate.ts` snapshots generated specs before `healTests`, re-reads healed specs after, calls `captureHealDeltas`, and attaches `report.healingEvents`; verified DEP3 (snapshots available) or snapshots into the workspace first; no behavior change when nothing healed.

### T8 — [x] repo + ingest: persist events, embed signature (best-effort, cached)

- **Covers:** R4, R5, R13, N5
- **Depends on:** T5, T6
- **Parallel:** no
- **Done-when:** `persistRun` writes `healing_events` (DELETE-by-run then INSERT — idempotent); `ingestRun` embeds each signature via cache-or-`withKb(embed)` (null on failure, ingestion still commits); carries the inline embed-at-ingest diagram (AC5/AC6).

### T9 — [x] repo: findHealingPrecedents + getHealingPrecedents core

- **Covers:** R6
- **Depends on:** T1, T8
- **Parallel:** no
- **Done-when:** `retrieve/healingPrecedents.ts` selects top-k **successful** prior heals by `max(lexical, semantic)` ≥ threshold, app-scoped (pure core, fake-embedder testable); `repo.findHealingPrecedents` provides HNSW candidate fetch; `index.ts` exposes `getHealingPrecedents` (best-effort, `[]` when disabled) (AC7).

### T10 — [x] Wire precedents into Healer + locator hints into Generator

- **Covers:** R7, R8, N2
- **Depends on:** T9
- **Parallel:** no
- **Done-when:** `stages.ts`/`contextPack.ts` inject matched precedents (strategy + before→after) into the Healer prompt and `locatorHints` into the Generator pack; both best-effort and token-budgeted; with none present the prompts are byte-identical to Phase 2 (AC8/AC9).

### T11 — [x] 3a unit tests: capture, classifier, normalizer, precedent, no-regression [P]

- **Covers:** R1, R2, R3, R6, R13, N1, N2
- **Depends on:** T4, T9, T10
- **Parallel:** yes
- **Done-when:** `tsx --test` (no DB/LLM): `captureHealDeltas` (AC1), `classifyStrategy` (AC2), `normalizeFailure` (AC3), hybrid precedent selection (AC7), and **features-off ⇒ prompts identical to Phase 2** (AC16/N2); capture+persist ≤200 ms (N1).

### T12 — [x] 3a integration tests vs pgvector DB [P]

- **Covers:** R4, R5, R6, N4, N5
- **Depends on:** T8, T9
- **Parallel:** yes
- **Done-when:** against a pgvector test DB: ingest→persist events; re-ingest same `runId` → no duplicates (AC5); embedder-throws → null embedding, ingest commits (AC6); `findHealingPrecedents` ranks the matching successful heal first, app-scoped (AC7); warm retrieval ≤300 ms (N4). Deterministic embedder.

## Phase 3b — Playbook distillation

### T13 — [x] Types: Playbook, PlaybookScope; ContextPack extension [P]

- **Covers:** R9, R12 (I3, I6)
- **Depends on:** —
- **Parallel:** yes
- **Done-when:** `types.ts` adds `Playbook`, `PlaybookScope`, `getPlaybooks` on `KnowledgeService` (disabled → `[]`), and optional `healer`/`generator.locatorHints`/`playbooks` on `ContextPack`; `tsc` clean.

### T14 — [x] clusterEpisodes (deterministic) [P]

- **Covers:** R10
- **Depends on:** T1
- **Parallel:** yes
- **Done-when:** `distill/cluster.ts` clusters episodes by failure-signature embedding cosine + strategy into bounded `Cluster[]`; pure and deterministic (fixed vectors → fixed clusters); unit-tested.

### T15 — [x] summarizeCluster (LLM + deterministic fallback)

- **Covers:** R10, C4
- **Depends on:** T14
- **Parallel:** no
- **Done-when:** `distill/summarize.ts` turns a bounded cluster into `{principle, antipattern?, recommendation}` via `createClaudeClient`; with no `ANTHROPIC_API_KEY` it returns a deterministic strategy-template principle (AC12); the LLM path is mockable in tests.

### T16 — [x] promote (trust gate)

- **Covers:** R11, R14, R16
- **Depends on:** T13
- **Parallel:** no
- **Done-when:** `distill/promote.ts` promotes `episodic`→`trusted` at `supportCount ≥ N` with no contradicting evidence, and **re-weights/demotes** (never deletes) on contradiction, retaining provenance (AC13/AC18); N is a named, calibratable constant.

### T17 — [x] repo: playbook upsert/read + watermark

- **Covers:** R9, R12, R14, N5
- **Depends on:** T5, T13
- **Parallel:** no
- **Done-when:** `repo.ts` upserts playbooks (idempotent by scope+key+signature), reads `trusted`-only for `getPlaybooks`, stores `evidenceRunIds`, and reads/advances `distill_watermark`; second distill with no new episodes is a no-op (AC11/SC8).

### T18 — [x] bin/knowledge-distill.ts (incremental CLI) + procedural aggregation

- **Covers:** R9, R10, R11, R15, C3, N3
- **Depends on:** T14, T15, T16, T17
- **Parallel:** no
- **Done-when:** `bin/knowledge-distill.ts` reads episodes since the watermark, clusters → summarizes → upserts (`status='episodic'`), aggregates passing runs into procedural `scope='app'` playbooks (AC17), runs promotion, advances the watermark; a `knowledge:distill` npm script runs it; the run path issues **zero** summarizer calls (N3).

### T19 — [x] getPlaybooks + budgeted injection into Planner/Generator/Healer

- **Covers:** R12, R13, N6
- **Depends on:** T17
- **Parallel:** no
- **Done-when:** `retrieve/playbooks.ts` + `assemble/contextPack.ts` inject a **token-budgeted** "Learned principles" block of **trusted-only** playbooks scoped to app + stage into all three agents; `index.ts` exposes `getPlaybooks` (best-effort); 0 `episodic` playbooks ever appear in a prompt (AC14/AC15/N6).

### T20 — [x] 3b unit + integration tests [P]

- **Covers:** R9, R10, R11, R12, R15, N3, N5, N6
- **Depends on:** T18, T19
- **Parallel:** yes
- **Done-when:** unit: clustering determinism, template fallback (AC12), promotion rule (AC13/AC18); integration: distill writes a playbook with evidence + support (AC10), re-run no-op (AC11), procedural playbook (AC17), trusted-only injection + budget (AC14/AC15/N6), no summarizer call in the run path (N3).

## Cross-cutting

### T21 — [x] Additive-no-regression guard (features off ⇒ Phase 2)

- **Covers:** R13, N2
- **Depends on:** T10, T19
- **Parallel:** no
- **Done-when:** a dedicated test runs the full assemble path with all Phase 3 features disabled (KB off, embeddings off, no trusted playbooks) and asserts the Planner/Generator/Healer prompts + coverage decisions are **identical** to Phase 2 over fixed inputs (AC16).

### T22 — [x] ADR-0004 + ADR-0005 [P]

- **Covers:** R1, R9, R11 (provenance of decisions)
- **Depends on:** —
- **Parallel:** yes
- **Done-when:** `docs/adr/0004-healing-memory.md` (diff-based capture; no agent change) and `docs/adr/0005-playbook-distillation.md` (off-hot-path LLM distillation + trust gate) are written with Context/Decision/Alternatives/Consequences/Re-litigation-guard, matching ADR-0001..0003.

### T23 — [ ] M1/M2/M3 calibration + measurement harness

- **Covers:** R16, M1, M2, M3
- **Depends on:** T9, T16, T18
- **Parallel:** no
- **Done-when:** a labeled recurring failure→fix set (DEP4) is built from the curated tarento flows; a harness computes **heal-precedent reuse** (M1 ≥60%), tracks **bad-fix propagation** (M2 ≤5%), and routes `trusted` playbooks to review (M3 ≥90%); the precedent threshold + promotion `N` are calibrated and recorded in `implementation-notes.md`. (Final live numbers via `/measure`.)

---

## Coverage matrix — requirements → tasks

| Requirement | Covered by task(s)  | Covered? |
| ----------- | ------------------- | -------- |
| R1          | T1, T4, T6, T7, T11 | ✅       |
| R2          | T3, T11             | ✅       |
| R3          | T2, T6, T11         | ✅       |
| R4          | T5, T8, T12         | ✅       |
| R5          | T8, T12             | ✅       |
| R6          | T9, T11, T12        | ✅       |
| R7          | T10, T11            | ✅       |
| R8          | T10, T11            | ✅       |
| R9          | T5, T17, T18, T20   | ✅       |
| R10         | T14, T15, T18, T20  | ✅       |
| R11         | T16, T18, T19, T20  | ✅       |
| R12         | T13, T17, T19, T20  | ✅       |
| R13         | T8, T19, T21        | ✅       |
| R14         | T16, T17, T22       | ✅       |
| R15         | T18, T20, T23       | ✅       |
| R16         | T16, T23            | ✅       |
| N1          | T11                 | ✅       |
| N2          | T11, T21            | ✅       |
| N3          | T18, T20            | ✅       |
| N4          | T12                 | ✅       |
| N5          | T12, T17, T20       | ✅       |
| N6          | T19, T20            | ✅       |

> **Gate check:** every requirement and NFR maps to ≥1 task (no gaps); every task
> (T1–T23) cites a requirement/NFR (no scope creep). Open questions: Q1 (labeled
> set) + Q2 (threshold/promotion) land in **T23**; Q3 (`HealStrategy` taxonomy) in
> **T1/T3**; Q4 (procedural in 3b vs 3c) resolved here as **in 3b** (T18). M1/M2/M3
> final numbers need DEP4 + repeat tarento.com runs (`/measure`).

---

## Suggested execution order

1. **3a core (parallel):** T1, T2, T3, T5, T22 → then T4 → T6 → T7 → T8 → T9 → T10.
2. **3a verify (parallel):** T11, T12.
3. **3b core:** T13, T14 (parallel) → T15, T16, T17 → T18 → T19.
4. **3b verify (parallel):** T20.
5. **Cross-cutting:** T21 (regression guard) → T23 (calibration/metrics).

---

_Stage 3 (Assemble) artifact. Approve alongside `plan.md` at the Human Gate, then
proceed to `/craft-framework:forge`. The Builder works tasks in dependency order,
dispatching `[P]` tasks in parallel where possible._
