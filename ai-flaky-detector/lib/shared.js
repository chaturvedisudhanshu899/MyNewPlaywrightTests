/**
 * Shared utilities for AI flaky-detector tools
 */
const { execSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function log(msg, level = 'INFO') {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const icons = { INFO: '📘', WARN: '⚠️ ', ERROR: '❌', SUCCESS: '✅', AI: '🤖', HEAL: '🔧' };
  console.log(`[${ts}] ${icons[level] || '  '} ${msg}`);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Map Playwright JSON outcome → pass/fail for flaky math
 */
function normalizeStatus(test) {
  const outcome = test.status;
  if (outcome === 'expected' || outcome === 'flaky') return 'passed';
  if (outcome === 'unexpected') return 'failed';
  if (outcome === 'skipped') return 'skipped';
  const last = test.results?.[test.results.length - 1];
  if (last?.status === 'passed') return 'passed';
  if (last?.status === 'failed' || last?.status === 'timedOut') return 'failed';
  return 'skipped';
}

function extractError(test) {
  for (const r of test.results || []) {
    if (r.error?.message) return r.error.message;
    if (r.errors?.[0]?.message) return r.errors[0].message;
  }
  return '';
}

/**
 * Parse Playwright JSON report (v2 format)
 */
function parsePlaywrightReport(jsonPath) {
  if (!fs.existsSync(jsonPath)) return { tests: [] };

  try {
    const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const tests = [];

    function walkSuites(suites, parentTitle = '') {
      if (!suites) return;
      for (const suite of suites) {
        const suiteTitle = parentTitle
          ? `${parentTitle} > ${suite.title}`
          : (suite.title || '');

        for (const spec of suite.specs || []) {
          for (const test of spec.tests || []) {
            tests.push({
              title:     spec.title,
              fullTitle: suiteTitle ? `${suiteTitle} > ${spec.title}` : spec.title,
              file:      spec.file,
              line:      spec.line,
              status:    normalizeStatus(test),
              duration:  test.results?.[0]?.duration || 0,
              error:     extractError(test),
              retries:   (test.results?.length || 1) - 1,
            });
          }
        }
        walkSuites(suite.suites, suiteTitle);
      }
    }

    walkSuites(raw.suites);
    return { tests, raw };
  } catch (err) {
    log(`Failed to parse report ${jsonPath}: ${err.message}`, 'WARN');
    return { tests: [] };
  }
}

/**
 * Run Playwright and write JSON report to jsonPath
 */
function runPlaywright({ spec, project, jsonPath, grep, timeout = 120000, testTimeout = 45000 }) {
  ensureDir(path.dirname(jsonPath));

  const grepFlag = grep
    ? `--grep "${String(grep).replace(/"/g, '\\"')}"`
    : '';

  const cmd = [
    'npx playwright test',
    spec,
    `--project=${project}`,
    `--reporter=json`,
    `--retries=0`,
    `--timeout=${testTimeout}`,
    grepFlag,
  ].filter(Boolean).join(' ');

  const env = {
    ...process.env,
    PLAYWRIGHT_JSON_OUTPUT_FILE: path.resolve(jsonPath),
  };

  try {
    execSync(cmd, {
      cwd:     ROOT,
      timeout,
      encoding: 'utf8',
      env,
      stdio:   ['pipe', 'pipe', 'pipe'],
    });
    return { exitCode: 0 };
  } catch (err) {
    return {
      exitCode: err.status || 1,
      stdout:   (err.stdout || '').slice(0, 3000),
      stderr:   (err.stderr || '').slice(0, 1500),
    };
  }
}

function detectFlakyFromRuns(allRunResults) {
  const testMap = {};

  for (let i = 0; i < allRunResults.length; i++) {
    const { tests } = allRunResults[i];
    for (const t of tests) {
      const key = t.title;
      if (!testMap[key]) {
        testMap[key] = { title: t.title, fullTitle: t.fullTitle, file: t.file, runs: [] };
      }
      testMap[key].runs.push({
        runIndex: i + 1,
        status:   t.status,
        duration: t.duration,
        error:    t.error,
      });
    }
  }

  const results = [];
  for (const data of Object.values(testMap)) {
    const statuses     = data.runs.map(r => r.status);
    const passed       = statuses.filter(s => s === 'passed').length;
    const failed       = statuses.filter(s => s === 'failed').length;
    const total        = statuses.length;
    const passRate     = total > 0 ? Math.round((passed / total) * 100) : 0;
    const isFlaky      = passed > 0 && failed > 0;
    const isAlwaysFail = passed === 0 && failed > 0;
    const isAlwaysPass = failed === 0 && passed === total;

    results.push({
      title:        data.title,
      fullTitle:    data.fullTitle,
      file:         data.file,
      isFlaky,
      isAlwaysFail,
      isAlwaysPass,
      passRate,
      passed,
      failed,
      total,
      runs:         data.runs,
      worstError:   (data.runs.find(r => r.status === 'failed')?.error || '').slice(0, 500),
      avgDuration:  total > 0
        ? Math.round(data.runs.reduce((s, r) => s + (r.duration || 0), 0) / total)
        : 0,
    });
  }

  return results.sort((a, b) => {
    if (a.isFlaky && !b.isFlaky) return -1;
    if (!a.isFlaky && b.isFlaky) return 1;
    if (a.isAlwaysFail && !b.isAlwaysFail) return -1;
    return b.failed - a.failed;
  });
}

module.exports = {
  ROOT,
  ensureDir,
  log,
  sleep,
  parsePlaywrightReport,
  runPlaywright,
  detectFlakyFromRuns,
  normalizeStatus,
};
