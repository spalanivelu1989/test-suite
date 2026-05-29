import { NextResponse } from "next/server";
import { getRunManager } from "@/src/runManager/manager";

export const runtime = "nodejs";

/** POST /api/runs/[id]/cancel — stop an in-flight run (R8). */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const manager = getRunManager();
  const run = await manager.get(id);
  if (!run) {
    return NextResponse.json({ error: "run not found" }, { status: 404 });
  }

  const cancelled = manager.cancel(id);
  if (!cancelled) {
    // Already finished — nothing to stop. Report the terminal status so the UI
    // can reconcile instead of treating it as an error.
    return NextResponse.json({ status: run.status }, { status: 409 });
  }
  return NextResponse.json({ status: "cancelled" }, { status: 200 });
}
