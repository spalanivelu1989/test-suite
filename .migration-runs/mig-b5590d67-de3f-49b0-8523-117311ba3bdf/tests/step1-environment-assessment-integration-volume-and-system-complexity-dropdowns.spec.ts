// spec: specs/plan.md
// seed: seed.spec.ts
// Scenario 5 — Step 1 Environment Assessment: Integration Volume and System Complexity Dropdowns

import { test, expect } from "@playwright/test";

test("Step 1 Environment Assessment: Integration Volume and System Complexity Dropdowns", async ({
  page,
}) => {
  // 1. Navigate to the workflow and load marketplace demo data
  await page.goto("https://sapbtp-roi-calculator-stage.cfapps.eu10-004.hana.ondemand.com/single");
  await page.getByRole("button", { name: "Calculate TCO" }).first().click();
  await page
    .getByRole("button", { name: "Load Marketplace Demo Data" })
    .click();

  // 2. Locate the "SAP PI/PO Environment Assessment" section
  await expect(
    page.getByRole("heading", { name: "SAP PI/PO Environment Assessment" }),
  ).toBeVisible();

  // 3. Open the "Integration Volume" dropdown and select "Very High (500+ interfaces)"
  await page
    .getByRole("combobox")
    .filter({ hasText: /interfaces/ })
    .click();
  await page
    .getByRole("option", { name: "Very High (500+ interfaces)" })
    .click();
  await expect(
    page
      .getByRole("combobox")
      .filter({ hasText: "Very High (500+ interfaces)" }),
  ).toBeVisible();

  // 4. Open the "System Complexity" dropdown and select "Complex (Advanced BPM, custom adapters)"
  await page
    .getByRole("combobox")
    .filter({ hasText: /Select system complexity|complexity/ })
    .first()
    .click();
  await page
    .getByRole("option", { name: "Complex (Advanced BPM, custom adapters)" })
    .click();
  await expect(
    page
      .getByRole("combobox")
      .filter({ hasText: "Complex (Advanced BPM, custom adapters)" }),
  ).toBeVisible();

  // 5. Open the "Availability Requirements" dropdown and select "Mission Critical (99.99% uptime)"
  await page
    .getByRole("combobox")
    .filter({ hasText: /uptime/ })
    .click();
  await page
    .getByRole("option", { name: "Mission Critical (99.99% uptime)" })
    .click();
  await expect(
    page
      .getByRole("combobox")
      .filter({ hasText: "Mission Critical (99.99% uptime)" }),
  ).toBeVisible();

  // 6. Open the "Compliance Requirements" dropdown and select "Strict (Financial, Healthcare)"
  await page
    .getByRole("combobox")
    .filter({ hasText: /Select compliance|compliance/ })
    .first()
    .click();
  await page
    .getByRole("option", { name: "Strict (Financial, Healthcare)" })
    .click();
  await expect(
    page
      .getByRole("combobox")
      .filter({ hasText: "Strict (Financial, Healthcare)" }),
  ).toBeVisible();

  // 7. Open the "Custom Development Extent" dropdown and select "Extensive (Custom modules, UDFs)"
  await page
    .getByRole("combobox")
    .filter({ hasText: /Select customization|customization/ })
    .first()
    .click();
  await page
    .getByRole("option", { name: "Extensive (Custom modules, UDFs)" })
    .click();
  await expect(
    page
      .getByRole("combobox")
      .filter({ hasText: "Extensive (Custom modules, UDFs)" }),
  ).toBeVisible();

  // 8. Open the "Monitoring & Management Tools" dropdown and select "Basic (SAP PI/PO native tools)"
  await page
    .getByRole("combobox")
    .filter({ hasText: /APM|monitoring|Monitoring/ })
    .click();
  await page
    .getByRole("option", { name: "Basic (SAP PI/PO native tools)" })
    .click();
  await expect(
    page
      .getByRole("combobox")
      .filter({ hasText: "Basic (SAP PI/PO native tools)" }),
  ).toBeVisible();

  // 9. Confirm all six dropdowns retain their selected values after selection
  await expect(
    page
      .getByRole("combobox")
      .filter({ hasText: "Very High (500+ interfaces)" }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("combobox")
      .filter({ hasText: "Complex (Advanced BPM, custom adapters)" }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("combobox")
      .filter({ hasText: "Mission Critical (99.99% uptime)" }),
  ).toBeVisible();

  // 10. Confirm Grand Total is still €800,000.00 (environment assessment does not modify cost breakdown)
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
