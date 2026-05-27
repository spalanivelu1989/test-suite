import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { createWorkspace, readGeneratedSpecs, readPlan } from "./workspace";

test("createWorkspace builds an isolated run dir with seed + config", async () => {
  const id = `test-${randomUUID()}`;
  const ws = await createWorkspace(id);
  try {
    assert.ok(existsSync(ws.seedPath));
    assert.ok(existsSync(ws.configPath));
    assert.ok(existsSync(ws.specsDir));
    assert.ok(existsSync(ws.testsDir));
  } finally {
    await rm(ws.root, { recursive: true, force: true });
  }
});

test("readPlan and readGeneratedSpecs read back what agents write", async () => {
  const id = `test-${randomUUID()}`;
  const ws = await createWorkspace(id);
  try {
    await writeFile(
      join(ws.specsDir, "plan.md"),
      "# Plan\n\n## 1. Home",
      "utf8",
    );
    await writeFile(
      join(ws.testsDir, "home.spec.ts"),
      "import {test} from '@playwright/test';",
      "utf8",
    );

    const plan = await readPlan(ws);
    assert.match(plan ?? "", /# Plan/);

    const specs = await readGeneratedSpecs(ws);
    assert.equal(specs.length, 1);
    assert.equal(specs[0].file, "home.spec.ts");
    assert.match(specs[0].code, /@playwright\/test/);
  } finally {
    await rm(ws.root, { recursive: true, force: true });
  }
});

test("readPlan returns null when no plan was saved", async () => {
  const id = `test-${randomUUID()}`;
  const ws = await createWorkspace(id);
  try {
    assert.equal(await readPlan(ws), null);
  } finally {
    await rm(ws.root, { recursive: true, force: true });
  }
});
