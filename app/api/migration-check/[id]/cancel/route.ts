import { NextResponse } from "next/server";
import { abortRun } from "@/src/migration/registry";
import {
  getMigrationStatus,
  saveMigrationStatus,
} from "@/src/migration/persistence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/migration-check/[id]/cancel — stop a running migration check.
 * Aborts the run (kills the Playwright suite / Tester agent) and marks it
 * cancelled. The run's own handler also writes the terminal status, but we set
 * it here too so the UI flips immediately.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const aborted = abortRun(id);

  const status = await getMigrationStatus(id);
  if (status && status.status === "running") {
    await saveMigrationStatus({
      ...status,
      status: "cancelled",
      finishedAt: new Date().toISOString(),
    });
  }

  if (!aborted && (!status || status.status !== "running")) {
    return NextResponse.json(
      { error: "No running migration check with that id" },
      { status: 409 },
    );
  }
  return NextResponse.json({ status: "cancelling" });
}
