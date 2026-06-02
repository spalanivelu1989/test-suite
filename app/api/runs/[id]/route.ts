import { NextResponse } from "next/server";
import { getRunManager } from "@/src/runManager/manager";

export const runtime = "nodejs";

/**
 * GET /api/runs/[id] — the full run, including its progress `events`. The list
 * endpoint (GET /api/runs) strips events to keep the payload small, so the UI
 * uses this to populate the log panel for terminal runs (which no longer have a
 * live SSE stream). The Run Manager merges in-memory and disk state.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const run = await getRunManager().get(id);
  if (!run) {
    return NextResponse.json({ error: "run not found" }, { status: 404 });
  }
  return NextResponse.json(run);
}

/**
 * DELETE /api/runs/[id] — terminate child processes, remove from memory, and
 * purge disk files. The Run Manager owns all three; the route just maps the
 * outcome to a status code.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const removed = await getRunManager().remove(id);
    if (!removed) {
      return NextResponse.json({ error: "run not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error(`Failed to delete workspace directory for run ${id}:`, err);
    return NextResponse.json(
      { error: "failed to delete workspace" },
      { status: 500 },
    );
  }
}
