import { NextResponse } from "next/server";
import {
  getMigrationReport,
  getMigrationStatus,
  removeMigration,
} from "@/src/migration/persistence";
import { abortRun, finishRun } from "@/src/migration/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/migration-check/[id] — the status, plus the full MigrationReport once
 * complete. 404 when unknown.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const status = await getMigrationStatus(id);
  if (!status) {
    return NextResponse.json(
      { error: "Unknown migration check" },
      { status: 404 },
    );
  }
  const report = await getMigrationReport(id);
  return NextResponse.json({ status, report });
}

/**
 * DELETE /api/migration-check/[id] — remove a saved migration check result.
 * If it's still running, it's aborted first, then its entire
 * `.migration-runs/<id>/` directory is purged from disk. 404 when unknown.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  // Stop any in-flight run before deleting its workspace from under it.
  abortRun(id);
  finishRun(id);
  const removed = await removeMigration(id);
  if (!removed) {
    return NextResponse.json(
      { error: "Unknown migration check" },
      { status: 404 },
    );
  }
  return NextResponse.json({ success: true });
}
