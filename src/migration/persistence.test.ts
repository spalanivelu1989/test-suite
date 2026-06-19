import assert from "node:assert/strict";
import { test } from "node:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import {
  deleteEnvironment,
  listEnvironments,
  saveEnvironment,
  slugify,
} from "./persistence";
import type { MigrationEnvironment } from "./types";

const TMP = ".tmp-migration-env-test";

async function cleanup() {
  await rm(join(process.cwd(), TMP), { recursive: true, force: true });
}

test("slugify produces stable, safe ids", () => {
  assert.equal(slugify("BTP Staging!"), "btp-staging");
  assert.equal(slugify("  --x--  "), "x");
  assert.equal(slugify("@@@"), "env");
});

test("environments: empty → save (upsert) → list → delete", async () => {
  await cleanup();
  try {
    assert.deepEqual(await listEnvironments(TMP), []);

    const env: MigrationEnvironment = {
      id: "e1",
      label: "BTP staging",
      sourceAppId: "https://app.lovable.app",
      targetUrl: "https://app.cfapps.hana.ondemand.com",
      pathPrefix: "/myapp",
    };
    await saveEnvironment(env, TMP);
    let all = await listEnvironments(TMP);
    assert.equal(all.length, 1);
    assert.equal(all[0].targetUrl, env.targetUrl);

    // Upsert by id — no duplicate.
    await saveEnvironment(
      { ...env, targetUrl: "https://new.example.com" },
      TMP,
    );
    all = await listEnvironments(TMP);
    assert.equal(all.length, 1);
    assert.equal(all[0].targetUrl, "https://new.example.com");

    assert.equal(await deleteEnvironment("e1", TMP), true);
    assert.deepEqual(await listEnvironments(TMP), []);
    assert.equal(await deleteEnvironment("e1", TMP), false);
  } finally {
    await cleanup();
  }
});
