// Shared jsdom harness for the command.js test suites (autocomplete, keys, slash
// commands, applySearch-through-initCommand, formatRelativeActivity). Each test
// file still declares its own vi.mock('./registry.js'|'./channels.js'|'./data.js')
// and per-test dynamic re-import — those must live in the importing file for
// vitest to hoist and apply them.

// The DOM nodes initCommand resolves by id. cmd-input is the only <input>.
export function setupDom() {
  document.body.replaceChildren();
  document.getElementById('search-dim-style')?.remove(); // applySearch injects this once
  for (const id of ['cmd', 'cmd-input', 'cmd-prompt', 'cmd-hint', 'cmd-complete', 'feed']) {
    const el = document.createElement(id === 'cmd-input' ? 'input' : 'div');
    el.id = id;
    document.body.appendChild(el);
  }
}

// Point the mocked getChannels() accessor at a fresh channel list for this test.
export function setChannels(registry, list) {
  registry.getChannels.mockReturnValue(list);
}

export function ch(id, label = id, topic = `${id} topic`) {
  return { id, label, topic };
}

// Type into the command input and fire the input event initCommand listens for.
export function type(value) {
  const input = document.getElementById('cmd-input');
  input.value = value;
  input.dispatchEvent(new Event('input'));
  return input;
}

export const cc = () => document.getElementById('cmd-complete');
export const items = () => [...cc().querySelectorAll('.cc-item')];

export function press(el, key) {
  el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
}

// jsdom mount helper shared by tests that stage rows in #feed for applySearch.
export function feedRow(raw, text) {
  const row = document.createElement('div');
  row.className = 'feed-row';
  row.dataset.raw = raw;
  const msg = document.createElement('div');
  msg.className = 'msg';
  msg.textContent = text;
  row.appendChild(msg);
  return row;
}
