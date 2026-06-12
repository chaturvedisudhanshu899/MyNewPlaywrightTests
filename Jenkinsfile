pipeline {
    agent any

    environment {
        NODE_VERSION = '20'
        REPORT_DIR   = 'playwright-report'
        RESULTS_DIR  = 'test-results'
    }

    parameters {
        choice(
            name: 'SUITE',
            choices: ['all', 'ui', 'api', 'flaky'],
            description: 'Select which test suite to run'
        )
        booleanParam(
            name: 'HEADED',
            defaultValue: false,
            description: 'Run in headed mode (requires display)'
        )
    }

    triggers {
        cron('H 2 * * *')   // nightly at ~2 AM
    }

    stages {

        stage('Checkout') {
            steps {
                checkout scm
                echo "Running suite: ${params.SUITE}"
            }
        }

        stage('Setup') {
            steps {
                bat 'node --version'
                bat 'npm ci'
                bat 'npx playwright install chromium firefox --with-deps'
            }
        }

        stage('API Tests') {
            when {
                anyOf {
                    expression { params.SUITE == 'api' }
                    expression { params.SUITE == 'all' }
                }
            }
            steps {
                bat 'npx playwright test tests/flipkart-api.spec.js --project=API-Tests --reporter=html,list'
            }
            post {
                always {
                    publishHTML([
                        allowMissing: true,
                        alwaysLinkToLastBuild: true,
                        keepAll: true,
                        reportDir: "${REPORT_DIR}",
                        reportFiles: 'index.html',
                        reportName: 'API Test Report'
                    ])
                }
            }
        }

        stage('UI Tests — Chromium') {
            when {
                anyOf {
                    expression { params.SUITE == 'ui' }
                    expression { params.SUITE == 'all' }
                }
            }
            steps {
                script {
                    def headedFlag = params.HEADED ? '--headed' : ''
                    bat "npx playwright test tests/flipkart-ui.spec.js --project=UI-Chromium ${headedFlag} --reporter=html,list"
                }
            }
            post {
                always {
                    publishHTML([
                        allowMissing: true,
                        alwaysLinkToLastBuild: true,
                        keepAll: true,
                        reportDir: "${REPORT_DIR}",
                        reportFiles: 'index.html',
                        reportName: 'UI Chromium Report'
                    ])
                    archiveArtifacts artifacts: "${RESULTS_DIR}/**/*", allowEmptyArchive: true
                }
            }
        }

        stage('UI Tests — Firefox') {
            when {
                expression { params.SUITE == 'all' }
            }
            steps {
                bat 'npx playwright test tests/flipkart-ui.spec.js --project=UI-Firefox --reporter=html,list'
            }
            post {
                always {
                    publishHTML([
                        allowMissing: true,
                        alwaysLinkToLastBuild: true,
                        keepAll: true,
                        reportDir: "${REPORT_DIR}",
                        reportFiles: 'index.html',
                        reportName: 'UI Firefox Report'
                    ])
                }
            }
        }

        stage('Flaky Tests — Run 1') {
            when {
                anyOf {
                    expression { params.SUITE == 'flaky' }
                    expression { params.SUITE == 'all' }
                }
            }
            steps {
                // continue-on-error equivalent in Jenkins
                script {
                    try {
                        bat """
                            npx playwright test tests/flipkart-flaky.spec.js ^
                              --project=Flaky-Suite ^
                              --retries=2 ^
                              --reporter=html,list ^
                              --output=${RESULTS_DIR}\\flaky-run-1
                        """
                    } catch (err) {
                        echo "Flaky Run 1 had failures (expected): ${err}"
                        currentBuild.result = 'UNSTABLE'
                    }
                }
            }
            post {
                always {
                    archiveArtifacts artifacts: "${RESULTS_DIR}/flaky-run-1/**", allowEmptyArchive: true
                    publishHTML([
                        allowMissing: true,
                        alwaysLinkToLastBuild: true,
                        keepAll: true,
                        reportDir: "${REPORT_DIR}",
                        reportFiles: 'index.html',
                        reportName: 'Flaky Suite — Run 1'
                    ])
                }
            }
        }

        stage('Flaky Tests — Run 2') {
            when {
                anyOf {
                    expression { params.SUITE == 'flaky' }
                    expression { params.SUITE == 'all' }
                }
            }
            steps {
                script {
                    try {
                        bat """
                            npx playwright test tests/flipkart-flaky.spec.js ^
                              --project=Flaky-Suite ^
                              --retries=2 ^
                              --reporter=html,list ^
                              --output=${RESULTS_DIR}\\flaky-run-2
                        """
                    } catch (err) {
                        echo "Flaky Run 2 had failures (expected): ${err}"
                        currentBuild.result = 'UNSTABLE'
                    }
                }
            }
            post {
                always {
                    archiveArtifacts artifacts: "${RESULTS_DIR}/flaky-run-2/**", allowEmptyArchive: true
                    publishHTML([
                        allowMissing: true,
                        alwaysLinkToLastBuild: true,
                        keepAll: true,
                        reportDir: "${REPORT_DIR}",
                        reportFiles: 'index.html',
                        reportName: 'Flaky Suite — Run 2'
                    ])
                }
            }
        }
    }

    post {
        always {
            echo '=== Test execution complete ==='
            archiveArtifacts artifacts: "${REPORT_DIR}/**", allowEmptyArchive: true
        }
        success {
            echo '✅ All stable tests PASSED'
        }
        unstable {
            echo '⚠️  Some tests were flaky — check Flaky Suite reports'
        }
        failure {
            echo '❌ Build FAILED — check logs and screenshots'
        }
    }
}
