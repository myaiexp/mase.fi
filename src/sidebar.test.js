// @vitest-environment jsdom
// Unit tests for sidebar.js — renderChanlist()'s 5-cell heat-bar mapping and
// setActiveChannel()'s .active class toggle.
//
// Each sidebar row renders a .heat span of 5 <b> cells; a cell is "filled" when
// it carries the `on` class. The fill count is on = Math.max(1, round(heat * 5)),
// where heat comes from chHeat(id): project.heat for project channels, 1.0 for
// #home, 0.85 for #activity. We drive the channel registry via initChannels()
// with crafted project heat values, then assert the ACTUAL filled/empty cell
// counts the code produces (verified against node), bracketing each rounding
// threshold so an off-by-one in the mapping would move a boundary and fail.
import { describe, it, expect, beforeEach } from 'vitest';
import { renderChanlist, setActiveChannel } from './sidebar.js';
import { initChannels } from './channels.js';

// Mount the two containers renderChanlist writes into (built node-by-node so the
// security hook's innerHTML ban doesn't apply to the test harness; renderChanlist
// itself does the innerHTML writes).
function mountContainers() {
  document.body.replaceChildren();
  for (const id of ['chanlist', 'tabbar']) {
    const el = document.createElement('div');
    el.id = id;
    document.body.appendChild(el);
  }
}

// Build a data set whose projects each become a 'projects'-group channel with
// chHeat(channel) === heat. channel id is p0, p1, ... in order.
function dataWithHeats(heats) {
  return {
    projects: heats.map((heat, i) => ({
      name: 'P' + i, channel: 'p' + i, description: 'desc ' + i, heat,
    })),
  };
}

// Count filled (.on) vs total heat-bar cells for one channel's sidebar row.
function heatCells(chId) {
  const span = document.querySelector(`.chan[data-ch="${chId}"] .heat`);
  return {
    total: span.querySelectorAll('b').length,
    on: span.querySelectorAll('b.on').length,
  };
}

// heat → expected filled cells, verified empirically (node). Values are offset
// from the exact .5*k multiples so floating-point error never flips a boundary,
// then bracketed just-below / just-above each threshold.
const HEAT_CASES = [
  { heat: 0.0, on: 1 }, // Math.max(1, round(0)) — floor keeps 1 cell lit at zero heat
  { heat: 0.2, on: 1 }, // round(1.00)=1
  { heat: 0.29, on: 1 }, // round(1.45)=1 — just below the 1→2 boundary
  { heat: 0.31, on: 2 }, // round(1.55)=2 — just above it
  { heat: 0.4, on: 2 }, // round(2.00)=2
  { heat: 0.49, on: 2 }, // round(2.45)=2 — just below 2→3
  { heat: 0.5, on: 3 }, // round(2.50)=3 — exact boundary rounds up
  { heat: 0.51, on: 3 }, // round(2.55)=3
  { heat: 0.6, on: 3 }, // round(3.00)=3
  { heat: 0.69, on: 3 }, // round(3.45)=3 — just below 3→4
  { heat: 0.71, on: 4 }, // round(3.55)=4 — just above it
  { heat: 0.8, on: 4 }, // round(4.00)=4
  { heat: 0.89, on: 4 }, // round(4.45)=4 — just below 4→5
  { heat: 0.91, on: 5 }, // round(4.55)=5 — just above it
  { heat: 1.0, on: 5 }, // round(5.00)=5 — fully lit
];

describe('renderChanlist heat-bar cell mapping', () => {
  beforeEach(() => {
    mountContainers();
    initChannels(dataWithHeats(HEAT_CASES.map(c => c.heat)));
    renderChanlist(dataWithHeats(HEAT_CASES.map(c => c.heat)), () => {});
  });

  it('always renders exactly 5 heat cells per row', () => {
    for (let i = 0; i < HEAT_CASES.length; i++) {
      expect(heatCells('p' + i).total).toBe(5);
    }
    expect(heatCells('home').total).toBe(5);
    expect(heatCells('activity').total).toBe(5);
  });

  it.each(HEAT_CASES)('heat $heat fills $on of 5 cells', ({ heat, on }) => {
    // Each case maps to channel p<index>; heats are unique so findIndex is exact.
    const i = HEAT_CASES.findIndex(c => c.heat === heat);
    const cells = heatCells('p' + i);
    expect(cells.on).toBe(on);
    expect(cells.total - cells.on).toBe(5 - on); // empty cells are the complement
  });

  it('floors heat 0 to a single lit cell rather than zero', () => {
    // The Math.max(1, …) guard — without it, a dead channel would show no bar.
    expect(heatCells('p0').on).toBe(1);
  });

  it('lights all 5 cells for #home (chHeat 1.0)', () => {
    expect(heatCells('home').on).toBe(5);
  });

  it('lights 4 cells for #activity (chHeat 0.85 → round(4.25)=4)', () => {
    expect(heatCells('activity').on).toBe(4);
  });

  it('fills cells left-to-right (leading cells on, trailing cells off)', () => {
    // p10 has heat 0.71 → 4 of 5 lit; assert the first 4 are on and the last off.
    const cells = [...document.querySelectorAll('.chan[data-ch="p10"] .heat b')];
    expect(cells.map(b => b.classList.contains('on'))).toEqual([true, true, true, true, false]);
  });
});

describe('setActiveChannel class toggle', () => {
  // home + activity + p0..p4. Tabbar shows home, activity, and the FIRST 4
  // projects (p0..p3) — p4 lives in the sidebar only, exercising row/tab
  // independence.
  beforeEach(() => {
    mountContainers();
    const data = dataWithHeats([0.5, 0.5, 0.5, 0.5, 0.5]);
    initChannels(data);
    renderChanlist(data, () => {});
  });

  const activeChans = () => [...document.querySelectorAll('.chan.active')].map(el => el.dataset.ch);
  const activeTabs = () => [...document.querySelectorAll('.tab.active')].map(el => el.dataset.ch);

  it('sets active on exactly the matching sidebar row and tab', () => {
    setActiveChannel('p1');
    expect(activeChans()).toEqual(['p1']);
    expect(activeTabs()).toEqual(['p1']);
  });

  it('clears active from the previous channel when switching', () => {
    setActiveChannel('p1');
    setActiveChannel('activity');
    expect(activeChans()).toEqual(['activity']);
    expect(activeTabs()).toEqual(['activity']);
  });

  it('activates system channels (home) the same as project channels', () => {
    setActiveChannel('home');
    expect(activeChans()).toEqual(['home']);
    expect(activeTabs()).toEqual(['home']);
  });

  it('activates a sidebar-only channel without touching the tabbar', () => {
    // p4 is the 5th project → present in #chanlist but not in the 4-project tabbar.
    setActiveChannel('p4');
    expect(activeChans()).toEqual(['p4']);
    expect(activeTabs()).toEqual([]); // no matching tab to activate
  });

  it('clears all active state when no channel matches', () => {
    setActiveChannel('p1');
    setActiveChannel('does-not-exist');
    expect(activeChans()).toEqual([]);
    expect(activeTabs()).toEqual([]);
  });
});

describe('renderChanlist click wiring', () => {
  it('navigates to a row’s channel id on click', () => {
    mountContainers();
    const data = dataWithHeats([0.5, 0.5]);
    initChannels(data);
    const seen = [];
    renderChanlist(data, id => seen.push(id));
    document.querySelector('.chan[data-ch="p1"]').click();
    document.querySelector('.tab[data-ch="home"]').click();
    expect(seen).toEqual(['p1', 'home']);
  });
});

describe('accessibility attributes', () => {
  beforeEach(() => {
    mountContainers();
    const data = dataWithHeats([0.5, 0.5]);
    initChannels(data);
    renderChanlist(data, () => {});
  });

  it('exposes sidebar rows as keyboard-operable links with a clean name', () => {
    const row = document.querySelector('.chan[data-ch="p0"]');
    expect(row.getAttribute('role')).toBe('link');
    expect(row.getAttribute('tabindex')).toBe('0');
    expect(row.getAttribute('aria-label')).toBe('p0 channel');
    // Decorative bits are hidden from the accessibility tree.
    expect(row.querySelector('.hash').getAttribute('aria-hidden')).toBe('true');
    expect(row.querySelector('.heat').getAttribute('aria-hidden')).toBe('true');
  });

  it('labels mobile tab buttons', () => {
    const tab = document.querySelector('.tab[data-ch="home"]');
    expect(tab.tagName).toBe('BUTTON');
    expect(tab.getAttribute('aria-label')).toBe('home channel');
  });

  it('marks only the active channel with aria-current=page on row and tab', () => {
    setActiveChannel('p0');
    const current = () =>
      [...document.querySelectorAll('[aria-current="page"]')].map(el => `${el.tagName}:${el.dataset.ch}`);
    expect(current().sort()).toEqual(['BUTTON:p0', 'DIV:p0']);

    setActiveChannel('home');
    // aria-current moved; the previous channel no longer carries it.
    expect(document.querySelector('.chan[data-ch="p0"]').hasAttribute('aria-current')).toBe(false);
    expect(current().sort()).toEqual(['BUTTON:home', 'DIV:home']);
  });
});

describe('keyboard navigation', () => {
  function press(el, key) {
    el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  }

  it('activates a sidebar row on Enter and Space (and not on other keys)', () => {
    mountContainers();
    const data = dataWithHeats([0.5, 0.5]);
    initChannels(data);
    const seen = [];
    renderChanlist(data, id => seen.push(id));
    const row = document.querySelector('.chan[data-ch="p1"]');
    press(row, 'Enter');
    press(row, ' ');
    press(row, 'a'); // ignored
    expect(seen).toEqual(['p1', 'p1']);
  });
});
