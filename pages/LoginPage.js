class LoginPage {
  /**
   * @param {import('@playwright/test').Page} page
   */
  constructor(page) {
    this.page = page;
    this.searchIcon = page.locator('.DocSearch-Button');
    this.searchInput = page.locator('.DocSearch-Input');
  }

  async goto() {
    await this.page.goto('https://playwright.dev/');
  }

  async search(term) {
    await this.searchIcon.click();
    await this.searchInput.fill(term);
  }
}

module.exports = { LoginPage };
