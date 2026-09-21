// @vitest-environment jsdom
// Unit tests for pinned.js's renderPinned — project card: commits, heat labels,
// description escaping, demo chip, and link escaping. See pinned.test.js for the
// shared cardHead/home coverage and jsdom harness note.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderPinned } from './pinned.js';

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

// A normalized entry matching data.js fetchData() output: { ch, cat, date, nick, text }.
function logEntry(extra = {}) {
  return { ch: 'activity', cat: 'log', date: '2026-01-01T08:00', nick: 'git', text: 't', ...extra };
}

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

  it('uses stats.commitsByProject when the hot file no longer holds all logs', () => {
    const project = {
      channel: 'explorer',
      slug: 'explorer',
      heat: 0.5,
      description: 'desc',
      links: [],
    };
    const data = projectData(project, [logEntry({ ch: 'explorer' })]);
    data.stats = { commitsByProject: { explorer: 42 } };
    renderPinned('explorer', data);
    expect(pinnedEl().innerHTML).toContain('42 commits in feed');
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
