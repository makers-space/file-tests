import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import MongoTestRunReporter from './utils/mongo.reporter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load test environment variables before running tests
dotenv.config({ path: path.join(__dirname, '.env.test') });

// Single source of truth for how this run executes. TEST_PARALLEL drives both
// the vitest pool settings below and the per-file database naming in
// utils/test.startup.js, so the two can never drift out of sync.
const runParallel = process.env.TEST_PARALLEL === 'true';

export default defineConfig({
  test: {
    // Parallel runs are faster but boot one server per file, which is memory
    // hungry; they also require a database per file (see TEST_PARALLEL in
    // .env.test) because suites clear all logs and flush the whole cache.
    fileParallelism: runParallel,
    
    sequence: {
      concurrent: runParallel,

      // Shuffle FILE order every run to surface cross-file dependencies - one
      // suite passing only because another left data behind. This is the real
      // risk now that files share a database.
      //
      // Test order within a file is deliberately NOT shuffled: several suites
      // are ordered narratives against the database (send a connection request,
      // accept it, then remove it; enrol 2FA, then verify it). Shuffling those
      // asserts nothing useful - it just breaks the story.
      shuffle: {
        files: true,
        tests: false,
      },
    },
    
    // Test environment
    environment: 'node',
    
    // Global test timeout (60 seconds for integration tests)
    testTimeout: 60000,
    
    // Setup files to run before each test file
    setupFiles: [],
    
    // Include patterns
    include: ['server/**/*.test.js'],
    
    // Exclude patterns
    exclude: [
      'node_modules/**',
      '.jest-cache/**',
      'dist/**',
      'build/**',
    ],
    
    // Globals (similar to Jest)
    globals: true,
    
    // Coverage configuration
    coverage: {
      provider: 'v8',

      // Report untested files too, not just ones that happened to load
      all: true,

      // Code under test lives outside this package
      root: path.resolve(__dirname, '..'),
      include: ['file-server/**/*.js'],
      allowExternal: true,

      reporter: ['text-summary', 'text', 'html', 'lcov', 'json-summary'],
      reportsDirectory: path.resolve(__dirname, 'coverage'),

      exclude: [
        '**/node_modules/**',
        '**/coverage/**',
        '**/*.config.js',
        // Entry point: exercised by booting the server, not by unit assertions.
        'file-server/index.js',
        // Handlebars email templates, not JavaScript.
        'file-server/templates/**',
      ],
    },
    
    // Reporter configuration. MongoTestRunReporter records run metadata to the
    // test database; it is a no-op unless TEST_RUN_METADATA_ENABLED=true.
    reporters: ['verbose', new MongoTestRunReporter()],
    // Vitest 4 removed test.poolOptions; pool settings are top-level now.
    // fileParallelism:false already forces maxWorkers to 1, so no separate
    // single-fork switch is needed.
    pool: 'forks',
    
    // Retry failed tests
    retry: 0,
    
    // Bail after first failure (set to true for CI/CD)
    bail: 0,
  },
  
  resolve: {
    alias: {
      '@server': path.resolve(__dirname, '../server'),
      '@tests': path.resolve(__dirname, '.'),
    },
  },
});
