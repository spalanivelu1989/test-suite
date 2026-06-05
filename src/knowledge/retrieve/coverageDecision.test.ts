import assert from "node:assert/strict";
import { test } from "node:test";
import { significantTokens } from "../../coverage/coverage";
import type { SpecRow } from "../store/repo";
import { decideForSpecs, overlapCoefficient } from "./coverageDecision";

function spec(title: string, outcome: string | null): SpecRow {
  return {
    runId: "r1",
    file: `${title}.spec.ts`,
    title,
    flowId: null,
    tokens: [...significantTokens(title)],
    lastOutcome: outcome,
    embedding: null,
  };
}

test("overlapCoefficient is 1 for subset, 0 for disjoint", () => {
  assert.equal(
    overlapCoefficient(new Set(["a", "b"]), new Set(["a", "b", "c"])),
    1,
  );
  assert.equal(overlapCoefficient(new Set(["a"]), new Set(["x"])), 0);
});

test("exact match with a passing prior run → reuse (AC9)", () => {
  const specs = [spec("Hero Get in Touch CTA Button", "passed")];
  const [d] = decideForSpecs([{ name: "Hero Get in Touch CTA Button" }], specs);
  assert.equal(d.action, "reuse");
  assert.ok(d.matchedSpec);
});

test("strong match but last run FAILED → extend, never reuse (errs safe)", () => {
  const specs = [spec("Hero Get in Touch CTA Button", "failed")];
  const [d] = decideForSpecs([{ name: "Hero Get in Touch CTA Button" }], specs);
  assert.equal(d.action, "extend");
});

test("partial overlap (0.45–0.80) → extend (AC9/SC7)", () => {
  // scenario {footer,social,links,extra} vs spec {footer,social,links,bottom}
  // → 3/4 = 0.75 overlap → extend (below the 0.80 reuse bar)
  const specs = [spec("Footer Social Links Bottom", "passed")];
  const [d] = decideForSpecs([{ name: "Footer Social Links Extra" }], specs);
  assert.equal(d.action, "extend");
  assert.ok(d.score >= 0.45 && d.score < 0.8, `score ${d.score}`);
});

test("no overlap / paraphrase → new (AC9/SC8)", () => {
  const specs = [spec("Hero Get in Touch CTA", "passed")];
  // same intent, totally different words — lexical miss is expected
  const [d] = decideForSpecs(
    [{ name: "Send a message via the contact widget" }],
    specs,
  );
  assert.equal(d.action, "new");
});

test("no existing specs → all new", () => {
  const ds = decideForSpecs([{ name: "Anything" }, { name: "Else" }], []);
  assert.deepEqual(
    ds.map((d) => d.action),
    ["new", "new"],
  );
});

// ── Phase 2: hybrid (lexical OR semantic) decisions ──────────────────────────

import type { ScenarioInput } from "../types";

/** Spec with an embedding and lexically-distinct tokens. */
function specEmb(
  outcome: string | null,
  embedding: number[],
  tokens: string[],
): SpecRow {
  return {
    runId: "r1",
    file: "s.spec.ts",
    title: "Existing spec",
    flowId: null,
    tokens,
    lastOutcome: outcome,
    embedding,
  };
}

const SPEC_A_EMB = [1, 0, 0]; // a passed spec, tokens ["alpha"] (lexically distinct)

test("paraphrase: high semantic + zero lexical, prior passed → reuse (R5/SC2)", () => {
  const specs = [specEmb("passed", SPEC_A_EMB, ["alpha"])];
  const sc: ScenarioInput = { name: "totally different words", embedding: [0.99, 0.14, 0] };
  const [d] = decideForSpecs([sc], specs);
  assert.equal(d.action, "reuse"); // sem ≈ 0.99 ≥ SEM_REUSE, lexical = 0
});

test("mid semantic → extend (SC3)", () => {
  const specs = [specEmb("passed", SPEC_A_EMB, ["alpha"])];
  const [d] = decideForSpecs([{ name: "x y z", embedding: [0.7, 0.71, 0] }], specs);
  assert.equal(d.action, "extend"); // sem ≈ 0.70: between SEM_EXTEND and SEM_REUSE
});

test("low semantic + low lexical → new (SC4)", () => {
  const specs = [specEmb("passed", SPEC_A_EMB, ["alpha"])];
  const [d] = decideForSpecs([{ name: "p q r", embedding: [0, 1, 0] }], specs);
  assert.equal(d.action, "new"); // sem = 0, lexical = 0
});

test("near-threshold semantic → new, not reuse (SC5 — err safe)", () => {
  const specs = [specEmb("passed", SPEC_A_EMB, ["alpha"])];
  const [d] = decideForSpecs([{ name: "p q r", embedding: [0.6, 0.8, 0] }], specs);
  assert.equal(d.action, "new"); // sem = 0.60 < SEM_EXTEND (0.62)
});

test("strong semantic but prior FAILED → extend, never reuse", () => {
  const specs = [specEmb("failed", SPEC_A_EMB, ["alpha"])];
  const [d] = decideForSpecs([{ name: "diff", embedding: [0.99, 0.14, 0] }], specs);
  assert.equal(d.action, "extend");
});

test("ADDITIVE no-regression: stripping embeddings reverts to lexical (R8/N3/AC7)", () => {
  // Reuse-via-semantic with embeddings present...
  const specsWith = [specEmb("passed", SPEC_A_EMB, ["alpha"])];
  const scWith: ScenarioInput = { name: "totally different words", embedding: [0.99, 0.14, 0] };
  assert.equal(decideForSpecs([scWith], specsWith)[0].action, "reuse");

  // ...with embeddings removed, the SAME inputs decide purely lexically → new
  // (disjoint tokens). Semantic only ADDS; removing it never makes it worse.
  const specsWithout = [specEmb("passed", [], ["alpha"]) /* no embedding */];
  specsWithout[0].embedding = null;
  const scWithout: ScenarioInput = { name: "totally different words" };
  assert.equal(decideForSpecs([scWithout], specsWithout)[0].action, "new");
});

test("decision is deterministic across repeats (N4)", () => {
  const specs = [specEmb("passed", SPEC_A_EMB, ["alpha"])];
  const sc: ScenarioInput = { name: "diff", embedding: [0.99, 0.14, 0] };
  const a = JSON.stringify(decideForSpecs([sc], specs));
  const b = JSON.stringify(decideForSpecs([sc], specs));
  assert.equal(a, b);
});
