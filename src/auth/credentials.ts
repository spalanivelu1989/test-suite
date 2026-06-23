// Optional form-login support. When the target app is behind a username/password
// login screen, the agents must authenticate before they can see (or test) the
// app. This module owns the whole auth contract in one place:
//
//   1. Credentials are read from the environment (never persisted to RunConfig,
//      run.json, or the report — they stay out of stored state).
//   2. The Discoverer logs in once via `playwright-cli`, then `state-save`s the
//      authenticated storage state to the workspace's auth file.
//   3. `playwright.config.ts` loads that file as `use.storageState`, so every
//      generated test starts already authenticated — no per-test login code.
//   4. The Designer/Tester `state-load` the same file when they drive the CLI,
//      so their manual exploration sees the authenticated app too.
//
// When the env vars are unset, every helper returns "no auth" and the pipeline
// runs exactly as before (graceful degradation, like the Knowledge Layer).

/** Form-login credentials for the target app. */
export interface AuthCredentials {
  username: string;
  password: string;
  /**
   * Optional explicit login page. When unset, the agent logs in from the entry
   * URL itself (most apps redirect an unauthenticated visit to their login form).
   */
  loginUrl?: string;
  /**
   * Optional identity-provider name to choose when the login screen shows an IDP
   * chooser (e.g. SAP BTP offers "Default Identity Provider" vs a corporate IDP).
   * From TARGET_IDP. When unset, the agent infers the provider from the username
   * and is told NOT to cycle through providers (wrong-provider attempts lock SSO
   * accounts). Match the IDP label exactly as shown on the chooser.
   */
  idp?: string;
}

/**
 * Read target-app credentials from the environment. Returns null unless BOTH
 * TARGET_USERNAME and TARGET_PASSWORD are set (non-empty), so a half-configured
 * env never silently enables a broken login flow.
 */
export function loadAuthFromEnv(
  env: Record<string, string | undefined> = process.env,
): AuthCredentials | null {
  const username = env.TARGET_USERNAME?.trim();
  const password = env.TARGET_PASSWORD?.trim();
  if (!username || !password) return null;
  const loginUrl = env.TARGET_LOGIN_URL?.trim() || undefined;
  const idp = env.TARGET_IDP?.trim() || undefined;
  return { username, password, loginUrl, idp };
}

/** Env-var names the credentials are exposed under in the Discoverer's shell. */
export const AUTH_USERNAME_ENV = "TARGET_USERNAME";
export const AUTH_PASSWORD_ENV = "TARGET_PASSWORD";
/** Identity-provider hint (plain text — not a secret, goes in the prompt). */
export const AUTH_IDP_ENV = "TARGET_IDP";

/**
 * Discoverer preamble: log in FIRST, confirm it worked, then `state-save` the
 * session so the generated suite (and the Designer/Tester) can reuse it.
 * `entryUrl` is the run's target URL; `authStatePath` is the absolute path the
 * workspace expects the saved state at (and that playwright.config.ts loads).
 *
 * The password is NOT inlined into this prompt. It is handed to the agent's
 * shell as the $TARGET_PASSWORD environment variable, and the agent references
 * "$TARGET_PASSWORD" in the fill command. This is the only mangle-proof path:
 * typing the literal corrupts any `$`/backtick/`!` under the shell (e.g.
 * "ab$789" → "ab"), which silently sends a wrong password; a double-quoted
 * parameter expansion is passed through verbatim and never re-scanned. It also
 * keeps the secret out of the prompt and out of any LLM trace.
 *
 * NOTE: this only protects the value once it is in process.env. There is a
 * separate, upstream trap: Next.js loads .env files through dotenv-expand, which
 * ALSO strips an unescaped `$` at load time — so the value can already be
 * corrupt before it ever reaches here. Users must escape `$` as `\$` in
 * .env.local (see .env.example); quotes do not help there.
 */
export function buildDiscovererAuthPreamble(
  auth: AuthCredentials,
  entryUrl: string,
  authStatePath: string,
): string {
  const startUrl = auth.loginUrl ?? entryUrl;
  // How to handle an identity-provider chooser (SAP BTP & many SSO portals show
  // one BEFORE the username/password form). A wrong provider can't authenticate
  // the account AND repeated wrong-provider attempts LOCK it — so pick exactly one.
  const idpGuidance = auth.idp
    ? `select the identity provider labelled EXACTLY "${auth.idp}" (do not pick any other).`
    : "pick the ONE provider that matches this account and do NOT cycle through the others — " +
      'an SAP S-user (an id like "S" followed by digits) authenticates via the "Default Identity Provider" / SAP ID service; ' +
      "a corporate email (name@company) uses that company's own provider.";
  return [
    "🔐 LOGIN MAY BE REQUIRED — credentials were provided for this app. If it shows a login screen you MUST log in",
    "BEFORE exploring, or every snapshot will only show the login page and your plan will be empty/wrong.",
    "If, after opening the start URL, you find NO login form at all (no username/password field and no login affordance),",
    "the app is PUBLIC: skip the login procedure below, record LOGIN_REQUIRED: no (see below), and explore it directly.",
    "",
    "📋 RECORD THE LOGIN OUTCOME — make the VERY FIRST line of plan.md an HTML comment stating whether this app",
    "actually had a login: `<!-- LOGIN_REQUIRED: yes -->` if you had to log in, or `<!-- LOGIN_REQUIRED: no -->` if",
    "the app was publicly accessible with no login wall. This line is required so the harness runs the suite correctly.",
    "",
    "The credentials are already set in your shell as ENVIRONMENT VARIABLES (their values are intentionally",
    "not printed here):",
    `- $${AUTH_USERNAME_ENV} — the login username/email${auth.username.includes("@") ? ` (it is ${auth.username})` : ""}`,
    `- $${AUTH_PASSWORD_ENV} — the password`,
    ...(auth.idp ? [`- Identity provider to choose: "${auth.idp}"`] : []),
    `- Start at: ${startUrl}`,
    "",
    "⚠️ CRITICAL: pass the credentials to playwright-cli by REFERENCING these variables inside DOUBLE quotes,",
    `exactly as written — "$${AUTH_USERNAME_ENV}" and "$${AUTH_PASSWORD_ENV}". Do NOT retype the literal values,`,
    "do NOT paste the password, and never run `echo` on them. A double-quoted variable reference is passed through",
    "the shell unchanged; typing the literal password would let the shell eat any $/backtick/! it contains and send",
    'a corrupted password — the #1 cause of a false "invalid email or password".',
    "",
    "Login procedure — do this FIRST, before any exploration or planning:",
    `1. Open the browser: npx playwright-cli open ${startUrl} -s=session1`,
    "2. Snapshot the page: npx playwright-cli snapshot",
    `3. IDENTITY‑PROVIDER CHOOSER: if the page shows a "Login with …" button and/or a list of identity`,
    `   providers (instead of a username field), ${idpGuidance}`,
    "   Then snapshot again so you see that provider's actual login form. If there is no chooser, skip this.",
    "4. Snapshot to locate the username/email field, the password field (if shown yet), and the submit button.",
    `5. Fill the username field: npx playwright-cli fill <ref> "$${AUTH_USERNAME_ENV}"`,
    "6. TWO‑STEP forms: many SSO logins (including SAP) ask for the username FIRST. If you do NOT see a",
    "   password field yet, click Continue/Next (or add --submit to the username fill), THEN snapshot again —",
    "   the password field appears on the next page.",
    `7. Fill the password field, submitting in the same step: npx playwright-cli fill <ref> "$${AUTH_PASSWORD_ENV}" --submit`,
    "   (or fill it and then click the Log On / Sign In button).",
    "8. Snapshot again and CONFIRM you are logged in (you should see the app, not a login form).",
    '9. If it still shows a login form or an "invalid credentials" message: re-check which ref is the username',
    "   vs the password field and retry ON THE SAME identity provider. Do NOT switch to a different identity",
    "   provider, and do NOT retry many times — repeated failures can LOCK the account. If the correct provider",
    "   keeps rejecting the credentials, STOP and report it (most likely an expired or wrong password), do not",
    "   keep trying other providers.",
    "10. Persist the authenticated session so the generated tests can reuse it (exact path):",
    `    npx playwright-cli state-save ${authStatePath}`,
    "11. ONLY THEN begin exploring the authenticated app and writing the plan.",
    "",
    "Do NOT create a login or logout scenario in the plan — authentication is handled automatically by the test",
    "harness (every generated test starts already logged in via a saved storage state). Plan only the authenticated flows.",
    "",
  ].join("\n");
}

/**
 * The credential env vars to inject into the Discoverer agent's shell so it can
 * reference "$TARGET_USERNAME"/"$TARGET_PASSWORD" without the literals ever
 * entering the prompt. Returned as a plain map the runtime merges over the
 * inherited process env.
 */
export function authEnvFor(auth: AuthCredentials): Record<string, string> {
  return {
    [AUTH_USERNAME_ENV]: auth.username,
    [AUTH_PASSWORD_ENV]: auth.password,
  };
}

/**
 * Designer preamble: tests run pre-authenticated via storageState, so specs
 * must NOT perform login; while exploring with the CLI, load the saved state.
 */
export function buildDesignerAuthPreamble(
  entryUrl: string,
  authStatePath: string,
): string {
  return [
    "\n\n🔐 This app requires login. The suite is configured to run every test ALREADY AUTHENTICATED via a saved",
    "storage state (playwright.config.ts → use.storageState), so the generated specs must NOT perform any login —",
    "assume the page starts in a logged-in state and do NOT put any username/password into a spec file.",
    "While exploring with playwright-cli to author each spec, load the saved auth first so you see the authenticated app:",
    `(a) npx playwright-cli open -s=session1   (b) npx playwright-cli state-load ${authStatePath}   (c) npx playwright-cli goto ${entryUrl}`,
    "then perform the scenario steps.",
  ].join(" ");
}

/**
 * Tester preamble: keep specs login-free; load saved state for manual CLI checks.
 */
export function buildTesterAuthPreamble(authStatePath: string): string {
  return [
    "\n\n🔐 This app requires login; the suite runs authenticated via use.storageState in playwright.config.ts.",
    "Do NOT add login steps or credentials to any spec. When inspecting a page manually with playwright-cli, run",
    `\`npx playwright-cli state-load ${authStatePath}\` right after opening so you see the authenticated app.`,
  ].join(" ");
}
