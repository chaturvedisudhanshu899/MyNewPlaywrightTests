#!/usr/bin/env node
/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║     AI FLAKY TEST RUNNER — Detect, Heal Selectors/XPath, Verify         ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Full pipeline (default):
 *   1. Run flaky suite N times → detect intermittent failures
 *   2. Classify root causes (timing, selector, random, network, …)
 *   3. Heal page objects + flaky spec (selectors, timeouts, assertions)
 *   4. Re-run once to verify improvements
 *
 * Usage:
 *   node ai-flaky-detector/run.js
 *   node ai-flaky-detector/run.js --runs=5 --heal --verify
 *   node ai-flaky-detector/run.js --mode=analyze
 *   node ai-flaky-detector/run.js --mode=heal --dry-run
 *   node ai-flaky-detector/run.js --mode=retry
 *   node ai-flaky-detector/run.js --mode=mcp-heal --mcp
 *   node ai-flaky-detector/run.js --mcp   # full pipeline + MCP browser heal
 */

const fs   = require('fs');
const path = require('path');
const { ROOT, ensureDir, log, sleep, parsePlaywrightReport, runPlaywright, detectFlakyFromRuns } = require('./lib/shared');
const { enrichWithClassification } = require('./lib/classifier');
const { healFiles } = require('./lib/healer');
const { patchFlakySpec, testIdsFromAnalysis } = require('./lib/flaky-test-patcher');
const { runMcpHeal } = require('./lib/mcp-healer');

const REPORTS_DIR = path.join(__dirname, 'reports');
const DASHBOARD_DATA = path.join(ROOT, 'dashboard', 'data.json');

// ── CLI args ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const CONFIG = {
  runs:    3,
  spec:    'tests/flipkart-flaky.spec.js',
  project: 'Flaky-Suite',
  mode:    'full',      // full | analyze | heal | retry | mcp-heal
  heal:    false,
  mcp:     false,       // use MCP browser snapshot + locator probes
  verify:  true,
  dryRun:  false,
};

for (const arg of args) {
  if (arg.startsWith('--runs='))   CONFIG.runs   = parseInt(arg.split('=')[1], 10);
  if (arg.startsWith('--spec='))   CONFIG.spec   = arg.split('=')[1];
  if (arg.startsWith('--project=')) CONFIG.project = arg.split('=')[1];
  if (arg.startsWith('--mode='))   CONFIG.mode   = arg.split('=')[1];
  if (arg === '--heal')            CONFIG.heal   = true;
  if (arg === '--mcp')             CONFIG.mcp    = true;
  if (arg === '--no-verify')       CONFIG.verify = false;
  if (arg === '--dry-run')         CONFIG.dryRun = true;
  if (arg === '--verify')          CONFIG.verify = true;
}

if (CONFIG.mode === 'full') CONFIG.heal = true;
if (CONFIG.mode === 'mcp-heal') { CONFIG.mcp = true; CONFIG.heal = true; }
if (CONFIG.mcp && CONFIG.mode === 'full') CONFIG.heal = true;

// ── Smart retry (per failing test) ───────────────────────────────────────────
async function runSmartRetry() {
  const MAX_RETRIES = 3;
  const RETRY_DELAY = [0, 2000, 5000];
  const spec = CONFIG.spec;
  const run1Json = path.join(REPORTS_DIR, 'retry-run-1.json');

  log('Smart retry: initial suite run…', 'INFO');
  runPlaywright({ spec, project: CONFIG.project, jsonPath: run1Json });
  const run1 = parsePlaywrightReport(run1Json).tests;
  const fails = run1.filter(t => t.status === 'failed');

  const allResults = {};
  for (const t of run1) {
    allResults[t.title] = { attempts: [{ run: 1, status: t.status, error: t.error }] };
  }

  log(`Initial: ${run1.length - fails.length} passed, ${fails.length} failed`, fails.length ? 'WARN' : 'SUCCESS');

  for (const failed of fails) {
    log(`Retrying: ${failed.title}`, 'INFO');
    for (let attempt = 2; attempt <= MAX_RETRIES + 1; attempt++) {
      await sleep(RETRY_DELAY[attempt - 2] || 5000);
      const jsonPath = path.join(REPORTS_DIR, `retry-${failed.title.replace(/\W+/g, '_').slice(0, 40)}-a${attempt}.json`);
      runPlaywright({ spec, project: CONFIG.project, jsonPath, grep: failed.title });
      const retryTests = parsePlaywrightReport(jsonPath).tests;
      const result = retryTests.find(t => t.title === failed.title);
      const status = result?.status || 'failed';
      allResults[failed.title].attempts.push({ run: attempt, status, error: result?.error || '' });
      if (status === 'passed') {
        log(`  Passed on attempt ${attempt} → FLAKY`, 'SUCCESS');
        break;
      }
    }
  }

  const tests = Object.entries(allResults).map(([title, data]) => {
    const statuses = data.attempts.map(a => a.status);
    const passed = statuses.filter(s => s === 'passed').length;
    const failed = statuses.filter(s => s === 'failed').length;
    return { title, attempts: data.attempts, isFlaky: passed > 0 && failed > 0, passed, failed };
  });

  const report = {
    generatedAt: new Date().toISOString(),
    mode: 'smart-retry',
    spec,
    tests,
    summary: {
      total: tests.length,
      flaky: tests.filter(t => t.isFlaky).length,
      alwaysFail: tests.filter(t => !t.isFlaky && t.failed > 0).length,
      stable: tests.filter(t => t.failed === 0).length,
    },
  };

  fs.writeFileSync(path.join(REPORTS_DIR, 'smart-retry-report.json'), JSON.stringify(report, null, 2));
  printSummary(report);
  return report;
}

// ── Multi-run flaky detection ────────────────────────────────────────────────
async function runMultiPassAnalysis() {
  ensureDir(REPORTS_DIR);
  const allRunResults = [];

  for (let i = 1; i <= CONFIG.runs; i++) {
    const jsonPath = path.join(REPORTS_DIR, `flaky-run-${i}.json`);
    log(`Run ${i}/${CONFIG.runs}: ${CONFIG.spec}`, 'INFO');
    runPlaywright({ spec: CONFIG.spec, project: CONFIG.project, jsonPath });
    allRunResults.push(parsePlaywrightReport(jsonPath));

    const passed = allRunResults[i - 1].tests.filter(t => t.status === 'passed').length;
    const failed = allRunResults[i - 1].tests.filter(t => t.status === 'failed').length;
    log(`Run ${i}: ${passed} passed, ${failed} failed`, failed ? 'WARN' : 'SUCCESS');

    if (i < CONFIG.runs) {
      log('Pause 3s before next run…', 'INFO');
      await sleep(3000);
    }
  }

  let analysis = detectFlakyFromRuns(allRunResults);
  analysis = enrichWithClassification(analysis);

  return { analysis, allRunResults };
}

// ── Verify after heal ──────────────────────────────────────────────────────────
function runVerification() {
  const jsonPath = path.join(REPORTS_DIR, 'verify-run.json');
  log('Verification run after healing…', 'INFO');
  runPlaywright({ spec: CONFIG.spec, project: CONFIG.project, jsonPath });
  const { tests } = parsePlaywrightReport(jsonPath);
  const passed = tests.filter(t => t.status === 'passed').length;
  const failed = tests.filter(t => t.status === 'failed').length;
  log(`Verify: ${passed} passed, ${failed} failed`, failed ? 'WARN' : 'SUCCESS');
  return { tests, passed, failed };
}

function buildSummary(analysis, healingReport, patchReport, verifyResult, mcpReport = null) {
  const flaky      = analysis.filter(t => t.isFlaky);
  const alwaysFail = analysis.filter(t => t.isAlwaysFail);
  const stable     = analysis.filter(t => t.isAlwaysPass);

  const classBreakdown = {};
  for (const t of analysis) {
    for (const c of t.classifications || []) {
      classBreakdown[c.id] = (classBreakdown[c.id] || 0) + 1;
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    spec: CONFIG.spec,
    totalRuns: CONFIG.runs,
    totalTests: analysis.length,
    flakyTests: flaky.length,
    alwaysFailTests: alwaysFail.length,
    stableTests: stable.length,
    flakyRate: analysis.length ? Math.round((flaky.length / analysis.length) * 100) : 0,
    classBreakdown,
    tests: analysis,
    healing: {
      enabled: CONFIG.heal,
      dryRun: CONFIG.dryRun,
      mcp: mcpReport || null,
      selectorFixes: healingReport?.totalFixed || 0,
      fileDetails: healingReport?.files || [],
      specPatches: patchReport?.patched || 0,
      specPatchDetails: patchReport?.details || [],
    },
    verification: verifyResult || null,
  };
}

function printSummary(summary) {
  const SEP = '═'.repeat(72);
  console.log('\n' + SEP);
  console.log('  🤖 AI FLAKY TEST — REPORT');
  console.log(SEP);
  console.log(`  Spec           : ${summary.spec || CONFIG.spec}`);
  console.log(`  Runs           : ${summary.totalRuns || '—'}`);
  console.log(`  Total tests    : ${summary.totalTests ?? summary.summary?.total ?? '—'}`);
  console.log(`  🟡 Flaky        : ${summary.flakyTests ?? summary.summary?.flaky ?? 0}`);
  console.log(`  🔴 Always fail  : ${summary.alwaysFailTests ?? summary.summary?.alwaysFail ?? 0}`);
  console.log(`  🟢 Stable       : ${summary.stableTests ?? summary.summary?.stable ?? 0}`);

  if (summary.healing?.enabled) {
    console.log(`  🔧 Selector fixes: ${summary.healing.selectorFixes}`);
    console.log(`  🔧 Spec patches  : ${summary.healing.specPatches}`);
    if (summary.healing.mcp?.summary) {
      console.log(`  🔌 MCP probes    : ${summary.healing.mcp.summary.healthy}/${summary.healing.mcp.summary.probesRun} healthy, ${summary.healing.mcp.summary.patchesApplied} patched`);
    }
  }

  if (summary.verification) {
    console.log(`  ✓ After heal    : ${summary.verification.passed} passed, ${summary.verification.failed} failed`);
  }

  const flakyList = (summary.tests || []).filter(t => t.isFlaky);
  if (flakyList.length) {
    console.log('\n  🟡 Flaky tests:');
    flakyList.slice(0, 8).forEach(t => {
      console.log(`    ▸ ${t.title}`);
      console.log(`      ${t.passRate}% pass | ${t.primaryClass?.label || '—'}`);
    });
  }

  console.log('\n  📊 JSON report → ' + path.join(REPORTS_DIR, 'flaky-summary.json'));
  console.log('  🌐 Dashboard   → npm run ai:dashboard');
  console.log(SEP + '\n');
}

function writeReports(summary) {
  ensureDir(REPORTS_DIR);
  ensureDir(path.dirname(DASHBOARD_DATA));
  fs.writeFileSync(path.join(REPORTS_DIR, 'flaky-summary.json'), JSON.stringify(summary, null, 2));
  fs.writeFileSync(DASHBOARD_DATA, JSON.stringify(summary, null, 2));
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║     🤖 AI FLAKY TEST RUNNER — Auto Detect & Heal            ║');
  console.log(`║     Mode: ${CONFIG.mode.padEnd(52)}║`);
  console.log(`║     Spec: ${CONFIG.spec.padEnd(52)}║`);
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  ensureDir(REPORTS_DIR);

  if (CONFIG.mode === 'retry') {
    const report = await runSmartRetry();
    writeReports(report);
    return;
  }

  if (CONFIG.mode === 'heal' || CONFIG.mode === 'mcp-heal') {
    log(`Healing${CONFIG.mcp ? ' (MCP browser + rules)' : ''} — no flaky detection runs…`, 'AI');
    let mcpReport = null;
    if (CONFIG.mcp) {
      mcpReport = await runMcpHeal({ dryRun: CONFIG.dryRun, apply: true });
    }
    const healingReport = healFiles({ dryRun: CONFIG.dryRun });
    const patchReport   = patchFlakySpec({ dryRun: CONFIG.dryRun });
    const summary = buildSummary([], healingReport, patchReport, null, mcpReport);
    summary.mode = CONFIG.mode;
    summary.healing.enabled = true;
    writeReports(summary);
    printSummary(summary);
    const mcpNote = mcpReport ? `, ${mcpReport.summary.patchesApplied} MCP patch(es)` : '';
    log(`Fixed ${healingReport.totalFixed} rule-based + ${patchReport.patched} spec${mcpNote}${CONFIG.dryRun ? ' (dry-run)' : ''}`, 'SUCCESS');
    return;
  }

  // analyze or full
  log('Phase 1: Multi-run flaky detection…', 'AI');
  const { analysis } = await runMultiPassAnalysis();

  let healingReport = { totalFixed: 0, files: [] };
  let patchReport   = { patched: 0, details: [] };
  let verifyResult  = null;
  let mcpReport     = null;

  if (CONFIG.heal && CONFIG.mode !== 'analyze') {
    if (CONFIG.mcp) {
      log('Phase 2a: MCP browser snapshot + locator probes…', 'AI');
      mcpReport = await runMcpHeal({ dryRun: CONFIG.dryRun, apply: true });
    }
    log('Phase 2: Healing brittle selectors & XPath in page objects…', 'AI');
    healingReport = healFiles({ dryRun: CONFIG.dryRun });

    const flakyOrBroken = analysis.filter(t => t.isFlaky || t.isAlwaysFail);
    const testIds = testIdsFromAnalysis(flakyOrBroken);
    log(`Phase 3: Context patches for ${testIds.length} flaky test ID(s)…`, 'AI');
    patchReport = patchFlakySpec({ testIds, dryRun: CONFIG.dryRun });

    if (CONFIG.verify && !CONFIG.dryRun) {
      log('Phase 4: Verification run…', 'AI');
      verifyResult = runVerification();
    }
  } else if (CONFIG.heal && CONFIG.dryRun) {
    healingReport = healFiles({ dryRun: true });
    patchReport   = patchFlakySpec({ dryRun: true });
  }

  const summary = buildSummary(analysis, healingReport, patchReport, verifyResult, mcpReport);
  writeReports(summary);
  printSummary(summary);

  log('Done.', 'SUCCESS');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
