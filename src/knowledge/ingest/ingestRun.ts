import type { Pool } from "pg";
import type { RunReport } from "../../types";
import type { Embedder } from "../embeddings/embed";
import { embeddingForHash, persistRun } from "../store/repo";
import { type ExtractedRun, extractRun } from "./extract";

// Ingest a completed run into the knowledge base (Spec R3, R11). Idempotent by
// runId. Phase 2 embeds each spec (best-effort, cached) before persisting.
//
//   RunReport ──► extractRun (intentText, content_hash)
//                  │
//                  ▼  (Phase 2, if an embedder is supplied)
//             embedSpecs:  embeddingForHash(hash, model)  ── cache hit ─► reuse vector
//                          else withKb( embedder.embed )  ── fail ──────► null (lexical only)
//                  │
//                  ▼  [ BEGIN ]  persistRun: apps, runs, specs(+embedding),
//                                flows, plan_scenarios, test_results, coverage,
//                                edges, raw_reports   (idempotent replace)
//                     [ COMMIT ]  ──► N flows
//                        any error ──► ROLLBACK ──► throw (→ withKb upstream)

/** Normalize + (optionally) embed + persist a RunReport. Returns flow count. */
export async function ingestRun(
  pool: Pool,
  report: RunReport,
  embedder?: Embedder,
): Promise<{ appId: string; flows: number }> {
  if (!report?.runId) throw new Error("RunReport has no runId");
  const ex = extractRun(report);

  if (embedder) await embedSpecs(pool, ex, embedder);

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

/**
 * Embed each spec's intent text, reusing an existing embedding for the same
 * content hash + model (cache). Best-effort: any failure leaves null embeddings
 * and ingestion still proceeds (R3/R8/SC9).
 */
async function embedSpecs(
  pool: Pool,
  ex: ExtractedRun,
  embedder: Embedder,
): Promise<void> {
  const pending: { idx: number; text: string }[] = [];
  for (let i = 0; i < ex.specs.length; i++) {
    const cached = await embeddingForHash(
      pool,
      ex.specs[i].contentHash,
      embedder.id,
    ).catch(() => null);
    if (cached) {
      ex.specs[i].embedding = cached;
      ex.specs[i].embeddingModel = embedder.id;
    } else {
      pending.push({ idx: i, text: ex.specs[i].intentText });
    }
  }
  if (pending.length === 0) return;
  try {
    const vecs = await embedder.embed(pending.map((p) => p.text));
    pending.forEach((p, j) => {
      const v = vecs[j] ?? null;
      ex.specs[p.idx].embedding = v;
      ex.specs[p.idx].embeddingModel = v ? embedder.id : null;
    });
  } catch (err) {
    // Best-effort: leave nulls → those specs are matched lexically only.
    console.error(
      `[knowledge] embed-at-ingest failed (lexical only): ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}
