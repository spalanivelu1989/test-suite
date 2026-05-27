import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assessSuiteFlakiness,
  captureResults,
  parsePlaywrightResults,
  type PlaywrightJsonReport,
} from "./parse";

const report: PlaywrightJsonReport = {
  suites: [
    {
      specs: [
        {
          title: "Home",
          file: "home.spec.ts",
          ok: true,
          tests: [{ results: [{ status: "passed" }] }],
        },
        {
          title: "Contact",
          file: "contact.spec.ts",
          ok: false,
          tests: [{ results: [{ status: "failed" }] }],
        },
      ],
      suites: [
        {
          specs: [
            {
              title: "Search",
              file: "nested/search.spec.ts",
              ok: true,
              tests: [
                {
                  annotations: [{ type: "fixme" }],
                  results: [{ status: "skipped" }],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

test("parsePlaywrightResults maps passed/failed and detects fixme", () => {
  const results = parsePlaywrightResults(report);
  const byFlow = Object.fromEntries(results.map((r) => [r.flowId, r.outcome]));
  assert.equal(byFlow["Home"], "passed");
  assert.equal(byFlow["Contact"], "failed");
  assert.equal(byFlow["Search"], "fixme");
});

test("captureResults runs the suite via the injected executor", async () => {
  const results = await captureResults(
    {
      root: "/tmp/x",
      specsDir: "",
      testsDir: "",
      seedPath: "",
      configPath: "",
    },
    async () => report,
  );
  assert.equal(results.length, 3);
});

test("assessSuiteFlakiness flags a test whose result diverges across re-runs", async () => {
  let call = 0;
  const ws = {
    root: "/tmp/x",
    specsDir: "",
    testsDir: "",
    seedPath: "",
    configPath: "",
  };
  const exec = async (): Promise<PlaywrightJsonReport> => {
    call += 1;
    return {
      suites: [
        {
          specs: [
            {
              title: "Home",
              file: "home.spec.ts",
              ok: call !== 2,
              tests: [
                { results: [{ status: call !== 2 ? "passed" : "failed" }] },
              ],
            },
            {
              title: "Contact",
              file: "contact.spec.ts",
              ok: false,
              tests: [{ results: [{ status: "failed" }] }],
            },
          ],
        },
      ],
    };
  };
  const { results, flakeRate } = await assessSuiteFlakiness(ws, 3, exec);
  assert.equal(call, 3);
  assert.equal(results.find((r) => r.flowId === "Home")?.outcome, "flaky");
  assert.equal(flakeRate, 0.5);
});
