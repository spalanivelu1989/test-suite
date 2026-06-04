const { chromium } = require('@playwright/test');
(async () => {
  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  console.log('Browser launched. Creating context...');
  const context = await browser.newContext();
  console.log('Context created. Creating page...');
  const page = await context.newPage();
  console.log('Page created. Navigating to https://www.tarento.com/ ...');
  try {
    await page.goto('https://www.tarento.com/', { timeout: 15000 });
    console.log('Navigation successful!');
  } catch (err) {
    console.error('Navigation failed:', err.message);
  }
  console.log('Closing browser...');
  await browser.close();
  console.log('Browser closed.');
})().catch(err => {
  console.error('Unhandled error:', err);
});
