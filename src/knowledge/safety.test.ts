import assert from "node:assert/strict";
import { test } from "node:test";
import { withKb } from "./safety";

test("withKb returns the operation's value on success", async () => {
  const v = await withKb("ok", async () => 42, -1);
  assert.equal(v, 42);
});

test("withKb returns the fallback and never throws on error (R4/N3)", async () => {
  let captured = "";
  const v = await withKb(
    "boom",
    async () => {
      throw new Error("db is down");
    },
    "fallback",
    { onError: (_op, m) => (captured = m) },
  );
  assert.equal(v, "fallback");
  assert.match(captured, /db is down/);
});

test("withKb returns the fallback on timeout", async () => {
  const v = await withKb(
    "slow",
    () => new Promise((r) => setTimeout(() => r("late"), 100)),
    "fallback",
    { timeoutMs: 10 },
  );
  assert.equal(v, "fallback");
});
