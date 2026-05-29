# Plan (Design) — AI UI Testing Tool

> Stage 3 (Assemble) deliverable. Defines **HOW** to build what the Spec
> describes. Pairs with `tasks.md`. Every design choice traces to a requirement
> or constraint in the Spec.

- **Targets Spec version:** v0.2.0
- **Status:** Approved
- **Last updated:** 2026-05-27

---

## Approach

Keep the v0.1.0 **Next.js hybrid shell** (web UI + API + run store + SSE) but
**replace the bespoke prompt pipeline with the Playwright Agents pattern**. A run
executes four sequential stages: **Planner → Generator → Healer → Reporter**. The
first three are the official Playwright agent definitions, run programmatically
via **`@anthropic-ai/claude-agent-sdk`** `query()` using terminal-based
**`playwright-cli`** commands (live browser, file writes, test execution). The Reporter is ours: it
computes the success rate + buckets deterministically and uses a Claude call to
write fix prompts, issues, and recommendations. Each run gets an isolated
workspace (`.runs/<id>/` with `seed.spec.ts`, the Markdown plan, and generated
specs) so agents read/write files and the UI can read them back for the
**code-view tab**. Progress streams over the existing SSE; the rich report renders
in the UI and downloads as MD/HTML/JSON.

## Architecture & structure

```
ai-ui-testing-tool/
├── .claude/agents/                 # official agent defs (planner/generator/healer) (C7, R12)
│   ├── playwright-test-planner.md
│   ├── playwright-test-generator.md
│   └── playwright-test-healer.md
├── .mcp.json                       # playwright run-test-mcp-server config (C7)
├── seed.spec.ts                    # seed test the generator builds from
├── app/
│   ├── page.tsx + RunForm.tsx      # URL input (reused) (R1, R8)
│   ├── runs/[id]/                  # RunView: agent-stage progress + rich report + code-view tab (R8,R16,R17)
│   └── api/runs/...                # start / SSE / report endpoints (reused, extended) (R1,R8,R5,R11)
├── src/
│   ├── agents/runtime.ts           # Agent SDK wrapper: runAgent(name,prompt,cwd,onEvent) (R6,R12)
│   ├── agents/workspace.ts         # per-run .runs/<id>/ workspace (R12,R13,R14)
│   ├── orchestrator/orchestrate.ts # planner→generator→healer→reporter sequencing (rewrite) (R12)
│   ├── results/parse.ts            # Playwright results + fixme detection → TestResult[] (R4,R15)
│   ├── flake/flake.ts              # re-run suite N times → flake rate (reused) (R7)
│   ├── coverage/coverage.ts        # curated-flow coverage (reused) (R2,M1)
│   ├── reporter/
│   │   ├── successRate.ts          # passed ÷ all planned; bucket each test (R16, Q7)
│   │   ├── narrative.ts            # Claude → fix prompts / issues / recommendations (R16)
│   │   ├── report.ts               # build extended RunReport (R11,R16,R17)
│   │   └── render.ts               # rich Markdown + HTML (rewrite) (R5,R16)
│   ├── claude/client.ts            # reused — powers the Reporter narrative (R6)
│   ├── runStore/store.ts           # reused (globalThis) (R8)
│   └── types.ts                    # extended report model (R16,R17)
├── bin/run-ci.ts                   # CI entry (updated) (R10,R11)
└── fixtures/tarento-flows.json     # curated flows (reused) (M1)
```

**Removed (superseded by agents+MCP):** `src/crawler/*`, `src/flows/*`,
`src/generator/*`, `src/runner/runner.ts`, `src/healer/*` (Q10 = replace).

## Components / modules

| Component                | Responsibility                                          | Addresses            |
| ------------------------ | ------------------------------------------------------- | -------------------- |
| Agent runtime            | Run one agent def via Agent SDK + MCP, stream events    | R6, R12              |
| Run workspace            | Isolated `.runs/<id>/` dir (seed, plan, specs)          | R12, R13, R14        |
| Planner stage            | Explore app → save Markdown test plan                   | R2, R13              |
| Generator stage          | Plan → Playwright `.spec.ts` files                      | R3, R14              |
| Healer stage             | Run + repair suite; `test.fixme()` the unfixable        | R4, R9, R15          |
| Results parser           | Playwright results (+fixme) → TestResult[]              | R4, R15              |
| Flake check              | Re-run suite N× → flake rate                            | R7                   |
| Coverage calc            | Curated-flow coverage (M1)                              | R2                   |
| Success-rate + buckets   | passed÷planned; classify passed/needs-attention/improve | R16                  |
| Reporter narrative       | Claude → fix prompts, issues, recommendations           | R16                  |
| Report model + renderers | Extended RunReport; rich MD/HTML/JSON                   | R5, R11, R16, R17    |
| Web UI (RunView)         | Agent-stage progress, rich report, code-view tab        | R8, R16, R17         |
| API                      | Start run, SSE, serve report + spec sources             | R1, R8, R5, R11, R17 |
| CI entry                 | Headless run, JSON, exit code                           | R10, R11             |

## Data flow

1. **Submit** — UI POSTs `{url, config}` → validated → run created → background job starts.
2. **Workspace** — create `.runs/<id>/` with `seed.spec.ts` and a `specs/`+`tests/` layout.
3. **Planner** — Agent SDK runs the planner def against the MCP; it explores the
   live app and calls `planner_save_plan` → Markdown plan in the workspace.
4. **Generator** — Agent SDK runs the generator def over the plan; `generator_write_test`
   emits one `.spec.ts` per scenario into the workspace.
5. **Healer** — Agent SDK runs the healer def; `test_run`/`test_debug` execute and
   repair; unfixable tests become `test.fixme()` with a comment.
6. **Results** — parse Playwright results (+ detect fixme/skipped) → TestResult[];
   flake check re-runs N×; coverage computed vs curated flows.
7. **Reporter** — compute success rate (passed÷planned; fixme=not-passed) + buckets;
   Claude narrative produces fix prompts/issues/recommendations; assemble RunReport
   (incl. plan markdown + generated spec sources).
8. **Stream/serve** — per-stage progress over SSE; report served as MD/HTML/JSON;
   UI shows rich report + code-view tab.

- **Error paths:** invalid/unreachable URL → validation error + non-zero CI exit, no
  report; an agent stage failing → run marked failed with the stage + reason (no false pass);
  MCP server unavailable → clear setup error.

## Dependencies & integration points

- **`@anthropic-ai/claude-agent-sdk`** — programmatic agent runner (streaming).
- **`@playwright/cli`** — the agent browser automation tool surface (requires running `npx playwright-cli install --skills` to install skills locally).
- Official agent defs copied from `/Users/senthilpalanivelu/Downloads/test/.claude/agents`.
- Reused v0.1.0: Next.js app, run store, SSE, validation, coverage calc, flake, Claude client.
- Anthropic API key (DEP1), Playwright browsers (DEP2), tarento.com (DEP3), curated fixture (DEP4).

## Key decisions

| ID  | Decision                                                                       | Rationale                                                                                      | Driven by     |
| --- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | ------------- |
| D1  | Adopt official Playwright Agents (copy defs + seed)                              | Faithful to the reference pattern the user requires                                            | C7, R12       |
| D2  | Run agents via `@anthropic-ai/claude-agent-sdk` `query()`, 3 sequential calls  | SDK supports custom prompt + streaming; sequential keeps planner→gen→heal context             | Q8, R12       |
| D3  | Per-run workspace `.runs/<id>/` (gitignored)                                   | Agents need a real filesystem to read the plan + write specs; UI reads them back for code-view | R13, R14, R17 |
| D4  | Reporter = deterministic metrics + Claude narrative (reuse `claude/client.ts`) | Success rate is math; fix prompts/recommendations need reasoning; no browser needed            | R16           |
| D5  | Keep Next.js shell + run store + SSE + report endpoints; rebuild reporter rich | Q10 = replace pipeline, keep shell; minimizes thrown-away work                                 | Q10, R8       |
| D6  | Remove superseded modules (crawler/flows/generator/validate/runner/healer)     | Q10 = replace, no dual paths; honors simplicity                                                | Q10, C6       |
| D7  | Success rate = passed ÷ all planned tests; `test.fixme()` counts as not-passed | User decision (Q7); avoids inflating score by quarantining                                     | Q7, R16       |
| D8  | Runs execute as background jobs streaming over SSE (existing pattern)          | Agent+browser runs take minutes; must not block the request                                    | R8            |

## Risks & mitigations

| ID  | Risk                                                                  | Likelihood | Impact | Mitigation                                                                           |
| --- | --------------------------------------------------------------------- | ---------- | ------ | ------------------------------------------------------------------------------------ |
| RK1 | Agent + browser runs are slow/expensive (3 agent loops + MCP browser) | High       | Med    | Bound crawl/plan scope; document cost; reuse v1's small caps for tests/demo          |
| RK2 | Agent SDK / CLI API drift vs. docs                                    | Med        | High   | Pin versions; T1/T3 smoke tests up front before building on them                     |
| RK3 | Long-running job hits Next route timeout                              | Med        | Med    | Background job + SSE (D8); never run in the request lifecycle                        |
| RK4 | `test.fixme()` tests leak into "passed"                               | Med        | High   | D7 success-rate rule + a dedicated test (AC15)                                       |
| RK5 | Brittle parsing of agent outputs (plan path, spec files, results)     | Med        | Med    | Read deterministically from the workspace; rely on standard file writes              |
| RK6 | `playwright-cli` or skills not installed/bootable in env              | Low        | High   | Verify `@playwright/cli` package is installed and `npx playwright-cli install --skills` is run |

---

## Requirements coverage (design level)

| Requirement | Addressed by (component / decision)                      |
| ----------- | -------------------------------------------------------- |
| R1          | RunForm + API validation (reused)                        |
| R2          | Planner stage + coverage calc                            |
| R3          | Generator stage                                          |
| R4          | Healer stage + results parser                            |
| R5          | Report renderers + report endpoints + UI                 |
| R6          | Agent runtime (Agent SDK) + Claude client (D2, D4)       |
| R7          | Flake check (reused)                                     |
| R8          | Next.js shell + run store + SSE + UI (D5, D8)            |
| R9          | Healer stage                                             |
| R10         | CI entry                                                 |
| R11         | Report model + JSON + CI output                          |
| R12         | Agent defs + runtime + orchestrator rewrite (D1, D2, D6) |
| R13         | Planner stage → Markdown plan in workspace               |
| R14         | Generator stage → specs in workspace                     |
| R15         | Healer stage (fixme) + results parser                    |
| R16         | Success-rate+buckets + narrative + renderers (D4, D7)    |
| R17         | Report model (plan + spec sources) + code-view tab       |

---

_Stage 3 (Assemble) artifact. Approve alongside `tasks.md` at the Human Gate,
then proceed to `/craft-framework:forge`. Must respect every rule in
`CONSTITUTION.md`._
