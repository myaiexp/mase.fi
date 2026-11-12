// @vitest-environment jsdom
// Renderer tests for the smart 404 page: fuzzy keyboard jumps, none-state Enter,
// 403 restyle, and renderConfident's wiring and truncation. Preview guard, HEAD
// ladder and countdown live in notfound-page.test.js.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderConfident, renderFuzzy, renderNone, applyRealStatus } from './notfound-page.js';
import { installNotFound, removeNotFound, byId as $, pick, PLAN, candidate } from './notfound-test-helpers.js';
/** @import { NotFoundEnv } from './notfound-test-helpers.js' */

/** @type {NotFoundEnv['loc']} */
let loc;
/** @type {NotFoundEnv['replace']} */
let replace;
/** @type {NotFoundEnv['hrefWrites']} */
let hrefWrites;
/** @type {NotFoundEnv['fetchMock']} */
let fetchMock;

const CANDIDATES = [candidate('/explorer', 'map explorer', 1), candidate('/games', 'games', 2)];

beforeEach(() => {
  ({ loc, replace, hrefWrites, fetchMock } = installNotFound());
});

afterEach(removeNotFound);

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
    expect($('badge').textContent).toBe('HTTP 403');
    expect($('ghost').textContent).toBe('403');
    expect($('errline').textContent).toBe('error: forbidden');
    expect(document.title).toBe('mase.fi — forbidden');

    loc.pathname = '/404.html';
    fetchMock.mockClear();
    await applyRealStatus('/secret');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('renderConfident wires the suggestion and starts the countdown', () => {
    vi.useFakeTimers();
    renderConfident('/explorer/operator', { ...PLAN, state: 'confident', tail: '/operator', diff: true });
    const link = pick('#sugg a.big');
    expect(link.getAttribute('href')).toBe('/explorer');
    expect($('tailnote').hidden).toBe(false);
    expect($('countbox').hidden).toBe(false);
    vi.advanceTimersByTime(5000);
    expect(replace).toHaveBeenCalledWith('/explorer');
  });

  it('clamps an over-long typed path to 160 chars and explains the truncation', () => {
    vi.useFakeTimers();
    const long = '/explorer/' + 'x'.repeat(190); // 200 chars
    renderConfident(long, { ...PLAN, state: 'confident', tail: long.slice(9), diff: true });
    const shown = $('phead').textContent + $('ptail').textContent;
    expect(shown).toBe(long.slice(0, 160));
    expect($('pellip').hidden).toBe(false);
    const note = $('pnote');
    expect(note.hidden).toBe(false);
    expect(note.textContent).toContain('200 chars');
  });
});
