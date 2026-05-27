import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { createClaudeClient } from "../claude/client";
import type { RunAgentResult } from "../agents/runtime";
import { createWorkspace } from "../agents/workspace";
import type { PlaywrightJsonReport } from "../results/parse";
import type { ProgressEvent } from "../types";
import { runPipeline } from "./orchestrate";

// Narrative client returns empty review.
function narrativeClient() {
  return createClaudeClient({
    sdk: {
      messages: {
        create: async () => ({
          content: [
            {
              type: "text",
              text: '{"fixPrompts":[],"issues":[],"recommendations":[]}',
            },
          ],
        }),
      },
    },
  });
}

test("runPipeline runs the four stages in order and builds a rich report", async () => {
  const runId = `test-${randomUUID()}`;
  const ws = await createWorkspace(runId);
  const stages: string[] = [];
  const events: string[] = [];

  // Stub agents: planner writes a plan, generator writes a spec, healer is a no-op.
  const runner = async (opts: {
    agent: { name: string };
  }): Promise<RunAgentResult> => {
    stages.push(opts.agent.name);
    if (opts.agent.name === "planner") {
      await writeFile(
        join(ws.specsDir, "plan.md"),
        "# Plan\n## 1. Home",
        "utf8",
      );
    } else if (opts.agent.name === "generator") {
      await writeFile(
        join(ws.testsDir, "home.spec.ts"),
        "import {test} from '@playwright/test';",
        "utf8",
      );
    }
    return { resultText: "ok", toolCalls: [], isError: false };
  };
  const stageDeps = {
    runner: runner as never,
    loadAgentFn: (async (name: string) => ({
      name: name.replace("playwright-test-", ""),
      description: "",
      tools: [],
      systemPrompt: "x",
    })) as never,
  };

  // Suite executor: home passes.
  const exec = async (): Promise<PlaywrightJsonReport> => ({
    suites: [
      {
        specs: [
          {
            title: "Home",
            file: "home.spec.ts",
            ok: true,
            tests: [{ results: [{ status: "passed" }] }],
          },
        ],
      },
    ],
  });

  try {
    const report = await runPipeline(
      runId,
      { url: "https://x.com" },
      {
        claude: narrativeClient(),
        curatedFlows: [{ id: "home", name: "Home" }],
        emit: (e: Omit<ProgressEvent, "at">) => events.push(e.stage),
        stageDeps,
        suiteExec: exec,
        reruns: 2,
        makeWorkspace: async () => ws,
      },
    );

    assert.deepEqual(stages, ["planner", "generator", "healer"]);
    assert.equal(report.successRate.total, 1);
    assert.equal(report.successRate.passed, 1);
    assert.equal(report.coverage.percent, 100);
    assert.match(report.planMarkdown ?? "", /# Plan/);
    assert.equal(report.generatedSpecs.length, 1);

    const order = [
      "planning",
      "generating",
      "healing",
      "flake-check",
      "reporting",
      "done",
    ];
    const idx = order.map((s) => events.indexOf(s));
    assert.ok(
      idx.every((i) => i >= 0),
      "all stages emitted",
    );
    assert.deepEqual(
      idx,
      [...idx].sort((a, b) => a - b),
      "stages in order",
    );
  } finally {
    await rm(ws.root, { recursive: true, force: true });
  }
});

test("runPipeline throws when the planner produces no plan", async () => {
  const runId = `test-${randomUUID()}`;
  const ws = await createWorkspace(runId);
  const stageDeps = {
    runner: (async () => ({
      resultText: "",
      toolCalls: [],
      isError: false,
    })) as never,
    loadAgentFn: (async () => ({
      name: "planner",
      description: "",
      tools: [],
      systemPrompt: "x",
    })) as never,
  };
  try {
    await assert.rejects(() =>
      runPipeline(
        runId,
        { url: "https://x.com" },
        {
          claude: narrativeClient(),
          curatedFlows: [],
          stageDeps,
          suiteExec: async () => ({ suites: [] }),
          makeWorkspace: async () => ws,
        },
      ),
    );
  } finally {
    await rm(ws.root, { recursive: true, force: true });
  }
});
