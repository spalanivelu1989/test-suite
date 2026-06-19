import assert from "node:assert/strict";
import { test } from "node:test";
import type { Run, RunReport, TestResult } from "../types";
import {
  extractTitle,
  listSourceApps,
  listSourceSpecs,
  resolveSourceRun,
  specsForRun,
  toSpecOutcome,
  type RunReader,
} from "./sourceSpecs";

// --- fixtures -------------------------------------------------------------

function spec(file: string, title: string): { file: string; code: string } {
  return {
    file,
    code: `import { test } from '@playwright/test';\ntest('${title}', async ({ page }) => {});`,
  };
}

function result(fileName: string, outcome: TestResult["outcome"]): TestResult {
  return { flowId: fileName, fileName, outcome };
}

function run(
  id: string,
  url: string,
  createdAt: string,
  opts: {
    status?: Run["status"];
    specs?: { file: string; code: string }[];
    results?: TestResult[];
  } = {},
): Run {
  const report: RunReport | undefined = opts.specs
    ? ({
        runId: id,
        url,
        generatedSpecs: opts.specs,
        results: opts.results ?? [],
      } as unknown as RunReport)
    : undefined;
  return {
    id,
    config: { url },
    status: opts.status ?? "completed",
    stage: "done",
    events: [],
    createdAt,
    updatedAt: createdAt,
    report,
  } as Run;
}

function reader(runs: Run[]): RunReader {
  return {
    async list() {
      return runs;
    },
    async get(id: string) {
      return runs.find((r) => r.id === id);
    },
  };
}

// --- pure helpers ---------------------------------------------------------

test("toSpecOutcome maps outcomes, flaky/unknown → unknown", () => {
  assert.equal(toSpecOutcome("passed"), "passed");
  assert.equal(toSpecOutcome("healed"), "healed");
  assert.equal(toSpecOutcome("failed"), "failed");
  assert.equal(toSpecOutcome("fixme"), "failed");
  assert.equal(toSpecOutcome("flaky"), "unknown");
  assert.equal(toSpecOutcome(undefined), "unknown");
});

test("extractTitle handles single, double, and template quotes", () => {
  assert.equal(extractTitle(`test('Add todo', async () => {})`), "Add todo");
  assert.equal(
    extractTitle(`test.fixme("Quarantined", async () => {})`),
    "Quarantined",
  );
  assert.equal(
    extractTitle("test(`Charts tab`, async () => {})"),
    "Charts tab",
  );
  assert.equal(extractTitle(`// no test here`), null);
});

test("specsForRun joins each spec to its last outcome by fileName", () => {
  const r = run("r1", "https://app.lovable.app", "2026-01-01", {
    specs: [spec("a.spec.ts", "A"), spec("b.spec.ts", "B")],
    results: [result("a.spec.ts", "passed"), result("b.spec.ts", "failed")],
  });
  const specs = specsForRun(r);
  assert.deepEqual(
    specs.map((s) => [s.file, s.title, s.sourceOutcome]),
    [
      ["a.spec.ts", "A", "passed"],
      ["b.spec.ts", "B", "failed"],
    ],
  );
});

test("specsForRun returns unknown outcome when no matching result", () => {
  const r = run("r1", "https://app.lovable.app", "2026-01-01", {
    specs: [spec("orphan.spec.ts", "Orphan")],
    results: [],
  });
  assert.equal(specsForRun(r)[0].sourceOutcome, "unknown");
});

// --- listSourceApps -------------------------------------------------------

test("listSourceApps groups by origin, counts runs, newest URL wins", async () => {
  const runs = [
    run("r1", "https://app.lovable.app/x", "2026-01-01", {
      specs: [spec("a.spec.ts", "A")],
    }),
    run("r2", "https://www.App.lovable.app/y", "2026-02-01", {
      specs: [spec("b.spec.ts", "B")],
    }),
    run("r3", "https://other.com", "2026-01-15", {
      specs: [spec("c.spec.ts", "C")],
    }),
  ];
  const apps = await listSourceApps(reader(runs));
  assert.equal(apps.length, 2);
  const lovable = apps.find((a) => a.appId === "https://app.lovable.app");
  assert.ok(lovable);
  assert.equal(lovable!.runCount, 2);
  assert.equal(lovable!.url, "https://www.App.lovable.app/y"); // newest
  assert.equal(lovable!.lastRunAt, "2026-02-01");
});

test("listSourceApps excludes runs without specs and unknown URLs", async () => {
  const runs = [
    run("r1", "https://a.com", "2026-01-01"), // no specs
    run("r2", "(unknown)", "2026-01-02", { specs: [spec("x.spec.ts", "X")] }),
    run("r3", "https://b.com", "2026-01-03", {
      specs: [spec("y.spec.ts", "Y")],
    }),
  ];
  const apps = await listSourceApps(reader(runs));
  assert.deepEqual(
    apps.map((a) => a.appId),
    ["https://b.com"],
  );
});

// --- resolveSourceRun -----------------------------------------------------

test("resolveSourceRun picks the latest completed spec-bearing run for the app", async () => {
  const runs = [
    run("old", "https://a.com", "2026-01-01", {
      specs: [spec("a.spec.ts", "A")],
    }),
    run("new", "https://a.com", "2026-03-01", {
      specs: [spec("a.spec.ts", "A")],
    }),
    run("running", "https://a.com", "2026-04-01", {
      status: "running",
      specs: [spec("a.spec.ts", "A")],
    }),
  ];
  const r = await resolveSourceRun("https://a.com", undefined, reader(runs));
  assert.equal(r?.id, "new"); // newest *completed* one
});

test("resolveSourceRun honors an explicit runId when it has specs", async () => {
  const runs = [
    run("explicit", "https://a.com", "2026-01-01", {
      specs: [spec("a.spec.ts", "A")],
    }),
  ];
  const r = await resolveSourceRun("https://a.com", "explicit", reader(runs));
  assert.equal(r?.id, "explicit");
});

test("resolveSourceRun returns null when the app has no spec-bearing run", async () => {
  const runs = [run("r1", "https://a.com", "2026-01-01")];
  assert.equal(
    await resolveSourceRun("https://a.com", undefined, reader(runs)),
    null,
  );
});

// --- listSourceSpecs ------------------------------------------------------

test("listSourceSpecs returns resolved runId + specs", async () => {
  const runs = [
    run("r1", "https://a.com", "2026-03-01", {
      specs: [spec("a.spec.ts", "A")],
      results: [result("a.spec.ts", "passed")],
    }),
  ];
  const out = await listSourceSpecs("https://a.com", undefined, reader(runs));
  assert.equal(out?.sourceRunId, "r1");
  assert.equal(out?.specs.length, 1);
  assert.equal(out?.specs[0].sourceOutcome, "passed");
});

test("listSourceSpecs returns null when nothing migratable", async () => {
  assert.equal(
    await listSourceSpecs("https://none.com", undefined, reader([])),
    null,
  );
});
