// @vitest-environment jsdom
// start() end to end: the smart-404 ladder from typed path to rendered state —
// junk guard, parent-prefix HEAD hit, fuzzy rung (unique hit → countdown, close
// candidates → pick-list), none state. HEADs and GET /updates.json are served
// separately so each rung is driven on its own.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { start } from './notfound-page.js';
import { installNotFound, removeNotFound } from './notfound-test-helpers.js';

let loc, replace, hrefWrites, fetchMock;

beforeEach(() => {
  ({ loc, replace, hrefWrites, fetchMock } = installNotFound());
  vi.useFakeTimers();
});

afterEach(removeNotFound);

const project = (slug, url, desc = '') => ({ slug, name: slug, desc, url });
const EXPLORER = project('explorer', 'https://mase.fi/explorer', 'map explorer');
const GAMES = project('games', 'https://mase.fi/games');

// HEAD answers 200 for paths in `live` and 404 otherwise; GET /updates.json
// serves `updates`, or 404s when it is null.
function serve({ live = [], updates = null } = {}) {
  fetchMock.mockImplementation(async (url, opts = {}) => {
    if (opts.method === 'HEAD') {
      const ok = live.includes(url);
      return { ok, status: ok ? 200 : 404 };
    }
    if (!updates) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => updates };
  });
}

// Every request start() made, as "METHOD url", sorted: HEADs and the routes GET
// interleave by design (they run in parallel), so only the set is stable.
const requests = () => fetchMock.mock.calls.map(([u, o]) => `${o?.method ?? 'GET'} ${u}`).sort();
const $ = (id) => document.getElementById(id);
const bigLink = () => document.querySelector('#sugg a.big');
// Run well past the 5s countdown: a confident plan has redirected once by then.
const runOut = () => vi.advanceTimersByTime(10_000);

describe('start() — the matching ladder', () => {
  it('skips the ladder on junk paths', async () => {
    loc.pathname = '/wp-admin/setup.php';
    await start();
    // applyRealStatus still HEADs the typed path (403 vs 404 restyle);
    // parent prefixes and updates.json must not run.
    expect(requests()).toEqual(['HEAD /wp-admin/setup.php']);
    expect(bigLink().getAttribute('href')).toBe('/');
  });

  it('a live parent prefix wins: countdown to it, named from updates.json', async () => {
    loc.pathname = '/explorer/operator';
    // The project url's trailing slash must not hide its name from the prefix.
    serve({ live: ['/explorer'], updates: { projects: [{ ...EXPLORER, url: 'https://mase.fi/explorer/' }] } });
    await start();
    expect(requests()).toEqual(['GET /updates.json', 'HEAD /explorer', 'HEAD /explorer/operator']);
    expect(bigLink().getAttribute('href')).toBe('/explorer');
    expect(bigLink().querySelector('.bname').textContent).toBe('map explorer');
    expect($('tailnote').hidden).toBe(false);
    expect($('tailnote').textContent).toContain('/operator');
    vi.advanceTimersByTime(4999);
    expect(replace).not.toHaveBeenCalled();
    runOut();
    expect(replace).toHaveBeenCalledOnce();
    expect(replace).toHaveBeenCalledWith('/explorer');
  });

  it('in preview, ?p= drives the ladder and the real-status HEAD is skipped', async () => {
    loc.pathname = '/404.html';
    loc.search = '?p=/explorer/x';
    serve({ live: ['/explorer'] });
    await start();
    expect(requests()).toEqual(['GET /updates.json', 'HEAD /explorer']);
    expect($('phead').textContent).toBe('/explorer');
    expect($('ptail').textContent).toBe('/x');
    expect(bigLink().getAttribute('href')).toBe('/explorer');
  });

  it('a unique fuzzy hit counts down to that route with no tail diff', async () => {
    loc.pathname = '/exploer';
    serve({ updates: { projects: [EXPLORER, GAMES] } });
    await start();
    expect(requests()).toEqual(['GET /updates.json', 'HEAD /exploer']);
    expect(bigLink().getAttribute('href')).toBe('/explorer');
    expect($('tailnote').hidden).toBe(true);
    runOut();
    expect(replace).toHaveBeenCalledOnce();
    expect(replace).toHaveBeenCalledWith('/explorer');
  });

  it('a project that moved to a subdomain redirects to its *.mase.fi origin', async () => {
    loc.pathname = '/prospect';
    serve({ updates: { projects: [project('prospect', 'https://prospect.mase.fi', 'lead finder')] } });
    await start();
    expect(bigLink().getAttribute('href')).toBe('https://prospect.mase.fi');
    expect(bigLink().querySelector('.bname').textContent).toBe('lead finder — moved to a subdomain');
    runOut();
    expect(replace).toHaveBeenCalledOnce();
    expect(replace).toHaveBeenCalledWith('https://prospect.mase.fi');
  });

  it('off-site project urls never become a redirect target', async () => {
    loc.pathname = '/evil';
    serve({
      updates: {
        projects: [
          project('evil', 'https://mase.fi.evil.com/'),
          project('evil', 'https://evil.com/evil'),
          project('evil', 'javascript:alert(1)'),
        ],
      },
    });
    await start();
    expect(document.querySelector('#sugg .cand')).toBeNull();
    expect(bigLink().getAttribute('href')).toBe('/');
    expect(bigLink().querySelector('.bname').textContent).toBe('the full directory');
    runOut();
    expect(replace).not.toHaveBeenCalled();
    expect(hrefWrites).toEqual([]);
  });

  it('close candidates render a pick-list and never auto-redirect', async () => {
    loc.pathname = '/game';
    serve({ updates: { projects: [GAMES, project('gems', 'https://mase.fi/gems')] } });
    await start();
    const cands = [...document.querySelectorAll('#sugg .cand')];
    expect(cands.map((a) => a.getAttribute('href'))).toEqual(['/games', '/gems']);
    expect(cands[0].querySelector('.creason').textContent).toBe('1 char off');
    expect(bigLink()).toBeNull();
    expect($('countbox').hidden).toBe(true);
    runOut();
    expect(replace).not.toHaveBeenCalled();
    expect(hrefWrites).toEqual([]);
  });

  it('no prefix and no fuzzy hit: none state counts real projects, not EXTRA_ROUTES', async () => {
    loc.pathname = '/zzqqxx/deep';
    serve({ updates: { projects: [EXPLORER, GAMES] } });
    await start();
    expect(requests()).toEqual(['GET /updates.json', 'HEAD /zzqqxx', 'HEAD /zzqqxx/deep']);
    expect(bigLink().getAttribute('href')).toBe('/');
    expect(bigLink().querySelector('.bname').textContent).toBe('the full directory — 2 active projects');
    expect($('countbox').hidden).toBe(true);
    runOut();
    expect(replace).not.toHaveBeenCalled();
  });

  it('with updates.json down, EXTRA_ROUTES still match and a miss falls to plain none', async () => {
    serve();
    loc.pathname = '/blgo';
    await start();
    expect(bigLink().getAttribute('href')).toBe('/blog');

    removeNotFound();
    ({ loc, replace } = installNotFound());
    vi.useFakeTimers();
    loc.pathname = '/zzqqxx';
    await start();
    expect(bigLink().getAttribute('href')).toBe('/');
    expect(bigLink().querySelector('.bname').textContent).toBe('the full directory');
    runOut();
    expect(replace).not.toHaveBeenCalled();
  });
});
