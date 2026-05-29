# Architecture Review — Deepening Opportunities

**Project:** AI UI Testing Tool (v0.2.0 — four-agent pipeline + rich reporter)
**Date:** 2026-05-29
**Scope:** the `src/` core (orchestrator, agents, results, reporter, runStore) and
the `app/api` seam. The React UI and agent prompt markdown are out of scope.

This report surfaces **shallow modules** — places where an interface is nearly as
complex as its implementation, or where one concept's knowledge is smeared across
several small modules so that understanding or changing it means bouncing between
them. Each card proposes a **deepening**: a refactor that turns leverage-poor
plumbing into a deep module with a small interface and concentrated complexity.

No interfaces are designed here. Pick one and we'll grill the design together.

**Build status (2026-05-29):** Candidate **B** (Run Manager) and Candidate **A**
(Run Workspace) have both been built directly — typecheck clean, 69 unit tests
pass, production build compiles. See `run-manager-design.md` for B's design. C and
D remain open.

---

## Candidate A — Run Workspace owns the on-disk contract

**Files:** `src/agents/workspace.ts`, `src/results/parse.ts`, `src/orchestrator/stages.ts`

**Problem.** `Workspace` is a **data struct, not a module** — a bag of five path
strings (`root, specsDir, testsDir, seedPath, configPath`). The actual knowledge
of the on-disk layout — _where the plan lives, where specs live, where Playwright
writes its results, what filename the config and the parser must agree on_ — is
smeared across three modules with no shared seam:

- `workspace.ts` writes the seed + a `CONFIG` template string that declares
  `reporter: [['json', { outputFile: 'results.json' }]]`.
- `parse.ts` **independently hardcodes** `results.json` when it reads results back
  (`join(ws.root, "results.json")`). Two modules must agree on a magic filename
  across a seam, enforced only by a code comment.
- `stages.ts` reaches past the struct into `ws.specsDir`, hardcodes the filename
  `"plan.md"` (while `readPlan` actually searches for _any_ `.md`), and
  `await import("node:fs/promises")` / `node:path` **inline** to write the trimmed
  plan — filesystem code leaking into what should be stage-orchestration logic.

Reading the plan and specs lives in `workspace.ts`; reading results lives in
`parse.ts`; running the suite (`defaultExecutor`) also lives in `parse.ts`. The
workspace's _layout invariants_ have no owner.

**Solution.** Promote the workspace from a path-struct to a module that **owns
the entire on-disk contract** behind behavioral operations: write/read the plan,
write the trimmed plan, read the generated specs, and run the suite → results. The
magic `results.json` and `plan.md` names live in exactly one place. Stages stop
importing `node:fs`; they ask the workspace to do the file work. The existing
`SuiteExecutor` injection point stays as a legitimate adapter seam for tests.

**Benefits.**

- **Locality:** changing the layout (a filename, a directory, the reporter
  config) becomes a one-module edit instead of a three-module hunt with a magic
  string that must stay in sync by hand.
- **Leverage:** stages and the orchestrator manipulate _plan / specs / results_
  as concepts, never raw paths or `node:fs`.
- **Test surface:** today the layout is only exercisable through a real run; a
  workspace module makes "write plan → trim → read back" and "run → parse" each
  testable through one interface (the `SuiteExecutor` seam already proves the
  appetite for this).

**Before / after.**

```
BEFORE — layout knowledge has no owner
  workspace.ts ── CONFIG: "results.json" ─┐ (must agree)
  parse.ts ────── reads "results.json" ───┘  + runs suite
  stages.ts ───── ws.specsDir + "plan.md" + inline node:fs import

AFTER — one module owns the contract
  ┌─ RunWorkspace ──────────────────────────────┐
  │  writePlan / readPlan / writeTrimmedPlan      │   stages.ts: no node:fs,
  │  readSpecs / runSuite()→results               │   no path joins, no
  │  (results.json / plan.md defined ONCE)        │   filename literals
  └───────────────────────────────────────────────┘
```

**Recommendation strength:** `Strong`.

---

## Candidate B — A Run lifecycle owner instead of three parallel representations

**Files:** `src/orchestrator/runService.ts`, `src/runStore/store.ts`,
`app/api/runs/route.ts`, `app/api/runs/[id]/report/route.ts`

**Problem.** A run's live state is split across **three representations** that
callers must keep in sync by hand:

1. the in-memory store (`globalThis.__runStore`),
2. a _parallel_ abort-controller registry (`globalThis.__runAborts`) keyed by the
   same `runId`, holding the non-serializable part of run state, and
3. disk (`.runs/<id>/run.json`).

The rule _"persist after every state change"_ is enforced by **convention, not by
the store**: `runService` calls `persistRun(...)` by hand after every single
mutation — `create`, each `addEvent`, `complete`, `fail`, `cancel`. Add a new
transition and forget the paired `persistRun`, and disk silently drifts from
memory. The store knows nothing about persistence; persistence knows nothing about
the store; `runService` is the human glue.

Worse, the _"a run lives in memory **and** on disk, reconcile them"_ rule is
re-implemented per API route: `app/api/runs/route.ts` builds a `byId` merge map
(in-memory wins); `report/route.ts` does its own "miss in store → fall back to
`listPersistedRuns()`" lookup. Every route that touches a run re-derives the same
memory-then-disk logic.

**Solution.** Introduce a single module that **owns a run's whole life**: start,
cancel, get-one (memory-then-disk), list (merged). Internally it coordinates the
in-memory store, the abort controllers, disk persistence, and the background
pipeline — so persistence becomes an _invariant of the owner_, not a caller's
responsibility, and the abort controller stops being a second global map. The
store reverts to a pure in-memory data structure; the owner wraps it with the I/O
concerns. API routes call one interface and never touch `globalThis` or
`listPersistedRuns` directly.

**Benefits.**

- **Locality:** "persist on every transition" and "register/deregister the abort
  controller" live in one place. A new lifecycle state can't drift disk out of
  sync.
- **Leverage:** routes get `start / cancel / get / list` and stop re-deriving the
  memory-vs-disk reconciliation (today duplicated in two routes, latent in more).
- **Test surface:** the lifecycle — start → event → cancel → persisted, or
  start → complete → reload-from-disk — becomes testable through one interface
  instead of reaching into `globalThis` and the filesystem.

**Before / after.**

```
BEFORE — caller is the glue
  route GET ─ byId merge (mem wins) ─┐
  report GET ─ store.get ?? disk ────┤ same reconcile, re-derived per route
  runService.startRun ─ store.create + persistRun
                     ├ addEvent + persistRun   (persist-by-convention,
                     ├ complete + persistRun     repeated at every step)
                     └ fail/cancel + persistRun
  globalThis.__runStore   +   globalThis.__runAborts   +   .runs/*.json
        (three representations of "the live runs")

AFTER — one owner
  ┌─ RunManager ─────────────────────────────────┐
  │  start(config)→id   cancel(id)                 │   routes: one interface,
  │  get(id) [mem→disk]  list() [merged]           │   no globalThis,
  │  (persists + aborts internally, invariant)     │   no reconcile logic
  └──────────────────────────────────────────────┘
```

**Recommendation strength:** `Strong`.

---

## Candidate C — Reporter owns report composition (collapse the shallow assembler)

**Files:** `src/reporter/report.ts` (`buildReport`), `src/orchestrator/orchestrate.ts` (step 4)

**Problem.** `buildReport` is a **shallow pass-through**: its input interface
(`ReportInput`, ~13 fields) is nearly identical to its output (`RunReport`, the
same ~13 fields). The implementation is a struct copy plus one
`computeSuccessRate(...)` call. Apply the **deletion test**: delete `buildReport`
and the orchestrator would inline a struct literal and one function call —
complexity barely moves. It is not earning its keep as a module.

Meanwhile the _real_ composition logic — knowing that a report is assembled from
_narrative + coverage + results + specs + plan + success-rate_ — lives in the
orchestrator's step 4, hand-gathering inputs (`readGeneratedSpecs`, `readPlan`,
`coverageFromResults`, `generateNarrative`) and threading ~13 named fields into
`ReportInput`. The orchestrator has to know the _anatomy of a report_.

(The Markdown/HTML renderers in `render.ts` are genuinely **deep** — a lot of
output behind `renderMarkdown` / `renderHtml`. They are not the problem; the
shallow assembler and the leaked composition are.)

**Solution.** Give the Reporter a single entry point that **composes a
`RunReport` from a finished run's artifacts** — hand it the workspace, results,
coverage inputs, and the Claude client; get back a `RunReport`. It absorbs the
narrative call, plan/spec reads, success-rate, and assembly. The orchestrator's
~15-line step 4 collapses to one call and no longer knows what a report is made
of.

**Benefits.**

- **Leverage:** the orchestrator orchestrates _stages_; it stops knowing the
  internal anatomy of a report.
- **Locality:** "what goes into a report and how" lives in the Reporter, next to
  the renderers that consume it.
- **Test surface:** report composition becomes testable as one unit
  (artifacts → `RunReport`) rather than only as a side effect of a full pipeline
  run.

**Before / after.**

```
BEFORE                                AFTER
orchestrate step 4:                   orchestrate step 4:
  readGeneratedSpecs                    report = Reporter.compose(ws, results,
  readPlan                                                coverageInputs, claude)
  coverageFromResults
  generateNarrative                   Reporter owns: narrative + coverage +
  buildReport({ ...13 fields })         specs + plan + successRate + assembly
  (orchestrator knows report anatomy)   (buildReport's shallow copy absorbed)
```

**Recommendation strength:** `Worth exploring` (leans Strong; the only caution is
keeping the Reporter's input interface genuinely small, not a 13-field echo).

---

## Candidate D — A Stage seam for the four-agent pipeline

**Files:** `src/orchestrator/stages.ts`, `src/orchestrator/orchestrate.ts`

**Problem.** `planTests`, `generateTests`, and `healTests` are three near-identical
**shallow wrappers** of the same shape: `load(agentName)` → build a prompt →
`run({ agent, prompt, cwd: ws.root, onEvent, abortController, maxTurns })` → read
an artifact → decide `isError` from what was produced. The orchestrator then
sequences them by hand, repeating `agentRuns++`, an `emit(...)` line, and a
`checkCancelled()` around each. The per-stage option types overlap
(`PlanOptions` and `GenerateOptions` both carry `crawlMode` + `maxPages`).

The leverage is low: despite three "stage" functions, the orchestrator still owns
the order, the progress messages, the run-counting, and the cancellation cadence.
The thing that actually varies between stages — _which agent, what prompt, what
artifact defines success_ — is the small part; the ceremony around it is copied.

**Solution.** Model a pipeline **stage** as one concept with a small seam: a stage
knows its agent, how to build its prompt from the run config + workspace, and how
to judge its own success from artifacts. The orchestrator then runs a list of
stages with the cancellation / emit / counting cadence written **once**.

**Benefits.**

- **Locality:** the cross-stage cadence (cancel-check, emit, count) lives in one
  loop instead of being copy-pasted per stage.
- **Leverage:** adding or reordering a stage is a list change, not new
  orchestration ceremony.
- **Test surface:** a stage's "build prompt + judge success" becomes testable in
  isolation from the SDK runner.

**Caution / deletion test.** The prompts and success-criteria _genuinely differ_
per stage (the Planner saves a `.md`; the Generator must produce `.spec.ts`; the
Healer edits in place and has no artifact of its own — its success is judged later
by the pre/post re-run reconciliation). A stage abstraction risks being **shallow
itself** if it just relocates three different prompts behind a uniform shell.
Worth grilling before committing — this is the candidate most at odds with the
Constitution's "no premature abstraction" rule.

**Recommendation strength:** `Worth exploring`.

---

## Top recommendation

**Start with Candidate B — the Run lifecycle owner.** It has the most scattered
**locality** today (run state split across two `globalThis` maps plus disk, kept
in sync by hand-placed `persistRun` calls, with the memory-vs-disk reconciliation
re-derived per route), the clearest **deletion test** win (delete the owner and
that glue reappears in every route), and the biggest **test-surface** payoff (the
run lifecycle is currently only exercisable by reaching into `globalThis` and the
filesystem). It also has the lowest risk of becoming a shallow abstraction,
because it concentrates behavior that _already exists and is already duplicated_
rather than inventing a new layer.

Candidate A pairs naturally with it (both are about giving an owner to state that
currently leaks), and C is a quick, safe win once you're in the reporter.

---

**Which of these would you like to explore?**
