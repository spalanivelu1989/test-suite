// spec: specs/plan.md
// seed: seed.spec.ts
// Scenario 10 — Step 2 Contract Discount: Fixed Amount Tab

import { test, expect, type Page } from "@playwright/test";

const APP_URL = "https://sapbtp-roi-calculator-stage.cfapps.eu10-004.hana.ondemand.com/single";

function eur(s: string | null | undefined): number {
  const m = String(s ?? "").match(/([−+-])?\s*€\s*([\d.,]+)/);
  if (!m) return NaN;
  const n = parseFloat(m[2].replace(/,/g, ""));
  const v = m[1] === "−" || m[1] === "-" ? -n : n;
  return v === 0 ? 0 : v; // normalise -0 → 0 so toBe(0) (Object.is) holds for "−€0.00"
}

// Read a labelled euro value from a live summary node (Grand Total / discount breakdown).
// Build-independent: parses whatever the app computes, never a hard-coded total.
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

// The Contract-Discount card, scoped to the toggle's nearest ancestor that owns the
// Percent/Fixed tablist. Scoping by a stable id (not a container's accessible name)
// keeps the lookup working across builds; the active tab's spinbutton is its only one.
function discountCard(page: Page) {
  return page
    .locator("#is-discount-toggle")
    .locator('xpath=ancestor::*[.//*[@role="tablist"]][1]');
}

test("Step 2 Contract Discount: Fixed Amount Tab", async ({ page }) => {
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

  // Baseline Grand Total with no discount (build-dependent figure).
  const baseline = await grandTotal(page);
  expect(baseline).toBeGreaterThan(0);

  // Enable the Contract Discount toggle
  await page.locator("#is-discount-toggle").click();
  await expect(page.locator("#is-discount-toggle")).toHaveAttribute(
    "aria-checked",
    "true",
  );

  // 2. Click the "Fixed amount" tab (explicitly — a prior run may have left another tab active)
  await page.getByRole("tab", { name: "Fixed amount" }).click();
  await expect(page.getByRole("tab", { name: "Fixed amount" })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  // 3. The fixed-amount input is the active tab's only spinbutton inside the discount card.
  const fixedAmountInput = discountCard(page).getByRole("spinbutton");
  await expect(fixedAmountInput).toBeVisible();

  // Read the IS list price the discount is applied against (build-dependent).
  const listPrice = await summaryValue(page, "List price (annual)");
  expect(listPrice).toBeGreaterThan(0);

  // 4–6. Enter 50000 — Discount applied = −€50,000 and Grand Total drops by exactly that.
  await fixedAmountInput.fill("50000");
  await page.keyboard.press("Tab");
  await expect(async () => {
    expect(await summaryValue(page, "Discount applied")).toBe(-50000);
    expect(await grandTotal(page)).toBe(baseline - 50000);
  }).toPass();
  // Net IS subscription = list price − discount
  expect(await summaryValue(page, "Net IS subscription (annual)")).toBe(
    listPrice - 50000,
  );

  // 7. Enter 0 — Discount = €0 and Grand Total returns to baseline.
  await fixedAmountInput.fill("0");
  await page.keyboard.press("Tab");
  await expect(async () => {
    expect(await summaryValue(page, "Discount applied")).toBe(0);
    expect(await grandTotal(page)).toBe(baseline);
  }).toPass();

  // 8. Enter the full list price — discount caps at list price, Net IS = €0,
  //    Grand Total drops by the full list price.
  await fixedAmountInput.fill(String(listPrice));
  await page.keyboard.press("Tab");
  await expect(async () => {
    expect(await summaryValue(page, "Discount applied")).toBe(-listPrice);
    expect(await summaryValue(page, "Net IS subscription (annual)")).toBe(0);
    expect(await grandTotal(page)).toBe(baseline - listPrice);
  }).toPass();

  // 9. Switch to the "Percent (%)" tab — its spinbutton is present with a percentage value,
  //    and applying a percentage produces a Grand Total below baseline.
  await page.getByRole("tab", { name: "Percent (%)" }).click();
  const percentInput = discountCard(page).getByRole("spinbutton");
  await expect(percentInput).toBeVisible();
  const pct = parseFloat((await percentInput.inputValue()) || "0");
  expect(pct).toBeGreaterThan(0);
  await expect(async () => {
    expect(await grandTotal(page)).toBeLessThan(baseline);
  }).toPass();
});
