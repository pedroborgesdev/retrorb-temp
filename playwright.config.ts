import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e', fullyParallel: true, retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:4175', viewport: { width: 1366, height: 768 },
    trace: 'retain-on-failure', screenshot: 'only-on-failure',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {},
  },
  webServer: { command: 'npm run dev:web -- --port 4175', url: 'http://127.0.0.1:4175', reuseExistingServer: false, timeout: 30000 },
});
