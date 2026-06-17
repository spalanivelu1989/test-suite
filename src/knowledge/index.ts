import type { Pool } from "pg";
import { normalizeOrigin } from "./appId";
import { buildDesignerPack } from "./assemble/contextPack";
import { patternTextFor } from "./embeddings/abstractIntent";
import { type Embedder, LocalEmbedder } from "./embeddings/embed";
import { ingestRun as doIngest } from "./ingest/ingestRun";
import { signatureTokens } from "./heal/signature";
import { getAppProfile, getCoverageMap } from "./retrieve/appProfile";
import {
  decideForSpecs,
  REUSE_THRESHOLD,
  SEM_REUSE,
} from "./retrieve/coverageDecision";
import {
  mergePatternHints,
  scenariosNeedingPatterns,
  selectGlobalPatterns,
  PATTERN_BUDGET,
  PATTERN_K,
  PATTERN_RELEVANCE,
} from "./retrieve/globalPatterns";
import {
  deriveLocatorHints,
  selectPrecedents,
  PRECEDENT_THRESHOLD,
} from "./retrieve/healingPrecedents";
import { withKb } from "./safety";
import { databaseName, isTestDatabase, isTestRunId } from "./store/testDbGuard";
import { closePool, getPool } from "./store/db";
import {
  findGlobalPatternSpecs,
  findNearestSpecs,
  readHealProvenanceTrend,
  readKnowledgeReuseTrend,
  readLastPlan,
  readSpecCode,
  readSpecsForApp,
  readSuccessfulHealingEvents,
  readTrustedPlaybooks,
} from "./store/repo";
import type {
  AppProfile,
  ContextPack,
  CoverageDecision,
  CoverageMap,
  FailureKey,
  HealingPrecedent,
  HealTrendPoint,
  KnowledgeConfig,
  KnowledgeReuseTrendPoint,
  KnowledgeEvent,
  KnowledgeService,
  PatternHint,
  Playbook,
  PlaybookScope,
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
  const t = { reuse: 0, new: 0 };
  for (const d of decisions) t[d.action]++;
  return t;
}

// ── Span-IO helpers ──────────────────────────────────────────────────────────
// Keep retrieval-span input/output payload-safe: round scores, clip free text,
// and cap how many matched rows we attach (IDs + scores only, never bodies).
const SPAN_MATCH_CAP = 8;
const round2 = (n: number) => Math.round(n * 100) / 100;
const clip = (s: string, max = 80) =>
  s.length <= max ? s : s.slice(0, max) + "…";

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
  async getLastPlan() {
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
  async getHealingPrecedents(): Promise<HealingPrecedent[]> {
    return [];
  }
  async getPlaybooks(): Promise<Playbook[]> {
    return [];
  }
  async getHealProvenanceTrend(): Promise<HealTrendPoint[]> {
    return [];
  }
  async getKnowledgeReuseTrend(): Promise<KnowledgeReuseTrendPoint[]> {
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
    // Last-line safety: never let a synthetic `test-<uuid>` run land in a real
    // knowledge DB. `test:unit` carries no env-file isolation, so a unit test
    // that calls runPipeline() without injecting a no-op service would otherwise
    // ingest fixtures into whatever KNOWLEDGE_DATABASE_URL is exported. Skip
    // loudly instead of silently polluting; a *test* DB still ingests freely so
    // the integration suites keep working.
    if (isTestRunId(report.runId) && !isTestDatabase(this.url)) {
      this.onEvent?.({
        kind: "skipped",
        op: "ingestRun",
        reason: `refusing to persist test run "${report.runId}" into non-test database "${databaseName(this.url)}"`,
      });
      return;
    }
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

  async getLastPlan(url: string): Promise<string | null> {
    return withKb(
      "getLastPlan",
      () => readLastPlan(this.pool, normalizeOrigin(url)),
      null,
      {
        onError: this.onError,
        input: { tier: "plan-memory", appId: normalizeOrigin(url) },
        summarize: (plan) => ({ found: !!plan, chars: plan ? plan.length : 0 }),
      },
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
      {
        onError: this.onError,
        input: {
          tier: "app-scoped-reuse",
          appId,
          scenarios: scenarios.length,
          topK: "all",
          matching: this.embedder ? "hybrid(semantic+lexical)" : "lexical-only",
          thresholds: { semantic: SEM_REUSE, lexical: REUSE_THRESHOLD },
        },
        summarize: (decisions) => ({
          ...tally(decisions),
          decision: decisions.some((d) => d.action === "reuse")
            ? "REUSE"
            : "none",
          matches: decisions
            .filter((d) => d.action === "reuse")
            .slice(0, SPAN_MATCH_CAP)
            .map((d) => ({
              scenario: clip(d.scenario),
              score: round2(d.score),
              file: d.matchedSpec?.file ?? null,
              runId: d.matchedSpec?.runId ?? null,
              lastOutcome: d.lastOutcome ?? null,
            })),
        }),
      },
    );
  }

  async assembleContext(
    url: string,
    scenarios?: ScenarioInput[],
  ): Promise<ContextPack> {
    // Designer-only: the Discoverer is KB-agnostic, so the sole context pack the
    // Knowledge Layer assembles is the Designer's coverage decision.
    // Embed scenarios at query time, then hybrid-decide. Degrades
    // to lexical when the embedder is off/failing (withEmbeddings → null embs):
    //
    //   scenarios ─► withEmbeddings (best-effort)  ── embedder off/throws ─► embeddings = null
    //                       │                                                       │
    //                       ▼                                                       ▼
    //   readSpecsForApp(appId)  ─►  decideForSpecs(scenarios+emb, specs)  ─► (sem=0 ⇒ Phase-1 lexical)
    //                       ▼
    //   buildDesignerPack(decisions, full reused-spec source)  ─►  copy-forward
    return withKb<ContextPack>(
      "assembleContext.generating",
      async () => {
        const appId = normalizeOrigin(url);
        const withEmb = await this.withEmbeddings(scenarios ?? []);
        const specRows = await readSpecsForApp(this.pool, appId);
        const decisions = decideForSpecs(withEmb, specRows);
        const specs = await this.collectSpecRefs(decisions);
        this.onEvent?.({ kind: "decision", ...tally(decisions) });
        // Phase 3: resilient-locator hints from this app's past heals (R8).
        const heals = await readSuccessfulHealingEvents(this.pool, appId, null);
        const locatorHints = deriveLocatorHints(heals);
        const pack = buildDesignerPack(decisions, specs);
        // PROTOTYPE: cross-app workflow patterns for the `new` scenarios
        // (flagged off by default → additive, byte-identical when disabled).
        const patterns = await this.globalPatterns(appId, decisions, withEmb);
        // Phase 3: trusted distilled principles, global + app-scoped (R12).
        const playbooks = await this.trustedPlaybooks(appId);
        const designer =
          locatorHints.length || patterns.length
            ? {
                ...pack,
                ...(locatorHints.length ? { locatorHints } : {}),
                ...(patterns.length ? { patterns } : {}),
              }
            : pack;
        return {
          designer,
          ...(playbooks.length ? { playbooks } : {}),
        };
      },
      {},
      {
        onError: this.onError,
        input: {
          tier: "app-scoped-reuse",
          appId: normalizeOrigin(url),
          scenarios: scenarios?.length ?? 0,
          topK: "all",
          matching: this.embedder ? "hybrid(semantic+lexical)" : "lexical-only",
          thresholds: { semantic: SEM_REUSE, lexical: REUSE_THRESHOLD },
          globalPatternsEnabled:
            process.env.KNOWLEDGE_GLOBAL_PATTERNS === "true",
        },
        summarize: (pack) => {
          const decisions = pack.designer?.decisions ?? [];
          return {
            ...tally(decisions),
            decision: decisions.some((d) => d.action === "reuse")
              ? "REUSE"
              : "NEW",
            locatorHints: pack.designer?.locatorHints?.length ?? 0,
            patterns: pack.designer?.patterns?.length ?? 0,
            playbooks: pack.playbooks?.length ?? 0,
            matches: decisions
              .filter((d) => d.action === "reuse")
              .slice(0, SPAN_MATCH_CAP)
              .map((d) => ({
                scenario: clip(d.scenario),
                score: round2(d.score),
                file: d.matchedSpec?.file ?? null,
                runId: d.matchedSpec?.runId ?? null,
                lastOutcome: d.lastOutcome ?? null,
              })),
          };
        },
      },
    );
  }

  /**
   * PROTOTYPE — Global pattern-retrieval tier. For each scenario decided `new`,
   * find similar PASSING scenarios on OTHER apps (cross-app HNSW) and return them
   * as advisory pattern hints. Gated by KNOWLEDGE_GLOBAL_PATTERNS (default off) so
   * it's strictly additive. Embedder-dependent: lexical-only mode yields nothing.
   * Best-effort — a failed neighbor read drops to [] without touching decisions.
   */
  private async globalPatterns(
    appId: string,
    decisions: CoverageDecision[],
    withEmb: ScenarioInput[],
  ): Promise<PatternHint[]> {
    if (process.env.KNOWLEDGE_GLOBAL_PATTERNS !== "true") return [];
    const targets = scenariosNeedingPatterns(decisions, withEmb);
    if (targets.length === 0) return [];
    // Best-effort: a failed neighbor read degrades to [] WITHOUT discarding the
    // (valuable) reuse decisions assembleContext already computed.
    return withKb<PatternHint[]>(
      "globalPatterns",
      async () => {
        // Query the ABSTRACTED space: re-embed each scenario name with the same
        // entity-stripping used for pattern_embedding (sc.embedding is the raw
        // name vector, which lives in the concrete space — wrong for this tier).
        const patternEmbs = await this.embedTexts(
          targets.map((sc) => patternTextFor(sc.name)),
        );
        const perScenario = await Promise.all(
          targets.map(async (sc, i) => {
            const emb = patternEmbs[i];
            if (!emb) return [];
            const rows = await findGlobalPatternSpecs(
              this.pool,
              appId,
              emb,
              PATTERN_K,
            );
            return selectGlobalPatterns(sc.name, rows);
          }),
        );
        const hints = mergePatternHints(perScenario);
        this.onEvent?.({
          kind: "patterns",
          scenarios: targets.length,
          hints: hints.length,
        });
        return hints;
      },
      [],
      {
        onError: this.onError,
        input: {
          tier: "global-pattern",
          excludeAppId: appId,
          scenarios: targets.length,
          topKPerScenario: PATTERN_K,
          budget: PATTERN_BUDGET,
          threshold: PATTERN_RELEVANCE,
        },
        summarize: (hints) => ({
          hints: hints.length,
          decision: hints.length ? "PATTERN" : "none",
          matches: hints.slice(0, SPAN_MATCH_CAP).map((h) => ({
            scenario: clip(h.scenario),
            patternTitle: clip(h.patternTitle),
            sourceApp: h.sourceApp,
            score: round2(h.score),
          })),
        }),
      },
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
      {
        onError: this.onError,
        input: {
          tier: "semantic-search",
          appId,
          k,
          query: clip(query, 200),
        },
        summarize: (matches) => ({
          matches: matches.length,
          top: matches.slice(0, SPAN_MATCH_CAP).map((m) => ({
            file: m.file,
            score: round2(m.score),
            runId: m.runId,
          })),
        }),
      },
    );
  }

  async getHealingPrecedents(
    failure: FailureKey,
    k = 3,
  ): Promise<HealingPrecedent[]> {
    return withKb<HealingPrecedent[]>(
      "getHealingPrecedents",
      async () => {
        // Embed the query signature (best-effort), let HNSW narrow candidates,
        // then the pure selectPrecedents does the hybrid scoring (D7).
        const [emb] = await this.embedTexts([failure.signature]);
        const candidates = await readSuccessfulHealingEvents(
          this.pool,
          failure.appId,
          emb,
        );
        const precedents = selectPrecedents(
          { tokens: signatureTokens(failure.signature), embedding: emb },
          candidates,
          { k },
        );
        this.onEvent?.({
          kind: "precedents",
          failures: 1,
          matched: precedents.length,
        });
        return precedents;
      },
      [],
      {
        onError: this.onError,
        input: {
          tier: "healing-precedent",
          appId: failure.appId,
          k,
          threshold: PRECEDENT_THRESHOLD,
          matching: this.embedder ? "hybrid(semantic+lexical)" : "lexical-only",
          signature: clip(failure.signature, 200),
        },
        summarize: (precedents) => ({
          precedents: precedents.length,
          decision: precedents.length ? "PRECEDENT" : "none",
          matches: precedents.slice(0, SPAN_MATCH_CAP).map((p) => ({
            file: p.file,
            flowId: p.flowId,
            strategy: p.strategy,
            score: round2(p.score),
          })),
        }),
      },
    );
  }

  async getPlaybooks(scope: PlaybookScope): Promise<Playbook[]> {
    return withKb<Playbook[]>(
      "getPlaybooks",
      () => readTrustedPlaybooks(this.pool, scope),
      [],
      {
        onError: this.onError,
        input: { tier: "playbook", scope: `${scope.kind}:${scope.key}` },
        summarize: (playbooks) => ({
          playbooks: playbooks.length,
          principles: playbooks
            .slice(0, SPAN_MATCH_CAP)
            .map((p) => clip(p.principle, 100)),
        }),
      },
    );
  }

  async getHealProvenanceTrend(
    url: string,
    limit = 50,
  ): Promise<HealTrendPoint[]> {
    return withKb<HealTrendPoint[]>(
      "getHealProvenanceTrend",
      () => readHealProvenanceTrend(this.pool, normalizeOrigin(url), limit),
      [],
      {
        onError: this.onError,
        input: { appId: normalizeOrigin(url), limit },
        summarize: (trend) => ({ points: trend.length }),
      },
    );
  }

  async getKnowledgeReuseTrend(
    url: string,
    limit = 50,
  ): Promise<KnowledgeReuseTrendPoint[]> {
    return withKb<KnowledgeReuseTrendPoint[]>(
      "getKnowledgeReuseTrend",
      () => readKnowledgeReuseTrend(this.pool, normalizeOrigin(url), limit),
      [],
      {
        onError: this.onError,
        input: { appId: normalizeOrigin(url), limit },
        summarize: (trend) => ({ points: trend.length }),
      },
    );
  }

  /** Global (cross-app heal lessons) + this app's procedural playbooks (R12). */
  private async trustedPlaybooks(appId: string): Promise<Playbook[]> {
    const [global, app] = await Promise.all([
      readTrustedPlaybooks(this.pool, { kind: "global", key: "all" }),
      readTrustedPlaybooks(this.pool, { kind: "app", key: appId }),
    ]);
    return [...global, ...app];
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
