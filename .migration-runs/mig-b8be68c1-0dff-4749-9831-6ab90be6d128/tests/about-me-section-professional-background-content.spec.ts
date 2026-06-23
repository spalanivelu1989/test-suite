// spec: specs/plan.md
// seed: seed.spec.ts

import { test, expect } from "@playwright/test";

test("About Me Section: Professional Background Content", async ({ page }) => {
  // 1. Navigate to the entry URL
  await page.goto("https://senthilcaesar.github.io/");

  // 2. Locate the element with id="about"
  const aboutSection = page.locator("#about");

  // 3. Assert the section's <h2> heading text is "About Me"
  const heading = aboutSection.getByRole("heading", { level: 2 });
  await expect(heading).toBeVisible();
  await expect(heading).toHaveText("About Me");

  // 4. Assert a paragraph inside the section contains "7 years of experience"
  const experiencePara = aboutSection
    .locator("p")
    .filter({ hasText: "7 years of experience" });
  await expect(experiencePara).toContainText("7 years of experience");

  // 5. Assert a paragraph contains "AI Agent orchestration"
  const techPara = aboutSection
    .locator("p")
    .filter({ hasText: "AI Agent orchestration" });
  await expect(techPara).toContainText("AI Agent orchestration");

  // 6. Assert the same paragraph contains "LangChain"
  await expect(techPara).toContainText("LangChain");

  // 7. Assert the same paragraph contains "Model Context Protocol (MCP)"
  await expect(techPara).toContainText("Model Context Protocol (MCP)");
});
