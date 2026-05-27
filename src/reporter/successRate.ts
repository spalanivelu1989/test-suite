import type { TestResult } from "../types";

export interface SuccessRate {
  /** 0–1. passed ÷ all planned tests; fixme/failed/flaky count as not-passed (Q7/D7). */
  rate: number;
  passed: number;
  total: number;
}

/** A healed test passes now, so it counts toward "passed" in the rate. */
const PASSING: TestResult["outcome"][] = ["passed", "healed"];

/** T12: success rate = passed ÷ all planned tests (D7). */
export function computeSuccessRate(results: TestResult[]): SuccessRate {
  const total = results.length;
  const passed = results.filter((r) => PASSING.includes(r.outcome)).length;
  return { rate: total === 0 ? 0 : passed / total, passed, total };
}

export interface Buckets {
  passed: TestResult[];
  needsAttention: TestResult[];
  whereToImprove: TestResult[];
}

/**
 * T12: classify each test for the report breakdown (R16).
 * - passed → "passed"
 * - failed / fixme → "needs attention"
 * - flaky / healed → "where to improve" (works, but was fragile / needed repair)
 */
export function bucketResults(results: TestResult[]): Buckets {
  const buckets: Buckets = {
    passed: [],
    needsAttention: [],
    whereToImprove: [],
  };
  for (const r of results) {
    if (r.outcome === "passed") buckets.passed.push(r);
    else if (r.outcome === "failed" || r.outcome === "fixme")
      buckets.needsAttention.push(r);
    else buckets.whereToImprove.push(r); // flaky | healed
  }
  return buckets;
}
