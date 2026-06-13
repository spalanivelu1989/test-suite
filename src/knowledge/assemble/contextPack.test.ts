import assert from "node:assert/strict";
import { test } from "node:test";
import type { CoverageDecision, SpecRef } from "../types";
import { buildDesignerPack } from "./contextPack";

test("buildDesignerPack passes decisions and full reuse source through (copy-forward payload, unbounded)", () => {
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
  const pack = buildDesignerPack(decisions, specs);
  assert.equal(pack.decisions.length, 1);
  // Source is the copy-forward payload — it must survive intact, never clipped,
  // so every confirmed-coverage spec can be copied no matter the suite size.
  assert.equal(pack.specs[0].code, "x".repeat(100));
});

test("buildDesignerPack keeps every reuse spec's source, even for a large suite", () => {
  // Regression: an 8-spec suite whose combined source exceeds the old 8KB budget
  // used to drop the tail (e.g. email/linkedin), regenerating covered scenarios.
  const decisions: CoverageDecision[] = [];
  const specs: SpecRef[] = Array.from({ length: 8 }, (_, i) => ({
    runId: "r1",
    file: `spec-${i}.spec.ts`,
    title: `Scenario ${i}`,
    code: "y".repeat(1500), // 8 × 1500 = 12KB > old 8KB cap
  }));
  const pack = buildDesignerPack(decisions, specs);
  assert.equal(pack.specs.length, 8);
  assert.ok(
    pack.specs.every((s) => s.code === "y".repeat(1500)),
    "no spec source may be dropped or clipped",
  );
});
