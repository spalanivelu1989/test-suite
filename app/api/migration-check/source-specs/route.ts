import { NextResponse } from "next/server";
import { listSourceSpecs } from "@/src/migration/sourceSpecs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/migration-check/source-specs?url=<sourceUrl>&runId=<optional>
 * — list the existing specs (with last outcome) eligible to carry over. Read-only.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");
  const runId = searchParams.get("runId") ?? undefined;

  if (!url) {
    return NextResponse.json(
      { error: "Query param 'url' is required" },
      { status: 400 },
    );
  }

  const result = await listSourceSpecs(url, runId);
  if (!result) {
    return NextResponse.json(
      { error: "No prior run with specs found for this app" },
      { status: 404 },
    );
  }

  return NextResponse.json(result);
}
