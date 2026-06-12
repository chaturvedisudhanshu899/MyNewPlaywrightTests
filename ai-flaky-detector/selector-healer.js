/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║         XPATH / SELECTOR HEALER — Static Analysis + Auto-Fix            ║
 * ║  Scans JS test files for brittle selectors and rewrites them             ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Usage:
 *   node ai-flaky-detector/selector-healer.js [--dry-run] [--file=<path>]
 */

const fs   = require('fs');
const path = require('path');

const ROOT    = path.join(__dirname, '..');
const REPORTS = path.join(__dirname, 'reports');

// ─────────────────────────────────────────────────────────────────────────────
// HEALING RULE DEFINITIONS
// Each rule has: pattern (regex), replacement (string or fn), reason, severity
// ─────────────────────────────────────────────────────────────────────────────
const HEALING_RULES = [

  // ── Flipkart-specific webpack hash classes ─────────────────────────────
  {
    id:       'HASH_CLASS_LOGO',
    pattern:  /page\.locator\(['"`]a\._1PLKL7[^'"`]*['"`]\)/g,
    replacement: `page.locator('img[alt="Flipkart"], [aria-label*="Flipkart"]')`,
    reason:   'Webpack hash `_1PLKL7` changes on each build. Use alt text.',
    severity: 'critical',
    category: 'FLIPKART_HASH',
  },
  {
    id:       'HASH_CLASS_CLOSE_BTN',
    pattern:  /page\.locator\(['"`]button\._2KpZ6l\._2doB4z['"`]\)/g,
    replacement: `page.getByRole('button', { name: /close|×|✕/i })`,
    reason:   'Hash class on close button. Use role + accessible name.',
    severity: 'critical',
    category: 'FLIPKART_HASH',
  },
  {
    id:       'HASH_CLASS_LOGIN_BTN',
    pattern:  /a\._1H9Ais/g,
    replacement: '[data-id="login-button"]',
    reason:   'Hash class on login anchor. Target data-id or role.',
    severity: 'high',
    category: 'FLIPKART_HASH',
  },
  {
    id:       'HASH_CLASS_LOGIN_MODAL',
    pattern:  /\._2ix_2-,\s*form\.K0hhCe/g,
    replacement: '[role="dialog"], form[action*="login"]',
    reason:   'Modal identified by hash class. Role=dialog is semantic.',
    severity: 'high',
    category: 'FLIPKART_HASH',
  },
  {
    id:       'HASH_CLASS_PRICE',
    pattern:  /div\._30jeq3\._1_WHN1,\s*div\._30jeq3/g,
    replacement: '[class*="price"]:not([class*="strike"])',
    reason:   'Price div uses hash class. Partial match is resilient.',
    severity: 'high',
    category: 'FLIPKART_HASH',
  },
  {
    id:       'HASH_CLASS_PRODUCT_TITLE',
    pattern:  /div\._4rR01T,\s*a\.s1Q9rs,\s*a\._2rpwqI/g,
    replacement: 'a[title]',
    reason:   'Product titles have a `title` attribute — stable selector.',
    severity: 'high',
    category: 'FLIPKART_HASH',
  },
  {
    id:       'HASH_CLASS_RESULT_ITEMS',
    pattern:  /div\[data-id\],\s*div\._1AtVbE\s+div\._13oc-S/g,
    replacement: '[data-id]',
    reason:   '`data-id` is stable; drop the fallback hash selector.',
    severity: 'medium',
    category: 'FLIPKART_HASH',
  },
  {
    id:       'HASH_CLASS_SUBMIT',
    pattern:  /button\[type="submit"\],\s*button\._2iLD__/g,
    replacement: 'button[type="submit"]',
    reason:   'Button type is sufficient; remove the hash fallback.',
    severity: 'medium',
    category: 'FLIPKART_HASH',
  },

  // ── Tight timeouts ─────────────────────────────────────────────────────
  {
    id:       'TIMEOUT_500',
    pattern:  /timeout:\s*500\b/g,
    replacement: 'timeout: 10000',
    reason:   '500ms timeout causes network flakiness. 10s is safer.',
    severity: 'high',
    category: 'TIMING',
  },
  {
    id:       'TIMEOUT_300',
    pattern:  /timeout:\s*300\b/g,
    replacement: 'timeout: 10000',
    reason:   '300ms is too short for any external call.',
    severity: 'high',
    category: 'TIMING',
  },
  {
    id:       'TIMEOUT_1000',
    pattern:  /timeout:\s*1000\b/g,
    replacement: 'timeout: 10000',
    reason:   '1s timeout often fails on CDN pages. Use 10s.',
    severity: 'medium',
    category: 'TIMING',
  },
  {
    id:       'TIMEOUT_1500',
    pattern:  /timeout:\s*1500\b/g,
    replacement: 'timeout: 10000',
    reason:   '1.5s timeout too tight for dynamic rendering.',
    severity: 'medium',
    category: 'TIMING',
  },
  {
    id:       'TIMEOUT_2000',
    pattern:  /timeout:\s*2000\b/g,
    replacement: 'timeout: 15000',
    reason:   '2s commonly fails on slow connections. 15s is reliable.',
    severity: 'medium',
    category: 'TIMING',
  },
  {
    id:       'TIMEOUT_3000',
    pattern:  /timeout:\s*3000\b/g,
    replacement: 'timeout: 15000',
    reason:   '3s often insufficient for CDN pages. 15s recommended.',
    severity: 'medium',
    category: 'TIMING',
  },

  // ── Exact hardcoded assertions ─────────────────────────────────────────
  {
    id:       'HARDCODED_TITLE',
    pattern:  /expect\(title\?\.trim\(\)\)\.toBe\(['"][^'"]{10,}['"]\)/g,
    replacement: `expect(title?.trim().toLowerCase()).toContain('laptop')`,
    reason:   'Exact product title changes with personalization. Use toContain.',
    severity: 'high',
    category: 'STRICT_MATCH',
  },
  {
    id:       'EXACT_COUNT_24',
    pattern:  /expect\(count\)\.toBe\(24\)/g,
    replacement: `expect(count).toBeGreaterThan(0)`,
    reason:   'Flipkart shows variable product counts. Avoid exact counts.',
    severity: 'high',
    category: 'STRICT_MATCH',
  },

  // ── Random-based assertions ────────────────────────────────────────────
  {
    id:       'RANDOM_COINFLIP',
    pattern:  /const flip = Math\.random\(\) > 0\.5;\s*\n\s*expect\(flip\)\.toBeTruthy\(\)/g,
    replacement: `// HEALED: Removed non-deterministic coin-flip assertion\n    expect(true).toBeTruthy()`,
    reason:   'Math.random() assertions are inherently non-deterministic.',
    severity: 'critical',
    category: 'RANDOM',
  },
  {
    id:       'RANDOM_COUNT_ASSERTION',
    pattern:  /const expected = randomInt\(1, 5\);\s*\n.*\s*expect\(count\)\.toBe\(expected\)/g,
    replacement: `const expected = 20; // HEALED: Use realistic expected count\n    expect(count).toBeGreaterThan(0)`,
    reason:   'RandomInt(1,5) never matches real product count of 20-40.',
    severity: 'critical',
    category: 'RANDOM',
  },

  // ── waitUntil improvements ─────────────────────────────────────────────
  {
    id:       'WAIT_UNTIL_COMMIT',
    pattern:  /waitUntil:\s*['"]commit['"]/g,
    replacement: `waitUntil: 'domcontentloaded'`,
    reason:   '`commit` fires too early. Use domcontentloaded for stability.',
    severity: 'medium',
    category: 'TIMING',
  },

  // ── Missing dismiss-popup before actions ──────────────────────────────
  {
    id:       'MISSING_POPUP_DISMISS',
    pattern:  /await page\.goto\('https:\/\/www\.flipkart\.com'[^)]*\);\s*\n(\s*\/\/[^\n]*)?\s*await home\.(searchBox|cartIcon|loginButton)/g,
    replacement: (match, comment, element) =>
      match.replace(
        new RegExp(`await home\\.${element}`),
        `await dismissLoginPopup(page);\n    await home.${element}`
      ),
    reason:   'Login popup can block interactions. Always dismiss first.',
    severity: 'high',
    category: 'POPUP',
  },

  // ── Strict selector → role-based ─────────────────────────────────────
  {
    id:       'SUBMIT_BUTTON_ROLE',
    pattern:  /page\.locator\(['"`]button\[type="submit"\]['"`]\)\.first\(\)/g,
    replacement: `page.getByRole('button', { name: /search/i })`,
    reason:   'Role-based locator is more robust than attribute selector.',
    severity: 'low',
    category: 'SELECTOR_QUALITY',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// FILE SCANNER
// ─────────────────────────────────────────────────────────────────────────────
function scanFile(filePath) {
  const code     = fs.readFileSync(filePath, 'utf8');
  const issues   = [];

  for (const rule of HEALING_RULES) {
    let match;
    const re = new RegExp(rule.pattern.source, rule.pattern.flags.replace('g', '') + 'g');
    re.lastIndex = 0;

    while ((match = re.exec(code)) !== null) {
      const lineNum = code.slice(0, match.index).split('\n').length;
      issues.push({
        ruleId:      rule.id,
        category:    rule.category,
        severity:    rule.severity,
        reason:      rule.reason,
        line:        lineNum,
        matched:     match[0].slice(0, 80),
        replacement: typeof rule.replacement === 'function'
                       ? rule.replacement(match[0], ...match.slice(1))
                       : rule.replacement,
      });
    }
  }

  return issues;
}

// ─────────────────────────────────────────────────────────────────────────────
// FILE HEALER — apply all matching rules
// ─────────────────────────────────────────────────────────────────────────────
function healFile(filePath, dryRun = false) {
  let code   = fs.readFileSync(filePath, 'utf8');
  const fixes = [];

  for (const rule of HEALING_RULES) {
    const before = code;
    const re = new RegExp(rule.pattern.source, rule.pattern.flags.replace('g', '') + 'g');

    if (typeof rule.replacement === 'function') {
      code = code.replace(re, rule.replacement);
    } else {
      code = code.replace(re, rule.replacement);
    }

    if (code !== before) {
      fixes.push({ ruleId: rule.id, reason: rule.reason, severity: rule.severity });
    }
  }

  if (fixes.length > 0 && !dryRun) {
    // Backup original
    const backupPath = filePath + '.bak';
    if (!fs.existsSync(backupPath)) {
      fs.writeFileSync(backupPath, fs.readFileSync(filePath, 'utf8'));
    }
    fs.writeFileSync(filePath, code);
  }

  return fixes;
}

// ─────────────────────────────────────────────────────────────────────────────
// SEVERITY BADGE
// ─────────────────────────────────────────────────────────────────────────────
const SEVERITY_COLORS = {
  critical: '\x1b[41m\x1b[37m',  // red bg white text
  high:     '\x1b[31m',           // red
  medium:   '\x1b[33m',           // yellow
  low:      '\x1b[36m',           // cyan
};
function badge(severity) {
  return `${SEVERITY_COLORS[severity] || ''}[${severity.toUpperCase()}]\x1b[0m`;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────
function main() {
  const dryRun  = process.argv.includes('--dry-run');
  const fileArg = process.argv.find(a => a.startsWith('--file='))?.split('=')[1];

  const targetFiles = fileArg
    ? [path.resolve(ROOT, fileArg)]
    : [
        path.join(ROOT, 'pages', 'FlipkartHomePage.js'),
        path.join(ROOT, 'pages', 'FlipkartSearchPage.js'),
        path.join(ROOT, 'pages', 'FlipkartProductPage.js'),
        path.join(ROOT, 'tests',  'flipkart-flaky.spec.js'),
      ];

  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║  🔬 XPath / Selector Healer — Static Analysis Tool       ║');
  console.log(`║  Mode: ${dryRun ? 'DRY-RUN (no changes written)' : 'LIVE (files will be modified)  '}          ║`);
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  const report = {
    generatedAt: new Date().toISOString(),
    mode:        dryRun ? 'dry-run' : 'live',
    files:       [],
    totalIssues: 0,
    totalFixed:  0,
  };

  for (const filePath of targetFiles) {
    if (!fs.existsSync(filePath)) {
      console.log(`⚠  Skipping (not found): ${filePath}`);
      continue;
    }

    console.log(`\n📄 File: \x1b[36m${path.relative(ROOT, filePath)}\x1b[0m`);
    console.log('   ' + '─'.repeat(60));

    const issues = scanFile(filePath);

    if (issues.length === 0) {
      console.log('   ✅ No issues found.');
    } else {
      issues.forEach(issue => {
        console.log(`   ${badge(issue.severity)} Line ${issue.line}: ${issue.reason}`);
        console.log(`      Found    : \x1b[31m${issue.matched}\x1b[0m`);
        console.log(`      Suggests : \x1b[32m${String(issue.replacement).slice(0, 80)}\x1b[0m`);
        console.log('');
      });
    }

    let fixes = [];
    if (!dryRun && issues.length > 0) {
      fixes = healFile(filePath, false);
      console.log(`   ✔ Applied ${fixes.length} fix(es) — backup saved as .bak`);
    }

    report.files.push({
      file:   path.relative(ROOT, filePath),
      issues: issues.length,
      fixed:  fixes.length,
      details: issues,
    });
    report.totalIssues += issues.length;
    report.totalFixed  += fixes.length;
  }

  // Save report
  if (!fs.existsSync(REPORTS)) fs.mkdirSync(REPORTS, { recursive: true });
  const reportPath = path.join(REPORTS, 'selector-healing-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log('\n' + '═'.repeat(64));
  console.log(`  🤖 Summary: ${report.totalIssues} issues found, ${report.totalFixed} fixed`);
  console.log(`  Report → ${reportPath}`);
  if (dryRun) console.log('  Run without --dry-run to apply all fixes.');
  console.log('═'.repeat(64) + '\n');

  // Write dashboard data for healer
  const dashDir = path.join(__dirname, '..', 'dashboard');
  if (!fs.existsSync(dashDir)) fs.mkdirSync(dashDir, { recursive: true });
  const healerDataPath = path.join(dashDir, 'healer-data.json');
  fs.writeFileSync(healerDataPath, JSON.stringify(report, null, 2));
}

main();
