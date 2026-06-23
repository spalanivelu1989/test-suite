// spec: specs/plan.md
// seed: seed.spec.ts

import { test, expect } from "@playwright/test";

test('"About Me" Navigation Link: In-Page Hash Navigation', async ({
  page,
}) => {
  // 1. Navigate to the entry URL
  await page.goto("https://spalanivelu1989.github.io/");

  // 2. Confirm the initial URL has no #about hash
  expect(page.url()).toBe("https://spalanivelu1989.github.io/");

  // 3. Click the nav link "About Me"
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "About Me" })
    .click();

  // 4. Assert the current URL is https://spalanivelu1989.github.io/#about
  await expect(page).toHaveURL("https://spalanivelu1989.github.io/#about");

  // 5. Assert the <section id="about"> heading "About Me" is visible in the viewport
  const aboutHeading = page
    .locator("#about")
    .getByRole("heading", { name: "About Me", level: 2 });
  await expect(aboutHeading).toBeVisible();
  await expect(aboutHeading).toBeInViewport();
});
