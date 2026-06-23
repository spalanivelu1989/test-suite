// spec: specs/plan.md
// seed: seed.spec.ts

import { test, expect } from "@playwright/test";

test('"Contact" Navigation Link: In-Page Hash Navigation', async ({ page }) => {
  // 1. Navigate to the entry URL
  await page.goto("https://senthilcaesar.github.io/");

  // 2. Confirm the initial URL has no #contact hash
  expect(page.url()).toBe("https://senthilcaesar.github.io/");

  // 3. Click the nav link "Contact"
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Contact" })
    .click();

  // 4. Assert the current URL is https://senthilcaesar.github.io/#contact
  await expect(page).toHaveURL("https://senthilcaesar.github.io/#contact");

  // 5. Assert the <section id="contact"> heading "Contact" is visible in the viewport
  const contactHeading = page
    .locator("#contact")
    .getByRole("heading", { name: "Contact", level: 2 });
  await expect(contactHeading).toBeVisible();
  await expect(contactHeading).toBeInViewport();
});
