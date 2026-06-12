/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║           SMART RETRY RUNNER — Runs tests with intelligent retry logic   ║
 * ║   Detects flaky signature (pass after fail) and logs retry patterns      ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * This runner wraps Playwright test execution with:
 *  - Per-test retry tracking (not global retries)
 *  - Intelligent back-off between retries
 *  - Failure pattern logging
 *  - Auto-healing selector suggestions on test file scan
 */

const { execSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const ROOT    = path.join(__dirname, '..');
const REPORTS = path.join(__dirname, 'reports');
const MAX_RETRIES = 3;
const RETRY_DELAY = [0, 2000, 5000];  // backoff per attempt (ms)

// ─── ANSI Colors ─────────────────────────────────────────────────────────────
const C = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  red:    '\x1b[31m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  cyan:   '\x1b[36m',
  magenta:'\x1b[35m',
  gray:   '\x1b[90m',
  bgRed:  '\x1b[41m',
};

function col(text, ...codes) {
  return codes.join('') + text + C.reset;
}

function log(msg, type = 'info') {
  const ts = new Date().toLocaleTimeString();
  const prefix = {
    info:    col(`[${ts}] ℹ `, C.cyan),
    success: col(`[${ts}] ✔ `, C.green),
    warn:    col(`[${ts}] ⚠ `, C.yellow),
    error:   col(`[${ts}] ✘ `, C.red),
    ai:      col(`[${ts}] 🤖`, C.magenta),
    retry:   col(`[${ts}] ↺ `, C.yellow, C.bold),
  }[type] || `[${ts}]`;
  console.log(`${prefix} ${msg}`);
}

function ensureDir(d) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); }
function sleep(ms)    { return new Promise(r => setTimeout(r, ms)); }

// ─────────────────────────────────────────────────────────────────────────────
//  Run a single test file with a specific grep pattern for targeted retry
// ─────────────────────────────────────────────────────────────────────────────
function runSingleTest(spec, grepPattern, attempt, jsonOut) {
  const grepFlag = grepPattern ? `--grep "${grepPattern.replace(/"/g, '\\"')}"` : '';
  const cmd = [
    'npx playwright test',
    spec,
    `--project=Flaky-Suite`,
    `--reporter=json`,
    `--retries=0`,
    `--timeout=45000`,
    grepFlag,
  ].filter(Boolean).join(' ');

  log(`Attempt ${attempt}: ${cmd.slice(0, 80)}…`, 'retry');

  try {
    const output = execSync(cmd, {
      cwd:      ROOT,
      timeout:  90000,
      encoding: 'utf8',
      env:      { ...process.env, PLAYWRIGHT_JSON_OUTPUT_FILE: path.resolve(jsonOut) },
    });
    return { exitCode: 0, output };
  } catch (err) {
    return { exitCode: err.status || 1, output: (err.stdout || '') + (err.stderr || '') };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Run entire suite once, capture JSON
// ─────────────────────────────────────────────────────────────────────────────
function runFullSuite(spec, jsonOut) {
  const cmd = [
    'npx playwright test',
    spec,
    `--project=Flaky-Suite`,
    `--reporter=json`,
    `--retries=0`,
    `--timeout=45000`,
  ].join(' ');

  log(`Running full suite: ${spec}`, 'info');

  try {
    execSync(cmd, {
      cwd:      ROOT,
      timeout:  180000,
      encoding: 'utf8',
      env:      { ...process.env, PLAYWRIGHT_JSON_OUTPUT_FILE: path.resolve(jsonOut) },
      stdio:    ['pipe', 'pipe', 'pipe'],
    });
    return 0;
  } catch (err) {
    return err.status || 1;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Parse Playwright JSON report → flat test list
// ─────────────────────────────────────────────────────────────────────────────
function parseReport(jsonPath) {
  if (!fs.existsSync(jsonPath)) return [];

  try {
    const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const tests = [];

    function walk(suites) {
      if (!suites) return;
      for (const s of suites) {
        for (const spec of (s.specs || [])) {
          for (const t of (spec.tests || [])) {
            tests.push({
              title:    spec.title,
              status:   t.status,
              duration: t.results?.[0]?.duration || 0,
              error:    t.results?.[0]?.error?.message || '',
            });
          }
        }
        walk(s.suites);
      }
    }
    walk(raw.suites);
    return tests;
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  SMART RETRY ENGINE
//  For each failing test, retry up to MAX_RETRIES times with backoff
// ─────────────────────────────────────────────────────────────────────────────
async function smartRetryEngine(spec) {
  ensureDir(REPORTS);

  const retryLog = [];
  const allTestResults = {};  // title → { attempts: [] }

  // ── Step 1: Initial run ──────────────────────────────────────────────────
  const run1Json = path.join(REPORTS, 'retry-run-1.json');
  log('Initial test run (attempt 1)…', 'info');
  runFullSuite(spec, run1Json);
  const run1Tests = parseReport(run1Json);

  for (const t of run1Tests) {
    allTestResults[t.title] = { attempts: [{ run: 1, status: t.status, error: t.error }] };
  }

  const initialFails = run1Tests.filter(t => t.status === 'failed');
  log(`Initial run: ${run1Tests.length - initialFails.length} passed, ${col(String(initialFails.length), C.red)} failed`, 'info');

  if (initialFails.length === 0) {
    log('All tests passed on first attempt! No flaky tests detected.', 'success');
    return buildRetryReport(allTestResults, retryLog, spec);
  }

  // ── Step 2: Smart retry for each failing test ────────────────────────────
  log(`\n${col(`Retrying ${initialFails.length} failing tests…`, C.bold, C.yellow)}`, 'ai');

  for (const failedTest of initialFails) {
    const title    = failedTest.title;
    const attempts = allTestResults[title].attempts;

    log(`\n▶ Retrying: ${col(title, C.cyan)}`, 'retry');
    log(`  Error: ${col(failedTest.error.slice(0, 100), C.gray)}`, 'error');

    let healed = false;

    for (let attempt = 2; attempt <= MAX_RETRIES + 1; attempt++) {
      const delay = RETRY_DELAY[attempt - 2] || 5000;
      if (delay > 0) {
        log(`  Waiting ${delay}ms before attempt ${attempt}…`, 'info');
        await sleep(delay);
      }

      const runJson = path.join(REPORTS, `retry-${title.replace(/\W+/g, '_').slice(0, 30)}-attempt${attempt}.json`);
      runSingleTest(spec, title, attempt, runJson);

      const retryTests = parseReport(runJson);
      const thisResult = retryTests.find(t => t.title === title);
      const status     = thisResult?.status || 'unknown';

      attempts.push({ run: attempt, status, error: thisResult?.error || '' });

      if (status === 'passed') {
        log(`  ${col('✔ PASSED on attempt ' + attempt, C.green, C.bold)} → FLAKY CONFIRMED`, 'success');
        healed = true;
        retryLog.push({
          test:    title,
          result:  'FLAKY',
          passedOnAttempt: attempt,
          totalAttempts:   attempt,
        });
        break;
      } else {
        log(`  ${col('✘ Still failing (attempt ' + attempt + ')', C.red)}`, 'warn');
      }
    }

    if (!healed) {
      log(`  ${col('✘ CONSISTENTLY FAILING after ' + MAX_RETRIES + ' retries', C.red, C.bold)}`, 'error');
      retryLog.push({
        test:    title,
        result:  'CONSISTENTLY_FAILING',
        passedOnAttempt: null,
        totalAttempts:   MAX_RETRIES + 1,
      });
    }
  }

  return buildRetryReport(allTestResults, retryLog, spec);
}

function buildRetryReport(allTestResults, retryLog, spec) {
  const tests = Object.entries(allTestResults).map(([title, data]) => {
    const statuses  = data.attempts.map(a => a.status);
    const passed    = statuses.filter(s => s === 'passed').length;
    const failed    = statuses.filter(s => s === 'failed').length;
    const isFlaky   = passed > 0 && failed > 0;
    const passRate  = statuses.length > 0 ? Math.round((passed / statuses.length) * 100) : 0;

    return { title, attempts: data.attempts, isFlaky, passed, failed, passRate };
  });

  const report = {
    generatedAt: new Date().toISOString(),
    spec,
    maxRetries: MAX_RETRIES,
    summary: {
      total:    tests.length,
      flaky:    tests.filter(t => t.isFlaky).length,
      alwaysFail: tests.filter(t => !t.isFlaky && t.failed > 0).length,
      stable:   tests.filter(t => t.failed === 0).length,
    },
    retryLog,
    tests,
  };

  const outPath = path.join(REPORTS, 'smart-retry-report.json');
  ensureDir(REPORTS);
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

  // ── Console summary ────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(64));
  console.log(col('  🤖 SMART RETRY ENGINE — Final Report', C.bold, C.cyan));
  console.log('═'.repeat(64));
  console.log(`  Spec        : ${spec}`);
  console.log(`  Max retries : ${MAX_RETRIES}`);
  console.log(`  Total tests : ${report.summary.total}`);
  console.log(`  ${col('🟡 Flaky', C.yellow)}       : ${report.summary.flaky}`);
  console.log(`  ${col('🔴 Always fail', C.red)} : ${report.summary.alwaysFail}`);
  console.log(`  ${col('🟢 Stable', C.green)}      : ${report.summary.stable}`);

  if (retryLog.length > 0) {
    console.log('\n  Retry Details:');
    retryLog.forEach(r => {
      const icon = r.result === 'FLAKY' ? col('🟡 FLAKY', C.yellow) : col('🔴 BROKEN', C.red);
      const info = r.passedOnAttempt
        ? `(passed on attempt ${r.passedOnAttempt})`
        : `(failed all ${r.totalAttempts} attempts)`;
      console.log(`  ▸ ${icon}  ${r.test.slice(0, 50)} ${info}`);
    });
  }

  console.log('\n  Report saved → ' + outPath);
  console.log('═'.repeat(64) + '\n');

  return report;
}

// ─────────────────────────────────────────────────────────────────────────────
//  ENTRY POINT
// ─────────────────────────────────────────────────────────────────────────────
const spec = process.argv[2] || 'tests/flipkart-flaky.spec.js';
smartRetryEngine(spec).catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
