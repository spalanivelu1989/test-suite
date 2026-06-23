// Migration Check — additive feature. Carries an app's existing, proven specs to
// a new deployment of the SAME app (pure rehost, e.g. Lovable → SAP BTP) and
// reports a before/after diff. See docs/migration-check-plan.md.
//
// This module is intentionally isolated: it reuses existing pipeline helpers as
// library calls but never modifies the normal run flow.

import type { RunReport } from "../types";

/** A prior-tested app discovered from existing runs, offered as a migration source. */
export interface SourceApp {
  /** Normalized origin (app id), e.g. "https://roi-calculator.lovable.app". */
  appId: string;
  /** A representative URL actually used in a run for this app. */
  url: string;
  runCount: number;
  /** ISO timestamp of the most recent run for this app, if known. */
  lastRunAt: string | null;
}

/** One existing spec from a source run, eligible to carry over. */
export interface SourceSpec {
  file: string;
  title: string | null;
  /** The spec source as run on the source app (pre origin-rewrite). */
  code: string;
  /** Outcome of this spec on the source app — the trust signal we surface (NOT a similarity score). */
  sourceOutcome: SpecOutcome;
}

export type SpecOutcome = "passed" | "failed" | "healed" | "unknown";

export interface MigrationCheckRequest {
  /** A URL of the source app (Lovable). Used to resolve the source app id. */
  sourceUrl: string;
  /** Which prior run to clone specs from. Defaults to the latest completed run for the app. */
  sourceRunId?: string;
  /** The new deployment to validate (SAP BTP). */
  targetUrl: string;
  /**
   * Optional path the target serves the app under (e.g. "/myapp" behind a BTP
   * approuter route). Prepended to every rewritten in-app URL.
   */
  pathPrefix?: string;
  /** Which source spec files to carry over. */
  selectedSpecFiles: string[];
  /**
   * Per-spec code overrides, keyed by spec file basename. When a selected spec has
   * an override, the runner writes that exact code into the workspace verbatim
   * (no origin rewrite) instead of cloning + rewriting the source spec. Used by the
   * dashboard "edit the target code and re-run" flow — the edited code already
   * targets the target deployment, so it is run as-is.
   */
  specOverrides?: Record<string, string>;
  /**
   * Login for the target, if it needs one. Omit entirely (or leave
   * username/password blank) for deployments that don't require auth — the run
   * then skips login setup. The env contract global-setup.ts already reads.
   */
  auth?: {
    username?: string;
    password?: string;
    idp?: string;
    loginUrl?: string;
  };
  options?: {
    /** Report-first by default: do NOT run the Tester, so regressions aren't papered over. */
    heal?: boolean;
    /** Rerun count for flake separation. Default 2. */
    reruns?: number;
    /** Compare build fingerprints (hashed assets) to confirm it's the same build. Default true. */
    fingerprintCheck?: boolean;
  };
}

export type SpecClassification =
  | "ok" // passed on target — migration-safe
  | "healed" // passed only after an automated fix — the test didn't transfer as-is; review
  | "flaky" // inconsistent across reruns — not a trustworthy signal
  | "infra" // failed for login/timeout/network reasons — ignore
  | "behavioral" // passed on source, fails consistently on target — REAL regression
  | "pre-existing"; // failed on source too — not introduced by the migration

export interface SpecDiff {
  file: string;
  title: string | null;
  sourceOutcome: SpecOutcome;
  targetOutcome: "passed" | "failed" | "flaky";
  classification: SpecClassification;
  failureReason?: string;
}

export interface FingerprintResult {
  status: "match" | "mismatch" | "skipped" | "error";
  /** Number of hashed asset tokens shared between source and target builds. */
  sharedAssetCount: number;
  detail?: string;
}

export interface MigrationReport {
  id: string;
  sourceUrl: string;
  targetUrl: string;
  /** Approuter path prefix the target was checked under, if any — preserved so a
   * re-run from a saved report reconstructs the exact same request. */
  pathPrefix?: string;
  sourceRunId: string;
  generatedAt: string;
  fingerprint: FingerprintResult;
  /**
   * Set when the suite couldn't run at all (e.g. login/global-setup aborted).
   * When present, no test outcomes are trustworthy — it's an environment problem,
   * not a set of regressions.
   */
  setupError?: string;
  diff: SpecDiff[];
  summary: {
    total: number;
    stillPassing: number;
    behavioral: number;
    infra: number;
    flaky: number;
    preExisting: number;
    healed: number;
  };
  /** The full underlying target run, for drill-down via the existing report view. */
  targetReport: RunReport;
}

/** Ordered phases of a migration run, used to drive the progress UI. */
export type MigrationStep =
  | "resolve"
  | "prepare"
  | "heal"
  | "run"
  | "fingerprint"
  | "report"
  | "done"
  | "error";

/** A single progress entry emitted while a migration check runs. */
export interface MigrationEvent {
  at: string;
  step: MigrationStep;
  message: string;
}

/**
 * A saved target environment for an app, so repeat migration checks can be
 * pre-filled. Credentials are NEVER stored — only where the app lives.
 */
export interface MigrationEnvironment {
  /** Stable id (slugified label). */
  id: string;
  /** Human label, e.g. "BTP staging". */
  label: string;
  /** Source app id (normalized origin) this environment belongs to. */
  sourceAppId: string;
  targetUrl: string;
  pathPrefix?: string;
  idp?: string;
  loginUrl?: string;
}
