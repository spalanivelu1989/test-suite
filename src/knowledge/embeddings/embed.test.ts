import assert from "node:assert/strict";
import { test } from "node:test";
import { cosineSim, FakeEmbedder, l2normalize } from "./embed";

test("l2normalize produces a unit vector (or passes through zero)", () => {
  const u = l2normalize([3, 4]);
  assert.ok(Math.abs(Math.hypot(u[0], u[1]) - 1) < 1e-9);
  assert.deepEqual(l2normalize([0, 0]), [0, 0]);
});

test("cosineSim: identical=1, orthogonal=0, opposite=-1, mismatched=0", () => {
  assert.ok(Math.abs(cosineSim([1, 0], [2, 0]) - 1) < 1e-9);
  assert.equal(cosineSim([1, 0], [0, 1]), 0);
  assert.ok(Math.abs(cosineSim([1, 0], [-1, 0]) + 1) < 1e-9);
  assert.equal(cosineSim([1, 0], [1]), 0); // length mismatch
  assert.equal(cosineSim([], []), 0);
});

test("FakeEmbedder returns injected (normalized) vectors; unknown → zero", async () => {
  const e = new FakeEmbedder({ a: [3, 4, 0] }, 3);
  const [a, b] = await e.embed(["a", "unknown"]);
  assert.ok(Math.abs(Math.hypot(...a) - 1) < 1e-9); // normalized
  assert.deepEqual(b, [0, 0, 0]); // unknown → zero → semantic score 0
  assert.equal(e.dims, 3);
});
