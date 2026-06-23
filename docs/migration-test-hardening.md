# Migration test hardening — Tester brief

Context for the Tester (or the migration's built-in heal) hardening the carried-over
ROI-calculator specs. Target: `https://sapbtp-roi.tarento-ivolve.com/single`.

## Ground truth (do not relitigate)

- The app build is **unchanged** (fingerprint matches) and all 18 specs **passed before** on
  this exact app. None of the failures are real app regressions.
- The app is a **Supabase/Lovable SPA** that **persists calculator state per user**
  (edition, units, message packs, every toggle, Step-4 simulation slider positions).
- Pricing is unchanged: Enhanced edition is €80,000/unit; the authored baseline is
  **Enhanced / 3 units / 500 packs → IS annual list price €277,980, Grand Total €545,980**.

## Already fixed (in code / source specs)

- **Auth**: `global-setup.ts` handles the SPA localStorage-JWT login (`src/agents/workspace.ts`).
- **Serial execution**: migration runs now emit `workers: 1, fullyParallel: false`
  (`WorkspaceOptions.serial`, set in `runMigrationCheck.ts`). This alone fixes the Step-3/4
  failures, which only broke under parallel state corruption.
- **Explainer**: strict-mode failures are classified correctly (`src/migration/explain.ts`).

## What the hardening pass must do — per failing spec

Rule of thumb: **never hard-code the current on-screen value** to make a test pass — the
state drifts every run. Instead make each spec self-contained.

1. **Baseline reset (Step-2/3/4 specs).** Immediately after the
   `Continue to Target Platform` click, reset to the authored baseline:
   - Select Enhanced: scope to the card, not a positional index —
     `getByRole('heading',{name:'Enhanced Edition'}).locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]').getByRole('button',{name:'Select',exact:true})`,
     click only `if (count)` (it shows "Selected" when already active).
   - `Number of Units` = 3, `Additional Message Packs` = 500 (fill + Tab).
   - Turn OFF `#is-discount-toggle`, `#existing-btp-toggle`, `#ti-toggle` if `aria-checked==="true"`.
   - Verified to restore €277,980 / €545,980.

2. **Card-scoped selectors (second tier).** Replace brittle `.locator('..').locator('..')…`
   chains that now resolve to multiple elements. E.g. the AEM-plan Select in
   `step2-aem-toggle…`:
   `getByRole('heading',{name:'AEM 100'}).locator('..')×3.getByRole('button',{name:'Select'})`
   resolves to 4 buttons — scope to the AEM card's `div.rounded-lg` ancestor instead.

3. **Ambiguous-text selectors.** Already patterned:
   - end-to-end toast: scope to `getByRole('region',{name:/notifications/i}).getByRole('status')`.
   - `step2-contract-discount-fixed-amount`: `getByText('−€50,000.00').first()`.

4. **Step-4 sliders.** Reset each slider deterministically before asserting (e.g. `press('Home')`
   then arrow to the target `aria-valuenow`); don't assume it starts at 100.

## Verifying

Run **serially** (`workers: 1`) against the live app with a fresh auth state — parallel runs
are not a valid test of these specs. Source-of-truth spec code lives in the source run's
`report.generatedSpecs[].code` (`.runs/c0aa2dab-…/run.json`), which is what the migration
clones and rewrites.
