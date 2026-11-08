// @vitest-environment jsdom
// A project channel's visible heading is its product name; the channel id stays
// the address (hash, data-ch, the "/" token). Covers the registry rule, the
// sidebar row and mobile tab, and autocomplete matching by either one.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildRegistry, channelById } from './registry.js';
import { renderChanlist } from './sidebar.js';
import { createAutocomplete } from './command-complete.js';

const projects = [
  { name: 'Ruoka', channel: 'diet-app', heat: 0.5 },
  { name: '', channel: 'blank', heat: 0.5 },
  { channel: 'unnamed', heat: 0.5 },
  { name: ' ', channel: 'space', heat: 0.5 },
];

describe('registry channel name', () => {
  beforeEach(() => buildRegistry({ projects }));

  it('uses a non-empty project name and keeps the channel as id and label', () => {
    expect(channelById('diet-app')).toMatchObject({ id: 'diet-app', label: 'diet-app', name: 'Ruoka' });
  });

  it('falls back to the channel only for an empty or missing name, without trimming', () => {
    expect(channelById('blank').name).toBe('blank');
    expect(channelById('unnamed').name).toBe('unnamed');
    expect(channelById('space').name).toBe(' ');
  });

  it('names home and activity by their ids', () => {
    expect(channelById('home').name).toBe('home');
    expect(channelById('activity').name).toBe('activity');
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
    const data = { projects, entries: [{ channel: 'diet-app', projectChannel: 'diet-app', projectSlug: 'diet-app' }] };
    buildRegistry(data);
    renderChanlist(data, () => {});
  });

  it.each([
    { sel: '.chan', name: '.name' },
    { sel: '.tab', name: '.tab-name' },
  ])('$sel shows the name and addresses the channel id', ({ sel, name }) => {
    const el = document.querySelector(`${sel}[data-ch="diet-app"]`);
    expect(el.querySelector(name).textContent).toBe('Ruoka');
    expect(el.getAttribute('aria-label')).toBe('Ruoka channel');
  });
});

describe('autocomplete', () => {
  let $popup, ac;
  const rows = () => [...$popup.querySelectorAll('.cc-item')];

  beforeEach(() => {
    document.body.replaceChildren();
    const $input = document.createElement('input');
    $popup = document.createElement('div');
    document.body.append($input, $popup);
    buildRegistry({ projects });
    ac = createAutocomplete({ getCommands: () => [], formatRelativeActivity: () => '', onChoose: vi.fn() });
    ac.bind($input, $popup);
  });

  it.each(['diet', 'ruo'])('finds the named channel by id or name (%s)', (q) => {
    ac.render(q);
    expect(rows()[0].dataset.ch).toBe('diet-app');
    expect(rows()[0].querySelector('.cc-ch').textContent).toContain('Ruoka');
  });

  it('shows the id beside a name that differs, so the token is visible', () => {
    ac.render('diet');
    expect(rows()[0].querySelector('.cc-id').textContent).toBe('diet-app');
    ac.render('unnamed');
    expect(rows()[0].querySelector('.cc-id')).toBeNull();
  });
});
