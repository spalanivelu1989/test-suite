import assert from "node:assert/strict";
import { test } from "node:test";
import type { AppProfile, CoverageDecision, SpecRef } from "../types";
import { buildGeneratorPack, buildPlannerPack } from "./contextPack";

function profile(): AppProfile {
  return {
    appId: "https://tarento.com",
    url: "https://tarento.com",
    knownPages: ["https://tarento.com"],
    flows: [
      { flowId: "hero", name: "Hero CTA", tested: true, lastOutcome: "passed" },
      { flowId: "footer", name: "Footer Links", tested: false },
    ],
    coveredFlows: [
      { flowId: "hero", name: "Hero CTA", tested: true, lastOutcome: "passed" },
    ],
    gaps: [{ flowId: "footer", name: "Footer Links", tested: false }],
    runCount: 2,
  };
}

test("buildPlannerPack names covered flows and gaps", () => {
  const text = buildPlannerPack(profile());
  assert.match(text, /Hero CTA/);
  assert.match(text, /Footer Links/);
  // gaps are flagged as untested exploration targets...
  assert.match(text, /UNTESTED/);
  // ...and covered flows are flagged for verbatim inclusion (reuse), not skipped.
  assert.match(text, /Reused — already covered/);
  assert.match(text, /verbatim/i);
});

test("buildPlannerPack respects the char budget", () => {
  const text = buildPlannerPack(profile(), 40);
  assert.ok(text.length <= 40, `len ${text.length}`);
});

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
