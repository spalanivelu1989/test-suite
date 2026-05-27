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
