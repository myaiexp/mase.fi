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
