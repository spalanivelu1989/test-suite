# Implementation Notes — Knowledge Platform · Phase 1 (Forge)

Live log maintained during Stage 4 (Forge). Each entry: a decision made the
moment it happened — gaps, tradeoffs, changes vs the Plan, assumptions.

---

### [2026-06-05] Local Postgres environment (homebrew on port 5433)

**Type:** Decision · **Task:** T1 / Forge setup

No Postgres was configured at Forge start (no `KNOWLEDGE_DATABASE_URL`, no `pg`).
The user started `postgresql@18` (homebrew), but it errored: an **EDB PostgreSQL
18** (`/Library/PostgreSQL/18/`, password-protected) already held port **5432**.
Resolved by starting the **homebrew** cluster (`trust` auth, no secret) on port
**5433** via `pg_ctl -D /opt/homebrew/var/postgresql@18 -o "-p 5433"` and creating
a `knowledge` database. Connection string used for the build/tests:
`postgres://senthilpalanivelu@localhost:5433/knowledge`. This is a **local-dev**
arrangement; production uses managed Neon per ADR-0001 (D1) — the env var is the
only thing that changes.

### [2026-06-05] `knownPages` = distinct tested entry URLs (no Page entity in P1)

**Type:** Gap/Decision · **Task:** T7/T10/T11 (R6)

The Spec's `getAppProfile` lists "known pages", but `RunReport` carries no
structured crawl-page list (only `planMarkdown` + specs). Rather than parse pages
out of prose this phase, `knownPages` is derived from **distinct `runs.url`** for
the app — i.e. the entry URLs we've actually run against. Honest and cheap; a
full per-page crawl map is deferred to a later phase. No `pages` table in P1.

### [2026-06-05] Curated flow ids vs tested flowIds are keyed separately

**Type:** Assumption · **Task:** T7 (R6, M1)

`report.flows` carries short curated ids (`hero-cta`) while `report.results`
carry the tested `flowId` (the scenario title, e.g. "Hero Get in Touch CTA").
`norm()` makes these different keys, so `extract` stores them as **distinct flow
rows** rather than forcing a merge (forcing it would reintroduce the over-credit
problem noted in the ai-ui-testing-tool notes). Consequence: the profile's
`flows` list may show a curated flow as a "gap" even when a differently-named
result tested it. **M1 (coverage-detection) is therefore measured from the
`coverage_snapshots` row** (which used `coverageFromResults` token-overlap at
report time), NOT from exact flow-row matching. Token-overlap reconciliation of
the two keysets is a Phase-2 refinement (embeddings).

### [2026-06-05] Profile/coverage collapse flows BY NAME + use snapshot gaps

**Type:** Change · **Task:** T11 (R6/R7)

Surfaced by an end-to-end check: the same flow appeared as **both covered and a
gap** (curated `hero` row untested + tested `hero cta` row). Fixed in
`appProfile.ts`: collapse flow rows by `norm(name)` (covered if ANY row tested),
and derive gaps from the **latest `coverage_snapshots.missing_flows`** (the
M1-aligned, token-overlap signal) rather than from untested flow rows. A flow is
now never both covered and a gap. `readAppKnowledge` now also returns
`missingFlows`.
