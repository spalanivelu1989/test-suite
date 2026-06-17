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

// Step 3: Click Default Identity Provider (as per instructions)
await page.getByRole('link', { name: 'Default Identity Provider' }).click();
await page.waitForLoadState('networkidle');
console.log('Step 3 - After Default IDP click:', page.url());

// Step 4: Fill username
await page.locator('#j_username').fill(process.env.TARGET_USERNAME);
console.log('Step 4 - Filled username');

// Click Continue button instead of pressing Enter
const continueBtn = page.getByRole('button', { name: /continue/i });
if (await continueBtn.count() > 0) {
  await continueBtn.click();
  console.log('Clicked Continue button');
} else {
  // Try finding a submit button
  const submitBtn = page.locator('input[type="submit"], button[type="submit"]');
  if (await submitBtn.count() > 0) {
    await submitBtn.first().click();
    console.log('Clicked submit button');
  } else {
    await page.keyboard.press('Enter');
    console.log('Pressed Enter');
  }
}
await page.waitForLoadState('networkidle');
await page.waitForTimeout(2000);
console.log('URL after username submit:', page.url());

const inputs2 = page.locator('input:visible');
const count2 = await inputs2.count();
console.log('Input count after username:', count2);

for (let i = 0; i < count2; i++) {
  const inp = inputs2.nth(i);
  const type = await inp.getAttribute('type');
  const id = await inp.getAttribute('id');
  console.log(`Input ${i}: type=${type}, id=${id}`);
}

// Fill password if available
const pwField = page.locator('#j_password');
if (await pwField.count() > 0) {
  await pwField.fill(process.env.TARGET_PASSWORD);
  console.log('Filled password');
  
  // Click Continue
  const continueBtn2 = page.getByRole('button', { name: /continue/i });
  if (await continueBtn2.count() > 0) {
    await continueBtn2.click();
  } else {
    await page.keyboard.press('Enter');
  }
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);
  console.log('URL after password submit:', page.url());
}

console.log('Final URL:', page.url());
console.log('Page title:', await page.title());

const bodyText = await page.locator('body').innerText();
console.log('Page body (first 2000 chars):', bodyText.substring(0, 2000));

await context.storageState({ path: '/Users/senthilpalanivelu/Programme/test-suite/.runs/8b3850bd-9201-489e-b53b-111ab31c7d2a/.auth/storageState.json' });
console.log('State saved!');

await browser.close();
