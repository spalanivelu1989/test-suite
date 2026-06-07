import assert from "node:assert/strict";
import { test } from "node:test";
import {
  deriveLocatorHints,
  type HealingEventRow,
  selectPrecedents,
} from "./healingPrecedents";

const row = (over: Partial<HealingEventRow>): HealingEventRow => ({
  runId: "r1",
  file: "home.spec.ts",
  flowId: "home",
  failureSignature: "timeouterror locator not found",
  strategy: "role-locator",
  before: "page.locator('#a')",
  after: "page.getByRole('button')",
  tokens: ["timeouterror", "locator", "found"],
  embedding: null,
  ...over,
});

test("selectPrecedents: lexical signature overlap clears the bar (AC7)", () => {
  const out = selectPrecedents(
    { tokens: ["timeouterror", "locator", "found"] },
    [row({})],
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].strategy, "role-locator");
  assert.ok(out[0].score >= 0.6);
});

test("selectPrecedents: semantic match clears the bar when lexical is 0", () => {
  const out = selectPrecedents(
    { tokens: ["completely", "different", "words"], embedding: [1, 0, 0] },
    [
      row({
        tokens: ["nothing", "shared", "here"],
        embedding: [0.99, 0.01, 0],
      }),
    ],
    { threshold: 0.8 },
  );
  assert.equal(out.length, 1);
  assert.ok(out[0].score >= 0.8);
});

test("selectPrecedents: below-threshold candidate dropped → no precedent", () => {
  const out = selectPrecedents({ tokens: ["unrelated", "query", "tokens"] }, [
    row({ tokens: ["totally", "other", "signature"] }),
  ]);
  assert.deepEqual(out, []);
});

test("selectPrecedents: ranks by score, respects k", () => {
  const out = selectPrecedents(
    { tokens: ["timeouterror", "locator", "found"] },
    [
      row({ runId: "weak", tokens: ["locator", "x", "y"] }),
      row({ runId: "strong", tokens: ["timeouterror", "locator", "found"] }),
    ],
    { k: 1 },
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].runId, "strong");
});

test("deriveLocatorHints: surfaces strategies for the flow, most-common first", () => {
  const hints = deriveLocatorHints(
    [
      row({ strategy: "role-locator" }),
      row({ strategy: "role-locator" }),
      row({ strategy: "wait-visibility" }),
    ],
    "home",
  );
  assert.equal(hints.length, 2);
  assert.ok(hints[0].includes("getByRole"));
});

test("deriveLocatorHints: no successful heals → no hints (Phase-2 unchanged)", () => {
  assert.deepEqual(deriveLocatorHints([]), []);
});
