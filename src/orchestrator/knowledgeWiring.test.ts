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
import { generateTests, planTests } from "./stages";

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
    getCoverageMap: async () => null,
    planCoverageDecision: async (s) =>
      s.map((x) => ({ scenario: x.name, action: "new", score: 0 })),
    assembleContext: async () => ({}),
    findSimilarSpecs: async () => [],
    close: async () => {},
    ...partial,
  };
}

test("T14/T20: the Planner is KB-agnostic — prior-run knowledge never reaches its prompt", async () => {
  const ws = await createWorkspace(`test-${randomUUID()}`);
  try {
    let withPrompt = "";
    let withoutPrompt = "";
    const runner =
      (sink: (p: string) => void) =>
      async (opts: RunAgentOptions): Promise<RunAgentResult> => {
        sink(opts.prompt);
        await writeFile(join(ws.specsDir, "plan.md"), "# Plan", "utf8");
        return { resultText: "", toolCalls: [], isError: false };
      };
    // A KB whose assembleContext would surface knowledge IF the planner asked —
    // it must not, because the planner never consults the Knowledge Layer.
    const knowledge = fakeKnowledge({
      assembleContext: async () =>
        ({ generator: { decisions: [], specs: [] } }) as never,
    });

    await planTests(ws, "https://x.com", undefined, {
      runner: runner((p) => (withPrompt = p)) as never,
      loadAgentFn: async () => fakeAgent,
      knowledge,
    });
    // No knowledge block in the planner prompt, even with a KB injected.
    assert.doesNotMatch(withPrompt, /KNOWLEDGE/i);

    // And the planner prompt is byte-identical with or without a KB — proof the
    // planner's behavior does not depend on prior-run history at all.
    await planTests(ws, "https://x.com", undefined, {
      runner: runner((p) => (withoutPrompt = p)) as never,
      loadAgentFn: async () => fakeAgent,
    });
    assert.equal(withPrompt, withoutPrompt);
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
        generator: {
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

    const res = await generateTests(
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
      planTests(ws, "https://x.com", undefined, {
        runner: planRunner as never,
        loadAgentFn: async () => fakeAgent,
        knowledge: throwing,
      }),
    );
    await assert.doesNotReject(() =>
      generateTests(
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
