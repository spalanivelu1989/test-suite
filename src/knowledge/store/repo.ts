import type { Pool, PoolClient } from "pg";
import type { RunReport } from "../../types";
import type { ExtractedRun } from "../ingest/extract";

// All SQL lives here (Plan D2). Writes are idempotent by run; every read is
// app-scoped (N5). Callers get behavioral operations, never raw SQL.

// ── pgvector serialization (Phase 2) ─────────────────────────────────────────

/** number[] → pgvector text literal `[1,2,3]` (bound with a `::vector` cast). */
export function toSqlVector(v: number[] | null | undefined): string | null {
  return v && v.length ? `[${v.join(",")}]` : null;
}

/** pgvector text `[1,2,3]` → number[] (null/empty → null). */
export function parseSqlVector(s: string | null): number[] | null {
  if (!s) return null;
  const inner = s.replace(/^\[/, "").replace(/\]$/, "").trim();
  if (!inner) return null;
  return inner.split(",").map(Number);
}

// ── Writes (run inside one transaction, owned by ingestRun) ──────────────────

/** Persist an extracted run + its raw report. Idempotent by `runId`. */
export async function persistRun(
  client: PoolClient,
  ex: ExtractedRun,
  rawReport: RunReport,
): Promise<void> {
  const { appId, run } = ex;

  await client.query(
    `INSERT INTO apps(app_id, last_seen) VALUES ($1, now())
     ON CONFLICT (app_id) DO UPDATE SET last_seen = now()`,
    [appId],
  );

  await client.query(
    `INSERT INTO runs(run_id, app_id, url, status) VALUES ($1,$2,$3,$4)
     ON CONFLICT (run_id) DO UPDATE SET app_id=$2, url=$3, status=$4`,
    [run.runId, appId, run.url, run.status],
  );

  // Idempotent replace of this run's child rows.
  for (const t of ["specs", "plan_scenarios", "test_results"]) {
    await client.query(`DELETE FROM ${t} WHERE run_id = $1`, [run.runId]);
  }
  await client.query(`DELETE FROM coverage_snapshots WHERE run_id = $1`, [
    run.runId,
  ]);

  for (const s of ex.specs) {
    await client.query(
      `INSERT INTO specs(run_id, app_id, file, title, flow_id, content_hash, reused, tokens, embedding, embedding_model)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::vector,$10)`,
      [
        run.runId,
        appId,
        s.file,
        s.title,
        s.flowId,
        s.contentHash,
        s.reused,
        s.tokens,
        toSqlVector(s.embedding),
        s.embeddingModel ?? null,
      ],
    );
  }
  for (const f of ex.flows) {
    await client.query(
      `INSERT INTO flows(app_id, flow_id, name) VALUES ($1,$2,$3)
       ON CONFLICT (app_id, flow_id) DO UPDATE SET name = EXCLUDED.name`,
      [appId, f.flowId, f.name],
    );
  }
  for (const p of ex.planScenarios) {
    await client.query(
      `INSERT INTO plan_scenarios(run_id, app_id, ordinal, name, tokens)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT (run_id, name) DO NOTHING`,
      [run.runId, appId, p.ordinal, p.name, p.tokens],
    );
  }
  for (const r of ex.testResults) {
    await client.query(
      `INSERT INTO test_results(run_id, app_id, flow_id, file, outcome, failure_reason)
       VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (run_id, flow_id) DO NOTHING`,
      [run.runId, appId, r.flowId, r.file, r.outcome, r.failureReason],
    );
  }
  if (ex.coverage) {
    const c = ex.coverage;
    await client.query(
      `INSERT INTO coverage_snapshots(run_id, app_id, curated_total, tested_count, percent, missing_flows)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        run.runId,
        appId,
        c.curatedTotal,
        c.testedCount,
        c.percent,
        c.missingFlows,
      ],
    );
  }
  for (const e of ex.edges) {
    await client.query(
      `INSERT INTO edges(app_id, src_type, src_id, rel, dst_type, dst_id)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (src_type, src_id, rel, dst_type, dst_id) DO NOTHING`,
      [e.appId, e.srcType, e.srcId, e.rel, e.dstType, e.dstId],
    );
  }

  await client.query(
    `INSERT INTO raw_reports(run_id, app_id, report) VALUES ($1,$2,$3)
     ON CONFLICT (run_id) DO UPDATE SET report = EXCLUDED.report`,
    [run.runId, appId, rawReport],
  );

  // Keep apps.run_count in sync.
  await client.query(
    `UPDATE apps SET run_count = (SELECT count(*) FROM runs WHERE app_id=$1) WHERE app_id=$1`,
    [appId],
  );
}

// ── Reads (app-scoped, N5) ───────────────────────────────────────────────────

export interface FlowRow {
  flowId: string;
  name: string;
  lastOutcome: string | null;
  lastRunId: string | null;
}

export interface AppKnowledge {
  appId: string;
  runCount: number;
  pages: string[];
  flows: FlowRow[];
  /** Gap names from the most recent run's coverage snapshot (M1-aligned). */
  missingFlows: string[];
}

/** One app-scoped read of everything the profile/coverage map needs (T10). */
export async function readAppKnowledge(
  pool: Pool,
  appId: string,
): Promise<AppKnowledge | null> {
  const app = await pool.query<{ run_count: number }>(
    `SELECT run_count FROM apps WHERE app_id = $1`,
    [appId],
  );
  if (app.rowCount === 0) return null;

  const pages = await pool.query<{ url: string }>(
    `SELECT DISTINCT url FROM runs WHERE app_id = $1 ORDER BY url`,
    [appId],
  );

  // The latest run's coverage snapshot is the authoritative gap list (it used
  // coverageFromResults token-overlap at report time, the same basis as M1).
  const snap = await pool.query<{ missing_flows: string[] }>(
    `SELECT cs.missing_flows
       FROM coverage_snapshots cs
       JOIN runs r ON r.run_id = cs.run_id
      WHERE cs.app_id = $1
      ORDER BY r.created_at DESC
      LIMIT 1`,
    [appId],
  );

  const flows = await pool.query<{
    flow_id: string;
    name: string;
    last_outcome: string | null;
    last_run_id: string | null;
  }>(
    `SELECT f.flow_id, f.name,
            lr.outcome AS last_outcome, lr.run_id AS last_run_id
       FROM flows f
       LEFT JOIN LATERAL (
         SELECT tr.outcome, tr.run_id
           FROM test_results tr
          WHERE tr.app_id = f.app_id AND tr.flow_id = f.flow_id
          ORDER BY tr.created_at DESC
          LIMIT 1
       ) lr ON true
      WHERE f.app_id = $1
      ORDER BY f.name`,
    [appId],
  );

  return {
    appId,
    runCount: app.rows[0].run_count,
    pages: pages.rows.map((r) => r.url),
    flows: flows.rows.map((r) => ({
      flowId: r.flow_id,
      name: r.name,
      lastOutcome: r.last_outcome,
      lastRunId: r.last_run_id,
    })),
    missingFlows: snap.rows[0]?.missing_flows ?? [],
  };
}

export interface SpecRow {
  runId: string;
  file: string;
  title: string | null;
  flowId: string | null;
  tokens: string[];
  lastOutcome: string | null;
  /** Phase 2: semantic embedding, or null when not yet embedded. */
  embedding: number[] | null;
}

/** Non-reused specs for an app with their last outcome + embedding — for decisions. */
export async function readSpecsForApp(
  pool: Pool,
  appId: string,
): Promise<SpecRow[]> {
  const res = await pool.query<{
    run_id: string;
    file: string;
    title: string | null;
    flow_id: string | null;
    tokens: string[];
    last_outcome: string | null;
    embedding: string | null;
  }>(
    `SELECT s.run_id, s.file, s.title, s.flow_id, s.tokens, s.embedding::text AS embedding,
            (SELECT tr.outcome FROM test_results tr
              WHERE tr.run_id = s.run_id AND tr.file = s.file LIMIT 1) AS last_outcome
       FROM specs s
      WHERE s.app_id = $1 AND s.reused = false
      ORDER BY s.created_at DESC`,
    [appId],
  );
  return res.rows.map((r) => ({
    runId: r.run_id,
    file: r.file,
    title: r.title,
    flowId: r.flow_id,
    tokens: r.tokens ?? [],
    lastOutcome: r.last_outcome,
    embedding: parseSqlVector(r.embedding),
  }));
}

/**
 * An existing embedding for a content hash + model, if any spec already has one
 * (the ingest cache — Phase 2 R3/D4). Avoids re-embedding unchanged specs.
 */
export async function embeddingForHash(
  pool: Pool,
  contentHash: string,
  model: string,
): Promise<number[] | null> {
  const res = await pool.query<{ embedding: string | null }>(
    `SELECT embedding::text AS embedding FROM specs
      WHERE content_hash = $1 AND embedding_model = $2 AND embedding IS NOT NULL
      LIMIT 1`,
    [contentHash, model],
  );
  return res.rowCount ? parseSqlVector(res.rows[0].embedding) : null;
}

/** k nearest specs to a query embedding by cosine (HNSW), app-scoped (R6). */
export async function findNearestSpecs(
  pool: Pool,
  appId: string,
  queryEmbedding: number[],
  k: number,
): Promise<
  { runId: string; file: string; title: string | null; score: number }[]
> {
  const q = toSqlVector(queryEmbedding);
  if (!q) return [];
  const res = await pool.query<{
    run_id: string;
    file: string;
    title: string | null;
    dist: string;
  }>(
    `SELECT s.run_id, s.file, s.title, (s.embedding <=> $2::vector) AS dist
       FROM specs s
      WHERE s.app_id = $1 AND s.reused = false AND s.embedding IS NOT NULL
      ORDER BY s.embedding <=> $2::vector
      LIMIT $3`,
    [appId, q, k],
  );
  // cosine distance → similarity (normalized vectors): sim = 1 − distance.
  return res.rows.map((r) => ({
    runId: r.run_id,
    file: r.file,
    title: r.title,
    score: 1 - Number(r.dist),
  }));
}

/** Fetch a spec's source for copy-forward on reuse (D4). */
export async function readSpecCode(
  pool: Pool,
  runId: string,
  file: string,
): Promise<string | null> {
  const res = await pool.query<{ report: RunReport }>(
    `SELECT report FROM raw_reports WHERE run_id = $1`,
    [runId],
  );
  if (res.rowCount === 0) return null;
  const spec = (res.rows[0].report.generatedSpecs ?? []).find(
    (s) => s.file === file,
  );
  return spec?.code ?? null;
}

/** The most recent prior run's plan markdown for an app — Planner "memory". */
export async function readLastPlan(
  pool: Pool,
  appId: string,
): Promise<string | null> {
  const res = await pool.query<{ plan: string | null }>(
    `SELECT report->>'planMarkdown' AS plan
       FROM raw_reports
      WHERE app_id = $1 AND report->>'planMarkdown' IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 1`,
    [appId],
  );
  return res.rowCount ? res.rows[0].plan : null;
}

/** Count rows of an entity for an app (rebuild/verification helpers, N2). */
export async function countRuns(pool: Pool, appId: string): Promise<number> {
  const r = await pool.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM runs WHERE app_id = $1`,
    [appId],
  );
  return Number(r.rows[0].n);
}
