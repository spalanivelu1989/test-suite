import assert from "node:assert/strict";
import { test } from "node:test";
import type { CoverageDecision, SpecRef } from "../types";
import { buildGeneratorPack } from "./contextPack";

test("buildGeneratorPack passes decisions through and bounds reused code", () => {
  const decisions: CoverageDecision[] = [
    { scenario: "Hero CTA", action: "reuse", score: 0.9 },
  ];
  const specs: SpecRef[] = [
    {
      runId: "r1",
      file: "hero.spec.ts",
      title: "Hero CTA",
      code: "x".repeat(100),
    },
  ];
  const pack = buildGeneratorPack(decisions, specs, 20);
  assert.equal(pack.decisions.length, 1);
  assert.ok((pack.specs[0].code ?? "").length <= 20);
});
