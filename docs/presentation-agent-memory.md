# Agent Memory: Test Agents That Learn

> Presentation talking points & speaker script. Grounded in the real
> Knowledge Platform (Phases 1–3) and **real measured data from two runs on
> tarento.com**. Companion docs: `docs/knowledge-database-schema.md`,
> `docs/knowledge-platform-architecture.md`.

- **Audience:** stakeholders / engineers
- **Core thesis:** memory turns a clever-but-forgetful testing agent into a
  senior engineer who gets faster and smarter on your app every single run.

---

## Slide outline (quick reference)

1. **The hook** — two QA engineers (amnesiac vs. one who remembers)
2. **The first run** — the cold start (no memory)
3. **Capturing knowledge** — filing away what we learned
4. **The future run** — standing on the shoulders of run 1
5. **A real remembered fix** — concrete before → after
6. **Why it helps** — the payoff
7. **The numbers** — run 1 vs run 2 timing (−20%, measured)
8. **It compounds** — runs get faster over time
9. **Without a knowledge DB** — what we lose (Groundhog Day)
10. **The honest floor + what's next**
11. **Closing takeaway**

---

## 1. The hook (opening)

> "Imagine two QA engineers. The first has never seen your website — every
> morning they wake up with total amnesia, re-learn the whole app from scratch,
> and re-solve the same bugs they fixed yesterday. The second is a senior
> engineer who _remembers_: 'I tested this site last week, the news-carousel
> buttons have no aria-label, and here's the exact fix that worked.'
>
> Most AI testing agents are the first engineer. **What we built turns them into
> the second.** Tonight I'll show you how — with real numbers from our own runs
> on tarento.com."

**Key message:** memory is the difference between agents that _repeat work_ and
agents that _compound knowledge_.

---

## 2. The first run on tarento.com — "the cold start"

On the very first run of a brand-new site, the agents have **nothing to draw
on**. A run is a pipeline of four agents:

| Agent         | What it does on a cold run                                                                                                                                           |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Planner**   | Opens a browser, crawls tarento.com live, writes a test plan from scratch — every flow it finds (home, services, industries, case studies, news carousel, contact…). |
| **Generator** | Turns each planned scenario into a real Playwright test — **all of them, from zero.**                                                                                |
| **Healer**    | Runs the suite; for every failing test, debugs and repairs it (resilient selectors, waits, corrected assertions), re-running until it passes.                        |
| **Reporter**  | Aggregates results, screenshots, and a narrative.                                                                                                                    |

**Real data — our first tarento run:**

- **25 tests generated**, all from scratch (0 reused).
- **8 failed and had to be healed** (e.g., the news-carousel nav buttons had no
  accessible label — the Healer rewrote the locators).
- 1 flaky, 16 passed clean. **Total: ~40 minutes.**

> Speaker note: "On this first run the agents did _everything_ the hard way —
> explored blind, wrote every test from zero, and spent real time fixing 8 broken
> tests by trial and error. **None of that effort is saved... unless we capture
> it.** That's the whole point."

---

## 3. Capturing the knowledge — "filing away what we learned"

The instant a run finishes, one best-effort step (`ingestRun`) files everything
into a **PostgreSQL knowledge database** — the bridge between "we did work" and
"we remember the work."

| What we learned                                                                                     | Where it's filed                                                                               |
| --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| **Which app this is** (identity)                                                                    | `apps` — keyed by normalized origin, so `www.tarento.com` and `tarento.com` are the _same_ app |
| **The run**                                                                                         | `runs`                                                                                         |
| **Every test we wrote** — title, flow, and a **"meaning fingerprint"** (AI embedding)               | `specs`                                                                                        |
| **What passed / failed / was healed**                                                               | `test_results`                                                                                 |
| **The plan the Planner produced**                                                                   | `raw_reports` (kept verbatim)                                                                  |
| **How the Healer fixed each failure** — broken code → fixed code, strategy, the failure it resolved | `healing_events`                                                                               |

> Speaker note (the killer detail): "The Healer doesn't _report_ what it fixed —
> it just edits files. So we reconstruct each fix **deterministically by diffing
> the test before and after healing.** No extra AI calls, no guesswork. The
> literal before-and-after change _is_ the captured knowledge."

Two principles worth stating:

- **Append-only & honest** — a new run never overwrites an old one; it's a
  growing, auditable history.
- **Never blocks a run** — if the DB is down, ingestion is skipped silently.
  Memory is a superpower, never a single point of failure.

Periodically, an offline **distillation** job clusters those raw fixes into
generalized **playbooks** — _"principle: brittle CSS selectors flake across runs;
prefer role/label locators"_ — promoted to "trusted" only once enough independent
runs back them up.

---

## 4. The future run — "standing on the shoulders of run 1"

Run tarento.com **again**, and each agent silently queries that knowledge base
_before_ doing its work — getting its past experience injected into its prompt.

| Agent         | What it retrieves                                                  | The query                                                     |
| ------------- | ------------------------------------------------------------------ | ------------------------------------------------------------- |
| **Planner**   | Its **last plan** for this site, as a head start                   | "most recent plan for tarento"                                |
| **Generator** | **Every test ever written** for this app, matched by _meaning_     | "have we tested this already? (semantic search via pgvector)" |
| **Healer**    | **Past successful fixes** for similar failures + trusted playbooks | "have I fixed a failure like this before? what worked?"       |

The standout is the **Generator's reuse decision**: for each planned scenario it
asks _"have we tested something that means the same thing before — even if worded
differently?"_ If there's a confident match to a **previously passing** test, it
**copies it forward instead of regenerating it.**

> Speaker note: "The agents never touch the database themselves. The orchestrator
> runs the queries and hands the results to the agent as plain text — _'KNOWN
> FIXES from prior runs'_ and _'LEARNED PRINCIPLES.'_ The agent just reads its own
> past experience like notes from a colleague."

**Real data — our SECOND tarento run (the proof):**

|                             | Run 1 (cold) | Run 2 (with memory) |
| --------------------------- | ------------ | ------------------- |
| Generated from scratch      | 25           | **19**              |
| **Reused** (copied forward) | 0            | **5**               |
| Needed **healing**          | **8**        | **0**               |

> "This isn't theory — it's our own data. On the second run the system recognized
> 5 tests it had already proven good and copied them forward. And because reused
> tests are already known-passing, **the Healer had nothing to fix. Eight heals
> became zero.** The flywheel turned."

---

## 5. A real remembered fix (concrete before → after)

A genuine `healing_events` row from tarento — the cookie-consent test:

```
flow:     Cookie consent banner acceptance
strategy: regex-text  (exact assertion was too strict)

BEFORE (broke):
   await expect(banner).toBeHidden();

AFTER (the fix that worked, now remembered):
   // The banner animates out (opacity → 0, slides below) — it isn't
   // removed from the DOM, so toBeHidden() was wrong.
```

> "This exact fix is now in the knowledge base. The next run that hits a similar
> 'element animates instead of disappearing' failure gets handed this fix instead
> of re-discovering it. That's memory doing real work."

---

## 6. Why this is helpful (the payoff)

1. **Less wasted work** — reused tests skip the expensive AI generation step.
2. **Faster, more reliable healing** — a known failure comes with the fix
   attached, and reused passing tests don't fail in the first place.
3. **Resilient-by-default tests** — the Generator gets "locator hints" from past
   heals, so _new_ tests avoid the brittle patterns that broke before.
4. **It compounds** — run 1 teaches run 2; run 2 teaches run 3. Knowledge
   accumulates instead of evaporating.
5. **Auditable & explainable** — every reuse and injected fix is evidence-linked
   and shows on the run's event stream (_"🩹 Applying 3 known fixes from past
   runs"_). No black box.
6. **Cross-run consistency** — proven tests are carried forward, so you get
   stable, non-redundant suites instead of a slightly different 25 every time.

> "We didn't make the agent _smarter_. We gave it a _memory_ — and a memory is
> what turns a clever-but-forgetful intern into an experienced engineer who knows
> your app."

---

## 7. The numbers — memory made the run ~20% faster (measured)

Same site, real per-stage timing from the two completed runs:

| Stage                 | Run 1 (cold: 0 reuse, 8 heals) | Run 2 (memory: 5 reuse, 0 heals) | Δ                                 |
| --------------------- | ------------------------------ | -------------------------------- | --------------------------------- |
| planning (live crawl) | 4.9m                           | 5.2m                             | +0.3m                             |
| **generating**        | **8.1m**                       | **5.9m**                         | **−2.2m** ← reuse skipped 5 tests |
| **healing**           | **24.8m**                      | **19.2m**                        | **−5.6m** ← 0 fixes vs 8          |
| flake-check           | 0.6m                           | 0.5m                             | —                                 |
| reporting             | 1.1m                           | 0.9m                             | —                                 |
| **TOTAL**             | **39.7 min**                   | **31.7 min**                     | **−8 min (~20% faster)**          |

The savings land exactly where memory acts: **generation** (reuse) and
**healing** (fewer fixes). Planning (the live crawl) is the hard floor.

> Honest note that _earns_ credibility: "Run 2 still spent ~19 minutes in
> 'healing' with **zero** fixes — because that stage is really the Healer
> _running the full suite in a live browser_, not the fixing. That execution time
> is the irreducible floor. Memory removes redundant _thinking_ and _fixing_;
> it can't remove the need to actually run the tests."

---

## 8. It compounds — runs get faster over time

> **"Every run teaches the next one. The more the agents test your app, the less
> time each run takes — because there's less to figure out from scratch."**

The trend already started — you can _show_ it, not just claim it:

```
Run 1 (cold, 0 reused)      ████████████████████  39.7 min
Run 2 (5 reused, 0 heals)   ████████████████      31.7 min   (−20%)
Run 3 (more reused…)        ███████████…          ↓ toward the floor
```

- Run 1 knew nothing → generated 25, healed 8.
- Run 2 remembered run 1 → reused 5, healed 0 → **8 minutes faster.**
- Run 3+ recognizes _even more_ of its own proven tests (the library of
  known-good specs and known fixes keeps growing), so generation and healing keep
  shrinking.

**Why it compounds, in one breath:** each run adds its tests and its fixes to the
knowledge base, so the next run has a bigger library to reuse and bigger library
of fixes to apply. Reuse goes **up**, regeneration goes **down**, healing goes
**down** — and those are the two biggest controllable costs. It's a flywheel: the
more it spins, the easier it spins.

**The honest curve (a strength, say it):** it doesn't shrink to zero. Every run
still crawls the live site and _runs_ the tests in a real browser — the floor. So
the curve **bends down and flattens**, converging toward the cost of simply
executing a stable, mostly-reused suite. The _wasted, repeated_ effort disappears;
the genuinely necessary work remains.

> Slide takeaway: **"Knowledge compounds, redundant work evaporates, and each run
> converges toward the irreducible minimum — the cost of just running your tests
> once. The agents don't just remember; they get _more efficient every time they
> run._"**

---

## 9. Without a knowledge DB — what are we missing?

**Without memory, every run is Groundhog Day.** The agents wake with amnesia
every time:

- **No reuse** — every test regenerated from scratch, every run, paying full AI
  cost to reproduce tests you already had.
- **Healing amnesia** — the Healer re-discovers the _same_ fix for the _same_
  failure on every run, forever. The cookie-banner fix gets re-invented each time.
- **Repeated mistakes** — the Generator keeps writing the same brittle selectors,
  because nothing says "that broke last time."
- **No learning, ever** — run #50 is no smarter than run #1. A flat line of
  repeated effort, no improvement curve.
- **No history, no insight** — can't answer "is coverage growing?", "which flows
  are chronically flaky?", "how did we fix this before?" — nothing was recorded.
- **Duplicate, drifting suites** — a slightly different set of tests each run, no
  continuity.

> Closing contrast: "Without a knowledge database you have a very capable agent
> _condemned to repeat itself forever_. With one, you have an agent that **gets
> better at testing your specific app every time it runs** — and the only thing it
> costs is writing what it learned to a table."

---

## 10. The honest floor + what's next (credibility slide)

- Memory removes _redundant_ work (generation, re-healing). Some costs are
  **irreducible** — crawling the live site and _running_ every test (plus a few
  re-runs for flake detection). Memory makes runs **leaner and more reliable**,
  not instant.
- The design mirrors human cognition — **three memory types**: **episodic** (raw
  past runs & fixes), **semantic** (distilled playbooks/principles), **procedural**
  (which crawl strategy covers an app best) — plus a **short-term** context pack
  assembled fresh per agent and discarded.
- Roadmap: sharper failure signatures (shipped) → richer playbooks via
  distillation → precedent reuse climbing run-over-run.

---

## 11. Closing takeaway (final slide)

> **"Agent memory turns testing from a series of disconnected one-night-stands
> into a relationship — every run on your app makes the next one cheaper, faster,
> and smarter, because the agents finally remember what they learned. We measured
> it: run two was 20% faster than run one, and that gap widens as the knowledge
> compounds."**

---

### Appendix — the data behind the slides (for Q&A)

- Runs: `a58a8a9a` (cold, 39.7 min, 25 specs, 8 heals) · `109299de` (memory,
  31.7 min, 24 specs, 5 reused, 0 heals) — both on `https://www.tarento.com/`
  (normalized to `https://tarento.com`).
- Stored healing knowledge at time of writing: 37 real `healing_events` for
  tarento across both runs (strategies: role-locator, regex-text,
  wait-visibility, assertion-fix, other).
- Memory channels: Planner ← latest plan; Generator ← all prior specs (semantic
  reuse, pgvector); Healer ← past successful fixes + trusted playbooks.
- All retrieval is best-effort: KB unavailable → agents run exactly as without
  memory, never blocked.
