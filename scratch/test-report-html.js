import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { diskPersistence } from "../src/runManager/persistence.js";
import { renderHtml } from "../src/reporter/render.js";

async function runTest() {
  const runId = "3f8ab896-ee79-4c91-b28d-84c65abde440";
  const run = await diskPersistence.get(runId);
  if (!run || !run.report) {
    console.error("Run/Report not found");
    process.exit(1);
  }

  const html = renderHtml(run.report);
  
  console.log("Launching Playwright...");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Capture console errors
  page.on("pageerror", (err) => {
    console.error("PAGE ERROR:", err);
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      console.error("CONSOLE ERROR:", msg.text());
    } else {
      console.log("CONSOLE LOG:", msg.text());
    }
  });

  console.log("Setting page content...");
  await page.setContent(html);

  console.log("Checking initial active tab...");
  const activeTab = await page.$eval(".tab-btn.active", (el) => el.getAttribute("data-tab"));
  const activePanel = await page.$eval(".tab-panel.active", (el) => el.id);
  console.log(`Active tab: ${activeTab}, Active panel: ${activePanel}`);

  console.log("Clicking 'What Was Tested' tab...");
  await page.click('button[data-tab="journeys"]');

  // Wait a short time
  await page.waitForTimeout(500);

  const activeTabAfter = await page.$eval(".tab-btn.active", (el) => el.getAttribute("data-tab"));
  const activePanelAfter = await page.$eval(".tab-panel.active", (el) => el.id);
  console.log(`After click - Active tab: ${activeTabAfter}, Active panel: ${activePanelAfter}`);

  if (activeTabAfter !== "journeys" || activePanelAfter !== "panel-journeys") {
    console.error("ERROR: Tab switching failed!");
  } else {
    console.log("SUCCESS: Tab switching works!");
  }

  console.log("Checking for code pill buttons...");
  const pillButtons = await page.$$(".code-pill-btn");
  console.log(`Found ${pillButtons.length} code pill buttons.`);

  if (pillButtons.length > 0) {
    console.log("Clicking the first code pill button...");
    await pillButtons[0].click();
    await page.waitForTimeout(500);

    const isModalActive = await page.$eval("#code-modal", (el) => el.classList.contains("active"));
    const modalFilename = await page.$eval("#code-modal-filename", (el) => el.innerText);
    const modalBodyText = await page.$eval("#code-modal-body", (el) => el.innerText);

    console.log(`Modal active: ${isModalActive}`);
    console.log(`Modal filename: ${modalFilename}`);
    console.log(`Modal body character count: ${modalBodyText.length}`);

    if (isModalActive && modalFilename && modalBodyText.length > 0) {
      console.log("SUCCESS: Code Viewer Modal functions correctly!");
    } else {
      console.error("ERROR: Code Viewer Modal failed!");
    }

    console.log("Closing modal...");
    await page.click("#code-modal .lightbox-close");
    await page.waitForTimeout(500);
    const isModalActiveAfter = await page.$eval("#code-modal", (el) => el.classList.contains("active"));
    console.log(`Modal active after close: ${isModalActiveAfter}`);
  }

  await browser.close();
}

runTest().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
