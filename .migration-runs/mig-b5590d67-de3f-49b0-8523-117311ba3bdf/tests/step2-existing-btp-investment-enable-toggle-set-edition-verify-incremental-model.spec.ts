// spec: specs/plan.md
// seed: seed.spec.ts
// Scenario 11 — Step 2 Existing BTP Investment: Enable Toggle, Set Edition, Verify Incremental Model

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
const alreadyOwned = (page: Page) =>
  summaryValue(page, "Already owned (excluded from ROI)");
const incremental = (page: Page) =>
  summaryValue(page, "Effective Incremental Annual Cost");

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

const existingUnitsInput = (page: Page) =>
  page
    .getByText("Existing Units Already Licensed")
    .locator("..")
    .getByRole("spinbutton")
    .first();

test("Step 2 Existing BTP Investment: Enable Toggle, Set Edition, Verify Incremental Model", async ({
  page,
}) => {
  // Reach Step 2 and establish a deterministic baseline (all optional toggles OFF).
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

  // 1. Toggle starts disabled
  const existingBtpSwitch = page.locator("#existing-btp-toggle");
  await expect(existingBtpSwitch).toHaveAttribute("aria-checked", "false");

  // 2. Enable — confirm inputs appear
  await existingBtpSwitch.click();
  await expect(existingBtpSwitch).toHaveAttribute("aria-checked", "true");
  await expect(page.getByText("Existing Edition Owned")).toBeVisible();
  await expect(page.getByText("Existing Units Already Licensed")).toBeVisible();

  // Normalise to "nothing owned": 0 existing units (a prior run may have left a value).
  await existingUnitsInput(page).fill("0");
  await page.keyboard.press("Tab");

  // 3. With nothing owned: Already Owned = €0 and the Incremental Spend equals the
  //    target cost (i.e. the baseline Grand Total). Figures are build-dependent.
  await expect(async () => {
    expect(await alreadyOwned(page)).toBe(0);
    expect(await incremental(page)).toBe(baseline);
  }).toPass();

  // 4. Select "Enhanced Edition" as the owned edition
  await page
    .getByText("Existing Edition Owned")
    .locator("..")
    .getByRole("combobox")
    .click();
  await page.getByRole("option", { name: "Enhanced Edition" }).click();

  // 5. Set existing units = 1 — Already Owned becomes −(1 × edition unit price), and the
  //    Incremental Spend drops by exactly that. Derive the unit price at runtime.
  await existingUnitsInput(page).fill("1");
  await page.keyboard.press("Tab");
  let unitPrice = 0;
  await expect(async () => {
    const owned1 = await alreadyOwned(page);
    expect(owned1).toBeLessThan(0);
    unitPrice = -owned1;
    expect(await incremental(page)).toBe(baseline + owned1); // owned1 is negative
  }).toPass();
  expect(unitPrice).toBeGreaterThan(0);

  // 7. Set existing units = 2 — Already Owned doubles to −(2 × unit price).
  await existingUnitsInput(page).fill("2");
  await page.keyboard.press("Tab");
  await expect(async () => {
    expect(await alreadyOwned(page)).toBe(-2 * unitPrice);
    expect(await incremental(page)).toBe(baseline - 2 * unitPrice);
  }).toPass();

  // 8. Set the "Reuse of Existing BTP Artifacts" slider to 50%. The slider is a sibling of
  //    the label (not a child of its immediate parent), so anchor to the first slider that
  //    follows the label in document order rather than scoping by the label's parent.
  const reuseSlider = page
    .getByText("Reuse of Existing BTP Artifacts")
    .locator("xpath=following::*[@role='slider'][1]");
  await reuseSlider.click();
  await page.keyboard.press("Home");
  for (let i = 0; i < 10; i++) await page.keyboard.press("ArrowRight");
  await expect(reuseSlider).toHaveAttribute("aria-valuenow", "50");

  // 9. Disable the toggle — the Incremental section disappears and Grand Total returns
  //    to baseline.
  await existingBtpSwitch.click();
  await expect(page.getByText("Existing Edition Owned")).not.toBeVisible();
  await expect(async () => {
    expect(await grandTotal(page)).toBe(baseline);
  }).toPass();
});
