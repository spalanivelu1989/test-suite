import { closeAllPools, getPool } from "../src/knowledge/store/db";

// Remove leftover INTEGRATION-TEST apps from a Knowledge DB. The knowledge + distill
// integration suites create disposable, randomly-named synthetic apps and never
// clean up (they rely on unique origins for isolation). When those suites are run
// against a real KNOWLEDGE_DATABASE_URL instead of the disposable `knowledge_test`
// DB, the fixtures linger — and they are NOT inert: trusted GLOBAL playbooks
// distilled by the distill tests get injected into real prompts, and the cross-app
// pattern tier can surface the fake specs as hints. This script deletes them.
//
// SAFE BY DEFAULT: it only reports (a dry run). Pass --apply to actually delete.
//
//   # see what WOULD be deleted (default):
//   KNOWLEDGE_DATABASE_URL=... npx tsx bin/knowledge-clean-test-apps.ts
//   # actually delete:
//   KNOWLEDGE_DATABASE_URL=... npx tsx bin/knowledge-clean-test-apps.ts --apply

// Synthetic origins these suites generate (see src/knowledge/integration.test.ts and
// src/knowledge/distill/integration.test.ts). Tightly scoped to the *.example.com
// fixtures so a real app can never match by accident.
const PATTERNS = ["https://kp-%.example.com", "https://distill-%.example.com"];

// Every table that carries an app reference, child → parent, so explicit deletes
// never trip a foreign key (we do not rely on ON DELETE CASCADE). `playbooks` keys
// off scope_key rather than app_id; everything else uses app_id.
const APP_ID_TABLES = [
  "edges",
  "healing_events",
  "raw_reports",
  "coverage_snapshots",
  "test_results",
  "plan_scenarios",
  "specs",
  "flows",
  "runs",
  "apps",
] as const;

/** SQL fragment matching any of PATTERNS against `col` ($1, $2, …). */
function likeAny(col: string): string {
  return PATTERNS.map((_, i) => `${col} LIKE $${i + 1}`).join(" OR ");
}

async function main() {
  const apply = process.argv.includes("--apply");
  const url = process.env.KNOWLEDGE_DATABASE_URL;
  if (!url) {
    console.error("KNOWLEDGE_DATABASE_URL is not set — nothing to clean.");
    process.exit(1);
  }

  const pool = getPool(url);
  const client = await pool.connect();
  try {
    console.log(
      `${apply ? "APPLY" : "DRY RUN"} — matching test-fixture apps:\n  ${PATTERNS.join("\n  ")}\n`,
    );

    // Survey first (this is the whole output in dry-run mode).
    const counts: Record<string, number> = {};
    let total = 0;
    for (const table of APP_ID_TABLES) {
      const { rows } = await client.query<{ n: string }>(
        `SELECT count(*)::int AS n FROM ${table} WHERE ${likeAny("app_id")}`,
        PATTERNS,
      );
      counts[table] = Number(rows[0].n);
      total += counts[table];
    }
    const pb = await client.query<{ n: string }>(
      `SELECT count(*)::int AS n FROM playbooks WHERE ${likeAny("scope_key")}`,
      PATTERNS,
    );
    counts.playbooks = Number(pb.rows[0].n);
    total += counts.playbooks;

    for (const [table, n] of Object.entries(counts)) {
      console.log(`  ${table.padEnd(20)} ${n}`);
    }
    console.log(`  ${"—".repeat(24)}\n  ${"total rows".padEnd(20)} ${total}\n`);

    if (total === 0) {
      console.log("Nothing to clean — no test-fixture apps found. ✅");
      return;
    }

    if (!apply) {
      console.log(
        "DRY RUN — nothing was deleted. Re-run with --apply to delete the rows above.",
      );
      return;
    }

    // Apply: delete child → parent inside one transaction, then commit.
    await client.query("BEGIN");
    let deleted = 0;
    for (const table of [...APP_ID_TABLES]) {
      const res = await client.query(
        `DELETE FROM ${table} WHERE ${likeAny("app_id")}`,
        PATTERNS,
      );
      deleted += res.rowCount ?? 0;
    }
    const pbDel = await client.query(
      `DELETE FROM playbooks WHERE ${likeAny("scope_key")}`,
      PATTERNS,
    );
    deleted += pbDel.rowCount ?? 0;
    await client.query("COMMIT");

    console.log(
      `Deleted ${deleted} row(s) across ${APP_ID_TABLES.length + 1} tables. ✅`,
    );
  } catch (err) {
    // Roll back a half-finished apply so the DB is never left inconsistent.
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
    await closeAllPools();
  }
}

main().catch((err) => {
  console.error("Cleanup failed:", err);
  process.exit(1);
});
