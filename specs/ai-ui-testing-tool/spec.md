# Spec — AI UI Testing Tool

> Stage 2 (Record) deliverable. The single source of truth and contract for
> everything that follows: **if it isn't in this Spec, it doesn't get built.**
> Describes WHAT "done" means, never HOW to build it.

- **Version:** v0.1.0
- **Status:** Approved
- **Source Brief:** `specs/ai-ui-testing-tool/brief.md`
- **Last updated:** 2026-05-27

---

## Overview

An autonomous, AI-powered front-end UI testing tool, delivered as a web service
with a UI. A user submits a web app URL; the tool uses Claude to crawl the app,
discover user flows, generate runnable Playwright tests, execute them, and return
a report (Markdown, HTML, and JSON). v1 covers the full core loop plus
auto-healing of broken tests and CI/CD-friendly execution. Authentication/login
testing is deferred to v2. The goal is to prove an agent can deliver meaningful
UI test coverage from little more than a URL.

## Requirements

| ID  | Requirement (what the result must do)                                                                                       | Priority |
| --- | --------------------------------------------------------------------------------------------------------------------------- | -------- |
| R1  | Accept a web app URL as input via the web UI, with optional configuration (e.g. scope/depth limits).                        | Must     |
| R2  | Autonomously crawl the app to discover reachable pages, interactive elements, and candidate user flows.                     | Must     |
| R3  | Generate runnable **Playwright** UI tests for the discovered flows.                                                         | Must     |
| R4  | Execute the generated tests against the target app and capture per-test pass/fail results and failure details.              | Must     |
| R5  | Produce a human-readable report (Markdown and HTML): flows discovered/tested, pass/fail per test, coverage %, issues found. | Must     |
| R6  | Use **Claude (Anthropic)** as the reasoning engine for crawling, flow identification, and test generation.                  | Must     |
| R7  | Report reliability — generated tests aim to be deterministic, and the tool surfaces a flake rate.                           | Must     |
| R8  | Provide a **web service + UI**: user submits a URL, monitors progress, and views/downloads the report.                      | Must     |
| R9  | Auto-heal: when a test fails due to a changed/missing locator, attempt an AI-driven repair and re-run before reporting it.  | Should   |
| R10 | CI/CD integration: run headless non-interactively and emit a meaningful exit code.                                          | Should   |
| R11 | Emit a machine-readable report artifact (JSON) alongside the human-readable ones.                                           | Should   |

## Scenarios

| ID  | Given / When                                                                         | Then (expected behavior)                                                                                            | Covers            |
| --- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- | ----------------- |
| SC1 | User submits a valid URL via the web UI                                              | Tool crawls, generates & runs tests, and the UI shows a report listing tested flows and pass/fail results.          | R1,R2,R3,R4,R5,R8 |
| SC2 | User submits an unreachable / invalid URL                                            | Tool fails gracefully with a clear error in the UI and a non-zero exit in CI mode; no partial/false report.         | R1,R10            |
| SC3 | The target app has changed and a previously-passing test's locator no longer matches | Tool detects the locator failure, attempts an AI repair, re-runs, and reports whether healing succeeded.            | R9                |
| SC4 | The tool is invoked in a CI pipeline (headless, non-interactive)                     | It runs to completion without prompts, writes a JSON report, and exits non-zero if tests fail.                      | R10,R11           |
| SC5 | A generated test is non-deterministic across repeated runs on an unchanged app       | The tool surfaces the flake (re-run divergence) in the report rather than presenting a single misleading result.    | R7                |
| SC6 | The reference app (tarento.com) is tested end-to-end                                 | The tool autonomously discovers & tests ≥80% of the curated primary flows (nav, key content pages, search/contact). | R2,R3,R4          |

## User experience

- **Primary journey:** User opens the web UI → enters a URL (and optional scope
  limits) → watches progress as it crawls/generates/runs → views a report in the
  UI showing what was tested, pass/fail, coverage %, and issues, with the option
  to download Markdown/HTML/JSON.
- **Key flows / states:** input validation (bad URL), crawling/in-progress, test
  execution, healing-in-progress, success report, partial/failure report,
  hard-error (unreachable app).
- **UX principles:** No silent failures — every error is explained in the UI. No
  false confidence — flaky/healed results are labeled, not hidden. The report is
  understandable by a non-author (dev, QA, or PM).
- **Mockups / prototypes:** None yet (UI layout decided in Plan).

## Constraints

| ID  | Constraint                                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------ |
| C1  | Browser automation engine **must be Playwright**. (Brief, non-negotiable.)                                         |
| C2  | Web front-ends only — no native mobile or desktop targets.                                                         |
| C3  | Reasoning engine is **Claude (Anthropic)**.                                                                        |
| C4  | Report must be available human-readable (Markdown + HTML) and machine-readable (JSON).                             |
| C5  | v1 is delivered as a **web service with a UI**.                                                                    |
| C6  | Must respect `CONSTITUTION.md`: Spec-as-contract, ship-only-when-verified, simplicity, determinism over flakiness. |

## Dependencies

| ID   | Dependency                                                        | Type       | Owner | Status    |
| ---- | ----------------------------------------------------------------- | ---------- | ----- | --------- |
| DEP1 | Anthropic API access / key for Claude                             | External   | User  | Open      |
| DEP2 | Playwright runtime + browser binaries                             | Technical  | Team  | Open      |
| DEP3 | Reference app = **tarento.com** (public, no login)                | External   | User  | Confirmed |
| DEP4 | Curated list of "primary flows" for tarento.com (M1 denominator)  | Sequencing | Team  | Open      |
| DEP5 | Core loop (R1–R8) must land before R9 (auto-heal) and R10 (CI/CD) | Sequencing | Team  | Open      |

## Success metrics

| ID  | Metric (outcome that should move)    | Baseline               | Target          | How measured                                                                                       |
| --- | ------------------------------------ | ---------------------- | --------------- | -------------------------------------------------------------------------------------------------- |
| M1  | Primary-flow coverage on tarento.com | 0% (manual only today) | **≥80%**        | (# curated primary flows autonomously discovered & tested) ÷ (total curated flows), on tarento.com |
| M2  | Test reliability (flake rate)        | n/a (no tool today)    | **<5%** flaky   | % of generated tests whose pass/fail diverges across 3 identical re-runs on an unchanged app       |
| M3  | Auto-heal success rate               | 0% (no healing today)  | **≥50%** healed | % of locator-failure cases the tool repairs and re-runs to green                                   |

## Acceptance criteria

| ID   | Acceptance criterion (observable / testable)                                                                             | Verifies |
| ---- | ------------------------------------------------------------------------------------------------------------------------ | -------- |
| AC1  | Submitting a URL via the web UI produces a viewable report without further input.                                        | R1,R5,R8 |
| AC2  | For tarento.com, the report lists ≥1 discovered flow per main site section, demonstrating autonomous crawling.           | R2       |
| AC3  | Generated test files are valid Playwright tests that execute via the Playwright runner.                                  | R3,C1    |
| AC4  | The report shows per-test pass/fail and a failure reason for each failed test.                                           | R4,R5    |
| AC5  | The tool's crawling/generation is driven by Claude (verifiable via config/logs showing Anthropic calls).                 | R6,C3    |
| AC6  | Given an invalid URL, the UI shows a clear error and the tool produces no false "passed" report.                         | R1       |
| AC7  | In a simulated UI change that breaks a locator, the tool attempts a repair and the report states whether healing worked. | R9       |
| AC8  | A headless non-interactive run writes a JSON report and returns a non-zero exit code on test failure.                    | R10,R11  |
| AC9  | Re-running on an unchanged app, the report identifies any test whose result diverged across runs (flake reporting).      | R7       |
| AC10 | The report is downloadable/viewable in both Markdown and HTML.                                                           | R5,C4    |
| AC11 | On tarento.com, autonomously-tested primary flows ÷ curated primary flows ≥ 80% (M1 met).                                | R2,R3,R4 |

> Coverage rule: every **Must** requirement (R1–R8) has ≥1 acceptance criterion.

## Out of scope

- **Authentication / login flow testing** — deferred to v2 (reference app has no login).
- Non-web targets (native mobile / desktop apps).
- CAPTCHA / MFA / SSO handling.
- Performance/load testing, accessibility auditing, and visual-regression pixel diffing.
- Persistent/versioned test suites across runs (each run is fresh in v1 unless the Plan decides otherwise).

## Future vision

- **What this unlocks:** a repeatable way to get UI coverage on any web app with
  near-zero authoring effort.
- **Likely next steps (v2+):** **authenticated-flow testing** (login, cart,
  checkout), persistent/versioned test suites, visual-regression and
  accessibility checks, test prioritization by risk, scheduled monitoring runs.
- **Deliberately deferred:** auth/login (v2); non-web targets; CAPTCHA/MFA.

## Open questions

| ID  | Question                                                                                           | Status   |
| --- | -------------------------------------------------------------------------------------------------- | -------- |
| Q1  | Reference app — RESOLVED: tarento.com.                                                             | Resolved |
| Q2  | What is the curated list of "primary flows" for tarento.com (the denominator for M1)?              | Open     |
| Q3  | Report formats — RESOLVED: Markdown + HTML + JSON.                                                 | Resolved |
| Q4  | "Flow" combines a curated key task AND crawler-discovered navigable paths — RESOLVED: both count.  | Resolved |
| Q5  | Distribution — RESOLVED: web service with a UI.                                                    | Resolved |
| Q6  | Tech stack for the web service / agent runtime (language, framework, hosting) — defer to Assemble. | Open     |

---

## Change log

| Version | Date       | Change       | Reason |
| ------- | ---------- | ------------ | ------ |
| v0.1.0  | 2026-05-27 | Initial spec | —      |

---

_Stage 2 (Record) artifact. Approved at the Human Gate. Proceed to
`/craft-framework:assemble`._
