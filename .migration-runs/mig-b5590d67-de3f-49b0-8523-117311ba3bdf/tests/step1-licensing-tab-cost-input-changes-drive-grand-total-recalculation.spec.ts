// spec: specs/plan.md
// seed: seed.spec.ts
// Scenario 2 — Step 1 Licensing Tab: Cost Input Changes Drive Grand Total Recalculation

import { test, expect } from "@playwright/test";

test("Step 1 Licensing Tab: Cost Input Changes Drive Grand Total Recalculation", async ({
  page,
}) => {
  // 1. Navigate to the workflow and open SAP PI/PO Calculate TCO
  await page.goto("https://sapbtp-roi-calculator-stage.cfapps.eu10-004.hana.ondemand.com/single");
  await page.getByRole("button", { name: "Calculate TCO" }).first().click();

  // 2. Confirm the Licensing tab is selected in the "SAP PI/PO Annual Cost Breakdown" section
  await expect(page.getByRole("tab", { name: "Licensing" })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  // 3 & 4. Load Marketplace Demo Data and confirm Grand Total is €800,000.00
  await page
    .getByRole("button", { name: "Load Marketplace Demo Data" })
    .click();
  await expect(page.getByText("€800,000.00").first()).toBeVisible();

  // 5. Clear the "SAP PI/PO License Costs" field and type 300000
  await page
    .getByRole("spinbutton", { name: "SAP PI/PO License Costs" })
    .fill("300000");

  // 6. Press Tab to confirm the update
  await page.keyboard.press("Tab");

  // 7. Confirm Licensing Costs increases to €345,000.00 (300000 + 45000 third-party)
  await expect(page.getByText("€345,000.00")).toBeVisible();

  // 8. Confirm Grand Total increases to €850,000.00
  await expect(page.getByText("€850,000.00")).toBeVisible();

  // 9. Clear "Third-party Adapter Licenses" and enter 0
  await page
    .getByRole("spinbutton", { name: "Third-party Adapter Licenses" })
    .fill("0");
  await page.keyboard.press("Tab");

  // 10. Confirm Licensing Costs decreases to €300,000.00 and Grand Total to €805,000.00
  await expect(page.getByText("€300,000.00")).toBeVisible();
  await expect(page.getByText("€805,000.00")).toBeVisible();

  // 11. Dev/Testing environment licenses are already 0 — verify no change expected
  await expect(
    page.getByRole("spinbutton", { name: "Development Environment Licenses" }),
  ).toHaveValue("0");
  await expect(
    page.getByRole("spinbutton", { name: "Testing Environment Licenses" }),
  ).toHaveValue("0");

  // 12. Confirm Grand Total remains €805,000.00
  await expect(page.getByText("€805,000.00")).toBeVisible();
});
