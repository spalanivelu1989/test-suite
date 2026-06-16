import type { Pool } from "pg";

// Read-only SQL guard for the natural-language "SQL Query" tab. The model can emit
// anything, so NOTHING the model produces is trusted. Two layers of defense:
//   1. validateReadOnlySql — static checks: single statement, must start with
//      SELECT/WITH, no write/DDL/session keywords (even inside a WITH CTE).
//   2. runReadOnlyQuery — runs inside a READ ONLY transaction with a statement
//      timeout and a hard row cap, so even a query that slips past (1) cannot
//      write, hang, or return an unbounded result.

export interface SqlGuardOk {
  ok: true;
  /** The statement with any trailing ';' removed, safe to wrap as a subquery. */
  sql: string;
}
export interface SqlGuardErr {
  ok: false;
  error: string;
}
export type SqlGuardResult = SqlGuardOk | SqlGuardErr;

// Keywords that have no place in a read-only query. Checked as whole words against
// a copy with comments and string literals removed, so a literal like '%delete%'
// is fine but a data-modifying CTE (WITH x AS (DELETE ...)) is rejected.
const FORBIDDEN_KEYWORDS = [
  "insert",
  "update",
  "delete",
  "drop",
  "alter",
  "truncate",
  "create",
  "grant",
  "revoke",
  "comment",
  "copy",
  "call",
  "do",
  "vacuum",
  "analyze",
  "reindex",
  "refresh",
  "merge",
  "set",
  "reset",
  "begin",
  "start",
  "commit",
  "rollback",
  "savepoint",
  "lock",
  "listen",
  "unlisten",
  "notify",
  "prepare",
  "execute",
  "deallocate",
  "cluster",
  "discard",
  "import",
  "load",
  "checkpoint",
];

/** Remove -- line comments and block comments. */
function stripComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
}

/** Remove '…' string literals and "…" quoted identifiers (with doubled-quote escapes). */
function stripQuoted(sql: string): string {
  return sql
    .replace(/'(?:''|[^'])*'/g, " '' ")
    .replace(/"(?:""|[^"])*"/g, ' "" ');
}

/**
 * Statically verify a query is a single read-only SELECT. Returns the cleaned SQL
 * (trailing ';' stripped) on success, or a human-readable reason on failure.
 */
export function validateReadOnlySql(raw: string): SqlGuardResult {
  const input = (raw ?? "").trim();
  if (!input) return { ok: false, error: "SQL is empty." };

  // Analyze a copy with comments + string/identifier literals removed so the checks
  // below can't be fooled by — or trip over — content inside quotes or comments.
  const analysis = stripQuoted(stripComments(input)).trim();
  if (!analysis) return { ok: false, error: "SQL contains only comments." };

  const withoutTrailing = analysis.replace(/;\s*$/, "");
  if (withoutTrailing.includes(";")) {
    return {
      ok: false,
      error: "Only a single statement is allowed (remove the ';' separators).",
    };
  }

  if (!/^\s*(select|with)\b/i.test(withoutTrailing)) {
    return {
      ok: false,
      error: "Only read-only SELECT (or WITH … SELECT) queries are allowed.",
    };
  }

  for (const kw of FORBIDDEN_KEYWORDS) {
    if (new RegExp(`\\b${kw}\\b`, "i").test(withoutTrailing)) {
      return {
        ok: false,
        error: `Disallowed keyword "${kw.toUpperCase()}" — only read-only queries are permitted.`,
      };
    }
  }

  // Execute the ORIGINAL text (literals/comments intact) minus any trailing ';'.
  return { ok: true, sql: input.replace(/;\s*$/, "") };
}

export interface ReadOnlyResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  /** True when more rows existed than maxRows and the extra were dropped. */
  truncated: boolean;
}

export interface RunReadOnlyOptions {
  timeoutMs?: number;
  maxRows?: number;
}

/**
 * Execute a validated SELECT inside a READ ONLY transaction with a statement
 * timeout and a hard row cap. The query is wrapped as a subquery so the cap is
 * enforced server-side no matter what LIMIT (if any) the query itself carries; the
 * leading newline keeps a trailing line-comment from swallowing the closing paren.
 */
export async function runReadOnlyQuery(
  pool: Pool,
  validatedSql: string,
  opts: RunReadOnlyOptions = {},
): Promise<ReadOnlyResult> {
  const timeoutMs = Math.max(1, Math.trunc(opts.timeoutMs ?? 5_000));
  const maxRows = Math.max(1, Math.trunc(opts.maxRows ?? 500));

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET TRANSACTION READ ONLY");
    await client.query(`SET LOCAL statement_timeout = ${timeoutMs}`);
    const wrapped = `SELECT * FROM (\n${validatedSql}\n) AS _q LIMIT ${maxRows + 1}`;
    const res = await client.query(wrapped);

    const truncated = res.rows.length > maxRows;
    const rows = (truncated ? res.rows.slice(0, maxRows) : res.rows) as Record<
      string,
      unknown
    >[];
    const columns =
      res.fields?.map((f) => f.name) ?? (rows[0] ? Object.keys(rows[0]) : []);
    return { columns, rows, rowCount: rows.length, truncated };
  } finally {
    // A READ ONLY tx writes nothing, but rolling back promptly releases any locks.
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    client.release();
  }
}
