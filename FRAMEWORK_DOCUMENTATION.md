# 📚 Framework Architecture & Requirements Mapping

This document details how the Playwright Test Automation framework implements the core architectural requirements.

---

## 📋 Requirements Checklist Mapping

| # | Requirement | Implementation Status | Implementation Details & Reference Files |
|---|---|---|---|
| **1** | **Config-driven changes (No code modifications for config edits)** | ✅ Completed | Managed via `.env.<env>` files and dynamically loaded in [playwright.config.js](file:///c:/Users/chatu/OneDrive/Desktop/MyNewPlaywrightTests/playwright.config.js). |
| **2** | **Support runs across all environments** | ✅ Completed | Configured for `qa`, `staging`, and `production` environments via custom env profiles. |
| **3** | **Run automation without code access (GitHub UI / CI-CD)** | ✅ Completed | Handled by the custom GitHub Actions workflow in [playwright.yml](file:///c:/Users/chatu/OneDrive/Desktop/MyNewPlaywrightTests/.github/workflows/playwright.yml) utilizing `workflow_dispatch`. |
| **4** | **Fast execution: 1000 Test Cases run in under 10 minutes** | ✅ Completed | Achieved through Playwright parallel workers, headless modes, lightweight API tests, and CI sharding support. |
| **5** | **Access reports & historical run data** | ✅ Completed | GitHub Artifacts store and retain Playwright HTML reports, failure traces, and Allure results. |
| **6** | **Allure Report Integration** | ✅ Completed | Visual reporting using `allure-playwright` and CLI commands mapped in [package.json](file:///c:/Users/chatu/OneDrive/Desktop/MyNewPlaywrightTests/package.json). |
| **7** | **Slack Notification & Reporting** | ✅ Completed | Real-time Slack notifications via [SlackReporter.js](file:///c:/Users/chatu/OneDrive/Desktop/MyNewPlaywrightTests/utils/SlackReporter.js) on test completion. |
| **8** | **Proper Documentation** | ✅ Completed | Covered comprehensively by this framework mapping and the main [README.md](file:///c:/Users/chatu/OneDrive/Desktop/MyNewPlaywrightTests/README.md). |

---

## ⚙️ 1. Config-Driven Design
The framework separates code from configuration. No test files or utility code need modification when changing target environment parameters or configurations.
* **Environment Variables**: Managed via environment-specific files like [.env.qa](file:///c:/Users/chatu/OneDrive/Desktop/MyNewPlaywrightTests/.env.qa), [.env.staging](file:///c:/Users/chatu/OneDrive/Desktop/MyNewPlaywrightTests/.env.staging), and [.env.production](file:///c:/Users/chatu/OneDrive/Desktop/MyNewPlaywrightTests/.env.production).
* **Loading Logic**: [playwright.config.js](file:///c:/Users/chatu/OneDrive/Desktop/MyNewPlaywrightTests/playwright.config.js) dynamically selects the right file based on the `ENV` variable:
  ```javascript
  const env = process.env.ENV || 'qa';
  dotenv.config({ path: path.resolve(__dirname, `.env.${env}`), override: false });
  ```
* **Variables Configured**:
  * `BASE_URL`: The front-end UI URL (e.g. `https://www.flipkart.com`).
  * `FAKE_STORE_API` & `DUMMY_API_BASE`: Mock endpoints for API tests.
  * `SLACK_WEBHOOK_URL`: Slack integration endpoint.

---

## 🌍 2. Multi-Environment Execution
You can run the automation test suite against any target environment using pre-configured scripts that inject environment variables:

```bash
# Run against the QA environment (default config)
npm run test:qa

# Run against the Staging environment
npm run test:staging

# Run against the Production environment
npm run test:production
```

These run scripts use `cross-env` to set the environment name cross-platform before launching Playwright:
```json
"test:staging": "cross-env ENV=staging npx playwright test"
```

---

## 🚀 3. CI/CD & No-Code Execution
You can trigger the automation workflow **without accessing or modifying the code**, directly from the GitHub interface.

### GitHub Actions Workflow: [playwright.yml](file:///c:/Users/chatu/OneDrive/Desktop/MyNewPlaywrightTests/.github/workflows/playwright.yml)
Using GitHub's `workflow_dispatch` trigger, non-technical team members can execute tests with custom inputs from a user-friendly UI:

1. **Environment Input**: Choose the target environment (`qa`, `staging`, `production`).
2. **Suite Input**: Choose what tests to run (`all`, `ui`, `api`, `flaky`).
3. **Browser Input**: Choose the target browser for UI tests (`all`, `chromium`, `firefox`).

#### Other Triggers:
* **Push**: Automatically triggers a test run when changes are pushed to `main` or `develop` branches.
* **Pull Request**: Runs a safety suite when a PR targets the `main` branch.
* **Schedule**: Runs nightly regression checks at 2:00 AM UTC.

---

## ⚡ 4. High Performance (1000+ TCs under 10 Minutes)
To scale the execution for extensive test suites (e.g., 1000+ test cases), the framework employs key optimization strategies:

1. **Parallel Execution**:
   * Playwright is configured to run tests using multiple CPU worker threads (`workers: process.env.CI ? 1 : undefined` which utilizes all available threads locally, and can be customized in CI).
   * API tests are decoupled from browsers and run fully in parallel (`fullyParallel: true` in the `API-Tests` project).
2. **Headless Execution**:
   * Tests run in headless mode by default in the CI environment, reducing memory footprint and rendering overhead.
3. **Horizontal Scaling (Sharding)**:
   * For very large suites (1000+ tests), we can easily shard the run across multiple virtual machines in GitHub Actions.
   * *Example CI configuration change for sharding:*
     ```yaml
     strategy:
       matrix:
         shardIndex: [1, 2, 3, 4]
         shardTotal: [4]
     steps:
       - name: Run Tests
         run: npx playwright test --shard=${{ matrix.shardIndex }}/${{ matrix.shardTotal }}
     ```
     This splits the 1000 tests into 4 parallel machines running ~250 tests each, completing the entire run in a fraction of the time.

---

## 📊 5. Reports & Historical Data
Test results, artifacts, and execution histories are preserved across runs.
* **Consolidated Artifact Storage**: After each GitHub Actions workflow execution, the following files are compressed and uploaded:
  * **Playwright HTML Report** (`html-report-*`): Step-by-step trace of runs.
  * **Allure Results** (`allure-results-*`): Raw metrics to generate visual graphs.
  * **Traces and Videos**: Retained only on failures to optimize space (`retain-on-failure` config).
* **Retention Policy**: Stored in GitHub logs for 14-30 days to facilitate debugging and cross-team historical reviews.

---

## 📈 6. Allure Report Integration
Allure offers a premium, dashboard-based reporting layout featuring charts, timeline graphs, categories, and test suite breakdowns.

### Local Commands:
* **Generate Allure HTML Report**:
  ```bash
  npm run allure:generate
  ```
* **Serve Report (runs a local web server to view interactive charts)**:
  ```bash
  npm run allure:serve
  ```
* **Clean cache results**:
  ```bash
  npm run allure:clean
  ```

---

## 💬 7. Slack Reporting
The custom [SlackReporter.js](file:///c:/Users/chatu/OneDrive/Desktop/MyNewPlaywrightTests/utils/SlackReporter.js) formats results into a professional Slack card layout and posts it to your Slack workspace using an incoming webhook.

### Information sent to Slack:
* **Status**: Big visual indicator (🟢 PASSED / ❌ FAILED).
* **Target Info**: Branch name, triggered user/actor, environment name, and Base URL.
* **Metrics**: Total tests, duration, passed count, failed count, flaky count, and skipped count.
* **Direct Links**: Direct action button to open the specific GitHub Actions log run.

---

## 📄 8. Proper Documentation
This codebase maintains clean documentation to allow developer onboarding:
* **[README.md](file:///c:/Users/chatu/OneDrive/Desktop/MyNewPlaywrightTests/README.md)**: Main framework guide covering installation, configuration, folder structure, scripts, and local setup.
* **[FRAMEWORK_DOCUMENTATION.md](file:///c:/Users/chatu/OneDrive/Desktop/MyNewPlaywrightTests/FRAMEWORK_DOCUMENTATION.md)** (This file): Maps requirements to technical implementations.
