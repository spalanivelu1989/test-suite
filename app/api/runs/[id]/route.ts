import { NextResponse } from "next/server";
import { getRunStore } from "@/src/runStore/store";
import { cancelRun } from "@/src/orchestrator/runService";
import { getRunsRoot } from "@/src/agents/workspace";
import { rm, stat } from "node:fs/promises";
import { join } from "node:path";

export const runtime = "nodejs";

/** DELETE /api/runs/[id] — terminate child processes, remove from store, and purge disk files. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const store = getRunStore();
  const run = store.get(id);

  // 1. Cancel the run if it's currently running to terminate subprocesses
  if (run && (run.status === "running" || run.status === "pending")) {
    cancelRun(id);
  }

  // 2. Remove from the in-memory store map (no-op if disk-only)
  store.remove(id);

  // 3. Remove the corresponding runs/id workspace directory from disk
  const runDir = join(getRunsRoot(), id);
  let existedOnDisk = false;
  try {
    await stat(runDir);
    existedOnDisk = true;
  } catch {
    /* nothing on disk */
  }

  if (!run && !existedOnDisk) {
    return NextResponse.json({ error: "run not found" }, { status: 404 });
  }

  if (existedOnDisk) {
    try {
      await rm(runDir, { recursive: true, force: true });
    } catch (err) {
      console.error(`Failed to delete workspace directory for run ${id}:`, err);
      return NextResponse.json(
        { error: "failed to delete workspace" },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ success: true }, { status: 200 });
}
