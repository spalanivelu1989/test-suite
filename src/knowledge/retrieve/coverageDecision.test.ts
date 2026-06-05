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
