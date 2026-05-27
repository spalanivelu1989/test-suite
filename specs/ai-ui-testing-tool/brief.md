# Brief — AI UI Testing Tool

> Stage 1 (Clarify) deliverable. One page. Frames the problem before any spec.

- **Status:** Approved
- **Date:** 2026-05-27
- **Author:** tel@tarento.com (framed with Claude as Interviewer)

---

## Problem

Front-end UI testing is slow, manual, and brittle. Writing and maintaining UI
test scripts takes specialized effort, so coverage is thin and regressions slip
through. The bet: autonomous, AI-powered testing is a transformative shift that
can improve software quality, accelerate time-to-market, and boost developer
productivity.

## Business goal

Prove that an AI agent can autonomously test a web app end-to-end — point it at
a URL and get meaningful test coverage and a useful report with little human
effort. Success here de-risks a larger investment in AI-driven QA at Tarento.

## Why now

Primarily learning/exploration: LLM/agent capabilities have advanced enough that
autonomous UI testing now looks feasible. No hard external deadline — the goal is
to validate the concept and build internal capability.

## Audience

Mixed / whole team — usable by developers and QA engineers alike, and ideally
approachable for less technical contributors. Job-to-be-done: "Give the tool my
web app's URL and get trustworthy UI tests and a quality report back, without
hand-writing scripts."

## Success — observable

**Primary metric — flow coverage:** the AI autonomously discovers and tests
**≥80% of an app's primary user flows** on a chosen reference app. Secondary
signals (for the Spec to formalize): bugs caught and test reliability/flake rate.

## Constraints

- **Browser automation engine: Playwright** (non-negotiable).
- Web front-ends only.
- Output must include a human-readable report of what was tested and the results.

## v1 scope (decided)

v1 includes the full core loop **plus** all three add-ons: **auth/login flows,
auto-healing tests, and CI/CD integration.** This is an ambitious v1 — the Spec
must sequence it carefully and the determinism/auto-healing risks below apply.

## Out of scope

- Non-web targets — no native mobile or desktop app testing.

## Prior art

Commercial AI/auto-healing test tools exist (e.g. agentic test generators,
self-healing locators). Worth surveying during Record for patterns to borrow and
pitfalls to avoid. No prior internal attempt noted.

## Risks

- **Scope overload:** v1 was tagged to include auth/login flows, auto-healing
  tests, AND CI/CD integration on top of the core crawl→generate→run→report loop.
  That is a lot for a learning-stage v1 and conflicts with "keep it simple."
- **Flaky tests:** AI-generated UI tests may be non-deterministic, undermining
  trust (violates the determinism rule in the Constitution).
- **Coverage measurement:** "80% of main flows" needs a defensible definition of
  "main flow" and a reference app to measure against.

---

## Open questions

- **Q1:** RESOLVED — v1 includes auth + auto-healing + CI/CD (user decision,
  2026-05-27). Spec must sequence these so the core loop lands first.
- **Q2:** What is the reference web app used to measure the 80% coverage target?
- **Q3:** How is a "primary user flow" defined and counted?
- **Q4:** Which LLM/provider powers the agent? (No constraint stated.)

---

_Stage 1 (Clarify) artifact. Approve at the Human Gate, then proceed to
`/craft-framework:record`. Keep this to ONE page._
