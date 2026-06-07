import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyStrategy } from "./strategy";

test("classifyStrategy: brittle CSS → role locator = role-locator (AC2)", () => {
  assert.equal(
    classifyStrategy(
      "await page.locator('#btn-7f3a').click();",
      "await page.getByRole('button', { name: 'Send' }).click();",
    ),
    "role-locator",
  );
});

test("classifyStrategy: exact text → regex = regex-text", () => {
  assert.equal(
    classifyStrategy(
      "await expect(el).toHaveText('Order #1234 placed');",
      "await expect(el).toHaveText(/Order #\\d+ placed/);",
    ),
    "regex-text",
  );
});

test("classifyStrategy: added visibility wait = wait-visibility", () => {
  assert.equal(
    classifyStrategy(
      "await page.getByText('Panel').click();",
      "await expect(page.getByText('Panel')).toBeVisible();\nawait page.getByText('Panel').click();",
    ),
    "wait-visibility",
  );
});

test("classifyStrategy: assertion change without locator change = assertion-fix", () => {
  assert.equal(
    classifyStrategy("expect(count).toBe(3);", "expect(count).toBe(4);"),
    "assertion-fix",
  );
});

test("classifyStrategy: test.fixme (or outcomeFixme) = fixme, dominates", () => {
  assert.equal(
    classifyStrategy("await x.click();", "test.fixme(); // flaky upstream"),
    "fixme",
  );
  assert.equal(
    classifyStrategy(
      "await page.locator('#a').click();",
      "await page.getByRole('button').click();",
      true, // outcomeFixme short-circuits
    ),
    "fixme",
  );
});

test("classifyStrategy: unrecognized change = other, never throws", () => {
  assert.equal(classifyStrategy("const a = 1;", "const a = 2;"), "other");
  assert.equal(classifyStrategy("", ""), "other");
});
