// Channel name as a second match key when it differs from the slug
import { describe, it, expect } from 'vitest';
import { buildSlugToChannel, normalizeEntry } from './data-normalize.js';

const iseps = [{ name: 'ISEPS Solver', channel: 'iseps', slug: 'iseps-solver' }];

describe('buildSlugToChannel channel alias', () => {
  it('routes a feature stamped with the channel name onto that channel', () => {
    const map = buildSlugToChannel(iseps);
    const row = normalizeEntry(
      { category: 'feature', project: 'iseps', date: '2026-01-01', text: 'x' },
      map,
    );
    expect(row).toMatchObject({
      channel: 'iseps',
      projectChannel: 'iseps',
      projectSlug: 'iseps',
    });
  });

  it('still routes a feature stamped with the slug', () => {
    const map = buildSlugToChannel(iseps);
    const row = normalizeEntry(
      { category: 'feature', project: 'ISEPS-solver', date: '2026-01-01', text: 'x' },
      map,
    );
    expect(row?.channel).toBe('iseps');
    expect(row?.projectSlug).toBe('iseps-solver');
  });

  it('routes a daily stamped with the channel name to the project, not #home', () => {
    const map = buildSlugToChannel(iseps);
    const row = normalizeEntry(
      { category: 'daily', project: 'iseps', date: '2026-01-01', summary: 'shipped' },
      map,
    );
    expect(row?.channel).toBe('iseps');
  });

  it('does not let a channel alias steal another project\'s slug', () => {
    const map = buildSlugToChannel([
      { channel: 'porssi', slug: 'spot-price' },
      { channel: 'other', slug: 'porssi' },
    ]);
    expect(map.get('porssi')).toBe('other');
    expect(map.get('spot-price')).toBe('porssi');
    const row = normalizeEntry(
      { category: 'feature', project: 'porssi', date: '2026-01-01', text: 'x' },
      map,
    );
    expect(row?.channel).toBe('other');
  });

  // Entry projects are free text: a plain-object map would resolve these
  // through Object.prototype and route the row to a function.
  it.each(['constructor', '__proto__', 'toString', 'hasOwnProperty'])(
    'does not resolve an inherited key "%s" as a project', (project) => {
      const map = buildSlugToChannel(iseps);
      expect(normalizeEntry({ category: 'feature', project, date: '2026-01-01', text: 'x' }, map)).toBeNull();
      const daily = normalizeEntry({ category: 'daily', project, date: '2026-01-01', summary: 'x' }, map);
      expect(daily?.channel).toBe('home');
      expect(daily?.projectChannel).toBeUndefined();
    });
});
