/**
 * Test Run Metadata Models
 *
 * Persists one document per test run, plus one per individual test case, so
 * runs can be compared over time: which suites are slowest, which tests are
 * flaky, when a failure first appeared.
 *
 * These live in the same test database the suites use, in their own
 * collections, so they are never touched by the suites' own cleanup.
 */

import mongoose from 'mongoose';

const testCaseSchema = new mongoose.Schema({
    runId: {
        type: String,
        required: true,
        index: true
    },
    app: {
        type: String,
        required: true,
        index: true
    },
    // Path of the test file, relative to the tests package
    module: {
        type: String,
        required: true,
        index: true
    },
    // Full dotted name including parent describes
    fullName: {
        type: String,
        required: true
    },
    name: {
        type: String,
        required: true
    },
    state: {
        type: String,
        enum: ['passed', 'failed', 'skipped', 'pending'],
        required: true,
        index: true
    },
    durationMs: {
        type: Number
    },
    // Populated only for failures
    errorMessage: {
        type: String
    },
    errorStack: {
        type: String
    },
    startedAt: {
        type: Date
    }
}, {
    timestamps: true
});

testCaseSchema.index({app: 1, fullName: 1, createdAt: -1});
testCaseSchema.index({runId: 1, state: 1});

const testRunSchema = new mongoose.Schema({
    runId: {
        type: String,
        required: true,
        unique: true
    },
    app: {
        type: String,
        required: true,
        index: true
    },
    startedAt: {
        type: Date,
        required: true
    },
    finishedAt: {
        type: Date
    },
    durationMs: {
        type: Number
    },
    // 'passed' when every test passed and no unhandled errors surfaced
    status: {
        type: String,
        enum: ['passed', 'failed', 'interrupted'],
        required: true,
        index: true
    },
    totals: {
        files: {type: Number, default: 0},
        tests: {type: Number, default: 0},
        passed: {type: Number, default: 0},
        failed: {type: Number, default: 0},
        skipped: {type: Number, default: 0}
    },
    // Slowest test cases in this run, for spotting regressions
    slowest: [{
        fullName: String,
        module: String,
        durationMs: Number
    }],
    // Per-file breakdown
    modules: [{
        module: String,
        tests: Number,
        passed: Number,
        failed: Number,
        skipped: Number,
        durationMs: Number
    }],
    failures: [{
        fullName: String,
        module: String,
        errorMessage: String
    }],
    unhandledErrors: [{
        message: String,
        stack: String
    }],
    environment: {
        node: String,
        vitest: String,
        platform: String,
        nodeEnv: String,
        dbName: String,
        dbPerFile: Boolean,
        fileParallelism: Boolean
    }
}, {
    timestamps: true
});

testRunSchema.index({app: 1, createdAt: -1});

const TestRun = mongoose.models.TestRun || mongoose.model('TestRun', testRunSchema, 'test-runs');
const TestCaseResult = mongoose.models.TestCaseResult || mongoose.model('TestCaseResult', testCaseSchema, 'test-case-results');

export {TestRun, TestCaseResult};
