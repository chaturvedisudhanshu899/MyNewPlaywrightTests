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
  retries: process.env.CI ? 1 : 0,                       // retry each test up to 1 time in CI, 0 times locally to fail fast
  workers: process.env.CI ? 2 : undefined,               // use 2 CPU cores in CI, all cores locally
  timeout: 25_000,                  // 25s per test (fail fast in CI)
  expect: {
    timeout: 5_000,                 // 5s for expect assertions
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
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
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
      testMatch: ['**/flipkart-ui.spec.js'],
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
      fullyParallel: true,
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
