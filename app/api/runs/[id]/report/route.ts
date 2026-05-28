import { reportToJson } from "@/src/reporter/report";
import { renderHtml, renderMarkdown } from "@/src/reporter/render";
import { getRunStore } from "@/src/runStore/store";
import { listPersistedRuns } from "@/src/agents/workspace";

export const runtime = "nodejs";

/** T18: serve a completed run's report as JSON, Markdown, or HTML (R5, R11). */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let run = getRunStore().get(id);
  if (!run) {
    // Fall back to disk so previously-persisted runs survive server restart.
    const persisted = await listPersistedRuns();
    run = persisted.find((r) => r.id === id);
  }
  if (!run) return new Response("run not found", { status: 404 });
  if (!run.report) {
    return new Response("report not ready", { status: 409 });
  }

  const format = new URL(request.url).searchParams.get("format") ?? "json";
  switch (format) {
    case "md":
    case "markdown":
      return new Response(renderMarkdown(run.report), {
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Content-Disposition": `inline; filename="report-${id}.md"`,
        },
      });
    case "html":
      return new Response(renderHtml(run.report), {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Disposition": `inline; filename="report-${id}.html"`,
        },
      });
    case "json":
      return new Response(reportToJson(run.report), {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `inline; filename="report-${id}.json"`,
        },
      });
    default:
      return new Response(`unknown format: ${format}`, { status: 400 });
  }
}
