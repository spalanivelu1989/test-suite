import assert from "node:assert/strict";
import { test } from "node:test";
import type { HealingEvent, HealingPrecedent } from "../types";
import { computeHealProvenance } from "./provenance";

function ev(p: Partial<HealingEvent>): HealingEvent {
  return {
    runId: "r1",
    appId: "app",
    flowId: null,
    file: "a.spec.ts",
    failureSignature: "sig",
    before: "old",
    after: "new",
    strategy: "role-locator",
    outcome: "healed",
    ...p,
  };
}

function prec(signature: string): HealingPrecedent {
  return {
    runId: "r0",
    file: "x.spec.ts",
    flowId: null,
    failureSignature: signature,
    strategy: "role-locator",
    before: "b",
    after: "a",
    score: 0.9,
  };
}

test("provenance: all-zero with no heals", () => {
  assert.deepEqual(computeHealProvenance([], []), {
    healed: 0,
    templateDirected: 0,
    blind: 0,
    hdrRate: 0,
    quarantined: 0,
  });
});

test("provenance: a heal with a matching precedent is template-directed (HDR)", () => {
  const out = computeHealProvenance(
    [ev({ file: "a.spec.ts", failureSignature: "timeout" })],
    [prec("timeout")],
  );
  assert.deepEqual(out, {
    healed: 1,
    templateDirected: 1,
    blind: 0,
    hdrRate: 1,
    quarantined: 0,
  });
});

test("provenance: a heal with no matching precedent is blind (NHEJ)", () => {
  const out = computeHealProvenance(
    [ev({ file: "a.spec.ts", failureSignature: "timeout" })],
    [prec("strict-mode")],
  );
  assert.equal(out.healed, 1);
  assert.equal(out.templateDirected, 0);
  assert.equal(out.blind, 1);
  assert.equal(out.hdrRate, 0);
});

test("provenance: multiple hunks of one spec collapse to a single repair", () => {
  // captureHeal emits one event per changed hunk; same file → one repair.
  const out = computeHealProvenance(
    [
      ev({ file: "a.spec.ts", failureSignature: "timeout", before: "h1" }),
      ev({ file: "a.spec.ts", failureSignature: "timeout", before: "h2" }),
    ],
    [prec("timeout")],
  );
  assert.equal(out.healed, 1);
  assert.equal(out.templateDirected, 1);
});

test("provenance: quarantines are excluded from the HDR/NHEJ denominator", () => {
  const out = computeHealProvenance(
    [
      ev({ file: "a.spec.ts", failureSignature: "timeout" }),
      ev({ file: "b.spec.ts", outcome: "fixme", failureSignature: "x" }),
    ],
    [prec("timeout")],
  );
  assert.equal(out.healed, 1);
  assert.equal(out.templateDirected, 1);
  assert.equal(out.blind, 0);
  assert.equal(out.quarantined, 1);
  assert.equal(out.hdrRate, 1);
});

test("provenance: an empty signature never counts as template-directed", () => {
  // An empty precedent signature must not match an empty heal signature.
  const out = computeHealProvenance(
    [ev({ file: "a.spec.ts", failureSignature: "" })],
    [prec("")],
  );
  assert.equal(out.healed, 1);
  assert.equal(out.templateDirected, 0);
  assert.equal(out.blind, 1);
});

test("provenance: computes a mixed-pathway rate", () => {
  const out = computeHealProvenance(
    [
      ev({ file: "a.spec.ts", failureSignature: "timeout" }),
      ev({ file: "b.spec.ts", failureSignature: "strict-mode" }),
      ev({ file: "c.spec.ts", failureSignature: "detached" }),
      ev({ file: "d.spec.ts", failureSignature: "unknown" }),
    ],
    [prec("timeout"), prec("strict-mode"), prec("detached")],
  );
  assert.equal(out.healed, 4);
  assert.equal(out.templateDirected, 3);
  assert.equal(out.blind, 1);
  assert.equal(out.hdrRate, 0.75);
});
