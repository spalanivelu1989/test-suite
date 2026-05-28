import { NextResponse } from "next/server";
import { parseRunRequest } from "@/src/api/validation";
import { startRun } from "@/src/orchestrator/runService";
import { getRunStore } from "@/src/runStore/store";
import { listPersistedRuns } from "@/src/agents/workspace";
import type { Run } from "@/src/types";

// Crawl + Playwright + Claude must run in the Node.js runtime (not edge).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/runs — list runs from the in-memory store merged with anything
 * persisted under .runs/ (so previous runs survive server restarts). In-memory
 * entries win on conflict because they hold the freshest state.
 */
export async function GET() {
  const store = getRunStore();
  const liveRuns = store.list();
  const persistedRuns = await listPersistedRuns();

  const byId = new Map<string, Run>();
  for (const r of persistedRuns) byId.set(r.id, r);
  for (const r of liveRuns) byId.set(r.id, r); // overwrite stale disk copy

  const runs = [...byId.values()]
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

  const runId = startRun(parsed.config);
  return NextResponse.json({ runId }, { status: 202 });
}

