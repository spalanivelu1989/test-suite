import type { Pool } from "pg";
import { normalizeOrigin } from "./appId";
import { buildGeneratorPack, buildPlannerPack } from "./assemble/contextPack";
import { type Embedder, LocalEmbedder } from "./embeddings/embed";
import { ingestRun as doIngest } from "./ingest/ingestRun";
import { getAppProfile, getCoverageMap } from "./retrieve/appProfile";
import { decideForSpecs } from "./retrieve/coverageDecision";
import { withKb } from "./safety";
import { closePool, getPool } from "./store/db";
import { findNearestSpecs, readSpecCode, readSpecsForApp } from "./store/repo";
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
  SpecMatch,
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
  async findSimilarSpecs(): Promise<SpecMatch[]> {
    return [];
  }
  async close() {}
}

class PgKnowledgeService implements KnowledgeService {
  readonly enabled = true;
  constructor(
    private url: string,
    private pool: Pool,
    private onEvent?: (e: KnowledgeEvent) => void,
    /** Phase 2: null disables semantic matching (lexical-only). */
    private embedder: Embedder | null = null,
  ) {}

  private onError = (op: string, message: string) =>
    this.onEvent?.({ kind: "error", op, message });

  appIdFor(url: string) {
    return normalizeOrigin(url);
  }

  /** Batch-embed texts best-effort; null per text when disabled or on failure. */
  private async embedTexts(texts: string[]): Promise<(number[] | null)[]> {
    if (!this.embedder || texts.length === 0) return texts.map(() => null);
    return withKb<(number[] | null)[]>(
      "embed",
      () => this.embedder!.embed(texts),
      texts.map(() => null),
      { onError: this.onError },
    );
  }

  /** Attach a semantic embedding to each scenario (best-effort). */
  private async withEmbeddings(
    scenarios: ScenarioInput[],
  ): Promise<ScenarioInput[]> {
    const embs = await this.embedTexts(scenarios.map((s) => s.name));
    return scenarios.map((s, i) => ({ ...s, embedding: embs[i] ?? undefined }));
  }

  async ingestRun(report: RunReport): Promise<void> {
    await withKb(
      "ingestRun",
      async () => {
        const { appId, flows } = await doIngest(
          this.pool,
          report,
          this.embedder ?? undefined,
        );
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
      async () => {
        const withEmb = await this.withEmbeddings(scenarios);
        const specs = await readSpecsForApp(this.pool, appId);
        return decideForSpecs(withEmb, specs);
      },
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
    // Generating: embed scenarios at query time, then hybrid-decide. Degrades
    // to lexical when the embedder is off/failing (withEmbeddings → null embs):
    //
    //   scenarios ─► withEmbeddings (best-effort)  ── embedder off/throws ─► embeddings = null
    //                       │                                                       │
    //                       ▼                                                       ▼
    //   readSpecsForApp(appId)  ─►  decideForSpecs(scenarios+emb, specs)  ─► (sem=0 ⇒ Phase-1 lexical)
    //                       ▼
    //   buildGeneratorPack(decisions, reused-spec code)  ─►  Generator prompt
    return withKb<ContextPack>(
      "assembleContext.generating",
      async () => {
        const appId = normalizeOrigin(url);
        const withEmb = await this.withEmbeddings(scenarios ?? []);
        const specRows = await readSpecsForApp(this.pool, appId);
        const decisions = decideForSpecs(withEmb, specRows);
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

  async findSimilarSpecs(
    query: string,
    appId: string,
    k: number,
  ): Promise<SpecMatch[]> {
    return withKb<SpecMatch[]>(
      "findSimilarSpecs",
      async () => {
        const [emb] = await this.embedTexts([query]);
        if (!emb) return [];
        return findNearestSpecs(this.pool, appId, emb, k);
      },
      [],
      { onError: this.onError },
    );
  }

  async close(): Promise<void> {
    await closePool(this.url);
  }
}

/** Build a KnowledgeService; Disabled (cold) when no database URL is configured. */
/** Resolve the embedder: explicit config wins; else local unless disabled by env. */
function resolveEmbedder(config: KnowledgeConfig): Embedder | null {
  if (config.embedder !== undefined) return config.embedder; // incl. null = off
  if (process.env.EMBEDDINGS_ENABLED === "false") return null;
  return new LocalEmbedder(process.env.EMBEDDING_MODEL || undefined);
}

export function createKnowledgeService(
  config: KnowledgeConfig = {},
): KnowledgeService {
  const url = config.databaseUrl ?? process.env.KNOWLEDGE_DATABASE_URL;
  if (!url) return new DisabledKnowledgeService(config.onEvent);
  return new PgKnowledgeService(
    url,
    getPool(url),
    config.onEvent,
    resolveEmbedder(config),
  );
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
export { REUSE_MARKER } from "./constants";
