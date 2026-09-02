// @vitest-environment jsdom
// Unit tests for pinned.js — the per-channel hero card / pinned panel renderers.
// pinned.js builds its markup with string concatenation + template literals and leans
// entirely on escapeHtml() to neutralize user-visible strings (project names,
// descriptions, links, the last-push project). These tests pin the generated markup
// and, critically, prove that HTML-special characters in user data are ESCAPED — never
// parsed into live DOM (no injected <script>/<b>, no attribute breakout).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderPinned, renderHeroLine, cardHead } from './pinned.js';
import * as beam from './beam.js';

// renderPinned('home', …) calls mountBeam, which probes matchMedia. jsdom doesn't
// implement matchMedia, and we don't want the animation/pretext path here — so stub it
// to report reduced-motion. mountBeam then just sets textContent and returns null.
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

const pinnedEl = () => document.getElementById('pinned');
const heroEl = () => document.getElementById('hero-line');

describe('cardHead', () => {
  it('escapes chip keys, values, and the right-hand slot (no live markup)', () => {
    const html = cardHead(
      [['<script>', 'a & b'], ['"q"', "<img>"]],
      '<b>live</b>',
    );
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('a &amp; b');
    expect(html).toContain('&quot;q&quot;');
    expect(html).toContain('&lt;img&gt;');
    expect(html).toContain('&lt;b&gt;live&lt;/b&gt;');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img>');
    expect(html).not.toContain('<b>live</b>');
  });
});

// A normalized entry matching data.js fetchData() output: { ch, cat, date, nick, text }.
function logEntry(extra = {}) {
  return { ch: 'activity', cat: 'log', date: '2026-01-01T08:00', nick: 'git', text: 't', ...extra };
}

// ---- renderPinned: home --------------------------------------------------

describe('renderPinned — home', () => {
  it('renders the home card with project count, commit total and last-push project', () => {
    const data = {
      projects: [{ channel: 'explorer' }, { channel: 'porssi' }],
      entries: [
        logEntry({ date: '2026-01-01T08:00', project: 'explorer' }),
        logEntry({ date: '2026-03-20T09:00', project: 'porssi' }), // newest → last push
      ],
    };
    renderPinned('home', data);
    const html = pinnedEl().innerHTML;
    expect(html).toContain('2 active');   // projects.length
    expect(html).toContain('2 in feed');  // logStats().totalCommits
    expect(html).toContain('2026-03-20'); // last-push date slice
    expect(html).toContain('porssi');     // last-push project (newest log entry)
  });

  it('falls back to an em-dash when there is no last push', () => {
    renderPinned('home', { projects: [], entries: [] });
    const html = pinnedEl().innerHTML;
    expect(html).toContain('0 active');
    expect(html).toContain('0 in feed');
    expect(html).toContain('<dt>last push</dt><dd>—</dd>');
  });

  it('escapes the last-push project name instead of injecting it', () => {
    const data = {
      projects: [{ channel: 'x' }],
      entries: [logEntry({ date: '2026-05-01T08:00', project: '<script>alert(1)</script>' })],
    };
    renderPinned('home', data);
    expect(pinnedEl().querySelector('script')).toBeNull();
    expect(pinnedEl().innerHTML).toContain('&lt;script&gt;');
    expect(pinnedEl().innerHTML).not.toContain('<script>');
  });
});

// ---- renderPinned: project -----------------------------------------------

describe('renderPinned — project', () => {
  // demos defaults to [] to mirror fetchData's canonical shape (always present).
  const projectData = (project, entries = [], demos = []) => ({ projects: [project], entries, demos });

  it('renders a project card with commits, heat, status, description and links', () => {
    const project = {
      channel: 'explorer',
      heat: 0.8,
      description: 'a terminal file explorer',
      links: [{ href: 'https://mase.fi/explorer', label: 'mase.fi' }],
    };
    const data = projectData(project, [
      logEntry({ ch: 'explorer' }),
      logEntry({ ch: 'explorer' }),
      logEntry({ ch: 'porssi' }), // different channel — must not be counted
    ]);
    renderPinned('explorer', data);
    const html = pinnedEl().innerHTML;
    expect(html).toContain('a terminal file explorer');
    expect(html).toContain('80%');                  // heat → (0.8*100|0)
    expect(html).toContain('2 commits in feed');    // only the two 'explorer' logs
    expect(html).toContain('● shipping');           // heat > 0.6 label
    expect(html).toContain('actively shipping');    // heat > 0.6 status text
    expect(html).toContain('href="https://mase.fi/explorer"');
    expect(html).toContain('>mase.fi</a>');
  });

  it('labels a mid-heat project as steady', () => {
    renderPinned('explorer', projectData({ channel: 'explorer', heat: 0.5, description: 'd', links: [] }));
    const html = pinnedEl().innerHTML;
    expect(html).toContain('● steady');                       // heat > 0.3 label
    expect(html).toContain('<dd class="accent">steady</dd>'); // status text
  });

  it('labels a cold project as idle / maintenance only', () => {
    renderPinned('explorer', projectData({ channel: 'explorer', heat: 0.1, description: 'd', links: [] }));
    const html = pinnedEl().innerHTML;
    expect(html).toContain('○ idle');               // heat <= 0.3 label
    expect(html).toContain('maintenance only');     // status text
  });

  it('escapes a malicious project description (no script injected)', () => {
    const project = {
      channel: 'explorer',
      heat: 0.5,
      description: '<script>alert(1)</script> & "quoted"',
      links: [],
    };
    renderPinned('explorer', projectData(project));
    expect(pinnedEl().querySelector('script')).toBeNull();
    const html = pinnedEl().innerHTML;
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&amp;');
    expect(html).not.toContain('<script>');
  });

  it('renders a "try demo →" chip when the channel has a published demo', () => {
    const data = projectData({ channel: 'explorer', heat: 0.5, description: 'd', links: [] }, [], ['explorer']);
    renderPinned('explorer', data);
    const a = pinnedEl().querySelector('.demo-link');
    expect(a).not.toBeNull();
    expect(a.getAttribute('href')).toBe('/demos/explorer/');
    expect(a.textContent).toContain('try demo');
  });

  it('omits the demo chip when the channel has no demo', () => {
    renderPinned('explorer', projectData({ channel: 'explorer', heat: 0.5, description: 'd', links: [] }));
    expect(pinnedEl().querySelector('.demo-link')).toBeNull();
  });

  it('escapes malicious link href and label (no attribute breakout)', () => {
    const project = {
      channel: 'explorer',
      heat: 0.5,
      description: 'd',
      links: [{ href: '"><script>alert(1)</script>', label: '<b>x</b>' }],
    };
    renderPinned('explorer', projectData(project));
    // Without escapeHtml the unescaped quote would close href= and the <script>
    // would become a live element. Assert against the DOM (serialization-robust):
    // no breakout, and the whole payload is trapped as the href value / link text.
    const a = pinnedEl().querySelector('.links a');
    expect(pinnedEl().querySelector('script')).toBeNull();
    expect(pinnedEl().querySelector('.links b')).toBeNull();
    expect(a.getAttribute('href')).toBe('"><script>alert(1)</script>');
    expect(a.textContent).toBe('<b>x</b>');
  });
});

// ---- renderPinned: activity ----------------------------------------------

describe('renderPinned — activity', () => {
  it('renders the activity card with the total entry count and a log date range', () => {
    const data = {
      projects: [],
      entries: [
        logEntry({ cat: 'log', date: '2026-01-01T08:00' }),
        logEntry({ cat: 'log', date: '2026-03-15T08:00' }),
        { ch: 'home', cat: 'daily', date: '2026-02-01T08:00', nick: 'mase', text: 'd' },
      ],
    };
    renderPinned('activity', data);
    const html = pinnedEl().innerHTML;
    expect(html).toContain('3 entries');               // data.entries.length (incl. daily)
    expect(html).toContain('2026-01-01 → 2026-03-15'); // first → last log entry
  });

  it('shows an em-dash range when there are no log entries', () => {
    renderPinned('activity', { projects: [], entries: [] });
    const html = pinnedEl().innerHTML;
    expect(html).toContain('0 entries');
    expect(html).toContain('<dt>range</dt><dd>—</dd>');
  });

  // A UTC-noon date string N days ago. logStats buckets by UTC calendar day, so
  // building the string in UTC terms keeps the bucket index deterministic in any
  // runner timezone (noon keeps it clear of the window's start/end edges).
  const utcNoonDaysAgo = (n) => {
    const d = new Date();
    d.setUTCHours(12, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() - n);
    const p = (x) => String(x).padStart(2, '0');
    return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T12:00`;
  };

  it('shows a recent rate computed as average commits per active day (~N/day)', () => {
    const data = {
      projects: [],
      entries: [
        // 4 commits one recent day + 2 another recent day → 6 / 2 active days = ~3.
        logEntry({ cat: 'log', date: utcNoonDaysAgo(3) }),
        logEntry({ cat: 'log', date: utcNoonDaysAgo(3) }),
        logEntry({ cat: 'log', date: utcNoonDaysAgo(3) }),
        logEntry({ cat: 'log', date: utcNoonDaysAgo(3) }),
        logEntry({ cat: 'log', date: utcNoonDaysAgo(7) }),
        logEntry({ cat: 'log', date: utcNoonDaysAgo(7) }),
      ],
    };
    renderPinned('activity', data);
    expect(pinnedEl().innerHTML).toContain('~3/day');
  });

  it('shows an em-dash rate when there is no recent (last-28d) activity', () => {
    const data = {
      projects: [],
      // Older than the 28-day window → no active days → '—', never a stale number.
      entries: [logEntry({ cat: 'log', date: utcNoonDaysAgo(60) })],
    };
    renderPinned('activity', data);
    const html = pinnedEl().innerHTML;
    expect(html).toContain('<i>rate</i><b>—</b>');
  });
});

// ---- renderPinned: unmatched ---------------------------------------------

describe('renderPinned — unmatched channel', () => {
  it('renders nothing for a channel that is neither home/activity nor a project', () => {
    renderPinned('does-not-exist', { projects: [], entries: [] });
    expect(pinnedEl().innerHTML).toBe('');
  });
});

describe('renderPinned — beam teardown', () => {
  it('unmounts any live beam before replacing #pinned, remounting only on home', () => {
    const unmount = vi.spyOn(beam, 'unmountBeam');
    const mount = vi.spyOn(beam, 'mountBeam');

    renderPinned('home', { projects: [], entries: [] });
    expect(unmount).toHaveBeenCalled();
    expect(mount).toHaveBeenCalled();

    unmount.mockClear();
    mount.mockClear();
    renderPinned('activity', { projects: [], entries: [] });
    expect(unmount).toHaveBeenCalled();
    expect(mount).not.toHaveBeenCalled();

    unmount.mockRestore();
    mount.mockRestore();
  });
});

// ---- renderHeroLine ------------------------------------------------------

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

  it('clears the hero line for activity and unmatched channels', () => {
    heroEl().textContent = 'stale';
    renderHeroLine('activity', { projects: [] });
    expect(heroEl().innerHTML).toBe('');

    heroEl().textContent = 'stale';
    renderHeroLine('nope', { projects: [] });
    expect(heroEl().innerHTML).toBe('');
  });
});
