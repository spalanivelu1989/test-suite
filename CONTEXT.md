# Context — AI UI Testing Tool

The shared background, vocabulary, and key facts every stage and agent needs.
Use this to ensure words mean one thing to everyone.

---

## Project summary

An AI-based testing tool for automated front-end UI testing. It aims to use AI
to drive, generate, and/or validate UI tests against web front ends — reducing
the manual effort of writing and maintaining brittle UI test scripts.

## Key terms

| Term          | Definition                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI test       | An automated check that drives a front-end interface and asserts on its behavior or appearance.                                                                                                                                                                                                                                                                                                                      |
| Flake         | A test that passes and fails non-deterministically without code changes.                                                                                                                                                                                                                                                                                                                                             |
| Run           | A single execution of one or more UI tests producing pass/fail results.                                                                                                                                                                                                                                                                                                                                              |
| Run Manager   | The single module that owns a run's whole life: start, cancel, remove, look-up, and list. It coordinates the in-memory record, the per-run stop-buttons (abort controllers), and disk persistence behind one small interface, guaranteeing the three stay in sync. Callers never touch those records directly.                                                                                                       |
| Run Workspace | The module that owns a run's on-disk contract: the per-run directory layout, the filenames we read/write ourselves (results.json, plan.md), and running the generated Playwright suite. Filenames are defined once; callers get behavioral operations (writePlan, readPlan, readSpecs, runSuite) instead of hardcoded paths. Distinct from the Run Manager, which owns run _status_; the Workspace owns run _files_. |

## Stakeholders / users

<!-- Who is this for? Who makes decisions? -->

Primary decision-maker: the user (tel@tarento.com). End users: developers/QA
engineers who want to automate front-end UI testing with less hand-written
scripting.

## Important constraints and context

<!-- Anything a new team member would need to know to not make wrong assumptions. -->

- Shipped v0.1.0, then re-architected to v0.2.0: a four-agent pipeline
  (Discoverer → Designer → Tester → Reporter) driven by the Claude Agent SDK +
  Playwright, fronted by a Next.js app that triggers runs and renders a rich
  report. (CONTEXT was last greenfield on 2026-05-27; updated 2026-05-29.)
- Stack: Next.js + React 19 + TypeScript, Chakra UI; in-memory run store
  (no DB) with best-effort disk persistence under `.runs/`.

---

_Created by `/craft-framework:setup-memory`. Keep it factual and current._
