# Tasks — AI UI Testing Tool

> Stage 3 (Assemble) deliverable. The ordered, traceable build checklist that
> pairs with `plan.md`. Each task is small (one clear outcome).

- **Targets Spec version:** v0.2.0
- **Status:** Approved
- **Last updated:** 2026-05-27

**Legend:** `[ ]` todo · `[x]` done · `[P]` may run in parallel with other `[P]`
tasks at the same dependency level.

> Renumbered fresh for v0.2.0. The v0.1.0 task list (T1–T23, all shipped) is
> superseded; this plan replaces the pipeline per Q10.

---

## Task list

### T1 — Add @anthropic-ai/claude-agent-sdk + smoke-test query() [x]

- **Covers:** R6, R12
- **Depends on:** —
- **Parallel:** no
- **Done-when:** a trivial `query()` call (no MCP) returns a response; SDK version pinned.

### T2 — Adopt the Playwright Agents pattern files [P] [x]

- **Covers:** R12, C7
- **Depends on:** —
- **Parallel:** yes
- **Done-when:** `.claude/agents/{planner,generator,healer}.md` copied from the reference, `.mcp.json` (playwright-test) and `seed.spec.ts` present.

### T3 — Smoke-test the playwright run-test-mcp-server [x]

- **Covers:** R12, C7
- **Depends on:** T2
- **Parallel:** no
- **Done-when:** `npx playwright run-test-mcp-server` boots and its tool list (browser\_\*, planner_save_plan, generator_write_test, test_run) is confirmed reachable.

### T4 — Agent runtime wrapper over the Agent SDK + MCP [x]

- **Covers:** R6, R12
- **Depends on:** T1, T3
- **Parallel:** no
- **Done-when:** `runAgent({name, prompt, cwd, onEvent})` runs an agent against the MCP and streams typed progress events; unit-tested with a stubbed query.

### T5 — Per-run workspace builder [x]

- **Covers:** R12, R13, R14
- **Depends on:** —
- **Parallel:** no
- **Done-when:** creating a run yields a gitignored `.runs/<id>/` with `seed.spec.ts` and `tests/`+plan locations; unit-tested.

### T6 — Planner stage → Markdown test plan [x]

- **Covers:** R2, R13
- **Depends on:** T4, T5
- **Parallel:** no
- **Done-when:** running the planner produces a persisted Markdown plan file (titled scenarios + numbered steps) in the run workspace.

### T7 — Generator stage → Playwright specs [x]

- **Covers:** R3, R14
- **Depends on:** T6
- **Parallel:** no
- **Done-when:** running the generator emits one `.spec.ts` per planned scenario into the workspace.

### T8 — Healer stage → run/repair + test.fixme() [x]

- **Covers:** R4, R9, R15
- **Depends on:** T7
- **Parallel:** no
- **Done-when:** running the healer executes the suite, repairs locator failures, and marks unfixable tests `test.fixme()` with a comment.

### T9 — Results parser (Playwright results + fixme detection) [x]

- **Covers:** R4, R15
- **Depends on:** T8
- **Parallel:** no
- **Done-when:** Playwright run output → `TestResult[]` with passed/failed/healed and `fixme`/skipped flagged; unit-tested (reuses/adapts mapPlaywrightResults).

### T10 — Flake check (re-run N×) [P] [x]

- **Covers:** R7
- **Depends on:** T9
- **Parallel:** yes
- **Done-when:** the generated suite re-runs N times on the unchanged app; divergent tests flagged and a flake rate computed (reuses flake/flake.ts).

### T11 — Coverage calc vs curated flows [P] [x]

- **Covers:** R2
- **Depends on:** T6
- **Parallel:** yes
- **Done-when:** planner flows compared to the curated fixture → coverage % (reuses coverage/coverage.ts).

### T12 — Success-rate + per-test buckets [x]

- **Covers:** R16
- **Depends on:** T9
- **Parallel:** no
- **Done-when:** computes success rate = passed ÷ all planned (fixme = not-passed, Q7/D7) and classifies each test as passed / needs-attention / where-to-improve; unit-tested.

### T13 — Reporter narrative (fix prompts, issues, recommendations) [x]

- **Covers:** R16
- **Depends on:** T9
- **Parallel:** no
- **Done-when:** a Claude call (reusing `claude/client.ts`) over failures + spec sources returns fix prompts, issues-found, and recommendations; pure parsing unit-tested with a fake client.

### T14 — Extend RunReport model [x]

- **Covers:** R11, R16, R17
- **Depends on:** —
- **Parallel:** no
- **Done-when:** `RunReport` includes successRate, buckets, fixPrompts[], issues[], recommendations[], planMarkdown, generatedSpecs[{file,code}]; typecheck clean.

### T15 — Build rich report (assemble RunReport) [x]

- **Covers:** R5, R11, R16, R17
- **Depends on:** T10, T11, T12, T13, T14
- **Parallel:** no
- **Done-when:** a run's data assembles into the extended RunReport (JSON), incl. plan markdown + spec sources; unit-tested.

### T16 — Rich Markdown + HTML renderers [x]

- **Covers:** R5, R16
- **Depends on:** T14
- **Parallel:** no
- **Done-when:** renderers output all R16 sections (summary, URL, success rate %, breakdown, fix prompts, issues, recommendations); HTML escaped; unit-tested.

### T17 — Orchestrator rewrite (planner→generator→healer→reporter) [x]

- **Covers:** R8, R12
- **Depends on:** T6, T7, T8, T9, T10, T11, T15
- **Parallel:** no
- **Done-when:** one call runs the four stages in order, emits per-stage progress events, and produces the RunReport; failure in any stage marks the run failed (no false pass); unit-tested with stubbed stages.

### T18 — API: start / SSE / report + spec sources [x]

- **Covers:** R1, R5, R8, R11, R17
- **Depends on:** T17
- **Parallel:** no
- **Done-when:** POST /api/runs validates + starts a run; SSE streams agent stages; report endpoint serves MD/HTML/JSON incl. plan + spec sources.

### T19 — UI: agent-stage progress view [x]

- **Covers:** R8, R12
- **Depends on:** T18
- **Parallel:** no
- **Done-when:** RunView shows live Planner→Generator→Healer→Reporter progress over SSE.

### T20 — UI: rich report view [P] [x]

- **Covers:** R5, R8, R16
- **Depends on:** T19
- **Parallel:** yes
- **Done-when:** the report renders app URL, success rate %, passed/needs-attention/improve breakdown, fix prompts, issues, and recommendations, plus downloads.

### T21 — UI: code-view tab [P] [x]

- **Covers:** R17
- **Depends on:** T19
- **Parallel:** yes
- **Done-when:** a tab in the report displays the generated `.spec.ts` sources and the Markdown plan.

### T22 — CI entry update

- **Covers:** R10, R11
- **Depends on:** T17
- **Parallel:** no
- **Done-when:** `bin/run-ci.ts` runs the new orchestrator headless, writes JSON, and exits non-zero when the success rate indicates failures.

### T23 — Remove superseded v0.1.0 pipeline modules

- **Covers:** R12
- **Depends on:** T17
- **Parallel:** no
- **Done-when:** `src/crawler`, `src/flows`, `src/generator`, `src/runner/runner.ts`, `src/healer` and their tests are removed; reused helpers (coverage, flake, mapPlaywrightResults) retained; full test suite + typecheck + build green.

---

## Coverage matrix — requirements → tasks

| Requirement | Covered by task(s)      | Covered? |
| ----------- | ----------------------- | -------- |
| R1          | T18                     | ✅       |
| R2          | T6, T11                 | ✅       |
| R3          | T7                      | ✅       |
| R4          | T8, T9                  | ✅       |
| R5          | T15, T16, T18, T20      | ✅       |
| R6          | T1, T4, T13             | ✅       |
| R7          | T10                     | ✅       |
| R8          | T17, T18, T19, T20      | ✅       |
| R9          | T8                      | ✅       |
| R10         | T22                     | ✅       |
| R11         | T14, T15, T18, T22      | ✅       |
| R12         | T1, T2, T4, T17, T23    | ✅       |
| R13         | T6                      | ✅       |
| R14         | T7                      | ✅       |
| R15         | T8, T9                  | ✅       |
| R16         | T12, T13, T15, T16, T20 | ✅       |
| R17         | T14, T18, T21           | ✅       |

> **Gate check before Forge:**
>
> - Every requirement row shows ✅ (≥1 task).
> - Every task (T1–T23) appears in the matrix and cites ≥1 requirement — no scope creep.

---

_Stage 3 (Assemble) artifact. Approve alongside `plan.md` at the Human Gate,
then proceed to `/craft-framework:forge`._
