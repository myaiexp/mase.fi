// @vitest-environment jsdom
// Projects with no loaded entries are hidden from the sidebar list only: they
// stay in the registry (the hash and "/" still open them) and the mobile tab bar
// keeps its recency slice.
import { describe, it, expect, beforeEach } from 'vitest';
import { renderChanlist } from './sidebar.js';
import { buildRegistry, channelById } from './registry.js';

function mount() {
  document.body.replaceChildren();
  for (const id of ['chanlist', 'tabbar']) {
    const el = document.createElement('div');
    el.id = id;
    document.body.appendChild(el);
  }
}

const sidebarIds = () => [...document.querySelectorAll('#chanlist .chan')].map(el => el.dataset.ch);
const tabIds = () => [...document.querySelectorAll('#tabbar .tab')].map(el => el.dataset.ch);

describe('sidebar hides empty projects', () => {
  const data = {
    projects: [
      { channel: 'routed', slug: 'routed', heat: 0.5 },
      { channel: 'by-slug', slug: 'byslug', heat: 0.5 },
      { channel: 'empty', slug: 'empty', heat: 0 },
    ],
    entries: [
      { channel: 'routed', category: 'daily', projectSlug: 'routed', projectChannel: 'routed' },
      // A row carrying the slug but no projectChannel still counts for the project.
      { channel: 'activity', category: 'log', projectSlug: 'byslug' },
      { channel: 'home', category: 'daily' },
    ],
  };

  beforeEach(() => {
    mount();
    buildRegistry(data);
    renderChanlist(data, () => {});
  });

  it('lists projects with any loaded entry, by projectChannel or slug', () => {
    expect(sidebarIds()).toEqual(['home', 'activity', 'routed', 'by-slug']);
  });

  it('keeps the empty project in the registry and the tab bar', () => {
    expect(channelById('empty')).toBeTruthy();
    expect(tabIds()).toContain('empty');
  });

  it('hides every project when nothing is loaded, but not home or activity', () => {
    mount();
    const none = { projects: data.projects };
    buildRegistry(none);
    renderChanlist(none, () => {});
    expect(sidebarIds()).toEqual(['home', 'activity']);
  });
});
