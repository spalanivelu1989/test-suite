// spec: specs/plan.md
// seed: seed.spec.ts
// Scenario 9 — Step 2 Contract Discount: Percent Slider — Boundary Values and Grand Total Deduction

import { test, expect, type Page } from "@playwright/test";

const APP_URL = "https://sapbtp-roi-calculator-stage.cfapps.eu10-004.hana.ondemand.com/single";

function eur(s: string | null | undefined): number {
  const m = String(s ?? "").match(/([−+-])?\s*€\s*([\d.,]+)/);
  if (!m) return NaN;
  const n = parseFloat(m[2].replace(/,/g, ""));
  const v = m[1] === "−" || m[1] === "-" ? -n : n;
  return v === 0 ? 0 : v; // normalise -0 → 0 so toBe(0) (Object.is) holds for "−€0.00"
}

async function summaryValue(page: Page, label: string): Promise<number> {
  const esc = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const txt =
    (await page
      .getByText(new RegExp(esc + ":\\s*−?\\s*€[\\d.,]+"))
      .last()
      .textContent()) ?? "";
  const m = txt.match(new RegExp(esc + ":\\s*(−?\\s*€[\\d.,]+)"));
  return m ? eur(m[1]) : NaN;
}
const grandTotal = (page: Page) => summaryValue(page, "Grand Total");

async function ensureEnhancedBaseline(page: Page): Promise<void> {
  const sel = page
    .getByRole("heading", { name: "Enhanced Edition" })
    .locator(
      'xpath=ancestor::*[.//button[normalize-space()="Select" or normalize-space()="Selected"]][1]',
    )
    .getByRole("button", { name: /^Select(ed)?$/ })
    .first();
  await sel.waitFor();
  if ((await sel.innerText()).trim() === "Select") await sel.click();
  await page.getByRole("spinbutton", { name: "Number of Units" }).fill("3");
  await page.keyboard.press("Tab");
  await page
    .getByRole("spinbutton", { name: "Additional Message Packs" })
    .fill("500");
  await page.keyboard.press("Tab");
  for (const id of [
    "#aem-toggle",
    "#ti-toggle",
    "#is-discount-toggle",
    "#existing-btp-toggle",
  ]) {
    const el = page.locator(id);
    if ((await el.count()) && (await el.getAttribute("aria-checked")) === "true") {
      await el.click();
      await expect(el).toHaveAttribute("aria-checked", "false", { timeout: 5000 });
    }
  }
  await page.waitForTimeout(300);
}

// Discount card scoped via the toggle's stable id (never the tabpanel's accessible name,
// whose wiring differs between builds). The active tab's spinbutton is its only one.
function discountCard(page: Page) {
  return page
    .locator("#is-discount-toggle")
    .locator('xpath=ancestor::*[.//*[@role="tablist"]][1]');
}

test("Step 2 Contract Discount: Percent Slider — Boundary Values and Grand Total Deduction", async ({
  page,
}) => {
  // 1. Reach Step 2 and establish a deterministic baseline
  await page.goto(APP_URL);
  await page.getByRole("button", { name: "Calculate TCO" }).first().click();
  await page
    .getByRole("button", { name: "Load Marketplace Demo Data" })
    .click();
  await page
    .getByRole("button", { name: "Continue to Target Platform" })
    .click();
  await page
    .getByRole("heading", { name: "Target Platform: SAP Integration Suite" })
    .waitFor({ state: "visible" });
  await ensureEnhancedBaseline(page);

  const baseline = await grandTotal(page);
  expect(baseline).toBeGreaterThan(0);

  // 2. Confirm the Contract Discount section, then enable it
  await expect(
    page.getByRole("heading", {
      name: "SAP Integration Suite Contract Discount Optional",
    }),
  ).toBeVisible();
  await page.locator("#is-discount-toggle").click();
  await expect(page.locator("#is-discount-toggle")).toHaveAttribute(
    "aria-checked",
    "true",
  );

  // 3. Select the "Percent (%)" tab explicitly (a prior run may have left Fixed active),
  //    then target the percent input as the active tab's only spinbutton in the card.
  await page.getByRole("tab", { name: "Percent (%)" }).click();
  await expect(page.getByRole("tab", { name: "Percent (%)" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  const percentInput = discountCard(page).getByRole("spinbutton");
  await expect(percentInput).toBeVisible();

  // List price the discount applies to (build-dependent).
  const listPrice = await summaryValue(page, "List price (annual)");
  expect(listPrice).toBeGreaterThan(0);

  // Apply a percentage and assert the discount + Grand Total move consistently with it,
  // computing the expectation from the live list price rather than a hard-coded total.
  const applyPercent = async (pct: number) => {
    await percentInput.fill(String(pct));
    await page.keyboard.press("Tab");
    await expect(percentInput).toHaveValue(String(pct));
    const expectedDiscount = Math.round((listPrice * pct) / 100);
    await expect(async () => {
      const discount = await summaryValue(page, "Discount applied");
      const gt = await grandTotal(page);
      // Discount magnitude matches the percentage (allow ±1 for rounding)…
      expect(Math.abs(Math.abs(discount) - expectedDiscount)).toBeLessThanOrEqual(1);
      // …and the Grand Total drops by exactly the shown discount.
      expect(gt).toBe(baseline + discount); // discount is negative
    }).toPass();
  };

  // 3–5. 15% — discount and net IS reflect 15% off list, Grand Total reduced accordingly.
  await applyPercent(15);

  // 6. 0% — no discount, Grand Total returns to baseline.
  await applyPercent(0);
  await expect(async () => {
    expect(await grandTotal(page)).toBe(baseline);
  }).toPass();

  // 7. 30% — larger discount, larger deduction.
  await applyPercent(30);

  // 8. 50% — largest discount in this scenario.
  await applyPercent(50);

  // 9. Restore to 15%.
  await applyPercent(15);

  // 10. Disable the Contract Discount toggle — Grand Total returns to baseline.
  await page.locator("#is-discount-toggle").click();
  await expect(async () => {
    expect(await grandTotal(page)).toBe(baseline);
  }).toPass();
});
