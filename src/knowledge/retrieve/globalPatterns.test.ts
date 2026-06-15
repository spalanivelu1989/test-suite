import assert from "node:assert/strict";
import { test } from "node:test";
import type { CoverageDecision, ScenarioInput } from "../types";
import {
  type GlobalPatternRow,
  mergePatternHints,
  PATTERN_RELEVANCE,
  scenariosNeedingPatterns,
  selectGlobalPatterns,
} from "./globalPatterns";

function row(
  appId: string,
  title: string | null,
  score: number,
): GlobalPatternRow {
  return {
    appId,
    runId: "r",
    file: `${title}.spec.ts`,
    title,
    flowId: null,
    score,
  };
}

test("selectGlobalPatterns keeps only candidates at/above the relevance floor", () => {
  const hints = selectGlobalPatterns("Login with valid credentials", [
    row("shop.example", "Sign in with email and password", 0.91),
    row("bank.example", "Authenticate returning user", PATTERN_RELEVANCE),
    row("blog.example", "Submit contact form", 0.4), // unrelated → dropped
  ]);
  assert.equal(hints.length, 2);
  assert.deepEqual(
    hints.map((h) => h.patternTitle),
    ["Sign in with email and password", "Authenticate returning user"],
  );
  // Highest-scoring first; provenance preserved.
  assert.equal(hints[0].sourceApp, "shop.example");
});

test("selectGlobalPatterns drops untitled rows and caps to k", () => {
  const hints = selectGlobalPatterns(
    "Checkout",
    [
      row("a", "Pay with card", 0.95),
      row("b", null, 0.99), // untitled → unusable as inspiration
      row("c", "Complete purchase", 0.9),
      row("d", "Place order", 0.88),
      row("e", "Confirm order", 0.85),
    ],
    { k: 2 },
  );
  assert.equal(hints.length, 2);
  assert.ok(hints.every((h) => h.patternTitle));
});

test("mergePatternHints dedupes by source+title, keeps the best score, caps to budget", () => {
  const merged = mergePatternHints(
    [
      [{ scenario: "s1", patternTitle: "Sign in", sourceApp: "x", score: 0.8 }],
      [
        {
          scenario: "s2",
          patternTitle: "Sign in",
          sourceApp: "x",
          score: 0.93,
        },
      ],
      [
        {
          scenario: "s3",
          patternTitle: "Add to cart",
          sourceApp: "y",
          score: 0.7,
        },
      ],
    ],
    5,
  );
  assert.equal(merged.length, 2); // "Sign in" collapsed to one
  const signIn = merged.find((h) => h.patternTitle === "Sign in");
  assert.equal(signIn?.score, 0.93); // the higher occurrence won
});

test("scenariosNeedingPatterns targets ONLY embedded `new` scenarios (never reuse)", () => {
  const decisions: CoverageDecision[] = [
    { scenario: "A", action: "reuse", score: 0.9 },
    { scenario: "B", action: "new", score: 0.3 },
    { scenario: "C", action: "new", score: 0.1 },
  ];
  const scenarios: ScenarioInput[] = [
    { name: "A", embedding: [1, 0] },
    { name: "B", embedding: [0, 1] }, // new + embedded → targeted
    { name: "C" }, // new but NO embedding (lexical-only) → skipped
  ];
  const targets = scenariosNeedingPatterns(decisions, scenarios);
  assert.deepEqual(
    targets.map((t) => t.name),
    ["B"],
  );
});
