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

// Step 4: Fill username
await page.locator('#j_username').fill(process.env.TARGET_USERNAME);
console.log('Step 4 - Filled username');
await page.keyboard.press('Enter');
await page.waitForLoadState('networkidle');
await page.waitForTimeout(2000);
console.log('Step 4b - URL after username submit:', page.url());

// Check for password field
const inputs = page.locator('input:visible');
const count = await inputs.count();
console.log('Input count after username:', count);

for (let i = 0; i < count; i++) {
  const inp = inputs.nth(i);
  const type = await inp.getAttribute('type');
  const id = await inp.getAttribute('id');
  const name = await inp.getAttribute('name');
  const placeholder = await inp.getAttribute('placeholder');
  console.log(`Input ${i}: type=${type}, id=${id}, name=${name}, placeholder=${placeholder}`);
}

// Try to fill password
try {
  const passwordInput = page.locator('input[type="password"]');
  if (await passwordInput.count() > 0) {
    await passwordInput.fill(process.env.TARGET_PASSWORD);
    console.log('Filled password');
    await page.keyboard.press('Enter');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    console.log('URL after password submit:', page.url());
  }
} catch(e) {
  console.log('Error filling password:', e.message);
}

console.log('Final URL:', page.url());
console.log('Page title:', await page.title());

const bodyText = await page.locator('body').innerText();
console.log('Page body (first 3000 chars):', bodyText.substring(0, 3000));

// Save state
await context.storageState({ path: '/Users/senthilpalanivelu/Programme/test-suite/.runs/8b3850bd-9201-489e-b53b-111ab31c7d2a/.auth/storageState.json' });
console.log('State saved!');

await browser.close();
