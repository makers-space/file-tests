/**
 * MongoDB Test Run Reporter
 *
 * A Vitest reporter that records metadata for every test run into the test
 * database: totals, per-file breakdown, failures, slowest cases, and one
 * document per individual test case.
 *
 * Registered in vitest.config.js alongside the console reporter. It opens its
 * own Mongoose connection rather than reusing the suites', because the suites
 * open and close their connections around each file while the reporter needs
 * to stay alive for the whole run.
 *
 * Reporting must never fail a test run: every database interaction is guarded,
 * and problems are warned about on stderr instead of thrown.
 */

import path from 'node:path';
import process from 'node:process';
import {randomUUID} from 'node:crypto';
import mongoose from 'mongoose';

/**
 * Map a Vitest test state onto the states stored in the database.
 * Vitest reports not-yet-run cases as 'pending'.
 */
const toStoredState = (state) => {
    if (state === 'passed' || state === 'failed' || state === 'skipped') {
        return state;
    }
    return 'pending';
};

class MongoTestRunReporter {
    constructor() {
        this.runId = randomUUID();
        this.startedAt = null;
        this.connection = null;
        this.models = null;
    }

    /**
     * Environment is read on demand, never at module scope: ES imports are
     * hoisted, so this module is evaluated before vitest.config.js calls
     * dotenv.config() and process.env is still empty at that point.
     */
    get enabled() {
        return process.env.TEST_RUN_METADATA_ENABLED === 'true';
    }

    get appName() {
        return process.env.APP_NAME;
    }

    get mongoUri() {
        return process.env.MONGODB_URI;
    }

    /**
     * Open a dedicated connection and bind the models to it.
     */
    async connect() {
        const {TestRun, TestCaseResult} = await import('./test.run.model.js');

        // createConnection keeps this isolated from the suites' default
        // connection, which is opened and torn down per test file.
        this.connection = await mongoose.createConnection(this.mongoUri).asPromise();
        this.models = {
            TestRun: this.connection.model('TestRun', TestRun.schema, 'test-runs'),
            TestCaseResult: this.connection.model('TestCaseResult', TestCaseResult.schema, 'test-case-results')
        };
    }

    onTestRunStart() {
        if (!this.enabled) {
            return;
        }
        this.startedAt = new Date();
    }

    /**
     * Walk a module's test cases, collecting per-case records and tallies.
     */
    collectModule(testModule) {
        const cases = [];
        const tally = {tests: 0, passed: 0, failed: 0, skipped: 0};

        for (const testCase of testModule.children.allTests()) {
            const result = testCase.result();
            const diagnostic = testCase.diagnostic();
            const state = toStoredState(result.state);

            tally.tests += 1;
            if (state === 'passed') {
                tally.passed += 1;
            } else if (state === 'failed') {
                tally.failed += 1;
            } else if (state === 'skipped') {
                tally.skipped += 1;
            }

            const [firstError] = result.errors ?? [];

            cases.push({
                runId: this.runId,
                app: this.appName,
                module: path.relative(process.cwd(), testModule.moduleId).replaceAll('\\', '/'),
                fullName: testCase.fullName,
                name: testCase.name,
                state,
                durationMs: diagnostic?.duration,
                errorMessage: firstError?.message,
                errorStack: firstError?.stack,
                startedAt: diagnostic?.startTime ? new Date(diagnostic.startTime) : undefined
            });
        }

        return {cases, tally};
    }

    async onTestRunEnd(testModules, unhandledErrors, reason) {
        if (!this.enabled) {
            return;
        }

        try {
            await this.connect();

            const allCases = [];
            const modules = [];
            const totals = {files: 0, tests: 0, passed: 0, failed: 0, skipped: 0};

            for (const testModule of testModules) {
                const {cases, tally} = this.collectModule(testModule);
                const moduleName = path.relative(process.cwd(), testModule.moduleId).replaceAll('\\', '/');

                allCases.push(...cases);
                totals.files += 1;
                totals.tests += tally.tests;
                totals.passed += tally.passed;
                totals.failed += tally.failed;
                totals.skipped += tally.skipped;

                modules.push({
                    module: moduleName,
                    ...tally,
                    durationMs: cases.reduce((sum, testCase) => sum + (testCase.durationMs ?? 0), 0)
                });
            }

            const finishedAt = new Date();
            const failures = allCases
                .filter(testCase => testCase.state === 'failed')
                .map(({fullName, module, errorMessage}) => ({fullName, module, errorMessage}));

            const slowest = [...allCases]
                .filter(testCase => typeof testCase.durationMs === 'number')
                .sort((a, b) => b.durationMs - a.durationMs)
                .slice(0, 10)
                .map(({fullName, module, durationMs}) => ({fullName, module, durationMs}));

            const status = reason === 'interrupted'
                ? 'interrupted'
                : (totals.failed > 0 || unhandledErrors.length > 0 ? 'failed' : 'passed');

            await this.models.TestRun.create({
                runId: this.runId,
                app: this.appName,
                startedAt: this.startedAt,
                finishedAt,
                durationMs: finishedAt - this.startedAt,
                status,
                totals,
                slowest,
                modules,
                failures,
                unhandledErrors: unhandledErrors.map(error => ({
                    message: error.message,
                    stack: error.stack
                })),
                environment: {
                    node: process.version,
                    vitest: await this.vitestVersion(),
                    platform: process.platform,
                    nodeEnv: process.env.NODE_ENV,
                    dbName: this.mongoUri.split('/').pop().split('?')[0],
                    dbPerFile: process.env.TEST_PARALLEL === 'true',
                    fileParallelism: process.env.TEST_PARALLEL === 'true'
                }
            });

            if (allCases.length > 0) {
                await this.models.TestCaseResult.insertMany(allCases, {ordered: false});
            }

            process.stderr.write(
                `\n  test run ${this.runId} recorded: ${totals.passed}/${totals.tests} passed, status ${status}\n`
            );
        } catch (error) {
            // Never let reporting break a test run.
            process.stderr.write(`\n  [test-run-metadata] not recorded: ${error.message}\n`);
        } finally {
            if (this.connection) {
                await this.connection.close().catch(() => {});
            }
        }
    }

    async vitestVersion() {
        try {
            const {default: pkg} = await import('vitest/package.json', {with: {type: 'json'}});
            return pkg.version;
        } catch {
            return undefined;
        }
    }
}

export default MongoTestRunReporter;
