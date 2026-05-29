import { NextResponse } from "next/server";
import { getRunManager } from "@/src/runManager/manager";

export const runtime = "nodejs";

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
