# Proposal: Reuse Existing Tests Instead of Rebuilding Them

## The Problem

Today, every time you point the tool at a website, it rebuilds everything from
scratch — it **explores** the site, **plans** what to test, **writes** the tests,
then **runs and fixes** them. That's four expensive steps.

But often the work is already done. You **already have tests** for your app.
Re-doing the exploring, planning, and writing is wasted effort — like
re-surveying your house every time, even when nothing changed.

**The goal:** let the user skip straight to _"pick the tests I already have, run
them, get a report"_ — without the explore/plan/write stages.

There are two situations where this applies, and they behave very differently.

---

## Situation A — Same app, you just want to re-test it

You tested your app before. You want to run those same tests again (a regression
check).

**This is easy and safe.** The tests already belong to this exact app — same
address, same buttons, same everything. You just pick them from a list and run
them.

**Solution:** A simple test picker.

- List the tests already saved for this app.
- Show a **trust signal** next to each — _not_ a "similarity score" (that's
  meaningless here, since these are literally this app's own tests). Instead show
  useful facts: _"passed last 4 runs, last run 2 days ago, healed once."_
- User selects which to run → run them → the **Fixer** repairs any small
  breakages → report.

This skips explore/plan/write cleanly, with zero risk. **Build this first** — it's
high value and low risk, and the system already half-does it (it copies reusable
tests forward today).

---

## Situation B — Same app that moved to a new home (the real case)

You build an app in **Lovable** (one web address), then move that **exact same
app** to **SAP BTP** (a different web address, and now it requires login).

### What was originally proposed

_"Take the existing tests, swap in the new web address, and run them."_

### Why this first looked dangerous — and why it turned out fine

At first this sounded like the dangerous case: **borrowing tests from a different
app.** A test that says _"click 'Acme Pro Plan', check it costs $49.99"_ will fail
on a different app — wrong buttons, wrong prices. You can't just change the
address; the tests are glued to the app they were written for. The tool's own
design even strips out addresses and prices precisely because they don't transfer
between _different_ apps.

**But the clarification changed everything:** Lovable → BTP is a **pure rehost**.
Same build, same buttons, same everything — it just lives at a new address and
asks people to log in. That's **not a different app. It's the same app that moved
house** (same menu, same kitchen, new street).

So the correction is: **for this case, swapping the address and reusing the tests
is genuinely correct.** The only real difference between the two homes is the
**login**.

### The refined understanding

This isn't "borrow tests from another app." It's **Migration Check**: _"I have
tests proven on Lovable — did my app survive the move to BTP intact?"_ The tests
become your migration safety net.

---

## The Solutions (for Situation B)

**1. Reuse the tests as-is.** Skip explore/plan/write. Take the proven Lovable
tests and copy them over.

**2. Swap the address safely.** Because it's the same app, changing the web
address is safe. Two ways:

- _Proper fix:_ write tests against a single "base address" setting, so switching
  environments is one change.
- _Works-today fix:_ the tests already keep the address in one spot at the top of
  each file — just replace your app's own address (and leave outside links, like a
  LinkedIn URL, untouched).

**3. Handle the one real difference — login.** BTP needs authentication; Lovable
didn't. You provide the login details (username, password, login page) when you
run the check. The tool's login machinery is already built for SAP BTP, so this is
mostly plumbing.

**4. Don't let the tool auto-fix failures here (important correction).** Normally
the **Fixer** patches broken tests to make them pass. In a migration check, a
broken test might be telling you _the move actually broke something_. If the tool
quietly fixes it, it **hides the very problem you're checking for.** So in this
mode the Fixer is demoted to "report problems, don't paper over them" — it only
smooths out obvious login/timing hiccups, and flags everything else as a real
finding.

- _Sub-warning:_ BTP logs you out after a while. If that happens mid-test, a test
  fails for a silly reason. We separate "login expired" (ignore) from "feature
  actually broke" (report), so the report stays trustworthy.

**5. The report is the whole point.** Not a similarity score — a plain
**before/after diff**: _"48 of your 50 tests still pass on BTP. 2 failed: 1 was a
login timeout (ignore), 1 is real — the export button is missing."_ That directly
answers _"did my migration go okay?"_

---

## How do we know the two addresses are the same app?

**You can't tell from the addresses** — `roi-calculator.lovable.app` and
`sapbtp-roi-calculator…hana.ondemand.com` look nothing alike. So:

**1. You tell it (the instruction).** You did the migration — you simply declare
"this new address is the same app." That's the trusted source.

**2. The tool double-checks via a 'fingerprint' (the safety net).** When Lovable
builds your app, it stamps the internal files with a unique code (like a batch
number). The tool logs into BTP, reads that code, and confirms it matches
Lovable's. If it matches → same app, same build, safe to reuse. If not → it warns
you. This one check confirms _both_ "same app" _and_ "nothing changed in the
build."

- _Catch:_ BTP requires login, so this check happens **after** logging in, not
  before.

### Where you provide the "same app" instruction

Recommended: **start from the app you already tested** and click _"Run these tests
on another environment,"_ then enter the new address + login. You never separately
say "same app" — it's implied because you started from that app, so there's no
chance of picking the wrong one. (If you do this often across many environments,
you'd instead save the environments once in the app's settings.)

---

## In one line

Turn your existing tests into a **"did my migration go okay?" checker**: pick
tests you already have → point them at the new address → add the login → run → get
a plain before/after report — while the tool confirms it's truly the same app and
avoids hiding real problems.

---

## Appendix — How this maps to the current system (for implementers)

- **App identity is origin-keyed** (`src/knowledge/appId.ts`, `normalizeOrigin`),
  so Lovable and BTP are currently treated as two separate apps. Situation B needs
  a **logical app with an environment registry** (one app → many origins).
- **Existing tests are stored per run** under `<workspace>/tests/*.spec.ts`, and
  the Designer already **copies reusable specs forward verbatim** (the `@kp-reused`
  path) — the foundation for the Situation A picker.
- **Specs hardcode absolute URLs** (a `const BASE_URL = "..."` at the top of each
  file) and the generated `playwright.config.ts` does **not** set `use.baseURL`
  (`src/agents/workspace.ts`). The "proper fix" in Solution 2 is to emit
  `use.baseURL` + relative paths; the "works-today fix" is a targeted origin
  rewrite of that single constant.
- **Login is already SAP-BTP-aware**: `global-setup.ts` re-authenticates XSUAA
  before the suite and supports a `TARGET_LOGIN_URL` override plus `TARGET_*`
  credential env vars.
- **Do not route Situation B through the cross-app pattern matcher**
  (`src/knowledge/retrieve/globalPatterns.ts`). That subsystem abstracts away the
  exact concrete details (selectors, assertions, paths) that transfer _perfectly_
  in a pure rehost. Situation B is verbatim spec cloning + origin rewrite, not
  pattern matching.
- **Build fingerprint** = compare the hashed asset filenames (e.g.
  `assets/index-a1b2c3d4.js`) referenced by each deployment's `index.html`. Match
  = same build. Compare the hash tokens, not full URLs (the BTP approuter may
  prefix the paths), and do it **after** authenticating to BTP.
