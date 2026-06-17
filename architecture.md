# System Architecture — AI UI Testing Tool

> **What this document is.** A single source of truth for understanding how the
> whole project works: the moving parts, how they talk to each other, and how
> data flows from "a user pastes a URL" to "a polished test report." It is written
> to be read top-to-bottom by someone new to the codebase. Every file and module
> named here exists in the repository.

---

## Table of contents

1. [What the tool does (in one minute)](#1-what-the-tool-does-in-one-minute)
2. [System architecture](#2-system-architecture)
3. [Agent workflow architecture](#3-agent-workflow-architecture)
4. [Knowledge retrieval architecture](#4-knowledge-retrieval-architecture)
5. [PostgreSQL integration](#5-postgresql-integration)
6. [Crawl → Design → Execute → Evolve lifecycle](#6-crawl--design--execute--evolve-lifecycle)
7. [Final report rendering](#7-final-report-rendering)
8. [Appendix: all Mermaid diagrams in one place](#8-appendix-all-mermaid-diagrams)

---

## 1. What the tool does (in one minute)

You give it a **website URL**. Four AI agents then take turns:

1. **Discoverer** — opens the site in a real browser, explores it, and writes a
   plain-English **test plan** (a Markdown list of user flows worth testing).
2. **Designer** — turns each scenario in that plan into a runnable **Playwright
   test** (`.spec.ts` files).
3. **Evolver** — runs the tests, and for every failure it tries to **repair** the
   test (better selectors, fixed assertions). Anything it cannot fix it
   quarantines with `test.fixme()`.
4. **Reporter** — aggregates all the results and uses Claude to write a
   human-readable **report** (summary, issues, recommended fixes), rendered in the
   web UI and as a standalone HTML file.

Around this pipeline sits a **Knowledge Layer** (a PostgreSQL + pgvector database)
that _remembers_ every past run, so future runs can **reuse existing tests**,
borrow **patterns from other apps**, and apply **fixes that worked before**.

The whole thing is a **Next.js web app** (React 19 + Chakra UI) that lets you
launch runs, watch live progress, and browse reports.

**Tech stack at a glance:** Next.js 15 / React 19 / TypeScript, Chakra UI,
`@anthropic-ai/claude-agent-sdk` (drives the agents) + `@anthropic-ai/sdk` (the
Reporter narrative), Playwright + `@playwright/cli` (browser automation),
PostgreSQL + `pgvector` (knowledge), local Hugging Face embeddings
(`Xenova/bge-small-en-v1.5`), and Langfuse/OpenTelemetry for tracing.

---

## 2. System architecture

### 2.1 The big picture

The system is organized into seven cooperating layers. The diagram below shows
who talks to whom.

```mermaid
flowchart TB
    User([User / QA Engineer])

    subgraph FE["🖥️ Frontend — Next.js app (app/)"]
        Dash["Dashboard & Launch Wizard<br/>app/page.tsx · LaunchWizard.tsx"]
        RunsUI["Test Runs table + details<br/>TestRunsTable · TestRunDetailsPane"]
        ReportUI["Report view<br/>TestReportView.tsx"]
        Explore["Pattern Explorer / SQL Query<br/>explore · sql-query"]
    end

    subgraph API["🔌 Backend services — API routes (app/api/)"]
        RunsAPI["/api/runs (+ /[id], /stream, /report, /cancel)"]
        KnowAPI["/api/knowledge (apps, patterns, specs, query)"]
    end

    subgraph ORCH["🤖 Agent orchestration layer (src/orchestrator, src/agents)"]
        RunMgr["Run Manager<br/>runManager/manager.ts"]
        Pipeline["Pipeline<br/>orchestrate.ts · stages.ts"]
        Runtime["Agent runtime + guards<br/>runtime.ts · crawlGate.ts · cliGuard.ts"]
    end

    subgraph AGENTS["🧠 The four agents (.claude/agents + Claude Agent SDK)"]
        D1[Discoverer]
        D2[Designer]
        D3[Evolver]
        D4[Reporter]
    end

    subgraph KNOW["📚 Knowledge layer (src/knowledge)"]
        KSvc["KnowledgeService<br/>knowledge/index.ts"]
        Retrieve["Retrieval tiers<br/>retrieve/*"]
        Ingest["Ingestion<br/>ingest/*"]
        Embed["Embeddings<br/>embeddings/*"]
    end

    subgraph REPORT["📊 Reporting layer (src/reporter)"]
        Build["buildReport · narrative"]
        Render["render.ts (md / html)"]
    end

    subgraph DATA["💾 Database layer"]
        Disk[("Disk: .runs/&lt;id&gt;/<br/>plans, specs, results, run.json")]
        PG[("PostgreSQL + pgvector<br/>knowledge DB")]
    end

    subgraph EXT["🌐 External integrations"]
        Claude["Anthropic API<br/>(Claude Agent SDK + SDK)"]
        PW["Playwright CLI + browser<br/>→ Target website"]
        LF["Langfuse / OpenTelemetry"]
    end

    User --> FE
    FE <--> API
    API --> RunMgr
    RunMgr --> Pipeline
    Pipeline --> Runtime
    Runtime --> AGENTS
    AGENTS --> Claude
    AGENTS --> PW
    Pipeline --> KSvc
    Pipeline --> Build
    Build --> Render
    Build --> D4
    KSvc --> Retrieve
    KSvc --> Ingest
    Retrieve --> Embed
    Ingest --> Embed
    KSvc --> PG
    KnowAPI --> KSvc
    RunMgr --> Disk
    Pipeline --> Disk
    Runtime --> LF
    KSvc --> LF
    Build --> Claude
```

### 2.2 What each layer is responsible for

| Layer                         | Where it lives                                     | Responsibility                                                                                                            |
| ----------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Frontend components**       | `app/` (React components, pages)                   | Launch runs, watch live progress over SSE, render reports, explore the knowledge base.                                    |
| **Backend services**          | `app/api/**/route.ts`                              | Thin HTTP endpoints: create/list/cancel runs, stream progress, serve reports, query knowledge.                            |
| **Agent orchestration layer** | `src/runManager`, `src/orchestrator`, `src/agents` | Owns a run's life (start/cancel/persist), runs the four-stage pipeline, and enforces code-level guardrails on the agents. |
| **Database layer**            | Disk under `.runs/` + PostgreSQL                   | Per-run artifacts on disk; long-term cross-run memory in Postgres.                                                        |
| **Knowledge layer**           | `src/knowledge`                                    | Turns finished runs into reusable knowledge and feeds it back into future runs.                                           |
| **Reporting layer**           | `src/reporter`                                     | Builds the canonical report object and renders it to Markdown/HTML.                                                       |
| **External integrations**     | Anthropic API, Playwright, Langfuse                | The LLM, the real browser, and observability.                                                                             |

### 2.3 Key design principles (why the code looks the way it does)

- **Graceful degradation everywhere.** The knowledge DB, login credentials,
  business context, and Langfuse tracing are all _optional_. With none of them
  configured, the pipeline still runs exactly as before — it just runs "cold."
  The knowledge service even has a `DisabledKnowledgeService` that returns safe
  empty results so callers never have to check `if (enabled)`.
- **Boundaries are enforced in code, not just prompts.** The agents are told what
  to do, but `crawlGate.ts` and `cliGuard.ts` install Claude Agent SDK _hooks_
  that hard-deny out-of-scope navigation and non-CLI browser tools at the tool
  boundary — so the limits hold even if the model ignores its instructions.
- **The runner owns the truth.** Agents describe results subjectively; the actual
  pass/fail/flaky verdict comes from running Playwright and parsing
  `results.json` (`src/results/parse.ts`).

---

## 3. Agent workflow architecture

### 3.1 The four agents and their order

The pipeline always runs the same sequence. It is wired in
`src/orchestrator/orchestrate.ts` (`runPipeline`), which calls the stage functions
in `src/orchestrator/stages.ts`. The agent _personalities_ (system prompts,
allowed tools) live as Markdown files in `.claude/agents/`.

```mermaid
sequenceDiagram
    participant O as Orchestrator<br/>(orchestrate.ts)
    participant K as KnowledgeService
    participant D1 as Discoverer
    participant D2 as Designer
    participant V as Validator
    participant R as Runner (Playwright)
    participant D3 as Evolver
    participant D4 as Reporter

    O->>K: getLastPlan(url) + playbooks (memory)
    O->>D1: explore live site, write plan.md
    D1-->>O: specs/plan.md
    O->>D2: assembleContext(url, scenarios) → reuse/new decisions
    K-->>D2: copied-forward specs + pattern hints + locator hints
    D2-->>O: tests/*.spec.ts
    O->>V: validateTests(ws) — static checks
    V-->>O: ValidationReport (score, missing flows)
    opt missing scenarios
        O->>D2: regenerateMissingScenarios()
    end
    O->>R: captureResults — initial run (pre-heal)
    R-->>O: TestResult[]
    O->>K: getHealingPrecedents(failures) + getPlaybooks()
    O->>D3: evolve — fix failures, quarantine the rest
    D3-->>O: repaired tests/*.spec.ts
    O->>R: assessSuiteFlakiness (re-run 3×)
    O->>D4: generateNarrative(results, specs)
    D4-->>O: summary, issues, fixPrompts, recommendations
    O->>K: ingestRun(report) — this run becomes knowledge
```

### 3.2 Each stage: inputs, outputs, and how context is passed

Context is passed between stages **through the run workspace on disk** (a folder
at `.runs/<runId>/`). Stage N writes files; stage N+1 reads them. The
`Workspace` object (`src/agents/workspace.ts`) hides the exact paths behind
operations like `writePlan`, `readPlan`, `readGeneratedSpecs`, and `runSuite`.

| Stage                      | Function (file)                                                    | Reads                                                                                                 | Writes / Produces                                                                  |
| -------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **1. Discoverer**          | `discoverTests` (`stages.ts`)                                      | Live website; optional prior plan (`getLastPlan`), playbooks, business context, login creds           | `specs/plan.md`; `.auth/storageState.json` (if login enabled)                      |
| **2. Designer**            | `designTests` (`stages.ts`)                                        | `plan.md`; knowledge context pack (reuse decisions, pattern hints, locator hints); saved auth session | `tests/*.spec.ts` (one file per scenario); copies reused specs forward             |
| **2b. Validator**          | `validateTests` → `validateSuite` (`validator/validate.ts`)        | Generated specs + plan                                                                                | `ValidationReport` (score, errors, warnings, missing flows) — _no LLM, no browser_ |
| **2c. Completeness retry** | `regenerateMissingScenarios` (`stages.ts`)                         | List of planned scenarios with no spec                                                                | The missing `tests/*.spec.ts` only                                                 |
| **3. Runner + Evolver**    | `captureResults` + `evolveTests` (`results/parse.ts`, `stages.ts`) | Specs; initial `results.json`; validation findings; healing precedents; playbooks                     | Repaired specs; `test.fixme()` for the unfixable                                   |
| **3b. Flake check**        | `assessSuiteFlakiness` (`results/parse.ts`)                        | The suite                                                                                             | Re-runs 3× to flag non-deterministic tests; `flakeRate`                            |
| **4. Reporter**            | `generateNarrative` + `buildReport` (`reporter/`)                  | Final results, specs, plan, coverage, screenshots                                                     | `RunReport` (canonical JSON)                                                       |

**How memory flows in (knowledge → agents):**

- The **Discoverer** is given its own _previous plan_ for the same URL as
  reference "memory" (best-effort, budgeted to ~4k tokens) plus any trusted
  _playbooks_. It still has to crawl the live site — memory is an accelerator, not
  a substitute. Importantly, the Discoverer carries **no reuse knowledge**;
  de-duplication against past runs is the Designer's job alone (one decision
  layer — see `docs/adr/`).
- The **Designer** receives a _context pack_ from `assembleContext()`: per-scenario
  `reuse` / `new` decisions, the source code of confidently-matched specs (copied
  forward into the workspace so the suite stays runnable), cross-app _pattern
  hints_, and _resilient-locator hints_ distilled from past heals.
- The **Evolver** receives _healing precedents_ (specific before→after fixes for
  similar failures) and trusted playbooks.

### 3.3 Human approval points

This pipeline is **fully autonomous** — there is no human-in-the-loop approval
gate between stages. A human's only control levers are:

- **Launch configuration** (URL, crawl mode, max pages, scenario budget, an
  optional free-text _focus_ directive) via the Launch Wizard.
- **Cancellation.** `POST /api/runs/[id]/cancel` aborts the run. The orchestrator
  checks `checkCancelled()` at every stage boundary and throws `CancelledError`,
  which propagates an `AbortController` signal that kills the agent subprocess.

> Note: the _read-only SQL query_ tool (Section 5.4) does have a human review
> step — Claude proposes the SQL, the user reads it, then clicks "Execute" — but
> that is a separate feature, not part of the test pipeline.

### 3.4 The guardrails (how agents are kept in scope)

```mermaid
flowchart LR
    Agent[Agent wants to run a tool] --> Hook{PreToolUse hooks}
    Hook -->|"mcp__* browser tool"| Deny1["🛑 cliGuard denies<br/>(must use playwright-cli)"]
    Hook -->|"navigate off-site / too deep / over page budget"| Deny2["🛑 crawlGate denies"]
    Hook -->|allowed| Exec[Tool runs]
    Exec --> Post{PostToolUse hook}
    Post -->|reads 'Page URL:' from CLI output| Track[crawlGate tracks live navigation]
```

- **`cliGuard.ts`** blocks the entire `mcp__` tool namespace, forcing all browser
  control through `npx playwright-cli` (which is token-efficient and the surface
  the crawl gate understands).
- **`crawlGate.ts`** parses each `playwright-cli` command, enforces depth and
  page-count limits per crawl mode, denies off-origin navigation, and captures
  pre/post screenshots of each interaction (which later appear in the report).
- Both sets of hooks are combined with `mergeHooks()` and passed to `runAgent`.

---

## 4. Knowledge retrieval architecture

The Knowledge Layer is what makes the tool get smarter over time. Its public face
is the **`KnowledgeService`** (`src/knowledge/index.ts`). When no
`KNOWLEDGE_DATABASE_URL` is set it returns a `DisabledKnowledgeService` (all calls
return empty/null), so everything below is purely additive.

### 4.1 The required flow (User URL → Designer)

This is the exact sequence the prompt asks for, and it matches the reference
diagram in `docs/kb_arch.md`:

```mermaid
flowchart TD
    A["User provides Target URL"] --> B["Discoverer explores app<br/>& writes plan.md"]
    B --> C[Designer asks KnowledgeService<br/>assembleContext url, scenarios]
    C --> D{Does this app exist<br/>in the knowledge DB?}

    D -->|Yes| E[App-scoped semantic search<br/>over this app's past specs]
    E --> F{Similarity ≥ 0.82<br/>AND same flow AND last passed/healed?}
    F -->|Yes| G[REUSE: copy the existing spec forward]
    F -->|No| H[Global pattern search<br/>across OTHER apps]

    D -->|No| H
    H --> I["Pattern hint: 'a similar workflow was<br/>tested on N other apps — here are the<br/>abstracted steps; adapt them to this app'"]

    G --> J[Designer generates remaining 'new' specs<br/>guided by reuse decisions, patterns & locator hints]
    I --> J
    J --> K[Scenario generation → tests/*.spec.ts]
```

### 4.2 The retrieval tiers

There are three distinct retrieval tiers, each with its own purpose, scope, and
similarity threshold. All similarity is **cosine similarity** over 384-dim
embeddings (or a lexical token-overlap fallback when embeddings are unavailable).

```mermaid
flowchart TB
    subgraph T1["Tier 1 — App-scoped REUSE (retrieve/coverageDecision.ts)"]
        direction TB
        t1a["Search THIS app's prior specs"]
        t1b["Threshold: semantic ≥ 0.82 (SEM_REUSE)<br/>or lexical ≥ 0.80 (REUSE_THRESHOLD)<br/>hybrid: blends title + full-intent embeddings"]
        t1c["Guards: same flow_id AND last outcome ∈ {passed, healed}"]
        t1d["→ Action: copy the spec verbatim into the suite"]
    end
    subgraph T2["Tier 2 — Global PATTERN hints (retrieve/globalPatterns.ts)"]
        direction TB
        t2a["Search OTHER apps' PASSING specs (abstracted intent)"]
        t2b["Threshold: ≥ 0.70 (PATTERN_RELEVANCE), top-1 per scenario,<br/>budget 8 total. Opt-in: KNOWLEDGE_GLOBAL_PATTERNS=true"]
        t2c["→ Advisory only: a workflow skeleton to adapt, never copied"]
    end
    subgraph T3["Tier 3 — Healing PRECEDENTS (retrieve/healingPrecedents.ts)"]
        direction TB
        t3a["Search prior successful fixes for a similar FAILURE signature"]
        t3b["Threshold: ≥ 0.60 (PRECEDENT_THRESHOLD), top-3 (k)"]
        t3c["→ Injected into the Evolver: before→after fix to apply first"]
    end
    T1 --> T2
```

- **App-scoped retrieval (reuse).** For each planned scenario, `decideForSpecs`
  scores it against this app's stored specs. It uses a _hybrid_ score — the max of
  a lexical overlap coefficient and a blended semantic score (`0.5 × title +
0.5 × title+steps`). It only reuses when the score clears `0.82`, the matched
  spec last **passed or healed**, and the **flow ids match** (the "Fix 2"
  cross-flow guard prevents, say, a newsletter "Submit" reusing a support
  "Submit").
- **Global pattern retrieval.** For scenarios decided `new`, the tool looks across
  _other_ apps' passing specs for a similar _abstracted_ workflow (entities,
  prices, ids stripped via `abstractIntent.ts`). The match is advisory — the
  Designer is told to reuse the _pattern_, never the selectors.
- **Historical report / plan retrieval.** `getLastPlan(url)` returns the most
  recent prior plan markdown as Discoverer "memory." The raw report JSON is also
  stored (`raw_reports`) and is the source from which reused spec code is
  rehydrated.
- **Healing precedents.** When tests fail, `getHealingPrecedents` finds prior
  before→after repairs for similar failures (signatures normalized by
  `heal/signature.ts`) and feeds them to the Evolver.

### 4.3 Context assembly (how it all gets into the prompt)

`assembleContext()` in `src/knowledge/assemble/contextPack.ts` is the single
function that bundles everything for the Designer:

```mermaid
flowchart LR
    S[Plan scenarios] --> E[embed scenario titles]
    E --> RS[readSpecsForApp appId]
    RS --> DC[decideForSpecs → reuse/new + score]
    DC --> CF[Copy reused spec code forward into workspace]
    DC -->|new scenarios| GP[globalPatterns → cross-app hints]
    RS --> LH[deriveLocatorHints from past heals]
    PB[trustedPlaybooks] --> PACK
    CF --> PACK[ContextPack.designer]
    GP --> PACK
    LH --> PACK
    PACK --> Prompt[Designer prompt block in stages.ts<br/>applyDesignerKnowledge]
```

Reused specs are **not** pasted into the prompt — they are written into
`tests/` tagged with a `// @kp-reused` marker, and the prompt simply tells the
Designer _"these are already covered, do not regenerate; build everything else."_
This keeps the suite runnable without spending prompt tokens on existing code.

Every knowledge call is wrapped by `withKb()` (`src/knowledge/safety.ts`), which
adds a timeout (~4s) and catch-all so a slow or broken DB **can never stall or
fail a run** — it just yields no hints.

### 4.4 How agents consume knowledge — summary

| Agent      | Knowledge consumed                                                                  | Source function                        |
| ---------- | ----------------------------------------------------------------------------------- | -------------------------------------- |
| Discoverer | Prior plan ("memory") + trusted playbooks                                           | `getLastPlan`, `getPlaybooks`          |
| Designer   | Reuse decisions, copied specs, pattern hints, locator hints, playbooks              | `assembleContext`                      |
| Evolver    | Healing precedents (before→after) + playbooks                                       | `getHealingPrecedents`, `getPlaybooks` |
| Reporter   | (none directly — it summarizes the run; its output is _ingested back_ as knowledge) | `ingestRun`                            |

---

## 5. PostgreSQL integration

The knowledge database is **optional**. It is enabled by setting
`KNOWLEDGE_DATABASE_URL`. On Next.js startup, `instrumentation.ts` auto-applies
any pending migrations so the schema is never out of sync with the writer.

### 5.1 Connection layer and repositories

```mermaid
flowchart TB
    subgraph App
        Pipeline[Orchestrator / API routes]
    end
    Pipeline --> KSvc["KnowledgeService<br/>(knowledge/index.ts — PgKnowledgeService)"]
    KSvc --> Safety["withKb() — timeout + catch<br/>(knowledge/safety.ts)"]
    Safety --> Repo["Repository<br/>(knowledge/store/repo.ts)"]
    Repo --> DB["Connection pool<br/>(knowledge/store/db.ts — pg Pool, max 5)"]
    DB --> PG[("PostgreSQL + pgvector")]
    Migrate["migrate.ts + migrations/*.sql"] --> PG
    Embed["embeddings/embed.ts<br/>(Xenova/bge-small-en-v1.5, 384-d)"] --> Repo
```

- **`store/db.ts`** — creates a `pg` connection `Pool` (max 5 connections, 3s
  connect timeout so a down DB fails fast).
- **`store/repo.ts`** — the repository: all SQL reads/writes (insert a run's
  specs/results/heals, read specs for an app, nearest-neighbour vector searches via
  HNSW indexes).
- **`store/migrate.ts` + `store/migrations/*.sql`** — versioned schema, tracked in
  a `schema_migrations` table and applied idempotently.
- **`embeddings/embed.ts`** — produces L2-normalized 384-dim vectors locally with
  a Hugging Face model; cosine similarity is therefore a dot product.

### 5.2 Tables involved

Created across the migration files in `src/knowledge/store/migrations/`:

| Table                | Purpose                                                                                                                                                                                                                                         |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps`               | One row per app (normalized URL/origin); first/last seen, run count.                                                                                                                                                                            |
| `runs`               | One row per completed run (app, url, status, crawl mode, time).                                                                                                                                                                                 |
| `specs`              | Generated test files: file, title, flow id, content hash, `reused` flag, plus several **`vector(384)`** columns — `embedding` (title+steps), `pattern_embedding` (abstracted intent), `title_embedding` (title only) — each with an HNSW index. |
| `plan_scenarios`     | The scenario titles the Discoverer planned (tokenized).                                                                                                                                                                                         |
| `test_results`       | Outcome per flow per run (`passed` / `healed` / `failed` / `fixme`) + failure reason.                                                                                                                                                           |
| `coverage_snapshots` | Per-run coverage aggregate (curated total, tested count, percent, missing flows).                                                                                                                                                               |
| `flows`              | Curated + discovered flows per app.                                                                                                                                                                                                             |
| `edges`              | Typed graph relations (`PRODUCED`, `TESTS`, `COVERS`) for graph-style queries.                                                                                                                                                                  |
| `raw_reports`        | The verbatim `RunReport` JSON (the rebuild source for reused spec code).                                                                                                                                                                        |
| `healing_events`     | Append-only repairs (failure signature + `failure_embedding`, before/after snippet, strategy, outcome).                                                                                                                                         |
| `playbooks`          | Distilled, evidence-linked principles with a trust gate (`episodic` → `trusted`).                                                                                                                                                               |
| `distill_watermark`  | Single-row bookmark for incremental playbook distillation.                                                                                                                                                                                      |

### 5.3 How execution data is stored and retrieved

```mermaid
flowchart LR
    subgraph Write["WRITE path — after a run completes"]
        RR[RunReport] --> EX["extractRun()<br/>ingest/extract.ts"]
        EX --> EM["embed specs / patterns / titles /<br/>failure signatures"]
        EM --> PR["persistRun() — one transaction<br/>ingest/ingestRun.ts"]
        PR --> PG[("PostgreSQL")]
    end
    subgraph Read["READ path — during the next run"]
        Q1["assembleContext()"] --> PG
        Q2["getHealingPrecedents()"] --> PG
        Q3["getLastPlan() / trends"] --> PG
    end
```

- **Storing.** When the pipeline finishes, `runPipeline` calls
  `knowledge.ingestRun(report)`. `extract.ts` normalizes the report (specs,
  flows, results, coverage, graph edges, and healing events reconstructed by
  _diffing_ pre-heal vs post-heal specs in `heal/captureHeal.ts`). It then embeds
  the text and `persistRun()` writes everything in **one transaction**, idempotent
  by `run_id`. A safety check refuses to ingest synthetic `test-<uuid>` runs into a
  non-test database.
- **Retrieving.** The next run reads back through the same `KnowledgeService`
  methods used for the retrieval tiers (Section 4), plus trend queries
  (`getKnowledgeReuseTrend`, `getHealProvenanceTrend`) that power the UI charts.

### 5.4 AI-generated SQL (the read-only query tool)

The **SQL Query** UI lets a user ask a question in English; Claude translates it
to SQL; the user reviews and runs it. Two layers of defense live in
`src/knowledge/sql/`:

1. **`guard.ts` static validation** — the statement must be a single
   `SELECT`/`WITH`, with all write keywords (INSERT/UPDATE/DELETE/DROP/…) forbidden
   (comments and string literals stripped before checking).
2. **`guard.ts` execution limits** — runs inside a `READ ONLY` transaction with a
   5-second `statement_timeout` and a 500-row hard cap.

`schema.ts` provides the read-only schema description handed to Claude for the
translation step (`/api/knowledge/query/translate`); execution happens via
`/api/knowledge/query/run`.

### 5.5 The relationship: agents ↔ database ↔ knowledge storage

```mermaid
flowchart TB
    Agents["Agents (Discoverer/Designer/Evolver)<br/>run inside the pipeline"]
    KSvc["KnowledgeService"]
    Store["Knowledge storage<br/>(repo + pgvector tables)"]

    Agents -->|"read: reuse decisions, patterns, precedents, prior plan"| KSvc
    KSvc -->|"SQL + vector search"| Store
    Agents -.->|"write: completed RunReport → ingestRun()"| KSvc
    KSvc -.->|"persist specs, results, heals, embeddings"| Store
    Store -.->|"feeds the NEXT run"| KSvc
```

The agents never touch SQL directly — they only ever produce/consume artifacts.
The `KnowledgeService` is the _only_ component that talks to PostgreSQL.

---

## 6. Crawl → Design → Execute → Evolve lifecycle

This is the end-to-end story of a single run, from URL to report, with the files,
modules, and artifacts at each stage.

```mermaid
flowchart TD
    U[User URL + config] --> RM["Run Manager: start()<br/>runManager/manager.ts"]
    RM --> RS["runToReport()<br/>orchestrator/runService.ts"]
    RS --> RP["runPipeline()<br/>orchestrator/orchestrate.ts"]

    RP --> S1
    subgraph S1["① Discoverer — crawl & plan"]
        s1a["discoverTests() · crawlGate · cliGuard"] --> s1b["Browser via playwright-cli<br/>explores target site"]
        s1b --> s1c[["📄 specs/plan.md"]]
    end

    S1 --> S2
    subgraph S2["② Designer — generate tests"]
        s2a["designTests() + applyDesignerKnowledge()"] --> s2b["KnowledgeService: reuse/new decisions"]
        s2b --> s2c[["📄 tests/*.spec.ts<br/>(+ copied-forward reused specs)"]]
    end

    S2 --> S2b
    subgraph S2b["②b Validate (no LLM)"]
        v1["validateSuite() · validator/validate.ts"] --> v2[["📄 ValidationReport"]]
        v2 -->|missing scenarios| v3["regenerateMissingScenarios()"]
    end

    S2b --> S3
    subgraph S3["③ Execute + Evolve"]
        s3a["captureResults() → initial run<br/>results/parse.ts"] --> s3b[["📄 results.json"]]
        s3b --> s3c["evolveTests() — repair failures,<br/>fixme the unfixable"]
        s3c --> s3d["assessSuiteFlakiness() — re-run 3×"]
        s3d --> s3e["reconcileHealing() → healSuccessRate"]
    end

    S3 --> S4
    subgraph S4["④ Reporter"]
        s4a["generateNarrative() — Claude<br/>reporter/narrative.ts"] --> s4b["buildReport()<br/>reporter/report.ts"]
        s4b --> s4c[["📄 RunReport (JSON)"]]
    end

    S4 --> ING["knowledge.ingestRun(report)<br/>→ PostgreSQL"]
    S4 --> PERSIST["Run Manager persists run.json<br/>+ static report.html"]
    ING --> DONE([Done])
    PERSIST --> DONE
```

**Stage-by-stage detail:**

| Stage                  | Files / modules                                                                                                                                                                | Artifacts produced                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| **Start**              | `runManager/manager.ts`, `runStore/store.ts`, `orchestrator/runService.ts`                                                                                                     | `.runs/<id>/run.json` (status `pending`)                                        |
| **① Crawl & plan**     | `stages.ts:discoverTests`, `agents/runtime.ts`, `agents/crawlGate.ts`, `agents/cliGuard.ts`, agent `.claude/agents/playwright-test-discoverer.md`                              | `specs/plan.md`, `.auth/storageState.json`, `screenshots/*.png`                 |
| **② Design**           | `stages.ts:designTests` + `applyDesignerKnowledge`, `knowledge/assemble/contextPack.ts`, agent `playwright-test-designer.md`                                                   | `tests/*.spec.ts`                                                               |
| **②b Validate**        | `validator/validate.ts`                                                                                                                                                        | `ValidationReport` (in-memory)                                                  |
| **③ Execute & evolve** | `results/parse.ts` (`captureResults`, `assessSuiteFlakiness`, `reconcileHealing`), `agents/workspace.ts:runSuite`, `stages.ts:evolveTests`, agent `playwright-test-evolver.md` | `results.json`, repaired specs, `flakeRate`, `healSuccessRate`, `healingEvents` |
| **④ Report**           | `reporter/narrative.ts`, `reporter/report.ts`, `reporter/successRate.ts`, `claude/client.ts`                                                                                   | `RunReport`                                                                     |
| **Persist & learn**    | `runManager/persistence.ts`, `knowledge/ingest/ingestRun.ts`                                                                                                                   | `run.json` (final), `report.html`, knowledge rows in Postgres                   |

**Crawl scope** is decided by the `CrawlMode` (`src/types.ts`): `direct` (entry
page only, depth 0), `standard` (depth 1), `deep` (depth 2), `aggressive` (depth
10). The number of scenarios is capped by `effectiveScenarioCap` (page budget ×
per-mode rate, hard-capped at `MAX_TOTAL_TESTS`), so the Discoverer and Designer
share one source of truth for the budget.

---

## 7. Final report rendering

### 7.1 The report generation pipeline

```mermaid
flowchart TB
    subgraph Sources["Sources assembled into a report"]
        R1["TestResult[] — runner verdicts"]
        R2["CoverageSummary — coverage/coverage.ts"]
        R3["ValidationReport"]
        R4["flakeRate · healSuccessRate · healProvenance"]
        R5["generatedSpecs + plan.md"]
        R6["screenshots/*.png"]
        R7[Claude narrative:<br/>summary, issues, fixPrompts, recommendations]
    end

    R1 & R2 & R3 & R4 & R5 & R6 & R7 --> BR["buildReport()<br/>reporter/report.ts"]
    BR --> RR[("RunReport (canonical JSON)")]

    RR --> J["JSON<br/>/api/runs/[id]/report?format=json"]
    RR --> MD["renderMarkdown()<br/>reporter/render.ts → ?format=md"]
    RR --> HT["renderHtml()<br/>reporter/render.ts → ?format=html"]
    RR --> RV["React TestReportView.tsx<br/>(in-app rendering)"]

    HT --> Static["Static report.html on disk<br/>(persistence + bin/render-html.ts)"]
```

- **Sources.** `buildReport` (`src/reporter/report.ts`) is the single place a
  `RunReport` is assembled. It merges the runner's authoritative results, coverage,
  validation findings, flake/heal metrics, the generated specs, the agent
  screenshots, and the Claude-written narrative.
- **The narrative.** `generateNarrative` (`src/reporter/narrative.ts`) calls Claude
  (via `claude/client.ts`, model `claude-sonnet-4-6`) with the authoritative test
  counts and failure details, and parses back JSON: a per-test `summary`,
  `issues`, `fixPrompts` (one diagnosis + fix per failing test), `better`, and
  `recommendationsText`. The output token budget scales with test count, and the
  parser repairs truncated JSON; on total failure it degrades to an empty
  narrative rather than failing the run.
- **Markdown generation.** `renderMarkdown()` (`src/reporter/render.ts`) produces a
  structured Markdown document (summary, breakdown, results table, fix prompts,
  issues, validation findings).
- **HTML generation.** `renderHtml()` produces a **self-contained single-file HTML
  report** (embedded CSS from `app/components/TestReportView.css`, tabbed UI,
  searchable results table, screenshot lightbox, spec code viewer) viewable with no
  server. `bin/render-html.ts` (`npm run render:html -- <id>`) writes it to disk,
  and the Run Manager also writes a static `report.html` when a run reaches a
  terminal state.

### 7.2 UI rendering flow (how the report reaches the browser)

```mermaid
sequenceDiagram
    participant B as Browser (app/page.tsx)
    participant API as API routes
    participant RM as Run Manager
    participant Disk as .runs/&lt;id&gt;

    Note over B: Live progress while running
    B->>API: EventSource GET /api/runs/[id]/stream
    API->>RM: peek(id) every 400ms
    RM-->>API: new ProgressEvent[]
    API-->>B: SSE "progress" (id = index)
    Note over B,API: reconnect resumes via Last-Event-ID;<br/>: ping heartbeat every 15s

    Note over B: When the run is terminal
    API-->>B: SSE "end" { status, error }
    B->>API: GET /api/runs/[id]/report?format=json
    API->>RM: get(id) → report
    RM->>Disk: read run.json if not in memory
    RM-->>API: RunReport
    API-->>B: JSON
    B->>B: cache in reportsMap, render <TestReportView/>
```

- **Live progress** streams over **Server-Sent Events** from
  `/api/runs/[id]/stream`. The endpoint polls the in-memory run every 400ms,
  emits each `ProgressEvent` with a monotonic `id` (so a dropped connection
  resumes via `Last-Event-ID` without replay), and sends `: ping` heartbeats. The
  log panel is `TestRunDetailsPane.tsx`.
- **The finished report** is fetched as JSON and rendered in-app by
  `TestReportView.tsx` (dashboard with success-rate badge, "what was tested"
  narrative, searchable results table, and screenshot gallery). The same data is
  available as Markdown or standalone HTML via the `format` query parameter.
- **Trend charts** (`KnowledgeReuseTrend.tsx`, `HealProvenanceTrend.tsx`,
  `TrendChart.tsx`) call `/api/runs/[id]/reuse-trend` and `/heal-trend`, which read
  app-scoped history from the Knowledge Layer.

---

## 8. Appendix: all Mermaid diagrams

For quick reference, the major diagrams are grouped here by the topic they serve.

### 8.1 Overall system architecture

See [Section 2.1](#21-the-big-picture).

### 8.2 Agent interaction flow

See [Section 3.1](#31-the-four-agents-and-their-order) (sequence diagram) and
[Section 3.4](#34-the-guardrails-how-agents-are-kept-in-scope) (guardrails).

### 8.3 Knowledge retrieval flow

See [Section 4.1](#41-the-required-flow-user-url--designer) (URL → Designer),
[Section 4.2](#42-the-retrieval-tiers) (the three tiers), and
[Section 4.3](#43-context-assembly-how-it-all-gets-into-the-prompt) (assembly).

### 8.4 PostgreSQL integration

See [Section 5.1](#51-connection-layer-and-repositories),
[Section 5.3](#53-how-execution-data-is-stored-and-retrieved), and
[Section 5.5](#55-the-relationship-agents--database--knowledge-storage).

### 8.5 Execution lifecycle

See [Section 6](#6-crawl--design--execute--evolve-lifecycle).

### 8.6 Reporting architecture

See [Section 7.1](#71-the-report-generation-pipeline) (generation) and
[Section 7.2](#72-ui-rendering-flow-how-the-report-reaches-the-browser) (rendering).

---

### Quick file map (where to look)

| You want to understand…              | Start here                                             |
| ------------------------------------ | ------------------------------------------------------ |
| The whole pipeline wiring            | `src/orchestrator/orchestrate.ts`                      |
| What each agent stage does           | `src/orchestrator/stages.ts`                           |
| How agents are run + kept in scope   | `src/agents/runtime.ts`, `crawlGate.ts`, `cliGuard.ts` |
| Per-run files on disk                | `src/agents/workspace.ts`                              |
| Run lifecycle (start/cancel/persist) | `src/runManager/manager.ts`, `runStore/store.ts`       |
| The knowledge brain                  | `src/knowledge/index.ts`                               |
| Reuse / pattern / heal retrieval     | `src/knowledge/retrieve/*`, `assemble/contextPack.ts`  |
| Database schema                      | `src/knowledge/store/migrations/*.sql`                 |
| Report building & rendering          | `src/reporter/report.ts`, `narrative.ts`, `render.ts`  |
| The web app                          | `app/page.tsx`, `app/components/*`, `app/api/**`       |
| Shared types & budgets               | `src/types.ts`                                         |

> **Keeping this current.** The most authoritative facts (thresholds, table names,
> stage order) live in the files above. If this document and the code ever
> disagree, the code wins — please update this file when the architecture changes.
