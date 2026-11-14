import { defineConfig } from '@playwright/test';

const port = Number(process.env.PORT || 4000);

export default defineConfig({
  testDir: './tests',
  timeout: 45_000,
  expect: { timeout: 8_000 },
  workers: 2,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${port}`,
    // Uses the Chrome that is already installed, so no browser download is needed.
    channel: process.env.PW_CHANNEL || 'chrome',
    headless: true,
    screenshot: 'only-on-failure',
  },
  outputDir: './test-results',
  webServer: {
    command: `yarn dev -p ${port}`,
    url: `http://localhost:${port}/`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
