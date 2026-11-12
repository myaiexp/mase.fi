// @vitest-environment jsdom
// Unit tests for pinned.js — cardHead escaping, the home card, and the
// unmatched-channel / beam-teardown branches of renderPinned. pinned.js builds
// its markup with string concatenation + template literals and leans entirely
// on escapeHtml() to neutralize user-visible strings — these tests pin the
// generated markup and prove HTML-special characters are ESCAPED, never parsed
// into live DOM.
//
// renderPinned — project: pinned-project.test.js
// renderPinned — activity: pinned-activity.test.js
// renderHeroLine: pinned-hero.test.js
// Activity card totals after loadArchive: pinned-archive.test.js
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderPinned, cardHead } from './pinned.js';
import { appData } from './data-test-helpers.js';
import { $ } from './dom-test-helpers.js';
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

const pinnedEl = () => $('#pinned');

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

// A normalized entry matching data.js fetchData() output: { channel, category, date, nick, text }.
function logEntry(extra = {}) {
  return { channel: 'activity', category: 'log', date: '2026-01-01T08:00', nick: 'git', text: 't', ...extra };
}

// ---- renderPinned: home --------------------------------------------------

describe('renderPinned — home', () => {
  it('renders the home card with project count, commit total and last-push project', () => {
    const data = {
      stats: {},
      projects: [{ channel: 'explorer' }, { channel: 'porssi' }],
      entries: [
        logEntry({ date: '2026-01-01T08:00', projectSlug: 'explorer' }),
        logEntry({ date: '2026-03-20T09:00', projectSlug: 'porssi' }), // newest → last push
      ],
    };
    renderPinned('home', appData(data));
    const html = pinnedEl().innerHTML;
    expect(html).toContain('2 active');   // projects.length
    expect(html).toContain('2 ·');        // commit total, not claimed to be in this feed
    expect(html).not.toContain('in feed');
    expect(html).toContain('2026-03-20'); // last-push date slice
    expect(html).toContain('porssi');     // last-push project (newest log entry)
  });

  it('falls back to an em-dash when there is no last push', () => {
    renderPinned('home', appData({ projects: [], entries: [], stats: {} }));
    const html = pinnedEl().innerHTML;
    expect(html).toContain('0 active');
    expect(html).toContain('0 ·');
    expect(html).not.toContain('in feed');
    expect(html).toContain('<dt>last push</dt><dd>—</dd>');
  });

  // "since" reads as the channel's age, so it is the log's first month — the same
  // range #activity draws — never a hardcoded year.
  it('dates "since" from the log start, the wider of stats.logFirst and memory', () => {
    const since = () => $('.ch-meta:nth-child(3)', pinnedEl()).textContent;
    renderPinned('home', appData({
      stats: { logFirst: '2026-03-05' }, projects: [],
      entries: [logEntry({ date: '2026-08-01T08:00', projectSlug: 'x' })],
    }));
    expect(since()).toBe('since2026-03');
    renderPinned('home', appData({ stats: {}, projects: [], entries: [logEntry({ date: '2026-08-01T08:00', projectSlug: 'x' })] }));
    expect(since()).toBe('since2026-08');
    renderPinned('home', appData({ projects: [], entries: [], stats: {} }));
    expect(since()).toBe('since—');
  });

  it('escapes the last-push project name instead of injecting it', () => {
    const data = {
      stats: {},
      projects: [{ channel: 'x' }],
      entries: [logEntry({ date: '2026-05-01T08:00', projectSlug: '<script>alert(1)</script>' })],
    };
    renderPinned('home', appData(data));
    expect(pinnedEl().querySelector('script')).toBeNull();
    expect(pinnedEl().innerHTML).toContain('&lt;script&gt;');
    expect(pinnedEl().innerHTML).not.toContain('<script>');
  });

  // normalizeDate only lets digits through, but the renderer does not rely on
  // that: dayOf/timeOf slices of a raw date are escaped too. 10 chars of day,
  // the T, then 5 chars of time.
  it('escapes the last-push day and time slices', () => {
    const data = {
      stats: {},
      projects: [],
      entries: [logEntry({ date: '<s>day</s>T<u/>xy', projectSlug: 'x' })],
    };
    renderPinned('home', appData(data));
    expect(pinnedEl().querySelector('s')).toBeNull();
    expect(pinnedEl().querySelector('u')).toBeNull();
    expect(pinnedEl().innerHTML).toContain('&lt;s&gt;day&lt;/s&gt;');
  });
});

// ---- renderPinned: unmatched ---------------------------------------------

describe('renderPinned — unmatched channel', () => {
  it('renders nothing for a channel that is neither home/activity nor a project', () => {
    renderPinned('does-not-exist', appData({ projects: [], entries: [], stats: {} }));
    expect(pinnedEl().innerHTML).toBe('');
  });
});

describe('renderPinned — beam teardown', () => {
  it('unmounts any live beam before replacing #pinned, remounting only on home', () => {
    const unmount = vi.spyOn(beam, 'unmountBeam');
    const mount = vi.spyOn(beam, 'mountBeam');

    renderPinned('home', appData({ projects: [], entries: [], stats: {} }));
    expect(unmount).toHaveBeenCalled();
    expect(mount).toHaveBeenCalled();

    unmount.mockClear();
    mount.mockClear();
    renderPinned('activity', appData({ projects: [], entries: [], stats: {} }));
    expect(unmount).toHaveBeenCalled();
    expect(mount).not.toHaveBeenCalled();

    unmount.mockRestore();
    mount.mockRestore();
  });
});
