/**
 * FlipkartProductPage.js — Page Object for the product detail page (PDP)
 */
class FlipkartProductPage {
  /**
   * @param {import('@playwright/test').Page} page
   */
  constructor(page) {
    this.page = page;

    // ── Product Details ──────────────────────────────────────────────
    this.productTitle      = page.locator('span.B_NuCI, h1._35KyD6').first();
    this.finalPrice        = page.locator('div._30jeq3._16Jk6d').first();
    this.originalPrice     = page.locator('div._3I9_wc._2p6azh').first();
    this.discountLabel     = page.locator('div._3Ay6Sb span').first();
    this.rating            = page.locator('div._3LWZlK').first();
    this.ratingCount       = page.locator('span._13vcmD').first();
    this.sellerName        = page.locator('div._3pfkQA').first();

    // ── Images ───────────────────────────────────────────────────────
    this.mainImage         = page.locator('img._396cs4._2amPTt._3qGmMb, div._3btXLz img').first();
    this.thumbnails        = page.locator('li._3nMexc img, ul._3k3e6F li img');

    // ── Buttons ──────────────────────────────────────────────────────
    this.addToCartBtn      = page.locator('button._2KpZ6l:has-text("Add to Cart"), button._2KpZ6l.hGSR34').first();
    this.buyNowBtn         = page.locator('button._2KpZ6l._2U9uOA:has-text("Buy Now"), button._2KpZ6l').first();
    this.wishlistBtn       = page.locator('button._1e6xmD, button:has-text("Wishlist")').first();

    // ── Specifications ───────────────────────────────────────────────
    this.specTable         = page.locator('div._3k-BhJ, table._14cfVK');
    this.specRows          = page.locator('tr._1s_Smc, div._3k-BhJ div._3-wDH8');

    // ── Reviews ──────────────────────────────────────────────────────
    this.reviewSection     = page.locator('section._4nfCF4, div._16PBlm');
    this.reviewCards       = page.locator('div.t-ZTKy, div._2sc7ZR');
    this.reviewRating      = page.locator('div._3LWZlK._32lA32');
    this.reviewText        = page.locator('div.t-ZTKy p, div._6K-7Co');

    // ── Availability ─────────────────────────────────────────────────
    this.outOfStock        = page.locator('div._16FRp0:has-text("Out of Stock"), div:has-text("Currently unavailable")');

    // ── Pincode check ────────────────────────────────────────────────
    this.pincodeInput      = page.locator('input._3XPlc3, input[placeholder*="pincode"]').first();
    this.pincodeCheckBtn   = page.locator('button._3EHmxo, button:has-text("Check")').first();
    this.deliveryInfo      = page.locator('div._2Tpdn3, div._396QI4').first();
  }

  // ── Actions ─────────────────────────────────────────────────────────

  async getTitle() {
    return this.productTitle.textContent();
  }

  async getPrice() {
    const text = await this.finalPrice.textContent();
    return parseInt(text.replace(/[^\d]/g, ''), 10);
  }

  async addToCart() {
    await this.addToCartBtn.click();
    await this.page.waitForLoadState('domcontentloaded');
  }

  async checkPincode(pincode) {
    await this.pincodeInput.fill(pincode);
    await this.pincodeCheckBtn.click();
    await this.page.waitForTimeout(2000);
  }

  async isOutOfStock() {
    return this.outOfStock.isVisible({ timeout: 3000 }).catch(() => false);
  }

  async clickThumbnail(index) {
    await this.thumbnails.nth(index).click();
    await this.page.waitForTimeout(500);
  }

  async getReviewCount() {
    return this.reviewCards.count();
  }

  async isAddToCartEnabled() {
    const btn = this.addToCartBtn;
    const disabled = await btn.getAttribute('disabled');
    return disabled === null;
  }
}

module.exports = { FlipkartProductPage };
