// Vitest config: coverage provider + exclude test files and dist/
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.js', 'scripts/**/*.js'],
      exclude: ['**/*.test.js', 'dist/**'],
      reporter: ['text'],
      // Fail-on-drop floor: `pnpm test:coverage` exits non-zero below these.
      // Set a few points under the measured totals so noise doesn't trip it but
      // a real regression does — raise it as coverage grows, never lower it to pass.
      thresholds: { lines: 90, functions: 90, statements: 90, branches: 80 },
    },
  },
});
