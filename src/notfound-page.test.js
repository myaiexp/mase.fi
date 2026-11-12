// @vitest-environment jsdom
// DOM-driver tests for the smart 404 page: preview-param guard, HEAD ladder,
// countdown/cancel, reduced-motion. Renderers (fuzzy/none/403/confident) live in
// notfound-render.test.js; the start() ladder end to end in notfound-start.test.js.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { effectivePath, startCountdown, probePrefixes } from './notfound-page.js';
import { installNotFound, removeNotFound, stubReducedMotion, byId as $, PLAN } from './notfound-test-helpers.js';

/** @import { NotFoundEnv } from './notfound-test-helpers.js' */

/** @type {NotFoundEnv['loc']} */
let loc;
/** @type {NotFoundEnv['replace']} */
let replace;
/** @type {NotFoundEnv['fetchMock']} */
let fetchMock;

beforeEach(() => {
  ({ loc, replace, fetchMock } = installNotFound());
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
    /** @type {string[]} */
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
    /** @type {string[]} */
    const seen = [];
    fetchMock.mockImplementation((url, opts) => {
      seen.push(String(url));
      if (url === '/a/b') {
        return new Promise((_, reject) => {
          opts?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
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
    $('sugg').append(link);
    startCountdown(PLAN, link);

    link.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect($('countbox').hidden).toBe(false);
    expect($('cancelnote').hidden).toBe(true);
    expect(replace).not.toHaveBeenCalled();

    $('gobtn').click();
    expect(replace).toHaveBeenCalledWith('/explorer');
    expect($('cancelnote').hidden).toBe(true);
  });

  it('cancels on any other click, keydown, or wheel and does not redirect', () => {
    vi.useFakeTimers();
    startCountdown(PLAN, null);
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect($('countbox').hidden).toBe(true);
    expect($('cancelnote').hidden).toBe(false);
    vi.advanceTimersByTime(5000);
    expect(replace).not.toHaveBeenCalled();
  });

  // replace() only starts a navigation: the page stays live until it unloads,
  // so the countdown must be over once the visitor has chosen to go.
  it('Enter goes now, once: the timer never fires a second replace() and later keys do not cancel', () => {
    vi.useFakeTimers();
    startCountdown(PLAN, null);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(replace).toHaveBeenCalledOnce();
    expect(replace).toHaveBeenCalledWith('/explorer');
    vi.advanceTimersByTime(5000);
    expect(replace).toHaveBeenCalledOnce();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    $('staybtn').click();
    expect($('cancelnote').hidden).toBe(true);
    expect(replace).toHaveBeenCalledOnce();
  });

  it('#gobtn goes now, once: the timer never fires a second replace() and later input does not cancel', () => {
    vi.useFakeTimers();
    startCountdown(PLAN, null);
    $('gobtn').click();
    $('gobtn').click();
    expect(replace).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(5000);
    expect(replace).toHaveBeenCalledOnce();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    document.body.dispatchEvent(new Event('touchstart', { bubbles: true }));
    expect($('cancelnote').hidden).toBe(true);
  });

  it('any key other than Enter cancels', () => {
    vi.useFakeTimers();
    startCountdown(PLAN, null);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect($('countbox').hidden).toBe(true);
    expect($('cancelnote').hidden).toBe(false);
    vi.advanceTimersByTime(5000);
    expect(replace).not.toHaveBeenCalled();
  });

  it('wheel cancels the timer', () => {
    vi.useFakeTimers();
    startCountdown(PLAN, null);
    document.body.dispatchEvent(new WheelEvent('wheel', { bubbles: true }));
    expect($('countbox').hidden).toBe(true);
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
    expect($('countbox').hidden).toBe(false);
    expect($('cancelnote').hidden).toBe(true);
    vi.advanceTimersByTime(5000);
    expect(replace).toHaveBeenCalledWith('/explorer');
  });

  it('touchstart anywhere cancels the timer (mobile "tap anywhere to stay")', () => {
    vi.useFakeTimers();
    startCountdown(PLAN, null);
    document.body.dispatchEvent(new Event('touchstart', { bubbles: true }));
    expect($('countbox').hidden).toBe(true);
    expect($('cancelnote').hidden).toBe(false);
    vi.advanceTimersByTime(5000);
    expect(replace).not.toHaveBeenCalled();
  });

  it('each tick updates the visible count, lit segments and drain bar', () => {
    vi.useFakeTimers();
    startCountdown(PLAN, null);
    vi.advanceTimersByTime(2000);
    expect($('cnum').textContent).toBe('3');
    const segs = [...$('csegs').children];
    expect(segs.map((s) => s.classList.contains('on'))).toEqual([true, true, true, false, false]);
    expect($('drain').style.width).toBe('60%');
  });

  it('reduced-motion shows buttons with no timer and never auto-redirects', () => {
    stubReducedMotion(true);
    vi.useFakeTimers();
    startCountdown(PLAN, null);
    expect($('clabel').textContent).toBe('go now or stay');
    expect($('cnum').hidden).toBe(true);
    expect($('csegs').hidden).toBe(true);
    expect($('drain').hidden).toBe(true);
    expect($('countbox').hidden).toBe(false);
    vi.advanceTimersByTime(5000);
    expect(replace).not.toHaveBeenCalled();
    $('staybtn').click();
    expect($('countbox').hidden).toBe(true);
  });

  it('refuses to replace() an off-origin target when the timer expires', () => {
    vi.useFakeTimers();
    startCountdown({ target: 'javascript:alert(1)', targetLabel: 'x' }, null);
    vi.advanceTimersByTime(5000);
    expect(replace).not.toHaveBeenCalled();
    // The refused go() must still end the timer, not tick on below zero.
    vi.advanceTimersByTime(3000);
    expect($('cnum').textContent).toBe('1');
  });
});
