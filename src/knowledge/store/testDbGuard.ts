// Safety guard for DB integration suites. These suites seed disposable, randomly
// named fixtures (kp-*/distill-* etc.) and deliberately never clean up — so they
// must ONLY ever touch a throwaway test database. The danger: `npm run test:db`
// loads .env.test (knowledge_test), but Node's --env-file does NOT override a
// KNOWLEDGE_DATABASE_URL already exported in the shell, so an exported "real" DB
// silently wins and the fixtures land in production knowledge. This guard turns
// that into a loud skip instead of silent pollution.

/** Database name from a postgres connection URL ("" if unparseable). */
export function databaseName(url: string): string {
  try {
    return new URL(url).pathname.replace(/^\/+/, "");
  } catch {
    return "";
  }
}

/** True when the connection URL clearly points at a disposable test database. */
export function isTestDatabase(url: string | undefined): boolean {
  if (!url) return false;
  return databaseName(url).toLowerCase().includes("test");
}

/**
 * True for synthetic run ids minted by the test suite (`test-<uuid>`). Real runs
 * get a bare UUID from the run store, so this prefix reliably marks a fixture run
 * that must never be persisted into a production knowledge DB. Used by ingestRun
 * as a last-line guard against a unit test (which carries no env-file isolation)
 * writing into whatever KNOWLEDGE_DATABASE_URL happens to be exported.
 */
export function isTestRunId(runId: string | undefined): boolean {
  return !!runId && runId.startsWith("test-");
}

/**
 * The `skip` value for a node:test integration suite, given the configured DB URL:
 *   - no URL       → skip (unit-test mode, no DB configured)
 *   - non-test DB  → skip LOUDLY (guards against an exported var shadowing .env.test)
 *   - *test* DB    → false (run the suite)
 */
export function dbTestSkip(url: string | undefined): false | string {
  if (!url) return "KNOWLEDGE_DATABASE_URL not set";
  if (!isTestDatabase(url)) {
    return `refusing to run against non-test database "${databaseName(
      url,
    )}" — point KNOWLEDGE_DATABASE_URL at a *_test DB (see .env.test). Note: an exported shell var overrides --env-file.`;
  }
  return false;
}
