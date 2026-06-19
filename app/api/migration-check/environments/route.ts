import { NextResponse } from "next/server";
import {
  listEnvironments,
  saveEnvironment,
  slugify,
} from "@/src/migration/persistence";
import type { MigrationEnvironment } from "@/src/migration/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/migration-check/environments?appId=<optional> — saved target environments. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const appId = searchParams.get("appId");
  const all = await listEnvironments();
  const environments = appId ? all.filter((e) => e.sourceAppId === appId) : all;
  return NextResponse.json({ environments });
}

/** POST /api/migration-check/environments — save a target environment (no credentials stored). */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Body must be valid JSON" },
      { status: 400 },
    );
  }
  const b = body as Record<string, unknown>;
  if (typeof b.label !== "string" || !b.label.trim()) {
    return NextResponse.json({ error: "label is required" }, { status: 400 });
  }
  if (typeof b.sourceAppId !== "string" || typeof b.targetUrl !== "string") {
    return NextResponse.json(
      { error: "sourceAppId and targetUrl are required" },
      { status: 400 },
    );
  }
  const env: MigrationEnvironment = {
    id: slugify(`${b.sourceAppId}-${b.label}`),
    label: b.label,
    sourceAppId: b.sourceAppId,
    targetUrl: b.targetUrl,
    ...(typeof b.pathPrefix === "string" && b.pathPrefix.trim()
      ? { pathPrefix: b.pathPrefix }
      : {}),
    ...(typeof b.idp === "string" && b.idp.trim() ? { idp: b.idp } : {}),
    ...(typeof b.loginUrl === "string" && b.loginUrl.trim()
      ? { loginUrl: b.loginUrl }
      : {}),
  };
  await saveEnvironment(env);
  return NextResponse.json({ environment: env }, { status: 201 });
}
