/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║            AI FLAKY TEST DETECTOR & AUTO-HEALER ENGINE                  ║
 * ║  Analyzes Playwright test results, classifies flakiness, suggests fixes  ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Usage (legacy — prefer unified runner):
 *   node ai-flaky-detector/flaky-analyzer.js [--runs=3] [--spec=<file>] [--heal]
 *   npm run ai:flaky   # full detect + heal + verify pipeline
 */

const { execSync, spawn } = require('child_process');
const fs   = require('fs');
const path = require('path');

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────
const CONFIG = {
  runs:           3,          // How many times to run the suite for flaky detection
  spec:           'tests/flipkart-flaky.spec.js',
  project:        'Flaky-Suite',
  outputDir:      path.join(__dirname, 'reports'),
  jsonReport:     path.join(__dirname, 'reports', 'flaky-run-{n}.json'),
  summaryReport:  path.join(__dirname, 'reports', 'flaky-summary.json'),
  dashboardData:  path.join(__dirname, '..', 'dashboard', 'data.json'),
  timeout:        120000,     // 2 min per run
};

// Parse CLI args
process.argv.slice(2).forEach(arg => {
  const [k, v] = arg.replace('--', '').split('=');
  if (k === 'runs')   CONFIG.runs   = parseInt(v, 10);
  if (k === 'spec')   CONFIG.spec   = v;
  if (k === 'heal')   CONFIG.heal   = true;
});

// ─────────────────────────────────────────────────────────────────────────────
// FLAKINESS CLASSIFIER (Rule-based AI)
// ─────────────────────────────────────────────────────────────────────────────
const FLAKINESS_RULES = [
  {
    id:          'TIMING',
    label:       '⏱️ Timing Issue',
    color:       '#f59e0b',
    patterns:    [/timeout/i, /timed out/i, /exceeded/i, /too short/i, /1500/i, /2000/i, /3000/i],
    description: 'Test fails due to insufficient wait time or dynamic rendering delay.',
    fix:         'Increase timeout or use smart waits (waitForSelector, waitForResponse).',
    severity:    'medium',
  },
  {
    id:          'RANDOM',
    label:       '🎲 Random/Non-Deterministic',
    color:       '#8b5cf6',
    patterns:    [/Math\.random/i, /randomInt/i, /randomDelay/i, /coin.?flip/i, /random/i],
    description: 'Assertion value depends on Math.random() — non-deterministic by design.',
    fix:         'Remove random thresholds. Seed random values or use data-driven inputs.',
    severity:    'high',
  },
  {
    id:          'NETWORK',
    label:       '🌐 Network Flakiness',
    color:       '#06b6d4',
    patterns:    [/net::/i, /ECONNRESET/i, /ETIMEDOUT/i, /ERR_NAME_NOT_RESOLVED/i, /500ms/i, /300ms/i, /CDN/i, /rate.?limit/i],
    description: 'Test relies on external API timing or CDN stability.',
    fix:         'Mock external APIs, increase SLA thresholds, or add retry logic.',
    severity:    'medium',
  },
  {
    id:          'STRICT_SELECTOR',
    label:       '🔍 Fragile Selector / XPath',
    color:       '#ef4444',
    patterns:    [/locator/i, /selector/i, /xpath/i, /No element/i, /strict mode/i, /not found/i, /unable to find/i, /element.*visible/i],
    description: 'XPath or CSS selector is brittle — relies on auto-generated class names.',
    fix:         'Replace brittle selectors with semantic ones (data-testid, role, label).',
    severity:    'critical',
  },
  {
    id:          'ORDER',
    label:       '📋 Element Order / Strict Text',
    color:       '#f97316',
    patterns:    [/toBe\(/i, /toStrictEqual/i, /exact/i, /hardcoded/i, /ASUS/i, /24 products/i],
    description: 'Assertion uses hardcoded values that change with live data.',
    fix:         'Use flexible assertions (toContain, toMatch, toBeGreaterThan) instead of exact matches.',
    severity:    'medium',
  },
  {
    id:          'POPUP',
    label:       '🪟 Popup / Modal Interference',
    color:       '#ec4899',
    patterns:    [/popup/i, /modal/i, /overlay/i, /dialog/i, /dismiss/i, /login.*cover/i],
    description: 'A login/promotional modal appears and blocks element interactions.',
    fix:         'Always dismiss popups before interacting. Use beforeEach() hook.',
    severity:    'high',
  },
  {
    id:          'RACE',
    label:       '🏁 Race Condition',
    color:       '#10b981',
    patterns:    [/stale/i, /detached/i, /race/i, /parallel/i, /simultaneously/i, /Promise\.all/i],
    description: 'Parallel actions or re-renders create race conditions.',
    fix:         'Await all async operations sequentially. Use page.waitForLoadState().',
    severity:    'high',
  },
  {
    id:          'API_INTERMITTENT',
    label:       '⚡ API Intermittent',
    color:       '#3b82f6',
    patterns:    [/200/i, /status/i, /eventual.?consistency/i, /concurrent/i, /POST.*GET/i],
    description: 'External API returns inconsistent responses due to eventual consistency.',
    fix:         'Use mock servers. Avoid chaining POST→GET immediately in tests.',
    severity:    'medium',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// SELECTOR HEALING RULES  
// Maps brittle patterns → robust alternatives
// ─────────────────────────────────────────────────────────────────────────────
const SELECTOR_HEALER = [
  // Flipkart home page
  {
    fragile:  `page.locator('a._1PLKL7, img[alt=\"Flipkart\"]')`,
    robust:   `page.locator('img[alt="Flipkart"], [aria-label="Flipkart Logo"]')`,
    reason:   '`_1PLKL7` is a webpack hash class — changes on each deploy.',
  },
  {
    fragile:  `page.locator('button._2KpZ6l._2doB4z')`,
    robust:   `page.locator('button[aria-label="Close"], button:has-text("✕"), button:near(form[class*="login"])')`,
    reason:   'Generated class names are unstable. Target by aria-label or proximity.',
  },
  {
    fragile:  `page.locator('a._1H9Ais')`,
    robust:   `page.getByRole('link', { name: 'Login' })`,
    reason:   'Role-based locators are immune to CSS class changes.',
  },
  {
    fragile:  `page.locator('._2ix_2-, form.K0hhCe')`,
    robust:   `page.getByRole('dialog').filter({ hasText: 'Login' })`,
    reason:   'Dialog role is semantic and stable.',
  },
  {
    fragile:  `page.locator('div._30jeq3._1_WHN1, div._30jeq3')`,
    robust:   `page.locator('[class*="price"]:not([class*="line-through"])')`,
    reason:   'Partial class match is more resilient to hash changes.',
  },
  {
    fragile:  `page.locator('div._4rR01T, a.s1Q9rs, a._2rpwqI')`,
    robust:   `page.locator('a[title]').filter({ hasNot: page.locator('[class*="price"]') })`,
    reason:   'Product titles always have a title attribute on Flipkart.',
  },
  {
    fragile:  `page.locator('div[data-id], div._1AtVbE div._13oc-S')`,
    robust:   `page.locator('[data-id]')`,
    reason:   '`data-id` is a stable data attribute added by Flipkart for each product.',
  },
  {
    fragile:  `page.locator('button[type=\"submit\"], button._2iLD__')`,
    robust:   `page.getByRole('button', { name: /search/i })`,
    reason:   'Search button role is consistent across locales.',
  },
  {
    fragile:  `timeout: 2000`,
    robust:   `timeout: 15000`,
    reason:   '2s is insufficient. Flipkart renders in 4-8s on typical connections.',
  },
  {
    fragile:  `timeout: 1500`,
    robust:   `timeout: 10000`,
    reason:   '1.5s is too short for dynamic content. Use 10s as baseline.',
  },
  {
    fragile:  `timeout: 3000`,
    robust:   `timeout: 15000`,
    reason:   '3s can miss slow renders. 15s with proper waits is more reliable.',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────────────────────
function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function log(msg, level = 'INFO') {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const icons = { INFO: '📘', WARN: '⚠️ ', ERROR: '❌', SUCCESS: '✅', AI: '🤖' };
  console.log(`[${ts}] ${icons[level] || '  '} ${msg}`);
}

function classifyFailure(testTitle, errorMessage = '', sourceSnippet = '') {
  const text = `${testTitle} ${errorMessage} ${sourceSnippet}`.toLowerCase();
  const matches = [];

  for (const rule of FLAKINESS_RULES) {
    if (rule.patterns.some(p => p.test(text))) {
      matches.push(rule);
    }
  }

  // Default fallback
  if (matches.length === 0) {
    matches.push({
      id:          'UNKNOWN',
      label:       '❓ Unknown Failure',
      color:       '#6b7280',
      description: 'Could not auto-classify this failure.',
      fix:         'Review error message and stack trace manually.',
      severity:    'low',
    });
  }

  return matches;
}

function healSelectors(sourceCode) {
  let healed = sourceCode;
  const appliedFixes = [];

  for (const rule of SELECTOR_HEALER) {
    if (healed.includes(rule.fragile)) {
      healed = healed.split(rule.fragile).join(rule.robust);
      appliedFixes.push({ from: rule.fragile, to: rule.robust, reason: rule.reason });
    }
  }

  return { healed, appliedFixes };
}

// ─────────────────────────────────────────────────────────────────────────────
// RUN PLAYWRIGHT TESTS & CAPTURE JSON RESULTS
// ─────────────────────────────────────────────────────────────────────────────
async function runTestSuite(runIndex) {
  const jsonPath = CONFIG.jsonReport.replace('{n}', runIndex);
  ensureDir(CONFIG.outputDir);

  const cmd = [
    'npx playwright test',
    CONFIG.spec,
    `--project=${CONFIG.project}`,
    `--reporter=json`,
    `--retries=0`,   // no retries — we want raw pass/fail per run
    '--timeout=30000',
  ].join(' ');

  log(`Run ${runIndex}/${CONFIG.runs}: ${cmd}`, 'INFO');

  try {
    const output = execSync(cmd, {
      cwd:      path.join(__dirname, '..'),
      timeout:  CONFIG.timeout,
      encoding: 'utf8',
      env:      { ...process.env, PLAYWRIGHT_JSON_OUTPUT_FILE: path.resolve(jsonPath) },
    });
    return { success: true, output };
  } catch (err) {
    // Playwright exits non-zero when tests fail — that's expected
    const stdout = err.stdout || '';
    const stderr = err.stderr || '';

    // Try to save JSON output even on failure
    if (!fs.existsSync(jsonPath)) {
      // Write minimal failure record
      fs.writeFileSync(jsonPath, JSON.stringify({
        runIndex,
        error: 'Suite execution failed or no JSON emitted',
        stdout: stdout.slice(0, 2000),
        stderr: stderr.slice(0, 1000),
        suites: [],
      }, null, 2));
    }

    return { success: false, output: stdout + stderr };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PARSE PLAYWRIGHT JSON REPORT
// ─────────────────────────────────────────────────────────────────────────────
function parsePlaywrightReport(jsonPath) {
  if (!fs.existsSync(jsonPath)) return { tests: [] };

  try {
    const raw  = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const tests = [];

    function walkSuites(suites) {
      if (!suites) return;
      for (const suite of suites) {
        if (suite.specs) {
          for (const spec of suite.specs) {
            for (const result of (spec.tests || [])) {
              tests.push({
                title:    spec.title,
                fullTitle: `${suite.title} > ${spec.title}`,
                status:   result.status,   // 'passed' | 'failed' | 'skipped'
                duration: result.results?.[0]?.duration || 0,
                error:    result.results?.[0]?.error?.message || '',
                retry:    result.results?.length > 1,
              });
            }
          }
        }
        if (suite.suites) walkSuites(suite.suites);
      }
    }

    walkSuites(raw.suites);
    return { tests, raw };
  } catch {
    return { tests: [] };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FLAKY TEST DETECTION  (compare multiple runs)
// ─────────────────────────────────────────────────────────────────────────────
function detectFlakyTests(allRunResults) {
  const testMap = {};

  for (let i = 0; i < allRunResults.length; i++) {
    const { tests } = allRunResults[i];
    for (const t of tests) {
      const key = t.title;
      if (!testMap[key]) {
        testMap[key] = { title: t.title, fullTitle: t.fullTitle, runs: [] };
      }
      testMap[key].runs.push({ runIndex: i + 1, status: t.status, duration: t.duration, error: t.error });
    }
  }

  const results = [];

  for (const [key, data] of Object.entries(testMap)) {
    const statuses  = data.runs.map(r => r.status);
    const passed    = statuses.filter(s => s === 'passed').length;
    const failed    = statuses.filter(s => s === 'failed').length;
    const total     = statuses.length;
    const passRate  = total > 0 ? Math.round((passed / total) * 100) : 0;

    const isFlaky      = passed > 0 && failed > 0;   // intermittent
    const isAlwaysFail = passed === 0 && failed > 0;  // consistently broken
    const isAlwaysPass = passed === total;             // stable

    const worstError    = data.runs.find(r => r.status === 'failed')?.error || '';
    const classifications = classifyFailure(data.title, worstError);

    // Selector healing candidates
    const healCandidates = SELECTOR_HEALER.filter(rule =>
      data.title.toLowerCase().includes(rule.fragile.toLowerCase().slice(0, 20)) ||
      classifications.some(c => c.id === 'STRICT_SELECTOR' || c.id === 'TIMING')
    );

    results.push({
      title:            data.title,
      fullTitle:        data.fullTitle,
      isFlaky,
      isAlwaysFail,
      isAlwaysPass,
      passRate,
      passed,
      failed,
      total,
      runs:             data.runs,
      classifications,
      primaryClass:     classifications[0],
      worstError:       worstError.slice(0, 300),
      healCandidates,
      avgDuration:      Math.round(data.runs.reduce((s, r) => s + (r.duration || 0), 0) / total),
      recommendation:   buildRecommendation(classifications, isFlaky, isAlwaysFail, passRate),
    });
  }

  return results.sort((a, b) => {
    // Sort: flaky first, then always-fail, then pass
    if (a.isFlaky && !b.isFlaky) return -1;
    if (!a.isFlaky && b.isFlaky) return  1;
    if (a.isAlwaysFail && !b.isAlwaysFail) return -1;
    return b.failed - a.failed;
  });
}

function buildRecommendation(classifications, isFlaky, isAlwaysFail, passRate) {
  const lines = [];
  for (const cls of classifications) {
    lines.push(`[${cls.id}] ${cls.fix}`);
  }
  if (isFlaky)       lines.push(`RETRY: This test passes ${passRate}% of the time. Add targeted retry or investigate root cause.`);
  if (isAlwaysFail)  lines.push(`BROKEN: Test always fails. Needs immediate attention.`);
  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// APPLY SELECTOR HEALING TO SOURCE FILES
// ─────────────────────────────────────────────────────────────────────────────
function healSourceFiles() {
  const targetFiles = [
    path.join(__dirname, '..', 'pages', 'FlipkartHomePage.js'),
    path.join(__dirname, '..', 'pages', 'FlipkartSearchPage.js'),
    path.join(__dirname, '..', 'pages', 'FlipkartProductPage.js'),
    path.join(__dirname, '..', 'tests', 'flipkart-flaky.spec.js'),
  ];

  const allFixes = [];

  for (const filePath of targetFiles) {
    if (!fs.existsSync(filePath)) continue;

    const original = fs.readFileSync(filePath, 'utf8');
    const { healed, appliedFixes } = healSelectors(original);

    if (appliedFixes.length > 0) {
      // Backup original
      fs.writeFileSync(filePath + '.bak', original);
      fs.writeFileSync(filePath, healed);
      log(`Healed ${appliedFixes.length} selector(s) in ${path.basename(filePath)}`, 'SUCCESS');
      allFixes.push({ file: path.basename(filePath), fixes: appliedFixes });
    }
  }

  return allFixes;
}

// ─────────────────────────────────────────────────────────────────────────────
// GENERATE SUMMARY REPORT
// ─────────────────────────────────────────────────────────────────────────────
function generateSummary(allResults, runCount, healingFixes) {
  const flaky      = allResults.filter(t => t.isFlaky);
  const alwaysFail = allResults.filter(t => t.isAlwaysFail);
  const stable     = allResults.filter(t => t.isAlwaysPass);

  const summary = {
    generatedAt:     new Date().toISOString(),
    totalRuns:       runCount,
    totalTests:      allResults.length,
    flakyTests:      flaky.length,
    alwaysFailTests: alwaysFail.length,
    stableTests:     stable.length,
    flakyRate:       allResults.length > 0
                       ? Math.round((flaky.length / allResults.length) * 100) : 0,
    classBreakdown:  buildClassBreakdown(allResults),
    severityBreakdown: buildSeverityBreakdown(allResults),
    tests:           allResults,
    healingApplied:  CONFIG.heal || false,
    healingFixes:    healingFixes || [],
  };

  ensureDir(CONFIG.outputDir);
  fs.writeFileSync(CONFIG.summaryReport, JSON.stringify(summary, null, 2));

  // Also write dashboard data
  ensureDir(path.dirname(CONFIG.dashboardData));
  fs.writeFileSync(CONFIG.dashboardData, JSON.stringify(summary, null, 2));

  log(`Report saved → ${CONFIG.summaryReport}`, 'SUCCESS');
  return summary;
}

function buildClassBreakdown(tests) {
  const counts = {};
  for (const t of tests) {
    for (const cls of t.classifications) {
      counts[cls.id] = (counts[cls.id] || 0) + 1;
    }
  }
  return counts;
}

function buildSeverityBreakdown(tests) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const t of tests) {
    for (const cls of t.classifications) {
      if (cls.severity && counts[cls.severity] !== undefined) {
        counts[cls.severity]++;
      }
    }
  }
  return counts;
}

// ─────────────────────────────────────────────────────────────────────────────
// PRINT SUMMARY TO CONSOLE
// ─────────────────────────────────────────────────────────────────────────────
function printConsoleSummary(summary) {
  const SEP = '═'.repeat(72);
  console.log('\n' + SEP);
  console.log('  🤖 AI FLAKY TEST ANALYSIS REPORT');
  console.log(SEP);
  console.log(`  Runs executed  : ${summary.totalRuns}`);
  console.log(`  Total tests    : ${summary.totalTests}`);
  console.log(`  🟡 Flaky        : ${summary.flakyTests}  (${summary.flakyRate}%)`);
  console.log(`  🔴 Always fail  : ${summary.alwaysFailTests}`);
  console.log(`  🟢 Stable       : ${summary.stableTests}`);
  console.log(SEP);

  if (summary.flakyTests > 0) {
    console.log('\n  🟡 FLAKY TESTS (intermittent pass/fail):\n');
    summary.tests.filter(t => t.isFlaky).forEach(t => {
      console.log(`  ▸ ${t.title}`);
      console.log(`    Pass rate: ${t.passRate}% | Avg duration: ${t.avgDuration}ms`);
      console.log(`    Category: ${t.primaryClass?.label}`);
      console.log(`    Fix: ${t.primaryClass?.fix}`);
      console.log('');
    });
  }

  if (summary.alwaysFailTests > 0) {
    console.log('\n  🔴 ALWAYS-FAILING TESTS:\n');
    summary.tests.filter(t => t.isAlwaysFail).forEach(t => {
      console.log(`  ▸ ${t.title}`);
      console.log(`    Category: ${t.primaryClass?.label}`);
      console.log(`    Error: ${t.worstError.slice(0, 120)}`);
      console.log('');
    });
  }

  console.log(SEP);
  console.log('  📊 Full report   → ' + CONFIG.summaryReport);
  console.log('  🌐 Dashboard     → run: npm run dashboard');
  console.log(SEP + '\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN ENTRY POINT
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║       🤖 AI FLAKY TEST DETECTOR — Starting Analysis         ║');
  console.log(`║       Spec: ${CONFIG.spec.padEnd(49)}║`);
  console.log(`║       Runs: ${String(CONFIG.runs).padEnd(49)}║`);
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  ensureDir(CONFIG.outputDir);
  const allRunResults = [];

  // ── PHASE 1: Run tests N times ─────────────────────────────────────────
  for (let i = 1; i <= CONFIG.runs; i++) {
    log(`Starting test run ${i} of ${CONFIG.runs}…`, 'INFO');
    await runTestSuite(i);

    const jsonPath = CONFIG.jsonReport.replace('{n}', i);
    const parsed   = parsePlaywrightReport(jsonPath);
    allRunResults.push(parsed);

    const p = parsed.tests.filter(t => t.status === 'passed').length;
    const f = parsed.tests.filter(t => t.status === 'failed').length;
    log(`Run ${i} complete: ${p} passed, ${f} failed`, f > 0 ? 'WARN' : 'SUCCESS');

    // Small pause between runs to reduce network pressure
    if (i < CONFIG.runs) {
      log('Waiting 3s before next run…', 'INFO');
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  // ── PHASE 2: Detect flaky patterns ─────────────────────────────────────
  log('Analyzing results across all runs…', 'AI');
  const flakyAnalysis = detectFlakyTests(allRunResults);

  // ── PHASE 3: Heal selectors (if --heal flag set) ────────────────────────
  let healingFixes = [];
  if (CONFIG.heal) {
    log('Applying selector healing…', 'AI');
    healingFixes = healSourceFiles();
  } else {
    log('Selector healing skipped (pass --heal to enable)', 'INFO');
  }

  // ── PHASE 4: Generate reports ───────────────────────────────────────────
  const summary = generateSummary(flakyAnalysis, CONFIG.runs, healingFixes);
  printConsoleSummary(summary);

  log('Analysis complete! Open the dashboard to view full results.', 'SUCCESS');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
