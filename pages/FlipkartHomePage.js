/**
 * FlipkartHomePage.js — Page Object for Flipkart's home page
 */
const { dismissLoginPopup } = require('../utils/helpers');

class FlipkartHomePage {
  /**
   * @param {import('@playwright/test').Page} page
   */
  constructor(page) {
    this.page = page;

    // ── Navigation / Header ──────────────────────────────────────────
    this.searchBox       = page.locator('input[name="q"], input[title="Search for products, brands and more"]').first();
    this.searchButton    = page.locator('button[type="submit"], button._2iLD__').first();
    this.loginButton     = page.locator('a:has-text("Login"), a._1H9Ais').first();
    this.cartIcon        = page.locator('a[href="/viewcart"]').first();
    this.logo            = page.locator('a._1PLKL7, img[alt="Flipkart"]').first();

    // ── Login Modal ──────────────────────────────────────────────────
    this.loginModal      = page.locator('._2ix_2-, form.K0hhCe').first();
    this.mobileInput     = page.locator('input[type="text"][autocomplete="off"]').first();
    this.passwordInput   = page.locator('input[type="password"]').first();
    this.loginSubmit     = page.locator('button._2AkmmA._1LctnI, button:has-text("Login")').first();
    this.loginCloseBtn   = page.locator('button._2KpZ6l._2doB4z').first();

    // ── Home page sections ───────────────────────────────────────────
    this.categoryNav     = page.locator('nav._1lBxea, div._75nlfW a').first();
    this.bannerCarousel  = page.locator('div._2z1Blf, div.YQfGMb').first();
    this.dealOfDay       = page.locator('div._2WuHcK, section:has-text("Deal of the Day")').first();
  }

  // ── Actions ─────────────────────────────────────────────────────────

  async goto() {
    await this.page.goto('/', { waitUntil: 'domcontentloaded' });
    await dismissLoginPopup(this.page);
  }

  async search(keyword) {
    await this.searchBox.fill('');
    await this.searchBox.fill(keyword);
    await this.searchButton.click();
    await this.page.waitForLoadState('domcontentloaded');
  }

  async searchAndPressEnter(keyword) {
    await this.searchBox.fill(keyword);
    await this.searchBox.press('Enter');
    await this.page.waitForLoadState('domcontentloaded');
  }

  async clickLogo() {
    await this.logo.click();
    await this.page.waitForLoadState('domcontentloaded');
  }

  async clickLogin() {
    await this.loginButton.click();
  }

  async dismissPopup() {
    await dismissLoginPopup(this.page);
  }

  async getTitle() {
    return this.page.title();
  }

  async getUrl() {
    return this.page.url();
  }
}

module.exports = { FlipkartHomePage };
