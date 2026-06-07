// Shared domain model for the AI UI testing pipeline. Anchored here so every
// module (crawler, flows, generator, runner, reporter, store, API, UI) agrees on
// one vocabulary (CONTEXT.md). Builders implement the producers in later tasks.

// Type-only import (erased at compile — no runtime cycle with knowledge/types).
import type { HealingEvent } from "./knowledge/types";

/**
 * Crawl strategy selected by the user in the Launch Wizard.
 * Drives both the depth of exploration and the expected test-scenario budget.
 *
 * | Mode        | Max depth | Scenarios / page |
 * |-------------|-----------|-----------------|
 * | direct      | 0         | 8               |
 * | standard    | 1         | 5               |
 * | deep        | 3         | 4               |
 * | aggressive  | 10 (unlimited) | 3           |
 */
export type CrawlMode = "direct" | "standard" | "deep" | "aggressive";

/** Numeric depth limit per crawl mode. Used in the Planner prompt. */
export const CRAWL_MODE_DEPTH: Record<CrawlMode, number> = {
  direct: 0,
  standard: 1,
  deep: 3,
  aggressive: 10,
};

/**
 * Expected number of test scenarios per page per crawl mode.
 * Used by the Generator to compute the scenario ceiling and scale maxTurns.
 */
export const CRAWL_MODE_SCENARIOS_PER_PAGE: Record<CrawlMode, number> = {
  direct: 8,
  standard: 5,
  deep: 4,
  aggressive: 3,
};

/**
 * Effective number of pages a run will actually exercise. `direct` mode tests
 * ONLY the entry page regardless of the user's "Maximum Crawl Pages" choice, so
 * its budget is always 1; every other mode honors the chosen `maxPages`. Used by
 * both the scenario-cap math (so "direct + 50 pages" no longer inflates the plan
 * to 400 scenarios) and the crawl gate, so the two always agree.
 */
export function effectivePageBudget(mode: CrawlMode, maxPages: number): number {
  if (mode === "direct") {
    return maxPages === 2 ? 1.5 : 1;
  }
  return maxPages;
}

/** Human-readable label for each crawl mode, displayed in the UI. */
export const CRAWL_MODE_LABEL: Record<CrawlMode, string> = {
  direct: "Direct page only (depth 0)",
  standard: "Standard depth (depth 1)",
  deep: "Deep crawl (depth 3)",
  aggressive: "Aggressive crawl (depth 10)",
};

/** User-supplied run configuration (R1). */
export interface RunConfig {
  url: string;
  /** Crawl strategy; replaces the old numeric maxDepth. Default: "standard". */
  crawlMode?: CrawlMode;
  /** Max number of pages to visit (R1 scope limit). Default: 10. */
  maxPages?: number;
}

/** Pipeline stages, in order. Drives progress events (R8) and SSE (T17). */
export type RunStage =
  | "queued"
  | "planning"
  | "generating"
  | "validating"
  | "running"
  | "flake-check"
  | "healing"
  | "reporting"
  | "done"
  | "cancelled"
  | "error";

/** Coarse run lifecycle status. */
export type RunStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

/** One progress event streamed to the UI (R8). */
export interface ProgressEvent {
  at: string;
  stage: RunStage;
  message: string;
  data?: Record<string, unknown>;
}

/** A primary user flow (kept for report metadata; produced by the Planner). */
export interface Flow {
  id: string;
  name: string;
  steps?: string[];
}

export type TestOutcome = "passed" | "failed" | "flaky" | "healed" | "fixme";

/** Result of executing one generated test (R4, R7, R9). */
export interface TestResult {
  flowId: string;
  fileName: string;
  outcome: TestOutcome;
  failureReason?: string;
  /** True when T9 saw divergent results across re-runs. */
  flaky?: boolean;
  /** Set by T10 when a locator failure was repaired. */
  healed?: boolean;
}

/** Coverage computation against the curated flow list (R2, M1). */
export interface CoverageSummary {
  curatedTotal: number;
  testedCount: number;
  /** 0–100, M1's formula. */
  percent: number;
  missingFlows: string[];
}

/**
 * Static-validation domain model. The Validation stage inspects each generated
 * spec's *source* (no browser, no LLM) for the four acceptance bars: structure/
 * correctness, meaningful assertions, robustness (not flaky), and relevance to
 * the plan. Produced by `src/validator/validate.ts`.
 */
export type ValidationCategory =
  | "correctness"
  | "assertion"
  | "robustness"
  | "relevance";

export type ValidationSeverity = "error" | "warning";

/** One issue found in a generated spec by a static rule. */
export interface ValidationFinding {
  /** Stable rule id, e.g. "no-assertions", "hard-wait", "brittle-selector". */
  rule: string;
  category: ValidationCategory;
  severity: ValidationSeverity;
  message: string;
  /** 1-based line in the spec source, when the rule can localize it. */
  line?: number;
}

/** Per-spec validation result. */
export interface SpecValidation {
  /** Spec path relative to the tests dir (as `readGeneratedSpecs` returns). */
  file: string;
  /** The `test('<title>')` title, or null if none was found. */
  title: string | null;
  /** Plan scenario this spec maps to (relevance), or null if it's an orphan. */
  matchedScenario: string | null;
  findings: ValidationFinding[];
  /** 0–100; starts at 100, penalized per finding. */
  score: number;
}

/** Suite-level validation report threaded onto the RunReport. */
export interface ValidationReport {
  specs: SpecValidation[];
  /** Plan scenarios with no corresponding spec (coverage gaps). */
  missingFlows: string[];
  /** Spec files that match no plan scenario (off-target tests). */
  orphanSpecs: string[];
  errorCount: number;
  warningCount: number;
  /** Overall 0–100. */
  score: number;
}

/** Success rate = passed ÷ all planned tests (Q7/D7). */
export interface SuccessRate {
  rate: number;
  passed: number;
  total: number;
}

/** A concrete fix prompt: a problem found and exactly what to change (R16). */
export interface FixPrompt {
  test: string;
  problem: string;
  change: string;
}

/** The canonical JSON report (R11). Markdown + HTML (R5) render from this. */
export interface RunReport {
  runId: string;
  url: string;
  generatedAt: string;
  flows: Flow[];
  results: TestResult[];
  coverage: CoverageSummary;
  flakeRate: number;
  healSuccessRate: number;
  claudeCallCount: number;
  // v0.2.0 rich-report additions (R16, R17)
  successRate: SuccessRate;
  fixPrompts: FixPrompt[];
  issues: string[];
  recommendations: string[];
  better?: string;
  recommendationsText?: string;
  summary?: string[];
  /** AI-generated prose paragraph synthesizing the run (above Results Breakdown). */
  testSummary?: string;
  planMarkdown: string | null;
  generatedSpecs: { file: string; code: string }[];
  screenshots?: { filename: string; base64: string }[];
  /** Static-validation results for the generated specs (Validation stage). */
  validation?: ValidationReport;
  /** Phase 3: heals captured by diffing pre/post-heal specs (ADR-0004). */
  healingEvents?: HealingEvent[];
}

/** A run as tracked by the in-memory store (R8). */
export interface Run {
  id: string;
  config: RunConfig;
  status: RunStatus;
  stage: RunStage;
  events: ProgressEvent[];
  createdAt: string;
  updatedAt: string;
  report?: RunReport;
  error?: string;
}
