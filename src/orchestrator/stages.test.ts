import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import type {
  AgentDef,
  RunAgentOptions,
  RunAgentResult,
} from "../agents/runtime";
import { createWorkspace } from "../agents/workspace";
import { generateTests, planTests } from "./stages";

const fakeAgent: AgentDef = {
  name: "playwright-test-planner",
  description: "",
  tools: [],
  systemPrompt: "plan",
};

test("planTests returns the saved plan markdown on success", async () => {
  const ws = await createWorkspace(`test-${randomUUID()}`);
  try {
    // Simulate the planner agent calling planner_save_plan by writing the file.
    const runner = async (opts: RunAgentOptions): Promise<RunAgentResult> => {
      await writeFile(
        join(ws.specsDir, "plan.md"),
        "# Plan\n\n## 1. Home page",
        "utf8",
      );
      opts.onEvent?.({
        kind: "tool",
        tool: "mcp__playwright-test__planner_save_plan",
      });
      return {
        resultText: "saved",
        toolCalls: ["planner_save_plan"],
        isError: false,
      };
    };
    const res = await planTests(ws, "https://x.com", undefined, {
      runner,
      loadAgentFn: async () => fakeAgent,
    });
    assert.equal(res.isError, false);
    assert.match(res.planMarkdown ?? "", /# Plan/);
  } finally {
    await rm(ws.root, { recursive: true, force: true });
  }
});

test("planTests flags an error when no plan was saved", async () => {
  const ws = await createWorkspace(`test-${randomUUID()}`);
  try {
    const runner = async (): Promise<RunAgentResult> => ({
      resultText: "",
      toolCalls: [],
      isError: false,
    });
    const res = await planTests(ws, "https://x.com", undefined, {
      runner,
      loadAgentFn: async () => fakeAgent,
    });
    assert.equal(res.isError, true);
    assert.equal(res.planMarkdown, null);
  } finally {
    await rm(ws.root, { recursive: true, force: true });
  }
});

test("generateTests reads back one spec per scenario the agent wrote", async () => {
  const ws = await createWorkspace(`test-${randomUUID()}`);
  try {
    const runner = async (opts: RunAgentOptions): Promise<RunAgentResult> => {
      await writeFile(
        join(ws.testsDir, "home.spec.ts"),
        "import {test} from '@playwright/test';",
        "utf8",
      );
      await writeFile(
        join(ws.testsDir, "contact.spec.ts"),
        "import {test} from '@playwright/test';",
        "utf8",
      );
      opts.onEvent?.({
        kind: "tool",
        tool: "mcp__playwright-test__generator_write_test",
      });
      return {
        resultText: "done",
        toolCalls: ["generator_write_test"],
        isError: false,
      };
    };
    const res = await generateTests(ws, undefined, {
      runner,
      loadAgentFn: async () => fakeAgent,
    });
    assert.equal(res.isError, false);
    assert.equal(res.specs.length, 2);
    assert.ok(res.specs.some((s) => s.file === "home.spec.ts"));
  } finally {
    await rm(ws.root, { recursive: true, force: true });
  }
});

test("generateTests flags an error when no specs were written", async () => {
  const ws = await createWorkspace(`test-${randomUUID()}`);
  try {
    const runner = async (): Promise<RunAgentResult> => ({
      resultText: "",
      toolCalls: [],
      isError: false,
    });
    const res = await generateTests(ws, undefined, {
      runner,
      loadAgentFn: async () => fakeAgent,
    });
    assert.equal(res.isError, true);
    assert.equal(res.specs.length, 0);
  } finally {
    await rm(ws.root, { recursive: true, force: true });
  }
});
