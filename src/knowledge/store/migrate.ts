import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getPool } from "./db";

// Forward-only SQL migration runner (Plan D2 — plain pg + SQL files, no ORM).
// Applies every unseen *.sql in migrations/ in lexical order, each in its own
// transaction, tracking applied names in schema_migrations. Idempotent: a second
// run applies nothing.

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "migrations",
);

/** Apply pending migrations against `url`. Returns the filenames applied. */
export async function migrate(url: string): Promise<string[]> {
  const pool = getPool(url);
  await pool.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       name       TEXT PRIMARY KEY,
       applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
     )`,
  );
  const applied = new Set(
    (
      await pool.query<{ name: string }>("SELECT name FROM schema_migrations")
    ).rows.map((r) => r.name),
  );
  const files = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const ran: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(join(MIGRATIONS_DIR, file), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations(name) VALUES ($1)", [
        file,
      ]);
      await client.query("COMMIT");
      ran.push(file);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }
  return ran;
}
