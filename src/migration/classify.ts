// Classify a migrated spec's target result — the heart of the migration diff.
//
// The guiding rule (see docs/migration-check-proposal.md): a migration check
// exists to SURFACE regressions, not hide them. So we only call a failure "infra"
// when it's clearly an environment difference (auth, network, HTTP-auth). Anything
// that looks like "the element/page changed" (e.g. a locator timeout) is treated
// as a real behavioral regression.

import type { TestResult } from "../types";
import type { SpecClassification, SpecOutcome } from "./types";

// Auth + network + HTTP-auth signatures. Deliberately EXCLUDES generic "timeout",
// "navigation", and locator-not-found text — those usually mean the app changed.
const INFRA_PATTERNS =
  /(\blog\s?-?in\b|sign\s?-?in|\bsso\b|saml|oauth|xsuaa|identity provider|\bidp\b|unauthorized|forbidden|\b401\b|\b403\b|storagestate|net::err|econnrefused|enotfound|getaddrinfo|\bdns\b|err_cert|err_connection|err_name_not_resolved|certificate|ssl handshake)/i;

/** True when a failure reason looks like an environment/auth/network issue, not a real regression. */
export function isInfraFailure(reason?: string): boolean {
  return !!reason && INFRA_PATTERNS.test(reason);
}

/** Collapse a per-run TestResult into the coarse target outcome we report. */
export function targetOutcomeOf(
  result: TestResult | undefined,
): "passed" | "failed" | "flaky" {
  if (!result) return "failed"; // spec didn't run / no result
  if (result.flaky || result.outcome === "flaky") return "flaky";
  if (result.outcome === "passed" || result.outcome === "healed")
    return "passed";
  return "failed"; // "failed" | "fixme"
}

/**
 * Classify a spec given how it did on the source vs the target.
 *  - passed on target, but only after an automated fix → healed (review, don't trust)
 *  - passed on target                 → ok
 *  - inconsistent across reruns        → flaky (not a trustworthy signal)
 *  - failed, auth/network reason       → infra (ignore)
 *  - failed, but also failed on source → pre-existing (not introduced by migration)
 *  - failed, passed on source          → behavioral (REAL regression)
 *
 * `healed` is only meaningful when the Evolver ran (options.heal). A test that
 * needed a code change to pass on the target did NOT transfer as-is, so we
 * surface it rather than letting the fix hide a possible regression.
 */
export function classifySpec(args: {
  sourceOutcome: SpecOutcome;
  targetOutcome: "passed" | "failed" | "flaky";
  failureReason?: string;
  healed?: boolean;
}): SpecClassification {
  if (args.targetOutcome === "passed") {
    return args.healed ? "healed" : "ok";
  }
  if (args.targetOutcome === "flaky") return "flaky";
  if (isInfraFailure(args.failureReason)) return "infra";
  if (args.sourceOutcome === "failed") return "pre-existing";
  return "behavioral";
}
