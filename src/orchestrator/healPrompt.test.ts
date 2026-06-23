import assert from "node:assert/strict";
import { test } from "node:test";
import type { HealingPrecedent, Playbook } from "../knowledge/types";
import {
  formatPlaybooks,
  formatPrecedentsForTester,
  evolveTests,
} from "./stages";
import type { StageDeps } from "./stages";

// Phase 3 additive-no-regression guard for the Tester prompt (R13/N2/AC8/AC16):
// with no precedents and no playbooks the prompt must be byte-identical to
// Phase 2; with them, the injected blocks appear.

const precedent: HealingPrecedent = {
  runId: "r1",
  file: "home.spec.ts",
  flowId: "home",
  failureSignature: "timeouterror locator not found",
  strategy: "role-locator",
  before: "page.locator('#a')",
  after: "page.getByRole('button')",
  score: 0.9,
};

const playbook: Playbook = {
  id: "global:all:role-locator:abc",
  scope: { kind: "global", key: "all" },
  principle: "Brittle selectors flake; use role locators.",
  recommendation: "Use getByRole.",
  evidenceRunIds: ["r1", "r2"],
  supportCount: 2,
  confidence: 0.8,
  status: "trusted",
};

/** Run evolveTests with a fake agent+runner that captures the prompt. */
async function capturePrompt(
  precedents: HealingPrecedent[],
  playbooks: Playbook[],
): Promise<string> {
  let captured = "";
  const deps: StageDeps = {
    loadAgentFn: async () => ({}) as never,
    runner: async ({ prompt }: { prompt: string }) => {
      captured = prompt;
      return { toolCalls: [], isError: false, resultText: "" };
    },
  } as StageDeps;
  await evolveTests(
    { root: "/tmp/x", testsDir: "/tmp/x/tests" } as never,
    undefined,
    deps,
    undefined,
    precedents,
    playbooks,
  );
  return captured;
}

test("formatters: empty inputs → empty string (no prompt change)", () => {
  assert.equal(formatPrecedentsForTester([]), "");
  assert.equal(formatPlaybooks([]), "");
});

test("evolveTests prompt: no precedents/playbooks → identical to Phase 2 (AC16/N2)", async () => {
  const base = await capturePrompt([], []);
  assert.ok(!base.includes("KNOWN FIXES"));
  assert.ok(!base.includes("LEARNED PRINCIPLES"));
  assert.ok(base.includes("Run the generated test suite"));
});

test("evolveTests prompt: precedents + playbooks → blocks injected (AC8/AC15)", async () => {
  const enriched = await capturePrompt([precedent], [playbook]);
  assert.ok(enriched.includes("KNOWN FIXES"));
  assert.ok(enriched.includes("role-locator"));
  assert.ok(enriched.includes("getByRole"));
  assert.ok(enriched.includes("LEARNED PRINCIPLES"));
  assert.ok(enriched.includes("Brittle selectors flake"));
});
