// spec: specs/plan.md
// seed: seed.spec.ts
// Scenario 3 — Step 1 Infrastructure & Support & Operations Tabs: All Cost Tabs and Cumulative Total

import { test, expect } from "@playwright/test";

test("Step 1 Infrastructure & Support & Operations Tabs: All Cost Tabs and Cumulative Total", async ({
  page,
}) => {
  // 1. Navigate to the SAP PI/PO Calculate TCO workflow
  await page.goto("https://sapbtp-roi-calculator-stage.cfapps.eu10-004.hana.ondemand.com/single");
  await page.getByRole("button", { name: "Calculate TCO" }).first().click();

  // 2. Click "Clear Form" and confirm all spinbutton values become 0 and Grand Total shows €0.00
  await page.getByRole("button", { name: "Clear Form" }).click();
  await expect(
    page.getByRole("spinbutton", { name: "SAP PI/PO License Costs" }),
  ).toHaveValue("");
  await expect(page.getByText("€0.00").first()).toBeVisible();

  // 3. Click the Infrastructure tab
  await page.getByRole("tab", { name: "Infrastructure" }).click();
  await expect(
    page.getByRole("tab", { name: "Infrastructure" }),
  ).toHaveAttribute("aria-selected", "true");

  // 4. Enter 100000 for "Hardware & Server Costs"
  await page
    .getByRole("spinbutton", { name: "Hardware & Server Costs" })
    .fill("100000");
  await page.keyboard.press("Tab");

  // 5. Enter 50000 for "Storage & Backup Costs"
  await page
    .getByRole("spinbutton", { name: "Storage & Backup Costs" })
    .fill("50000");
  await page.keyboard.press("Tab");

  // 6. Confirm Infrastructure Costs in the summary shows €150,000.00
  await expect(page.getByText("€150,000.00").first()).toBeVisible();

  // 7. Click the Support tab
  await page.getByRole("tab", { name: "Support" }).click();
  await expect(page.getByRole("tab", { name: "Support" })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  // 8. Enter 80000 for "SAP Support & Maintenance"
  await page
    .getByRole("spinbutton", { name: "SAP Support & Maintenance" })
    .fill("80000");
  await page.keyboard.press("Tab");

  // 9. Confirm Support & Maintenance in the summary shows €80,000.00
  await expect(page.getByText("€80,000.00")).toBeVisible();

  // 10. Click the Operations tab
  await page.getByRole("tab", { name: "Operations" }).click();
  await expect(page.getByRole("tab", { name: "Operations" })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  // 11. Enter 120000 for "Administrative Staff Costs" and 100000 for "Development Staff Costs"
  await page
    .getByRole("spinbutton", { name: "Administrative Staff Costs" })
    .fill("120000");
  await page.keyboard.press("Tab");
  await page
    .getByRole("spinbutton", { name: "Development Staff Costs" })
    .fill("100000");
  await page.keyboard.press("Tab");

  // 12. Confirm Operations & Staff in the summary shows €220,000.00
  await expect(page.getByText("€220,000.00")).toBeVisible();

  // 13. Click the Licensing tab and confirm inputs still show 0 (tab switch did not reset)
  await page.getByRole("tab", { name: "Licensing" }).click();
  await expect(
    page.getByRole("spinbutton", { name: "SAP PI/PO License Costs" }),
  ).toHaveValue("");

  // 14. Enter 200000 for "SAP PI/PO License Costs"
  await page
    .getByRole("spinbutton", { name: "SAP PI/PO License Costs" })
    .fill("200000");
  await page.keyboard.press("Tab");

  // 15. Confirm Grand Total = €650,000.00
  // (200000 licensing + 150000 infra + 80000 support + 220000 ops = 650000)
  await expect(page.getByText("€650,000.00")).toBeVisible();
});
