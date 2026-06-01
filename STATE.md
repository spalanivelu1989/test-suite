# State — AI UI Testing Tool

A running log of where the project stands. Updated at the end of every stage
and after every task completed during Forge.

---

## Current stage

- **Stage:** v2 — Forge complete (all 23 tasks built); ready for Stage 5 (Test & Tune).
- **Last updated:** 2026-05-27
- **Waiting on:** nothing — ready to run `/craft-framework:test-tune`. NOTE:
  review-report.md still reflects v0.1.0 (validator flags AC12–AC17) — Test & Tune
  regenerates it. A full v2 live run needs ANTHROPIC_API_KEY + the Playwright
  CLI (`@playwright/cli`, browser installed via `npx playwright-cli install-browser`).

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

| Date       | Stage           | Deliverable                                                     | Status |
| ---------- | --------------- | --------------------------------------------------------------- | ------ |
| 2026-05-27 | Setup           | Memory files created                                            | ✅     |
| 2026-05-27 | 1 — Clarify     | Brief approved (specs/ai-ui-testing-tool/brief.md)              | ✅     |
| 2026-05-27 | 2 — Record      | Spec v0.1.0 approved (specs/ai-ui-testing-tool/spec.md)         | ✅     |
| 2026-05-27 | 3 — Assemble    | plan.md + tasks.md approved (26 tasks, Next.js stack)           | ✅     |
| 2026-05-27 | 4 — Forge       | All 26 tasks built; 47 unit tests pass; build clean             | ✅     |
| 2026-05-27 | 5 — Test&Tune   | Review Report: F=PASS Q=CONCERNS A=PASS; keyed run 80% coverage | ✅     |
| 2026-05-27 | Ship            | Shipped v0.1.0 at the Human Gate (user decision)                | ✅     |
| 2026-05-27 | 2 — Record v2   | Spec v0.2.0 approved (4-agent architecture + rich reporter)     | ✅     |
| 2026-05-27 | 3 — Assemble v2 | plan + tasks v0.2.0 approved (23 tasks; Agent SDK + browser)    | ✅     |
| 2026-05-27 | 4 — Forge v2    | All 23 v0.2.0 tasks built; 48 unit tests, build clean           | ✅     |
| 2026-06-01 | Maintenance     | Browser driver migrated MCP → Playwright CLI (headless default) | ✅     |

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
