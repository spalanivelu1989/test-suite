import type { Pool } from "pg";
import type { RunReport } from "../../types";
import { extractRun } from "./extract";
import { persistRun } from "../store/repo";

// Ingest a completed run into the knowledge base (Spec R3, R11). Idempotent by
// runId. The caller wraps this in withKb, so this may throw on a real DB error —
// that's caught upstream and the run degrades (R4/N3).
//
//   RunReport ──► extractRun ──► [ BEGIN ]
//                  (defensive)      persistRun: apps, runs, specs, flows,
//                                   plan_scenarios, test_results, coverage,
//                                   edges, raw_reports   (idempotent replace)
//                                [ COMMIT ]  ──► N flows ingested
//                                   any error ──► ROLLBACK ──► throw (→ withKb)

/** Normalize + persist a RunReport in one transaction. Returns flow count. */
export async function ingestRun(
  pool: Pool,
  report: RunReport,
): Promise<{ appId: string; flows: number }> {
  if (!report?.runId) throw new Error("RunReport has no runId");
  const ex = extractRun(report);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await persistRun(client, ex, report);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  return { appId: ex.appId, flows: ex.flows.length };
}
