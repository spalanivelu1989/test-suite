import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, rm, writeFile } from "node:fs/promises";
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

test("createWorkspace wires the per-spec streaming reporter", async () => {
  const id = `test-${randomUUID()}`;
  const ws = await createWorkspace(id);
  try {
    // The reporter file exists and the config references it (so the suite streams
    // per-spec results live, not only the end-of-run json).
    assert.ok(existsSync(join(ws.root, "spec-stream.cjs")));
    const config = await readFile(ws.configPath, "utf8");
    assert.match(config, /reporter: \[\['json'.*\['\.\/spec-stream\.cjs'\]\]/);
    const reporter = await readFile(join(ws.root, "spec-stream.cjs"), "utf8");
    assert.match(reporter, /onTestEnd/);
    assert.match(reporter, /@@SPEC@@/);
  } finally {
    await rm(ws.root, { recursive: true, force: true });
  }
});

test("no auth → no globalSetup / global-setup.ts (unchanged behaviour)", async () => {
  const id = `test-${randomUUID()}`;
  const ws = await createWorkspace(id);
  try {
    const config = await readFile(ws.configPath, "utf8");
    assert.ok(!config.includes("globalSetup"));
    assert.ok(!existsSync(join(ws.root, "global-setup.ts")));
    assert.ok(!config.includes("workers: 1")); // parallel by default
  } finally {
    await rm(ws.root, { recursive: true, force: true });
  }
});

test("serial option pins the suite to one worker (stateful apps)", async () => {
  const id = `test-${randomUUID()}`;
  const ws = await createWorkspace(id, undefined, { serial: true });
  try {
    const config = await readFile(ws.configPath, "utf8");
    assert.match(config, /workers: 1/);
    assert.match(config, /fullyParallel: false/);
  } finally {
    await rm(ws.root, { recursive: true, force: true });
  }
});

test("auth → generates a globalSetup that re-logs-in fresh from the entry URL", async () => {
  const id = `test-${randomUUID()}`;
  const ws = await createWorkspace(id, undefined, {
    authEnabled: true,
    entryUrl: "https://app.test/single",
  });
  try {
    const config = await readFile(ws.configPath, "utf8");
    assert.match(config, /globalSetup: '\.\/global-setup\.ts'/);
    assert.match(config, /storageState: '\.auth\/storageState\.json'/);

    const setup = await readFile(join(ws.root, "global-setup.ts"), "utf8");
    assert.match(setup, /export default async function globalSetup/);
    assert.match(setup, /https:\/\/app\.test\/single/); // entry URL baked in
    assert.match(setup, /TARGET_USERNAME/); // creds read from env at run time
    assert.match(setup, /TARGET_IDP/); // IDP chooser support
    assert.match(setup, /storageState\(\{ path: STATE_PATH \}\)/); // writes fresh state
    assert.match(setup, /isAppSessionCookie/); // guards on a real session cookie, not CDN/bot cookies
    assert.match(setup, /NON_AUTH_COOKIE/); // excludes __cf_bm/__dpl etc. from the session check
    assert.match(setup, /AUTH_LOCALSTORAGE/); // also accepts a localStorage JWT (Supabase/SPA logins)
    assert.match(setup, /while \(Date\.now\(\) < deadline\)/); // polls for the session to materialise (SPA XHR has no redirect)
    assert.match(setup, /auth did not complete/); // aborts the run when login didn't close
    assert.match(setup, /name: idp, exact: true/); // picks the IdP by exact label (no wrong-provider lockout)
    assert.match(setup, /passField\(\)\.waitFor\(\{ timeout: 20000 \}\)/); // two-step: waits for password to render
    assert.match(setup, /networkidle', \{ timeout: 7000 \}/); // bounded idle, no 30s stalls
    // Public-site safety net: polls for a login form and returns (no abort) if none renders.
    assert.match(setup, /no login form found/);
    assert.match(setup, /the app appears to be public/);
    assert.match(setup, /while \(Date\.now\(\) < probeDeadline\)/);
  } finally {
    await rm(ws.root, { recursive: true, force: true });
  }
});

test("disableAuth strips globalSetup/storageState and removes global-setup.ts", async () => {
  const id = `test-${randomUUID()}`;
  const ws = await createWorkspace(id, undefined, {
    authEnabled: true,
    entryUrl: "https://app.test/single",
  });
  try {
    // Sanity: auth scaffolding is present before disabling.
    assert.ok(existsSync(join(ws.root, "global-setup.ts")));

    await ws.disableAuth();

    const config = await readFile(ws.configPath, "utf8");
    assert.ok(!config.includes("globalSetup"));
    assert.ok(!config.includes("storageState"));
    assert.ok(!existsSync(join(ws.root, "global-setup.ts")));
  } finally {
    await rm(ws.root, { recursive: true, force: true });
  }
});

test("disableAuth preserves the serial setting when rewriting the config", async () => {
  const id = `test-${randomUUID()}`;
  const ws = await createWorkspace(id, undefined, {
    authEnabled: true,
    entryUrl: "https://app.test/single",
    serial: true,
  });
  try {
    await ws.disableAuth();
    const config = await readFile(ws.configPath, "utf8");
    assert.match(config, /workers: 1/); // serial must survive auth teardown
    assert.ok(!config.includes("globalSetup"));
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

test("writePlan saves a plan that readPlan reads back", async () => {
  const id = `test-${randomUUID()}`;
  const ws = await createWorkspace(id);
  try {
    await ws.writePlan("# Trimmed Plan\n\n#### 1.1 Home");
    const plan = await readPlan(ws);
    assert.match(plan ?? "", /# Trimmed Plan/);
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
