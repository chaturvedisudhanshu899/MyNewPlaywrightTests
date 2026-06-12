/**
 * MCP-style browser healer — uses the same concepts as Playwright MCP tools:
 *   browser_snapshot  → page.ariaSnapshot()
 *   browser_generate_locator → probe live DOM + suggest stable locators
 *   test_debug        → re-run failing grep with trace on failure
 *
 * Runs headless Playwright directly (no MCP client required for CLI use).
 * Cursor agents can use the playwright-test MCP server for interactive healing.
 */
const fs   = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { ROOT, ensureDir, log } = require('./shared');
const { dismissLoginPopup } = require('../../utils/helpers');

const REPORTS_DIR = path.join(__dirname, '..', 'reports');
const BASE_URL = 'https://www.flipkart.com';

/**
 * Semantic element probes — MCP ref-style intents mapped to resilient locators.
 * Each probe is verified on a live page (like browser_generate_locator).
 */
const MCP_ELEMENT_PROBES = [
  {
    id: 'searchBox',
    file: 'pages/FlipkartHomePage.js',
    property: 'searchBox',
    mcpIntent: 'Search input for products',
    suggest: (page) => page.getByPlaceholder(/search for products/i).first(),
    locatorExpr: `page.getByPlaceholder(/search for products, brands and more/i).first()`,
  },
  {
    id: 'searchButton',
    file: 'pages/FlipkartHomePage.js',
    property: 'searchButton',
    mcpIntent: 'Search submit button',
    suggest: (page) => page.getByRole('button', { name: /search/i }).first(),
    locatorExpr: `page.getByRole('button', { name: /search/i }).first()`,
  },
  {
    id: 'loginButton',
    file: 'pages/FlipkartHomePage.js',
    property: 'loginButton',
    mcpIntent: 'Login link in header',
    suggest: (page) => page.getByRole('link', { name: 'Login' }).first(),
    locatorExpr: `page.getByRole('link', { name: 'Login' }).first()`,
  },
  {
    id: 'cartIcon',
    file: 'pages/FlipkartHomePage.js',
    property: 'cartIcon',
    mcpIntent: 'Shopping cart link',
    suggest: (page) => page.getByRole('link', { name: /cart/i }).first(),
    locatorExpr: `page.getByRole('link', { name: /cart/i }).first()`,
  },
  {
    id: 'logo',
    file: 'pages/FlipkartHomePage.js',
    property: 'logo',
    mcpIntent: 'Flipkart logo',
    suggest: (page) => page.locator('img[alt="Flipkart"]').first(),
    locatorExpr: `page.locator('img[alt="Flipkart"]').first()`,
  },
  {
    id: 'loginCloseBtn',
    file: 'pages/FlipkartHomePage.js',
    property: 'loginCloseBtn',
    mcpIntent: 'Close login modal',
    suggest: (page) => page.getByRole('button', { name: /close|×|✕/i }).first(),
    locatorExpr: `page.getByRole('button', { name: /close|×|✕/i }).first()`,
  },
  {
    id: 'closePopup',
    file: 'utils/helpers.js',
    property: null,
    inlinePattern: /page\.locator\(['"`]button\._2KpZ6l\._2doB4z['"`]\)/,
    mcpIntent: 'Dismiss login popup close button',
    suggest: (page) => page.getByRole('button', { name: /close|×|✕/i }).first(),
    locatorExpr: `page.getByRole('button', { name: /close|×|✕/i })`,
  },
  {
    id: 'resultItems',
    file: 'pages/FlipkartSearchPage.js',
    property: 'resultItems',
    mcpIntent: 'Product cards on search results',
    needsSearch: true,
    suggest: (page) => page.locator('[data-id]').first(),
    locatorExpr: `page.locator('[data-id]').first()`,
  },
];

function extractPropertyLocator(source, property) {
  const re = new RegExp(`this\\.${property}\\s*=\\s*page\\.locator\\(([^)]+(?:\\([^)]*\\)[^)]*)*)\\)`, 's');
  const m = source.match(re);
  if (!m) return null;
  return m[1].trim();
}

function extractInlineLocator(source, pattern) {
  const m = source.match(pattern);
  return m ? m[0] : null;
}

/**
 * browser_snapshot equivalent — ARIA tree for MCP-style context.
 */
async function captureMcpSnapshot(page) {
  return page.ariaSnapshot({ mode: 'ai' });
}

/**
 * Verify a locator on live page; return MCP-style probe result.
 */
async function probeElement(page, probe, timeout = 8000) {
  const locator = probe.suggest(page);
  let visible = false;
  let count = 0;
  let error = '';

  try {
    count = await locator.count();
    visible = count > 0 && await locator.first().isVisible({ timeout }).catch(() => false);
  } catch (err) {
    error = err.message;
  }

  return {
    id: probe.id,
    mcpIntent: probe.mcpIntent,
    suggestedLocator: probe.locatorExpr,
    elementCount: count,
    visible,
    healthy: visible && count > 0,
    error: error.slice(0, 200),
  };
}

/**
 * Apply MCP-suggested locator to a page object property or inline pattern.
 */
function hasBrittleSelector(locatorStr) {
  if (!locatorStr) return false;
  return /_\w{4,8}[,\s'"]|page\.locator\(['"`][^'"`]*\._/.test(locatorStr);
}

function applyMcpSuggestion(filePath, probe, dryRun) {
  if (!fs.existsSync(filePath)) return { applied: false, reason: 'file missing' };

  let source = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  if (probe.property) {
    const re = new RegExp(`(this\\.${probe.property}\\s*=\\s*)[^;]+;`);
    const replacement = `$1${probe.locatorExpr};`;
    const next = source.replace(re, replacement);
    if (next !== source) {
      source = next;
      changed = true;
    }
  } else if (probe.inlinePattern) {
    const next = source.replace(probe.inlinePattern, probe.locatorExpr);
    if (next !== source) {
      source = next;
      changed = true;
    }
  }

  if (changed && !dryRun) {
    const backup = filePath + '.bak';
    if (!fs.existsSync(backup)) {
      fs.writeFileSync(backup, fs.readFileSync(filePath, 'utf8'));
    }
    fs.writeFileSync(filePath, source);
  }

  return { applied: changed, file: path.relative(ROOT, filePath) };
}

/**
 * Full MCP heal pass: snapshot → probe → optionally patch sources.
 * @param {{ dryRun?: boolean, apply?: boolean, headed?: boolean }} opts
 */
async function runMcpHeal(opts = {}) {
  const dryRun = opts.dryRun ?? false;
  const apply  = opts.apply !== false;
  const headed = opts.headed ?? false;

  ensureDir(REPORTS_DIR);
  log('MCP heal: launching browser (browser_snapshot + browser_generate_locator)…', 'AI');

  const browser = await chromium.launch({ headless: !headed, channel: 'chrome' }).catch(() =>
    chromium.launch({ headless: !headed })
  );

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    extraHTTPHeaders: { 'Accept-Language': 'en-IN,en;q=0.9' },
  });
  const page = await context.newPage();

  const report = {
    generatedAt: new Date().toISOString(),
    mcpToolsUsed: ['browser_navigate', 'browser_snapshot', 'browser_generate_locator'],
    baseUrl: BASE_URL,
    probes: [],
    snapshots: {},
    patches: [],
  };

  try {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await dismissLoginPopup(page);

    report.snapshots.home = await captureMcpSnapshot(page);
    fs.writeFileSync(
      path.join(REPORTS_DIR, 'mcp-snapshot-home.yaml'),
      report.snapshots.home,
    );

    for (const probe of MCP_ELEMENT_PROBES.filter(p => !p.needsSearch)) {
      const result = await probeElement(page, probe);
      const filePath = path.join(ROOT, probe.file);
      const source = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
      const current = probe.property
        ? extractPropertyLocator(source, probe.property)
        : extractInlineLocator(source, probe.inlinePattern);

      report.probes.push({
        ...result,
        file: probe.file,
        currentLocator: current,
        needsHeal: current && !result.healthy,
      });

      if (apply && result.healthy && (hasBrittleSelector(current) || !result.healthy)) {
        const patch = applyMcpSuggestion(filePath, probe, dryRun);
        if (patch.applied) {
          report.patches.push({ id: probe.id, ...patch, suggested: probe.locatorExpr });
          log(`MCP patch ${probe.id} → ${probe.locatorExpr}`, 'HEAL');
        }
      }
    }

    // Search results page snapshot (for resultItems probe)
    const searchProbe = MCP_ELEMENT_PROBES.find(p => p.needsSearch);
    if (searchProbe) {
      const searchBox = page.getByPlaceholder(/search for products/i).first();
      if (await searchBox.isVisible({ timeout: 5000 }).catch(() => false)) {
        await searchBox.fill('laptop');
        await searchBox.press('Enter');
        await page.waitForLoadState('domcontentloaded');
        await dismissLoginPopup(page);

        report.snapshots.search = await captureMcpSnapshot(page);
        fs.writeFileSync(
          path.join(REPORTS_DIR, 'mcp-snapshot-search.yaml'),
          report.snapshots.search,
        );

        const result = await probeElement(page, searchProbe);
        const filePath = path.join(ROOT, searchProbe.file);
        const source = fs.readFileSync(filePath, 'utf8');
        const current = extractPropertyLocator(source, searchProbe.property);

        report.probes.push({
          ...result,
          file: searchProbe.file,
          currentLocator: current,
          needsHeal: current && !result.healthy,
        });

        if (apply && result.healthy && current) {
          const patch = applyMcpSuggestion(filePath, searchProbe, dryRun);
          if (patch.applied) {
            report.patches.push({ id: searchProbe.id, ...patch, suggested: searchProbe.locatorExpr });
          }
        }
      }
    }
  } finally {
    await browser.close();
  }

  report.summary = {
    probesRun: report.probes.length,
    healthy: report.probes.filter(p => p.healthy).length,
    patchesApplied: report.patches.length,
    dryRun,
  };

  fs.writeFileSync(
    path.join(REPORTS_DIR, 'mcp-heal-report.json'),
    JSON.stringify(report, null, 2),
  );

  log(
    `MCP heal done: ${report.summary.healthy}/${report.summary.probesRun} probes healthy, ${report.summary.patchesApplied} patch(es)${dryRun ? ' (dry-run)' : ''}`,
    'SUCCESS',
  );

  return report;
}

module.exports = {
  MCP_ELEMENT_PROBES,
  runMcpHeal,
  captureMcpSnapshot,
  probeElement,
};
