import { getPool } from "@/src/knowledge/store/db";

export const runtime = "nodejs";

// Distinct specs that have embeddings — populates the explorer's spec inventory drawer.
export async function GET() {
  const url = process.env.KNOWLEDGE_DATABASE_URL;
  if (!url) return Response.json({ enabled: false, specs: [] });

  const res = await getPool(url).query<{
    app_id: string;
    file: string;
    title: string | null;
    run_id: string;
  }>(
    `SELECT app_id, file, title, run_id
       FROM specs
      WHERE embedding IS NOT NULL AND reused = false
      ORDER BY app_id, file`,
  );

  return Response.json(
    {
      enabled: true,
      specs: res.rows.map((r) => ({
        appId: r.app_id,
        file: r.file,
        title: r.title,
        runId: r.run_id,
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
