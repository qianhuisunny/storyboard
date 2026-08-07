import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for Plotline storyboard automation
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html'], ['list']],

  // Global timeout for each test
  timeout: 120_000, // 2 minutes - AI generation can take a while

  // Expect timeout for assertions
  expect: {
    timeout: 10_000,
  },

  // Output directory for test artifacts
  outputDir: 'test-results/',

  use: {
    // Base URL for the frontend
    baseURL: 'http://localhost:3000',

    // Collect trace on first retry
    trace: 'on-first-retry',

    // Screenshot on failure
    screenshot: 'only-on-failure',

    // Video recording
    video: 'retain-on-failure',

    // Viewport
    viewport: { width: 1280, height: 720 },
  },

  projects: [
    // API contract tests use the server-issued anonymous session where needed.
    {
      name: 'api',
      testMatch: /(?:^|[\\/])api-[^\\/]*\.spec\.ts$/,
      use: {
        ...devices['Desktop Chrome'],
      },
    },
    // Current canonical mocked UI tests do not require an authenticated browser.
    {
      name: 'chromium',
      testMatch: /(?:^|[\\/])(?:create-project|smart-intake|plotline-workflow)\.spec\.ts$/,
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],

  // Run local dev server before starting tests
  webServer: [
    {
      command: 'npm run dev',
      url: 'http://localhost:3000',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: 'cd ../backend && source venv/bin/activate && uvicorn app.main:app --port 8001',
      url: 'http://localhost:8001/health',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
