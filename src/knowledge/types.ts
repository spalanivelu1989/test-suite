import type { RunReport } from "../types";

// Public contracts for the Knowledge Layer (Plan I1, I4, I6). The execution
// pipeline depends ONLY on these shapes — never on SQL, `pg`, or the schema.

/** A planned scenario the Designer is about to turn into a spec. */
export interface ScenarioInput {
  /** Ordinal id like "1.1" when the plan has one; else absent. */
  id?: string;
  /** The scenario title/heading text. */
  name: string;
  /** Phase 2: semantic embedding of `name` (set by the service at query time). */
  embedding?: number[];
}

/** A spec returned by a semantic nearest-neighbor search (Phase 2, R6). */
export interface SpecMatch {
  runId: string;
  file: string;
  title: string | null;
  /** Cosine similarity to the query, 0..1. */
  score: number;
}

export type CoverageAction = "reuse" | "new";

// ─── Phase 3: Healing memory (ADR-0004) ──────────────────────────────────────

/** How the Evolver repaired a failing locator/assertion — a closed set (R2). */
export type HealStrategy =
  | "role-locator" // brittle selector → getByRole/getByLabel/getByText
  | "regex-text" // exact text → regex/partial match for dynamic content
  | "wait-visibility" // added explicit visibility/wait before interaction
  | "assertion-fix" // corrected an expectation/matcher
  | "fixme" // quarantined as test.fixme() (unfixable)
  | "other"; // a real change that fits none of the above

/**
 * One repair the Evolver made in a run, reconstructed deterministically by
 * diffing the pre-heal vs post-heal spec file (ADR-0004). Append-only evidence.
 */
export interface HealingEvent {
  runId: string;
  appId: string;
  flowId: string | null;
  file: string;
  /** Normalized failure signature (ids/lines/timestamps stripped) — R3. */
  failureSignature: string;
  /** The broken locator/line(s) from the diff. */
  before: string;
  /** The repaired line(s) from the diff. */
  after: string;
  strategy: HealStrategy;
  outcome: "healed" | "fixme";
  /** Lexical tokens of the signature, for hybrid match (set at extract). */
  tokens?: string[];
  /** Semantic embedding of the signature (set at ingest, best-effort) — R5. */
  embedding?: number[] | null;
}

/** A prior successful heal surfaced to the Evolver/Designer for reuse (R6). */
export interface HealingPrecedent {
  runId: string;
  file: string;
  flowId: string | null;
  failureSignature: string;
  strategy: HealStrategy;
  before: string;
  after: string;
  /** max(lexical, semantic) similarity to the query failure, 0..1. */
  score: number;
}

/** A failure to look up precedents for (R6). */
export interface FailureKey {
  signature: string;
  appId: string;
  flowId?: string | null;
  /** Optional semantic embedding of the signature (set by the service). */
  embedding?: number[] | null;
}

// ─── Phase 3: Playbooks (ADR-0005) ───────────────────────────────────────────

/** Where a distilled principle applies (R9/R12). */
export interface PlaybookScope {
  kind: "app" | "global" | "componentType";
  key: string;
}

/** Lifecycle of a distilled principle. Only `trusted` is ever injected (R11). */
export type PlaybookStatus = "episodic" | "trusted";

/**
 * A distilled, evidence-linked principle produced by the off-hot-path
 * distillation job (ADR-0005). Generated, never hand-curated (R14 provenance).
 */
export interface Playbook {
  id: string;
  scope: PlaybookScope;
  principle: string;
  antipattern?: string;
  recommendation: string;
  /** Run ids whose episodes support this principle (provenance, R14). */
  evidenceRunIds: string[];
  supportCount: number;
  confidence: number;
  status: PlaybookStatus;
  embedding?: number[] | null;
}

/** A reference to a previously generated spec (optionally with its source). */
export interface SpecRef {
  runId: string;
  file: string;
  title: string | null;
  flowId?: string;
  lastOutcome?: string;
  /** The spec source — populated when a `reuse` spec must be copied forward. */
  code?: string;
}

/** Per-scenario decision from `planCoverageDecision` (I6). */
export interface CoverageDecision {
  scenario: string;
  action: CoverageAction;
  /** Best-matching existing spec, when one drove the decision. */
  matchedSpec?: SpecRef;
  /** Overlap coefficient 0..1 against the matched spec/flow. */
  score: number;
  /** Outcome of the matched spec the last time it ran. */
  lastOutcome?: string;
}

/** Coverage of one flow as known from prior runs. */
export interface FlowCoverage {
  flowId: string;
  name: string;
  tested: boolean;
  lastOutcome?: string;
  lastRunId?: string;
}

/** Everything known about an app from prior runs (R6). */
export interface AppProfile {
  appId: string;
  url: string;
  knownPages: string[];
  flows: FlowCoverage[];
  coveredFlows: FlowCoverage[];
  gaps: FlowCoverage[];
  runCount: number;
}

/** Covered vs uncovered known flows for an app (R7). */
export interface CoverageMap {
  appId: string;
  covered: string[];
  uncovered: string[];
}

/** Designer-facing half of a context pack. */
export interface DesignerPack {
  decisions: CoverageDecision[];
  specs: SpecRef[];
  /** Phase 3: resilient-locator hints derived from past heals (R8). */
  locatorHints?: string[];
}

/** Evolver-facing half of a context pack — precedents for the run's failures (R7). */
export interface EvolverPack {
  precedents: HealingPrecedent[];
}

/** Token-bounded knowledge injected into an agent prompt (I4). */
export interface ContextPack {
  /** Decisions + existing specs for the Designer. */
  designer?: DesignerPack;
  /** Phase 3: healing precedents for the Evolver (R7). */
  evolver?: EvolverPack;
  /** Phase 3: trusted distilled principles for any stage (R12). */
  playbooks?: Playbook[];
}

/** Progress signals surfaced to the run's event stream (no silent magic). */
export type KnowledgeEvent =
  | { kind: "ingested"; appId: string; runId: string; flows: number }
  | { kind: "decision"; reuse: number; new: number }
  | { kind: "precedents"; failures: number; matched: number }
  | { kind: "playbooks"; injected: number }
  | { kind: "disabled"; reason: string }
  | { kind: "error"; op: string; message: string };

/**
 * The Knowledge Layer behind one small interface (R1). Every method is
 * best-effort and safe-defaulting: when the KB is disabled or unreachable it
 * returns empties and never throws (R4/N3), so callers need no error handling.
 */
export interface KnowledgeService {
  /** False when no database is configured — the pipeline then runs "cold". */
  readonly enabled: boolean;
  /** Normalize a URL to its app id (origin). */
  appIdFor(url: string): string;
  /** Ingest a completed run (idempotent by runId). */
  ingestRun(report: RunReport): Promise<void>;
  /** What we know about an app, or null if nothing/disabled. */
  getAppProfile(url: string): Promise<AppProfile | null>;
  /**
   * The most recent prior run's plan markdown for this app — passed to the
   * Discoverer as reference "memory", or null if none/disabled. NOT a coverage
   * decision: reuse remains the Designer's job; this only speeds re-planning.
   */
  getLastPlan(url: string): Promise<string | null>;
  /** Covered vs uncovered known flows, or null if nothing/disabled. */
  getCoverageMap(appId: string): Promise<CoverageMap | null>;
  /** Per-scenario reuse|new decisions (empty if disabled/cold). */
  planCoverageDecision(
    scenarios: ScenarioInput[],
    appId: string,
  ): Promise<CoverageDecision[]>;
  /** Build the Designer's coverage-decision context pack (empty if disabled). */
  assembleContext(
    url: string,
    scenarios?: ScenarioInput[],
  ): Promise<ContextPack>;
  /** Phase 2: k nearest specs to `query` by semantic similarity (R6). */
  findSimilarSpecs(
    query: string,
    appId: string,
    k: number,
  ): Promise<SpecMatch[]>;
  /**
   * Phase 3: top-k prior SUCCESSFUL heals for a similar failure, app-scoped,
   * via hybrid lexical-OR-semantic match (R6). Empty when disabled/cold.
   */
  getHealingPrecedents(
    failure: FailureKey,
    k?: number,
  ): Promise<HealingPrecedent[]>;
  /**
   * Phase 3: trusted distilled playbooks for a scope (R12). Only `trusted`
   * playbooks are ever returned; empty when disabled/cold.
   */
  getPlaybooks(scope: PlaybookScope): Promise<Playbook[]>;
  /** Release resources (pool). */
  close(): Promise<void>;
}

/** Config for the service factory. */
export interface KnowledgeConfig {
  /** Postgres URL; when absent the service is disabled (cold). */
  databaseUrl?: string;
  /** Sink for progress/telemetry events. */
  onEvent?: (e: KnowledgeEvent) => void;
  /**
   * Phase 2 embedder. Omit to use the local default; pass `null` to force
   * lexical-only; pass a fake in tests. (Typed loosely to avoid a type import
   * cycle — the runtime shape is `Embedder`.)
   */
  embedder?: import("./embeddings/embed").Embedder | null;
}

export type { RunReport };
