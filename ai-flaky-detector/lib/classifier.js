/**
 * Rule-based flakiness classifier
 */
const FLAKINESS_RULES = [
  {
    id: 'TIMING', label: '⏱️ Timing Issue', severity: 'medium',
    patterns: [/timeout/i, /timed out/i, /exceeded/i, /too short/i, /1500/i, /2000/i, /3000/i],
    fix: 'Increase timeout or use waitForSelector / waitForLoadState before asserting.',
  },
  {
    id: 'RANDOM', label: '🎲 Random/Non-Deterministic', severity: 'high',
    patterns: [/Math\.random/i, /randomInt/i, /randomDelay/i, /coin.?flip/i],
    fix: 'Remove random thresholds; use fixed data or flexible assertions.',
  },
  {
    id: 'NETWORK', label: '🌐 Network Flakiness', severity: 'medium',
    patterns: [/net::/i, /ECONNRESET/i, /ETIMEDOUT/i, /500ms/i, /300ms/i, /CDN/i, /rate.?limit/i, /elapsed/i],
    fix: 'Relax SLA thresholds or mock external APIs.',
  },
  {
    id: 'STRICT_SELECTOR', label: '🔍 Fragile Selector / XPath', severity: 'critical',
    patterns: [/locator/i, /selector/i, /xpath/i, /No element/i, /strict mode/i, /not found/i, /unable to find/i, /element.*visible/i, /intercept/i, /overlay/i],
    fix: 'Replace hash-class selectors with role, label, or data-testid locators.',
  },
  {
    id: 'ORDER', label: '📋 Strict Text / Order', severity: 'medium',
    patterns: [/toBe\(/i, /toStrictEqual/i, /exact/i, /hardcoded/i, /ASUS/i, /24 products/i],
    fix: 'Use toContain, toMatch, or toBeGreaterThan instead of exact matches.',
  },
  {
    id: 'POPUP', label: '🪟 Popup / Modal', severity: 'high',
    patterns: [/popup/i, /modal/i, /overlay/i, /dialog/i, /dismiss/i, /login.*cover/i],
    fix: 'Call dismissLoginPopup() before interactions.',
  },
  {
    id: 'RACE', label: '🏁 Race Condition', severity: 'high',
    patterns: [/stale/i, /detached/i, /race/i, /parallel/i, /Promise\.all/i, /commit/i],
    fix: 'Await actions sequentially; use domcontentloaded or networkidle.',
  },
  {
    id: 'API_INTERMITTENT', label: '⚡ API Intermittent', severity: 'medium',
    patterns: [/status/i, /eventual.?consistency/i, /concurrent/i, /POST.*GET/i, /fakestore/i],
    fix: 'Mock APIs or add retries; avoid immediate GET after POST.',
  },
];

function classifyFailure(testTitle, errorMessage = '', sourceSnippet = '') {
  const text = `${testTitle} ${errorMessage} ${sourceSnippet}`.toLowerCase();
  const matches = FLAKINESS_RULES.filter(rule =>
    rule.patterns.some(p => p.test(text))
  );

  if (matches.length === 0) {
    matches.push({
      id: 'UNKNOWN', label: '❓ Unknown', severity: 'low',
      fix: 'Review stack trace and trace viewer.',
    });
  }
  return matches;
}

function enrichWithClassification(testResults) {
  return testResults.map(t => {
    const classifications = classifyFailure(t.title, t.worstError);
    return {
      ...t,
      classifications,
      primaryClass: classifications[0],
      recommendation: classifications.map(c => `[${c.id}] ${c.fix}`).join('\n'),
    };
  });
}

module.exports = { FLAKINESS_RULES, classifyFailure, enrichWithClassification };
