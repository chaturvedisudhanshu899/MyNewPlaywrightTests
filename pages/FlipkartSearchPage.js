/**
 * FlipkartSearchPage.js — Page Object for search results page
 */
class FlipkartSearchPage {
  /**
   * @param {import('@playwright/test').Page} page
   */
  constructor(page) {
    this.page = page;

    // ── Results ──────────────────────────────────────────────────────
    this.resultItems     = page.locator('div[data-id], div._1AtVbE div._13oc-S');
    this.productTitles   = page.locator('div._4rR01T, a.s1Q9rs, a._2rpwqI');
    this.productPrices   = page.locator('div._30jeq3._1_WHN1, div._30jeq3');
    this.productRatings  = page.locator('div._3LWZlK');
    this.noResults       = page.locator('div._3kkiJh, p:has-text("No results"), img[alt*="result"]');

    // ── Filters ──────────────────────────────────────────────────────
    this.filterSection   = page.locator('div._1bvKBh, div._2A_Tye');
    this.sortDropdown    = page.locator('div._1l_oM0 span, div[class*="sort"] span').first();
    this.filterLabels    = page.locator('div._2A_Tye label, div._2A_Tye li');
    this.brandFilters    = page.locator('div._2A_Tye:has(div:has-text("Brand")) label');
    this.priceRangeMin   = page.locator('input[placeholder="Min"]');
    this.priceRangeMax   = page.locator('input[placeholder="Max"]');
    this.priceGoBtn      = page.locator('button._22C2TU');

    // ── Sort options ─────────────────────────────────────────────────
    this.sortOptions     = page.locator('div._2iQFn li, div._15ZFfz li');

    // ── Pagination ───────────────────────────────────────────────────
    this.nextPageBtn     = page.locator('a._1LKTO3:has-text("Next"), nav._33jlOe a:last-child');
    this.pagination      = page.locator('div._2MImiq, nav._33jlOe');

    // ── Sponsored ────────────────────────────────────────────────────
    this.sponsoredLabel  = page.locator('span._2p6azh:has-text("Ad")');
  }

  // ── Actions ─────────────────────────────────────────────────────────

  /**
   * Returns count of visible result cards
   */
  async getResultCount() {
    return this.resultItems.count();
  }

  /**
   * Returns the text of the first product title
   */
  async getFirstProductTitle() {
    return this.productTitles.first().textContent();
  }

  /**
   * Returns the text of the first product price
   */
  async getFirstProductPrice() {
    const text = await this.productPrices.first().textContent();
    return text?.replace(/[^\d]/g, '');  // strip ₹ and commas, return numeric string
  }

  /**
   * Clicks a sort option by visible text
   * @param {'Relevance'|'Price -- Low to High'|'Price -- High to Low'|'Rating'|'Newest First'} option
   */
  async sortBy(option) {
    await this.sortDropdown.click();
    await this.page.locator(`li:has-text("${option}")`).first().click();
    await this.page.waitForLoadState('domcontentloaded');
  }

  /**
   * Clicks the first product in results
   */
  async clickFirstProduct() {
    await this.productTitles.first().click();
    await this.page.waitForLoadState('domcontentloaded');
  }

  /**
   * Applies a price range filter
   */
  async applyPriceRange(min, max) {
    await this.priceRangeMin.fill(String(min));
    await this.priceRangeMax.fill(String(max));
    await this.priceGoBtn.click();
    await this.page.waitForLoadState('domcontentloaded');
  }

  /**
   * Navigates to next page
   */
  async goToNextPage() {
    await this.nextPageBtn.click();
    await this.page.waitForLoadState('domcontentloaded');
  }

  /**
   * Gets all product prices as numbers
   */
  async getAllPrices() {
    const texts = await this.productPrices.allTextContents();
    return texts.map(t => parseInt(t.replace(/[^\d]/g, ''), 10)).filter(n => !isNaN(n));
  }

  /**
   * Clicks a brand filter by name
   */
  async filterByBrand(brandName) {
    const brand = this.page.locator(`label:has-text("${brandName}")`).first();
    await brand.click();
    await this.page.waitForLoadState('domcontentloaded');
  }

  async isNoResultsVisible() {
    return this.noResults.isVisible({ timeout: 5000 }).catch(() => false);
  }
}

module.exports = { FlipkartSearchPage };
