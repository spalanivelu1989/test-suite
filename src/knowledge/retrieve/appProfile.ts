import type { Pool } from "pg";
import type { AppProfile, CoverageMap, FlowCoverage } from "../types";
import { readAppKnowledge, type FlowRow } from "../store/repo";

// Projections of the single AppKnowledge aggregate read (Plan: getAppProfile and
// getCoverageMap are projections, not two separate shallow queries).

function toFlowCoverage(rows: FlowRow[]): FlowCoverage[] {
  return rows.map((r) => ({
    flowId: r.flowId,
    name: r.name,
    tested: r.lastOutcome != null,
    lastOutcome: r.lastOutcome ?? undefined,
    lastRunId: r.lastRunId ?? undefined,
  }));
}

/** R6: what's known about an app from prior runs (null if nothing recorded). */
export async function getAppProfile(
  pool: Pool,
  appId: string,
  url: string,
): Promise<AppProfile | null> {
  const k = await readAppKnowledge(pool, appId);
  if (!k) return null;
  const flows = toFlowCoverage(k.flows);
  return {
    appId,
    url,
    knownPages: k.pages,
    flows,
    coveredFlows: flows.filter((f) => f.tested),
    gaps: flows.filter((f) => !f.tested),
    runCount: k.runCount,
  };
}

/** R7: covered vs uncovered known flows (null if nothing recorded). */
export async function getCoverageMap(
  pool: Pool,
  appId: string,
): Promise<CoverageMap | null> {
  const k = await readAppKnowledge(pool, appId);
  if (!k) return null;
  return {
    appId,
    covered: k.flows.filter((f) => f.lastOutcome != null).map((f) => f.name),
    uncovered: k.flows.filter((f) => f.lastOutcome == null).map((f) => f.name),
  };
}
