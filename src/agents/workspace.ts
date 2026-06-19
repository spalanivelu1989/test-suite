import { spawn } from "node:child_process";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getRunsRoot } from "../runManager/persistence";
import type { PlaywrightJsonReport } from "../results/parse";

// Isolated per-run workspace (D3). This module owns a run's on-disk contract:
// the directory layout, the filenames we read/write ourselves, and running the
// generated suite. Agents run with cwd = workspace.root and write the plan/specs
// out-of-process via their own tools, so the directory paths stay on the
// interface; but the filenames *we* depend on (results.json, plan.md) and the
// suite launch live here once, behind behavioral operations — callers never
// hardcode a path or import node:fs to talk to the workspace.
//
// Run-state persistence (run.json) lives in runManager/persistence.ts, not here.

/** The Playwright JSON reporter's output file — written by CONFIG, read by runSuite. */
const RESULTS_FILE = "results.json";
/** The Markdown plan filename the Designer reads (the Discoverer saves a plan here). */
const PLAN_FILE = "plan.md";
/**
 * Where the authenticated session is saved (Discoverer `state-save`s here) and
 * reused (playwright.config.ts loads it as `use.storageState`). Relative to the
 * workspace root so the config and the `npx playwright test` cwd agree on it.
 */
const AUTH_STATE_REL_PATH = ".auth/storageState.json";
/**
 * Playwright globalSetup file (generated only for authenticated runs). It performs
 * a FRESH login right before the suite runs and overwrites the storage state, so a
 * short-lived OAuth/XSUAA session (e.g. SAP BTP) can't expire between the
 * Discoverer's login and test execution — the cause of a whole suite failing on the
 * login landing page despite a valid-looking saved session.
 */
const GLOBAL_SETUP_REL_PATH = "global-setup.ts";

export interface Workspace {
  root: string;
  specsDir: string;
  testsDir: string;
  seedPath: string;
  configPath: string;
  /**
   * Absolute path to the saved storage-state file. The Discoverer saves the
   * authenticated session here; the suite config loads it. Always defined; only
   * actually written/loaded when a run has auth enabled.
   */
  authStatePath: string;
  /** Run the generated suite in this workspace and return Playwright's raw JSON report. */
  runSuite(signal?: AbortSignal): Promise<PlaywrightJsonReport>;
  /** Write (or overwrite) the Markdown plan the Designer will read. */
  writePlan(markdown: string): Promise<void>;
}

export interface WorkspaceOptions {
  /**
   * When true, the suite config loads the saved storage state so every test runs
   * authenticated, and a placeholder state file is pre-created so `npx playwright
   * test` never errors with "storageState file not found" before the Discoverer
   * saves the real one. Also generates a globalSetup that re-logs-in fresh.
   */
  authEnabled?: boolean;
  /**
   * The run's target URL — baked into the generated globalSetup as the page to log
   * in from (TARGET_LOGIN_URL overrides it at run time). Only used when authEnabled.
   */
  entryUrl?: string;
  /**
   * Run the suite serially (one worker, no parallelism). Required for apps that
   * persist state per user (e.g. a logged-in account whose settings are saved
   * server-side): parallel specs would mutate that one shared state concurrently
   * and corrupt each other. Migration checks default this on, since they always
   * replay a real app's flows against a single authenticated account.
   */
  serial?: boolean;
}

const SEED = `import { test, expect } from '@playwright/test';

test.describe('Test group', () => {
  test('seed', async ({ page }) => {
    // generate code here.
  });
});
`;

/** Build the workspace Playwright config. When auth is enabled, every test loads
 * the saved storage state so it runs already logged in. */
function buildConfig(authEnabled: boolean, serial = false): string {
  const storageStateLine = authEnabled
    ? `\n    storageState: '${AUTH_STATE_REL_PATH}',`
    : "";
  // globalSetup re-establishes a fresh session before the run (see buildGlobalSetup).
  const globalSetupLine = authEnabled
    ? `\n  globalSetup: './${GLOBAL_SETUP_REL_PATH}',`
    : "";
  // Serial runs pin to one worker so specs can't trample a shared, server-persisted
  // session state in parallel (see WorkspaceOptions.serial).
  const serialLines = serial ? `\n  workers: 1,\n  fullyParallel: false,` : "";
  return `import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests',${globalSetupLine}${serialLines}
  reporter: [['json', { outputFile: '${RESULTS_FILE}' }], ['line']],
  use: {
    headless: true,
    ...devices['Desktop Chrome'],
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',${storageStateLine}
  },
});
`;
}

/**
 * Generate the globalSetup that logs in FRESH right before the suite runs and saves
 * the storage state the config loads. Heuristic but SAP-BTP-aware: it clicks a
 * "Login with BTP"/landing entry point, picks the configured identity provider
 * (TARGET_IDP) at a chooser by its EXACT label (tenants list several providers with
 * overlapping names), fills the username, handles BOTH a single-page
 * (#j_username+#j_password) and a two-step username→Continue→password flow — waiting
 * for the password field to render rather than racing the redirect — submits, and
 * saves the session. Credentials are
 * read from the environment at run time (always fresh); the start URL is baked in
 * (TARGET_LOGIN_URL overrides). After submitting it waits to land back on the app
 * host (not the identity provider) and refuses to save — aborting the whole run —
 * unless the resulting state holds a cookie that domain-matches the app. This trades
 * the old best-effort behaviour for a loud failure, because a half-authenticated
 * state silently turns every test into a doomed assertion against the login page.
 */
function buildGlobalSetup(startUrl: string): string {
  const url = JSON.stringify(startUrl);
  return `import { chromium, type FullConfig } from '@playwright/test';

// AUTO-GENERATED by the test harness — do not edit. Re-establishes a fresh
// authenticated session immediately before the suite runs so a short-lived
// OAuth/XSUAA session (e.g. SAP BTP) cannot expire between generation and run.

const ENTRY_URL = ${url};
const STATE_PATH = '${AUTH_STATE_REL_PATH}';
const USER_SEL =
  '#j_username, input[name="j_username"], input[type="email"], input[name="username"], input[autocomplete="username"]';
const PASS_SEL =
  '#j_password, input[name="j_password"], input[type="password"], input[autocomplete="current-password"]';

export default async function globalSetup(_config: FullConfig) {
  const username = process.env.TARGET_USERNAME?.trim();
  const password = process.env.TARGET_PASSWORD?.trim();
  const idp = process.env.TARGET_IDP?.trim();
  const startUrl = process.env.TARGET_LOGIN_URL?.trim() || ENTRY_URL;
  if (!username || !password) {
    console.warn('[global-setup] TARGET_USERNAME/TARGET_PASSWORD not set — skipping fresh login.');
    return;
  }

  // The host the app is actually served from (e.g. *.cfapps.*.hana.ondemand.com) —
  // distinct from the IdP hosts (accounts.sap.com, *.authentication.*) we transit
  // during login. Landing back here, with a cookie for it, is the only proof the
  // OAuth round-trip closed.
  const appHost = new URL(startUrl).hostname;
  // Standard cookie domain-match: does this cookie get sent to the app host? IdP
  // cookies (different subdomain branch) correctly fail this test.
  const domainMatchesApp = (rawDomain: string) => {
    const d = rawDomain.replace(/^\\./, '');
    return appHost === d || appHost.endsWith('.' + d);
  };
  // Edge/CDN/bot-protection and analytics cookies are seeded on the app host on the
  // FIRST page load — before, and regardless of, login. Their presence proves we
  // reached the host, NOT that we authenticated, so they must NOT satisfy the guard
  // below. Without this, a Cloudflare-fronted app (which sets __cf_bm / cf_clearance
  // and a __dpl deploy cookie on the bare app domain) fakes a logged-in state and
  // every test then runs against the login page. Match by exact reserved name.
  const NON_AUTH_COOKIE =
    /^(__cf_bm|cf_clearance|__cflb|__cfruid|__cfwaitingroom|__cfduid|__dpl|__Secure-__dpl|_ga|_gid|_gat|_gcl_au|_fbp|ai_user|ai_session)$/i;
  // A cookie counts as proof of a session only if it is on the app host AND is not a
  // known infrastructure/analytics cookie.
  const isAppSessionCookie = (c) =>
    domainMatchesApp(c.domain) && !NON_AUTH_COOKIE.test(c.name);
  // Many SPA logins keep NO session cookie at all — they store a JWT in
  // localStorage and send it as a bearer header (e.g. Supabase 'sb-<ref>-auth-token',
  // Firebase, generic access/auth tokens). Playwright's storageState captures
  // localStorage too, and use.storageState restores it, so such a session is fully
  // reusable — we just have to RECOGNISE it. Note: pre-login anonymous keys (e.g.
  // '__lovable_session') must NOT match, or we'd accept a logged-out state.
  const AUTH_LOCALSTORAGE =
    /(^sb-.*-auth-token$)|access[_-]?token|auth[_-]?token|id[_-]?token|supabase|firebase:authuser/i;

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  // SAP IdP login pages frequently never reach 'networkidle' (long-poll/keepalive),
  // so bound the wait — an unbounded idle() silently burns the default 30s per call.
  const idle = () => page.waitForLoadState('networkidle', { timeout: 7000 }).catch(() => {});
  const passField = () => page.locator(PASS_SEL).first();
  const passVisible = () =>
    page.locator(PASS_SEL).first().isVisible().catch(() => false);
  let landed = false;
  try {
    await page.goto(startUrl, { waitUntil: 'domcontentloaded' });
    await idle();

    // (1) App landing page: click a "Login with BTP"/"Login" entry point when no
    //     username field is shown yet.
    if ((await page.locator(USER_SEL).count()) === 0) {
      const entry = page
        .getByRole('button', { name: /login with btp|log ?in|sign in/i })
        .or(page.getByRole('link', { name: /login with btp|log ?in|sign in/i }));
      if (await entry.count()) { await entry.first().click(); await idle(); }
    }

    // (2) Identity-provider chooser: pick the configured provider by its EXACT label.
    //     SAP tenants often list several providers whose names share words
    //     ("Default Identity Provider" vs "Tarento Identity Provider") — a substring
    //     match could select the wrong one, and wrong-provider attempts can lock the
    //     account, so require an exact match and never cycle.
    if (idp) {
      const choice = page
        .getByRole('link', { name: idp, exact: true })
        .or(page.getByRole('button', { name: idp, exact: true }));
      if (await choice.count()) {
        await choice.first().click();
        // Wait for the chosen provider's form, not a flaky networkidle.
        await page.locator(USER_SEL).first().waitFor({ timeout: 15000 }).catch(() => {});
        await idle();
      }
    }

    // (3) Username, then password. Two shapes seen on SAP tenants:
    //       - single page: #j_username + #j_password together (fill both, submit once)
    //       - two step:    username -> Continue/Next -> password on the next page
    const user = page.locator(USER_SEL).first();
    await user.waitFor({ timeout: 15000 });
    await user.fill(username);

    if (!(await passVisible())) {
      // Two-step flow: advance past the username page, then WAIT for the password
      // field to actually render before filling (the old code raced the redirect).
      const cont = page.getByRole('button', { name: /continue|next|log on|sign in|submit/i });
      if (await cont.count()) await cont.first().click(); else await user.press('Enter');
      await idle();
      await passField().waitFor({ timeout: 20000 });
    }
    await passField().waitFor({ timeout: 15000 });
    await passField().fill(password);

    // (4) Submit, then wait for an authenticated session to actually MATERIALISE.
    //     Two shapes, handled by one poll:
    //       - redirect SSO (SAP BTP/XSUAA): multi-hop app -> BTP -> IdP -> back, the
    //         session lands as a COOKIE on the app host.
    //       - SPA login (e.g. Supabase/Lovable): an XHR sets a JWT in localStorage
    //         with NO navigation, so a waitForURL(appHost) check is a no-op that
    //         resolves before the token is written — snapshotting too early.
    //     Polling the real session state (cookie OR localStorage token) covers both
    //     and waits as long as either takes.
    const submit = page
      .getByRole('button', { name: /log on|sign in|log ?in|continue|submit/i })
      .or(page.locator('input[type="submit"], button[type="submit"]'));
    if (await submit.count()) await submit.first().click(); else await passField().press('Enter');

    const hasSessionNow = async () => {
      const cookieOk = (await context.cookies()).some(isAppSessionCookie);
      if (cookieOk) return true;
      const lsKeys = await page
        .evaluate(() => { try { return Object.keys(localStorage); } catch { return []; } })
        .catch(() => []);
      return lsKeys.some((k) => AUTH_LOCALSTORAGE.test(k));
    };
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      if (await hasSessionNow()) break;
      await page.waitForTimeout(500);
    }
    await idle();

    // (5) Guard: only persist a state the app will actually treat as logged in —
    //     a real session cookie (NOT a CDN/bot cookie; see NON_AUTH_COOKIE) OR a
    //     localStorage auth token (see AUTH_LOCALSTORAGE).
    const state = await context.storageState({ path: STATE_PATH });
    const sessionCookies = (state.cookies || []).filter(isAppSessionCookie);
    const lsAuthKeys = (state.origins || [])
      .flatMap((o) => (o.localStorage || []).map((l) => l.name))
      .filter((k) => AUTH_LOCALSTORAGE.test(k));
    landed = sessionCookies.length > 0 || lsAuthKeys.length > 0;
    if (landed) {
      console.log('[global-setup] fresh auth state saved ->', STATE_PATH,
        '| session cookie(s):', sessionCookies.map((c) => c.name).join(', ') || '(none)',
        '| localStorage token(s):', lsAuthKeys.join(', ') || '(none)',
        '| final url:', page.url());
    } else {
      const cookieNames = (state.cookies || []).map((c) => c.name).join(', ') || '(none)';
      const lsNames = (state.origins || []).flatMap((o) => (o.localStorage || []).map((l) => l.name)).join(', ') || '(none)';
      console.error('[global-setup] login did not complete — no session cookie and no localStorage auth token. ' +
        'cookies:', cookieNames, '| localStorage:', lsNames,
        '| (wrong credentials, or the login flow was not recognised) | final url:', page.url());
    }
  } catch (err) {
    console.error('[global-setup] login failed:', err instanceof Error ? err.message : String(err), '| final url:', page.url());
  } finally {
    await browser.close();
  }

  // Abort the whole run rather than execute a suite that would test the login page.
  if (!landed) {
    throw new Error(
      '[global-setup] auth did not complete — no session cookie or localStorage token for app host ' + appHost +
      '. Aborting instead of running tests against the login page. ' +
      'Check TARGET_USERNAME/TARGET_PASSWORD/TARGET_IDP and the login flow.'
    );
  }
}
`;
}

/** An empty-but-valid storage state, written as a placeholder when auth is
 * enabled so the suite config can reference the file before the Discoverer logs in
 * and overwrites it with the real authenticated session. */
const EMPTY_AUTH_STATE = JSON.stringify({ cookies: [], origins: [] });

/**
 * Run `npx playwright test` in the workspace and parse the JSON report it writes.
 * No `--reporter` flag: the CLI flag would override the config's reporter and the
 * built-in json reporter would then write to stdout, not a file. The workspace
 * config already declares `['json', { outputFile: '${RESULTS_FILE}' }]`, so
 * letting it apply is what actually produces the results file on disk.
 */
async function runSuiteAt(
  root: string,
  signal?: AbortSignal,
): Promise<PlaywrightJsonReport> {
  await new Promise<void>((resolve) => {
    // With a signal (migration "stop"), run detached so we can kill the whole
    // process group (playwright + its browsers), not just the npx shim.
    const child = spawn("npx", ["playwright", "test"], {
      cwd: root,
      env: { ...process.env },
      ...(signal ? { detached: true } : {}),
    });
    child.stdout.on("data", () => {});
    child.stderr.on("data", () => {});
    let onAbort: (() => void) | undefined;
    const cleanup = () => {
      if (signal && onAbort) signal.removeEventListener("abort", onAbort);
    };
    if (signal) {
      const kill = () => {
        try {
          if (child.pid) process.kill(-child.pid, "SIGTERM");
        } catch {
          try {
            child.kill("SIGTERM");
          } catch {
            /* already gone */
          }
        }
      };
      if (signal.aborted) kill();
      onAbort = kill;
      signal.addEventListener("abort", onAbort);
    }
    child.on("error", () => {
      cleanup();
      resolve();
    });
    child.on("close", () => {
      cleanup();
      resolve();
    });
  });
  try {
    const raw = await readFile(join(root, RESULTS_FILE), "utf8");
    return JSON.parse(raw) as PlaywrightJsonReport;
  } catch {
    return { suites: [] };
  }
}

export async function createWorkspace(
  runId: string,
  baseDir = ".runs",
  options: WorkspaceOptions = {},
): Promise<Workspace> {
  const root = join(getRunsRoot(baseDir), runId);
  const specsDir = join(root, "specs");
  const testsDir = join(root, "tests");
  const screenshotsDir = join(root, "screenshots");
  await mkdir(specsDir, { recursive: true });
  await mkdir(testsDir, { recursive: true });
  await mkdir(screenshotsDir, { recursive: true });
  const seedPath = join(root, "seed.spec.ts");
  const configPath = join(root, "playwright.config.ts");
  const authStatePath = join(root, AUTH_STATE_REL_PATH);
  await writeFile(seedPath, SEED, "utf8");
  await writeFile(
    configPath,
    buildConfig(!!options.authEnabled, !!options.serial),
    "utf8",
  );
  // Pre-create a placeholder auth state so the suite config can load it even if
  // the Discoverer has not yet logged in (avoids a confusing "file not found").
  if (options.authEnabled) {
    await mkdir(join(root, ".auth"), { recursive: true });
    await writeFile(authStatePath, EMPTY_AUTH_STATE, "utf8");
    // Re-login fresh right before the run (see buildGlobalSetup) so a stale
    // session can't fail the whole suite on the login page.
    await writeFile(
      join(root, GLOBAL_SETUP_REL_PATH),
      buildGlobalSetup(options.entryUrl ?? ""),
      "utf8",
    );
  }
  return {
    root,
    specsDir,
    testsDir,
    seedPath,
    configPath,
    authStatePath,
    runSuite: (signal?: AbortSignal) => runSuiteAt(root, signal),
    writePlan: (markdown: string) =>
      writeFile(join(specsDir, PLAN_FILE), markdown, "utf8"),
  };
}

/** Read the Markdown test plan the Discoverer saved (first .md under specs/). */
export async function readPlan(ws: Workspace): Promise<string | null> {
  try {
    const files = await readdir(ws.specsDir);
    const md = files.find((f) => f.endsWith(".md"));
    if (!md) return null;
    return await readFile(join(ws.specsDir, md), "utf8");
  } catch {
    return null;
  }
}

/** Read generated spec sources for the report's code-view tab (R17). */
export async function readGeneratedSpecs(
  ws: Workspace,
): Promise<{ file: string; code: string }[]> {
  const out: { file: string; code: string }[] = [];
  async function walk(dir: string, rel: string) {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const abs = join(dir, e.name);
      const relPath = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) await walk(abs, relPath);
      else if (e.name.endsWith(".spec.ts")) {
        out.push({ file: relPath, code: await readFile(abs, "utf8") });
      }
    }
  }
  await walk(ws.testsDir, "");
  return out;
}
