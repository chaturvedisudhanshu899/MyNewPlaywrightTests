/**
 * Apply selector + assertion healing to source files
 */
const fs   = require('fs');
const path = require('path');
const { ROOT, log } = require('./shared');
const { applyRulesToCode, scanCode } = require('./selector-rules');

const DEFAULT_TARGETS = [
  'pages/FlipkartHomePage.js',
  'pages/FlipkartSearchPage.js',
  'pages/FlipkartProductPage.js',
  'utils/helpers.js',
  'tests/flipkart-flaky.spec.js',
];

function backupFile(filePath) {
  const backupPath = filePath + '.bak';
  if (!fs.existsSync(backupPath)) {
    fs.writeFileSync(backupPath, fs.readFileSync(filePath, 'utf8'));
  }
}

/**
 * @param {object} opts
 * @param {string[]} [opts.files] - relative paths from project root
 * @param {boolean} [opts.dryRun]
 */
function healFiles(opts = {}) {
  const dryRun = opts.dryRun || false;
  const files  = (opts.files || DEFAULT_TARGETS).map(f => path.join(ROOT, f));
  const report = { files: [], totalFixed: 0 };

  for (const filePath of files) {
    if (!fs.existsSync(filePath)) continue;

    const original = fs.readFileSync(filePath, 'utf8');
    const issues   = scanCode(original);
    const { healed, appliedFixes } = applyRulesToCode(original);

    if (appliedFixes.length > 0 && !dryRun) {
      backupFile(filePath);
      fs.writeFileSync(filePath, healed);
      log(`Healed ${appliedFixes.length} issue(s) in ${path.relative(ROOT, filePath)}`, 'HEAL');
    }

    report.files.push({
      file:   path.relative(ROOT, filePath),
      issues: issues.length,
      fixed:  appliedFixes.length,
      fixes:  appliedFixes,
    });
    report.totalFixed += appliedFixes.length;
  }

  return report;
}

module.exports = { healFiles, DEFAULT_TARGETS };
