import assert from "node:assert/strict";
import { test } from "node:test";
import { createClaudeClient } from "../claude/client";
import type { PageFetcher } from "../crawler/crawl";
import type { GeneratedTest, ProgressEvent, TestResult } from "../types";
import { type OrchestratorDeps, runPipeline } from "./orchestrate";

function makeDeps(
  emit: (e: Omit<ProgressEvent, "at">) => void,
): OrchestratorDeps {
  // Claude returns flows first, then valid test code for every later call.
  let call = 0;
  const claude = createClaudeClient({
    sdk: {
      messages: {
        create: async () => {
          call += 1;
          const text =
            call === 1
              ? '[{"id":"home","name":"Home page","steps":["go"]}]'
              : `import { test, expect } from '@playwright/test';
test('home', async ({ page }) => { await page.goto('https://x.com'); });`;
          return { content: [{ type: "text", text }] };
        },
      },
    },
  });
  const fetcher: PageFetcher & { close: () => Promise<void> } = {
    async fetch() {
      return { title: "Home", links: [], elements: [] };
    },
    async close() {},
  };
  const runTests = async (tests: GeneratedTest[]): Promise<TestResult[]> =>
    tests.map((t) => ({
      flowId: t.flowId,
      fileName: t.fileName,
      outcome: "passed",
    }));

  return {
    claude,
    openFetcher: async () => fetcher,
    runTests,
    curatedFlows: [{ id: "home", name: "Home page" }],
    emit,
    reruns: 2,
  };
}

test("runPipeline produces a report and emits ordered stage events", async () => {
  const events: string[] = [];
  const deps = makeDeps((e) => events.push(e.stage));
  const report = await runPipeline("run-1", { url: "https://x.com" }, deps);

  assert.equal(report.runId, "run-1");
  assert.equal(report.flows.length, 1);
  assert.equal(report.results[0].outcome, "passed");
  assert.equal(report.coverage.percent, 100);
  assert.ok(report.claudeCallCount >= 2);

  // Ordered progression through the pipeline stages (T15b).
  const order = [
    "crawling",
    "identifying",
    "generating",
    "running",
    "flake-check",
    "healing",
    "reporting",
    "done",
  ];
  const firstIndexes = order.map((s) => events.indexOf(s));
  assert.ok(
    firstIndexes.every((i) => i >= 0),
    "all stages emitted",
  );
  const sorted = [...firstIndexes].sort((a, b) => a - b);
  assert.deepEqual(firstIndexes, sorted, "stages emitted in order");
});
