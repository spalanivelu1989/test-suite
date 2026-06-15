import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { createWorkspace } from "../agents/workspace";
import type {
  AgentDef,
  RunAgentOptions,
  RunAgentResult,
} from "../agents/runtime";
import type { KnowledgeService } from "../knowledge";
import { designTests, discoverTests } from "./stages";

const fakeAgent: AgentDef = {
  name: "x",
  description: "",
  tools: [],
  systemPrompt: "x",
};

/** A KnowledgeService stub honoring the interface (R1/T20). */
function fakeKnowledge(partial: Partial<KnowledgeService>): KnowledgeService {
  return {
    enabled: true,
    appIdFor: (u) => u,
    ingestRun: async () => {},
    getAppProfile: async () => null,
    getLastPlan: async () => null,
    getCoverageMap: async () => null,
    planCoverageDecision: async (s) =>
      s.map((x) => ({ scenario: x.name, action: "new", score: 0 })),
    assembleContext: async () => ({}),
    findSimilarSpecs: async () => [],
    getHealingPrecedents: async () => [],
    getPlaybooks: async () => [],
    getHealProvenanceTrend: async () => [],
    getKnowledgeReuseTrend: async () => [],
    close: async () => {},
    ...partial,
  };
}

const planRunner =
  (ws: { specsDir: string }, sink: (p: string) => void) =>
  async (opts: RunAgentOptions): Promise<RunAgentResult> => {
    sink(opts.prompt);
    await writeFile(join(ws.specsDir, "plan.md"), "# Plan", "utf8");
    return { resultText: "", toolCalls: [], isError: false };
  };

test("T14/T20: with no prior plan, the Discoverer prompt is KB-independent (no coverage knowledge)", async () => {
  const ws = await createWorkspace(`test-${randomUUID()}`);
  try {
    let withPrompt = "";
    let withoutPrompt = "";
    // A KB present, but it has no prior plan and the discoverer pulls no coverage
    // knowledge — so its prompt must be identical to the no-KB case.
    const knowledge = fakeKnowledge({});

    await discoverTests(ws, "https://x.com", undefined, {
      runner: planRunner(ws, (p) => (withPrompt = p)) as never,
      loadAgentFn: async () => fakeAgent,
      knowledge,
    });
    assert.doesNotMatch(withPrompt, /KNOWLEDGE/i);
    assert.doesNotMatch(withPrompt, /MEMORY/);

    await discoverTests(ws, "https://x.com", undefined, {
      runner: planRunner(ws, (p) => (withoutPrompt = p)) as never,
      loadAgentFn: async () => fakeAgent,
    });
    assert.equal(withPrompt, withoutPrompt);
  } finally {
    await rm(ws.root, { recursive: true, force: true });
  }
});

test("Discoverer receives the previous plan as reference 'memory', with an independent-crawl instruction", async () => {
  const ws = await createWorkspace(`test-${randomUUID()}`);
  try {
    let prompt = "";
    const knowledge = fakeKnowledge({
      getLastPlan: async () =>
        "# Plan\n## Scenario 1 — Hero CTA opens the contact form\n",
    });

    await discoverTests(ws, "https://x.com", undefined, {
      runner: planRunner(ws, (p) => (prompt = p)) as never,
      loadAgentFn: async () => fakeAgent,
      knowledge,
    });

    assert.match(prompt, /MEMORY/);
    assert.match(prompt, /<previous-plan>/);
    assert.match(prompt, /Hero CTA opens the contact form/);
    // It must still be told to crawl independently and not blindly copy.
    assert.match(prompt, /crawl the live site/i);
    assert.match(prompt, /do NOT blindly copy/i);
  } finally {
    await rm(ws.root, { recursive: true, force: true });
  }
});

test("T15: a reuse decision skips regeneration and copies the prior spec (D4)", async () => {
  const ws = await createWorkspace(`test-${randomUUID()}`);
  try {
    await writeFile(
      join(ws.specsDir, "plan.md"),
      "# Plan\n## Scenario 1 — Hero CTA\n",
      "utf8",
    );
    let prompt = "";
    const runner = async (opts: RunAgentOptions): Promise<RunAgentResult> => {
      prompt = opts.prompt;
      await writeFile(
        join(ws.testsDir, "new.spec.ts"),
        "import {test} from '@playwright/test';",
        "utf8",
      );
      return { resultText: "", toolCalls: [], isError: false };
    };
    const knowledge = fakeKnowledge({
      assembleContext: async () => ({
        designer: {
          decisions: [
            {
              scenario: "Hero CTA",
              action: "reuse",
              matchedSpec: {
                runId: "r1",
                file: "hero.spec.ts",
                title: "Hero CTA",
              },
              score: 0.95,
            },
          ],
          specs: [
            {
              runId: "r1",
              file: "hero.spec.ts",
              title: "Hero CTA",
              code: "import {test} from '@playwright/test';\ntest('Hero CTA', async () => {});",
            },
          ],
        },
      }),
    });

    const res = await designTests(
      ws,
      undefined,
      {
        runner: runner as never,
        loadAgentFn: async () => fakeAgent,
        knowledge,
      },
      { url: "https://x.com" },
    );

    assert.match(prompt, /do NOT regenerate/i);
    // The reused spec was copied into the workspace, tagged.
    const copied = await readFile(join(ws.testsDir, "hero.spec.ts"), "utf8");
    assert.match(copied, /@kp-reused/);
    assert.equal(res.isError, false);
  } finally {
    await rm(ws.root, { recursive: true, force: true });
  }
});

test("T19: a throwing KnowledgeService never fails the stage (N3)", async () => {
  const ws = await createWorkspace(`test-${randomUUID()}`);
  try {
    await writeFile(
      join(ws.specsDir, "plan.md"),
      "# Plan\n## Scenario 1 — Hero CTA\n",
      "utf8",
    );
    const throwing = fakeKnowledge({
      assembleContext: async () => {
        throw new Error("kb boom");
      },
    });
    const planRunner = async (): Promise<RunAgentResult> => {
      await writeFile(join(ws.specsDir, "plan.md"), "# Plan", "utf8");
      return { resultText: "", toolCalls: [], isError: false };
    };
    const genRunner = async (): Promise<RunAgentResult> => {
      await writeFile(join(ws.testsDir, "a.spec.ts"), "x", "utf8");
      return { resultText: "", toolCalls: [], isError: false };
    };

    await assert.doesNotReject(() =>
      discoverTests(ws, "https://x.com", undefined, {
        runner: planRunner as never,
        loadAgentFn: async () => fakeAgent,
        knowledge: throwing,
      }),
    );
    await assert.doesNotReject(() =>
      designTests(
        ws,
        undefined,
        {
          runner: genRunner as never,
          loadAgentFn: async () => fakeAgent,
          knowledge: throwing,
        },
        { url: "https://x.com" },
      ),
    );
  } finally {
    await rm(ws.root, { recursive: true, force: true });
  }
});
