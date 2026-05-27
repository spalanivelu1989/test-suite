import { getRunStore } from "@/src/runStore/store";

export const runtime = "nodejs";

const POLL_MS = 400;
// Emit a comment line after this much silence so idle connections (long agent
// stages with few progress events) aren't killed by browser/proxy timeouts.
const HEARTBEAT_MS = 15_000;

/**
 * T17: SSE stream of a run's progress events (R8). Polls the shared in-memory
 * store and pushes new events as they arrive; closes when the run is terminal.
 * Each event carries an `id:` (its index) so a reconnecting EventSource resumes
 * from `Last-Event-ID` without replaying what it already has.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const store = getRunStore();
  if (!store.get(id)) {
    return new Response("run not found", { status: 404 });
  }

  const encoder = new TextEncoder();
  // Resume point: the client sends the last index it saw via Last-Event-ID.
  const resumeFrom = Number(request.headers.get("last-event-id"));
  let sent =
    Number.isInteger(resumeFrom) && resumeFrom >= 0 ? resumeFrom + 1 : 0;
  let timer: ReturnType<typeof setInterval>;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, data: unknown, eventId?: number) => {
        const idLine = eventId === undefined ? "" : `id: ${eventId}\n`;
        controller.enqueue(
          encoder.encode(
            `${idLine}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
          ),
        );
      };

      let lastWrite = Date.now();

      const tick = () => {
        const run = store.get(id);
        if (!run) {
          controller.close();
          clearInterval(timer);
          return;
        }
        for (; sent < run.events.length; sent++) {
          send("progress", run.events[sent], sent);
          lastWrite = Date.now();
        }
        if (
          run.status === "completed" ||
          run.status === "failed" ||
          run.status === "cancelled"
        ) {
          send("end", { status: run.status, error: run.error });
          controller.close();
          clearInterval(timer);
          return;
        }
        if (Date.now() - lastWrite >= HEARTBEAT_MS) {
          controller.enqueue(encoder.encode(`: ping\n\n`));
          lastWrite = Date.now();
        }
      };

      tick();
      timer = setInterval(tick, POLL_MS);
    },
    cancel() {
      clearInterval(timer);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
