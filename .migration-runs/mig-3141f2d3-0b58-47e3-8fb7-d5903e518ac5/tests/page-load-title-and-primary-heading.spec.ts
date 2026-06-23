// spec: specs/plan.md
// seed: seed.spec.ts

import { test, expect } from "@playwright/test";

test("Page Load: Title and Primary Heading", async ({ page }) => {
  // 1. Navigate to the entry URL
  await page.goto("https://spalanivelu1989.github.io/");

  // 2. Wait for the page to be fully loaded
  await page.waitForLoadState("load");

  // 3. Assert that the browser tab title is exactly "Senthil Palanivelu - AI Engineer"
  await expect(page).toHaveTitle("Senthil Palanivelu - AI Engineer");

  // 4. Assert that the visible H1 heading text is exactly "Senthil Palanivelu"
  const h1 = page.getByRole("heading", {
    level: 1,
    name: "Senthil Palanivelu",
  });
  await expect(h1).toBeVisible();
  await expect(h1).toHaveText("Senthil Palanivelu");
});
