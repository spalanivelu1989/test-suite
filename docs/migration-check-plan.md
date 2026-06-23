# Build Plan: Migration Check (additive feature)

> Companion to [`migration-check-proposal.md`](./migration-check-proposal.md).
> This plan turns the proposal into a concrete, phased build.

## Guiding constraint

**Nothing in the existing pipeline changes.** Migration Check is a new, isolated
path that _calls_ existing building blocks as library functions. The current
flow (`runPipeline` → Discoverer → Designer → Validator → Tester → Reporter,
launched from `/api/runs`) is untouched. If we deleted the entire Migration Check
feature, the app would behave exactly as it does today.

How we guarantee that:

- New code lives in **new files** (`src/migration/*`, `app/api/migration-check/*`,
  `app/components/MigrationCheck.tsx`). No edits to `orchestrate.ts`,
  `runService.ts`, `stages.ts`, or `/api/runs`.
- Migration runs use **their own persistence dir** (`.migration-runs/`) and their
  own type (`MigrationReport`), so they never collide with normal runs.
- Existing helpers are consumed **read-only / call-only** — we never modify their
  behaviour, only invoke them.
- Two **additive-only** touch points (clearly fenced): one nav item in
  `ConsoleLayout.tsx` and one conditionally-rendered `<Box>` in `app/page.tsx`,
  following the exact pattern already used by Pattern Explorer / SQL Query /
  Matching Visualizer.

---

## What we reuse vs. what's new

| Capability                                                                | Reused function (call-only)                               | File                                             |
| ------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------ |
| Create an isolated run dir w/ auth                                        | `createWorkspace(id, baseDir, { authEnabled, entryUrl })` | `src/agents/workspace.ts:279`                    |
| Generate `playwright.config.ts` + `global-setup.ts` (SAP-BTP/XSUAA aware) | done inside `createWorkspace` when `authEnabled:true`     | `src/agents/workspace.ts:80,118`                 |
| Read spec files from a workspace                                          | `readGeneratedSpecs(ws)`                                  | `src/agents/workspace.ts:335`                    |
| Run the suite (`npx playwright test`)                                     | `ws.runSuite()` / `captureResults(ws)`                    | `src/results/parse.ts:108`                       |
| Flake separation (rerun N times)                                          | `assessSuiteFlakiness(ws, reruns)`                        | `src/results/parse.ts:141`                       |
| (Optional) conservative healing                                           | `evolveTests(ws, ...)`                                    | `src/orchestrator/stages.ts:776`                 |
| Narrative prose for the report                                            | `generateNarrative(results, specs, claude, url)`          | `src/reporter/narrative.ts:269`                  |
| List prior runs (to find source specs)                                    | run manager `list()` / `createDiskPersistence()`          | `src/runManager/manager.ts`, `persistence.ts:44` |
| Source app identity                                                       | `normalizeOrigin(url)` (read-only)                        | `src/knowledge/appId.ts:14`                      |
| Auth creds from env                                                       | `loadAuthFromEnv()`                                       | `src/auth/credentials.ts:41`                     |

| New module                             | Purpose                                                      |
| -------------------------------------- | ------------------------------------------------------------ |
| `src/migration/types.ts`               | `MigrationCheckRequest`, `MigrationReport`, `SpecDiff`       |
| `src/migration/originRewrite.ts`       | pure origin-swap util + unit tests                           |
| `src/migration/sourceSpecs.ts`         | list a source app's specs + last outcomes (from prior runs)  |
| `src/migration/classify.ts`            | classify a target failure: infra vs behavioral vs flaky      |
| `src/migration/fingerprint.ts`         | build-fingerprint (hashed asset) comparison                  |
| `src/migration/runMigrationCheck.ts`   | the orchestration (composes the reused helpers)              |
| `src/migration/persistence.ts`         | `MigrationReport` store (own `.migration-runs/` dir)         |
| `app/api/migration-check/*`            | REST endpoints (start, list, get, source-apps, source-specs) |
| `app/components/MigrationCheck.tsx`    | the new tab UI                                               |
| `app/components/MigrationDiffView.tsx` | the before/after diff report view                            |

---

## Data shapes

```ts
// src/migration/types.ts
export interface MigrationCheckRequest {
  sourceUrl: string; // e.g. https://roi-calculator.lovable.app
  sourceRunId?: string; // which prior run to clone specs from; default = latest completed
  targetUrl: string; // e.g. https://sapbtp-roi-calculator…hana.ondemand.com
  selectedSpecFiles: string[]; // which specs to carry over
  auth: { username: string; password: string; idp?: string; loginUrl?: string };
  options?: {
    heal?: boolean; // default false — report-first; do NOT paper over regressions
    reruns?: number; // default 2 — flake separation
    fingerprintCheck?: boolean; // default true
  };
}

export type SpecClassification =
  | "ok" // passed on target
  | "flaky" // inconsistent across reruns
  | "infra" // failed for login/timeout/network reasons → ignore
  | "behavioral" // passed on source, fails consistently on target → REAL regression
  | "pre-existing"; // failed on source too → not a migration regression

export interface SpecDiff {
  file: string;
  title: string | null;
  sourceOutcome: "passed" | "failed" | "healed" | "unknown";
  targetOutcome: "passed" | "failed" | "flaky";
  classification: SpecClassification;
  failureReason?: string;
}

export interface MigrationReport {
  id: string;
  sourceUrl: string;
  targetUrl: string;
  sourceRunId: string;
  generatedAt: string;
  fingerprint: {
    status: "match" | "mismatch" | "skipped" | "error";
    sharedAssetCount: number;
    detail?: string;
  };
  diff: SpecDiff[];
  summary: {
    total: number;
    stillPassing: number;
    behavioral: number;
    infra: number;
    flaky: number;
    preExisting: number;
  };
  targetReport: import("../types").RunReport; // full underlying run, for drill-down
}
```

---

## Phases (each independently shippable)

### Phase 0 — Foundations (pure, no I/O, no UI)

- `src/migration/types.ts` — the shapes above.
- `src/migration/originRewrite.ts`:
  - `rewriteOrigin(code, sourceOrigin, targetOrigin): { code, replacements }`
  - Replaces every occurrence of the source **origin** (`scheme://host[:port]`,
    from `normalizeOrigin(sourceUrl)`) with the target origin. **Leaves paths and
    external URLs untouched** (a LinkedIn `href` has a different origin, so it's
    safe). Pure rehost ⇒ paths are identical, so preserving them is correct.
  - Unit tests: self-origin swapped, external URLs untouched, path preserved,
    count reported.
- **Acceptance:** unit tests pass; zero references from existing code.

### Phase 1 — Source spec discovery (backend, read-only)

- `src/migration/sourceSpecs.ts`:
  - `listSourceApps()` → distinct `normalizeOrigin(run.config.url)` across prior
    runs (via run manager `list()`), with run counts + last run date.
  - `listSourceSpecs(sourceUrl, sourceRunId?)` → from the chosen completed run's
    persisted `RunReport.generatedSpecs[]` (`{file, code}`) joined with that run's
    `results[]` for each spec's `sourceOutcome`.
  - Works with knowledge layer **disabled** (reads from run persistence, not
    Postgres) — no hard dependency on `KNOWLEDGE_DATABASE_URL`.
- API: `GET /api/migration-check/source-apps`, `GET /api/migration-check/source-specs?url=&runId=`.
- **Acceptance:** hitting the endpoints lists your Lovable app and its specs with
  per-spec last outcome. No writes anywhere.

### Phase 2 — The migration run (backend orchestration)

- `src/migration/runMigrationCheck.ts` — `runMigrationCheck(req): Promise<MigrationReport>`:
  1. Resolve source specs (Phase 1) for `selectedSpecFiles`.
  2. `createWorkspace(id, ".migration-runs", { authEnabled: true, entryUrl: targetUrl })`.
  3. For each selected spec: `rewriteOrigin(code, sourceOrigin, targetOrigin)` →
     write into `ws.testsDir`.
  4. Inject auth into env for the child process (`TARGET_USERNAME`, `TARGET_PASSWORD`,
     `TARGET_IDP`, `TARGET_LOGIN_URL`) — reusing the exact env contract
     `global-setup.ts` already reads.
  5. `captureResults(ws)` (initial) → if `options.heal` (default **false**), skip
     the Tester entirely (report-first).
  6. `assessSuiteFlakiness(ws, reruns)` to separate flaky from consistent fails.
  7. Build `diff[]` by joining target outcomes with source outcomes; classify via
     `src/migration/classify.ts`.
  8. `generateNarrative(...)` + assemble a `RunReport` for `targetReport`
     (drill-down reuse of the existing report view).
  9. Persist via `src/migration/persistence.ts` into `.migration-runs/<id>/`.
- `src/migration/classify.ts`: failure-reason heuristics →
  `infra` (login/redirect/timeout/network/401/403), `behavioral`
  (source passed, target fails consistently), `pre-existing` (source failed too),
  `flaky` (inconsistent), else `ok`.
- API: `POST /api/migration-check` (start), `GET /api/migration-check` (list),
  `GET /api/migration-check/[id]` (report).
- **Acceptance:** end-to-end run against a real Lovable→BTP pair produces a
  `MigrationReport` on disk; existing `/api/runs` untouched and still green.

### Phase 3 — UI: the Migration Check tab

- `app/components/MigrationCheck.tsx` — wizard:
  1. **Pick source app** (from `/source-apps`).
  2. **Pick specs** (from `/source-specs`) — show each spec's _last outcome_
     (NOT a similarity score), multi-select.
  3. **Enter target URL + login** (username/password/IdP/login URL).
  4. Run → poll `/api/migration-check/[id]`.
- `app/components/MigrationDiffView.tsx` — the before/after report:
  - Headline: "48/50 still passing on BTP. 1 real regression, 1 login timeout (ignored)."
  - Grouped list: ✅ still passing · 🔴 behavioral (real) · 🟡 infra/flaky (ignore)
    · ⚪ pre-existing. Drill into any spec → reuse `TestReportView` on `targetReport`.
- **Additive wiring (the only edits to existing files):**
  - `app/components/ConsoleLayout.tsx` bottomNavItems: add
    `{ id: "migration-check", label: "Migration Check", icon: GitCompare }`.
  - `app/page.tsx`: add one
    `<Box display={activeTab === "migration-check" ? "block" : "none"}><MigrationCheck/></Box>`.
  - `app/migration-check/page.tsx`: `redirect("/?tab=migration-check")` (deep link),
    mirroring `app/explore/page.tsx`.
- **Acceptance:** new tab works; all existing tabs unchanged.

### Phase 4 — Build-fingerprint safety net

- `src/migration/fingerprint.ts`:
  - Fetch source `index.html` (anonymous — Lovable needs no auth) and target
    `index.html` **through an authenticated context** (reuse the storageState that
    `global-setup` produced, or a one-shot authenticated Playwright fetch).
  - Extract hashed asset tokens from `<script src>` / `<link href>` (e.g.
    `index-a1b2c3d4.js`); compare token **sets** (ignore path prefixes the BTP
    approuter may add).
  - Surface as `fingerprint.status` in the report: `match` → confidence banner;
    `mismatch` → warning ("these may not be the same build; results may not
    transfer"); never blocks the run.
- **Acceptance:** matching builds show "verified same build"; a deliberately
  different build shows the warning.

### Phase 5 — Optional follow-ups (only if wanted)

- Conservative heal toggle (`options.heal:true`) → run `evolveTests` but classify
  any healed _behavioral_ failure as a finding, not a silent fix.
- Saved environments (the "logical app → many origins" model) for repeat use,
  stored in `.migration-runs/environments.json` (still additive; no DB change).
- Path-prefix field for BTP apps served under an approuter route.

---

## Decisions baked in (from the proposal)

- **No similarity score** in the UI — show _last outcome_ for source specs and a
  _before/after diff_ for results. Similarity is meaningless for the same app.
- **Report-first, heal-off by default** — healing can hide the very regression a
  migration check exists to find.
- **Do NOT route through the cross-app pattern matcher** (`globalPatterns.ts`) — it
  abstracts away exactly the concrete details that transfer perfectly in a pure
  rehost. This is verbatim spec cloning + origin rewrite.
- **Identity = user declares + fingerprint verifies.** No URL-string guessing.

## Risks / watch-items

- **Session expiry mid-suite** (XSUAA tokens are short-lived) can masquerade as a
  regression → the `infra` classification + flake reruns guard against it; consider
  a re-auth-on-401 retry in Phase 5.
- **Path prefix:** pure rehost at root ⇒ origin-swap suffices; if BTP serves under
  a route, Phase 5's path-prefix field is needed.
- **Knowledge ingestion:** migration runs are **not** ingested in v1 (avoids
  registering BTP as a new app as a side effect). Revisit if desired.

## Non-goals (v1)

- No DB schema changes. No edits to `RunConfig`, `runPipeline`, or `/api/runs`.
- No cross-app (different product) support — that remains the Designer's job.
