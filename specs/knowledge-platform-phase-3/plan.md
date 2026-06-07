# Plan (Design) — Knowledge Platform · Phase 3 (Healing Memory & Playbooks)

> Stage 3 (Assemble) deliverable. Defines **HOW** to build what the Spec
> describes. Pairs with `tasks.md`. Every design choice traces to a requirement
> or constraint in the Spec.

- **Targets Spec version:** v0.1.0
- **Status:** Approved
- **Last updated:** 2026-06-07

---

## Approach

Phase 3 is **additive** to the Phase 1/2 Knowledge Layer (`src/knowledge/`). It
adds two capabilities and threads them through the existing seams:

1. **Healing memory (3a, no hot-path LLM).** At the orchestrator seam we already
   hold both the **generated** specs and the **healed** specs. We diff them
   deterministically into `HealingEvent`s, embed the failure signature at ingest
   (best-effort, cached — exactly the Phase 2 pattern), persist append-only, and
   retrieve precedents with the **same hybrid matcher** Phase 2 uses for specs.
   Precedents flow into the Healer prompt; locator hints flow into the Generator
   context pack.
2. **Playbook distillation (3b, off hot-path).** A new CLI job clusters recent
   episodes (deterministic cosine + strategy), summarizes each **bounded** cluster
   into a principle (one LLM call via `createClaudeClient`, with a deterministic
   template fallback), and upserts `playbooks` with evidence + a `status`. A
   **trust gate** means only `trusted` playbooks are injected, token-budgeted,
   into agent prompts.

The load-bearing property — "never worse than Phase 2" (R13/N2) — is kept provable
by making **capture and clustering pure functions** and by gating every new read
through the best-effort `withKb` contract: features off ⇒ empty inputs ⇒ Phase 2
behavior byte-for-byte. Two durable choices are fixed in **ADR-0004** (healing
memory via diff capture) and **ADR-0005** (off-hot-path LLM distillation + trust
gate).

## Architecture & structure

```
src/knowledge/
  heal/
    captureHeal.ts        # NEW: captureHealDeltas(pre, post, results) → HealingEvent[]   (R1, I1)
    captureHeal.test.ts   # NEW: pure diff + classifier tests (no DB)
    strategy.ts           # NEW: classifyStrategy(before, after) → HealStrategy          (R2)
    signature.ts          # NEW: normalizeFailure(reason) → stable signature             (R3)
  distill/
    cluster.ts            # NEW: clusterEpisodes(events) → Cluster[]  (cosine+strategy)   (R10, I4)
    summarize.ts          # NEW: summarizeCluster() — LLM + deterministic template fallback (R10)
    promote.ts            # NEW: trust-gate promotion rule (support N, contradiction)     (R11)
    cluster.test.ts       # NEW: deterministic clustering + promotion tests
  store/
    migrations/
      0003_healing_playbooks.sql  # NEW: healing_events + playbooks (+vector(384)+HNSW)   (R4, I2)
    repo.ts               # EDIT: persist healingEvents; findHealingPrecedents (hybrid);  (R4,R6,R9,R11)
                          #       upsert/read playbooks; distillation watermark
  ingest/
    extract.ts            # EDIT: ExtractedRun.healingEvents (signature + tokens)         (R1,R3)
    ingestRun.ts          # EDIT: embed failure signatures (best-effort, cached); persist (R5,R13)
  assemble/
    contextPack.ts        # EDIT: add healer precedents, generator locatorHints,          (R7,R8,R12)
                          #       and budgeted trusted-playbook block per stage
  retrieve/
    healingPrecedents.ts  # NEW: getHealingPrecedents core (hybrid, pure-testable)        (R6)
    playbooks.ts          # NEW: getPlaybooks(scope) — trusted-only retrieval             (R12)
  index.ts                # EDIT: service methods getHealingPrecedents/getPlaybooks; wire (R6,R7,R8,R12,R13)
  types.ts                # EDIT: HealingEvent, HealStrategy, HealingPrecedent, Playbook,  (I1,I3)
                          #       PlaybookScope; +healer/locatorHints/playbooks on ContextPack
bin/
  knowledge-distill.ts    # NEW: off-hot-path distillation CLI (incremental, watermarked) (R9, R15)
docs/adr/0004-healing-memory.md · 0005-playbook-distillation.md   # NEW
src/orchestrator/
  orchestrate.ts          # EDIT: snapshot pre-heal specs; call captureHealDeltas; pass   (R1)
                          #       events into report → ingestRun
  stages.ts               # EDIT: inject precedents (Healer) + hints/playbooks (Gen/Plan) (R7,R8,R12)
```

No new top-level module — Phase 3 deepens `src/knowledge/` and reuses the
orchestrator + `KnowledgeService` seams (C7).

## Components / modules

| Component                        | Responsibility                                                                                                | Addresses        |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------- |
| `heal/captureHeal.ts`            | Pure: diff pre/post-heal specs → `HealingEvent[]` (before/after, outcome)                                     | R1, N1           |
| `heal/strategy.ts`               | Pure rule-based `HealStrategy` classifier over the diff                                                       | R2               |
| `heal/signature.ts`              | Pure failure-reason normalizer → stable signature                                                             | R3               |
| `0003_healing_playbooks.sql`     | `healing_events` + `playbooks` tables, `vector(384)` + HNSW cosine indexes                                    | R4, R9, C1       |
| `ingest/extract.ts` (edit)       | Carry `healingEvents` (signature + lexical tokens) on `ExtractedRun`                                          | R1, R3           |
| `ingest/ingestRun.ts` (edit)     | Embed failure signatures best-effort/cached; persist events in the run transaction                            | R5, R13          |
| `store/repo.ts` (edit)           | Persist events (idempotent by run); `findHealingPrecedents` (HNSW + lexical); playbook upsert/read; watermark | R4,R6,R9,R11,R14 |
| `retrieve/healingPrecedents.ts`  | Pure hybrid precedent selection (reuse `overlapCoefficient`/`cosineSim`)                                      | R6               |
| `distill/cluster.ts`             | Pure deterministic clustering of episodes (cosine + strategy)                                                 | R10              |
| `distill/summarize.ts`           | Cluster→principle: `createClaudeClient` call + deterministic template fallback                                | R10, C4          |
| `distill/promote.ts`             | Trust-gate promotion (support N, contradiction re-weight)                                                     | R11, R16         |
| `retrieve/playbooks.ts`          | `getPlaybooks(scope)` — `trusted`-only                                                                        | R12, N6          |
| `assemble/contextPack.ts` (edit) | Add healer precedents, generator locator hints, budgeted trusted-playbook block per stage                     | R7, R8, R12      |
| `index.ts` (edit)                | New service methods; wire best-effort (`withKb`); Disabled stubs return empties                               | R6,R7,R8,R12,R13 |
| `orchestrate.ts` (edit)          | Snapshot pre-heal specs; `captureHealDeltas`; attach events to the report for ingest                          | R1               |
| `stages.ts` (edit)               | Inject precedents into the Healer prompt; hints/playbooks into Generator/Planner                              | R7, R8, R12      |
| `bin/knowledge-distill.ts`       | Off-hot-path incremental distillation CLI; procedural aggregation from passing runs                           | R9, R15, C3      |

## Data flow

**1 — Capture heals at the orchestrator seam (deterministic, no LLM).**

```
runPipeline:
  generated = readGeneratedSpecs(ws)         # snapshot BEFORE heal
  healTests(ws, ...)                          # Healer edits files in place
  healed = readGeneratedSpecs(ws)             # state AFTER heal (already re-read today)
  events = captureHealDeltas(generated, healed, results):   # PURE  [R1]
       for each file changed by healing:
          before/after = line-scoped diff hunks
          strategy     = classifyStrategy(before, after)    # [R2]
          signature    = normalizeFailure(result.failureReason)  # [R3]
          outcome      = healed→'healed' | fixme→'fixme'
  report.healingEvents = events               # carried into ingestRun
```

**2 — Embed signature at ingest (best-effort, cached) + persist (idempotent).**

```
ingestRun(report):
  ... existing spec embedding ...
  for each healingEvent:
     emb = embeddingForHash(sig_hash, model)  ?? withKb(embedder.embed([signature]))  # null on fail [R5/SC6]
  persistRun(... healing_events ...)          # DELETE-by-run then INSERT (idempotent) [R4/SC2]
```

**3 — Precedent retrieval feeds the Healer; hints feed the Generator.**

```
# Healer stage (best-effort; absent precedents → Phase 2 prompt unchanged) [R7/N2]
for each failing test:
   precedents = withKb( getHealingPrecedents({signature, flowId, appId}) )   # hybrid [R6]
       lex = overlapCoefficient(sigTokens, eventSigTokens)
       sem = (qEmb && ev.embedding) ? cosineSim(...) : 0
       keep top-k SUCCESSFUL heals by max(lex, sem) ≥ threshold
   prompt += render(precedents)   # "Past fix: <strategy> changed X → Y (passed)"

# Generator stage [R8]
locatorHints = withKb( deriveLocatorHints(appId, flowId) )  # from successful heals
contextPack.generator.locatorHints = locatorHints
```

**4 — Distillation (OFF hot-path, incremental) + trust gate.**

```
bin/knowledge-distill.ts (CLI / cron):
  episodes = readEpisodesSince(watermark)         # healing_events + failures + passes
  clusters = clusterEpisodes(episodes)            # PURE: cosine(sig emb)+strategy  [R10]
  for each cluster (bounded):
     principle = summarizeCluster(cluster)         # Claude call OR template fallback [R10/SC9]
     upsertPlaybook({principle, scope, evidenceRunIds, supportCount, embedding, status:'episodic'})  [R9/R14]
  proceduralPlaybooks(passingRuns)                # app + crawl-strategy aggregation [R15]
  promote(): episodic → trusted  if support ≥ N AND no contradiction   [R11/R16]
  advanceWatermark()                              # second no-op run [SC8/N5]
```

**5 — Inject trusted playbooks (token-budgeted) at each agent boundary.**

```
assembleContext(stage, appId):
  pb = withKb( getPlaybooks({kind, key:appId}) )   # TRUSTED only [R12/N6]
  block = budget(renderPrinciples(pb), maxTokens)  # token-budgeted [C5]
  → Planner / Generator / Healer prompt gets a "Learned principles" block
```

> **Additive guarantee:** features off (KB disabled, no embeddings, no trusted
> playbooks) ⇒ empty precedents/hints/playbooks ⇒ prompts + decisions **identical**
> to Phase 2 (N2/AC16). Learning can only _add_ context, never remove or worsen it.

| File / module                                 | Diagram it should carry                                       |
| --------------------------------------------- | ------------------------------------------------------------- |
| `src/orchestrator/orchestrate.ts`             | pre/post-heal snapshot → `captureHealDeltas` → report         |
| `src/knowledge/ingest/ingestRun.ts`           | signature embed-at-ingest (cache → embed → null-on-fail)      |
| `src/knowledge/retrieve/healingPrecedents.ts` | hybrid precedent selection branching                          |
| `bin/knowledge-distill.ts`                    | episodes → cluster → summarize → upsert → promote → watermark |
| `src/knowledge/assemble/contextPack.ts`       | trusted-only, token-budgeted injection per stage              |

## Interfaces / Contracts

| ID  | Interface                    | Producer                     | Consumer                 | Shape (inline/link)                                                                                                                                                                                   | Versioning                            |
| --- | ---------------------------- | ---------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| I1  | `HealingEvent`               | `heal/captureHeal.ts`        | ingest + retrieve        | `{runId, appId, flowId, file, failureSignature, before, after, strategy: HealStrategy, outcome: 'healed'\|'fixme', embedding?: number[]\|null}`                                                       | Additive; new optional fields only    |
| I2  | `0003` schema delta          | `0003_healing_playbooks.sql` | `repo.ts`                | `healing_events(... failure_embedding vector(384))`, `playbooks(... embedding vector(384), status)`, HNSW cosine indexes                                                                              | Forward-only migration                |
| I3  | `Playbook` / `PlaybookScope` | `distill/*` / `types.ts`     | retrieve + agents        | `Playbook{id, scope, principle, antipattern?, recommendation, evidenceRunIds[], supportCount, confidence, status:'episodic'\|'trusted'}`; `PlaybookScope{kind:'app'\|'global'\|'componentType', key}` | Additive                              |
| I4  | `getHealingPrecedents`       | `index.ts`                   | Healer (stages)          | `(failure:{signature,flowId?,appId}) → HealingPrecedent[] {strategy, before, after, score}`                                                                                                           | Additive method on `KnowledgeService` |
| I5  | `getPlaybooks`               | `index.ts`                   | Planner/Generator/Healer | `(scope: PlaybookScope) → Playbook[]` (trusted only)                                                                                                                                                  | Additive method on `KnowledgeService` |
| I6  | `ContextPack` (extended)     | `assemble/contextPack.ts`    | agents                   | `+ healer?: {precedents}`, `+ generator.locatorHints?`, `+ playbooks?` (all optional; absent ⇒ Phase 2)                                                                                               | Additive optional fields              |
| I7  | distillation watermark       | `repo.ts`                    | `bin/knowledge-distill`  | a stored `distill_watermark` (last processed run/created_at); CLI reads/advances it                                                                                                                   | Internal; incremental contract        |

## Dependencies & integration points

- Extends Phase 1 (`persistRun`, `ingestRun`, `KnowledgeService`, `edges`) and
  Phase 2 (`Embedder`, `cosineSim`, `overlapCoefficient`, HNSW) — no re-architecture (C7).
- **`createClaudeClient`** (existing) — the only new LLM use, off-hot-path, in
  `distill/summarize.ts`; `ANTHROPIC_API_KEY` optional (template fallback) (DEP5).
- A labeled **recurring failure→fix** set (Claude-generated, human-verified) for
  M1/M3 (DEP4); repeat tarento.com runs to measure (DEP6).
- Pre/post-heal spec snapshots at the orchestrator seam (DEP3).

## Key decisions (ADRs)

| ID  | Decision                                                                                    | Options considered                                               | Why not (rejected)                                                                               | Consequences                                                                                         | Driven by    |
| --- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- | ------------ |
| D1  | **Capture heals by diffing pre/post-heal specs** (deterministic) → **ADR-0004**             | diff capture; structured Healer heal-log; parse agent transcript | log/transcript = change the agent + per-run LLM/output coupling, brittle parsing                 | no agent change, no hot-path LLM, pure-testable; risk: misattributed edits → line-scoped + audit     | R1, C2, A1   |
| D2  | **Hybrid precedent match** (lexical signature OR semantic), reuse Phase 2 matcher           | hybrid; pure-semantic; exact-signature only                      | pure-semantic loses the lexical fallback; exact-only misses paraphrased failures                 | provable additive safety; reuses proven code; precedent must be a _successful_ heal                  | R6, R13      |
| D3  | **Distillation off the hot-path, incremental CLI** → **ADR-0005**                           | off-path CLI/cron; inline at run end; streaming                  | inline couples run latency to LLM clustering; streaming is premature complexity                  | a run never waits on learning (N3); watermark → idempotent re-runs; needs a scheduler/manual trigger | R9, C3, N3   |
| D4  | **LLM summarizes only a bounded cluster; deterministic template fallback** → **ADR-0005**   | LLM-per-cluster+fallback; LLM-free templating; LLM-per-episode   | LLM-free = thin principles; per-episode = cost blowup + noise                                    | good principles when a key exists; works with no key; cost bounded by cluster count                  | R10, C4, A4  |
| D5  | **Trust gate: only `trusted` playbooks injected; promotion re-weights, never deletes**      | trust gate; inject all; manual-only curation                     | inject-all spreads hallucinated lore (M3 risk); manual-only doesn't scale                        | unverified lore never reaches prompts (N6); auto-promote + manual override; contradiction demotes    | R11, R12, C5 |
| D6  | **Failure signature = normalized `failure_reason`** (strip ids/lines/timestamps)            | normalized reason; raw reason; error-type only                   | raw fragments per dynamic id; type-only too coarse                                               | stable cross-run signatures; tunable normalizer; risk if reasons vary wildly (A2)                    | R3           |
| D7  | **Precedent/hint computed in JS over the app's loaded events**; HNSW powers candidate fetch | JS-over-loaded; pgvector NN per failure for the decision         | per-app event counts modest (A5) → keeps selection pure & DB-free for tests (mirrors Phase 2 D3) | trivial additive-no-regression test; swap to NN-candidate fetch later without signature change       | R6, A5, N2   |
| D8  | **Token-budget the injected blocks** (precedents + playbooks)                               | budget; inject all matched; fixed top-1                          | inject-all bloats prompts/cost; top-1 too thin for multi-issue runs                              | bounded prompt growth; budget tuned in Forge alongside thresholds                                    | R7, R12, C5  |

## Risks & mitigations

| ID  | Risk                                            | Likelihood | Impact | Mitigation                                                                                                |
| --- | ----------------------------------------------- | ---------- | ------ | --------------------------------------------------------------------------------------------------------- |
| RK1 | Hallucinated playbook reaches a prompt          | Med        | High   | Trust gate (`episodic`→`trusted` only on support N + no contradiction); M3 ≥90% review; template fallback |
| RK2 | Bad/fragile fix propagates as a hint            | Med        | High   | Precedent must be a _passed-and-stayed-passing_ heal; M2 ≤5% guardrail; contradiction re-weights/demotes  |
| RK3 | Diff misattributes a fix (unrelated edits)      | Med        | Med    | Line-scoped diff hunks; classifier confidence; store raw before/after for audit (R14)                     |
| RK4 | Failure signatures fragment (inconsistent text) | Med        | Med    | Tunable normalizer (D6); lexical+semantic hybrid tolerates variation; calibrate in Forge                  |
| RK5 | Distillation cost/time grows unbounded          | Low        | Med    | Incremental watermark; batch caps; deterministic clustering; LLM only on bounded clusters                 |
| RK6 | Capture/injection regresses Phase 2 behavior    | Low        | High   | Pure capture + `withKb` everywhere; N2/AC16 byte-identical regression guard with features off             |
| RK7 | Precedent retrieval adds run latency            | Low        | Med    | Best-effort, top-k, warm ≤300 ms (N4); JS-over-loaded events (D7); skip when KB cold                      |
| RK8 | Pre/post snapshot unavailable at the seam       | Low        | Med    | Verify DEP3 first task; if absent, snapshot specs into the workspace before `healTests`                   |

## Test strategy

- **Layers:** **unit** (`tsx --test`, no DB/LLM) for `captureHealDeltas`,
  `classifyStrategy`, `normalizeFailure`, the **hybrid precedent selector** with a
  **fake `Embedder`**, `clusterEpisodes`, the **promotion** rule, and the
  **additive-no-regression diff** (features off ⇒ prompts/decisions identical to
  Phase 2); **integration** (pgvector test DB) for ingest→persist events,
  `findHealingPrecedents` round-trip, idempotent re-ingest, playbook upsert/read,
  and watermark idempotency; **degradation** (embedder throws / KB absent / no
  trusted playbooks ⇒ Phase 2 behavior, no error).
- **Environments:** local + CI Postgres with pgvector; unit tests need no DB/model
  (fake embedder, fixed clusters); the real summarizer runs in a **manual/nightly**
  job (or template fallback in CI).
- **Fixtures:** the **labeled recurring failure→fix set** (DEP4) + the curated
  tarento flows; pre/post-heal spec pairs encoding each `HealStrategy`; fake
  embedder returns fixed vectors for the intended near/related/unrelated geometry.
- **NFR coverage:** N1 — time capture+persist ≤200 ms; N2 — features-off diff vs
  Phase 2 (identical); N3 — assert zero summarizer calls in the run path; N4 —
  warm precedent retrieval ≤300 ms; N5 — re-ingest/re-distill row counts unchanged;
  N6 — assert no `episodic` playbook in any assembled prompt.
- **M1/M2/M3:** a calibration/measurement harness runs the labeled set through
  `getHealingPrecedents` (M1 recall), tracks hint/playbook-attributed regressions
  (M2), and routes `trusted` playbooks to human review (M3) — final live numbers
  via `/measure` after repeat tarento runs.
- **Deliberately not tested in unit CI:** the real Claude summarizer (manual/
  nightly), and live M1/M2/M3 (need DEP4 + repeat tarento runs).

---

## Requirements coverage (design level)

| Requirement / NFR | Addressed by                                                          |
| ----------------- | --------------------------------------------------------------------- |
| R1                | `heal/captureHeal.ts` + orchestrate snapshot (D1/ADR-0004)            |
| R2                | `heal/strategy.ts` classifier                                         |
| R3                | `heal/signature.ts` normalizer (D6)                                   |
| R4                | `0003_healing_playbooks.sql` + `repo` idempotent persist (I2)         |
| R5                | `ingestRun` signature embed-at-ingest, cached, best-effort            |
| R6                | `retrieve/healingPrecedents.ts` hybrid (D2/D7)                        |
| R7                | `stages.ts` Healer-prompt injection via `contextPack`                 |
| R8                | Generator `locatorHints` in `contextPack`                             |
| R9                | `bin/knowledge-distill.ts` incremental + watermark (D3/ADR-0005)      |
| R10               | `distill/cluster.ts` + `distill/summarize.ts` (D4)                    |
| R11               | `distill/promote.ts` trust gate (D5)                                  |
| R12               | `retrieve/playbooks.ts` + `contextPack` budgeted injection (D8)       |
| R13               | additive design: features off ⇒ empties ⇒ Phase 2; all reads `withKb` |
| R14               | `evidenceRunIds` + raw before/after stored (provenance)               |
| R15               | procedural aggregation in `bin/knowledge-distill.ts`                  |
| R16               | promotion rule + Forge calibration                                    |
| N1                | capture is pure/local; ≤200 ms test                                   |
| N2                | features-off regression diff (capture pure, `withKb`)                 |
| N3                | no-summarizer-in-run-path assertion                                   |
| N4                | warm precedent-retrieval timing                                       |
| N5                | idempotent re-ingest + re-distill counts                              |
| N6                | trusted-only injection assertion                                      |

---

_Stage 3 (Assemble) artifact. Architecture Gate (3a) approves this `plan.md`
before tasks are cut. Must respect every rule in `CONSTITUTION.md`._
