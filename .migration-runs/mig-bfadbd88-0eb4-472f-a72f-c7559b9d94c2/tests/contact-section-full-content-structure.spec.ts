// spec: specs/plan.md
// seed: seed.spec.ts

import { test, expect } from "@playwright/test";

test("Contact Section: Full Content Structure", async ({ page }) => {
  // 1. Navigate to the entry URL
  await page.goto("https://spalanivelu1989.github.io/");

  // 2. Locate the element with id="contact"
  const contactSection = page.locator("#contact");

  // 3. Assert the section's <h2> heading text is "Contact"
  const heading = contactSection.getByRole("heading", { level: 2 });
  await expect(heading).toBeVisible();
  await expect(heading).toHaveText("Contact");

  // 4. Assert the introductory paragraph contains "I'm always open to discussing new projects"
  const introParagraph = contactSection.locator("p");
  await expect(introParagraph).toContainText(
    "I'm always open to discussing new projects",
  );

  // 5. Assert the <ul> list inside the section contains exactly 2 list items
  const listItems = contactSection.locator("ul li");
  await expect(listItems).toHaveCount(2);

  // 6. Assert a list item includes the label text "Email:"
  await expect(listItems.filter({ hasText: "Email:" })).toContainText("Email:");

  // 7. Assert a list item includes the label text "LinkedIn:"
  await expect(listItems.filter({ hasText: "LinkedIn:" })).toContainText(
    "LinkedIn:",
  );
});
