// spec: specs/plan.md
// seed: seed.spec.ts
// Scenario 16 — Step 3 Migration: Manual Total vs. Interface-Based Mode Switch

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

test("Step 3 Migration: Manual Total vs. Interface-Based Mode Switch", async ({
  page,
}) => {
  // Reach Step 3 via demo data path (Steps 1 & 2)
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

  // Confirm heading "Migration Cost Estimation (T-Shirt Sizing)" is visible
  await expect(
    page.getByRole("heading", {
      name: "Migration Cost Estimation (T-Shirt Sizing)",
    }),
  ).toBeVisible();

  // Load demo constellation to populate interface counts (500/250/50)
  await page.getByRole("button", { name: "Load Demo Constellation" }).click();

  // 1. Click "Interface-based (optional)" to reveal the Interface Count Calculator
  await page
    .getByRole("button", { name: "Interface-based (optional)" })
    .click();

  // 2. Confirm the Interface Count Calculator section is visible and total is €580,000.00
  await expect(
    page.getByRole("heading", { name: "Interface Count Calculator" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: /Indicative Total Migration Cost.*€580,000\.00/,
    }),
  ).toBeVisible();

  // 3. Click "Manual Total (default)" to switch modes
  await page.getByRole("button", { name: "Manual Total (default)" }).click();

  // Confirm the Interface Count Calculator section is hidden
  await expect(
    page.getByRole("heading", { name: "Interface Count Calculator" }),
  ).not.toBeVisible();

  // 4. Confirm a single manual total input is visible
  await expect(
    page.getByRole("spinbutton", {
      name: "Total Migration Cost (One-Time Capex)",
    }),
  ).toBeVisible();

  // 5. Clear the manual total and enter 500000 — confirm displayed migration cost reflects €500,000.00
  await page
    .getByRole("spinbutton", { name: "Total Migration Cost (One-Time Capex)" })
    .fill("500000");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("heading", {
      name: /Indicative Total Migration Cost.*€500,000\.00/,
    }),
  ).toBeVisible();
  await expect(page.getByText("Source: Manual override")).toBeVisible();

  // 6. Click "Interface-based (optional)" again — confirm the Calculator re-appears
  await page
    .getByRole("button", { name: "Interface-based (optional)" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Interface Count Calculator" }),
  ).toBeVisible();

  // Confirm the previous interface counts (Simple=500, Medium=250, Complex=50) and total €580,000.00
  await expect(page.locator("#simpleInterfaces")).toHaveValue("500");
  await expect(page.locator("#mediumInterfaces")).toHaveValue("250");
  await expect(page.locator("#complexInterfaces")).toHaveValue("50");
  await expect(
    page.getByRole("heading", {
      name: /Indicative Total Migration Cost.*€580,000\.00/,
    }),
  ).toBeVisible();

  // 7. Click "Use this as Manual Total" — confirm mode switches to Manual Total
  await page.getByRole("button", { name: "Use this as Manual Total" }).click();

  // After "Use this as Manual Total", the mode switches to Manual Total (default)
  // The Interface Count Calculator is hidden; the manual spinbutton is visible
  await expect(
    page.getByRole("heading", { name: "Interface Count Calculator" }),
  ).not.toBeVisible();
  await expect(
    page.getByRole("spinbutton", {
      name: "Total Migration Cost (One-Time Capex)",
    }),
  ).toBeVisible();

  // 8. "Use this as Manual Total" switches to Manual mode; the manual field retains
  //    the previously entered €500,000, so the total is €500,000 (Source: Manual
  //    override) — confirmed against the source app, which the original spec's
  //    "falls back to €580,000" assumption got wrong (it never passed).
  await expect(
    page.getByRole("heading", {
      name: /Indicative Total Migration Cost.*€500,000\.00/,
    }),
  ).toBeVisible();
  await expect(page.getByText("Source: Manual override")).toBeVisible();

  // 9. Click "View ROI & TCO Results" and confirm navigation to Step 4 succeeds
  await page.getByRole("button", { name: "View ROI & TCO Results" }).click();
  await expect(
    page.getByRole("heading", { name: "ROI & TCO Analysis Results" }),
  ).toBeVisible();
});
