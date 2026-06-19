// spec: specs/plan.md
// seed: seed.spec.ts
// Scenario 7 — Step 2 Edition Selection: Starter / Standard vs. Enhanced and Pricing Formula Verification

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

test("Step 2 Edition Selection: Starter / Standard vs. Enhanced and Pricing Formula Verification", async ({
  page,
}) => {
  // 1. Load demo data in Step 1 and continue to Target Platform (Step 2)
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

  // 2. Confirm Enhanced Edition is selected (button label = "Selected")
  await expect(page.getByRole("button", { name: "Selected" })).toBeVisible();
  // Confirm Total Annual Cost formula shows Enhanced Edition pricing
  await expect(page.getByText(/3 × € 80,000\.00/)).toBeVisible();

  // 3. Click "Select" on the Starter Edition card
  // Starter is the first edition card; scope to its card using the heading ancestor
  await page
    .getByRole("heading", { name: "Starter Edition" })
    .locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]')
    .getByRole("button", { name: "Select", exact: true })
    .click();

  // 4. Confirm "Selected Edition" shows SAP Integration Suite, Starter Edition at €18,000.00
  await expect(
    page.getByText("SAP Integration Suite, Starter Edition"),
  ).toBeVisible();
  await expect(
    page.getByText("€ 18,000.00 per tenants per year"),
  ).toBeVisible();

  // 5. Set "Number of Units" to 2 and "Additional Message Packs" to 100
  await page.getByRole("spinbutton", { name: "Number of Units" }).fill("2");
  await page.keyboard.press("Tab");
  await page
    .getByRole("spinbutton", { name: "Additional Message Packs" })
    .fill("100");
  await page.keyboard.press("Tab");

  // 6. Confirm Total Annual Cost = 2 × €18,000 + 100 × €75.96 = €43,596.00
  await expect(page.getByText("€ 43,596.00")).toBeVisible();
  await expect(page.getByText("2 × € 18,000.00 + 100 × € 75.96")).toBeVisible();

  // 7. Click "Select" on the Standard Edition card
  await page
    .getByRole("heading", { name: "Standard Edition" })
    .locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]')
    .getByRole("button", { name: "Select", exact: true })
    .click();

  // 8. Set "Number of Units" to 1 and "Additional Message Packs" to 0
  await page.getByRole("spinbutton", { name: "Number of Units" }).fill("1");
  await page.keyboard.press("Tab");
  await page
    .getByRole("spinbutton", { name: "Additional Message Packs" })
    .fill("0");
  await page.keyboard.press("Tab");

  // 9. Confirm Total Annual Cost = €55,620.00 (1 × €55,620 + 0 × €75.96)
  await expect(
    page.getByText("SAP Integration Suite, Standard Edition"),
  ).toBeVisible();
  await expect(page.getByText("€ 55,620.00").first()).toBeVisible();

  // 10. Click "Select" on the Enhanced Edition to restore; set units=3 and packs=500
  await page
    .getByRole("heading", { name: "Enhanced Edition" })
    .locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]')
    .getByRole("button", { name: "Select", exact: true })
    .click();
  await page.getByRole("spinbutton", { name: "Number of Units" }).fill("3");
  await page.keyboard.press("Tab");
  await page
    .getByRole("spinbutton", { name: "Additional Message Packs" })
    .fill("500");
  await page.keyboard.press("Tab");

  // 11. Confirm Total Annual Cost = €277,980.00 (3 × €80,000 + 500 × €75.96)
  await expect(page.getByText("€ 277,980.00")).toBeVisible();
  await expect(page.getByText("3 × € 80,000.00 + 500 × € 75.96")).toBeVisible();
});
