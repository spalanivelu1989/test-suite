// spec: specs/plan.md
// seed: seed.spec.ts
// Scenario 15 — Step 3 Migration: Interface-Based Calculator — Formula Verification

import { test, expect } from "@playwright/test";

async function resetBaseline(page: import("@playwright/test").Page) {
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

test("Step 3 Migration: Interface-Based Calculator — Formula Verification", async ({
  page,
}) => {
  // Reach Step 3 via demo data
  await page.goto("https://sapbtp-roi-calculator-stage.cfapps.eu10-004.hana.ondemand.com/single");
  await page.getByRole("button", { name: "Calculate TCO" }).first().click();
  await page
    .getByRole("button", { name: "Load Marketplace Demo Data" })
    .click();
  await page
    .getByRole("button", { name: "Continue to Target Platform" })
    .click();
  await resetBaseline(page);
  await page.getByRole("button", { name: "Continue to Migration" }).click();

  // 1. Confirm heading "Migration Cost Estimation (T-Shirt Sizing)" is visible
  await expect(
    page.getByRole("heading", {
      name: "Migration Cost Estimation (T-Shirt Sizing)",
    }),
  ).toBeVisible();

  // Load the demo constellation to restore 500/250/50 interface counts
  await page.getByRole("button", { name: "Load Demo Constellation" }).click();

  // 2. Click "Interface-based (optional)" to reveal the Interface Count Calculator
  await page
    .getByRole("button", { name: "Interface-based (optional)" })
    .click();

  // Confirm Interface Count Calculator section appears
  await expect(
    page.getByRole("heading", { name: "Interface Count Calculator" }),
  ).toBeVisible();

  // 3. Confirm default values: Simple = 500, Unit Price = €500; Medium = 250, Unit Price = €1,000; Complex = 50, Unit Price = €1,600
  await expect(page.locator("#simpleInterfaces")).toHaveValue("500");
  // Unit-price input for Simple interfaces. Anchor to the calculator region (the
  // ancestor holding all three count inputs) and take the 2nd spinbutton —
  // [simpleCount, simplePrice, mediumCount, mediumPrice, …] — instead of a fragile
  // two-parent walk that resolved to nothing on a differently-built target.
  await expect(
    page
      .locator("#simpleInterfaces")
      .locator('xpath=ancestor::*[.//input[@id="complexInterfaces"]][1]')
      .getByRole("spinbutton")
      .nth(1),
  ).toHaveValue("500");
  await expect(page.locator("#mediumInterfaces")).toHaveValue("250");
  await expect(page.locator("#complexInterfaces")).toHaveValue("50");

  // 4. Confirm Indicative Total Migration Cost = €580,000.00
  await expect(
    page.getByRole("heading", {
      name: /Indicative Total Migration Cost.*€580,000\.00/,
    }),
  ).toBeVisible();

  // Also confirm the method description is visible
  await expect(
    page.getByText(
      "Method: Interface-based pricing (Simple: €500, Medium: €1,000, Complex: €1,600)",
    ),
  ).toBeVisible();

  // 5. Change Simple Interfaces to 100 — confirm new total = €380,000
  await page.locator("#simpleInterfaces").fill("100");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("heading", {
      name: /Indicative Total Migration Cost.*€380,000\.00/,
    }),
  ).toBeVisible();

  // 6. Change Medium Interfaces to 0 — confirm total = €130,000
  await page.locator("#mediumInterfaces").fill("0");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("heading", {
      name: /Indicative Total Migration Cost.*€130,000\.00/,
    }),
  ).toBeVisible();

  // 7. Change Complex Interfaces to 10 — confirm total = €66,000
  await page.locator("#complexInterfaces").fill("10");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("heading", {
      name: /Indicative Total Migration Cost.*€66,000\.00/,
    }),
  ).toBeVisible();

  // 8. Restore to Simple=500, Medium=250, Complex=50 and confirm total = €580,000
  await page.locator("#simpleInterfaces").fill("500");
  await page.locator("#mediumInterfaces").fill("250");
  await page.locator("#complexInterfaces").fill("50");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("heading", {
      name: /Indicative Total Migration Cost.*€580,000\.00/,
    }),
  ).toBeVisible();
});
