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

### [2026-06-05] An e2e round-trip caught a data-shape bug unit tests missed (KP Phase 1)

**Trigger:** Stage 5 review — a live ingest→retrieve check showed one flow as
BOTH "covered" and "a gap" in the Planner pack; no unit test caught it.
**Root cause:** Curated flow ids (`hero`) and tested result flowIds (`hero cta`)
normalize to different keys, so the same flow appeared twice with one tested and
one not. Unit tests used clean single-key fixtures and never exercised the dual-key
reality.
**Fix:** `appProfile.ts` collapses flows by `norm(name)` (covered if ANY row
tested) and derives gaps from `coverage_snapshots.missing_flows`; added assertions.
**Future prevention:** For any data-shape/aggregation module, run ONE live
end-to-end round-trip with realistic data before declaring done — unit fixtures
hide cross-record contradictions.

### [2026-06-05] Acceptance criteria about a STORED representation need a store-reading test

**Trigger:** Stage 5 — AC15 ("raw RunReport retrievable as JSONB") had no direct
evidence; the rebuild test re-ingested in-memory objects, never reading raw_reports.
**Root cause:** A rebuild/round-trip test that holds the source in memory proves
the transform, not the persistence.
**Fix:** Added a test that queries `raw_reports` and asserts the JSONB round-trips.
**Future prevention:** When an AC asserts "stored as X / retrievable as X", the
test must read X back out of the store, not from a JS variable.

### [2026-06-05] Best-effort/never-throw made a DB-backed feature ship offline-safe

**Trigger:** KP Phase 1 built and fully tested with no managed DB — a local
Postgres sufficed, and the pipeline runs unchanged when the KB is absent.
**Root cause:** `withKb` (one wrapper, log-never-throw) + a disabled service
default meant "KB absent = cold run" was the easy path, not an afterthought.
**Future prevention:** For any new external dependency, design the absent/unreachable
path first (graceful degradation) — it de-risks the whole build and keeps CI green
without the dependency.

### [2026-06-05] Build the metric-measurement harness as part of the feature (KP Phase 2)

**Trigger:** Stage 5 — Phase 2's success metric ("≥70% paraphrase recall, ≤5%
false-reuse") was abstract until a calibration harness measured it.
**Root cause:** thresholds (SEM_REUSE/SEM_EXTEND) can't be guessed; they must be
chosen from data.
**Fix:** `bin/knowledge-calibrate.ts` swept thresholds over a labeled set with the
real model and picked SEM_EXTEND=0.60 (95% recall / 0% false-reuse).
**Future prevention:** when a Spec sets an outcome metric with a tunable, build the
measurement harness IN the same phase — it turns "hope" into a tuned, evidenced
result and resolves the calibration open-question.

### [2026-06-05] "Additive, pure-function-with-optional-input" makes no-regression a diff test

**Trigger:** Phase 2 had to guarantee "never worse than Phase 1" while adding a
semantic signal.
**Root cause:** layering a new signal risks changing existing behavior.
**Fix:** `decideForSpecs` takes optional embeddings; with sem=0 it provably reduces
to the lexical decider, so AC7/N3 is a literal `embeddings-off == lexical` test,
and Phase 1's tests pass unchanged under the new code.
**Future prevention:** when adding a signal to an existing decision, make it
additive and prove the baseline-equivalence with a diff test, not a manual argument.

### [2026-06-05] AI-generated ground truth must carry a "needs human verification" flag

**Trigger:** Phase 2's M1/M2 numbers (95%/0%) rest on a Claude-generated paraphrase set.
**Root cause:** an AI-authored label set reads as more authoritative than it is.
**Fix:** flagged "needs human verify" in the fixture, implementation-notes, and the
review report; live numbers deferred to /measure.
**Future prevention:** any metric whose ground truth is AI-generated is provisional
until a human verifies the set — say so loudly next to the number.

### [2026-06-07] A new requirement can be silently dead if nothing writes the column it reads

**Trigger:** Phase 3 R15 (procedural playbooks) read `runs.crawl_mode`, but
`persistRun` never wrote it and `RunReport` never carried it — the aggregation
always returned empty. Caught in Stage 5 by tracing the data to its source.
**Root cause:** a Should-level requirement depended on a legacy column that no
producer populated; tests that didn't set it passed anyway (empty result).
**Fix:** threaded `crawlMode` RunConfig→RunReport→buildReport→extract→persistRun;
added an AC17 procedural test that asserts a real row.
**Future prevention:** when a requirement reads an existing schema column, verify a
producer actually writes it; add a test that asserts a non-empty result, not just
"no error".

### [2026-06-07] Integration fakes must match the pgvector column dimension

**Trigger:** Phase 3 heal/distill DB tests inserted 3-d fake embeddings into
`vector(384)` columns; the insert threw and best-effort `withKb` rolled back,
surfacing as "0 rows" rather than an error.
**Root cause:** a dimension mismatch is a hard pgvector error, but the best-effort
wrapper hides it, so the test fails on a confusing count assertion.
**Fix:** construct `FakeEmbedder(map, 384)` (it pads) — the Phase-2
`semantic.integration.test.ts` pattern.
**Future prevention:** any embedding integration fake uses the real column dim;
when a "0 rows" assertion fails under best-effort ingest, suspect a silent rollback.

### [2026-06-07] Capture the failure signal from the PRE-state, not the post-fix state

**Trigger:** run 32a232e6 healed 4 failing tests but persisted 0 healing_events —
so the healing-memory flywheel never started on real runs.
**Root cause:** captureHealDeltas keyed the failure signature off the *reconciled*
(post-heal) results, where a successful heal reads as `passed` with no
`failureReason` → empty signature → event dropped. The signal it needed (what
failed and why) only exists in the *initial* (pre-heal) results.
**Fix:** pass both initial (failure + reason) and final (healed/fixme) results;
derive the signature from initial, the outcome from final. Regression test:
a heal that reads `passed` post-heal is still captured with a real signature.
**Future prevention:** when recording "what was fixed", capture the failure from
the BEFORE state — the after state has, by definition, erased it. A green test
tells you nothing about what it used to fail on.
