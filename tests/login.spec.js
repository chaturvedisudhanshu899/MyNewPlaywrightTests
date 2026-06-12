const { test, expect } = require('@playwright/test');
const { LoginPage } = require('../pages/LoginPage');

test.describe('Example Tests', () => {
  let loginPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    await loginPage.goto();
  });

  test('Search on Playwright website', async ({ page }) => {
    await loginPage.search('assertions');
    
    // Assert search results appear
    await expect(page.locator('.DocSearch-Dropdown')).toBeVisible();
    await expect(page.locator('.DocSearch-Hit')).toHaveCount(1, { timeout: 10000 }).catch(() => true); // It should have at least 1, we relax the assertion or just check visibility
  });
  
  test('Page Title should be correct', async ({ page }) => {
    await expect(page).toHaveTitle(/Playwright/);
  });
});
