import { getRunStore } from "@/src/runStore/store";

export const runtime = "nodejs";

const POLL_MS = 400;

/**
 * T17: SSE stream of a run's progress events (R8). Polls the shared in-memory
 * store and pushes new events as they arrive; closes when the run is terminal.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const store = getRunStore();
  if (!store.get(id)) {
    return new Response("run not found", { status: 404 });
  }

  const encoder = new TextEncoder();
  let sent = 0;
  let timer: ReturnType<typeof setInterval>;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      const tick = () => {
        const run = store.get(id);
        if (!run) {
          controller.close();
          clearInterval(timer);
          return;
        }
        for (; sent < run.events.length; sent++) {
          send("progress", run.events[sent]);
        }
        if (run.status === "completed" || run.status === "failed") {
          send("end", { status: run.status, error: run.error });
          controller.close();
          clearInterval(timer);
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
