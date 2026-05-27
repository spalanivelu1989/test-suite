import assert from "node:assert/strict";
import { test } from "node:test";
import type { RunReport } from "../types";
import { renderHtml, renderMarkdown } from "./render";

const report: RunReport = {
  runId: "r1",
  url: "https://x.com",
  generatedAt: "2026-05-27T00:00:00.000Z",
  flows: [{ id: "home", name: "Home", steps: [] }],
  results: [
    { flowId: "home", fileName: "home.spec.ts", outcome: "passed" },
    {
      flowId: "search",
      fileName: "search.spec.ts",
      outcome: "flaky",
      flaky: true,
    },
    { flowId: "buy", fileName: "buy.spec.ts", outcome: "healed", healed: true },
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
};

test("renderMarkdown includes coverage, labels, and uncovered flows", () => {
  const md = renderMarkdown(report);
  assert.match(md, /75%/);
  assert.match(md, /FLAKY/);
  assert.match(md, /HEALED/);
  assert.match(md, /Uncovered curated flows/);
  assert.match(md, /- Careers/);
});

test("renderHtml is self-contained and escapes content", () => {
  const evil: RunReport = {
    ...report,
    results: [
      {
        flowId: "x",
        fileName: "x.spec.ts",
        outcome: "failed",
        failureReason: "<script>bad</script>",
      },
    ],
  };
  const html = renderHtml(evil);
  assert.match(html, /<!doctype html>/);
  assert.match(html, /75% flow coverage/);
  assert.ok(!html.includes("<script>bad</script>"));
  assert.match(html, /&lt;script&gt;/);
});
