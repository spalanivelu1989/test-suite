# Spec — AI UI Testing Tool

> Stage 2 (Record) deliverable. The single source of truth and contract for
> everything that follows: **if it isn't in this Spec, it doesn't get built.**
> Describes WHAT "done" means, never HOW to build it.

- **Version:** v0.3.1
- **Status:** Approved
- **Source Brief:** `specs/ai-ui-testing-tool/brief.md`
- **Last updated:** 2026-06-13

---

## Overview

An autonomous, AI-powered front-end UI testing tool. A user submits a web app URL;
the tool runs **four sequential agents** — **Discoverer → Designer → Evolver →
Reporter** — to deliver test coverage and a rich report. The Discoverer explores the
live app and writes a Markdown **test plan**; the Designer turns that plan into
runnable Playwright `.spec.ts` files (grounded against a live browser); the Evolver
runs the suite, repairs failures, and quarantines the unfixable; the Reporter
aggregates results into a rich report. Delivered as a **hybrid**: the agents do
the work via the Playwright Agents pattern, driving a headless browser through the
**Playwright CLI** (`@playwright/cli`, invoked over the `Bash` tool), while a
Next.js web app triggers runs and shows the report — including a **code-view tab**
for the generated specs.

**v0.2.0 changes the architecture** of the shipped v0.1.0 tool (which used a
bespoke prompt-driven pipeline) to the agent pattern and a much richer reporter.
The reasoning engine (Claude), browser engine (Playwright), reference app
(tarento.com), and outcome metrics are unchanged.

**v0.3.0 adds a deterministic Validation stage** between the Designer and the
Evolver (the pipeline becomes **Discoverer → Designer → Validator → run → Evolver →
Reporter**). The Validator inspects each generated `.spec.ts` **statically** — no
browser, no LLM — against four quality bars (structural correctness, meaningful
assertions, relevance to the plan, and robustness/non-flakiness), scoring each
spec 0–100 and producing a suite-level report. Validation is **advisory** (it
never blocks the run) and its findings are **fed to the Evolver** so flagged
anti-patterns get repaired alongside real failures. This makes generated-test
_quality_ — not just pass/fail — observable, directly serving the Constitution's
"determinism over flakiness" rule. The four agents, reasoning engine, browser
engine, reference app, and the v0.2.0 outcome metrics are unchanged.

## Requirements

| ID  | Requirement (what the result must do)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Priority |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| R1  | Accept a web app URL as input via the web UI, with optional configuration (e.g. scope/depth limits).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Must     |
| R2  | The **Discoverer** explores the live app to discover pages, interactive elements, and candidate user flows.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Must     |
| R3  | The **Designer** produces runnable **Playwright** `.spec.ts` tests from the Discoverer's test plan.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Must     |
| R4  | Execute the generated tests against the target app and capture per-test pass/fail results and failure details.                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Must     |
| R5  | Produce a report (sections defined in R16) viewable in the web UI and downloadable as Markdown, HTML, and JSON.                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Must     |
| R6  | Use **Claude (Anthropic)** as the reasoning engine driving all four agents.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Must     |
| R7  | Report reliability — generated tests aim to be deterministic, and the tool surfaces a flake rate.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Must     |
| R8  | Provide a **web service + UI**: user submits a URL, monitors progress, and views/downloads the report.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Must     |
| R9  | Auto-heal: when a test fails due to a changed/missing locator, attempt an AI-driven repair and re-run before reporting it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Must     |
| R10 | CI/CD integration: run headless non-interactively and emit a meaningful exit code.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Should   |
| R11 | Emit a machine-readable report artifact (JSON) alongside the human-readable ones.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Should   |
| R12 | Organize the pipeline as **four sequential agents** — Discoverer → Designer → Evolver → Reporter — each a single responsibility, with a deterministic **Validation stage (R18)** inserted between Designer and Evolver.                                                                                                                                                                                                                                                                                                                                                                    | Must     |
| R13 | The **Discoverer** writes a **Markdown test plan** (titled scenarios, numbered steps, expected outcomes) persisted for the run.                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Must     |
| R14 | The **Designer** emits one Playwright test per planned scenario, grounded against the live app (resilient locators).                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Must     |
| R15 | The **Evolver** runs the suite, repairs failing tests and re-runs to green; tests it cannot fix are marked `test.fixme()` with an explanatory comment — never reported as passed.                                                                                                                                                                                                                                                                                                                                                                                                          | Must     |
| R16 | The **Reporter** report contains: overall summary; app URL; **success rate % = passed ÷ all planned tests** (`test.fixme()`/skipped count as not-passed); a per-test **passed / needs-attention / where-to-improve** breakdown; **fix prompts** (each concrete problem + what to change); an **issues-found** section; and a **recommendations / "what could be done better"** section.                                                                                                                                                                                                    | Must     |
| R17 | The report UI provides a **code-view tab** to view the generated `.spec.ts` source for each test (and the Markdown test plan).                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Must     |
| R18 | A deterministic **Validator** runs between Designer and Evolver. With **no browser and no LLM**, it statically inspects each generated `.spec.ts` against four rule categories: **correctness** (imports `@playwright/test`; exactly one `test()` per file), **assertion quality** (has `expect()`; not presence/visibility-only; not a literal asserted against itself), **robustness** (no `waitForTimeout`/`setTimeout`; no `networkidle` wait; no brittle selectors — xpath, deep CSS `>` chains, positional `.nth(n)`), and **relevance** (the spec's title maps to a plan scenario). | Must     |
| R19 | For each spec the Validator emits **findings** (rule id, category, severity `error`\|`warning`, message, optional line) and a **0–100 score**; for the suite it emits an **overall score**, **error/warning counts**, **orphan specs** (specs matching no plan scenario), and **missing flows** (plan scenarios with no spec).                                                                                                                                                                                                                                                             | Must     |
| R20 | Validation is **advisory, never a hard gate** — the suite still runs, heals, and reports regardless of findings — **and** the findings are **fed to the Evolver** (appended to its prompt) so it repairs flagged anti-patterns alongside runtime failures.                                                                                                                                                                                                                                                                                                                                 | Must     |
| R21 | The validation results are **surfaced in the report**: a **Validation section** (overall score, error/warning counts, missing flows, per-spec findings) in the human-readable report and a `validation` field in the JSON artifact; a `validating` progress event is emitted during the run.                                                                                                                                                                                                                                                                                               | Must     |

## Scenarios

| ID   | Given / When                                                                                                                     | Then (expected behavior)                                                                                                                                                          | Covers                |
| ---- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| SC1  | User submits a valid URL via the web UI                                                                                          | The four agents run in order; the UI shows progress, then a report listing tested flows and pass/fail results.                                                                    | R1,R2,R3,R4,R5,R8,R12 |
| SC2  | User submits an unreachable / invalid URL                                                                                        | Tool fails gracefully with a clear error in the UI and non-zero exit in CI mode; no partial/false report.                                                                         | R1,R10                |
| SC3  | A previously-passing test's locator no longer matches after a UI change                                                          | The Evolver detects the failure, attempts an AI repair, re-runs, and the report states whether healing succeeded.                                                                 | R9,R15                |
| SC4  | The Evolver cannot fix a genuinely failing test after repair attempts                                                            | The Evolver marks it `test.fixme()` with an explanatory comment; the report shows it as needs-attention, not passed.                                                              | R15,R16               |
| SC5  | The tool is invoked in a CI pipeline (headless, non-interactive)                                                                 | It runs to completion without prompts, writes a JSON report, and exits non-zero if tests fail.                                                                                    | R10,R11               |
| SC6  | A generated test is non-deterministic across repeated runs on an unchanged app                                                   | The tool surfaces the flake in the report rather than presenting a single misleading result.                                                                                      | R7                    |
| SC7  | The Discoverer finishes exploring the app                                                                                        | A Markdown test plan with titled scenarios and numbered steps is persisted and viewable in the report.                                                                            | R13,R17               |
| SC8  | A run completes and the user opens the report                                                                                    | The report shows app URL, success rate %, passed/needs-attention/improve breakdown, fix prompts, issues, and recommendations.                                                     | R16                   |
| SC9  | The user wants to inspect what was generated                                                                                     | The report's code-view tab shows the generated `.spec.ts` source (and the Markdown plan).                                                                                         | R17                   |
| SC10 | The reference app (tarento.com) is tested end-to-end                                                                             | The agents autonomously plan & test ≥80% of the curated primary flows.                                                                                                            | R2,R3,R4,R12          |
| SC11 | The Designer finishes writing specs                                                                                              | The Validator runs next; a `validating` progress event reports the suite score and error/warning counts before the run/heal stages.                                               | R18,R21               |
| SC12 | A generated spec has no `expect()` assertions (or only `toBeVisible`-style presence checks, or asserts a literal against itself) | The Validator records `no-assertions` (error) / `weak-assertion-only` / `tautological-assertion` (warnings); the spec's score drops and the findings appear in the report.        | R18,R19,R21           |
| SC13 | A generated spec uses `waitForTimeout`, `networkidle`, or a positional `.nth(n)` / xpath / deep-CSS selector                     | The Validator records `hard-wait` / `networkidle` / `brittle-selector` warnings; these are appended to the Evolver's prompt; the suite still runs, heals, and reports (advisory). | R18,R20               |
| SC14 | A generated spec's title matches no plan scenario, and/or a plan scenario has no generated spec                                  | The Validator lists the spec under **orphan specs** and the scenario under **missing flows** in the suite report.                                                                 | R18,R19               |
| SC15 | Every generated spec is structurally valid, well-asserted, robust, and on-plan                                                   | The Validator reports an overall score of 100 with no findings; the report's Validation section states no static issues were found.                                               | R19,R21               |

## User experience

- **Primary journey:** User enters a URL → watches the stages stream
  (Discoverer exploring → Designer writing specs → **Validator checking specs** →
  Evolver running/repairing → Reporter aggregating) → reads a rich report,
  including a **Validation** section that scores the generated suite's quality,
  and can flip to a **code-view tab** to inspect the generated specs and the
  Markdown plan, then download MD/HTML/JSON.
- **Key flows / states:** input validation; per-stage progress (incl. the
  `validating` stage with score + error/warning counts); healing-in-progress;
  success report; partial report (some tests `fixme`); clean-validation report
  ("no static issues found"); flagged-validation report (per-spec findings,
  orphan specs, missing flows); hard-error (unreachable app).
- **UX principles:** No silent failures — every error explained. No false
  confidence — flaky/healed/quarantined results are labeled, never shown as passed.
  The report is actionable: fix prompts and recommendations tell a reader exactly
  what to change. Understandable by a non-author (dev, QA, or PM).
- **Mockups / prototypes:** None yet (report layout + tabs decided in Plan).

## Constraints

| ID  | Constraint                                                                                                                                                                                                                                                                              |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | Browser automation engine **must be Playwright**.                                                                                                                                                                                                                                       |
| C2  | Web front-ends only — no native mobile or desktop targets.                                                                                                                                                                                                                              |
| C3  | Reasoning engine is **Claude (Anthropic)**.                                                                                                                                                                                                                                             |
| C4  | Report must be available human-readable (Markdown + HTML) and machine-readable (JSON).                                                                                                                                                                                                  |
| C5  | Delivered as a **hybrid**: agents do the work; a Next.js web app triggers runs and renders the report.                                                                                                                                                                                  |
| C6  | Must respect `CONSTITUTION.md`: Spec-as-contract, ship-only-when-verified, simplicity, determinism over flakiness.                                                                                                                                                                      |
| C7  | Adopt the **Playwright Agents** architecture: discoverer/designer/evolver/reporter agents using `playwright-cli` (npx playwright-cli) for browser actions (ref: the agent defs in `/Users/senthilpalanivelu/Downloads/test/.claude/agents`).                                            |
| C8  | The **Validator must be deterministic**: pure static analysis of spec source — **no browser, no network, no LLM**. Identical inputs always yield identical findings/scores (so the validation step is itself reliable, per Constitution rule 4) and adds negligible time/cost to a run. |

## Dependencies

| ID   | Dependency                                                                                                  | Type       | Owner | Status                                 |
| ---- | ----------------------------------------------------------------------------------------------------------- | ---------- | ----- | -------------------------------------- |
| DEP1 | Anthropic API access / key for Claude                                                                       | External   | User  | Confirmed                              |
| DEP2 | Playwright runtime + browser binaries                                                                       | Technical  | Team  | Done (v1)                              |
| DEP3 | Reference app = **tarento.com** (public, no login)                                                          | External   | User  | Confirmed                              |
| DEP4 | Curated list of "primary flows" for tarento.com (M1 denominator)                                            | Sequencing | Team  | Done (fixture; reconcile w/ live site) |
| DEP5 | `@playwright/cli` package + agent skills installed via `npx playwright-cli install --skills`                | Technical  | Team  | Done                                   |
| DEP6 | Agent invocation runtime (Agent SDK / Claude Code subagents vs. in-app orchestration) — decided in Assemble | Technical  | Team  | Open                                   |

## Assumptions

| ID  | Assumption (taken as true without proof; if wrong, the Spec/Plan changes)                                                                                                                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A1  | **Deterministic static rules are sufficient** to judge correctness/assertion/robustness for v0.3.0 — no LLM/semantic judgment is needed. If the rules prove too coarse (false flags or missed issues), an optional LLM-judge layer becomes a v2 candidate (see Future vision).                   |
| A2  | **Relevance can be inferred from title↔scenario token overlap.** Plan scenario titles are distinctive enough that matching a spec title to a scenario rarely mis-maps. Generic/duplicated titles can produce false orphan/missing-flow signals (inherits the known coverage-matcher limitation). |
| A3  | **The plan is parseable for scenarios** via heading conventions (`## Scenario N — Title` or `#### N.M Title`). A plan that uses neither yields zero scenarios, so relevance is skipped (no orphans/missing flows reported) rather than wrong.                                                    |
| A4  | **Validation findings help, not hurt, the Evolver.** Feeding anti-pattern findings into the Evolver's prompt improves the repaired suite and does not cause the Evolver to "fix" intentional test logic. The Evolver is instructed to address findings only where they don't change intent.      |

## Success metrics

| ID  | Metric (outcome that should move)    | Baseline               | Target          | How measured                                                                                                                                                     |
| --- | ------------------------------------ | ---------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | Primary-flow coverage on tarento.com | 80% (v0.1.0 keyed run) | **≥80%**        | (# curated primary flows planned & tested) ÷ (total curated flows), on tarento.com                                                                               |
| M2  | Test reliability (flake rate)        | 0% (v0.1.0 keyed run)  | **<5%** flaky   | % of generated tests whose pass/fail diverges across 3 identical re-runs on an unchanged app                                                                     |
| M3  | Auto-heal success rate               | 33% (v0.1.0 keyed run) | **≥50%** healed | % of locator-failure cases the Evolver repairs and re-runs to green                                                                                              |
| M4  | Generated-test quality (post-heal)   | Not measured (new)     | **≥95%** clean  | % of generated specs with **zero error-level** validation findings (no `missing-import` / `no-test-block` / `no-assertions`) in the final report, on tarento.com |

## Acceptance criteria

| ID   | Acceptance criterion (observable / testable)                                                                                                                                                                                                    | Verifies |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| AC1  | Submitting a URL via the web UI produces a viewable report without further input.                                                                                                                                                               | R1,R5,R8 |
| AC2  | For tarento.com, the plan/report lists ≥1 discovered flow per main site section, demonstrating autonomous exploration.                                                                                                                          | R2       |
| AC3  | Generated test files are valid Playwright tests that execute via the Playwright runner.                                                                                                                                                         | R3,C1    |
| AC4  | The report shows per-test pass/fail and a failure reason for each failed test.                                                                                                                                                                  | R4,R5    |
| AC5  | The agents are driven by Claude (verifiable via logs showing Anthropic calls).                                                                                                                                                                  | R6,C3    |
| AC6  | Given an invalid URL, the UI shows a clear error and the tool produces no false "passed" report.                                                                                                                                                | R1       |
| AC7  | In a simulated locator break, the Evolver attempts a repair and the report states whether healing worked.                                                                                                                                       | R9       |
| AC8  | A headless non-interactive run writes a JSON report and returns a non-zero exit code on test failure.                                                                                                                                           | R10,R11  |
| AC9  | Re-running on an unchanged app, the report identifies any test whose result diverged across runs (flake reporting).                                                                                                                             | R7       |
| AC10 | The report is downloadable/viewable in Markdown and HTML.                                                                                                                                                                                       | R5,C4    |
| AC11 | On tarento.com, planned-and-tested primary flows ÷ curated primary flows ≥ 80% (M1 met).                                                                                                                                                        | R2,R3,R4 |
| AC12 | A run executes the four agents in order Discoverer→Designer→Evolver→Reporter (observable in progress events/logs).                                                                                                                              | R12      |
| AC13 | A run produces a persisted Markdown test plan with titled scenarios and numbered steps.                                                                                                                                                         | R13      |
| AC14 | The Designer emits one `.spec.ts` per planned scenario and those specs run via the runner.                                                                                                                                                      | R14      |
| AC15 | A test the Evolver cannot fix is marked `test.fixme()` with a comment and shown as needs-attention (never as passed).                                                                                                                           | R15      |
| AC16 | The report shows: app URL, success rate % (passed ÷ all planned tests; fixme counts as not-passed), passed/needs-attention/improve breakdown, fix prompts, issues, and recommendations.                                                         | R16      |
| AC17 | The report UI has a code-view tab that displays the generated `.spec.ts` source (and the Markdown plan).                                                                                                                                        | R17      |
| AC18 | A run executes the stages in order Discoverer→Designer→**Validator**→Evolver→Reporter, with a `validating` progress event (carrying score + error/warning counts) observable in the events/logs between generating and running.                 | R18,R21  |
| AC19 | The Validator flags a spec with no `expect()` as `no-assertions` (error), a spec whose only assertions are presence/visibility as `weak-assertion-only` (warning), and a literal-asserted-against-itself as `tautological-assertion` (warning). | R18,R19  |
| AC20 | The Validator flags `waitForTimeout`/`setTimeout` as `hard-wait`, `waitForLoadState('networkidle')` as `networkidle`, and xpath / deep-CSS `>` chains / positional `.nth(n)` as `brittle-selector` (all warnings).                              | R18,R19  |
| AC21 | Each spec receives a 0–100 score (100 − 40 per error − 15 per warning, floored at 0); the suite report includes an overall score, error/warning counts, `orphanSpecs`, and `missingFlows`.                                                      | R19      |
| AC22 | A spec whose title matches no plan scenario appears in `orphanSpecs`; a plan scenario with no matching spec appears in `missingFlows`.                                                                                                          | R18,R19  |
| AC23 | The Validator's findings are appended to the Evolver's prompt (observable in the prompt text), and the suite still runs, heals, and reports regardless of findings (validation never blocks the run).                                           | R20      |
| AC24 | The report includes a **Validation** section (overall score, error/warning counts, missing flows, per-spec findings) in Markdown/HTML and a `validation` object in the JSON artifact.                                                           | R21      |

> Coverage rule: every **Must** requirement (R1–R9, R12–R21) has ≥1 acceptance criterion.

## Out of scope

- **Authentication / login flow testing** — still deferred (reference app has no login).
- Non-web targets (native mobile / desktop apps); CAPTCHA / MFA / SSO.
- Performance/load testing, accessibility auditing, visual-regression pixel diffing.
- Persistent/versioned test suites across runs (each run is fresh unless the Plan decides otherwise).
- Packaging the agents as a distributable Claude Code plugin / marketplace entry.
- **LLM/semantic judgment of test quality** — the Validator is deterministic
  rules only; no model scores assertion-meaningfulness or relevance in v0.3.0 (A1).
- **Validation as a hard gate** — the Validator never blocks the run or
  auto-quarantines specs; it is advisory + Evolver-fed only (R20).
- **User-configurable validation rules/severities/thresholds** — the rule set and
  scoring weights are fixed in v0.3.0.

## Future vision

- **What this unlocks:** an actionable, agent-driven QA report — not just pass/fail,
  but concrete fix prompts and recommendations a team can act on.
- **Likely next steps (v2+):** authenticated-flow testing; persistent/versioned
  suites; visual-regression and accessibility checks; scheduled monitoring;
  distributable agent pack; an **optional LLM-judge layer** atop the deterministic
  Validator for semantic assertion/relevance scoring; **opt-in validation gate**
  (fail the run on error-level findings) and **configurable rules/thresholds**.
- **Deliberately deferred:** auth/login; non-web targets; CAPTCHA/MFA;
  LLM-based validation; validation-as-hard-gate.

## Open questions

| ID  | Question                                                                                                                              | Status                                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Q1  | Reference app — tarento.com.                                                                                                          | Resolved                                                                                                                 |
| Q2  | Curated "primary flows" for tarento.com — fixture exists; reconcile with live site.                                                   | Open                                                                                                                     |
| Q3  | Report formats — Markdown + HTML + JSON.                                                                                              | Resolved                                                                                                                 |
| Q4  | "Flow" = curated key task AND discovered navigable path — both count.                                                                 | Resolved                                                                                                                 |
| Q5  | Distribution — hybrid (agents + Next.js web UI).                                                                                      | Resolved                                                                                                                 |
| Q6  | Tech stack — Next.js + React 19 + TS + Chakra/Framer/Lucide (from v0.1.0).                                                            | Resolved                                                                                                                 |
| Q7  | Success-rate denominator — RESOLVED: passed ÷ all planned tests; `test.fixme()`/skipped count as not-passed.                          | Resolved                                                                                                                 |
| Q8  | Agent runtime: literal Claude Code subagents via the Agent SDK, or in-app orchestration calling Claude with per-agent system prompts? | Open (Assemble)                                                                                                          |
| Q9  | Browser tool surface for the agents?                                                                                                  | Resolved — Playwright CLI (`@playwright/cli`) over `Bash`. (The MCP server was used initially, then removed 2026-06-01.) |
| Q10 | How much of the v0.1.0 codebase (crawler, runner, reporter, store) is reused vs. replaced?                                            | Open (Assemble)                                                                                                          |
| Q11 | Should validation ever become a **hard gate** (fail the run / quarantine specs on error-level findings)?                              | Deferred — advisory + Evolver-fed by decision (R20); revisit if low-value specs still slip through (Future vision).      |
| Q12 | Should the Validator's rule set, severities, and score weights be **user-configurable**?                                              | Deferred — fixed in v0.3.0; candidate for a later release.                                                               |

---

## Change log

| Version | Date       | Change                                                                                                                                                                                                                                                                                                                                                                                                 | Reason                                                                                                                                                                              |
| ------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| v0.1.0  | 2026-05-27 | Initial spec                                                                                                                                                                                                                                                                                                                                                                                           | —                                                                                                                                                                                   |
| v0.2.0  | 2026-05-27 | Re-architect to Playwright Agents pattern (R12–R15); rich Reporter + code-view tab (R16–R17); hybrid delivery (C5,C7); revised R2/R3/R5/R6/R9 wording; baselines updated to v0.1.0 keyed-run results                                                                                                                                                                                                   | Stage 5 loop-back: user requires the four-agent architecture and an actionable report the v0.1.0 build lacked                                                                       |
| v0.3.0  | 2026-06-05 | Add deterministic **Validation stage** between Designer and Evolver (R18–R21; SC11–SC15; AC18–AC24); constraint C8 (deterministic, no browser/LLM); metric M4 (generated-test quality); assumptions A1–A4; note R12 inserts the Validator. Advisory + Evolver-fed, not a hard gate                                                                                                                     | Reconcile a feature built ahead of the Spec back into the contract — make generated-test _quality_ (assertions, robustness, relevance), not just pass/fail, observable and acted on |
| v0.3.1  | 2026-06-13 | **Terminology only** — rename the three agents Planner→**Discoverer**, Generator→**Designer**, Healer→**Evolver** throughout the contract, code, and agent definition files. No behaviour change. The knowledge-base "healing" data vocabulary (`healing_events`, `HealingEvent`, heal precedents) and the persisted `RunStage` values (`planning`/`generating`/`healing`) are intentionally unchanged | User-requested rename; the heal-data layer is shipped on `main`, so renaming it was out of scope to avoid a schema migration                                                        |

---

_Stage 2 (Record) artifact. Approve at the Human Gate, then proceed to
`/craft-framework:assemble`._
