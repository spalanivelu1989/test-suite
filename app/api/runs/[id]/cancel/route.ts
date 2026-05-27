import { NextResponse } from "next/server";
import { getRunStore } from "@/src/runStore/store";
import { cancelRun } from "@/src/orchestrator/runService";

export const runtime = "nodejs";

/** POST /api/runs/[id]/cancel — stop an in-flight run (R8). */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const run = getRunStore().get(id);
  if (!run) {
    return NextResponse.json({ error: "run not found" }, { status: 404 });
  }

  const cancelled = cancelRun(id);
  if (!cancelled) {
    // Already finished — nothing to stop. Report the terminal status so the UI
    // can reconcile instead of treating it as an error.
    return NextResponse.json({ status: run.status }, { status: 409 });
  }
  return NextResponse.json({ status: "cancelled" }, { status: 200 });
}
