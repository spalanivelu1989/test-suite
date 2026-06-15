import { LocalEmbedder } from "../src/knowledge/embeddings/embed";
import { ingestRun } from "../src/knowledge/ingest/ingestRun";
import { closeAllPools, getPool } from "../src/knowledge/store/db";
import type { RunReport } from "../src/types";

// Backfill the ABSTRACTED pattern embedding (specs.pattern_embedding) for the
// Global Pattern Retrieval tier. Specs ingested before migration 0004 have no
// pattern_embedding, so they are invisible to cross-app pattern search until
// re-embedded. This re-ingests (from raw_reports) only runs that still have a
// spec missing a pattern embedding for the current model. Idempotent: ingestRun
// caches both the concrete embedding (by content_hash) and the pattern embedding,
// so a second pass embeds nothing. Mirrors knowledge-embed-backfill.ts.
//
//   KNOWLEDGE_DATABASE_URL=... npx tsx bin/knowledge-pattern-backfill.ts

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
        AND (s.pattern_embedding IS NULL
             OR s.pattern_model IS DISTINCT FROM $1)`,
    [embedder.id],
  );

  console.log(`Found ${rows.length} run(s) needing a pattern embedding.`);

  let n = 0;
  for (const r of rows) {
    const rep = await pool.query<{ report: RunReport }>(
      `SELECT report FROM raw_reports WHERE run_id = $1`,
      [r.run_id],
    );
    if (rep.rowCount === 0) continue; // no source report → can't re-embed
    await ingestRun(pool, rep.rows[0].report, embedder);
    n++;
    if (n % 25 === 0) console.log(`  …re-embedded ${n}/${rows.length} runs`);
  }

  console.log(
    n
      ? `Pattern backfill complete: re-embedded ${n} run(s) for ${embedder.id}.`
      : `Nothing to backfill — all specs have a pattern embedding for ${embedder.id}.`,
  );
  await closeAllPools();
}

main().catch((err) => {
  console.error("Pattern backfill failed:", err);
  process.exit(1);
});
