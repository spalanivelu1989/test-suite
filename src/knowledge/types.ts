import type { RunReport } from "../types";

// Public contracts for the Knowledge Layer (Plan I1, I4, I6). The execution
// pipeline depends ONLY on these shapes — never on SQL, `pg`, or the schema.

/** A planned scenario the Generator is about to turn into a spec. */
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

/** Generator-facing half of a context pack. */
export interface GeneratorPack {
  decisions: CoverageDecision[];
  specs: SpecRef[];
}

/** Token-bounded knowledge injected into an agent prompt (I4). */
export interface ContextPack {
  /** Decisions + existing specs for the Generator. */
  generator?: GeneratorPack;
}

/** Progress signals surfaced to the run's event stream (no silent magic). */
export type KnowledgeEvent =
  | { kind: "ingested"; appId: string; runId: string; flows: number }
  | { kind: "decision"; reuse: number; new: number }
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
   * Planner as reference "memory", or null if none/disabled. NOT a coverage
   * decision: reuse remains the Generator's job; this only speeds re-planning.
   */
  getLastPlan(url: string): Promise<string | null>;
  /** Covered vs uncovered known flows, or null if nothing/disabled. */
  getCoverageMap(appId: string): Promise<CoverageMap | null>;
  /** Per-scenario reuse|new decisions (empty if disabled/cold). */
  planCoverageDecision(
    scenarios: ScenarioInput[],
    appId: string,
  ): Promise<CoverageDecision[]>;
  /** Build the Generator's coverage-decision context pack (empty if disabled). */
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
