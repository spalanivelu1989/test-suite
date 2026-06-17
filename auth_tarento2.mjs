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

// Step 3: Click Tarento Identity Provider
await page.getByRole('link', { name: 'Tarento Identity Provider' }).click();
await page.waitForLoadState('networkidle');
console.log('Step 3 - After Tarento IDP click:', page.url());

// Fill username and password (both on same page)
await page.locator('#j_username').fill(process.env.TARGET_USERNAME);
await page.locator('#j_password').fill(process.env.TARGET_PASSWORD);
console.log('Filled username and password');

// Click Log On button
await page.locator('input[type="submit"][value="Log On"], button[type="submit"]').first().click();
await page.waitForLoadState('networkidle');
await page.waitForTimeout(3000);
console.log('URL after login:', page.url());
console.log('Page title:', await page.title());

const bodyText = await page.locator('body').innerText();
console.log('Page body (first 3000 chars):', bodyText.substring(0, 3000));

await context.storageState({ path: '/Users/senthilpalanivelu/Programme/test-suite/.runs/8b3850bd-9201-489e-b53b-111ab31c7d2a/.auth/storageState.json' });
console.log('State saved!');

await browser.close();
