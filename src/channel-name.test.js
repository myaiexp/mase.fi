// @vitest-environment jsdom
// A project channel's visible heading is its product name; the channel id stays
// the address (hash, data-ch, the "/" token). Covers the registry rule, the
// sidebar row and mobile tab, and autocomplete matching by either one.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildRegistry, channelById } from './registry.js';
import { renderChanlist } from './sidebar.js';
import { createAutocomplete } from './command-complete.js';
import { proj, appData } from './channels-test-helpers.js';

const projects = [
  proj({ name: 'Ruoka', channel: 'diet-app' }),
  proj({ name: '', channel: 'blank' }),
  proj({ channel: 'unnamed' }),
  proj({ name: ' ', channel: 'space' }),
];

/** A channel the test expects to exist. */
function ch(/** @type {string} */ id) {
  const c = channelById(id);
  if (!c) throw new Error(`no channel ${id}`);
  return c;
}

describe('registry channel name', () => {
  beforeEach(() => buildRegistry(appData(projects)));

  it('uses a non-empty project name and keeps the channel as id and label', () => {
    expect(channelById('diet-app')).toMatchObject({ id: 'diet-app', label: 'diet-app', name: 'Ruoka' });
  });

  it('falls back to the channel only for an empty or missing name, without trimming', () => {
    expect(ch('blank').name).toBe('blank');
    expect(ch('unnamed').name).toBe('unnamed');
    expect(ch('space').name).toBe(' ');
  });

  it('names home and activity by their ids', () => {
    expect(ch('home').name).toBe('home');
    expect(ch('activity').name).toBe('activity');
  });
});

describe('sidebar and tabs', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    for (const id of ['chanlist', 'tabbar']) {
      const el = document.createElement('div');
      el.id = id;
      document.body.appendChild(el);
    }
    // The sidebar lists only projects with a loaded entry (sidebar.js
    // projectsWithEntries), so diet-app needs one to get a row.
    const data = appData(projects, {
      entries: [{ channel: 'diet-app', category: undefined, date: '', nick: '', text: '', projectChannel: 'diet-app', projectSlug: 'diet-app' }],
    });
    buildRegistry(data);
    renderChanlist(data, () => {});
  });

  it.each([
    { sel: '.chan', name: '.name' },
    { sel: '.tab', name: '.tab-name' },
  ])('$sel shows the name and addresses the channel id', ({ sel, name }) => {
    const el = /** @type {HTMLElement} */ (document.querySelector(`${sel}[data-ch="diet-app"]`));
    expect(/** @type {HTMLElement} */ (el.querySelector(name)).textContent).toBe('Ruoka');
    expect(el.getAttribute('aria-label')).toBe('Ruoka channel');
  });
});

describe('autocomplete', () => {
  /** @type {HTMLElement} */
  let $popup;
  /** @type {ReturnType<typeof createAutocomplete>} */
  let ac;
  const rows = () => /** @type {HTMLElement[]} */ ([...$popup.querySelectorAll('.cc-item')]);
  const sub = (/** @type {string} */ sel) => /** @type {HTMLElement} */ (rows()[0].querySelector(sel));

  beforeEach(() => {
    document.body.replaceChildren();
    const $input = document.createElement('input');
    $popup = document.createElement('div');
    document.body.append($input, $popup);
    buildRegistry(appData(projects));
    ac = createAutocomplete({ getCommands: () => [], formatRelativeActivity: () => '', onChoose: vi.fn() });
    ac.bind($input, $popup);
  });

  it.each(['diet', 'ruo'])('finds the named channel by id or name (%s)', (q) => {
    ac.render(q);
    expect(rows()[0].dataset.ch).toBe('diet-app');
    expect(sub('.cc-ch').textContent).toContain('Ruoka');
  });

  it('shows the id beside a name that differs, so the token is visible', () => {
    ac.render('diet');
    expect(sub('.cc-id').textContent).toBe('diet-app');
    ac.render('unnamed');
    expect(rows()[0].querySelector('.cc-id')).toBeNull();
  });
});
