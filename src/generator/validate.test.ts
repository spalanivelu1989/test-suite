import assert from "node:assert/strict";
import { test } from "node:test";
import { createClaudeClient } from "../claude/client";
import type { CrawlResult, Flow } from "../types";
import { generateValidTest, validateTestCode } from "./validate";

const VALID = `import { test, expect } from '@playwright/test';
test('contact', async ({ page }) => {
  await page.goto('https://x.com');
  await expect(page).toHaveTitle(/x/i);
});`;

test("validateTestCode accepts a well-formed Playwright test", () => {
  assert.equal(validateTestCode(VALID).valid, true);
});

test("validateTestCode rejects missing playwright import", () => {
  const r = validateTestCode("test('a', () => {});");
  assert.equal(r.valid, false);
  assert.match(r.error!, /@playwright\/test/);
});

test("validateTestCode rejects a syntax error", () => {
  const broken = `import { test } from '@playwright/test';
test('a', async ({ page }) => { await page.goto('x' ;`;
  assert.equal(validateTestCode(broken).valid, false);
});

test("generateValidTest retries until valid and flags success", async () => {
  let call = 0;
  const claude = createClaudeClient({
    sdk: {
      messages: {
        create: async () => {
          call += 1;
          const text =
            call === 1
              ? "import { test } from '@playwright/test'; test("
              : VALID;
          return { content: [{ type: "text", text }] };
        },
      },
    },
  });
  const flow: Flow = { id: "contact", name: "Contact", steps: ["open"] };
  const crawl: CrawlResult = { entryUrl: "https://x.com", pages: [] };

  const result = await generateValidTest(flow, crawl, claude, 3);
  assert.equal(result.valid, true);
  assert.equal(call, 2, "should retry once after the first invalid attempt");
});
