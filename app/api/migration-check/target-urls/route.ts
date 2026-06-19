import { NextResponse } from "next/server";
import {
  listEnvironments,
  listMigrationStatuses,
} from "@/src/migration/persistence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/migration-check/target-urls — distinct target deployment URLs seen
 * before, drawn from both saved environment profiles and past run history, so
 * the configure form can auto-populate the target URL field. Most-recent first.
 */
export async function GET() {
  const [envs, statuses] = await Promise.all([
    listEnvironments(),
    listMigrationStatuses(), // already newest-first
  ]);

  const seen = new Set<string>();
  const urls: string[] = [];
  const add = (u: unknown) => {
    if (typeof u === "string" && u.trim() && !seen.has(u)) {
      seen.add(u);
      urls.push(u);
    }
  };

  // Past runs first (newest-first) so the freshest URLs surface at the top,
  // then any saved-profile URLs not already covered.
  for (const s of statuses) add(s.targetUrl);
  for (const e of envs) add(e.targetUrl);

  return NextResponse.json({ targetUrls: urls });
}
