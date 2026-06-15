import { LocalEmbedder } from "../src/knowledge/embeddings/embed";
import { closeAllPools, getPool } from "../src/knowledge/store/db";
import { toSqlVector } from "../src/knowledge/store/repo";

// Backfill the TITLE-only embedding (specs.title_embedding) for hybrid reuse
// matching (migration 0005). Specs ingested before 0005 have no title_embedding,
// so the reuse decision falls back to the title+steps `embedding` for them — which
// caps exact-title scenarios ~0.79, below SEM_REUSE=0.82, so reuse never fires.
// Re-embedding the stored title closes that gap.
//
// Unlike the pattern backfill, this needs no raw_reports: the title text already
// lives in specs.title, so we re-embed it directly. Idempotent — only rows whose
// title_embedding is missing or was built by a different model are touched.
//
//   KNOWLEDGE_DATABASE_URL=... npx tsx bin/knowledge-title-backfill.ts

const BATCH = 128;

async function main() {
  const url = process.env.KNOWLEDGE_DATABASE_URL;
  if (!url) {
    console.error("KNOWLEDGE_DATABASE_URL is not set — nothing to backfill.");
    process.exit(1);
  }
  const embedder = new LocalEmbedder(process.env.EMBEDDING_MODEL || undefined);
  const pool = getPool(url);

  const { rows } = await pool.query<{
    run_id: string;
    file: string;
    title: string;
  }>(
    `SELECT run_id, file, title
       FROM specs
      WHERE title IS NOT NULL AND title <> ''
        AND (title_embedding IS NULL OR title_model IS DISTINCT FROM $1)`,
    [embedder.id],
  );

  console.log(`Found ${rows.length} spec(s) needing a title embedding.`);

  let n = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const vecs = await embedder.embed(batch.map((r) => r.title));
    for (let j = 0; j < batch.length; j++) {
      const v = vecs[j] ?? null;
      if (!v) continue;
      await pool.query(
        `UPDATE specs SET title_embedding = $1::vector, title_model = $2
          WHERE run_id = $3 AND file = $4`,
        [toSqlVector(v), embedder.id, batch[j].run_id, batch[j].file],
      );
      n++;
    }
    console.log(
      `  …embedded ${Math.min(i + BATCH, rows.length)}/${rows.length}`,
    );
  }

  console.log(
    n
      ? `Title backfill complete: embedded ${n} spec title(s) for ${embedder.id}.`
      : `Nothing to backfill — all titled specs have a title embedding for ${embedder.id}.`,
  );
  await closeAllPools();
}

main().catch((err) => {
  console.error("Title backfill failed:", err);
  process.exit(1);
});
