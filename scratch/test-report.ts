import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Listen for console messages
  page.on("console", (msg) => {
    console.log(`[BROWSER CONSOLE] ${msg.type()}: ${msg.text()}`);
  });

  page.on("pageerror", (err) => {
    console.error(`[BROWSER ERROR] ${err.message}`);
  });

  const filePath = "file:///Users/senthilpalanivelu/Programme/test-suite/.runs/run-tarento-failed/report.html";
  console.log(`Navigating to ${filePath}`);
  await page.goto(filePath);

  // Check Glossary tab button
  const glossaryBtn = page.locator('button[data-tab="glossary"]');
  const glossaryBtnText = await glossaryBtn.textContent();
  console.log(`Glossary button text: "${glossaryBtnText?.trim()}"`);

  // Check if Glossary panel is present in DOM
  const glossaryPanel = page.locator('#panel-glossary');
  const isPresent = await glossaryPanel.count() > 0;
  console.log(`Glossary panel exists in DOM: ${isPresent}`);

  // Check if Glossary panel is visible initially (should be hidden)
  let isVisible = await glossaryPanel.isVisible();
  console.log(`Glossary panel visible on load: ${isVisible}`);

  // Click the Glossary button
  console.log("Clicking Glossary tab button...");
  await glossaryBtn.click();

  // Wait a bit for the transition
  await page.waitForTimeout(500);

  // Check if Glossary panel is visible now
  isVisible = await glossaryPanel.isVisible();
  console.log(`Glossary panel visible after click: ${isVisible}`);

  // Fetch some text inside Glossary panel to verify
  const dtElements = await page.locator('#panel-glossary dt').allTextContents();
  console.log("Glossary Terms found on page:", dtElements);

  await browser.close();
}

main().catch((err) => {
  console.error("Test script failed:", err);
});
