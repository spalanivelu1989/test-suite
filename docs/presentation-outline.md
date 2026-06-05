# Presentation — AI UI Testing Tool (Test Suite)

> A 10-slide deck with, for each slide: **what to show**, a **talking script**
> (presenter voice, ~45–75s), and **expected audience questions with answers**.
> Grounded in the project docs (`README.md`, `CONTEXT.md`, the CRAFT specs) and
> the codebase (35 modules, ~5,950 LOC, 157 tests).

**One-line pitch:** _Point it at a URL; it autonomously crawls, plans, writes,
validates, runs, and self-heals a Playwright UI test suite — and remembers what
it tested so the next run is smarter._

---

## Slide 1 — The Problem (Title slide)

**Show:**

- Title: "AI UI Testing Tool — autonomous front-end testing"
- 3 pain points: UI tests are slow & manual to write · brittle (break on every UI tweak) · so coverage stays thin and regressions slip through
- Tagline: "From URL to a tested, self-healing suite — with little human effort."

**Talking script:**

> "Front-end UI testing is where good intentions go to die. Writing Playwright or
> Selenium tests by hand is slow and needs specialised skill, and the moment a
> developer renames a CSS class or moves a button, those tests break. So teams
> either under-invest in UI coverage, or they spend more time maintaining tests
> than shipping features — and regressions still slip through to users. Our bet
> with this tool is simple: AI agents have gotten good enough to do this work
> themselves. You give it a URL, and it explores the app, writes the tests, runs
> them, and even repairs the ones that break — turning a multi-day manual effort
> into a single automated run."

**Expected questions:**

- _Is this replacing QA engineers?_ → No — it removes the repetitive scripting toil so QA focuses on judgment: what to test, edge cases, sign-off. It's a force-multiplier, not a replacement.
- _Why not an existing commercial tool?_ → We needed something we control and can extend (our own reporting, our own knowledge layer), and it doubles as internal capability-building in agentic AI.

---

## Slide 2 — What It Does (the loop)

**Show:**

- A simple flow graphic: **URL in → [crawl → plan → generate → validate → run → heal → report] → rich report out**
- The 3 deliverable formats: live web UI, plus downloadable **Markdown / HTML / JSON**
- A screenshot of the report (success rate %, pass/needs-attention/improve breakdown, code-view tab)

**Talking script:**

> "Here's the whole product in one picture. A user submits a web app URL in our
> web UI. Behind the scenes, a chain of AI agents does the work: it explores the
> live site, writes a test plan, turns that plan into real Playwright test files,
> checks their quality, runs them, repairs failures, and finally produces a rich
> report. The user watches each stage stream live, then gets a report they can
> actually act on — not just a pass/fail number, but a success rate, a breakdown
> of what passed and what needs attention, concrete 'here's what to change' fix
> prompts, and a code-view tab to inspect every generated test. And it's
> available as Markdown, HTML, and JSON, so it works for a human reading it or a
> CI pipeline parsing it."

**Expected questions:**

- _What does "primary user flow" mean?_ → A key task or navigable path on the site — e.g. open the contact form, browse services. We measure coverage against a curated list of these.
- _How long does a run take?_ → Depends on crawl depth and app size; it scales the agent's turn budget to the number of scenarios. (Give your live number if you have one.)

---

## Slide 3 — Architecture: The Agent Pipeline

**Show:**

- The 5-stage pipeline boxes: **Planner → Generator → Validator → (run) → Healer → Reporter**
- Tech badges: **Claude Agent SDK (Sonnet)** drives the agents · **Playwright CLI** drives the browser (headless) · **Next.js + React 19 + TypeScript** front end · in-memory run store + disk persistence under `.runs/`
- Note: "Each agent = one responsibility. Each run is isolated in its own workspace."

**Talking script:**

> "Architecturally, this is a pipeline of single-responsibility agents, run in
> sequence. The Planner explores and writes a plan. The Generator turns each
> planned scenario into a Playwright spec file. A deterministic Validator checks
> those specs. Then we run them, the Healer repairs what failed, and the Reporter
> aggregates everything. The agents themselves are powered by Claude — the Sonnet
> model via Anthropic's Agent SDK — and they drive a real browser through
> Microsoft's Playwright CLI, headless by default. The whole thing is fronted by
> a Next.js app. A key design choice: each run gets its own isolated workspace on
> disk, so runs never step on each other, and we keep the agents narrow — one job
> each — which makes the system predictable and debuggable."

**Expected questions:**

- _Why sequential agents instead of one big prompt?_ → Separation of concerns: each agent is simpler, testable, and independently improvable; failures are isolated to a stage.
- _Why the Playwright CLI and not the MCP server?_ → We migrated to the CLI because, under bypass permissions, agents kept reaching for MCP browser tools off the intended path; the CLI is headless-by-default and keeps them on one rail (recorded as a decision in our notes).
- _Is there a database?_ → For the core tool, no — in-memory plus best-effort disk persistence. The new Knowledge Layer (slide 7) adds Postgres, but it's optional.

---

## Slide 4 — Planner & Generator (Explore → Plan → Generate)

**Show:**

- Planner: explores the live app, writes a **Markdown test plan** (titled scenarios, numbered steps)
- Crawl modes table: **direct** (entry page only) · **standard** (depth 1) · **deep** (depth 3) · **aggressive** (depth 10), each with a scenario budget
- Generator: one **`.spec.ts` per scenario**, grounded against the live browser (resilient locators)
- Guardrails: a **crawl gate** (hard-stops out-of-scope navigation) and a **CLI guard** (forces browser actions through the CLI)

**Talking script:**

> "Let's go one level deeper into the front of the pipeline. The Planner opens the
> app in a real browser and explores it, then writes a human-readable Markdown
> plan — titled scenarios with numbered steps. The user controls how far it
> roams with crawl modes, from 'just this page' up to an aggressive multi-hop
> crawl, each with a budget so it can't balloon. The Generator then takes that
> plan and writes one Playwright test file per scenario, and crucially it does
> this grounded against the live page — it actually drives the browser to find
> stable locators rather than hallucinating selectors. And because we don't fully
> trust an LLM with a browser, we wrap it in code-enforced guardrails: a crawl
> gate that hard-denies navigation outside the allowed scope, and a guard that
> forces it to use the approved browser tooling. The agent can ignore a prompt;
> it cannot get past the gate."

**Expected questions:**

- _How do you stop it testing the whole internet?_ → The crawl gate enforces depth and page limits at the tool boundary, independent of the prompt.
- _Are the locators actually stable?_ → It prefers role/text/label locators by grounding on the live DOM; the Validator (next slide) then flags brittle ones.
- _What if the plan is huge?_ → We trim the plan to a scenario budget per crawl mode before generation, and scale the agent's turn limit to the scenario count.

---

## Slide 5 — The Validation Stage (deterministic quality gate)

**Show:**

- "Green ≠ good." A test can pass and still be worthless.
- 4 quality bars, all checked **statically — no browser, no LLM**:
  1. **Correctness** — imports, exactly one test per file, parseable
  2. **Meaningful assertions** — has `expect()`, not visibility-only, not tautological
  3. **Robustness** — no hard waits / `networkidle` / brittle selectors (xpath, deep CSS, positional `nth`)
  4. **Relevance** — each spec maps to a planned scenario; flags orphans & missing flows
- Output: a 0–100 score per spec + suite, fed into the report **and the Healer**

**Talking script:**

> "This is the slide I'd linger on, because it's what makes the output
> trustworthy. A generated test that passes isn't necessarily a good test — it
> might assert nothing, or only that a button is visible, or use a fragile
> selector that'll break next week. So between generation and running, we added a
> deterministic Validator. It reads the source of every spec — no browser, no AI,
> just fast rule-based analysis — and scores it on four bars: is it structurally
> correct, does it make meaningful assertions, is it robust against flakiness,
> and is it actually relevant to the plan. Each spec gets a 0-to-100 score. And
> we don't just report it — we feed those findings into the Healer, so it fixes
> the flagged anti-patterns alongside the real failures. Because it's pure rules,
> it's instant, free, and itself perfectly reliable."

**Expected questions:**

- _Why deterministic instead of an LLM judge?_ → Speed, zero cost, and — critically — determinism: the quality gate must itself be reliable, not flaky. An LLM judge is on the roadmap as an optional layer.
- _Does it block the run if a test is bad?_ → No — it's advisory. It informs the report and the Healer, but never blocks a run. (That keeps the pipeline robust; a hard gate is a deliberate future option.)
- _What's a "tautological" assertion?_ → Something like `expect(true).toBeTruthy()` — it asserts a literal, so it can never fail and proves nothing.

---

## Slide 6 — Run, Heal & Report (self-healing + honest reporting)

**Show:**

- **Self-healing:** Healer runs the suite, repairs failing locators/assertions, re-runs to green
- **Honesty built in:** what it can't fix → marked `test.fixme()` with a comment — **never reported as passed**
- **Flake detection:** re-runs to catch non-deterministic tests
- **The report:** success rate % · passed / needs-attention / where-to-improve · fix prompts · issues · recommendations · code-view · screenshots

**Talking script:**

> "Once the tests exist, the Healer runs them and goes to work on the failures —
> it debugs each one, fixes the locator or assertion, and re-runs until it's
> green. But here's the principle we care most about: no false confidence. If the
> Healer genuinely can't fix a test, it doesn't quietly delete it or fudge a
> pass — it marks it `fixme` with a comment explaining why, and the report shows
> it as 'needs attention.' We also re-run tests to catch flakiness, so a test
> that passes and fails randomly gets surfaced rather than hidden. The final
> report is the payoff: a real success rate, a breakdown by status, concrete fix
> prompts that tell you exactly what to change, screenshots, and the generated
> code itself. It's designed so a developer, a QA engineer, or a PM can all read
> it and know what to do next."

**Expected questions:**

- _How is "success rate" calculated?_ → Passed ÷ all planned tests; `fixme`/skipped count as not-passed, so the number can't be gamed.
- _Won't self-healing hide real bugs?_ → Healing only repairs the test's mechanics (locators, waits); a genuine app failure it can't fix stays visible as `fixme`. We measure heal success separately so it's auditable.
- _How do you know healing actually worked?_ → We run the suite before and after healing and mark tests that went failed→passed as "healed," so the heal rate is a measured number, not a claim.

---

## Slide 7 — The Knowledge Platform (history-aware testing) ⭐

**Show:**

- "Every run used to be amnesiac — it started from zero. Not anymore."
- **Knowledge Layer** over PostgreSQL: ingests every completed run (specs, flows, results, coverage)
- On the next run it makes agents smarter:
  - **Planner** explores the _gaps_, not what's already covered
  - **Generator** decides per scenario: **reuse / extend / new** → avoids regenerating existing tests
- Built to **degrade gracefully** — no database configured = runs exactly as before
- "The foundation: reuse, learn-from-fixes, multi-agent — all build on this."

**Talking script:**

> "This is the newest and, I think, the most strategic piece. Until now, every
> run was amnesiac — re-test the same app and it re-explored and re-wrote
> everything from scratch. We've given the pipeline a memory. There's now a
> Knowledge Layer, backed by Postgres, that ingests every completed run. On the
> next run against the same app, two things change: the Planner is told what's
> already been tested so it focuses exploration on the gaps, and the Generator
> gets a per-scenario decision — reuse this existing test, extend it, or write a
> genuinely new one — so it stops duplicating work. Importantly, we built this to
> be completely optional: if no database is configured, the tool behaves exactly
> as it did before, no errors, no change. This is Phase 1 of a bigger roadmap —
> it's the foundation that everything smarter, like learning from past fixes and
> multi-agent workflows, will build on."

**Expected questions:**

- _How does it know two tests are "the same"?_ → Phase 1 uses lexical token-overlap matching (reusing our coverage logic). It catches reworded-but-similar; truly paraphrased duplicates are Phase 2 with embeddings.
- _Why Postgres, given the tool had no DB?_ → Cross-run memory genuinely needs a queryable, concurrent store; we use managed/serverless Postgres to keep ops light, and recorded the decision as an ADR so it isn't re-litigated.
- _What happens if the database is down mid-run?_ → Nothing bad — every knowledge call is best-effort and never throws; the run completes "cold," exactly as without a DB.

---

## Slide 8 — How It's Engineered (the principles)

**Show:**

- **Built with C.R.A.F.T.** — a 5-stage spec-driven workflow (Clarify → Record → Assemble → Forge → Test & Tune) with a human sign-off between stages
- 4 non-negotiable principles: **Spec is the contract · Nothing ships unverified · Keep it simple · Determinism over flakiness**
- **Testability:** pure logic split from I/O → 157 tests run in ~1s, mostly with no browser/API/DB
- **Graceful degradation everywhere** — missing API key, missing DB, hung browser all fail safe

**Talking script:**

> "A quick word on how this is built, because the engineering discipline is part
> of why I trust it. Everything goes through a framework we call CRAFT — you
> clarify the problem, write a spec, plan it, build it, then validate it, with a
> human approving each step. We hold a few rules as non-negotiable: if it's not
> in the spec it doesn't get built; nothing ships unverified; favour the simplest
> thing that works; and reliability beats cleverness — a flaky test is a bug. In
> practice that means we separate pure logic from messy I/O, so the bulk of our
> 157 tests run in about a second with no browser, no API key, and no database.
> And we design every external dependency to fail safe: no Anthropic key, no
> database, a hung browser — each degrades cleanly instead of crashing a run.
> The result is a system that's both ambitious in what it automates and
> conservative in how it behaves."

**Expected questions:**

- _Isn't a heavy process slow for a small team?_ → It front-loads the thinking where mistakes are cheap; it's caught real drift for us (e.g. a feature built ahead of its spec got reconciled, not shipped silently).
- _How do you test an AI + browser tool deterministically?_ → Inject fakes for the LLM and browser, and test the pure logic (planning math, validation rules, coverage, reporting) exhaustively; the non-deterministic parts are thin shells.

---

## Slide 9 — Results & Metrics

**Show:**

- Core targets (measured against the reference app, tarento.com):
  - **M1 — Flow coverage ≥ 80%**
  - **M2 — Flake rate < 5%**
  - **M3 — Auto-heal success ≥ 50%**
  - **M4 — Generated-test quality ≥ 95% clean** (zero error-level findings)
- Knowledge Platform targets: coverage-detection **≥90% recall / ≥80% precision**; duplicate-avoidance **≤20% regenerated**
- Engineering health: 157 tests green · type-clean · ~5,950 LOC across 35 modules

**Talking script:**

> "How do we know it works? We hold the tool to measurable targets against a
> reference site. We aim to autonomously cover at least 80% of an app's primary
> flows, keep the flake rate under 5%, repair at least half of the locator
> failures automatically, and ensure at least 95% of generated tests are free of
> serious quality issues. The new Knowledge Layer adds its own bar — on a repeat
> run it should correctly recognise prior coverage with high accuracy and avoid
> regenerating more than a small fraction of existing tests. And on the
> engineering side: the codebase is around 6,000 lines across 35 focused modules,
> fully type-checked, with 157 passing tests. I want to be candid that the live
> outcome numbers for the newest features are measured post-ship against real
> runs — the mechanism is proven and tested; the production metrics are the next
> step."

**Expected questions:**

- _Are these numbers achieved or aspirational?_ → The core v0.1 metrics were hit on a keyed run; the validation-quality and knowledge metrics are verified by tests, with live production numbers measured post-ship (we're explicit about that distinction).
- _Why tarento.com as the reference?_ → A real public marketing site with no login — representative, and lets us define a defensible curated flow list to measure coverage against.

---

## Slide 10 — Roadmap & Q&A

**Show:**

- Where it's heading:
  - **Phase 2** — semantic (embedding-based) test reuse & dedupe
  - **Phase 3** — learn from past fixes (healing memory) + reusable "playbooks"
  - **Phase 4** — knowledge graph, governance, multi-agent / parallel workflows
- Plus: authenticated-flow testing · CI/CD gating · a coverage-history UI · optional LLM quality judge
- "Questions?"

**Talking script:**

> "To close, where this goes next. The Knowledge Layer we just shipped is Phase 1
> of four. Phase 2 makes the test-reuse smart with semantic matching, so it
> catches duplicates even when they're worded differently. Phase 3 teaches it to
> learn from past fixes — when a certain kind of failure was healed a certain
> way, remember that. Phase 4 opens up graph-based reasoning and multiple agents
> working in parallel. Alongside that, the obvious product asks: testing flows
> behind a login, wiring it into CI/CD as a quality gate, and a UI to see how
> coverage grows over time. The throughline is that every run makes the system a
> little smarter — it compounds. I'd love to take your questions."

**Expected questions (the big ones to be ready for):**

- _What does it cost to run?_ → Mostly Anthropic API usage scaling with crawl depth/scenario count; the validation and knowledge layers are deterministic and effectively free.
- _How does it handle authentication / logins?_ → Out of scope today (the reference app has none); it's a named future item — cookie/credential injection before the crawl.
- _Can it test our app?_ → Yes if it's a public web front-end; behind-login needs the auth work above. Happy to do a live trial.
- _What if the AI generates a wrong test?_ → Three nets catch it: the Validator flags quality issues, the run surfaces failures, and the report never dresses a `fixme` up as a pass. A human still signs off.
- _How is this different from Testim / Mabl / other AI test tools?_ → Same self-healing idea, but ours is agent-driven end-to-end (it plans and writes from scratch), fully transparent (you see the generated code and the reasoning), and it has a cross-run knowledge layer we control and extend.

---

### Presenter tips

- **Spend your time on slides 5 and 7** — the Validator and the Knowledge Layer are the differentiators; the rest is context.
- If you can, **show a live run or a recorded report** between slides 6 and 7 — seeing the streaming stages and the rich report lands harder than any bullet.
- Keep the honest framing from slide 9 (mechanism proven, live metrics measured post-ship) — it builds credibility rather than undermining it.
