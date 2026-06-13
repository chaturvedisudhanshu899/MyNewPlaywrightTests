/**
 * helpers.js — Shared utility functions for the Flipkart test suite
 */

/**
 * Generates a random string of given length
 * @param {number} length
 * @returns {string}
 */
function generateRandomString(length) {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

/**
 * Generates a random integer between min and max (inclusive)
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Waits for a given number of milliseconds — used to simulate network jitter in flaky tests
 * @param {number} ms
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Returns a random delay between minMs and maxMs — used in flaky tests to trigger race conditions
 * @param {number} minMs
 * @param {number} maxMs
 */
async function randomDelay(minMs = 500, maxMs = 3000) {
  const delay = randomInt(minMs, maxMs);
  await sleep(delay);
}

/**
 * Retries an async function up to `attempts` times
 * @param {() => Promise<any>} fn
 * @param {number} attempts
 * @param {number} delayMs - delay between retries
 */
async function retry(fn, attempts = 3, delayMs = 1000) {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === attempts - 1) throw err;
      await sleep(delayMs);
    }
  }
}

/**
 * Generates a timestamped screenshot name
 * @param {string} testName
 * @returns {string}
 */
function screenshotName(testName) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  return `${testName.replace(/\s+/g, '_')}_${ts}.png`;
}

/**
 * Checks if a value is within ± tolerance of the expected value (for price assertions)
 * @param {number} actual
 * @param {number} expected
 * @param {number} tolerancePercent
 */
function isWithinTolerance(actual, expected, tolerancePercent = 5) {
  const diff = Math.abs(actual - expected) / expected;
  return diff <= tolerancePercent / 100;
}

/**
 * Dismisses the Flipkart login popup if it appears
 * @param {import('@playwright/test').Page} page
 */
async function dismissLoginPopup(page) {
  try {
    const closeBtn = page.locator('span:has-text("✕"), button:has-text("✕"), button._2KpZ6l._2doB4z').first();
    if (await closeBtn.isVisible({ timeout: 5000 })) {
      await closeBtn.click();
    }
  } catch {
    // popup not present — fine
  }
}

module.exports = {
  generateRandomString,
  randomInt,
  sleep,
  randomDelay,
  retry,
  screenshotName,
  isWithinTolerance,
  dismissLoginPopup,
};
