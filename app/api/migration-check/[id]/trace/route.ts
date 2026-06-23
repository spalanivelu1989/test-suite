import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { findTracePath } from "@/src/migration/trace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The Playwright Trace Viewer (https://trace.playwright.dev) loads the trace
// client-side from the user's browser, so the response must be CORS-readable by
// that origin. The user's browser can already reach this server (it's serving
// the dashboard), so a permissive read-only allowance is enough.
const CORS = { "Access-Control-Allow-Origin": "*" } as const;

/** Only our own run ids — never let a path segment escape `.migration-runs/`. */
const VALID_ID = /^mig-[A-Za-z0-9-]+$/;

/**
 * GET /api/migration-check/[id]/trace?file=<spec basename> — stream the
 * Playwright trace.zip retained for one failed spec, so the dashboard can open
 * it in the Trace Viewer. 404 when the run kept no trace for that spec (it
 * passed, or the suite never ran).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!VALID_ID.test(id)) {
    return NextResponse.json(
      { error: "Invalid migration id" },
      { status: 400, headers: CORS },
    );
  }
  const file = new URL(request.url).searchParams.get("file");
  if (!file) {
    return NextResponse.json(
      { error: "file query param is required" },
      { status: 400, headers: CORS },
    );
  }

  const tracePath = await findTracePath(id, file);
  if (!tracePath) {
    return NextResponse.json(
      { error: "No trace was captured for this spec" },
      { status: 404, headers: CORS },
    );
  }

  let zip: Buffer;
  try {
    zip = await readFile(tracePath);
  } catch {
    return NextResponse.json(
      { error: "Trace file is no longer available" },
      { status: 404, headers: CORS },
    );
  }

  return new NextResponse(new Uint8Array(zip), {
    status: 200,
    headers: {
      ...CORS,
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${file}.trace.zip"`,
      "Cache-Control": "no-store",
    },
  });
}

/** Preflight for cross-origin fetches from the Trace Viewer. */
export function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      ...CORS,
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  });
}
