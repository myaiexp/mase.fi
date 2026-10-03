// @vitest-environment jsdom
// DOM-driver tests for the smart 404 page: preview-param guard, HEAD ladder,
// countdown/cancel, reduced-motion, fuzzy keyboard jumps, 403 restyle. The
// start() ladder end to end lives in notfound-start.test.js.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  effectivePath, renderConfident, renderFuzzy, renderNone, startCountdown,
  probePrefixes, applyRealStatus,
} from './notfound-page.js';
import { installNotFound, removeNotFound, stubReducedMotion, mountDom } from './notfound-test-helpers.js';

const PLAN = { target: '/explorer', targetLabel: '/explorer', targetCaption: 'map explorer' };
const CANDIDATES = [
  { route: { href: '/explorer', label: '/explorer', caption: 'map explorer', kind: 'path' }, distance: 1 },
  { route: { href: '/games', label: '/games', caption: 'games', kind: 'path' }, distance: 2 },
];

let loc, replace, hrefWrites, fetchMock;

beforeEach(() => {
  ({ loc, replace, hrefWrites, fetchMock } = installNotFound());
});

afterEach(removeNotFound);

describe('effectivePath — preview ?p= guard', () => {
  it('accepts a same-origin absolute path and rejects //evil, non-slash, and off-origin', () => {
    loc.pathname = '/404.html';
    loc.search = '?p=/explorer';
    expect(effectivePath()).toBe('/explorer');

    loc.search = '?p=//evil.com';
    expect(effectivePath()).toBe('/404.html');

    loc.search = '?p=explorer';
    expect(effectivePath()).toBe('/404.html');

    loc.search = '?p=https://evil.com/x';
    expect(effectivePath()).toBe('/404.html');

    loc.search = '?p=/\\evil.com';
    expect(effectivePath()).toBe('/404.html');
  });

  it('uses location.pathname when the page is not a preview', () => {
    loc.pathname = '/explorer/missing';
    loc.search = '?p=/games';
    expect(effectivePath()).toBe('/explorer/missing');
  });
});

describe('probePrefixes', () => {
  it('walks parents longest-first and returns the first HEAD that is ok', async () => {
    const seen = [];
    fetchMock.mockImplementation(async (url) => {
      seen.push(String(url));
      return { ok: url === '/a/b', status: url === '/a/b' ? 200 : 404 };
    });
    await expect(probePrefixes('/a/b/c')).resolves.toBe('/a/b');
    expect(seen).toEqual(['/a/b']);
  });

  it('aborts a hung HEAD after 1500ms and continues the ladder', async () => {
    vi.useFakeTimers();
    const seen = [];
    fetchMock.mockImplementation((url, opts) => {
      seen.push(String(url));
      if (url === '/a/b') {
        return new Promise((_, reject) => {
          opts.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        });
      }
      return Promise.resolve({ ok: true, status: 200 });
    });
    const pending = probePrefixes('/a/b/c');
    await vi.advanceTimersByTimeAsync(1500);
    await expect(pending).resolves.toBe('/a');
    expect(seen).toEqual(['/a/b', '/a']);
  });
});

describe('startCountdown', () => {
  it('calls location.replace(plan.target) when the 5s timer expires', () => {
    vi.useFakeTimers();
    startCountdown(PLAN, null);
    expect(replace).not.toHaveBeenCalled();
    vi.advanceTimersByTime(4999);
    expect(replace).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(replace).toHaveBeenCalledOnce();
    expect(replace).toHaveBeenCalledWith('/explorer');
  });

  it('does not cancel when the click lands on #gobtn or the suggestion link', () => {
    vi.useFakeTimers();
    const link = document.createElement('a');
    link.href = '/explorer';
    document.getElementById('sugg').append(link);
    startCountdown(PLAN, link);

    link.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(document.getElementById('countbox').hidden).toBe(false);
    expect(document.getElementById('cancelnote').hidden).toBe(true);
    expect(replace).not.toHaveBeenCalled();

    document.getElementById('gobtn').click();
    expect(replace).toHaveBeenCalledWith('/explorer');
    expect(document.getElementById('cancelnote').hidden).toBe(true);
  });

  it('cancels on any other click, keydown, or wheel and does not redirect', () => {
    vi.useFakeTimers();
    startCountdown(PLAN, null);
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(document.getElementById('countbox').hidden).toBe(true);
    expect(document.getElementById('cancelnote').hidden).toBe(false);
    vi.advanceTimersByTime(5000);
    expect(replace).not.toHaveBeenCalled();
  });

  it('Enter goes now; any other key cancels', () => {
    vi.useFakeTimers();
    startCountdown(PLAN, null);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(replace).toHaveBeenCalledWith('/explorer');

    replace.mockClear();
    mountDom();
    startCountdown(PLAN, null);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.getElementById('countbox').hidden).toBe(true);
    vi.advanceTimersByTime(5000);
    expect(replace).not.toHaveBeenCalled();
  });

  it('wheel cancels the timer', () => {
    vi.useFakeTimers();
    startCountdown(PLAN, null);
    document.body.dispatchEvent(new WheelEvent('wheel', { bubbles: true }));
    expect(document.getElementById('countbox').hidden).toBe(true);
    vi.advanceTimersByTime(5000);
    expect(replace).not.toHaveBeenCalled();
  });

  it('ignores keys held with ctrl/meta/alt: browser shortcuts neither cancel nor go', () => {
    vi.useFakeTimers();
    startCountdown(PLAN, null);
    for (const mod of ['ctrlKey', 'metaKey', 'altKey']) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', [mod]: true, bubbles: true }));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', [mod]: true, bubbles: true }));
    }
    expect(replace).not.toHaveBeenCalled();
    expect(document.getElementById('countbox').hidden).toBe(false);
    expect(document.getElementById('cancelnote').hidden).toBe(true);
    vi.advanceTimersByTime(5000);
    expect(replace).toHaveBeenCalledWith('/explorer');
  });

  it('touchstart anywhere cancels the timer (mobile "tap anywhere to stay")', () => {
    vi.useFakeTimers();
    startCountdown(PLAN, null);
    document.body.dispatchEvent(new Event('touchstart', { bubbles: true }));
    expect(document.getElementById('countbox').hidden).toBe(true);
    expect(document.getElementById('cancelnote').hidden).toBe(false);
    vi.advanceTimersByTime(5000);
    expect(replace).not.toHaveBeenCalled();
  });

  it('each tick updates the visible count, lit segments and drain bar', () => {
    vi.useFakeTimers();
    startCountdown(PLAN, null);
    vi.advanceTimersByTime(2000);
    expect(document.getElementById('cnum').textContent).toBe('3');
    const segs = [...document.getElementById('csegs').children];
    expect(segs.map((s) => s.classList.contains('on'))).toEqual([true, true, true, false, false]);
    expect(document.getElementById('drain').style.width).toBe('60%');
  });

  it('reduced-motion shows buttons with no timer and never auto-redirects', () => {
    stubReducedMotion(true);
    vi.useFakeTimers();
    startCountdown(PLAN, null);
    expect(document.getElementById('cnum').textContent).toBe('—');
    expect(document.getElementById('drain').hidden).toBe(true);
    expect(document.getElementById('countbox').hidden).toBe(false);
    vi.advanceTimersByTime(5000);
    expect(replace).not.toHaveBeenCalled();
    document.getElementById('staybtn').click();
    expect(document.getElementById('countbox').hidden).toBe(true);
  });

  it('refuses to replace() an off-origin target when the timer expires', () => {
    vi.useFakeTimers();
    startCountdown({ target: 'javascript:alert(1)', targetLabel: 'x' }, null);
    vi.advanceTimersByTime(5000);
    expect(replace).not.toHaveBeenCalled();
  });
});

describe('renderFuzzy / renderNone / applyRealStatus / renderConfident', () => {
  it('1–n jumps to a candidate and h goes home', () => {
    renderFuzzy('/exploer', CANDIDATES);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '2', bubbles: true }));
    expect(hrefWrites).toEqual(['/games']);
    hrefWrites.length = 0;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', bubbles: true }));
    expect(hrefWrites).toEqual(['/']);
  });

  it('1–n with ctrl/meta/alt held (browser tab switching) does not jump', () => {
    renderFuzzy('/exploer', CANDIDATES);
    for (const mod of ['ctrlKey', 'metaKey', 'altKey']) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: '1', [mod]: true, bubbles: true }));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', [mod]: true, bubbles: true }));
    }
    expect(hrefWrites).toEqual([]);
  });

  it('Enter on the none-state goes home', () => {
    renderNone(3);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(hrefWrites).toEqual(['/']);
  });

  it('applyRealStatus restyles the page on a 403 and skips that probe in preview', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403 });
    await applyRealStatus('/secret');
    expect(document.getElementById('badge').textContent).toBe('HTTP 403');
    expect(document.getElementById('ghost').textContent).toBe('403');
    expect(document.getElementById('errline').textContent).toBe('error: forbidden');
    expect(document.title).toBe('mase.fi — forbidden');

    loc.pathname = '/404.html';
    fetchMock.mockClear();
    await applyRealStatus('/secret');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('renderConfident wires the suggestion and starts the countdown', () => {
    vi.useFakeTimers();
    renderConfident('/explorer/operator', { ...PLAN, tail: '/operator', diff: true });
    const link = document.querySelector('#sugg a.big');
    expect(link.getAttribute('href')).toBe('/explorer');
    expect(document.getElementById('tailnote').hidden).toBe(false);
    expect(document.getElementById('countbox').hidden).toBe(false);
    vi.advanceTimersByTime(5000);
    expect(replace).toHaveBeenCalledWith('/explorer');
  });

  it('clamps an over-long typed path to 160 chars and explains the truncation', () => {
    vi.useFakeTimers();
    const long = '/explorer/' + 'x'.repeat(190); // 200 chars
    renderConfident(long, { ...PLAN, tail: long.slice(9), diff: true });
    const shown = document.getElementById('phead').textContent + document.getElementById('ptail').textContent;
    expect(shown).toBe(long.slice(0, 160));
    expect(document.getElementById('pellip').hidden).toBe(false);
    const note = document.getElementById('pnote');
    expect(note.hidden).toBe(false);
    expect(note.textContent).toContain('200 chars');
  });
});
