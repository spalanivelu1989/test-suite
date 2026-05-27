import assert from "node:assert/strict";
import { test } from "node:test";
import type { GeneratedTest } from "../types";
import {
  mapPlaywrightResults,
  type PlaywrightJsonReport,
  runTests,
} from "./runner";

const tests: GeneratedTest[] = [
  { flowId: "home", fileName: "home.spec.ts", code: "", valid: true },
  {
    flowId: "broken",
    fileName: "broken.spec.ts",
    code: "",
    valid: false,
    validationError: "syntax error",
  },
];

test("mapPlaywrightResults maps pass/fail and invalid tests", () => {
  const report: PlaywrightJsonReport = {
    suites: [
      {
        specs: [
          {
            title: "home",
            file: "home.spec.ts",
            ok: true,
            tests: [{ results: [{ status: "passed" }] }],
          },
        ],
      },
    ],
  };
  const results = mapPlaywrightResults(report, tests);
  const home = results.find((r) => r.flowId === "home")!;
  const broken = results.find((r) => r.flowId === "broken")!;
  assert.equal(home.outcome, "passed");
  assert.equal(broken.outcome, "failed");
  assert.equal(broken.failureReason, "syntax error");
});

test("mapPlaywrightResults surfaces failure reason from errors", () => {
  const report: PlaywrightJsonReport = {
    suites: [
      {
        suites: [
          {
            specs: [
              {
                title: "home",
                file: "/abs/home.spec.ts",
                ok: false,
                tests: [
                  {
                    results: [
                      {
                        status: "failed",
                        error: { message: "locator not found" },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
  const home = mapPlaywrightResults(report, [tests[0]])[0];
  assert.equal(home.outcome, "failed");
  assert.equal(home.failureReason, "locator not found");
});

test("runTests executes a real passing Playwright test end-to-end", async () => {
  const passing: GeneratedTest = {
    flowId: "smoke",
    fileName: "smoke.spec.ts",
    valid: true,
    code: `import { test, expect } from '@playwright/test';
test('smoke', async ({ page }) => {
  await page.setContent('<h1>hi</h1>');
  await expect(page.locator('h1')).toHaveText('hi');
});`,
  };
  const results = await runTests([passing]);
  assert.equal(results.length, 1);
  assert.equal(results[0].outcome, "passed");
});
