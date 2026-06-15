import { getPool } from "@/src/knowledge/store/db";

export const runtime = "nodejs";

// Distinct apps that have at least one embedded spec — populates the explorer's
// app picker (the in-app tier needs an origin app; cross-app excludes it).
export async function GET() {
  const url = process.env.KNOWLEDGE_DATABASE_URL;
  if (!url) return Response.json({ enabled: false, apps: [] });

  const res = await getPool(url).query<{ app_id: string; spec_count: string }>(
    `SELECT app_id, count(*) AS spec_count
       FROM specs
      WHERE embedding IS NOT NULL AND reused = false
      GROUP BY app_id
      ORDER BY count(*) DESC, app_id`,
  );
  return Response.json(
    {
      enabled: true,
      apps: res.rows.map((r) => ({
        appId: r.app_id,
        specCount: Number(r.spec_count),
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
