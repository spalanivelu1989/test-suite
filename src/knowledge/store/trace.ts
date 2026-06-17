import type { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";
import { startActiveObservation } from "@langfuse/tracing";

/**
 * Make a single SQL round trip visible in Langfuse as a `db:query` child span,
 * nested under whatever `kb:<op>` span is active (src/knowledge/safety.ts).
 *
 * Why this exists (the bug it fixes): the `pg` driver IS auto-instrumented
 * (PgInstrumentation), but those raw spans never reach Langfuse —
 * LangfuseSpanProcessor's default `shouldExportSpan` only keeps Langfuse-scoped
 * spans, `gen_ai.*` spans, and known LLM instrumentors. The pg instrumentation
 * scope (`@opentelemetry/instrumentation-pg`) is none of those, so every pg span
 * is silently dropped and the pgvector round trip disappears inside the kb:* span
 * duration. A span we open ourselves is Langfuse-scoped, so it survives the
 * filter — and it can carry rowCount / latency / a param summary that the raw pg
 * span cannot.
 *
 * Constraints honored:
 *  - No raw embeddings: a pgvector literal param is reduced to a fingerprint
 *    (dims + L2 norm + first values), never the 384 floats. {@link fingerprintParam}
 *  - Free text (SQL, string params, JSON blobs) is truncated / never serialized.
 *  - Cold path safe: with tracing disabled, `startActiveObservation` is a
 *    non-recording no-op, so this is just `db.query` with negligible overhead.
 *  - Errors propagate unchanged (recorded on the span, then rethrown) so the
 *    caller's `withKb` timeout + fallback semantics are untouched — we never
 *    swallow a DB error here.
 */
export interface DbSpanMeta {
  /** Repository method issuing the query, e.g. "readSpecsForApp". */
  op: string;
  /** Primary table/relation touched, e.g. "specs". */
  table: string;
  /** Extra observational hints merged into the span input (e.g. ordering). */
  detail?: Record<string, unknown>;
}

const MAX_SQL_CHARS = 2_000;
const MAX_STR_PARAM_CHARS = 120;

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max) + `… [+${s.length - max} chars]`;
}

/** Collapse whitespace so the SQL reads as one tidy line in the trace UI. */
function tidySql(sql: string): string {
  return truncate(sql.replace(/\s+/g, " ").trim(), MAX_SQL_CHARS);
}

/** A pgvector text literal looks like `[0.1,0.2,…]` — detect to fingerprint it. */
function isVectorLiteral(s: string): boolean {
  return (
    s.length > 1 && s[0] === "[" && s[s.length - 1] === "]" && s.includes(",")
  );
}

/** Vector → `vector(dims=384, l2≈1.000, head=[…])`; never the raw floats. */
function vectorFingerprint(literal: string): string {
  const parts = literal.slice(1, -1).split(",");
  let sumSq = 0;
  for (const p of parts) {
    const n = Number(p);
    if (Number.isFinite(n)) sumSq += n * n;
  }
  const head = parts
    .slice(0, 4)
    .map((p) => Number(p).toFixed(3))
    .join(",");
  return `vector(dims=${parts.length}, l2≈${Math.sqrt(sumSq).toFixed(3)}, head=[${head}…])`;
}

/** Redact/shrink one bound param so a span never ships a vector, blob, or MB. */
export function fingerprintParam(p: unknown): unknown {
  if (p == null) return null;
  if (typeof p === "number" || typeof p === "boolean") return p;
  if (typeof p === "string") {
    return isVectorLiteral(p)
      ? vectorFingerprint(p)
      : truncate(p, MAX_STR_PARAM_CHARS);
  }
  if (Array.isArray(p)) return `array(len=${p.length})`;
  // Objects (e.g. a raw RunReport written by ingest) — never serialize the body.
  return `${typeof p}(…)`;
}

/**
 * Run `db.query(sql, params)` inside a `db:query` observation. Returns exactly
 * what `db.query` returns; behaviour is identical to a bare query when tracing
 * is off.
 */
export async function tracedQuery<Row extends QueryResultRow = QueryResultRow>(
  db: Pool | PoolClient,
  meta: DbSpanMeta,
  sql: string,
  params: unknown[] = [],
): Promise<QueryResult<Row>> {
  return startActiveObservation("db:query", async (span) => {
    span.update({
      input: {
        operation: meta.op,
        table: meta.table,
        sql: tidySql(sql),
        params: params.map(fingerprintParam),
        ...(meta.detail ?? {}),
      },
    });
    const t0 = Date.now();
    try {
      const res = await db.query<Row>(sql, params);
      span.update({
        output: {
          rowCount: res.rowCount ?? res.rows.length,
          latencyMs: Date.now() - t0,
        },
      });
      return res;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Record the failure, then rethrow — withKb owns the fallback + timeout.
      span.update({
        level: "ERROR",
        statusMessage: message,
        output: { latencyMs: Date.now() - t0, error: true },
      });
      throw err;
    }
  });
}
