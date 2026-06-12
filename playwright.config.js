// playwright.config.js
const { defineConfig, devices } = require('@playwright/test');
const dotenv = require('dotenv');
const path = require('path');

// Load local .env overrides first (useful for secrets like SLACK_WEBHOOK_URL)
dotenv.config();

// Determine target environment file (default: qa)
const env = process.env.ENV || 'qa';
dotenv.config({ path: path.resolve(__dirname, `.env.${env}`), override: false });

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: false,             // sequential for stability on Flipkart
  forbidOnly: !!process.env.CI,
  retries: 2,                       // retry each test up to 2 times → run "twice" for flaky detection
  workers: 1,                       // 1 worker so tests don't race on shared state
  timeout: 60_000,                  // 60s per test (Flipkart can be slow)
  expect: {
    timeout: 15_000,                // 15s for expect assertions
  },
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
    ['allure-playwright', { outputFolder: 'allure-results' }],
    ['./utils/SlackReporter.js', { webhookUrl: process.env.SLACK_WEBHOOK_URL }],
  ],

  use: {
    baseURL: process.env.BASE_URL || 'https://www.flipkart.com',
    headless: true,
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // Extra HTTP headers to look like a real browser
    extraHTTPHeaders: {
      'Accept-Language': 'en-IN,en;q=0.9',
    },
  },

  projects: [
    // ── UI tests ──────────────────────────────────────────────
    {
      name: 'UI-Chromium',
      testMatch: ['**/flipkart-ui.spec.js', '**/flipkart-flaky.spec.js'],
      use: {
        ...devices['Desktop Chrome'],
        // NOTE: No channel:'chrome' here — CI uses Chromium (installed via playwright install)
        //       Locally you can override with: npx playwright test --channel=chrome
      },
    },
    {
      name: 'UI-Firefox',
      testMatch: ['**/flipkart-ui.spec.js'],
      use: { ...devices['Desktop Firefox'] },
    },

    // ── API tests (no browser needed) ─────────────────────────
    {
      name: 'API-Tests',
      testMatch: ['**/flipkart-api.spec.js'],
      use: { browserName: 'chromium' },   // still needed but page won't open
    },

    // ── Flaky-only quick run ───────────────────────────────────
    {
      name: 'Flaky-Suite',
      testMatch: ['**/flipkart-flaky.spec.js'],
      use: { ...devices['Desktop Chrome'] },
      retries: 2,   // explicit retry so each flaky test runs up to 3 times
    },
  ],
});
