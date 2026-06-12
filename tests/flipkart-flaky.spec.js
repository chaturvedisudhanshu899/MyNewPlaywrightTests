/**
 * flipkart-flaky.spec.js
 * ──────────────────────────────────────────────────────────────────────────────
 * Intentionally FLAKY tests — designed to be unstable so that:
 *   1. Running the suite TWICE demonstrates intermittent pass/fail behaviour
 *   2. An AI remediation tool can learn patterns from the instability
 *
 * Flakiness sources used here:
 *   A) TIMING   — hard sleeps, tiny timeouts that sometimes expire
 *   B) RANDOM   — Math.random() to decide assertion values at runtime
 *   C) NETWORK  — assumes external URLs may or may not respond quickly
 *   D) ORDER    — assertions that depend on element ordering which changes
 *   E) RACE     — parallel actions that occasionally step on each other
 *   F) STRICT   — overly tight assertions (exact counts, exact text match)
 *   G) POPUPS   — modal/overlay interference without guaranteed dismissal
 *
 * Run command:
 *   npx playwright test tests/flipkart-flaky.spec.js --project=Flaky-Suite --retries=2
 *
 * Expected outcome: some tests pass on retry (classic flaky signature)
 * ──────────────────────────────────────────────────────────────────────────────
 */
const { test, expect } = require('@playwright/test');
const { FlipkartHomePage }    = require('../pages/FlipkartHomePage');
const { FlipkartSearchPage }  = require('../pages/FlipkartSearchPage');
const { FlipkartProductPage } = require('../pages/FlipkartProductPage');
const { sleep, randomDelay, randomInt } = require('../utils/helpers');
const { getJson, postJson } = require('../utils/apiHelpers');

// ═════════════════════════════════════════════════════════════════════════════
//  GROUP A — TIMING FLAKINESS
//  Root cause: waiting too little (or too much) for async rendering
// ═════════════════════════════════════════════════════════════════════════════
test.describe('⏱️  Flaky-A: Timing Issues', () => {

  test('FLK_A01 | Search results visible with INSUFFICIENT timeout (2 s)', async ({ page }) => {
    // FLAKY: 2 s is too short — Flipkart can take 4–8 s on slow connections
    const home = new FlipkartHomePage(page);
    await home.goto();
    await home.search('laptop');
    const search = new FlipkartSearchPage(page);
    // Tight timeout — will fail occasionally on slow network
    await expect(search.resultItems.first()).toBeVisible({ timeout: 2000 });
  });

  test('FLK_A02 | Logo visible immediately after navigation — no wait', async ({ page }) => {
    // FLAKY: logo may not render before this assertion fires
    await page.goto('/');
    // No waitForLoadState — fires immediately
    const home = new FlipkartHomePage(page);
    await expect(home.logo).toBeVisible({ timeout: 1500 });
  });

  test('FLK_A03 | Random sleep causes assertion to land at wrong moment', async ({ page }) => {
    // FLAKY: sleep is between 0–4 s; sometimes lands mid-animation
    const home = new FlipkartHomePage(page);
    await home.goto();
    await home.search('mobile');
    await sleep(randomInt(0, 4000));   // random jitter
    const search = new FlipkartSearchPage(page);
    const count = await search.getResultCount();
    // Assertion expects exactly >10 but during load count may be 0
    expect(count).toBeGreaterThan(10);
  });

  test('FLK_A04 | Product detail price asserted before page settles', async ({ page }) => {
    // FLAKY: price element may render after DOMContentLoaded but before fully visible
    const home = new FlipkartHomePage(page);
    await home.goto();
    await home.search('boat headphones');
    const search = new FlipkartSearchPage(page);
    await search.clickFirstProduct();
    // No additional wait — price may not be in DOM yet
    const product = new FlipkartProductPage(page);
    await expect(product.finalPrice).toBeVisible({ timeout: 1500 });
  });

  test('FLK_A05 | Cart icon click timing — overlay may cover the button', async ({ page }) => {
    // FLAKY: login popup sometimes covers the cart icon
    const home = new FlipkartHomePage(page);
    await page.goto('/');
    // Intentionally NOT dismissing popup
    await home.cartIcon.click({ timeout: 3000 });
    await expect(page).toHaveURL(/viewcart|cart/i, { timeout: 3000 });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  GROUP B — RANDOM / NON-DETERMINISTIC ASSERTIONS
//  Root cause: logic tied to Math.random()
// ═════════════════════════════════════════════════════════════════════════════
test.describe('🎲 Flaky-B: Random Assertions', () => {

  test('FLK_B01 | Random coin-flip assertion — passes ~50% of the time', async ({ page }) => {
    // FLAKY by design: pure random
    const home = new FlipkartHomePage(page);
    await home.goto();
    const flip = Math.random() > 0.5;
    // This assertion will fail ~50% of runs
    expect(flip).toBeTruthy();
  });

  test('FLK_B02 | Assert result count equals random expected value', async ({ page }) => {
    // FLAKY: expected count generated randomly; real count almost never matches
    const home = new FlipkartHomePage(page);
    await home.goto();
    await home.search('laptop');
    const search = new FlipkartSearchPage(page);
    await page.waitForLoadState('domcontentloaded');
    const count    = await search.getResultCount();
    const expected = randomInt(1, 5);  // 1-5 — actual count is usually 20-40
    // Will pass only if Playwright happens to find exactly 1-5 items (rare)
    expect(count).toBe(expected);
  });

  test('FLK_B03 | Random delay before assertion — race against page render', async ({ page }) => {
    // FLAKY: random 0–5 s sleep before assertion; sometimes too early
    const home = new FlipkartHomePage(page);
    await home.goto();
    await home.search('samsung');
    await randomDelay(0, 5000);
    const search = new FlipkartSearchPage(page);
    const count = await search.getResultCount();
    expect(count).toBeGreaterThan(0);
  });

  test('FLK_B04 | Random price threshold assertion', async ({ page }) => {
    // FLAKY: threshold varies per run
    const home = new FlipkartHomePage(page);
    await home.goto();
    await home.search('laptop');
    const search = new FlipkartSearchPage(page);
    await page.waitForLoadState('domcontentloaded');
    const prices    = await search.getAllPrices();
    const threshold = randomInt(10000, 200000);
    // Asserts all prices are LESS than a random threshold — fails when threshold is low
    prices.slice(0, 3).forEach(p => expect(p).toBeLessThan(threshold));
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  GROUP C — NETWORK FLAKINESS
//  Root cause: relying on external services / CDN that may be slow or down
// ═════════════════════════════════════════════════════════════════════════════
test.describe('🌐 Flaky-C: Network Dependent', () => {

  test('FLK_C01 | FakeStore API responds in under 500ms (too tight)', async ({ request }) => {
    // FLAKY: 500ms SLA is unrealistic for external API
    const start = Date.now();
    const { status } = await getJson(request, 'https://fakestoreapi.com/products');
    const elapsed = Date.now() - start;
    expect(status).toBe(200);
    expect(elapsed).toBeLessThan(500);   // very tight — fails on slow network
  });

  test('FLK_C02 | DummyJSON API responds in under 300ms (too tight)', async ({ request }) => {
    // FLAKY: 300ms is essentially impossible for cold-start external API
    const start = Date.now();
    await getJson(request, 'https://dummyjson.com/products/1');
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(300);
  });

  test('FLK_C03 | Sequential API calls finish combined under 1 second', async ({ request }) => {
    // FLAKY: 2 sequential calls in under 1s is usually too optimistic
    const start = Date.now();
    await getJson(request, 'https://fakestoreapi.com/products/1');
    await getJson(request, 'https://fakestoreapi.com/products/2');
    expect(Date.now() - start).toBeLessThan(1000);
  });

  test('FLK_C04 | Flipkart page load always under 3 seconds (fragile on CDN lag)', async ({ page }) => {
    // FLAKY: CDN/geo variance can push load time over 3 s
    const start = Date.now();
    await page.goto('/', { waitUntil: 'load' });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(3000);
  });

  test('FLK_C05 | Image src loads with HTTP 200 (CDN may throttle)', async ({ request }) => {
    // FLAKY: CDN images can 403/429 when called programmatically
    const { body } = await getJson(request, 'https://fakestoreapi.com/products/1');
    const imgResponse = await request.get(body.image);
    expect(imgResponse.status()).toBe(200);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  GROUP D — ELEMENT ORDER / STRICT TEXT MATCHING
//  Root cause: live Flipkart data changes; product order is not stable
// ═════════════════════════════════════════════════════════════════════════════
test.describe('📋 Flaky-D: Order & Strict Text Match', () => {

  test('FLK_D01 | First product title matches hardcoded expected string', async ({ page }) => {
    // FLAKY: Flipkart personalises and rotates results — first title changes
    const home = new FlipkartHomePage(page);
    await home.goto();
    await home.search('laptop');
    const search = new FlipkartSearchPage(page);
    await page.waitForLoadState('domcontentloaded');
    const title = await search.getFirstProductTitle();
    // Hardcoded — almost certainly won't match
    expect(title?.trim()).toBe('ASUS VivoBook 15 Intel Core i3 12th Gen');
  });

  test('FLK_D02 | Exact product count assertion — 24 products per page', async ({ page }) => {
    // FLAKY: Flipkart can show ads, sponsored slots, varying counts
    const home = new FlipkartHomePage(page);
    await home.goto();
    await home.search('mobile');
    const search = new FlipkartSearchPage(page);
    await page.waitForLoadState('domcontentloaded');
    const count = await search.getResultCount();
    expect(count).toBe(24);   // exact — rarely true
  });

  test('FLK_D03 | API product list ID starts at 1 and is sequential', async ({ request }) => {
    // FLAKY: API may not guarantee insertion-order IDs
    const { body } = await getJson(request, 'https://fakestoreapi.com/products');
    const ids = body.map(p => p.id);
    for (let i = 0; i < ids.length; i++) {
      expect(ids[i]).toBe(i + 1);   // assumes 1,2,3,... with no gaps
    }
  });

  test('FLK_D04 | Sort Low-to-High prices are perfectly monotonic', async ({ page }) => {
    // FLAKY: sponsored/ad products break strict sort order
    const home = new FlipkartHomePage(page);
    await home.goto();
    await home.search('tv');
    const search = new FlipkartSearchPage(page);
    await search.sortBy('Price -- Low to High');
    const prices = await search.getAllPrices();
    for (let i = 1; i < prices.length; i++) {
      // Strictly non-decreasing — ads can violate this
      expect(prices[i]).toBeGreaterThanOrEqual(prices[i - 1]);
    }
  });

  test('FLK_D05 | Exact page title matches string (locale/AB test sensitive)', async ({ page }) => {
    // FLAKY: Flipkart A/B tests can change the title
    const home = new FlipkartHomePage(page);
    await home.goto();
    const title = await page.title();
    expect(title).toBe('Online Shopping Site for Mobiles, Electronics, Furniture, Grocery, Lifestyle & Books Best Offers! | Flipkart.com');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  GROUP E — POPUP / MODAL INTERFERENCE
//  Root cause: login modal appears non-deterministically and blocks elements
// ═════════════════════════════════════════════════════════════════════════════
test.describe('🪟 Flaky-E: Popup & Modal Interference', () => {

  test('FLK_E01 | Click login button without dismissing existing modal', async ({ page }) => {
    // FLAKY: modal appears ~60% of the time; clicking login button may open 2nd modal
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const home = new FlipkartHomePage(page);
    // Don't dismiss — just click login directly
    await home.loginButton.click({ timeout: 3000 });
    // Assert login modal visible — but if initial popup already took focus, this fails
    await expect(home.loginModal).toBeVisible({ timeout: 3000 });
  });

  test('FLK_E02 | Search immediately after load (popup may block search box)', async ({ page }) => {
    // FLAKY: login popup can overlay the search box
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    // Skip popup dismissal
    const home = new FlipkartHomePage(page);
    await home.searchBox.fill('headphones', { timeout: 2000 });
    await home.searchButton.click({ timeout: 2000 });
    await expect(page).toHaveURL(/headphones/i, { timeout: 4000 });
  });

  test('FLK_E03 | Page navigation during popup animation causes stale locators', async ({ page }) => {
    // FLAKY: navigating while popup is animating in/out causes stale element errors
    const home = new FlipkartHomePage(page);
    await home.goto();
    // Rapidly click logo during possible popup appearance
    await Promise.all([
      home.clickLogo(),
      page.waitForLoadState('domcontentloaded'),
    ]);
    await expect(home.searchBox).toBeVisible({ timeout: 2000 });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  GROUP F — RACE CONDITIONS
//  Root cause: parallel actions or page re-renders mid-action
// ═════════════════════════════════════════════════════════════════════════════
test.describe('🏁 Flaky-F: Race Conditions', () => {

  test('FLK_F01 | Parallel searches — last result is from "mobile" query', async ({ browser }) => {
    // FLAKY: both contexts race; last page navigation wins unpredictably
    const ctx = await browser.newContext();
    const page1 = await ctx.newPage();
    const page2 = await ctx.newPage();

    const home1 = new FlipkartHomePage(page1);
    const home2 = new FlipkartHomePage(page2);

    await Promise.all([home1.goto(), home2.goto()]);
    // Fire both searches simultaneously — race for autocomplete suggestions
    await Promise.all([
      home1.search('laptop'),
      home2.search('mobile'),
    ]);

    const url2 = page2.url();
    // May contain laptop instead of mobile if context bleeds
    expect(url2).toContain('mobile');
    await ctx.close();
  });

  test('FLK_F02 | Click while page is still loading — stale element', async ({ page }) => {
    // FLAKY: clicking search button before DOM is stable
    await page.goto('/', { waitUntil: 'commit' }); // earliest event
    const home = new FlipkartHomePage(page);
    // Fill and click immediately — DOM may not be interactive yet
    await home.searchBox.fill('tv', { timeout: 2000 });
    await home.searchButton.click({ timeout: 2000 });
    await expect(page).toHaveURL(/tv/i, { timeout: 3000 });
  });

  test('FLK_F03 | Assert product count before and after filter simultaneously', async ({ page }) => {
    // FLAKY: count check happens while network request for filter is still in-flight
    const home = new FlipkartHomePage(page);
    await home.goto();
    await home.search('laptop');
    const search = new FlipkartSearchPage(page);
    // Trigger filter but don't wait
    const filterPromise = search.filterByBrand('HP');
    // Assert count immediately — data is stale
    const countDuringLoad = await search.getResultCount();
    await filterPromise;
    expect(countDuringLoad).toBeGreaterThan(0); // passes
    // Now check it changed — may or may not differ depending on timing
    const countAfter = await search.getResultCount();
    expect(countAfter).toBeLessThan(countDuringLoad); // FLAKY
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  GROUP G — API RACE / INTERMITTENT STATUS FLAKINESS
//  Root cause: external mock APIs return inconsistent statuses
// ═════════════════════════════════════════════════════════════════════════════
test.describe('⚡ Flaky-G: API Intermittent Failures', () => {

  test('FLK_G01 | Concurrent API calls all return 200 (rate limit risk)', async ({ request }) => {
    // FLAKY: 10 concurrent requests may trigger rate limiting
    const urls = Array.from({ length: 10 }, (_, i) =>
      `https://fakestoreapi.com/products/${i + 1}`
    );
    const results = await Promise.all(urls.map(url => getJson(request, url)));
    results.forEach(({ status }) => expect(status).toBe(200));
  });

  test('FLK_G02 | POST then immediate GET returns created resource (eventual consistency)', async ({ request }) => {
    // FLAKY: mock API may not persist POST data for immediate GET
    const { body: created } = await postJson(request, 'https://fakestoreapi.com/products', {
      title: 'Race Test Product',
      price: 999,
      category: 'electronics',
      image: 'https://fakestoreapi.com/img/71li-ujtlUL._AC_UX679_.jpg',
    });
    // GET the newly created ID immediately — may not exist in fake API
    const { status, body: fetched } = await getJson(
      request, `https://fakestoreapi.com/products/${created.id}`
    );
    expect(status).toBe(200);
    expect(fetched.id).toBe(created.id);   // FLAKY — fake APIs don't persist POST
  });

  test('FLK_G03 | Retry loop — asserts API responds on first attempt (no retry)', async ({ request }) => {
    // FLAKY: deliberately only 1 attempt with 100ms timeout; external API often slow
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 100); // 100ms = almost always too fast
    let status = -1;
    try {
      const response = await request.get('https://dummyjson.com/products', {
        timeout: 100,    // Playwright timeout in ms — usually insufficient
      });
      status = response.status();
    } catch {
      // timeout — expected to catch here most of the time
      status = -1;
    } finally {
      clearTimeout(timeoutId);
    }
    expect(status).toBe(200);   // FLAKY — times out ~80% of the time
  });

  test('FLK_G04 | Assert same product price on two separate API calls (caching race)', async ({ request }) => {
    // FLAKY: two rapid calls may hit different cache shards returning slightly different data
    const { body: first }  = await getJson(request, 'https://fakestoreapi.com/products/1');
    await sleep(randomInt(0, 200));  // tiny random gap
    const { body: second } = await getJson(request, 'https://fakestoreapi.com/products/1');
    expect(first.price).toBe(second.price);  // should be stable but can differ if mocked
    expect(first.title).toStrictEqual(second.title);
  });
});
