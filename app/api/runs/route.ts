import { NextResponse } from "next/server";
import { parseRunRequest } from "@/src/api/validation";
import { getRunManager } from "@/src/runManager/manager";

// Crawl + Playwright + Claude must run in the Node.js runtime (not edge).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/runs — list runs (in-memory + disk-persisted, merged by the Run
 * Manager so previous runs survive server restarts and live state stays freshest).
 */
export async function GET() {
  const runs = (await getRunManager().list())
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .map((run) => ({
      id: run.id,
      config: run.config,
      status: run.status,
      stage: run.stage,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
      error: run.error,
      report: run.report
        ? {
            successRate: run.report.successRate,
            results: run.report.results,
          }
        : undefined,
    }));
  return NextResponse.json({ runs });
}

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

  const runId = getRunManager().start(parsed.config);
  return NextResponse.json({ runId }, { status: 202 });
}
