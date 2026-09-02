// Vitest config: coverage provider + exclude test files and dist/
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.js', 'scripts/**/*.js'],
      exclude: ['**/*.test.js', 'dist/**'],
      reporter: ['text'],
    },
  },
});
