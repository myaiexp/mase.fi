// Tests that every writer takes the store path from updates-write.sh's UPDATES_FILE_DEFAULT.
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SCRIPTS_DIR } from './test-helpers.js';

// The store path has one owner (idea #2487): a writer that hardcodes it drifts the
// moment the store moves, and writes to a file nginx no longer serves.
describe('UPDATES_FILE_DEFAULT — the one store path', () => {
  it('points at the mase-owned store dir outside the webroot', () => {
    const r = spawnSync('bash', ['-c', `source "${join(SCRIPTS_DIR, 'updates-write.sh')}"; echo "$UPDATES_FILE_DEFAULT"`], { encoding: 'utf8' });
    expect(r.stdout.trim()).toBe('/var/lib/mase-fi/updates.json');
  });

  it.each(['mase-fi-update', 'mase-fi-daily-summary', 'mase-fi-projects', 'mase-fi-compact-updates'])(
    '%s defaults UPDATES_FILE to UPDATES_FILE_DEFAULT, not a literal path',
    (name) => {
      const src = readFileSync(join(SCRIPTS_DIR, name), 'utf8');
      expect(src).toMatch(/\$\{UPDATES_FILE:-\$UPDATES_FILE_DEFAULT\}/);
      expect(src).not.toMatch(/\/var\/(www|lib)\/[^\s"]*updates\.json/);
    },
  );
});
