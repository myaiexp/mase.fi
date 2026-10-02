// Vitest config: coverage provider + exclude test files and dist/
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      // src/ only: the pipeline under scripts/ is bash, invisible to v8 — its golden-file
      // suites run under `pnpm test` but nothing here can measure them. Test harnesses
      // are excluded too: every suite that imports one would count it as covered.
      include: ['src/**/*.js'],
      exclude: ['**/*.test.js', '**/*test-helpers.js', 'dist/**'],
      reporter: ['text'],
      // Fail-on-drop floor: `pnpm test:coverage` exits non-zero below these.
      // Set a few points under the measured totals so noise doesn't trip it but
      // a real regression does — raise it as coverage grows, never lower it to pass.
      // The global floor alone lets one file rot while the aggregate holds, so the
      // redirect/link-safety and data-adapter modules carry their own floors. One key
      // per file: a glob key is checked against its matches' aggregate (vitest ignores
      // perFile inside a glob entry), which would reopen the same hole.
      thresholds: {
        lines: 93, functions: 93, statements: 92, branches: 83,
        // Off-origin rejection and URL-scheme filtering: every branch is a safety rule.
        'src/project-link.js': { lines: 100, functions: 100, statements: 100, branches: 100 },
        'src/same-origin.js': { lines: 100, functions: 100, statements: 100, branches: 100 },
        // The 404 matching ladder and its redirect/probe driver.
        'src/notfound.js': { lines: 96, functions: 100, statements: 93, branches: 86 },
        'src/notfound-page.js': { lines: 95, functions: 100, statements: 94, branches: 86 },
        // Normalization, channel routing and the stats rules.
        'src/data.js': { lines: 98, functions: 100, statements: 97, branches: 87 },
        'src/data-normalize.js': { lines: 98, functions: 100, statements: 98, branches: 85 },
        'src/data-archive.js': { lines: 98, functions: 100, statements: 98, branches: 85 },
      },
    },
  },
});
