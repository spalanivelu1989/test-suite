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
import {
  designTests,
  evolveTests,
  discoverTests,
  regenerateMissingScenarios,
  trimPlan,
  validateTests,
} from "./stages";

const fakeAgent: AgentDef = {
  name: "playwright-test-discoverer",
  description: "",
  tools: [],
  systemPrompt: "plan",
};

test("discoverTests returns the saved plan markdown on success", async () => {
  const ws = await createWorkspace(`test-${randomUUID()}`);
  try {
    // Simulate the discoverer agent calling discoverer_save_plan by writing the file.
    const runner = async (opts: RunAgentOptions): Promise<RunAgentResult> => {
      await writeFile(
        join(ws.specsDir, "plan.md"),
        "# Plan\n\n## 1. Home page",
        "utf8",
      );
      opts.onEvent?.({
        kind: "tool",
        tool: "Write",
      });
      return {
        resultText: "saved",
        toolCalls: ["Write"],
        isError: false,
      };
    };
    const res = await discoverTests(ws, "https://x.com", undefined, {
      runner,
      loadAgentFn: async () => fakeAgent,
    });
    assert.equal(res.isError, false);
    assert.match(res.planMarkdown ?? "", /# Plan/);
  } finally {
    await rm(ws.root, { recursive: true, force: true });
  }
});

test("discoverTests flags an error when no plan was saved", async () => {
  const ws = await createWorkspace(`test-${randomUUID()}`);
  try {
    const runner = async (): Promise<RunAgentResult> => ({
      resultText: "",
      toolCalls: [],
      isError: false,
    });
    const res = await discoverTests(ws, "https://x.com", undefined, {
      runner,
      loadAgentFn: async () => fakeAgent,
    });
    assert.equal(res.isError, true);
    assert.equal(res.planMarkdown, null);
  } finally {
    await rm(ws.root, { recursive: true, force: true });
  }
});

test("designTests reads back one spec per scenario the agent wrote", async () => {
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
        tool: "Write",
      });
      return {
        resultText: "done",
        toolCalls: ["Write"],
        isError: false,
      };
    };
    const res = await designTests(ws, undefined, {
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

test("designTests proceeds when the agent hit its turn cap but wrote specs", async () => {
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
    const res = await designTests(ws, undefined, {
      runner,
      loadAgentFn: async () => fakeAgent,
    });
    assert.equal(res.isError, false); // …but a spec exists, so we proceed
    assert.equal(res.specs.length, 1);
  } finally {
    await rm(ws.root, { recursive: true, force: true });
  }
});

test("designTests flags an error when no specs were written", async () => {
  const ws = await createWorkspace(`test-${randomUUID()}`);
  try {
    const runner = async (): Promise<RunAgentResult> => ({
      resultText: "",
      toolCalls: [],
      isError: false,
    });
    const res = await designTests(ws, undefined, {
      runner,
      loadAgentFn: async () => fakeAgent,
    });
    assert.equal(res.isError, true);
    assert.equal(res.specs.length, 0);
  } finally {
    await rm(ws.root, { recursive: true, force: true });
  }
});

test("evolveTests runs the evolver agent and reports tool usage", async () => {
  const ws = await createWorkspace(`test-${randomUUID()}`);
  try {
    const runner = async (opts: RunAgentOptions): Promise<RunAgentResult> => {
      await writeFile(
        join(ws.testsDir, "broken.spec.ts"),
        "import {test} from '@playwright/test';\n// could not heal\ntest.fixme('broken', async () => {});",
        "utf8",
      );
      opts.onEvent?.({ kind: "tool", tool: "Bash" });
      return {
        resultText: "healed",
        toolCalls: ["Bash"],
        isError: false,
      };
    };
    const res = await evolveTests(ws, undefined, {
      runner,
      loadAgentFn: async () => fakeAgent,
    });
    assert.equal(res.isError, false);
    assert.ok(res.toolCalls.includes("Bash"));
  } finally {
    await rm(ws.root, { recursive: true, force: true });
  }
});

// ── validateTests + evolver prompt augmentation ───────────────────────────────

test("validateTests scores the generated specs against the plan", async () => {
  const ws = await createWorkspace(`test-${randomUUID()}`);
  try {
    await writeFile(
      join(ws.specsDir, "plan.md"),
      "# Plan\n## Scenario 1 — Home Page Load\n### Steps\n",
      "utf8",
    );
    // A clean, relevant spec → no findings.
    await writeFile(
      join(ws.testsDir, "home-page-load.spec.ts"),
      `import { test, expect } from '@playwright/test';
test('Home Page Load', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Home/);
});`,
      "utf8",
    );
    // A spec with no assertions → no-assertions error.
    await writeFile(
      join(ws.testsDir, "empty.spec.ts"),
      `import { test } from '@playwright/test';
test('Unplanned thing', async ({ page }) => { await page.goto('/'); });`,
      "utf8",
    );
    const report = await validateTests(ws);
    assert.equal(report.specs.length, 2);
    assert.ok(report.errorCount >= 1, "no-assertions flagged");
    assert.ok(
      report.orphanSpecs.includes("empty.spec.ts"),
      "unplanned spec flagged as orphan",
    );
    assert.ok(report.score < 100);
  } finally {
    await rm(ws.root, { recursive: true, force: true });
  }
});

test("evolveTests appends validation findings to the evolver prompt", async () => {
  const ws = await createWorkspace(`test-${randomUUID()}`);
  try {
    let capturedPrompt = "";
    const runner = async (opts: RunAgentOptions): Promise<RunAgentResult> => {
      capturedPrompt = opts.prompt;
      return { resultText: "ok", toolCalls: [], isError: false };
    };
    const validation = {
      specs: [
        {
          file: "a.spec.ts",
          title: "A",
          matchedScenario: "A",
          score: 70,
          findings: [
            {
              rule: "hard-wait",
              category: "robustness" as const,
              severity: "warning" as const,
              message: "Hard-coded wait.",
              line: 5,
            },
          ],
        },
      ],
      missingFlows: [],
      orphanSpecs: [],
      errorCount: 0,
      warningCount: 1,
      score: 70,
    };
    await evolveTests(
      ws,
      undefined,
      { runner, loadAgentFn: async () => fakeAgent },
      validation,
    );
    assert.ok(capturedPrompt.includes("Static validation flagged"));
    assert.ok(capturedPrompt.includes("hard-wait"));
    assert.ok(capturedPrompt.includes("a.spec.ts"));
  } finally {
    await rm(ws.root, { recursive: true, force: true });
  }
});

// ── discoverTests crawl-mode constraint injection ─────────────────────────────────

test("discoverTests injects direct-mode constraint (no other pages)", async () => {
  const ws = await createWorkspace(`test-${randomUUID()}`);
  try {
    let capturedPrompt = "";
    const runner = async (opts: RunAgentOptions): Promise<RunAgentResult> => {
      capturedPrompt = opts.prompt;
      await writeFile(join(ws.specsDir, "plan.md"), "# Plan\n", "utf8");
      return { resultText: "saved", toolCalls: ["Write"], isError: false };
    };
    await discoverTests(
      ws,
      "https://example.com",
      undefined,
      {
        runner,
        loadAgentFn: async () => fakeAgent,
      },
      { crawlMode: "direct", maxPages: 5 },
    );

    assert.ok(
      capturedPrompt.includes("Direct page only"),
      `got: ${capturedPrompt}`,
    );
    assert.ok(
      capturedPrompt.includes("MUST contain at most"),
      `got: ${capturedPrompt}`,
    );
    assert.ok(capturedPrompt.includes("IMPORTANT"), `got: ${capturedPrompt}`);
  } finally {
    await rm(ws.root, { recursive: true, force: true });
  }
});

test("discoverTests injects the focus directive when set", async () => {
  const ws = await createWorkspace(`test-${randomUUID()}`);
  try {
    let capturedPrompt = "";
    const runner = async (opts: RunAgentOptions): Promise<RunAgentResult> => {
      capturedPrompt = opts.prompt;
      await writeFile(join(ws.specsDir, "plan.md"), "# Plan\n", "utf8");
      return { resultText: "saved", toolCalls: ["Write"], isError: false };
    };
    await discoverTests(
      ws,
      "https://example.com",
      undefined,
      { runner, loadAgentFn: async () => fakeAgent },
      {
        crawlMode: "direct",
        maxPages: 5,
        focus: "Only the Logistics platform",
      },
    );

    assert.ok(capturedPrompt.includes("🎯 FOCUS"), `got: ${capturedPrompt}`);
    assert.ok(
      capturedPrompt.includes("Only the Logistics platform"),
      `got: ${capturedPrompt}`,
    );
  } finally {
    await rm(ws.root, { recursive: true, force: true });
  }
});

test("discoverTests omits the focus block when no focus is given", async () => {
  const ws = await createWorkspace(`test-${randomUUID()}`);
  try {
    let capturedPrompt = "";
    const runner = async (opts: RunAgentOptions): Promise<RunAgentResult> => {
      capturedPrompt = opts.prompt;
      await writeFile(join(ws.specsDir, "plan.md"), "# Plan\n", "utf8");
      return { resultText: "saved", toolCalls: ["Write"], isError: false };
    };
    await discoverTests(
      ws,
      "https://example.com",
      undefined,
      { runner, loadAgentFn: async () => fakeAgent },
      { crawlMode: "direct", maxPages: 5 },
    );

    assert.ok(!capturedPrompt.includes("🎯 FOCUS"), `got: ${capturedPrompt}`);
  } finally {
    await rm(ws.root, { recursive: true, force: true });
  }
});

test("discoverTests injects standard-mode depth-1 constraint", async () => {
  const ws = await createWorkspace(`test-${randomUUID()}`);
  try {
    let capturedPrompt = "";
    const runner = async (opts: RunAgentOptions): Promise<RunAgentResult> => {
      capturedPrompt = opts.prompt;
      await writeFile(join(ws.specsDir, "plan.md"), "# Plan\n", "utf8");
      return { resultText: "saved", toolCalls: ["Write"], isError: false };
    };
    await discoverTests(
      ws,
      "https://example.com",
      undefined,
      {
        runner,
        loadAgentFn: async () => fakeAgent,
      },
      { crawlMode: "standard", maxPages: 5 },
    );

    assert.ok(capturedPrompt.includes("depth = 1"), `got: ${capturedPrompt}`);
    // maxScenarios = 5 pages × 13 scenarios/page = 65
    assert.ok(
      capturedPrompt.includes("65"),
      `prompt should mention 65 max scenarios, got: ${capturedPrompt}`,
    );
  } finally {
    await rm(ws.root, { recursive: true, force: true });
  }
});

test("discoverTests injects deep-mode constraint with correct depth and page cap", async () => {
  const ws = await createWorkspace(`test-${randomUUID()}`);
  try {
    let capturedPrompt = "";
    const runner = async (opts: RunAgentOptions): Promise<RunAgentResult> => {
      capturedPrompt = opts.prompt;
      await writeFile(join(ws.specsDir, "plan.md"), "# Plan\n", "utf8");
      return { resultText: "saved", toolCalls: ["Write"], isError: false };
    };
    await discoverTests(
      ws,
      "https://example.com",
      undefined,
      {
        runner,
        loadAgentFn: async () => fakeAgent,
      },
      { crawlMode: "deep", maxPages: 10 },
    );

    assert.ok(capturedPrompt.includes("depth ≤ 2"), `got: ${capturedPrompt}`);
    // maxScenarios = 10 pages × 10 scenarios/page = 100
    assert.ok(
      capturedPrompt.includes("100"),
      `prompt should mention 100 max scenarios, got: ${capturedPrompt}`,
    );
  } finally {
    await rm(ws.root, { recursive: true, force: true });
  }
});

// ── trimPlan unit tests ───────────────────────────────────────────────────────

test("trimPlan leaves plan unchanged when within budget", () => {
  const plan =
    "# Plan\n\n#### 1.1 Scenario A\nsteps\n#### 1.2 Scenario B\nsteps\n";
  const { trimmed, total, removed } = trimPlan(plan, 5);
  assert.equal(total, 2);
  assert.equal(removed, 0);
  assert.equal(trimmed, plan);
});

test("trimPlan trims scenarios exceeding the ceiling", () => {
  const scenarios = Array.from(
    { length: 8 },
    (_, i) => `#### 1.${i + 1} Scenario ${i + 1}\nsteps\n`,
  );
  const plan = "# Plan\n\n" + scenarios.join("");
  const { trimmed, total, removed } = trimPlan(plan, 5);
  assert.equal(total, 8);
  assert.equal(removed, 3);
  // Only first 5 scenarios remain
  assert.ok(
    trimmed.includes("Scenario 5"),
    `should keep scenario 5, got:\n${trimmed}`,
  );
  assert.ok(
    !trimmed.includes("Scenario 6"),
    `should trim scenario 6, got:\n${trimmed}`,
  );
  assert.ok(trimmed.includes("trimmed"), "should include trim notice");
});

// ── designTests maxTurns scaling ───────────────────────────────────────────

test("designTests scales maxTurns from scenario count in plan", async () => {
  const ws = await createWorkspace(`test-${randomUUID()}`);
  try {
    // Build a plan with 4 scenarios so maxTurns = max(120, 4*18=72) = 120
    const scenarios = Array.from(
      { length: 4 },
      (_, i) => `#### 1.${i + 1} S${i + 1}\nsteps\n`,
    );
    await writeFile(
      join(ws.specsDir, "plan.md"),
      "# Plan\n\n" + scenarios.join(""),
      "utf8",
    );

    let capturedMaxTurns: number | undefined;
    const runner = async (opts: RunAgentOptions): Promise<RunAgentResult> => {
      capturedMaxTurns = opts.maxTurns;
      await writeFile(
        join(ws.testsDir, "a.spec.ts"),
        "import {test} from '@playwright/test';",
        "utf8",
      );
      return { resultText: "done", toolCalls: [], isError: false };
    };
    await designTests(
      ws,
      undefined,
      { runner, loadAgentFn: async () => fakeAgent },
      { crawlMode: "standard", maxPages: 10 },
    );

    // 4 scenarios × 18 turns = 72 → clamped to minimum floor of 120
    assert.equal(
      capturedMaxTurns,
      120,
      `expected 120, got ${capturedMaxTurns}`,
    );
  } finally {
    await rm(ws.root, { recursive: true, force: true });
  }
});

test("designTests scales maxTurns above minimum for large plans", async () => {
  const ws = await createWorkspace(`test-${randomUUID()}`);
  try {
    // Build a plan with 20 scenarios → maxTurns = max(120, 20*18) = 360
    const scenarios = Array.from(
      { length: 20 },
      (_, i) => `#### 1.${i + 1} S${i + 1}\nsteps\n`,
    );
    await writeFile(
      join(ws.specsDir, "plan.md"),
      "# Plan\n\n" + scenarios.join(""),
      "utf8",
    );

    let capturedMaxTurns: number | undefined;
    const runner = async (opts: RunAgentOptions): Promise<RunAgentResult> => {
      capturedMaxTurns = opts.maxTurns;
      await writeFile(
        join(ws.testsDir, "a.spec.ts"),
        "import {test} from '@playwright/test';",
        "utf8",
      );
      return { resultText: "done", toolCalls: [], isError: false };
    };
    // ceiling = 20 pages × 13 = 260 → plan has 20 within budget, so no trim
    await designTests(
      ws,
      undefined,
      { runner, loadAgentFn: async () => fakeAgent },
      { crawlMode: "standard", maxPages: 20 },
    );

    assert.equal(
      capturedMaxTurns,
      360,
      `expected 360, got ${capturedMaxTurns}`,
    );
  } finally {
    await rm(ws.root, { recursive: true, force: true });
  }
});

test("designTests counts '### Scenario N:' headings for maxTurns (not just '#### N.M')", async () => {
  const ws = await createWorkspace(`test-${randomUUID()}`);
  try {
    // The Discoverer emits this 3-hash format in practice. Before the fix, the
    // scenario count silently read 0 here and maxTurns pinned to the floor.
    const scenarios = Array.from(
      { length: 8 },
      (_, i) => `### Scenario ${i + 1}: Title ${i + 1}\nsteps\n`,
    );
    await writeFile(
      join(ws.specsDir, "plan.md"),
      "# Plan\n\n" + scenarios.join(""),
      "utf8",
    );

    let capturedMaxTurns: number | undefined;
    const runner = async (opts: RunAgentOptions): Promise<RunAgentResult> => {
      capturedMaxTurns = opts.maxTurns;
      await writeFile(
        join(ws.testsDir, "a.spec.ts"),
        "import {test} from '@playwright/test';",
        "utf8",
      );
      return { resultText: "done", toolCalls: [], isError: false };
    };
    // direct mode: ceiling = 1 page × 20 = 20 → all 8 scenarios counted.
    await designTests(
      ws,
      undefined,
      { runner, loadAgentFn: async () => fakeAgent },
      { crawlMode: "direct", maxPages: 1 },
    );

    // 8 scenarios × 18 = 144 (above the 120 floor). Pre-fix this was 80.
    assert.equal(
      capturedMaxTurns,
      144,
      `expected 144, got ${capturedMaxTurns}`,
    );
  } finally {
    await rm(ws.root, { recursive: true, force: true });
  }
});

test("regenerateMissingScenarios generates only the listed scenarios with a generous budget", async () => {
  const ws = await createWorkspace(`test-${randomUUID()}`);
  try {
    await writeFile(
      join(ws.specsDir, "plan.md"),
      "# Plan\n\n### Scenario 1: A\nsteps\n### Scenario 2: B\nsteps\n",
      "utf8",
    );
    // Pretend scenario 1 already has a spec; only 2 is missing.
    await writeFile(
      join(ws.testsDir, "a.spec.ts"),
      "import {test} from '@playwright/test';",
      "utf8",
    );

    let capturedMaxTurns: number | undefined;
    let capturedPrompt = "";
    const runner = async (opts: RunAgentOptions): Promise<RunAgentResult> => {
      capturedMaxTurns = opts.maxTurns;
      capturedPrompt = opts.prompt;
      await writeFile(
        join(ws.testsDir, "b.spec.ts"),
        "import {test} from '@playwright/test';",
        "utf8",
      );
      return { resultText: "done", toolCalls: [], isError: false };
    };

    const res = await regenerateMissingScenarios(
      ws,
      ["B"],
      undefined,
      { runner, loadAgentFn: async () => fakeAgent },
      { crawlMode: "direct", maxPages: 1 },
    );

    assert.equal(res.isError, false);
    assert.equal(res.scenarioCount, 1);
    // The missing scenario name is named in the prompt; the retry is scoped.
    assert.ok(
      capturedPrompt.includes("- B"),
      `prompt should list missing scenario B, got:\n${capturedPrompt}`,
    );
    assert.ok(
      capturedPrompt.includes("ONLY these missing scenarios"),
      "prompt should scope to only the missing scenarios",
    );
    // Generous floor even for a single straggler.
    assert.equal(
      capturedMaxTurns,
      120,
      `expected 120, got ${capturedMaxTurns}`,
    );
  } finally {
    await rm(ws.root, { recursive: true, force: true });
  }
});

// ── testsPerPage override (per-page rate) ────────────────────────────────────

test("discoverTests cap = pages × testsPerPage (per-page formula, under the ceiling)", async () => {
  const ws = await createWorkspace(`test-${randomUUID()}`);
  try {
    let capturedPrompt = "";
    const runner = async (opts: RunAgentOptions): Promise<RunAgentResult> => {
      capturedPrompt = opts.prompt;
      await writeFile(join(ws.specsDir, "plan.md"), "# Plan\n", "utf8");
      return { resultText: "saved", toolCalls: ["Write"], isError: false };
    };
    // standard + 10 pages × 8/page = 80 (below the 200 ceiling).
    await discoverTests(
      ws,
      "https://example.com",
      undefined,
      { runner, loadAgentFn: async () => fakeAgent },
      { crawlMode: "standard", maxPages: 10, testsPerPage: 8 },
    );

    assert.ok(
      capturedPrompt.includes("at most 80 test scenarios"),
      `cap should be 80, got: ${capturedPrompt}`,
    );
    assert.ok(
      capturedPrompt.includes("10 page(s) × 8 tests/page"),
      "cap message should show the per-page formula",
    );
    assert.ok(
      !capturedPrompt.includes("ceiling"),
      "80 is under the ceiling — no clamp note expected",
    );
  } finally {
    await rm(ws.root, { recursive: true, force: true });
  }
});

test("discoverTests cap clamps to the 200-test ceiling for big crawls", async () => {
  const ws = await createWorkspace(`test-${randomUUID()}`);
  try {
    let capturedPrompt = "";
    const runner = async (opts: RunAgentOptions): Promise<RunAgentResult> => {
      capturedPrompt = opts.prompt;
      await writeFile(join(ws.specsDir, "plan.md"), "# Plan\n", "utf8");
      return { resultText: "saved", toolCalls: ["Write"], isError: false };
    };
    // standard + 50 pages × 8/page = 400 → clamped to 200.
    await discoverTests(
      ws,
      "https://example.com",
      undefined,
      { runner, loadAgentFn: async () => fakeAgent },
      { crawlMode: "standard", maxPages: 50, testsPerPage: 8 },
    );

    assert.ok(
      capturedPrompt.includes("at most 200 test scenarios"),
      `cap should clamp to 200, got: ${capturedPrompt}`,
    );
    assert.ok(
      capturedPrompt.includes("capped at the 200-test ceiling"),
      "cap message should note the ceiling clamp",
    );
  } finally {
    await rm(ws.root, { recursive: true, force: true });
  }
});

test("designTests honors testsPerPage for the budget (trims + scales turns)", async () => {
  const ws = await createWorkspace(`test-${randomUUID()}`);
  try {
    // Plan has 12 scenarios; direct + 1 page × 8/page = 8 cap → trim to 8.
    const scenarios = Array.from(
      { length: 12 },
      (_, i) => `#### 1.${i + 1} S${i + 1}\nsteps\n`,
    );
    await writeFile(
      join(ws.specsDir, "plan.md"),
      "# Plan\n\n" + scenarios.join(""),
      "utf8",
    );

    let capturedMaxTurns: number | undefined;
    const runner = async (opts: RunAgentOptions): Promise<RunAgentResult> => {
      capturedMaxTurns = opts.maxTurns;
      await writeFile(
        join(ws.testsDir, "a.spec.ts"),
        "import {test} from '@playwright/test';",
        "utf8",
      );
      return { resultText: "done", toolCalls: [], isError: false };
    };
    const res = await designTests(
      ws,
      undefined,
      { runner, loadAgentFn: async () => fakeAgent },
      { crawlMode: "direct", maxPages: 1, testsPerPage: 8 },
    );

    // 12 planned − 8 cap = 4 trimmed; scenarioCount clamps to 8.
    assert.equal(res.trimmedCount, 4, "should trim 12→8");
    assert.equal(res.scenarioCount, 8);
    // maxTurns = max(120, 8×18=144) = 144.
    assert.equal(
      capturedMaxTurns,
      144,
      `expected 144, got ${capturedMaxTurns}`,
    );
  } finally {
    await rm(ws.root, { recursive: true, force: true });
  }
});
