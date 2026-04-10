import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    exclude: ['test/core.test.js']
  }
})
