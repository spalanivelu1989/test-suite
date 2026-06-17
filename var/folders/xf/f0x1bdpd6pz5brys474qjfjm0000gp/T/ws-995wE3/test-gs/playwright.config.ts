import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  globalSetup: './global-setup.ts',
  reporter: [['json', { outputFile: 'results.json' }], ['line']],
  use: {
    headless: true,
    ...devices['Desktop Chrome'],
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    storageState: '.auth/storageState.json',
  },
});
