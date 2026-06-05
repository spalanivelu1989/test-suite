import type { Pool } from "pg";
import { normalizeOrigin } from "./appId";
import { buildGeneratorPack, buildPlannerPack } from "./assemble/contextPack";
import { ingestRun as doIngest } from "./ingest/ingestRun";
import { getAppProfile, getCoverageMap } from "./retrieve/appProfile";
import { planCoverageDecision as doDecide } from "./retrieve/coverageDecision";
import { withKb } from "./safety";
import { closePool, getPool } from "./store/db";
import { readSpecCode } from "./store/repo";
import type {
  AppProfile,
  ContextPack,
  CoverageDecision,
  CoverageMap,
  KnowledgeConfig,
  KnowledgeEvent,
  KnowledgeService,
  KnowledgeStage,
  ScenarioInput,
  SpecRef,
} from "./types";
import type { RunReport } from "../types";

// Factory + the two implementations behind the KnowledgeService interface (R1).
// When no database URL is configured the Disabled impl is returned and the whole
// pipeline runs "cold" (R4) — callers never branch on availability themselves.

function newDecisions(scenarios: ScenarioInput[]): CoverageDecision[] {
  return scenarios.map((s) => ({ scenario: s.name, action: "new", score: 0 }));
}

function tally(decisions: CoverageDecision[]) {
  const t = { reuse: 0, extend: 0, new: 0 };
  for (const d of decisions) t[d.action]++;
  return t;
}

class DisabledKnowledgeService implements KnowledgeService {
  readonly enabled = false;
  constructor(private onEvent?: (e: KnowledgeEvent) => void) {
    onEvent?.({ kind: "disabled", reason: "no KNOWLEDGE_DATABASE_URL" });
  }
  appIdFor(url: string) {
    return normalizeOrigin(url);
  }
  async ingestRun() {}
  async getAppProfile() {
    return null;
  }
  async getCoverageMap() {
    return null;
  }
  async planCoverageDecision(scenarios: ScenarioInput[]) {
    return newDecisions(scenarios);
  }
  async assembleContext(): Promise<ContextPack> {
    return {};
  }
  async close() {}
}

class PgKnowledgeService implements KnowledgeService {
  readonly enabled = true;
  constructor(
    private url: string,
    private pool: Pool,
    private onEvent?: (e: KnowledgeEvent) => void,
  ) {}

  private onError = (op: string, message: string) =>
    this.onEvent?.({ kind: "error", op, message });

  appIdFor(url: string) {
    return normalizeOrigin(url);
  }

  async ingestRun(report: RunReport): Promise<void> {
    await withKb(
      "ingestRun",
      async () => {
        const { appId, flows } = await doIngest(this.pool, report);
        this.onEvent?.({ kind: "ingested", appId, runId: report.runId, flows });
      },
      undefined,
      { onError: this.onError },
    );
  }

  async getAppProfile(url: string): Promise<AppProfile | null> {
    return withKb(
      "getAppProfile",
      () => getAppProfile(this.pool, normalizeOrigin(url), url),
      null,
      { onError: this.onError },
    );
  }

  async getCoverageMap(appId: string): Promise<CoverageMap | null> {
    return withKb(
      "getCoverageMap",
      () => getCoverageMap(this.pool, appId),
      null,
      {
        onError: this.onError,
      },
    );
  }

  async planCoverageDecision(
    scenarios: ScenarioInput[],
    appId: string,
  ): Promise<CoverageDecision[]> {
    return withKb(
      "planCoverageDecision",
      () => doDecide(this.pool, appId, scenarios),
      newDecisions(scenarios),
      { onError: this.onError },
    );
  }

  async assembleContext(
    stage: KnowledgeStage,
    url: string,
    scenarios?: ScenarioInput[],
  ): Promise<ContextPack> {
    if (stage === "planning") {
      return withKb(
        "assembleContext.planning",
        async () => {
          const profile = await getAppProfile(
            this.pool,
            normalizeOrigin(url),
            url,
          );
          if (!profile || profile.flows.length === 0) return {};
          this.onEvent?.({
            kind: "loaded",
            appId: profile.appId,
            knownFlows: profile.coveredFlows.length,
            gaps: profile.gaps.length,
          });
          return { planner: buildPlannerPack(profile) };
        },
        {},
        { onError: this.onError },
      );
    }
    return withKb<ContextPack>(
      "assembleContext.generating",
      async () => {
        const appId = normalizeOrigin(url);
        const decisions = await doDecide(this.pool, appId, scenarios ?? []);
        const specs = await this.collectSpecRefs(decisions);
        this.onEvent?.({ kind: "decision", ...tally(decisions) });
        return { generator: buildGeneratorPack(decisions, specs) };
      },
      {},
      { onError: this.onError },
    );
  }

  /** Gather matched specs; fetch source for `reuse` ones so they can be copied (D4). */
  private async collectSpecRefs(
    decisions: CoverageDecision[],
  ): Promise<SpecRef[]> {
    const seen = new Set<string>();
    const refs: SpecRef[] = [];
    for (const d of decisions) {
      if (!d.matchedSpec) continue;
      const key = `${d.matchedSpec.runId}:${d.matchedSpec.file}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const code =
        d.action === "reuse"
          ? ((await readSpecCode(
              this.pool,
              d.matchedSpec.runId,
              d.matchedSpec.file,
            )) ?? undefined)
          : undefined;
      refs.push({ ...d.matchedSpec, code });
    }
    return refs;
  }

  async close(): Promise<void> {
    await closePool(this.url);
  }
}

/** Build a KnowledgeService; Disabled (cold) when no database URL is configured. */
export function createKnowledgeService(
  config: KnowledgeConfig = {},
): KnowledgeService {
  const url = config.databaseUrl ?? process.env.KNOWLEDGE_DATABASE_URL;
  if (!url) return new DisabledKnowledgeService(config.onEvent);
  return new PgKnowledgeService(url, getPool(url), config.onEvent);
}

export type {
  KnowledgeService,
  KnowledgeConfig,
  KnowledgeEvent,
  ContextPack,
  CoverageDecision,
  AppProfile,
  CoverageMap,
  ScenarioInput,
  SpecRef,
} from "./types";
