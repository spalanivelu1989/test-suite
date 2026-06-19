// spec: specs/plan.md
// seed: seed.spec.ts
// Scenario 4 — Step 1 Company Tab: Company Size, Industry, and Migration Timeline Dropdowns

import { test, expect } from "@playwright/test";

test("Step 1 Company Tab: Company Size, Industry, and Migration Timeline Dropdowns", async ({
  page,
}) => {
  // 1. Navigate to the workflow and load marketplace demo data
  await page.goto("https://sapbtp-roi-calculator-stage.cfapps.eu10-004.hana.ondemand.com/single");
  await page.getByRole("button", { name: "Calculate TCO" }).first().click();
  await page
    .getByRole("button", { name: "Load Marketplace Demo Data" })
    .click();

  // 2. Click the Company tab in the Annual Cost Breakdown section
  await page.getByRole("tab", { name: "Company" }).click();
  await expect(page.getByRole("tab", { name: "Company" })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  // 3. Open the "Company Size" dropdown and select "Enterprise (5000+ employees)"
  await page
    .getByRole("combobox")
    .filter({ hasText: /employees/ })
    .click();

  // 4. Confirm option is available and select it
  await page
    .getByRole("option", { name: "Enterprise (5000+ employees)" })
    .click();

  // Confirm the dropdown now shows "Enterprise (5000+ employees)"
  await expect(
    page
      .getByRole("combobox")
      .filter({ hasText: "Enterprise (5000+ employees)" }),
  ).toBeVisible();

  // 5. Open the "Industry" dropdown and select "Financial Services"
  await page.getByRole("combobox").filter({ hasText: "Manufacturing" }).click();

  // 6. Select Financial Services and confirm
  await page.getByRole("option", { name: "Financial Services" }).click();
  await expect(
    page.getByRole("combobox").filter({ hasText: "Financial Services" }),
  ).toBeVisible();

  // 7. Open the "Migration Timeline" dropdown and select "Short term (3-6 months)"
  await page
    .getByRole("combobox")
    .filter({ hasText: /term.*months/ })
    .click();

  // 8. Select short term option and confirm
  await page.getByRole("option", { name: "Short term (3-6 months)" }).click();
  await expect(
    page.getByRole("combobox").filter({ hasText: "Short term (3-6 months)" }),
  ).toBeVisible();

  // 9. Switch to the Licensing tab and confirm licensing cost values are unchanged (€250,000)
  await page.getByRole("tab", { name: "Licensing" }).click();
  await expect(
    page.getByRole("spinbutton", { name: "SAP PI/PO License Costs" }),
  ).toHaveValue("250000");
  await expect(
    page.getByRole("spinbutton", { name: "Third-party Adapter Licenses" }),
  ).toHaveValue("45000");

  // 10. Click "Continue to Target Platform" — confirm navigation succeeds
  await page
    .getByRole("button", { name: "Continue to Target Platform" })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Target Platform: SAP Integration Suite",
    }),
  ).toBeVisible();
});
