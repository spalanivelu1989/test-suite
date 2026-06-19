import assert from "node:assert/strict";
import { test } from "node:test";
import type { Run, RunReport, TestResult } from "../types";
import type { Workspace } from "../agents/workspace";
import {
  MigrationAbortedError,
  runMigrationCheck,
  type MigrationCheckDeps,
} from "./runMigrationCheck";
import type { MigrationCheckRequest, MigrationReport } from "./types";
import type { RunReader } from "./sourceSpecs";

function sourceRun(): Run {
  const report = {
    runId: "src-run",
    url: "https://app.lovable.app",
    generatedSpecs: [
      {
        file: "a.spec.ts",
        code: "test('A', async () => { await page.goto('https://app.lovable.app/a'); })",
      },
      {
        file: "b.spec.ts",
        code: "test('B', async () => { await page.goto('https://app.lovable.app/b'); })",
      },
    ],
    results: [
      { flowId: "a.spec.ts", fileName: "a.spec.ts", outcome: "passed" },
      { flowId: "b.spec.ts", fileName: "b.spec.ts", outcome: "passed" },
    ] as TestResult[],
  } as unknown as RunReport;
  return {
    id: "src-run",
    config: { url: "https://app.lovable.app" },
    status: "completed",
    stage: "done",
    events: [],
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    report,
  } as Run;
}

function reader(run: Run): RunReader {
  return {
    async list() {
      return [run];
    },
    async get(id) {
      return id === run.id ? run : undefined;
    },
  };
}

const baseReq: MigrationCheckRequest = {
  sourceUrl: "https://app.lovable.app",
  targetUrl: "https://app.cfapps.hana.ondemand.com",
  selectedSpecFiles: ["a.spec.ts", "b.spec.ts"],
  auth: { username: "migration-user", password: "secret" },
  options: { reruns: 2 },
};

test("runMigrationCheck produces a diff, exports auth env during the run, and persists", async () => {
  let observedUser: string | undefined;
  let observedReruns = -1;
  const persisted: MigrationReport[] = [];

  const deps: MigrationCheckDeps = {
    reader: reader(sourceRun()),
    newId: () => "mig-test-1",
    now: () => "2026-06-17T00:00:00.000Z",
    prepare: async (_id, _req, specs) => ({
      ws: {} as Workspace,
      written: specs.map((s) => ({ file: s.file, code: s.code })),
    }),
    assess: async (_ws, reruns) => {
      observedUser = process.env.TARGET_USERNAME;
      observedReruns = reruns;
      return {
        results: [
          { flowId: "a.spec.ts", fileName: "a.spec.ts", outcome: "passed" },
          {
            flowId: "b.spec.ts",
            fileName: "b.spec.ts",
            outcome: "failed",
            failureReason: "redirected to SSO login (401)",
          },
        ] as TestResult[],
        flakeRate: 0,
      };
    },
    fingerprint: async () => ({ status: "match", sharedAssetCount: 5 }),
    persist: async (r) => {
      persisted.push(r);
    },
  };

  const report = await runMigrationCheck(baseReq, deps);

  // Auth was exported while the suite ran, then cleaned up afterward.
  assert.equal(observedUser, "migration-user");
  assert.equal(observedReruns, 2);
  assert.equal(process.env.TARGET_USERNAME, undefined);

  // Shape + provenance.
  assert.equal(report.id, "mig-test-1");
  assert.equal(report.sourceRunId, "src-run");
  assert.equal(report.generatedAt, "2026-06-17T00:00:00.000Z");
  assert.equal(report.fingerprint.status, "match");
  assert.equal(report.fingerprint.sharedAssetCount, 5);

  // Diff: a passed, b failed for an auth reason → infra.
  assert.equal(report.summary.stillPassing, 1);
  assert.equal(report.summary.infra, 1);
  assert.equal(report.summary.behavioral, 0);

  // Target report assembled (pure, no Claude).
  assert.equal(report.targetReport.url, baseReq.targetUrl);
  assert.equal(report.targetReport.results.length, 2);

  assert.equal(persisted.length, 1);
  assert.equal(persisted[0].id, "mig-test-1");
});

test("runMigrationCheck skips the fingerprint when fingerprintCheck is false", async () => {
  let fingerprintCalled = false;
  const report = await runMigrationCheck(
    { ...baseReq, options: { reruns: 2, fingerprintCheck: false } },
    {
      reader: reader(sourceRun()),
      prepare: async (_id, _req, specs) => ({
        ws: {} as Workspace,
        written: specs.map((s) => ({ file: s.file, code: s.code })),
      }),
      assess: async () => ({ results: [], flakeRate: 0 }),
      fingerprint: async () => {
        fingerprintCalled = true;
        return { status: "match", sharedAssetCount: 1 };
      },
      persist: async () => {},
    },
  );
  assert.equal(fingerprintCalled, false);
  assert.equal(report.fingerprint.status, "skipped");
});

test("runMigrationCheck (heal on): a spec the Evolver modified is flagged 'healed', not 'ok'", async () => {
  let healCalled = false;
  const report = await runMigrationCheck(
    { ...baseReq, options: { reruns: 2, heal: true, fingerprintCheck: false } },
    {
      reader: reader(sourceRun()),
      prepare: async (_id, _req, specs) => ({
        ws: {} as Workspace,
        written: specs.map((s) => ({ file: s.file, code: "ORIGINAL" })),
      }),
      heal: async () => {
        healCalled = true;
      },
      // After healing, b.spec.ts was rewritten; a.spec.ts untouched.
      readSpecs: async () => [
        { file: "a.spec.ts", code: "ORIGINAL" },
        { file: "b.spec.ts", code: "CHANGED BY EVOLVER" },
      ],
      assess: async () => ({
        results: [
          { flowId: "a.spec.ts", fileName: "a.spec.ts", outcome: "passed" },
          { flowId: "b.spec.ts", fileName: "b.spec.ts", outcome: "passed" },
        ] as TestResult[],
        flakeRate: 0,
      }),
      persist: async () => {},
    },
  );

  assert.equal(healCalled, true);
  assert.equal(report.summary.stillPassing, 1); // a.spec.ts
  assert.equal(report.summary.healed, 1); // b.spec.ts needed a fix
  const b = report.diff.find((d) => d.file === "b.spec.ts");
  assert.equal(b?.classification, "healed");
});

test("runMigrationCheck surfaces a setupError and classifies un-run specs as infra", async () => {
  const report = await runMigrationCheck(
    { ...baseReq, options: { reruns: 2, fingerprintCheck: false } },
    {
      reader: reader(sourceRun()),
      prepare: async (_id, _req, specs) => ({
        ws: {} as Workspace,
        written: specs.map((s) => ({ file: s.file, code: s.code })),
      }),
      // Suite produced no results (aborted).
      assess: async () => ({ results: [], flakeRate: 0 }),
      readSetupError: async () => "[global-setup] auth did not complete",
      persist: async () => {},
    },
  );
  assert.match(report.setupError ?? "", /auth did not complete/);
  assert.equal(report.summary.infra, 2);
  assert.equal(report.summary.behavioral, 0);
});

test("runMigrationCheck aborts (throws, no persist) when the controller is already aborted", async () => {
  const ac = new AbortController();
  ac.abort();
  let persisted = false;
  await assert.rejects(
    runMigrationCheck(baseReq, {
      reader: reader(sourceRun()),
      abortController: ac,
      persist: async () => {
        persisted = true;
      },
    }),
    (e) => e instanceof MigrationAbortedError,
  );
  assert.equal(persisted, false);
});

test("runMigrationCheck passes the abort signal to assess", async () => {
  const ac = new AbortController();
  let receivedSignal: AbortSignal | undefined;
  await runMigrationCheck(baseReq, {
    reader: reader(sourceRun()),
    abortController: ac,
    prepare: async (_id, _req, specs) => ({
      ws: {} as Workspace,
      written: specs.map((s) => ({ file: s.file, code: s.code })),
    }),
    assess: async (_ws, _reruns, signal) => {
      receivedSignal = signal;
      return { results: [], flakeRate: 0 };
    },
    fingerprint: async () => ({ status: "skipped", sharedAssetCount: 0 }),
    readSetupError: async () => undefined,
    persist: async () => {},
  });
  assert.equal(receivedSignal, ac.signal);
});

test("runMigrationCheck throws when the source app has no run", async () => {
  await assert.rejects(
    runMigrationCheck(baseReq, {
      reader: reader({ ...sourceRun(), report: undefined } as Run),
    }),
    /No prior run with specs/,
  );
});

test("runMigrationCheck throws when no selected spec matches", async () => {
  await assert.rejects(
    runMigrationCheck(
      { ...baseReq, selectedSpecFiles: ["nonexistent.spec.ts"] },
      {
        reader: reader(sourceRun()),
        prepare: async () => ({ ws: {} as Workspace, written: [] }),
        assess: async () => ({ results: [], flakeRate: 0 }),
        persist: async () => {},
      },
    ),
    /None of the selected specs/,
  );
});
