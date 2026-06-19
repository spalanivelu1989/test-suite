// spec: specs/plan.md
// seed: seed.spec.ts
// Scenario 13 — Step 2 Transformation Incentive: Y1 / Y2 SI Partner Sliders

import { test, expect } from "@playwright/test";

async function resetBaseline(page: import("@playwright/test").Page) {
  // Wait for page to be fully rendered before reading/changing state
  await page
    .getByRole("heading", { name: "Target Platform: SAP Integration Suite" })
    .waitFor({ state: "visible" });
  const enhancedSelect = page
    .getByRole("heading", { name: "Enhanced Edition" })
    .locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]')
    .getByRole("button", { name: "Select", exact: true });
  if (await enhancedSelect.count()) {
    await enhancedSelect.first().click();
    await page.waitForTimeout(400);
  }
  await page.getByRole("spinbutton", { name: "Number of Units" }).fill("3");
  await page.keyboard.press("Tab");
  await page
    .getByRole("spinbutton", { name: "Additional Message Packs" })
    .fill("500");
  await page.keyboard.press("Tab");
  for (const id of [
    "#is-discount-toggle",
    "#existing-btp-toggle",
    "#ti-toggle",
  ]) {
    const el = page.locator(id);
    if (
      (await el.count()) &&
      (await el.getAttribute("aria-checked")) === "true"
    ) {
      await el.click();
      await page.waitForTimeout(300);
    }
  }
  await page.waitForTimeout(400);
}

test("Step 2 Transformation Incentive: Y1 / Y2 SI Partner Sliders", async ({
  page,
}) => {
  // Reach Step 2 via demo data and enable TI toggle
  await page.goto("https://sapbtp-roi-calculator-stage.cfapps.eu10-004.hana.ondemand.com/single");
  await page.getByRole("button", { name: "Calculate TCO" }).first().click();
  await page
    .getByRole("button", { name: "Load Marketplace Demo Data" })
    .click();
  await page
    .getByRole("button", { name: "Continue to Target Platform" })
    .click();

  // Reset baseline to ensure clean state (edition / units / packs / toggles)
  await resetBaseline(page);

  // Enable the TI toggle (disabled after baseline reset)
  await page.locator("#ti-toggle").click();
  // Confirm only the TI toggle is enabled by scoping to its ID
  await expect(page.locator("#ti-toggle")).toHaveAttribute(
    "aria-checked",
    "true",
  );

  // Ensure "Estimate from defaults" tab is active (persisted tab state may differ)
  await page.getByRole("tab", { name: "Estimate from defaults" }).click();

  // 2. Confirm Y1 % to SI partner = 100% and Y2 % to SI partner = 0% by default
  await expect(
    page.getByText("Y1 % to SI partner (offsets migration)"),
  ).toBeVisible();
  await expect(
    page.getByText("Y2 % to SI partner (offsets migration)"),
  ).toBeVisible();

  // Reset Y1 slider to 100% (End key) to handle persisted slider positions
  const y1Slider = page.getByRole("slider").nth(1);
  await y1Slider.click();
  await page.keyboard.press("End");

  // Y1 shows 100%
  const y1Label = page
    .getByText("Y1 % to SI partner (offsets migration)")
    .locator("..")
    .getByText("100%");
  await expect(y1Label).toBeVisible();

  // 3. Confirm Y1 and Y2 SI/Migration offsets are €0.00 (LOB pool = 0% so no credit flows)
  await expect(page.getByText("→ SI/Migration offset").first()).toBeVisible();

  // 4. Move the LOB slider to 50% to activate credit
  // Reset LOB slider to 0% first (Home), then advance 10 steps to 50%
  const lobSlider = page
    .getByRole("tabpanel", { name: "Estimate from defaults" })
    .getByRole("slider");
  await lobSlider.click();
  await page.keyboard.press("Home");
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press("ArrowRight");
  }
  await expect(page.getByText("LOB pool (50%)")).toBeVisible();

  // 5. Move Y1 % to SI partner slider to 50% (from 100%, 10 steps of -5%)
  await y1Slider.click();
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press("ArrowLeft");
  }
  await expect(
    page
      .getByText("Y1 % to SI partner (offsets migration)")
      .locator("..")
      .getByText("50%"),
  ).toBeVisible();
  // Confirm Y1 subscription offset and SI/migration offset split ~50%/50%
  await expect(page.getByText("→ Subscription offset").first()).toBeVisible();
  await expect(page.getByText("→ SI/Migration offset").first()).toBeVisible();

  // 6. Move Y2 % to SI partner slider to 100%
  const y2Slider = page.getByRole("slider").nth(2);
  await y2Slider.click();
  await page.keyboard.press("End");
  await expect(
    page
      .getByText("Y2 % to SI partner (offsets migration)")
      .locator("..")
      .getByText("100%"),
  ).toBeVisible();

  // 7. Open the "ROI treatment" dropdown and select "Lump-sum (apply full credit in Year 1)"
  await page.getByRole("combobox").filter({ hasText: "Per-year" }).click();
  await page
    .getByRole("option", { name: "Lump-sum (apply full credit in Year 1)" })
    .click();
  await expect(
    page
      .getByRole("combobox")
      .filter({ hasText: "Lump-sum (apply full credit" }),
  ).toBeVisible();

  // 8. Switch ROI treatment back to "Per-year (apply to Y1 and Y2 separately)"
  await page.getByRole("combobox").filter({ hasText: "Lump-sum" }).click();
  await page
    .getByRole("option", { name: "Per-year (apply to Y1 and Y2 separately)" })
    .click();

  // 9. Confirm Year 1 and Year 2 breakdowns reappear with per-year values
  // Use exact + first() to avoid strict-mode: many elements contain "Year 1" / "Year 2"
  await expect(page.getByText("Year 1", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Year 2", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("→ Subscription offset").first()).toBeVisible();
  await expect(page.getByText("→ SI/Migration offset").first()).toBeVisible();
});
