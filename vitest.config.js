import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load test environment variables before running tests
dotenv.config({ path: path.join(__dirname, '.env.test') });

export default defineConfig({
  test: {
    // Run tests sequentially (parallel causes memory issues with 5 servers)
    // Database isolation is implemented for future parallel support
    fileParallelism: false,
    
    // Run test files one at a time
    sequence: {
      concurrent: false,
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
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        '.jest-cache/**',
        'utils/test.startup.js',
        'utils/api.client.js',
        '**/*.config.js',
      ],
    },
    
    // Reporter configuration
    reporters: ['verbose'],
    
    // Pool options - use single fork for sequential execution
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    
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
