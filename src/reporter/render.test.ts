import assert from "node:assert/strict";
import { test } from "node:test";
import type { RunReport } from "../types";
import { renderHtml, renderMarkdown } from "./render";

const report: RunReport = {
  runId: "r1",
  url: "https://x.com",
  generatedAt: "2026-05-27T00:00:00.000Z",
  flows: [],
  results: [
    { flowId: "home", fileName: "home.spec.ts", outcome: "passed" },
    {
      flowId: "search",
      fileName: "search.spec.ts",
      outcome: "flaky",
      flaky: true,
    },
    { flowId: "buy", fileName: "buy.spec.ts", outcome: "healed", healed: true },
    {
      flowId: "login",
      fileName: "login.spec.ts",
      outcome: "failed",
      failureReason: "no button",
    },
    { flowId: "old", fileName: "old.spec.ts", outcome: "fixme" },
  ],
  coverage: {
    curatedTotal: 4,
    testedCount: 3,
    percent: 75,
    missingFlows: ["Careers"],
  },
  flakeRate: 0.1,
  healSuccessRate: 0.5,
  claudeCallCount: 7,
  successRate: { rate: 0.4, passed: 2, total: 5 },
  fixPrompts: [
    {
      test: "login",
      problem: "missing button",
      change: "use getByRole('button')",
    },
  ],
  issues: ["contact form lacks validation"],
  better: "UI gap info",
  recommendationsText: "Fix the gallery filters",
  recommendations: ["add aria labels"],
  planMarkdown: "# Plan\n## 1. Home",
  generatedSpecs: [{ file: "home.spec.ts", code: "code" }],
};

test("renderMarkdown includes success rate, breakdown, fix prompts, issues, recommendations", () => {
  const md = renderMarkdown(report);
  assert.match(md, /Success rate: 40%/);
  assert.match(md, /75% \(3\/4 curated flows\)/);
  assert.match(md, /Needs attention \(2\)/); // failed + fixme
  assert.match(md, /Where to improve \(2\)/); // flaky + healed
  assert.match(md, /## Fix prompts/);
  assert.match(md, /missing button/);
  assert.match(md, /## Issues found/);
  assert.match(md, /## What could be better/);
  assert.match(md, /## Recommendations/);
  assert.match(md, /## Coverage Recommendations/);
});

test("renderHtml is self-contained and escapes content", () => {
  const evil: RunReport = {
    ...report,
    issues: ["<script>bad</script>"],
  };
  const html = renderHtml(evil);
  assert.match(html, /<!doctype html>/);
  // score appears as the large verdict number
  assert.match(html, /40%/);
  // passes count appears in the verdict text
  assert.match(html, /<b>2<\/b> of <b>5<\/b> checks passed/);
  // XSS escaping
  assert.ok(!html.includes("<script>bad</script>"));
  assert.match(html, /&lt;script&gt;/);
});
