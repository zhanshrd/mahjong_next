import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: [
      'tests/unit/**/*.test.js',
      'tests/integration/**/*.test.js',
      'tests/regression/**/*.test.js',
      'test/performance/**/*.test.js'
    ],
    exclude: ['test/core.test.js'],
    testTimeout: 120000, // 2 minutes for performance tests
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      threshold: {
        global: {
          statements: 80,
          branches: 70,
          functions: 80,
          lines: 80
        }
      },
      include: ['src/**/*.js'],
      exclude: ['src/server.js']
    }
  }
})
