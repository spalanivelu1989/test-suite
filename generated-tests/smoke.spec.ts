import { expect, test } from "@playwright/test";

// Smoke test proving the Playwright runner works (T2). Replaced at runtime by
// AI-generated tests; kept as a committed sanity check that the toolchain runs.
test("playwright runner executes headless", async ({ page }) => {
  await page.setContent("<h1>ok</h1>");
  await expect(page.locator("h1")).toHaveText("ok");
});
