# Plan (Design) — AI UI Testing Tool

> Stage 3 (Assemble) deliverable. Defines **HOW** to build what the Spec
> describes. Pairs with `tasks.md`. Every design choice traces back to a
> requirement or constraint in the Spec.

- **Targets Spec version:** v0.1.0
- **Status:** Approved
- **Last updated:** 2026-05-27

---

## Approach

A single full-stack **Next.js (App Router) + React 19 + TypeScript** application
that is both the web UI and the API/agent host. A user submits a URL in the UI;
an in-process **Orchestrator** drives a pipeline — crawl → identify flows →
generate Playwright tests → run → flake-check → auto-heal → report — emitting
progress over **Server-Sent Events (SSE)**. **Claude (Anthropic TS SDK)** is the
reasoning engine for crawling guidance, flow identification, test generation, and
healing. **Playwright** does all browser automation. Reports are produced as
JSON (source of truth) and rendered to Markdown + HTML. A headless CLI entry
reuses the same Orchestrator for CI/CD. v1 keeps state in memory and generates
fresh tests per run (persistence is out of scope).

## Architecture & structure

```
ai-ui-testing-tool/
├── app/                      # Next.js App Router (UI + API)
│   ├── page.tsx              # URL input form + entry (R1, R8)
│   ├── runs/[id]/page.tsx    # Live progress + report viewer (R8, R5)
│   └── api/
│       ├── runs/route.ts             # POST start run (R1, R8)
│       ├── runs/[id]/stream/route.ts # SSE progress (R8)
│       └── runs/[id]/report/route.ts # MD/HTML/JSON download (R5, R11)
├── src/
│   ├── orchestrator/         # Pipeline chaining + progress events (R2–R5)
│   ├── crawler/              # Playwright crawl + element extraction (R2)
│   ├── flows/                # Claude flow identification (R2, R6)
│   ├── generator/            # Claude → Playwright test files (R3, R6)
│   ├── runner/               # Execute tests, capture results (R4)
│   ├── flake/                # Re-run divergence detection (R7)
│   ├── healer/               # Locator-failure repair via Claude (R9, R6)
│   ├── coverage/             # Tested vs curated flows → M1 (R2)
│   ├── reporter/             # JSON + Markdown + HTML (R5, R11)
│   ├── claude/               # Anthropic SDK wrapper + call logging (R6)
│   └── runStore/             # In-memory run state + lifecycle (R8)
├── bin/run-ci.ts             # Headless CI entry (R10, R11)
└── fixtures/tarento-flows.json # Curated primary flows for tarento.com (DEP4)
```

## Components / modules

| Component       | Responsibility                                                            | Addresses   |
| --------------- | ------------------------------------------------------------------------- | ----------- |
| Web UI          | URL form, live progress (SSE), report viewer, downloads, error states     | R1, R5, R8  |
| API routes      | Start run, stream progress, serve reports                                 | R1, R8, R11 |
| Orchestrator    | Chain the pipeline stages; emit progress events                           | R2–R5       |
| Crawler         | Playwright navigation + page/element/link extraction (scope/depth limits) | R1, R2      |
| Flow identifier | Claude turns crawl data into candidate primary flows                      | R2, R6      |
| Test generator  | Claude generates runnable Playwright tests from flows                     | R3, R6      |
| Test runner     | Execute Playwright tests; capture pass/fail + failure detail              | R4          |
| Flake detector  | Re-run on unchanged app; flag divergence; compute flake rate              | R7          |
| Auto-healer     | Detect locator failure; Claude repair + re-run; record heal outcome       | R9, R6      |
| Coverage calc   | Compare tested flows vs curated list → M1 %                               | R2          |
| Reporter        | Assemble JSON; render Markdown + HTML                                     | R5, R11     |
| Claude client   | Anthropic SDK wrapper; logs Anthropic calls (verifiability)               | R6          |
| Run store       | In-memory run state + IDs + lifecycle                                     | R8          |
| CI entry        | Headless non-interactive run; JSON out; exit code                         | R10, R11    |

## Data flow

1. **Submit** — UI POSTs `{url, config}` to `/api/runs`; input validated; a run
   ID is created in the run store; the Orchestrator starts asynchronously.
2. **Crawl** — Crawler drives Playwright over the target within scope/depth
   limits, extracting pages, interactive elements, and links.
3. **Identify** — Flow identifier sends crawl data to Claude → candidate flows.
4. **Generate** — Test generator asks Claude for Playwright tests per flow;
   generated tests are validated (compile/parse) before running.
5. **Run** — Test runner executes the tests, capturing per-test pass/fail +
   failure reason.
6. **Flake check** — selected tests re-run N times on the unchanged app;
   divergence flagged; flake rate computed.
7. **Heal** — locator failures handed to the auto-healer (Claude repair + re-run);
   heal outcome recorded.
8. **Report** — coverage calc + results → JSON; rendered to Markdown + HTML.
9. **Stream/serve** — progress events stream to the UI via SSE throughout;
   reports served for view/download.

- **Error paths:** invalid/unreachable URL → validation error to UI + non-zero
  exit in CI, no report emitted; invalid generated test → regenerate or mark the
  flow failed (never silently drop); auth-required pages → out of scope, skipped.

## Dependencies & integration points

- **Next.js (App Router) + React 19 + TypeScript** — app shell + API.
- **Chakra UI + Framer Motion + Lucide** — UI components, motion, icons.
- **Playwright** (+ browser binaries) — browser automation (C1).
- **@anthropic-ai/sdk** — Claude reasoning engine (C3, R6); requires API key (DEP1).
- **Reference app:** tarento.com (DEP3); curated flow fixture (DEP4).

## Key decisions

| ID  | Decision                                                            | Rationale                                                            | Driven by  |
| --- | ------------------------------------------------------------------- | -------------------------------------------------------------------- | ---------- |
| D1  | Single Next.js full-stack app (UI + API in one)                     | One language/runtime; least friction; Playwright & Anthropic both TS | R8, Q6     |
| D2  | Chakra UI + Framer Motion + Lucide                                  | User-specified UI stack                                              | R8         |
| D3  | Playwright for all browser automation                               | Spec constraint                                                      | C1         |
| D4  | Claude via @anthropic-ai/sdk as reasoning engine, with call logging | Spec constraint; logging makes R6 verifiable (AC5)                   | C3, R6     |
| D5  | SSE for progress streaming                                          | User-specified; good fit for long runs, simpler than websockets      | R8         |
| D6  | In-memory run store (no DB) for v1                                  | Simplicity rule; persistence is out of scope                         | C6         |
| D7  | Fresh tests generated per run (no persistence)                      | Matches Spec out-of-scope (no versioned suites)                      | Spec scope |
| D8  | Validate generated tests before running                             | Claude output may not compile; avoid false failures                  | R3, RK1    |
| D9  | Auto-heal limited to locator-type failures in v1                    | Bounds the hardest feature; matches M3 framing                       | R9         |
| D10 | CI mode reuses the same Orchestrator via `bin/run-ci.ts`            | One pipeline, two entry points; avoids divergence                    | R10        |

## Risks & mitigations

| ID  | Risk                                                    | Likelihood | Impact | Mitigation                                                                   |
| --- | ------------------------------------------------------- | ---------- | ------ | ---------------------------------------------------------------------------- |
| RK1 | Claude-generated Playwright tests don't compile/run     | High       | High   | Validate/parse generated tests (D8); regenerate on failure; cap retries      |
| RK2 | Flaky generated tests erode trust                       | Med        | High   | Explicit flake detection (T9) + visible labeling (Constitution: determinism) |
| RK3 | Long crawl/run blocks the request or serverless timeout | Med        | Med    | Run as in-process async job, stream via SSE; cap crawl depth/time            |
| RK4 | Large v1 scope (UI + agent + heal + CI) overruns        | High       | Med    | Task order lands the core loop usable before heal/CI; heal & CI are Should   |
| RK5 | tarento.com blocks bots / changes structure             | Low        | Med    | Respect robots, throttle; curated flow fixture decouples M1 from churn       |

---

## Requirements coverage (design level)

| Requirement | Addressed by (component / decision)                    |
| ----------- | ------------------------------------------------------ |
| R1          | Web UI form + API validation + Crawler scope config    |
| R2          | Crawler + Flow identifier + Coverage calc (D3)         |
| R3          | Test generator + Playwright (D3, D8)                   |
| R4          | Test runner                                            |
| R5          | Reporter (Markdown + HTML) + report API + UI viewer    |
| R6          | Claude client (D4) used by identifier/generator/healer |
| R7          | Flake detector + UI labeling (D6 n/a)                  |
| R8          | Next.js app: UI + API + SSE + run store (D1, D5, D6)   |
| R9          | Auto-healer (D9)                                       |
| R10         | CI entry `bin/run-ci.ts` (D10)                         |
| R11         | Reporter JSON + report API + CI output                 |

---

_Stage 3 (Assemble) artifact. Approve alongside `tasks.md` at the Human Gate,
then proceed to `/craft-framework:forge`. Must respect every rule in
`CONSTITUTION.md`._
