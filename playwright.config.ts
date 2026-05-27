import { defineConfig, devices } from "@playwright/test";

// Base Playwright config. Generated tests live under the per-run output dir and
// are executed against this config (headless Chromium). The runner module (T8)
// points `testDir` at the active run's generated-tests directory at runtime.
export default defineConfig({
  testDir: "./generated-tests",
  timeout: 30_000,
  fullyParallel: true,
  reporter: [
    ["json", { outputFile: "playwright-report/results.json" }],
    ["line"],
  ],
  use: {
    headless: true,
    ...devices["Desktop Chrome"],
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
