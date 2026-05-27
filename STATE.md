# State — AI UI Testing Tool

A running log of where the project stands. Updated at the end of every stage
and after every task completed during Forge.

---

## Current stage

- **Stage:** 3 — Assemble complete; ready for Stage 4 (Forge)
- **Last updated:** 2026-05-27
- **Waiting on:** nothing — ready to run `/craft-framework:forge`

## Stage completion log

| Date       | Stage        | Deliverable                                             | Status |
| ---------- | ------------ | ------------------------------------------------------- | ------ |
| 2026-05-27 | Setup        | Memory files created                                    | ✅     |
| 2026-05-27 | 1 — Clarify  | Brief approved (specs/ai-ui-testing-tool/brief.md)      | ✅     |
| 2026-05-27 | 2 — Record   | Spec v0.1.0 approved (specs/ai-ui-testing-tool/spec.md) | ✅     |
| 2026-05-27 | 3 — Assemble | plan.md + tasks.md approved (26 tasks, Next.js stack)   | ✅     |

## Key decisions

- **2026-05-27 (Clarify):** v1 = core loop (crawl → generate → run → report).
  Engine = Playwright. Success metric = ≥80% primary-flow coverage.
- **2026-05-27 (Record gate):** Reasoning engine = **Claude (Anthropic)**.
  Delivery form = **web service with a UI**. Reports = **Markdown + HTML + JSON**.
  Reference app = **tarento.com**.
- **2026-05-27 (Record gate):** **Auth/login testing dropped from v1** (deferred
  to v2) because the reference app has no login — a Must requirement could not be
  verified against it. Auto-healing (R9) and CI/CD (R10) remain in v1 as Should.

- **2026-05-27 (Assemble gate):** Stack = **Next.js + React 19 + TypeScript,
  Chakra UI + Framer Motion + Lucide**, single full-stack app; **SSE** for live
  progress; in-memory run store (no DB) for v1. Resolves Q6.

## Open questions carried to Forge

- **Q2:** Curated list of "primary flows" for tarento.com (the M1 denominator) —
  now task **T12**, to be produced during the build.

## Blockers

<!-- Anything currently preventing progress. Remove entries when resolved. -->

None.

---

_Created by `/craft-framework:setup-memory`. Updated by each stage._
