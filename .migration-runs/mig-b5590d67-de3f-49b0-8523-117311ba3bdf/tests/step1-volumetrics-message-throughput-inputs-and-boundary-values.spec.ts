// spec: specs/plan.md
// seed: seed.spec.ts
// Scenario 6 — Step 1 Volumetrics: Message Throughput Inputs and Boundary Values

import { test, expect } from "@playwright/test";

test("Step 1 Volumetrics: Message Throughput Inputs and Boundary Values", async ({
  page,
}) => {
  // 1. Navigate to the workflow and load marketplace demo data
  await page.goto("https://sapbtp-roi-calculator-stage.cfapps.eu10-004.hana.ondemand.com/single");
  await page.getByRole("button", { name: "Calculate TCO" }).first().click();
  await page
    .getByRole("button", { name: "Load Marketplace Demo Data" })
    .click();

  // 2. Confirm default volumetric values
  await expect(
    page.getByRole("spinbutton", {
      name: "Current message throughput / Month",
    }),
  ).toHaveValue("5000000");
  await expect(
    page.getByRole("spinbutton", {
      name: "Indicative message throughput in SAP IS",
    }),
  ).toHaveValue("7500000");

  // 3. Clear "Current message throughput / Month" and enter 0 — confirm no error
  await page
    .getByRole("spinbutton", { name: "Current message throughput / Month" })
    .fill("0");
  await page.keyboard.press("Tab");
  await expect(page.getByText("€800,000.00").first()).toBeVisible();

  // 4. Enter 1 — confirm accepted
  await page
    .getByRole("spinbutton", { name: "Current message throughput / Month" })
    .fill("1");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("spinbutton", {
      name: "Current message throughput / Month",
    }),
  ).toHaveValue("1");

  // 5. Enter 100000000 (100 million) — confirm field accepts large value without error
  await page
    .getByRole("spinbutton", { name: "Current message throughput / Month" })
    .fill("100000000");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("spinbutton", {
      name: "Current message throughput / Month",
    }),
  ).toHaveValue("100000000");

  // 6. Enter 5000000 to restore the default
  await page
    .getByRole("spinbutton", { name: "Current message throughput / Month" })
    .fill("5000000");
  await page.keyboard.press("Tab");

  // 7. Clear "Indicative message throughput in SAP IS" and enter 0 — confirm no error
  await page
    .getByRole("spinbutton", {
      name: "Indicative message throughput in SAP IS",
    })
    .fill("0");
  await page.keyboard.press("Tab");
  await expect(page.getByText("€800,000.00").first()).toBeVisible();

  // 8. Enter 99999999 — confirm accepted
  await page
    .getByRole("spinbutton", {
      name: "Indicative message throughput in SAP IS",
    })
    .fill("99999999");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("spinbutton", {
      name: "Indicative message throughput in SAP IS",
    }),
  ).toHaveValue("99999999");

  // 9. Enter 7500000 to restore
  await page
    .getByRole("spinbutton", {
      name: "Indicative message throughput in SAP IS",
    })
    .fill("7500000");
  await page.keyboard.press("Tab");

  // 10. Confirm Grand Total remains €800,000.00 (volumetrics do not affect cost breakdown)
  await expect(page.getByText("€800,000.00").first()).toBeVisible();

  // 11. Click "Continue to Target Platform" and confirm navigation succeeds
  await page
    .getByRole("button", { name: "Continue to Target Platform" })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Target Platform: SAP Integration Suite",
    }),
  ).toBeVisible();
});
