// @vitest-environment jsdom
// Exact markup the smart 404 renderers produce: the links and class vocabulary
// that 404.html's stylesheet targets, one state at a time.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderConfident, renderFuzzy, renderNone } from './notfound-page.js';
import { installNotFound, removeNotFound } from './notfound-test-helpers.js';

const $ = (id) => document.getElementById(id);
const HOME = '<a href="/">mase.fi</a>';
const PLAN = { target: '/explorer', targetLabel: '/explorer', targetCaption: 'map explorer' };
const BIG = '<a class="big" href="/explorer"><span class="arr">→</span><span class="bu">/explorer</span>'
  + '<span class="bname">map explorer</span></a>';
const CANDIDATES = [
  { route: { href: '/explorer', label: '/explorer', caption: 'map explorer', kind: 'path' }, distance: 1 },
  { route: { href: '/games', label: '/games', kind: 'path' }, distance: 2 },
];

beforeEach(() => {
  installNotFound();
  vi.useFakeTimers();
});

afterEach(removeNotFound);

describe('smart 404 markup', () => {
  it('confident state: label, suggestion, tail note and both hint rows', () => {
    renderConfident('/explorer/operator', { ...PLAN, tail: '/operator', diff: true });

    expect($('sugg').innerHTML).toBe(`<div class="label">did you mean</div>${BIG}`);
    expect($('tailnote').innerHTML).toBe('the tail <b>/operator</b> matched nothing · the head resolves');
    expect($('fhints').innerHTML).toBe(
      `<span class="hint-d">esc or any key to stay · enter to go now · ${HOME} for the full directory</span>`
      + `<span class="hint-m">${HOME} · tap anywhere to stay</span>`,
    );
  });

  it('a suggestion without a caption has no caption span', () => {
    renderConfident('/explorer/x', { ...PLAN, targetCaption: '', tail: '/x', diff: false });
    expect($('sugg').querySelector('.bname')).toBeNull();
  });

  it('fuzzy state: candidate rows, footer and hints', () => {
    renderFuzzy('/explrer', CANDIDATES);

    expect($('sugg').innerHTML).toBe(
      '<div class="label">closest matches</div><div class="cands">'
      + '<a class="cand first" href="/explorer"><span class="croute">→ /explorer</span>'
      + '<span class="cname">map explorer</span><span class="creason">1 char off</span></a>'
      + '<a class="cand" href="/games"><span class="croute">→ /games</span>'
      + '<span class="creason">2 chars off</span></a></div>'
      + '<div class="cfoot">no auto-redirect — pick one, or <a href="/">browse everything</a>.</div>',
    );
    expect($('fhints').innerHTML).toBe(
      '<span class="hint-d">1–2 to jump · h for home</span>'
      + `<span class="hint-m">${HOME} for the full directory</span>`,
    );
  });

  it('none state: home suggestion and hints', () => {
    renderNone(0);

    expect($('sugg').innerHTML).toBe(
      '<a class="big" href="/"><span class="arr">→</span><span class="bu">mase.fi</span>'
      + '<span class="bname">the full directory</span></a>',
    );
    expect($('fhints').innerHTML).toBe(
      '<span class="hint-d">enter for home</span>'
      + `<span class="hint-m">${HOME} for the full directory</span>`,
    );
  });

  it('cancelling the countdown leaves the note and the short hints', () => {
    renderConfident('/explorer/x', { ...PLAN, tail: '/x', diff: false });
    $('staybtn').click();

    expect($('cancelnote').innerHTML).toBe(
      '<span class="x">✕ </span>redirect cancelled — staying put. '
      + `<a href="/explorer">/explorer</a> · ${HOME}`,
    );
    expect($('fhints').innerHTML).toBe(
      `<span class="hint-d">${HOME} for the full directory</span><span class="hint-m">${HOME}</span>`,
    );
  });
});
