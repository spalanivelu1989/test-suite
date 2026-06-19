import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  MigrationAbortedError,
  runMigrationCheck,
} from "@/src/migration/runMigrationCheck";
import {
  getMigrationReport,
  listMigrationStatuses,
  saveMigrationStatus,
} from "@/src/migration/persistence";
import { finishRun, registerRun } from "@/src/migration/registry";
import { parseMigrationRequest } from "@/src/migration/validate";
import type { MigrationEvent } from "@/src/migration/types";

// Playwright + auth run in the Node.js runtime (not edge).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/migration-check — list saved migration checks (newest first). For
 * completed checks the report `summary` (outcome counts) is attached so the
 * history list can show regressions at a glance; the heavy progress `events`
 * log and full report are dropped to keep the payload small.
 */
export async function GET() {
  const statuses = await listMigrationStatuses();
  const checks = await Promise.all(
    statuses.map(async ({ events: _events, ...status }) => {
      if (status.status !== "completed") return status;
      const report = await getMigrationReport(status.id);
      return { ...status, summary: report?.summary, hasReport: !!report };
    }),
  );
  return NextResponse.json({ checks });
}

/**
 * POST /api/migration-check — validate and start a migration check in the
 * background. Returns the id immediately; poll /api/migration-check/[id].
 */
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

  const parsed = parseMigrationRequest(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const id = `mig-${randomUUID()}`;
  const startedAt = new Date().toISOString();
  const events: MigrationEvent[] = [];
  const base = {
    id,
    sourceUrl: parsed.req.sourceUrl,
    targetUrl: parsed.req.targetUrl,
    startedAt,
  };

  // Serialize status writes through one chain so they apply in enqueue order.
  // Otherwise a fire-and-forget "running" write from the final event could land
  // AFTER the terminal "completed" write and revert the status — leaving the UI
  // polling a run that actually finished.
  let writeChain: Promise<void> = Promise.resolve();
  const persist = (
    s: Parameters<typeof saveMigrationStatus>[0],
  ): Promise<void> => {
    writeChain = writeChain.then(() => saveMigrationStatus(s));
    return writeChain;
  };

  await persist({ ...base, status: "running", events });

  // Registered so a cancel request from another route can abort this run.
  const abortController = registerRun(id);

  // Fire-and-forget; the run persists its own report + status on completion.
  void (async () => {
    try {
      await runMigrationCheck(parsed.req, {
        newId: () => id,
        abortController,
        onEvent: ({ step, message }) => {
          events.push({ at: new Date().toISOString(), step, message });
          // Live progress; enqueued on the same chain so it can't outrace the end.
          void persist({ ...base, status: "running", events: [...events] });
        },
      });
      await persist({
        ...base,
        status: "completed",
        finishedAt: new Date().toISOString(),
        events: [...events],
      });
    } catch (err) {
      const cancelled =
        err instanceof MigrationAbortedError || abortController.signal.aborted;
      events.push({
        at: new Date().toISOString(),
        step: cancelled ? "done" : "error",
        message: cancelled
          ? "Migration check stopped by user."
          : err instanceof Error
            ? err.message
            : String(err),
      });
      await persist({
        ...base,
        status: cancelled ? "cancelled" : "failed",
        finishedAt: new Date().toISOString(),
        ...(cancelled
          ? {}
          : { error: err instanceof Error ? err.message : String(err) }),
        events: [...events],
      });
    } finally {
      finishRun(id);
    }
  })();

  return NextResponse.json({ id }, { status: 202 });
}
