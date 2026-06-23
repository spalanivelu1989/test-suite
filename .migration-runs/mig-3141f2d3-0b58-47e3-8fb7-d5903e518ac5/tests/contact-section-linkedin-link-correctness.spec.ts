// spec: specs/plan.md
// seed: seed.spec.ts

import { test, expect } from "@playwright/test";

test("Contact Section: LinkedIn Link Correctness", async ({ page }) => {
  // 1. Navigate to the entry URL
  await page.goto("https://spalanivelu1989.github.io/");

  // 2. Locate the element with id="contact"
  const contactSection = page.locator("#contact");

  // 3. Find the anchor element with visible text "senthil-palanivelu"
  const linkedInLink = contactSection.getByRole("link", {
    name: "senthil-palanivelu",
  });

  // 4. Assert the link is visible
  await expect(linkedInLink).toBeVisible();

  // 5. Assert the link's href attribute is exactly the full LinkedIn profile URL
  await expect(linkedInLink).toHaveAttribute(
    "href",
    "https://www.linkedin.com/in/senthil-palanivelu-0ba38844/",
  );

  // 6. Do NOT click the link — it navigates to an external URL outside scope
});
