import { createKnowledgeService } from "@/src/knowledge";
import { getRunManager } from "@/src/runManager/manager";

export const runtime = "nodejs";

/**
 * An app's knowledge-reuse trend (share of generated specs reused from prior runs,
 * over time) for the app this run targeted. App-scoped, sourced from the knowledge
 * layer — empty `[]` when the KB is disabled (cold) or the app has no runs yet, so
 * the UI hides the chart. Keyed off the run only to resolve its URL → appId.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const run = await getRunManager().get(id);
  if (!run) return new Response("run not found", { status: 404 });

  const url = run.report?.url ?? run.config.url;
  const knowledge = createKnowledgeService();
  const trend = await knowledge.getKnowledgeReuseTrend(url);

  return new Response(JSON.stringify({ enabled: knowledge.enabled, trend }), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
