import type { Pool } from "pg";
import { norm } from "../../coverage/coverage";
import type { AppProfile, CoverageMap, FlowCoverage } from "../types";
import { type AppKnowledge, readAppKnowledge } from "../store/repo";

// Projections of the single AppKnowledge aggregate read (Plan: getAppProfile and
// getCoverageMap are projections, not two separate shallow queries).
//
// Flow rows are collapsed BY NAME: a curated flow id ("hero") and a tested
// result id ("hero cta") can carry the same name — a flow is "covered" if ANY of
// its rows was tested, so it never shows as both covered and a gap. The latest
// snapshot's missing_flows are merged in as gaps (the M1-aligned signal).

interface NameState {
  name: string;
  flowId: string;
  tested: boolean;
  lastOutcome?: string;
  lastRunId?: string;
}

function collapseByName(k: AppKnowledge): NameState[] {
  const byName = new Map<string, NameState>();
  const keyOf = (name: string) => norm(name);
  for (const r of k.flows) {
    const key = keyOf(r.name);
    const existing = byName.get(key);
    const tested = r.lastOutcome != null;
    if (!existing) {
      byName.set(key, {
        name: r.name,
        flowId: r.flowId,
        tested,
        lastOutcome: r.lastOutcome ?? undefined,
        lastRunId: r.lastRunId ?? undefined,
      });
    } else if (tested && !existing.tested) {
      existing.tested = true;
      existing.lastOutcome = r.lastOutcome ?? undefined;
      existing.lastRunId = r.lastRunId ?? undefined;
    }
  }
  // Merge snapshot gaps that aren't already a known (covered) flow.
  for (const name of k.missingFlows) {
    const key = keyOf(name);
    if (!byName.has(key)) byName.set(key, { name, flowId: key, tested: false });
  }
  return [...byName.values()];
}

function toFlowCoverage(s: NameState): FlowCoverage {
  return {
    flowId: s.flowId,
    name: s.name,
    tested: s.tested,
    lastOutcome: s.lastOutcome,
    lastRunId: s.lastRunId,
  };
}

/** R6: what's known about an app from prior runs (null if nothing recorded). */
export async function getAppProfile(
  pool: Pool,
  appId: string,
  url: string,
): Promise<AppProfile | null> {
  const k = await readAppKnowledge(pool, appId);
  if (!k) return null;
  const flows = collapseByName(k).map(toFlowCoverage);
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
  const flows = collapseByName(k);
  return {
    appId,
    covered: flows.filter((f) => f.tested).map((f) => f.name),
    uncovered: flows.filter((f) => !f.tested).map((f) => f.name),
  };
}
