import { NextResponse } from "next/server";
import { deleteEnvironment } from "@/src/migration/persistence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** DELETE /api/migration-check/environments/[id] — remove a saved environment. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const removed = await deleteEnvironment(id);
  if (!removed) {
    return NextResponse.json({ error: "Unknown environment" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
