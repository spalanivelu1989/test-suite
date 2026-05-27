# Implementation Notes — AI UI Testing Tool

This file is a live log maintained **during Stage 4 (Forge)**. Every time the
builder encounters something not covered by the Spec — a gap, a tradeoff, a
change, or an assumption — they add a dated entry here immediately.

**Do not write this file retrospectively.** Log the decision the moment it is made.

---

## How to add an entry

```
### [YYYY-MM-DD] Short title of the decision

**Type:** Gap | Tradeoff | Change | Assumption
**Task:** <task ID or name this relates to>

What the Spec said (or didn't say), what was decided, and why.
Keep it to 2–5 lines. If in doubt, write it down.
```

---

## Log

<!-- Entries go below this line, newest last. -->

### [2026-05-27] Heal success + "healed" outcome reconstructed via pre/post runs (T17)

**Type:** Decision
**Task:** T17

The Healer agent repairs specs opaquely (the final run just shows passing tests),
so the "healed" outcome and M3 aren't directly observable. The orchestrator runs
the suite once BEFORE healing and again AFTER (via the flake re-runs); tests that
went failed→passed are marked "healed" and M3 = healed ÷ initially-failed. Costs an
extra suite run but makes M3 measurable and the report honest.

### [2026-05-27] claudeCallCount approximated for agent stages (T17)

**Type:** Assumption
**Task:** T17

Agent stages run via the Agent SDK, whose Claude calls aren't counted by our
`claude/client` (that only powers the Reporter narrative). claudeCallCount is
reported as agentRuns (3) + narrative calls — a proxy, not an exact API call
count. AC5's real evidence is the agent runs + SDK logs, not this number.

### [2026-05-27] Coverage matcher over-credits on generic tokens (T11)

**Type:** Assumption
**Task:** T11

The reused `isCovered` matcher counts a curated flow as covered on any
significant-token overlap — so generic words like "page" can falsely match (e.g.
"careers page" vs "home page"). Acceptable for v0.2.0 (the curated tarento flow
names are distinctive enough), but a stopword filter would make M1 coverage more
trustworthy. Flagged for tuning, not fixed now.

### [2026-05-27] v0.2.0 Forge — Agent SDK verified (T1)

**Type:** Decision
**Task:** T1

`@anthropic-ai/claude-agent-sdk@0.3.152` `query()` works headlessly with the
bundled runtime (no separate Claude Code CLI install) and authenticates via
`ANTHROPIC_API_KEY` from env. Smoke test returned "PONG", result subtype
`success`. Safe to build the agent runtime (T4) on this.

### [2026-05-27] Initialized git for atomic per-task saves

**Type:** Decision
**Task:** Forge setup

The project wasn't a git repo. The Constitution/Plan imply atomic, reversible
saves per task, so initialized git and committed the CRAFT artifacts as the
baseline. Each completed task is committed as its own unit.

### [2026-05-27] No Anthropic API key in environment

**Type:** Assumption
**Task:** T3 and all Claude-dependent tasks (T6, T7a, T10)

No `ANTHROPIC_API_KEY` is set. The Claude client reads the key from env /
`.env.local` at runtime. Build and unit checks proceed without it; live
Claude-dependent verification (AC5, real flow/test/heal generation) is deferred
until the user supplies a key. Code must fail clearly if the key is absent at run time.

### [2026-05-27] Run store must live on globalThis, not a module variable

**Type:** Change
**Task:** T17 (found while browser/API testing)

The Plan's in-memory run store (D6) used a module-level singleton. Testing the
live SSE stream showed "run not found": Next.js duplicates module instances
across separate route files (and HMR), so the POST route and the stream route
held different store instances. Fixed by stashing the singleton on globalThis —
the standard Next.js pattern for shared in-memory state. Verified end-to-end:
crawl→identify events streamed, then a clean no-API-key failure (no false pass).

### [2026-05-27] Curated tarento.com flow list defined without live browsing

**Type:** Assumption
**Task:** T12

The 10 curated flows in `fixtures/tarento-flows.json` were derived from typical
corporate-marketing-site structure (home, nav, services, industries, case
studies, insights, about, careers, contact, footer), not a live crawl of
tarento.com. The list is the M1 denominator and should be reconciled against the
real site before measuring coverage in Stage 5.

### [2026-05-27] Anchored shared domain types in src/types.ts up front

**Type:** Decision
**Task:** T4

Defined the cross-cutting domain model (Run, RunConfig, ProgressEvent,
CrawlResult, Flow, GeneratedTest, TestResult, CoverageSummary, RunReport) in one
module during T4 rather than letting each later task invent its own shapes. The
Plan implies these flow between modules; centralizing avoids rework churn.
Producers are still implemented in their own tasks.

### [2026-05-27] Manual Next.js scaffold instead of create-next-app

**Type:** Tradeoff
**Task:** T1

`create-next-app` is interactive and pulls opinionated defaults. Scaffolded the
Next.js App Router project manually (package.json, tsconfig, next.config, app/)
for deterministic control over deps (React 19, Chakra, Framer, Lucide) and to
keep the install reproducible.
