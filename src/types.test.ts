import assert from "node:assert/strict";
import { test } from "node:test";
import { effectiveScenarioCap, MAX_TOTAL_TESTS } from "./types";

test("effectiveScenarioCap uses per-mode default rate when no override", () => {
  // direct = 1 page × 20/page; standard = 10 × 13; deep = 20 × 10.
  assert.equal(effectiveScenarioCap("direct", 1), 20);
  assert.equal(effectiveScenarioCap("standard", 10), 130);
  assert.equal(effectiveScenarioCap("deep", 20), MAX_TOTAL_TESTS); // 200, clamped from 200
});

test("effectiveScenarioCap multiplies pages × testsPerPage override", () => {
  assert.equal(effectiveScenarioCap("standard", 5, 8), 40);
  assert.equal(effectiveScenarioCap("deep", 10, 12), 120);
  // direct is always a single page, so the override is the whole total.
  assert.equal(effectiveScenarioCap("direct", 1, 8), 8);
});

test("effectiveScenarioCap clamps the total to MAX_TOTAL_TESTS", () => {
  // aggressive 50 pages × 8/page = 400 → clamped.
  assert.equal(effectiveScenarioCap("aggressive", 50, 8), MAX_TOTAL_TESTS);
  // 30/page over 100 pages = 3000 → clamped.
  assert.equal(effectiveScenarioCap("standard", 100, 30), MAX_TOTAL_TESTS);
});

test("effectiveScenarioCap treats the direct interactive page as a 1.5× budget", () => {
  // maxPages === 2 is the "interactive page" budget (1.5 pages) for direct mode.
  assert.equal(effectiveScenarioCap("direct", 2), 30); // 1.5 × 20
});
