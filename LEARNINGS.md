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

### [2026-05-27] Auto-heal quality is the weak point to tune next

**Trigger:** Keyed run hit M1 (80%) and M2 (0% flake) but M3 auto-heal was 33% (1/3), below the ≥50% target.
**Root cause:** Healer prompt/retry strategy repaired only one of three locator failures.
**Fix:** Deferred — tracked as a post-ship tuning item, not a build defect.
**Future prevention:** Treat AI-repair success rate as a tunable metric with its
own iteration loop; a single keyed sample is enough to expose it but not to tune it.
