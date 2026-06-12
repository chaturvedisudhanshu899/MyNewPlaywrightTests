const https = require('https');
const url = require('url');

class SlackReporter {
  /**
   * @param {object} options
   * @param {string} [options.webhookUrl]
   */
  constructor(options = {}) {
    this.webhookUrl = options.webhookUrl || process.env.SLACK_WEBHOOK_URL;
    this.stats = {
      total: 0,
      passed: 0,
      failed: 0,
      flaky: 0,
      skipped: 0,
    };
  }

  onBegin(config, suite) {
    this.startTime = Date.now();
  }

  onTestEnd(test, result) {
    this.stats.total++;
    const outcome = test.outcome();
    if (outcome === 'expected') {
      this.stats.passed++;
    } else if (outcome === 'unexpected') {
      this.stats.failed++;
    } else if (outcome === 'flaky') {
      this.stats.flaky++;
    } else if (outcome === 'skipped') {
      this.stats.skipped++;
    }
  }

  async onEnd(result) {
    if (!this.webhookUrl) {
      console.log('\n⚠️ [SlackReporter] Slack Webhook URL not provided. Skipping Slack notifications.');
      return;
    }

    const duration = ((Date.now() - this.startTime) / 1000).toFixed(1);
    const env = (process.env.ENV || 'qa').toUpperCase();
    const baseUrl = process.env.BASE_URL || 'https://www.flipkart.com';
    
    // Determine overall run status
    // status can be 'passed' | 'failed' | 'timedout' | 'interrupted'
    const status = result.status;
    const isSuccess = status === 'passed';
    
    let statusEmoji = '🟢';
    let statusText = 'PASSED';
    let attachmentColor = '#36a64f'; // Green

    if (this.stats.failed > 0 || status === 'failed' || status === 'timedout') {
      statusEmoji = '🔴';
      statusText = 'FAILED';
      attachmentColor = '#a30200'; // Red
    } else if (this.stats.flaky > 0) {
      statusEmoji = '🟡';
      statusText = 'PASSED WITH FLAKINESS';
      attachmentColor = '#e0a115'; // Yellow
    }

    // Build CI Context
    const isCI = !!process.env.CI;
    let ciDetails = '';
    if (isCI) {
      const runId = process.env.GITHUB_RUN_ID;
      const repo = process.env.GITHUB_REPOSITORY;
      const serverUrl = process.env.GITHUB_SERVER_URL || 'https://github.com';
      const runUrl = `${serverUrl}/${repo}/actions/runs/${runId}`;
      const branch = process.env.GITHUB_REF_NAME || 'unknown';
      const actor = process.env.GITHUB_ACTOR || 'unknown';
      
      ciDetails = `\n• *CI/CD Run:* <${runUrl}|GitHub Action Run #${process.env.GITHUB_RUN_NUMBER}>\n• *Branch:* \`${branch}\`\n• *Triggered By:* \`${actor}\``;
    }

    // Construct Slack payload using Blocks for rich formatting
    const slackPayload = {
      attachments: [
        {
          color: attachmentColor,
          blocks: [
            {
              type: 'header',
              text: {
                type: 'plain_text',
                text: `${statusEmoji} Playwright Test Suite: ${statusText}`,
                emoji: true
              }
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*Environment:* \`${env}\` | *Base URL:* <${baseUrl}|${baseUrl}>`
              }
            },
            {
              type: 'section',
              fields: [
                {
                  type: 'mrkdwn',
                  text: `*Total Tests:* ${this.stats.total}`
                },
                {
                  type: 'mrkdwn',
                  text: `*Duration:* ${duration}s`
                },
                {
                  type: 'mrkdwn',
                  text: `*Passed:* 🟢 ${this.stats.passed}`
                },
                {
                  type: 'mrkdwn',
                  text: `*Failed:* 🔴 ${this.stats.failed}`
                },
                {
                  type: 'mrkdwn',
                  text: `*Flaky:* 🟡 ${this.stats.flaky}`
                },
                {
                  type: 'mrkdwn',
                  text: `*Skipped:* ⚪ ${this.stats.skipped}`
                }
              ]
            },
            {
              type: 'context',
              elements: [
                {
                  type: 'mrkdwn',
                  text: `*System Info:* Node ${process.version} on ${process.platform}${ciDetails}`
                }
              ]
            }
          ]
        }
      ]
    };

    try {
      await this.sendSlackMessage(slackPayload);
      console.log('✅ [SlackReporter] Slack notification sent successfully.');
    } catch (err) {
      console.error('❌ [SlackReporter] Failed to send Slack notification:', err.message);
    }
  }

  /**
   * Helper to send Slack message using Node.js native https module
   * @param {object} payload 
   * @returns {Promise<void>}
   */
  sendSlackMessage(payload) {
    return new Promise((resolve, reject) => {
      const payloadString = JSON.stringify(payload);
      const parsedUrl = url.parse(this.webhookUrl);
      
      const options = {
        hostname: parsedUrl.hostname,
        path: parsedUrl.path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payloadString)
        }
      };

      const req = https.request(options, (res) => {
        let responseData = '';
        res.on('data', (chunk) => {
          responseData += chunk;
        });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve();
          } else {
            reject(new Error(`Status Code: ${res.statusCode}, Response: ${responseData}`));
          }
        });
      });

      req.on('error', (err) => {
        reject(err);
      });

      req.write(payloadString);
      req.end();
    });
  }
}

module.exports = SlackReporter;
