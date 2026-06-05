# State — AI UI Testing Tool

A running log of where the project stands. Updated at the end of every stage
and after every task completed during Forge.

---

## Current stage

> **Two initiatives are now in flight:**
>
> **(A) AI UI Testing Tool — v0.3.0** — **Record complete** (Spec v0.3.0 Approved,
> adds the deterministic Validation stage R18–R21). Next: Stage 3 (Assemble) to
> backfill tasks for R18–R21.
>
> **(B) Knowledge-Driven Testing Platform — Phase 1** (NEW initiative, separate
> spec at `specs/knowledge-platform/`) — **Assemble complete** (plan.md +
> tasks.md Approved 2026-06-05; both gates passed; validator 15/15). Next: Stage 4
> (Forge) → `/craft-framework:forge` to build T1–T20. The 5 open questions are
> resolved as plan decisions: D1 Postgres (→ ADR-0001), D2 plain `pg`+SQL
> migrations (no ORM), D4 **copy** reused specs into the run, D5 overlap-coefficient
> thresholds (reuse ≥0.80 / extend 0.45–0.80 / new <0.45, err to new), D7
> token-bounded packs, D8 metric ground-truth = curated flows + coverage credit.
> Q1/Q2 calibration + M1/M2 measurement need two live tarento.com runs (deferred
> to Forge/measure). Scope: a
> `src/knowledge/` KnowledgeService on **PostgreSQL** (Neon; structured tables +
> edges + JSONB, **no pgvector yet**) that ingests every completed `RunReport` and
> makes the **Planner** (explore gaps) and **Generator** (reuse/extend/new,
> lexical dedupe) history-aware. Metrics: coverage-detection ≥90% recall/≥80%
> precision; Generator regenerates ≤20% of already-covered flows. Decisions:
> App = normalized origin; new-runs-only (no backfill); graceful degradation
> (KB never blocks a run); pipeline-internal (no UI); Healer deferred to a later
> phase. Full architecture: `docs/knowledge-platform-architecture.md`.

- **Stage:** see the two initiatives above.
- **Last updated:** 2026-06-05
- **Waiting on:** run `/craft-framework:assemble` to add R18–R21 tasks to
  `tasks.md` (the validation code is already built — Assemble backfills the
  plan/tasks for traceability, then Forge is a confirm-only pass). Then Stage 5
  (Test & Tune) regenerates `review-report.md`, which is still v0.1.0 and now
  also lacks AC18–AC24. A full live run needs ANTHROPIC_API_KEY + the Playwright
  CLI (`@playwright/cli`, browser installed via `npx playwright-cli install-browser`).

> **2026-06-05 — Validation stage built ahead of the Spec, now reconciled.** A
> deterministic Validator (Planner → Generator → **Validator** → run → Healer →
> Reporter) was implemented directly (src/validator/validate.ts; wired through
> orchestrate/stages/report/render; 107 unit tests green, tsc clean), outside the
> CRAFT flow. Reconciled back into the contract via Record → Spec **v0.3.0**
> (R18–R21, SC11–SC15, C8, A1–A4, M4, AC18–AC24). Decisions: deterministic rules
> only (no LLM), **advisory + fed to the Healer, not a hard gate**. Assemble will
> backfill the tasks; Test & Tune will verify AC18–AC24.

### v2 direction (decided 2026-05-27)

Re-architect to the **Playwright Agents** pattern (ref:
`/Users/senthilpalanivelu/Downloads/test/.claude/agents` — planner/generator/healer
markdown subagents). Chosen approach = **Hybrid**: four agents (planner →
generator → healer → reporter) do the work by driving a headless browser through
the **Playwright CLI** (`@playwright/cli`, invoked via the `Bash` tool), while the
Next.js app triggers runs and shows a **rich reporter** (success rate %,
passed/needs-attention/improve breakdown, fix prompts, issues, recommendations,
and a **code-view tab** for generated specs). Running through CRAFT (Record →
Assemble → Forge → Test).

> **2026-06-01 — Browser driver migrated from MCP → Playwright CLI.** The build
> originally enabled the `playwright-test` MCP server (`playwright run-test-mcp-server`)
> and the agents used its `mcp__playwright-test__browser_*` tools. We removed that
> server (`.mcp.json` + `enabledMcpjsonServers` deleted) so the agents drive the
> browser exclusively via `npx playwright-cli` over `Bash`, which is **headless by
> default**. See the "Key decisions" entry below.

## Stage completion log

| Date       | Stage             | Deliverable                                                            | Status |
| ---------- | ----------------- | ---------------------------------------------------------------------- | ------ |
| 2026-05-27 | Setup             | Memory files created                                                   | ✅     |
| 2026-05-27 | 1 — Clarify       | Brief approved (specs/ai-ui-testing-tool/brief.md)                     | ✅     |
| 2026-05-27 | 2 — Record        | Spec v0.1.0 approved (specs/ai-ui-testing-tool/spec.md)                | ✅     |
| 2026-05-27 | 3 — Assemble      | plan.md + tasks.md approved (26 tasks, Next.js stack)                  | ✅     |
| 2026-05-27 | 4 — Forge         | All 26 tasks built; 47 unit tests pass; build clean                    | ✅     |
| 2026-05-27 | 5 — Test&Tune     | Review Report: F=PASS Q=CONCERNS A=PASS; keyed run 80% coverage        | ✅     |
| 2026-05-27 | Ship              | Shipped v0.1.0 at the Human Gate (user decision)                       | ✅     |
| 2026-05-27 | 2 — Record v2     | Spec v0.2.0 approved (4-agent architecture + rich reporter)            | ✅     |
| 2026-05-27 | 3 — Assemble v2   | plan + tasks v0.2.0 approved (23 tasks; Agent SDK + browser)           | ✅     |
| 2026-05-27 | 4 — Forge v2      | All 23 v0.2.0 tasks built; 48 unit tests, build clean                  | ✅     |
| 2026-06-01 | Maintenance       | Browser driver migrated MCP → Playwright CLI (headless default)        | ✅     |
| 2026-06-05 | 2 — Record v0.3.0 | Spec v0.3.0 approved — adds deterministic Validation stage (R18–R21)   | ✅     |
| 2026-06-05 | KP 1 — Clarify    | Knowledge Platform Phase 1 brief approved (specs/knowledge-platform/)  | ✅     |
| 2026-06-05 | KP 1 — Record     | Knowledge Platform Phase 1 spec v0.1.0 approved (R1–R12; M1/M2; N1–N5) | ✅     |
| 2026-06-05 | KP 1 — Assemble   | Knowledge Platform Phase 1 plan + tasks approved (T1–T20; ADR-0001)    | ✅     |

## Key decisions

- **2026-06-05 (Record gate, v0.3.0):** Added a **deterministic Validation
  stage** between Generator and Healer (R18–R21). **Deterministic rules only** —
  no LLM/semantic judging (C8, A1). Validation is **advisory and fed to the
  Healer, never a hard gate** (R20); hard-gate + LLM-judge + configurable rules
  are deferred (Q11, Q12, Future vision). Outcome metric M4 = ≥95% of generated
  specs free of error-level findings. Reconciles a feature built ahead of the
  Spec on 2026-06-05.

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

- **2026-06-01 (Maintenance):** **Browser driver = Playwright CLI, not the MCP
  server.** The agents now drive the browser with `npx playwright-cli` (open /
  snapshot / click / etc.) over the `Bash` tool, matching the prompts in
  `.claude/agents/*.md` and the skill at `.claude/skills/playwright-cli/`. Removed
  the `playwright-test` MCP server (`.mcp.json`, the `enabledMcpjsonServers` entry
  in `.claude/settings.local.json`, and the dead `bin/smoke-mcp.ts`). Rationale:
  the MCP server was still enabled and — under `permissionMode: "bypassPermissions"`
  — the agents kept reaching for its `browser_*` tools instead of the CLI, so runs
  weren't actually on the intended path. The CLI is **headless by default** (only
  `--headed` shows a window), which also resolves the headless requirement.

## Open questions carried to Forge

- **Q2:** Curated list of "primary flows" for tarento.com (the M1 denominator) —
  now task **T12**, to be produced during the build.

## Blockers

<!-- Anything currently preventing progress. Remove entries when resolved. -->

None.

---

_Created by `/craft-framework:setup-memory`. Updated by each stage._
