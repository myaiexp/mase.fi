// @vitest-environment jsdom
// Unit tests for pinned.js's renderHeroLine — the mobile hero-line quick-link
// row. See pinned.test.js for the shared cardHead/home coverage and jsdom
// harness note.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHeroLine } from './pinned.js';

beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }));
  for (const id of ['pinned', 'hero-line']) {
    const el = document.createElement('div');
    el.id = id;
    document.body.appendChild(el);
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

const heroEl = () => document.getElementById('hero-line');

describe('renderHeroLine', () => {
  it('renders static activity/github links for home', () => {
    renderHeroLine('home', { projects: [] });
    const html = heroEl().innerHTML;
    expect(html).toContain('href="#/activity"');
    expect(html).toContain('href="https://github.com/myaiexp"');
  });

  it('renders the first project link plus status for a matched project', () => {
    const data = {
      projects: [{ channel: 'explorer', heat: 0.8, links: [{ href: 'https://mase.fi/explorer', label: 'mase.fi' }] }],
      demos: [],
    };
    renderHeroLine('explorer', data);
    const html = heroEl().innerHTML;
    expect(html).toContain('href="https://mase.fi/explorer"');
    expect(html).toContain('>mase.fi</a>');
    expect(html).toContain('shipping'); // heat > 0.6
  });

  it('renders only the status when a matched project has no links', () => {
    renderHeroLine('explorer', { projects: [{ channel: 'explorer', heat: 0.4, links: [] }], demos: [] });
    const html = heroEl().innerHTML;
    expect(html).not.toContain('<a');
    expect(html).toContain('steady'); // heat > 0.3
  });

  it('includes a demo link when the channel has a published demo', () => {
    const data = { projects: [{ channel: 'explorer', heat: 0.4, links: [] }], demos: ['explorer'] };
    renderHeroLine('explorer', data);
    const a = heroEl().querySelector('.demo-link');
    expect(a).not.toBeNull();
    expect(a.getAttribute('href')).toBe('/demos/explorer/');
  });

  it('escapes a malicious project link in the hero line', () => {
    const data = {
      projects: [{ channel: 'explorer', heat: 0.8, links: [{ href: '"><script>alert(1)</script>', label: '<b>x</b>' }] }],
      demos: [],
    };
    renderHeroLine('explorer', data);
    const a = heroEl().querySelector('a');
    expect(heroEl().querySelector('script')).toBeNull();
    expect(heroEl().querySelector('b')).toBeNull();
    expect(a.getAttribute('href')).toBe('"><script>alert(1)</script>');
    expect(a.textContent).toBe('<b>x</b>');
  });

  // Exact markup, so the separators and single spaces between parts are pinned.
  it.each([
    {
      name: 'home',
      id: 'home',
      data: { projects: [] },
      html: '<span class="arr">→</span> <a href="#/activity">activity</a> ' +
        '<span class="sep">·</span> <a href="https://github.com/myaiexp">github</a>',
    },
    {
      name: 'demo + first link + status',
      id: 'explorer',
      data: {
        projects: [{ channel: 'explorer', heat: 0.8, links: [{ href: 'https://x.test/', label: 'site' }, { href: 'https://y.test/', label: 'two' }] }],
        demos: ['explorer'],
      },
      html: '<span class="arr">→</span> <a class="demo-link" href="/demos/explorer/">try demo</a> ' +
        '<span class="sep">·</span> <a href="https://x.test/">site</a> ' +
        '<span class="sep">·</span> <span class="status">shipping</span>',
    },
    {
      name: 'demo + status, no links',
      id: 'explorer',
      data: { projects: [{ channel: 'explorer', heat: 0.1, links: [] }], demos: ['explorer'] },
      html: '<span class="arr">→</span> <a class="demo-link" href="/demos/explorer/">try demo</a> ' +
        '<span class="sep">·</span> <span class="status">idle</span>',
    },
  ])('renders the exact hero line for $name', ({ id, data, html }) => {
    renderHeroLine(id, data);
    expect(heroEl().innerHTML).toBe(html);
  });

  it('clears the hero line for activity and unmatched channels', () => {
    heroEl().textContent = 'stale';
    renderHeroLine('activity', { projects: [] });
    expect(heroEl().innerHTML).toBe('');

    heroEl().textContent = 'stale';
    renderHeroLine('nope', { projects: [] });
    expect(heroEl().innerHTML).toBe('');
  });
});
