import { NextResponse } from "next/server";
import { parseRunRequest } from "@/src/api/validation";
import { startRun } from "@/src/orchestrator/runService";

// Crawl + Playwright + Claude must run in the Node.js runtime (not edge).
export const runtime = "nodejs";

/** T16: POST /api/runs — validate the request and start a run (R1, R8). */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON" },
      { status: 400 },
    );
  }

  const parsed = parseRunRequest(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const runId = startRun(parsed.config);
  return NextResponse.json({ runId }, { status: 202 });
}
