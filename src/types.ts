// Shared domain model for the AI UI testing pipeline. Anchored here so every
// module (crawler, flows, generator, runner, reporter, store, API, UI) agrees on
// one vocabulary (CONTEXT.md). Builders implement the producers in later tasks.

/** User-supplied run configuration (R1). */
export interface RunConfig {
  url: string;
  /** Max crawl depth from the entry URL (R1 scope limit). */
  maxDepth?: number;
  /** Max number of pages to visit (R1 scope limit). */
  maxPages?: number;
}

/** Pipeline stages, in order. Drives progress events (R8) and SSE (T17). */
export type RunStage =
  | "queued"
  | "crawling"
  | "identifying"
  | "generating"
  | "running"
  | "flake-check"
  | "healing"
  | "reporting"
  | "done"
  | "error";

/** Coarse run lifecycle status. */
export type RunStatus = "pending" | "running" | "completed" | "failed";

/** One progress event streamed to the UI (R8). */
export interface ProgressEvent {
  at: string;
  stage: RunStage;
  message: string;
  data?: Record<string, unknown>;
}

/** A discovered page during crawl (R2). */
export interface CrawledPage {
  url: string;
  title: string;
  depth: number;
  links: string[];
  elements: PageElement[];
}

/** An interactive element extracted from a page (R2, T5b). */
export interface PageElement {
  role: string;
  label: string;
  selector: string;
}

/** Structured crawl output (R2). */
export interface CrawlResult {
  entryUrl: string;
  pages: CrawledPage[];
}

/** A candidate primary user flow identified by Claude (R2, T6). */
export interface Flow {
  id: string;
  name: string;
  steps: string[];
}

/** A generated Playwright test for a flow (R3, T7). */
export interface GeneratedTest {
  flowId: string;
  fileName: string;
  code: string;
  /** Set by T7b after parse/compile validation. */
  valid: boolean;
  validationError?: string;
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
  planMarkdown: string | null;
  generatedSpecs: { file: string; code: string }[];
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
