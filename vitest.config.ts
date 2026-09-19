import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // The multi-season simulations run 5–15 s on the CI runner.
    testTimeout: 60_000,
    include: ['packages/*/test/**/*.test.ts', 'apps/*/test/**/*.test.ts'],
  },
})
