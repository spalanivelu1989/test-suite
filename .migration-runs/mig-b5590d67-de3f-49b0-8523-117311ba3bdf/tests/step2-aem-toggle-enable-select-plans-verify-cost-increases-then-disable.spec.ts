// spec: specs/plan.md
// seed: seed.spec.ts
// Scenario 8 — Step 2 AEM Toggle: Enable, Select Plans, Verify Cost Increases, Then Disable

import { test, expect, type Page } from "@playwright/test";

const APP_URL = "https://sapbtp-roi-calculator-stage.cfapps.eu10-004.hana.ondemand.com/single";

// Parse a euro string (e.g. "€12,345.00", "−€0.00") to a signed number.
function eur(s: string | null | undefined): number {
  const m = String(s ?? "").match(/([−+-])?\s*€\s*([\d.,]+)/);
  if (!m) return NaN;
  const n = parseFloat(m[2].replace(/,/g, ""));
  const v = m[1] === "−" || m[1] === "-" ? -n : n;
  return v === 0 ? 0 : v; // normalise -0 → 0 so toBe(0) (Object.is) holds for "−€0.00"
}

// Read a labelled value from the live "Total Annual Cost of Ownership" summary node.
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

// Deterministic Step-2 baseline regardless of persisted server-side state.
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

// The AEM section's own switch, scoped to its card via the section heading.
function aemSwitch(page: Page) {
  return page
    .getByRole("heading", { name: "Event Driven Architecture (Optional)" })
    .locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]')
    .getByRole("switch");
}

// "Select" button inside a named AEM plan card.
function aemPlanSelect(page: Page, plan: string) {
  return page
    .getByRole("heading", { name: plan })
    .locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]')
    .getByRole("button", { name: "Select", exact: true });
}

test("Step 2 AEM Toggle: Enable, Select Plans, Verify Cost Increases, Then Disable", async ({
  page,
}) => {
  // 1. Reach Step 2 (Target Platform) via demo data load → Continue to Target Platform
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

  // Deterministic baseline (edition / units / packs / toggles OFF)
  await ensureEnhancedBaseline(page);

  // 2. Locate "Event Driven Architecture (Optional)" section; AEM toggle starts disabled
  await expect(
    page.getByRole("heading", { name: "Event Driven Architecture (Optional)" }),
  ).toBeVisible();
  await expect(aemSwitch(page)).toHaveAttribute("aria-checked", "false");

  // 4. Capture the baseline Grand Total before enabling AEM (value is build-dependent).
  const baseline = await grandTotal(page);
  expect(baseline).toBeGreaterThan(0);

  // 3. Enable the AEM toggle — confirm "Enabled" and the four AEM plan cards appear
  await aemSwitch(page).click();
  await expect(aemSwitch(page)).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("heading", { name: "AEM 100" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "AEM 250" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "AEM 1K" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "AEM 5K" })).toBeVisible();

  // Enabling AEM alone (no plan selected yet) should not exceed the baseline.
  await expect(async () => {
    expect(await grandTotal(page)).toBe(baseline);
  }).toPass();

  // 5–6. Select AEM 100 — Grand Total increases above baseline.
  await aemPlanSelect(page, "AEM 100").click();
  let aem100Total = baseline;
  await expect(async () => {
    aem100Total = await grandTotal(page);
    expect(aem100Total).toBeGreaterThan(baseline);
  }).toPass();

  // 7–8. Select AEM 1K (a larger plan) — Grand Total increases beyond the AEM 100 total.
  await aemPlanSelect(page, "AEM 1K").click();
  await expect(async () => {
    expect(await grandTotal(page)).toBeGreaterThan(aem100Total);
  }).toPass();

  // 9. Disable the AEM toggle — AEM cards disappear
  await aemSwitch(page).click();
  await expect(aemSwitch(page)).toHaveAttribute("aria-checked", "false");
  await expect(page.getByRole("heading", { name: "AEM 100" })).not.toBeVisible();

  // 10. Grand Total returns to the baseline (AEM cost no longer included).
  await expect(async () => {
    expect(await grandTotal(page)).toBe(baseline);
  }).toPass();
});
