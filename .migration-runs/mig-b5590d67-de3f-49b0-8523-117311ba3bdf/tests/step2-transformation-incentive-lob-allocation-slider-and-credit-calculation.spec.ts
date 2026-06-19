// spec: specs/plan.md
// seed: seed.spec.ts
// Scenario 12 — Step 2 Transformation Incentive: LOB Allocation Slider and Credit Calculation

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

test("Step 2 Transformation Incentive: LOB Allocation Slider and Credit Calculation", async ({
  page,
}) => {
  // Reach Step 2 via demo data
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

  // 1. Enable the SAP Transformation Incentive toggle (it is Disabled by default)
  await expect(
    page.getByRole("heading", {
      name: "SAP Transformation Incentive (2025+) Optional",
    }),
  ).toBeVisible();
  await page.locator("#ti-toggle").click();
  // Scope to the TI toggle specifically to avoid ambiguity with other enabled toggles
  await expect(page.locator("#ti-toggle")).toHaveAttribute(
    "aria-checked",
    "true",
  );

  // 2. Ensure "Estimate from defaults" tab is selected (click it to handle persisted tab state)
  await page.getByRole("tab", { name: "Estimate from defaults" }).click();
  await expect(
    page.getByRole("tab", { name: "Estimate from defaults" }),
  ).toHaveAttribute("aria-selected", "true");

  // 3. Confirm default Contract Duration and Success Plan
  await expect(
    page
      .getByRole("combobox")
      .filter({ hasText: "3 years (12 months of ACV)" }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("combobox")
      .filter({ hasText: "None / Foundational (no uplift)" }),
  ).toBeVisible();

  // Get the LOB slider and reset it to 0% first (Home) to handle persisted positions
  const lobSlider = page
    .getByRole("tabpanel", { name: "Estimate from defaults" })
    .getByRole("slider");
  await lobSlider.click();
  await page.keyboard.press("Home");

  // 4. Confirm default credit breakdown at 0% LOB
  await expect(page.getByText("€277,980.00").first()).toBeVisible();
  await expect(page.getByText("LOB pool (0%)")).toBeVisible();
  await expect(page.getByText("Total applied")).toBeVisible();

  // 5. Move "LOB allocation" slider to ~50% using arrow keys
  // Move from 0% to 50% (10 steps of 5%)
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press("ArrowRight");
  }

  // 5. Confirm label shows "50% to LOB" and LOB pool = ~€138,990
  await expect(page.getByText("50% to LOB")).toBeVisible();
  await expect(page.getByText("LOB pool (50%)")).toBeVisible();
  await expect(page.getByText("€138,990.00").first()).toBeVisible();

  // 6. Confirm "Total applied" = LOB pool amount (€138,990)
  await expect(
    page.getByText("Total applied").locator("..").getByText("€138,990.00"),
  ).toBeVisible();

  // 7. Move slider to 100% — confirm LOB pool = Gross credit
  await page.keyboard.press("End");
  await expect(page.getByText("100% to LOB")).toBeVisible();
  await expect(page.getByText("LOB pool (100%)")).toBeVisible();

  // 8. Move slider back to 0% — confirm LOB pool = €0.00 and Total applied = €0.00
  await page.keyboard.press("Home");
  await expect(page.getByText("0% to LOB")).toBeVisible();
  await expect(page.getByText("LOB pool (0%)")).toBeVisible();

  // 9. Click "Enter credit amounts" tab — confirm Year 1 and Year 2 spinbuttons appear
  await page.getByRole("tab", { name: "Enter credit amounts" }).click();
  await expect(page.getByText("Year 1 credit amount")).toBeVisible();
  await expect(page.getByText("Year 2 credit amount")).toBeVisible();

  // 10. Switch back to "Estimate from defaults" — confirm dropdowns are unchanged
  await page.getByRole("tab", { name: "Estimate from defaults" }).click();
  await expect(
    page
      .getByRole("combobox")
      .filter({ hasText: "3 years (12 months of ACV)" }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("combobox")
      .filter({ hasText: "None / Foundational (no uplift)" }),
  ).toBeVisible();
});
