import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { test } from "node:test";
import type { Run } from "../types";
import { createDiskPersistence } from "./persistence";

function makeRun(id: string): Run {
  const now = new Date().toISOString();
  return {
    id,
    config: { url: "https://example.com" },
    status: "completed",
    stage: "done",
    events: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** Run a body against an isolated temp runs-root, then clean it up. */
async function withTempPersistence(
  body: (p: ReturnType<typeof createDiskPersistence>) => Promise<void>,
): Promise<void> {
  const baseDir = `.runs-test-${randomUUID()}`;
  try {
    await body(createDiskPersistence(baseDir));
  } finally {
    await rm(baseDir, { recursive: true, force: true });
  }
}

test("save then get round-trips a run", async () => {
  await withTempPersistence(async (p) => {
    const run = makeRun("r1");
    await p.save(run);
    const back = await p.get("r1");
    assert.equal(back?.id, "r1");
    assert.equal(back?.status, "completed");
    assert.equal(back?.config.url, "https://example.com");
  });
});

test("list returns every saved run", async () => {
  await withTempPersistence(async (p) => {
    await p.save(makeRun("a"));
    await p.save(makeRun("b"));
    const ids = (await p.list()).map((r) => r.id).sort();
    assert.deepEqual(ids, ["a", "b"]);
  });
});

test("get returns undefined for an unknown id", async () => {
  await withTempPersistence(async (p) => {
    assert.equal(await p.get("missing"), undefined);
  });
});

test("remove purges a run and reports whether it existed", async () => {
  await withTempPersistence(async (p) => {
    await p.save(makeRun("gone"));
    assert.equal(await p.remove("gone"), true);
    assert.equal(await p.get("gone"), undefined);
    assert.equal(await p.remove("gone"), false); // already gone
  });
});
