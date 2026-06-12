# 🎭 Playwright Test Automation Framework

A state-of-the-art UI & API test automation framework for **Flipkart** built with **Playwright**, featuring configuration-driven environments, custom Slack notifications, HTML + Allure reporting, and robust CI/CD integration.

---

## 📂 Project Structure

The framework is structured using the **Page Object Model (POM)** pattern for clean code separation, stability, and reusability:

```text
├── .github/workflows/      # GitHub Actions CI/CD pipeline configuration
├── data/                   # JSON static data and test credentials
├── pages/                  # Page Object Models representing Flipkart pages
├── tests/                  # Automated test files (UI, API, Flaky suites)
├── utils/                  # Helper classes, API wrappers, and Slack reporter
├── .env.qa                 # Environment config for QA environment
├── .env.staging            # Environment config for Staging environment
├── .env.production         # Environment config for Production environment
├── .env.example            # Sample configuration file
├── playwright.config.js    # Core Playwright configuration file
└── package.json            # Project dependencies and script runner
```

---

## ⚙️ Configuration & Multiple Environments

The framework supports switching between multiple testing environments seamlessly using `.env` files managed via `cross-env` and `dotenv`.

### 1. Environment Files
- **`.env.qa`**: Variables for the QA environment.
- **`.env.staging`**: Variables for the Staging environment.
- **`.env.production`**: Variables for the Production environment.
- **`.env`** *(Optional)*: Local Developer file used for secret overrides (e.g. `SLACK_WEBHOOK_URL`).

### 2. Environment Variables
Each env file contains:
- `ENV`: The target environment name (e.g., `qa`, `staging`, `production`).
- `BASE_URL`: Base Flipkart URL or local mock application URL.
- `FAKE_STORE_API`: Base URL for public mockup product APIs.
- `DUMMY_API_BASE`: Base URL for authentication and cart APIs.
- `SLACK_WEBHOOK_URL`: Slack Incoming Webhook URL.

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: Version 20 or higher.
- **Java JRE/JDK**: (Only required to generate/serve **Allure** reports locally).

### Installation
1. Clone the repository and navigate to the project root.
2. Install the dependencies:
   ```bash
   npm install
   ```
3. Install the required Playwright browsers:
   ```bash
   npx playwright install --with-deps chromium firefox
   ```
4. Copy the environment configuration template:
   ```bash
   cp .env.example .env
   ```
   *(Configure `SLACK_WEBHOOK_URL` in `.env` if you want to receive Slack notifications locally).*

---

## 🏃 Running Tests

You can run tests against specific environments or choose to execute separate suites.

### By Environment
To run the full suite against a specific environment:
```bash
# Run against QA Environment (Default)
npm run test:qa

# Run against Staging Environment
npm run test:staging

# Run against Production Environment
npm run test:production
```

### By Suite
To run specific suites:
```bash
# Run UI Chromium tests
npm run test:ui

# Run UI Firefox tests
npm run test:ui:firefox

# Run API tests
npm run test:api

# Run Flaky test suite
npm run test:flaky

# Run tests in headed browser mode
npm run test:headed

# Run tests in debug/inspector mode
npm run test:debug
```

---

## 📊 Test Reporting

This framework is integrated with dual reporting systems to provide rich insights:

### 1. Playwright HTML Report
Generates a detailed HTML report locally showing step-by-step screenshots, video records, and trace files on failure.
- **Show Report**:
  ```bash
  npm run report
  ```

### 2. Allure Report
A premium visual reporting tool that aggregates test logs, run histories, categories, and graphs.
- **Generate Report**:
  ```bash
  npm run allure:generate
  ```
- **View Report (Starts local server)**:
  ```bash
  npm run allure:serve
  ```
- **Clean Results**:
  ```bash
  npm run allure:clean
  ```

---

## 💬 Slack Notifications

The framework includes a custom Playwright reporter (`utils/SlackReporter.js`) which automatically posts a formatted test summary report to Slack at the end of the test run.

### Setup Webhook:
1. Create a Slack app, enable **Incoming Webhooks**, and select a channel.
2. Copy the webhook URL.
3. Paste it under `SLACK_WEBHOOK_URL` in your `.env` file (locally) or add it as a secret named `SLACK_WEBHOOK_URL` in GitHub.

### Example Notification:
> 🟢 **Playwright Test Suite: PASSED**
> *Environment:* `QA` | *Base URL:* `https://www.flipkart.com`
> *Total Tests:* `15` | *Duration:* `42.5s`
> *Passed:* 🟢 `15` | *Failed:* 🔴 `0` | *Flaky:* 🟡 `0` | *Skipped:* ⚪ `0`
> *System Info:* Node v20.11.0 on win32

---

## 🔧 CI/CD Pipeline

The framework is fully optimized for GitHub Actions, Jenkins, and GitLab CI.

### GitHub Actions (`playwright.yml`)
The GitHub Actions workflow allows running tests on push, pull requests, nightly schedules, or manual trigger (`workflow_dispatch`).
- **Target Environment Input**: Select `qa`, `staging`, or `production` when running manually.
- **Target Suite Input**: Select running `all`, `ui`, `api`, or `flaky` tests.
- **Artifact Uploads**: Automatically uploads consolidated Allure reports and Playwright HTML reports.
- **Slack Secrets**: Passes GITHUB secrets to the custom Slack reporter dynamically.
