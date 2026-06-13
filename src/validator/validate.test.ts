import assert from "node:assert/strict";
import { test } from "node:test";
import {
  extractTitle,
  matchScenario,
  parsePlanScenarios,
  validateSpec,
  validateSuite,
} from "./validate";

const PLAN = `# Plan

### 1. Home
#### 1.1 Hero Get in Touch CTA
#### 1.2 Services Cards Rendering

### 2. Footer
#### 2.1 Footer Social Links
`;

const scenarios = parsePlanScenarios(PLAN);

function findRules(result: { findings: { rule: string }[] }): string[] {
  return result.findings.map((f) => f.rule);
}

// --- parsing & title ---

test("parsePlanScenarios extracts #### headings and strips ordinals", () => {
  assert.equal(scenarios.length, 3);
  assert.deepEqual(scenarios[0], { id: "1.1", name: "Hero Get in Touch CTA" });
  assert.deepEqual(scenarios[2], { id: "2.1", name: "Footer Social Links" });
});

test("parsePlanScenarios handles the '## Scenario N — Title' Discoverer format", () => {
  const plan = `# Plan
## Overview
some prose
## Scenario 1 — Page Load and Core Content Verification
### Purpose
### Steps
## Scenario 2 — Hero Section "Get in Touch" CTA Button
### Purpose
`;
  const got = parsePlanScenarios(plan);
  assert.equal(got.length, 2);
  assert.deepEqual(got[0], {
    id: "1",
    name: "Page Load and Core Content Verification",
  });
  assert.equal(got[1].name, 'Hero Section "Get in Touch" CTA Button');
});

test("parsePlanScenarios returns [] for null/empty plan", () => {
  assert.deepEqual(parsePlanScenarios(null), []);
  assert.deepEqual(parsePlanScenarios("# no scenarios"), []);
});

test("extractTitle reads the first test() title incl. embedded quotes", () => {
  assert.equal(
    extractTitle(`test('Hero "Get in Touch" CTA', async ({ page }) => {});`),
    'Hero "Get in Touch" CTA',
  );
  assert.equal(extractTitle("const x = 1;"), null);
});

// --- relevance ---

test("matchScenario maps a spec title to the best plan scenario, else null", () => {
  assert.equal(
    matchScenario("Hero Get in Touch CTA button", scenarios)?.name,
    "Hero Get in Touch CTA",
  );
  assert.equal(matchScenario("Completely Unrelated Thing", scenarios), null);
  assert.equal(matchScenario("anything", []), null);
});

// --- correctness rules ---

test("flags missing import and missing test block", () => {
  const r = validateSpec(
    { file: "x.spec.ts", code: "const a = 1;" },
    scenarios,
  );
  const rules = findRules(r);
  assert.ok(rules.includes("missing-import"));
  assert.ok(rules.includes("no-test-block"));
});

test("multiple test blocks in one file is a warning; describe/hooks don't count", () => {
  const code = `import { test, expect } from '@playwright/test';
test.describe('g', () => {
  test.beforeEach(async ({ page }) => {});
  test('a', async ({ page }) => { await expect(page.getByText('x')).toHaveText('x'); });
  test('b', async ({ page }) => { await expect(page.getByText('y')).toHaveText('y'); });
});`;
  const rules = findRules(validateSpec({ file: "m.spec.ts", code }, scenarios));
  assert.ok(rules.includes("multiple-tests"));
  assert.ok(!rules.includes("no-test-block"));
});

// --- assertion rules ---

test("no expect() => no-assertions error", () => {
  const code = `import { test } from '@playwright/test';
test('Hero Get in Touch CTA', async ({ page }) => { await page.goto('/'); });`;
  assert.ok(
    findRules(validateSpec({ file: "a.spec.ts", code }, scenarios)).includes(
      "no-assertions",
    ),
  );
});

test("only visibility assertions => weak-assertion-only", () => {
  const code = `import { test, expect } from '@playwright/test';
test('Hero Get in Touch CTA', async ({ page }) => {
  await expect(page.getByRole('button')).toBeVisible();
});`;
  const rules = findRules(validateSpec({ file: "w.spec.ts", code }, scenarios));
  assert.ok(rules.includes("weak-assertion-only"));
});

test("a content/value assertion is NOT weak", () => {
  const code = `import { test, expect } from '@playwright/test';
test('Hero Get in Touch CTA', async ({ page }) => {
  await expect(page.getByRole('button')).toBeVisible();
  await expect(page.getByRole('link')).toHaveAttribute('href', 'mailto:x');
});`;
  const rules = findRules(validateSpec({ file: "g.spec.ts", code }, scenarios));
  assert.ok(!rules.includes("weak-assertion-only"));
});

test("asserting a literal constant => tautological-assertion", () => {
  const code = `import { test, expect } from '@playwright/test';
test('Hero Get in Touch CTA', async ({ page }) => {
  expect(true).toBeTruthy();
  await expect(page.getByText('hi')).toHaveText('hi');
});`;
  assert.ok(
    findRules(validateSpec({ file: "t.spec.ts", code }, scenarios)).includes(
      "tautological-assertion",
    ),
  );
});

// --- robustness rules ---

test("hard waits, networkidle, and brittle selectors are flagged", () => {
  const code = `import { test, expect } from '@playwright/test';
test('Hero Get in Touch CTA', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  await page.locator('//div[@id="x"]').click();
  await expect(page.locator('div > span > a')).toBeVisible();
  await page.getByRole('listitem').nth(3).click();
  await expect(page.getByText('ok')).toHaveText('ok');
});`;
  const rules = findRules(validateSpec({ file: "r.spec.ts", code }, scenarios));
  assert.ok(rules.includes("hard-wait"));
  assert.ok(rules.includes("networkidle"));
  assert.ok(rules.includes("brittle-selector"));
});

test("findings carry 1-based line numbers for localizable rules", () => {
  const code = `import { test, expect } from '@playwright/test';
test('Hero Get in Touch CTA', async ({ page }) => {
  await page.waitForTimeout(500);
  await expect(page.getByText('x')).toHaveText('x');
});`;
  const hardWait = validateSpec(
    { file: "l.spec.ts", code },
    scenarios,
  ).findings.find((f) => f.rule === "hard-wait");
  assert.equal(hardWait?.line, 3);
});

// --- scoring & suite ---

test("a clean, relevant spec scores 100 with no findings", () => {
  const code = `import { test, expect } from '@playwright/test';
test('Hero Get in Touch CTA', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Get in Touch' })).toHaveAttribute('href', 'mailto:hello@tarento.com');
});`;
  const r = validateSpec({ file: "clean.spec.ts", code }, scenarios);
  assert.deepEqual(r.findings, []);
  assert.equal(r.score, 100);
  assert.equal(r.matchedScenario, "Hero Get in Touch CTA");
});

test("score deducts 40 per error and 15 per warning, floored at 0", () => {
  // missing-import (err) + no-test-block (err) + no-assertions (err) => well past 0.
  const r = validateSpec(
    { file: "bad.spec.ts", code: "const a = 1;" },
    scenarios,
  );
  assert.equal(r.score, 0);
});

test("validateSuite reports orphans, missing flows, counts, and overall score", () => {
  const specs = [
    {
      file: "hero.spec.ts",
      code: `import { test, expect } from '@playwright/test';
test('Hero Get in Touch CTA', async ({ page }) => {
  await expect(page.getByRole('link')).toHaveAttribute('href', 'x');
});`,
    },
    {
      file: "orphan.spec.ts",
      code: `import { test, expect } from '@playwright/test';
test('Some Unplanned Behavior', async ({ page }) => {
  await expect(page.getByText('z')).toHaveText('z');
});`,
    },
  ];
  const report = validateSuite(specs, PLAN);
  assert.deepEqual(report.orphanSpecs, ["orphan.spec.ts"]);
  // 3 plan scenarios, only "Hero Get in Touch CTA" matched.
  assert.ok(report.missingFlows.includes("Services Cards Rendering"));
  assert.ok(report.missingFlows.includes("Footer Social Links"));
  assert.equal(report.errorCount, 0);
  // orphan-spec warning on the second spec.
  assert.equal(report.warningCount, 1);
  assert.ok(report.score > 0 && report.score < 100);
});

test("validateSuite with no specs and no plan scores 100", () => {
  const report = validateSuite([], null);
  assert.equal(report.score, 100);
  assert.equal(report.specs.length, 0);
  assert.deepEqual(report.missingFlows, []);
});

test("validateSuite with no specs but a plan penalizes for all-missing flows", () => {
  const report = validateSuite([], PLAN);
  assert.equal(report.specs.length, 0);
  assert.equal(report.missingFlows.length, 3);
  // base 100, missingRatio 1 => 100 * (1 - 0.5) = 50.
  assert.equal(report.score, 50);
});
