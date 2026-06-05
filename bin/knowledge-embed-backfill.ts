import { LocalEmbedder } from "../src/knowledge/embeddings/embed";
import { ingestRun } from "../src/knowledge/ingest/ingestRun";
import { closeAllPools, getPool } from "../src/knowledge/store/db";
import type { RunReport } from "../src/types";

// Backfill spec embeddings for the current model (Spec R4/R9). Idempotent: it
// re-ingests (from raw_reports) only runs that have a spec missing an embedding
// for the current model, and ingestRun caches by content_hash, so a second run
// embeds nothing. Also the recovery path after a model switch (old-model rows
// are re-embedded with the new model).
//
//   KNOWLEDGE_DATABASE_URL=... npx tsx bin/knowledge-embed-backfill.ts

async function main() {
  const url = process.env.KNOWLEDGE_DATABASE_URL;
  if (!url) {
    console.error("KNOWLEDGE_DATABASE_URL is not set — nothing to backfill.");
    process.exit(1);
  }
  const embedder = new LocalEmbedder(process.env.EMBEDDING_MODEL || undefined);
  const pool = getPool(url);

  const { rows } = await pool.query<{ run_id: string }>(
    `SELECT DISTINCT s.run_id
       FROM specs s
      WHERE s.reused = false
        AND (s.embedding IS NULL OR s.embedding_model IS DISTINCT FROM $1)`,
    [embedder.id],
  );

  let n = 0;
  for (const r of rows) {
    const rep = await pool.query<{ report: RunReport }>(
      `SELECT report FROM raw_reports WHERE run_id = $1`,
      [r.run_id],
    );
    if (rep.rowCount === 0) continue; // no source report → can't re-embed
    await ingestRun(pool, rep.rows[0].report, embedder);
    n++;
  }

  console.log(
    n
      ? `Backfill complete: re-embedded ${n} run(s) for ${embedder.id}.`
      : `Nothing to backfill — all specs embedded for ${embedder.id}.`,
  );
  await closeAllPools();
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
