// spec: specs/plan.md
// seed: seed.spec.ts

import { test, expect } from "@playwright/test";

test("Contact Section: Email Link Correctness", async ({ page }) => {
  // 1. Navigate to the entry URL
  await page.goto("https://senthilcaesar.github.io/");

  // 2. Locate the element with id="contact"
  const contactSection = page.locator("#contact");

  // 3. Find the anchor element with visible text "spalanivelu1989@gmail.com"
  const emailLink = contactSection.getByRole("link", {
    name: "spalanivelu1989@gmail.com",
  });

  // 4. Assert the link is visible
  await expect(emailLink).toBeVisible();

  // 5. Assert the link's href attribute is exactly "mailto:spalanivelu1989@gmail.com"
  await expect(emailLink).toHaveAttribute(
    "href",
    "mailto:spalanivelu1989@gmail.com",
  );
});
