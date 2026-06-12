/**
 * Selector / XPath healing rules (pages + helpers + flaky spec)
 */
const PAGE_HEALING_RULES = [
  {
    id: 'HASH_CLASS_LOGO',
    pattern:  /a\._1PLKL7,\s*img\[alt="Flipkart"\]/g,
    replacement: `img[alt="Flipkart"], [aria-label*="Flipkart"]`,
    reason: 'Webpack hash class changes each deploy — use alt text.',
  },
  {
    id: 'HASH_CLASS_CLOSE_BTN',
    pattern:  /button\._2KpZ6l\._2doB4z/g,
    replacement: `button[aria-label*="Close"], button:has-text("✕")`,
    reason: 'Close button hash class — use aria-label or text.',
  },
  {
    id: 'HASH_CLASS_LOGIN_BTN',
    pattern:  /a:has-text\("Login"\),\s*a\._1H9Ais/g,
    replacement: `getByRole('link', { name: 'Login' })`,
    reason: 'Login link — role-based locator (wrap in page.).',
  },
  {
    id: 'HASH_CLASS_LOGIN_MODAL',
    pattern:  /\._2ix_2-,\s*form\.K0hhCe/g,
    replacement: `[role="dialog"]`,
    reason: 'Login modal — semantic dialog role.',
  },
  {
    id: 'HASH_CLASS_SEARCH_BTN',
    pattern:  /button\[type="submit"\],\s*button\._2iLD__/g,
    replacement: `getByRole('button', { name: /search/i })`,
    reason: 'Search button — role + name.',
  },
  {
    id: 'HASH_CLASS_PRICE',
    pattern:  /div\._30jeq3\._1_WHN1,\s*div\._30jeq3/g,
    replacement: `[class*="price"]:not([class*="strike"])`,
    reason: 'Price div hash — partial class match.',
  },
  {
    id: 'HASH_CLASS_PRODUCT_TITLE',
    pattern:  /div\._4rR01T,\s*a\.s1Q9rs,\s*a\._2rpwqI/g,
    replacement: `a[title]`,
    reason: 'Product titles use title attribute.',
  },
  {
    id: 'HASH_CLASS_RESULT_ITEMS',
    pattern:  /div\[data-id\],\s*div\._1AtVbE div\._13oc-S/g,
    replacement: `[data-id]`,
    reason: 'data-id is stable on Flipkart product cards.',
  },
  {
    id: 'LOGIN_SUBMIT_HASH',
    pattern:  /button\._2AkmmA\._1LctnI,\s*button:has-text\("Login"\)/g,
    replacement: `button:has-text("Login")`,
    reason: 'Remove hash class from login submit.',
  },
];

const TIMING_HEALING_RULES = [
  { id: 'TIMEOUT_500',  pattern: /timeout:\s*500\b/g,  replacement: 'timeout: 10000', reason: '500ms too tight for network.' },
  { id: 'TIMEOUT_300',  pattern: /timeout:\s*300\b/g,  replacement: 'timeout: 10000', reason: '300ms too tight.' },
  { id: 'TIMEOUT_1500', pattern: /timeout:\s*1500\b/g, replacement: 'timeout: 15000', reason: '1.5s insufficient for Flipkart.' },
  { id: 'TIMEOUT_2000', pattern: /timeout:\s*2000\b/g, replacement: 'timeout: 15000', reason: '2s insufficient for search results.' },
  { id: 'TIMEOUT_3000', pattern: /timeout:\s*3000\b/g, replacement: 'timeout: 15000', reason: '3s often fails on slow CDN.' },
  { id: 'TIMEOUT_4000', pattern: /timeout:\s*4000\b/g, replacement: 'timeout: 15000', reason: '4s URL wait often insufficient.' },
  { id: 'WAIT_COMMIT',  pattern: /waitUntil:\s*['"]commit['"]/g, replacement: `waitUntil: 'domcontentloaded'`, reason: 'commit fires too early.' },
];

const ASSERTION_HEALING_RULES = [
  {
    id: 'HARDCODED_TITLE',
    pattern:  /expect\(title\?\.trim\(\)\)\.toBe\(['"][^'"]{10,}['"]\)/g,
    replacement: `expect(title?.trim().toLowerCase()).toMatch(/laptop|mobile|phone|asus|samsung/i)`,
    reason: 'Exact title changes with personalization.',
  },
  {
    id: 'EXACT_COUNT_24',
    pattern:  /expect\(count\)\.toBe\(24\)/g,
    replacement: `expect(count).toBeGreaterThan(0)`,
    reason: 'Product count varies per page.',
  },
  {
    id: 'RANDOM_COINFLIP',
    pattern:  /const flip = Math\.random\(\) > 0\.5;\s*\n\s*\/\/ This assertion will fail ~50% of runs\s*\n\s*expect\(flip\)\.toBeTruthy\(\)/g,
    replacement: `// HEALED: removed non-deterministic coin-flip\n    expect(true).toBeTruthy()`,
    reason: 'Math.random() assertion is non-deterministic.',
  },
  {
    id: 'RANDOM_COUNT',
    pattern:  /const expected = randomInt\(1, 5\);\s*\/\/ 1-5 — actual count is usually 20-40\s*\n\s*\/\/ Will pass only if Playwright happens to find exactly 1-5 items \(rare\)\s*\n\s*expect\(count\)\.toBe\(expected\)/g,
    replacement: `// HEALED: flexible count assertion\n    expect(count).toBeGreaterThan(0)`,
    reason: 'Random expected count never matches real results.',
  },
  {
    id: 'SLA_500',
    pattern:  /expect\(elapsed\)\.toBeLessThan\(500\)/g,
    replacement: `expect(elapsed).toBeLessThan(5000)`,
    reason: '500ms SLA unrealistic for external APIs.',
  },
  {
    id: 'SLA_300',
    pattern:  /expect\(elapsed\)\.toBeLessThan\(300\)/g,
    replacement: `expect(elapsed).toBeLessThan(5000)`,
    reason: '300ms SLA unrealistic.',
  },
  {
    id: 'SLA_1000',
    pattern:  /expect\(Date\.now\(\) - start\)\.toBeLessThan\(1000\)/g,
    replacement: `expect(Date.now() - start).toBeLessThan(5000)`,
    reason: '1s for sequential API calls is too tight.',
  },
  {
    id: 'SLA_3000_LOAD',
    pattern:  /expect\(elapsed\)\.toBeLessThan\(3000\)/g,
    replacement: `expect(elapsed).toBeLessThan(15000)`,
    reason: '3s page load SLA fragile on CDN.',
  },
  {
    id: 'API_TIMEOUT_100',
    pattern:  /timeout:\s*100,\s*\/\/ Playwright timeout in ms — usually insufficient/g,
    replacement: `timeout: 10000, // HEALED: was 100ms`,
    reason: '100ms request timeout almost always fails.',
  },
  {
    id: 'EXACT_PAGE_TITLE',
    pattern:  /expect\(title\)\.toBe\('Online Shopping Site[^']+'\)/g,
    replacement: `expect(title).toMatch(/Flipkart/i)`,
    reason: 'Exact page title changes with A/B tests.',
  },
];

const ALL_HEALING_RULES = [
  ...PAGE_HEALING_RULES,
  ...TIMING_HEALING_RULES,
  ...ASSERTION_HEALING_RULES,
];

function applyRulesToCode(code, rules = ALL_HEALING_RULES) {
  let healed = code;
  const appliedFixes = [];

  for (const rule of rules) {
    const before = healed;
    healed = healed.replace(rule.pattern, rule.replacement);
    if (healed !== before) {
      appliedFixes.push({ ruleId: rule.id, reason: rule.reason });
    }
  }

  return { healed, appliedFixes };
}

function scanCode(code, rules = ALL_HEALING_RULES) {
  const issues = [];
  for (const rule of rules) {
    const re = new RegExp(rule.pattern.source, rule.pattern.flags.includes('g') ? rule.pattern.flags : rule.pattern.flags + 'g');
    let match;
    while ((match = re.exec(code)) !== null) {
      const lineNum = code.slice(0, match.index).split('\n').length;
      issues.push({
        ruleId: rule.id,
        line: lineNum,
        matched: match[0].slice(0, 80),
        reason: rule.reason,
      });
    }
  }
  return issues;
}

module.exports = {
  PAGE_HEALING_RULES,
  TIMING_HEALING_RULES,
  ASSERTION_HEALING_RULES,
  ALL_HEALING_RULES,
  applyRulesToCode,
  scanCode,
};
