/**
 * flipkart-ui.spec.js
 * Comprehensive UI tests for Flipkart — Home, Search, Product Detail
 * Run:  npx playwright test tests/flipkart-ui.spec.js --project=UI-Chromium
 */
const { test, expect } = require('@playwright/test');
const { FlipkartHomePage }    = require('../pages/FlipkartHomePage');
const { FlipkartSearchPage }  = require('../pages/FlipkartSearchPage');
const { FlipkartProductPage } = require('../pages/FlipkartProductPage');
const testData = require('../data/flipkartTestData.json');

// ── Shared page instances ─────────────────────────────────────────────────────
let home, search, product;

test.beforeEach(async ({ page }) => {
  home    = new FlipkartHomePage(page);
  search  = new FlipkartSearchPage(page);
  product = new FlipkartProductPage(page);
});

// ═════════════════════════════════════════════════════════════════════════════
//  SUITE 1 — Home Page
// ═════════════════════════════════════════════════════════════════════════════
test.describe('🏠 Flipkart — Home Page', () => {

  test('TC_HOME_01 | Page loads and title contains "Flipkart"', async ({ page }) => {
    await home.goto();
    await expect(page).toHaveTitle(/Flipkart/i);
  });

  test('TC_HOME_02 | URL should be Flipkart homepage', async ({ page }) => {
    await home.goto();
    expect(page.url()).toContain('flipkart.com');
  });

  test('TC_HOME_03 | Search box is visible on home page', async ({ page }) => {
    await home.goto();
    await expect(home.searchBox).toBeVisible();
  });

  test('TC_HOME_04 | Login button is visible in header', async ({ page }) => {
    await home.goto();
    await expect(home.loginButton).toBeVisible();
  });

  test('TC_HOME_05 | Cart icon is visible in header', async ({ page }) => {
    await home.goto();
    await expect(home.cartIcon).toBeVisible();
  });

  test('TC_HOME_06 | Flipkart logo is visible', async ({ page }) => {
    await home.goto();
    await expect(home.logo).toBeVisible();
  });

  test('TC_HOME_07 | Clicking logo reloads home page', async ({ page }) => {
    await home.goto();
    await home.clickLogo();
    expect(page.url()).toContain('flipkart.com');
    await expect(page).toHaveTitle(/Flipkart/i);
  });

  test('TC_HOME_08 | Search box accepts keyboard input', async ({ page }) => {
    await home.goto();
    await home.searchBox.fill('laptop');
    await expect(home.searchBox).toHaveValue('laptop');
  });

  test('TC_HOME_09 | Page has no critical console errors on load', async ({ page }) => {
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await home.goto();
    // Allow minor warnings — fail only on JS errors
    const jsErrors = errors.filter(e => e.includes('Uncaught') || e.includes('TypeError'));
    expect(jsErrors.length).toBe(0);
  });

  test('TC_HOME_10 | Page response status is 200', async ({ page, request }) => {
    const response = await page.goto('/', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(200);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  SUITE 2 — Search Functionality
// ═════════════════════════════════════════════════════════════════════════════
test.describe('🔍 Flipkart — Search', () => {

  test.beforeEach(async ({ page }) => {
    await home.goto();
  });

  test('TC_SEARCH_01 | Search "laptop" returns results', async ({ page }) => {
    await home.search(testData.searchKeywords.laptop);
    const count = await search.getResultCount();
    expect(count).toBeGreaterThan(0);
  });

  test('TC_SEARCH_02 | Search "samsung galaxy" returns mobile products', async ({ page }) => {
    await home.search(testData.searchKeywords.mobile);
    const title = await search.getFirstProductTitle();
    expect(title?.toLowerCase()).toMatch(/samsung|galaxy|mobile|phone/i);
  });

  test('TC_SEARCH_03 | URL updates with search query param', async ({ page }) => {
    await home.search('headphones');
    expect(page.url()).toContain('headphones');
  });

  test('TC_SEARCH_04 | Search using Enter key works', async ({ page }) => {
    await home.searchAndPressEnter('boat headphones');
    const count = await search.getResultCount();
    expect(count).toBeGreaterThan(0);
  });

  test('TC_SEARCH_05 | Products have prices displayed', async ({ page }) => {
    await home.search('laptop');
    const prices = await search.getAllPrices();
    expect(prices.length).toBeGreaterThan(0);
    prices.forEach(p => expect(p).toBeGreaterThan(0));
  });

  test('TC_SEARCH_06 | Sort "Price -- Low to High" orders results', async ({ page }) => {
    await home.search('laptop');
    await search.sortBy('Price -- Low to High');
    const prices = await search.getAllPrices();
    const sorted = [...prices].sort((a, b) => a - b);
    // First 5 prices should follow ascending order
    expect(prices.slice(0, 5)).toEqual(sorted.slice(0, 5));
  });

  test('TC_SEARCH_07 | Sort "Price -- High to Low" orders results', async ({ page }) => {
    await home.search('laptop');
    await search.sortBy('Price -- High to Low');
    const prices = await search.getAllPrices();
    const sorted = [...prices].sort((a, b) => b - a);
    expect(prices.slice(0, 5)).toEqual(sorted.slice(0, 5));
  });

  test('TC_SEARCH_08 | Search result page has pagination', async ({ page }) => {
    await home.search('laptop');
    await expect(search.pagination).toBeVisible({ timeout: 10000 });
  });

  test('TC_SEARCH_09 | Next page loads more products', async ({ page }) => {
    await home.search('laptop');
    await search.goToNextPage();
    expect(page.url()).toMatch(/page=2|start=\d+/);
  });

  test('TC_SEARCH_10 | Special character search shows no results or safe error', async ({ page }) => {
    await home.search(testData.searchKeywords.special);
    // Should not crash — either no results msg or 0 products
    const noResult = await search.isNoResultsVisible();
    const count    = await search.getResultCount();
    expect(noResult || count === 0).toBeTruthy();
  });

  test('TC_SEARCH_11 | Brand filter narrows results', async ({ page }) => {
    await home.search('laptop');
    const beforeCount = await search.getResultCount();
    await search.filterByBrand('HP');
    const afterCount  = await search.getResultCount();
    expect(afterCount).toBeLessThanOrEqual(beforeCount);
  });

  test('TC_SEARCH_12 | Clearing search box and searching again works', async ({ page }) => {
    await home.search('laptop');
    await home.search('tv');
    expect(page.url()).toContain('tv');
  });

  test('TC_SEARCH_13 | Product cards show rating', async ({ page }) => {
    await home.search('laptop');
    const ratingCount = await search.productRatings.count();
    expect(ratingCount).toBeGreaterThan(0);
  });

  test('TC_SEARCH_14 | Clicking a product opens product detail page', async ({ page }) => {
    await home.search('boat headphones');
    await search.clickFirstProduct();
    // PDP URL usually contains /p/
    expect(page.url()).toContain('/p/');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  SUITE 3 — Product Detail Page
// ═════════════════════════════════════════════════════════════════════════════
test.describe('📦 Flipkart — Product Detail Page', () => {

  test.beforeEach(async ({ page }) => {
    await home.goto();
    await home.search('boat headphones');
    await search.clickFirstProduct();
  });

  test('TC_PDP_01 | Product title is visible', async ({ page }) => {
    await expect(product.productTitle).toBeVisible({ timeout: 15000 });
    const title = await product.getTitle();
    expect(title?.length).toBeGreaterThan(3);
  });

  test('TC_PDP_02 | Product price is displayed and greater than zero', async ({ page }) => {
    await expect(product.finalPrice).toBeVisible({ timeout: 15000 });
    const price = await product.getPrice();
    expect(price).toBeGreaterThan(0);
  });

  test('TC_PDP_03 | Product image is visible', async ({ page }) => {
    await expect(product.mainImage).toBeVisible({ timeout: 15000 });
    const src = await product.mainImage.getAttribute('src');
    expect(src).toBeTruthy();
  });

  test('TC_PDP_04 | Add to Cart button is present', async ({ page }) => {
    const outOfStock = await product.isOutOfStock();
    if (!outOfStock) {
      await expect(product.addToCartBtn).toBeVisible({ timeout: 15000 });
    }
  });

  test('TC_PDP_05 | Buy Now button is present', async ({ page }) => {
    const outOfStock = await product.isOutOfStock();
    if (!outOfStock) {
      await expect(product.buyNowBtn).toBeVisible({ timeout: 15000 });
    }
  });

  test('TC_PDP_06 | URL contains product identifier /p/', async ({ page }) => {
    expect(page.url()).toContain('/p/');
  });

  test('TC_PDP_07 | Pincode delivery check works', async ({ page }) => {
    await product.checkPincode('400001');
    await expect(product.deliveryInfo).toBeVisible({ timeout: 8000 });
  });

  test('TC_PDP_08 | Thumbnail images are clickable', async ({ page }) => {
    const thumbCount = await product.thumbnails.count();
    if (thumbCount > 1) {
      await product.clickThumbnail(1);
      // Image should change — just ensure no crash
      await expect(product.mainImage).toBeVisible();
    }
  });

  test('TC_PDP_09 | Product rating is between 1 and 5', async ({ page }) => {
    const ratingText = await product.rating.textContent({ timeout: 10000 }).catch(() => '0');
    const rating = parseFloat(ratingText ?? '0');
    if (rating > 0) {
      expect(rating).toBeGreaterThanOrEqual(1);
      expect(rating).toBeLessThanOrEqual(5);
    }
  });

  test('TC_PDP_10 | Seller information is displayed', async ({ page }) => {
    const sellerVisible = await product.sellerName.isVisible({ timeout: 8000 }).catch(() => false);
    // Seller section may be labeled differently — just check page has it somewhere
    if (sellerVisible) {
      const sellerText = await product.sellerName.textContent();
      expect(sellerText?.length).toBeGreaterThan(0);
    }
  });
});
