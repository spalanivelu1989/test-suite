import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  workers: 1,
  fullyParallel: false,
  reporter: [['json', { outputFile: 'results.json' }], ['line']],
  use: {
    headless: true,
    ...devices['Desktop Chrome'],
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});
