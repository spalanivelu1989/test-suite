// spec: specs/plan.md
// seed: seed.spec.ts

import { test, expect } from "@playwright/test";

test("Navigation Bar: Both Links Present with Correct Hrefs", async ({
  page,
}) => {
  // 1. Navigate to the entry URL
  await page.goto("https://senthilcaesar.github.io/");

  // 2. Locate the <nav> element inside the <header> (banner landmark)
  const nav = page.getByRole("navigation");

  // 3. Assert a link with text "About Me" is visible
  const aboutLink = nav.getByRole("link", { name: "About Me" });
  await expect(aboutLink).toBeVisible();

  // 4. Assert the "About Me" link's href attribute points to #about
  const aboutHref = await aboutLink.getAttribute("href");
  expect(aboutHref).toContain("#about");

  // 5. Assert a link with text "Contact" is visible
  const contactLink = nav.getByRole("link", { name: "Contact" });
  await expect(contactLink).toBeVisible();

  // 6. Assert the "Contact" link's href attribute points to #contact
  const contactHref = await contactLink.getAttribute("href");
  expect(contactHref).toContain("#contact");
});
