import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();

// Step 1: Open the app
await page.goto('https://sapbtp-roi-calculator-stage.cfapps.eu10-004.hana.ondemand.com/single');
await page.waitForLoadState('networkidle');
console.log('Step 1 - App page:', page.url());

// Step 2: Click Login with BTP
await page.getByRole('button', { name: 'Login with BTP' }).click();
await page.waitForLoadState('networkidle');
console.log('Step 2 - After BTP click:', page.url());

// Step 3: Click Default Identity Provider
await page.getByRole('link', { name: 'Default Identity Provider' }).click();
await page.waitForLoadState('networkidle');
console.log('Step 3 - After IDP click:', page.url());

// Step 4: Fill credentials
const inputs = page.locator('input:visible');
const count = await inputs.count();
console.log('Input count:', count);

for (let i = 0; i < count; i++) {
  const inp = inputs.nth(i);
  const type = await inp.getAttribute('type');
  const id = await inp.getAttribute('id');
  const name = await inp.getAttribute('name');
  const placeholder = await inp.getAttribute('placeholder');
  console.log(`Input ${i}: type=${type}, id=${id}, name=${name}, placeholder=${placeholder}`);
}
