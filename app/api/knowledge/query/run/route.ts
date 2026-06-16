import {
  runReadOnlyQuery,
  validateReadOnlySql,
} from "@/src/knowledge/sql/guard";
import { getPool } from "@/src/knowledge/store/db";

export const runtime = "nodejs";

// Execute a user-reviewed SQL query against the Knowledge DB — STRICTLY read-only.
// The guard rejects anything that isn't a single SELECT/WITH, and the query runs in
// a READ ONLY transaction with a statement timeout and a hard row cap. The model is
// never trusted here; only the validated string reaches the database.

const STATEMENT_TIMEOUT_MS = 5_000;
const MAX_ROWS = 500;

export async function POST(request: Request) {
  const url = process.env.KNOWLEDGE_DATABASE_URL;
  if (!url) {
    return Response.json(
      { enabled: false, error: "KNOWLEDGE_DATABASE_URL is not configured" },
      { status: 200 },
    );
  }

  let body: { sql?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const sqlRaw = typeof body.sql === "string" ? body.sql : "";
  const verdict = validateReadOnlySql(sqlRaw);
  if (!verdict.ok) {
    return Response.json({ error: verdict.error }, { status: 400 });
  }

  try {
    const result = await runReadOnlyQuery(getPool(url), verdict.sql, {
      timeoutMs: STATEMENT_TIMEOUT_MS,
      maxRows: MAX_ROWS,
    });
    return Response.json(
      { enabled: true, ...result },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    // Surface the DB error text (e.g. syntax error, unknown column) to the UI so the
    // user can fix the SQL. A 400 keeps it a client-correctable error, not a 500.
    return Response.json(
      { error: e instanceof Error ? e.message : "query failed" },
      { status: 400 },
    );
  }
}
