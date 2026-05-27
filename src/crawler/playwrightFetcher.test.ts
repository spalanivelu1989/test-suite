import assert from "node:assert/strict";
import { after, test } from "node:test";
import { type Browser, chromium } from "playwright";
import { __test } from "./playwrightFetcher";

let browser: Browser;
after(async () => {
  await browser?.close();
});

test("extracts title, links, and interactive elements from a page", async () => {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setContent(`
    <html><head><title>Demo</title><base href="https://demo.test/"></head><body>
      <a href="/about">About</a>
      <a href="https://ext.com/x">External</a>
      <button id="buy">Buy now</button>
      <input name="email" placeholder="Email" />
    </body></html>
  `);

  const result = await __test.extractFromPage(page);
  await page.close();

  assert.equal(result.title, "Demo");
  assert.ok(result.links.some((l) => l.endsWith("/about")));
  assert.ok(
    result.elements.some((e) => e.selector === "#buy" && e.label === "Buy now"),
  );
  assert.ok(
    result.elements.some(
      (e) => e.selector === 'input[name="email"]' && e.label === "Email",
    ),
  );
});
