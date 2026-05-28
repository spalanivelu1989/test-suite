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
import { generateTests, healTests, planTests, trimPlan } from "./stages";

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

test("generateTests proceeds when the agent hit its turn cap but wrote specs", async () => {
  const ws = await createWorkspace(`test-${randomUUID()}`);
  try {
    const runner = async (): Promise<RunAgentResult> => {
      await writeFile(
        join(ws.testsDir, "home.spec.ts"),
        "import {test} from '@playwright/test';",
        "utf8",
      );
      return { resultText: "max turns", toolCalls: [], isError: true }; // agent errored…
    };
    const res = await generateTests(ws, undefined, {
      runner,
      loadAgentFn: async () => fakeAgent,
    });
    assert.equal(res.isError, false); // …but a spec exists, so we proceed
    assert.equal(res.specs.length, 1);
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

test("healTests runs the healer agent and reports tool usage", async () => {
  const ws = await createWorkspace(`test-${randomUUID()}`);
  try {
    const runner = async (opts: RunAgentOptions): Promise<RunAgentResult> => {
      await writeFile(
        join(ws.testsDir, "broken.spec.ts"),
        "import {test} from '@playwright/test';\n// could not heal\ntest.fixme('broken', async () => {});",
        "utf8",
      );
      opts.onEvent?.({ kind: "tool", tool: "mcp__playwright-test__test_run" });
      return {
        resultText: "healed",
        toolCalls: ["test_run", "test_debug"],
        isError: false,
      };
    };
    const res = await healTests(ws, undefined, {
      runner,
      loadAgentFn: async () => fakeAgent,
    });
    assert.equal(res.isError, false);
    assert.ok(res.toolCalls.includes("test_run"));
  } finally {
    await rm(ws.root, { recursive: true, force: true });
  }
});

// ── planTests crawl-mode constraint injection ─────────────────────────────────

test("planTests injects direct-mode constraint (no other pages)", async () => {
  const ws = await createWorkspace(`test-${randomUUID()}`);
  try {
    let capturedPrompt = "";
    const runner = async (opts: RunAgentOptions): Promise<RunAgentResult> => {
      capturedPrompt = opts.prompt;
      await writeFile(join(ws.specsDir, "plan.md"), "# Plan\n", "utf8");
      return { resultText: "saved", toolCalls: ["planner_save_plan"], isError: false };
    };
    await planTests(ws, "https://example.com", undefined, {
      runner, loadAgentFn: async () => fakeAgent,
    }, { crawlMode: "direct", maxPages: 5 });

    assert.ok(capturedPrompt.includes("Direct page only"), `got: ${capturedPrompt}`);
    assert.ok(capturedPrompt.includes("MUST contain at most"), `got: ${capturedPrompt}`);
    assert.ok(capturedPrompt.includes("IMPORTANT"), `got: ${capturedPrompt}`);
  } finally {
    await rm(ws.root, { recursive: true, force: true });
  }
});

test("planTests injects standard-mode depth-1 constraint", async () => {
  const ws = await createWorkspace(`test-${randomUUID()}`);
  try {
    let capturedPrompt = "";
    const runner = async (opts: RunAgentOptions): Promise<RunAgentResult> => {
      capturedPrompt = opts.prompt;
      await writeFile(join(ws.specsDir, "plan.md"), "# Plan\n", "utf8");
      return { resultText: "saved", toolCalls: ["planner_save_plan"], isError: false };
    };
    await planTests(ws, "https://example.com", undefined, {
      runner, loadAgentFn: async () => fakeAgent,
    }, { crawlMode: "standard", maxPages: 5 });

    assert.ok(capturedPrompt.includes("depth = 1"), `got: ${capturedPrompt}`);
    // maxScenarios = 5 pages × 5 scenarios/page = 25
    assert.ok(capturedPrompt.includes("25"), `prompt should mention 25 max scenarios, got: ${capturedPrompt}`);
  } finally {
    await rm(ws.root, { recursive: true, force: true });
  }
});

test("planTests injects deep-mode constraint with correct depth and page cap", async () => {
  const ws = await createWorkspace(`test-${randomUUID()}`);
  try {
    let capturedPrompt = "";
    const runner = async (opts: RunAgentOptions): Promise<RunAgentResult> => {
      capturedPrompt = opts.prompt;
      await writeFile(join(ws.specsDir, "plan.md"), "# Plan\n", "utf8");
      return { resultText: "saved", toolCalls: ["planner_save_plan"], isError: false };
    };
    await planTests(ws, "https://example.com", undefined, {
      runner, loadAgentFn: async () => fakeAgent,
    }, { crawlMode: "deep", maxPages: 10 });

    assert.ok(capturedPrompt.includes("depth ≤ 3"), `got: ${capturedPrompt}`);
    // maxScenarios = 10 pages × 4 scenarios/page = 40
    assert.ok(capturedPrompt.includes("40"), `prompt should mention 40 max scenarios, got: ${capturedPrompt}`);
  } finally {
    await rm(ws.root, { recursive: true, force: true });
  }
});

// ── trimPlan unit tests ───────────────────────────────────────────────────────

test("trimPlan leaves plan unchanged when within budget", () => {
  const plan = "# Plan\n\n#### 1.1 Scenario A\nsteps\n#### 1.2 Scenario B\nsteps\n";
  const { trimmed, total, removed } = trimPlan(plan, 5);
  assert.equal(total, 2);
  assert.equal(removed, 0);
  assert.equal(trimmed, plan);
});

test("trimPlan trims scenarios exceeding the ceiling", () => {
  const scenarios = Array.from({ length: 8 }, (_, i) => `#### 1.${i + 1} Scenario ${i + 1}\nsteps\n`);
  const plan = "# Plan\n\n" + scenarios.join("");
  const { trimmed, total, removed } = trimPlan(plan, 5);
  assert.equal(total, 8);
  assert.equal(removed, 3);
  // Only first 5 scenarios remain
  assert.ok(trimmed.includes("Scenario 5"), `should keep scenario 5, got:\n${trimmed}`);
  assert.ok(!trimmed.includes("Scenario 6"), `should trim scenario 6, got:\n${trimmed}`);
  assert.ok(trimmed.includes("trimmed"), "should include trim notice");
});

// ── generateTests maxTurns scaling ───────────────────────────────────────────

test("generateTests scales maxTurns from scenario count in plan", async () => {
  const ws = await createWorkspace(`test-${randomUUID()}`);
  try {
    // Build a plan with 4 scenarios so maxTurns = max(80, 4*10) = 80
    const scenarios = Array.from({ length: 4 }, (_, i) => `#### 1.${i + 1} S${i + 1}\nsteps\n`);
    await writeFile(join(ws.specsDir, "plan.md"), "# Plan\n\n" + scenarios.join(""), "utf8");

    let capturedMaxTurns: number | undefined;
    const runner = async (opts: RunAgentOptions): Promise<RunAgentResult> => {
      capturedMaxTurns = opts.maxTurns;
      await writeFile(join(ws.testsDir, "a.spec.ts"), "import {test} from '@playwright/test';", "utf8");
      return { resultText: "done", toolCalls: [], isError: false };
    };
    await generateTests(ws, undefined, { runner, loadAgentFn: async () => fakeAgent },
      { crawlMode: "standard", maxPages: 10 });

    // 4 scenarios × 10 turns = 40 → clamped to minimum 80
    assert.equal(capturedMaxTurns, 80, `expected 80, got ${capturedMaxTurns}`);
  } finally {
    await rm(ws.root, { recursive: true, force: true });
  }
});

test("generateTests scales maxTurns above minimum for large plans", async () => {
  const ws = await createWorkspace(`test-${randomUUID()}`);
  try {
    // Build a plan with 20 scenarios → maxTurns = 20*10 = 200
    const scenarios = Array.from({ length: 20 }, (_, i) => `#### 1.${i + 1} S${i + 1}\nsteps\n`);
    await writeFile(join(ws.specsDir, "plan.md"), "# Plan\n\n" + scenarios.join(""), "utf8");

    let capturedMaxTurns: number | undefined;
    const runner = async (opts: RunAgentOptions): Promise<RunAgentResult> => {
      capturedMaxTurns = opts.maxTurns;
      await writeFile(join(ws.testsDir, "a.spec.ts"), "import {test} from '@playwright/test';", "utf8");
      return { resultText: "done", toolCalls: [], isError: false };
    };
    // ceiling = 20 pages × 5 = 100 → plan has 20 within budget, so no trim
    await generateTests(ws, undefined, { runner, loadAgentFn: async () => fakeAgent },
      { crawlMode: "standard", maxPages: 20 });

    assert.equal(capturedMaxTurns, 200, `expected 200, got ${capturedMaxTurns}`);
  } finally {
    await rm(ws.root, { recursive: true, force: true });
  }
});
