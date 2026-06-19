import { NextResponse } from "next/server";
import { listSourceApps } from "@/src/migration/sourceSpecs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/migration-check/source-apps — list apps with prior, spec-bearing runs
 * that can serve as a migration source. Read-only.
 */
export async function GET() {
  const apps = await listSourceApps();
  return NextResponse.json({ apps });
}
