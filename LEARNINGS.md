# Learnings — AI UI Testing Tool

Patterns, pitfalls, and insights discovered during Test & Tune loop-backs.
Written so the next pass — and the next project — is faster and cheaper.

Each entry is added by the Reviewer at the end of Stage 5, whether the work
ships or loops back.

---

## How to add an entry

```
### [YYYY-MM-DD] Short title

**Trigger:** What caused the loop-back or the learning?
**Root cause:** Why did it happen?
**Fix:** What was changed?
**Future prevention:** What to do differently next time?
```

---

## Log

<!-- Entries go below this line, newest last. -->

### [2026-05-27] Pure-core / thin-shell made an AI+browser tool highly testable

**Trigger:** Stage 5 review — 47 tests ran in ~1s with no API key and almost no browser.
**Root cause:** Each module split pure logic (BFS, parsing, validation, result
mapping, coverage, flake, render) from I/O (Playwright, Claude, HTTP), with the
Claude client injectable (fake SDK in tests).
**Fix:** n/a — this was the chosen design and it paid off.
**Future prevention:** Default to this pattern for AI- and browser-backed tools;
it lets most ACs be verified without live keys/browsers and isolates the costly bits.

### [2026-05-27] Next.js in-memory cross-route state must live on globalThis

**Trigger:** Live SSE stream returned "run not found" — POST and stream routes saw different stores.
**Root cause:** Next.js duplicates module instances across route files (and HMR),
so a module-level singleton is not shared.
**Fix:** Stash the singleton on `globalThis` (the Prisma-client pattern).
**Future prevention:** For any shared in-memory state across Next route handlers,
use globalThis from the start; never assume module singletons are process-wide.

### [2026-05-27] External-dependency keys gate OUTCOME verification, not just runtime

**Trigger:** Stage 5 couldn't verify AC5/AC11/M1 until an API key was supplied; the build was otherwise complete.
**Root cause:** The Anthropic key was treated as a runtime dependency (DEP1) but
not as a _verification-readiness_ dependency for Test & Tune.
**Fix:** User supplied a key; keyed live run confirmed all ACs (80% coverage).
**Future prevention:** At Record/Assemble, flag dependencies needed to _verify_
acceptance criteria, not only to run the product — so Stage 5 isn't blocked late.

### [2026-05-27] v1 missed the established Playwright Agents pattern

**Trigger:** After shipping v0.1.0, the user pointed to the official Playwright
Agents (planner/generator/healer markdown subagents + `playwright-test` MCP) and
asked whether our system matched — it did not.
**Root cause:** Clarify/Record never surveyed prior art deeply. The Brief's "prior
art" section flagged that commercial tools exist but we didn't examine the
official Playwright agent tooling, so we designed a bespoke SDK pipeline + a thin
reporter instead of the MCP live-recording agent pattern the user expected.
**Fix:** Looping back to Record for a v2 (spec v0.2.0) on the hybrid agent design.
**Future prevention:** In Clarify, when a domain has first-party/standard tooling
(here, Playwright's own agents), inspect it before designing from scratch — a
prior-art spike at Stage 1 would have caught this before any build.

### [2026-05-27] Auto-heal quality is the weak point to tune next

**Trigger:** Keyed run hit M1 (80%) and M2 (0% flake) but M3 auto-heal was 33% (1/3), below the ≥50% target.
**Root cause:** Healer prompt/retry strategy repaired only one of three locator failures.
**Fix:** Deferred — tracked as a post-ship tuning item, not a build defect.
**Future prevention:** Treat AI-repair success rate as a tunable metric with its
own iteration loop; a single keyed sample is enough to expose it but not to tune it.

### [2026-06-01] "Migrating" to the Playwright CLI didn't take — the MCP server was still winning

**Trigger:** After the agent defs were switched to a `playwright-cli`-based prompt,
a live run's logs still showed `mcp__playwright-test__browser_*` tool calls and zero
CLI calls. The migration looked done but wasn't.
**Root cause:** The "migration" only changed the prompts and stripped the
`mcp__playwright-test__*` entries from each agent's `tools:` frontmatter. It left the
server **enabled** (`.mcp.json` + `enabledMcpjsonServers` in `.claude/settings.local.json`).
Because the runtime runs agents with `permissionMode: "bypassPermissions"`, the
`tools:` allow-list doesn't fence the agents off an enabled MCP server — so they kept
using the convenient native `browser_*` tools instead of shelling out to the CLI.
**Fix:** Disabled the server outright — removed the `enabledMcpjsonServers` entry,
deleted `.mcp.json` and the dead `bin/smoke-mcp.ts`. With no server available the
agents fall through to `npx playwright-cli` (headless by default) as the prompts
intend. Verified: typecheck + 69 unit tests pass; `playwright-cli open` runs headless.
**Future prevention:** A tool migration isn't complete until the _old_ path is
removed and a run's logs confirm the _new_ path is the only one used. Under
`bypassPermissions`, removing a tool from an agent's `tools:` list is not enough to
disable it — disable the MCP server itself.
