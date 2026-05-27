# Tasks — AI UI Testing Tool

> Stage 3 (Assemble) deliverable. The ordered, traceable build checklist that
> pairs with `plan.md`. Each task is small (one clear outcome).

- **Targets Spec version:** v0.1.0
- **Status:** Approved
- **Last updated:** 2026-05-27

**Legend:** `[ ]` todo · `[x]` done · `[P]` may run in parallel with other `[P]`
tasks at the same dependency level.

---

## Task list

### T1 — Scaffold Next.js + React 19 + TS app with Chakra/Framer/Lucide

- **Covers:** R8
- **Depends on:** —
- **Parallel:** no
- **Done-when:** `npm run dev` serves a blank Chakra-themed page; TypeScript builds clean.

### T2 — Install & configure Playwright + browser binaries [P]

- **Covers:** R3, R4 (C1)
- **Depends on:** T1
- **Parallel:** yes
- **Done-when:** a trivial Playwright test runs headless via the Playwright runner.

### T3 — Add Anthropic SDK + Claude client wrapper with call logging [P]

- **Covers:** R6
- **Depends on:** T1
- **Parallel:** yes
- **Done-when:** a wrapper function calls Claude with an API key and logs each Anthropic request (verifiable for AC5).

### T4 — Define run state model + in-memory run store + run ID lifecycle [P]

- **Covers:** R8
- **Depends on:** T1
- **Parallel:** yes
- **Done-when:** a run can be created, fetched, and status-updated by ID in memory.

### T5a — Crawler: Playwright navigation/traversal with scope+depth limits

- **Covers:** R1 (config), R2
- **Depends on:** T2
- **Parallel:** no
- **Done-when:** crawling a URL visits reachable pages within a configured depth/scope and returns the visited page set.

### T5b — Crawler: extract interactive elements + links into a structured map

- **Covers:** R2
- **Depends on:** T5a
- **Parallel:** no
- **Done-when:** each visited page yields a structured record of links and interactive elements (role, selector hint, label).

### T6 — Flow identifier: Claude turns crawl data into candidate primary flows

- **Covers:** R2, R6
- **Depends on:** T3, T5b
- **Parallel:** no
- **Done-when:** given crawl output, Claude returns a list of named candidate flows with steps.

### T7a — Test generator: Claude generates a Playwright test from a flow

- **Covers:** R3, R6
- **Depends on:** T3, T6
- **Parallel:** no
- **Done-when:** for a candidate flow, Claude returns a Playwright test file as text.

### T7b — Test generator: validate/parse generated test, regenerate on failure

- **Covers:** R3
- **Depends on:** T7a
- **Parallel:** no
- **Done-when:** generated tests that don't parse/compile are rejected and regenerated (capped retries) before any run (D8).

### T8 — Test runner: execute generated tests, capture pass/fail + failure detail

- **Covers:** R4
- **Depends on:** T2, T7b
- **Parallel:** no
- **Done-when:** running generated tests yields per-test status and a failure reason for each failure.

### T9 — Flake detector: re-run on unchanged app, flag divergence, compute rate [P]

- **Covers:** R7
- **Depends on:** T8
- **Parallel:** yes
- **Done-when:** a test whose result differs across N identical re-runs is flagged and a flake rate is reported.

### T10 — Auto-healer: detect locator failure, Claude repair + re-run, record outcome [P]

- **Covers:** R9, R6
- **Depends on:** T3, T8
- **Parallel:** yes
- **Done-when:** a deliberately broken locator triggers a repair attempt and the heal outcome (healed/not) is recorded.

### T11 — Coverage calculator: tested flows vs curated list → M1 %

- **Covers:** R2
- **Depends on:** T6, T8, T12
- **Parallel:** no
- **Done-when:** given tested flows and the curated list, it outputs coverage % matching M1's formula.

### T12 — Curated primary-flow list for tarento.com (fixture) [P]

- **Covers:** R2
- **Depends on:** —
- **Parallel:** yes
- **Done-when:** `fixtures/tarento-flows.json` lists the agreed primary flows (resolves Q2/DEP4).

### T13 — Reporter: assemble run results into a JSON report

- **Covers:** R11
- **Depends on:** T8, T9, T10, T11
- **Parallel:** no
- **Done-when:** a run produces a structured JSON report (flows, per-test results, coverage, flake, heal).

### T14 — Reporter: render Markdown + HTML from the JSON report

- **Covers:** R5
- **Depends on:** T13
- **Parallel:** no
- **Done-when:** the JSON report renders to readable Markdown and HTML files.

### T15a — Orchestrator: chain pipeline stages end-to-end

- **Covers:** R2, R3, R4, R5
- **Depends on:** T5b, T6, T7b, T8, T9, T10, T13
- **Parallel:** no
- **Done-when:** one call runs crawl→identify→generate→run→flake→heal→report to completion for a URL.

### T15b — Orchestrator: emit ordered progress events per stage

- **Covers:** R8
- **Depends on:** T15a
- **Parallel:** no
- **Done-when:** each pipeline stage emits a typed progress event consumable by the SSE layer.

### T16 — API: POST /api/runs to start a run (validate URL + config)

- **Covers:** R1, R8
- **Depends on:** T4, T15a
- **Parallel:** no
- **Done-when:** POSTing a valid URL starts a run and returns its ID; invalid input is rejected with a clear error.

### T17 — API: SSE endpoint streaming run progress events

- **Covers:** R8
- **Depends on:** T15b, T16
- **Parallel:** no
- **Done-when:** a client subscribed to the SSE endpoint receives live progress events for a run.

### T18 — API: report retrieval/download endpoints (MD / HTML / JSON) [P]

- **Covers:** R5, R11, R8
- **Depends on:** T13, T14, T16
- **Parallel:** yes
- **Done-when:** each format can be fetched for a completed run.

### T19 — UI: URL input form with validation + optional scope config

- **Covers:** R1, R8
- **Depends on:** T16
- **Parallel:** no
- **Done-when:** submitting the form starts a run and navigates to its progress view.

### T20 — UI: live progress view consuming SSE

- **Covers:** R8
- **Depends on:** T17, T19
- **Parallel:** no
- **Done-when:** the page shows live crawl/generate/run/heal progress as it streams.

### T21 — UI: report viewer + downloads; label flaky/healed results [P]

- **Covers:** R5, R7, R11, R8
- **Depends on:** T18, T20
- **Parallel:** yes
- **Done-when:** a completed run shows the report with pass/fail, coverage, flaky+healed labels, and working downloads.

### T22 — UI: error states for invalid/unreachable URL (no false "passed") [P]

- **Covers:** R1, R8
- **Depends on:** T19
- **Parallel:** yes
- **Done-when:** an invalid/unreachable URL shows a clear error and no success report is presented.

### T23 — CI entry: headless run writes JSON and sets exit code

- **Covers:** R10, R11
- **Depends on:** T13, T15a
- **Parallel:** no
- **Done-when:** `bin/run-ci.ts <url>` runs non-interactively, writes JSON, and exits non-zero when tests fail.

---

## Coverage matrix — requirements → tasks

| Requirement | Covered by task(s)                              | Covered? |
| ----------- | ----------------------------------------------- | -------- |
| R1          | T5a, T16, T19, T22                              | ✅       |
| R2          | T5a, T5b, T6, T11, T12, T15a                    | ✅       |
| R3          | T2, T7a, T7b, T15a                              | ✅       |
| R4          | T2, T8, T15a                                    | ✅       |
| R5          | T14, T15a, T18, T21                             | ✅       |
| R6          | T3, T6, T7a, T10                                | ✅       |
| R7          | T9, T21                                         | ✅       |
| R8          | T1, T4, T15b, T16, T17, T18, T19, T20, T21, T22 | ✅       |
| R9          | T10                                             | ✅       |
| R10         | T23                                             | ✅       |
| R11         | T13, T18, T21, T23                              | ✅       |

> **Gate check before Forge:**
>
> - Every requirement row shows ✅ (≥1 task).
> - Every task (T1–T23) appears in the matrix and cites ≥1 requirement — no scope creep.

---

_Stage 3 (Assemble) artifact. Approve alongside `plan.md` at the Human Gate,
then proceed to `/craft-framework:forge`._
