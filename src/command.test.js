// @vitest-environment jsdom
// Unit tests for the command input module: the pure ranking helpers
// (fuzzyScore / highlightFuzzy) and the "/" channel-autocomplete flow
// driven through the public initCommand surface.
//
// fuzzyScore / highlightFuzzy are exported solely so the pure ranking logic can
// be pinned directly — highlightFuzzy's no-match branch is unreachable via the
// autocomplete UI (both helpers share the same subsequence algorithm, so a
// survivor always matches). Adding the export keyword is behavior-preserving;
// the unused exports tree-shake out of the production bundle.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// command-complete.js reads getChannels/chAccent from the registry leaf;
// command.js only needs navigate from the routing orchestrator. Stub both so
// these tests exercise ranking, autocomplete rendering, and search highlighting.
// The channel list is set per test via setChannels() (stubbing the accessor);
// navigate is a spy.
vi.mock('./registry.js', () => ({
  getChannels: vi.fn(() => []),
  chAccent: vi.fn(() => 'oklch(0.620 0.140 78.0)'),
}));
vi.mock('./channels.js', () => ({
  navigate: vi.fn(),
}));
vi.mock('./data.js', () => ({
  entriesFor: vi.fn(() => []),
  parseEntryDate: (d) => new Date(d + 'Z'),
}));

// Re-imported fresh per test so module state (the `complete` popup object, the
// lazy DOM refs) starts clean and command-complete binds to the same mocked
// registry instance the test sees.
let command, registry, channels, data;

// The DOM nodes initCommand resolves by id. cmd-input is the only <input>.
function setupDom() {
  document.body.replaceChildren();
  document.getElementById('search-dim-style')?.remove(); // applySearch injects this once
  for (const id of ['cmd', 'cmd-input', 'cmd-prompt', 'cmd-hint', 'cmd-complete', 'feed']) {
    const el = document.createElement(id === 'cmd-input' ? 'input' : 'div');
    el.id = id;
    document.body.appendChild(el);
  }
}

// Point the mocked getChannels() accessor at a fresh channel list for this test.
function setChannels(list) {
  registry.getChannels.mockReturnValue(list);
}

function ch(id, label = id, topic = `${id} topic`) {
  return { id, label, topic };
}

// Type into the command input and fire the input event initCommand listens for.
function type(value) {
  const input = document.getElementById('cmd-input');
  input.value = value;
  input.dispatchEvent(new Event('input'));
  return input;
}

const cc = () => document.getElementById('cmd-complete');
const items = () => [...cc().querySelectorAll('.cc-item')];

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  setupDom();
  registry = await import('./registry.js');
  channels = await import('./channels.js');
  data = await import('./data.js');
  command = await import('./command.js');
});

// ---- fuzzyScore ----------------------------------------------------------

describe('fuzzyScore', () => {
  it('empty query short-circuits to 1 (non-throwing baseline)', () => {
    expect(command.fuzzyScore('anything', '')).toBe(1);
    expect(command.fuzzyScore('', '')).toBe(1);
  });

  it('lowercases the query so mixed-case callers match like highlightFuzzy', () => {
    // Same contract as highlightFuzzy: a future caller must not have to
    // pre-lowercase `q`. Mixed-case used to score 0 because only `str` was
    // folded (finding #8129).
    expect(command.fuzzyScore('home', 'HO')).toBe(command.fuzzyScore('home', 'ho'));
    expect(command.fuzzyScore('Home', 'HOME')).toBe(command.fuzzyScore('home', 'home'));
    expect(command.fuzzyScore('home', 'HO')).toBeGreaterThan(0);
  });

  it('exact match scores higher than a prefix, which beats a mid-string match', () => {
    const exact = command.fuzzyScore('home', 'home');
    const prefix = command.fuzzyScore('home', 'hom');
    const mid = command.fuzzyScore('home', 'ome');
    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(mid);
  });

  it('a prefix match outscores the same query appearing mid-string', () => {
    // "or" leads "order" (prefix + startsWith bonus) but sits mid-word in "world".
    expect(command.fuzzyScore('order', 'or')).toBeGreaterThan(command.fuzzyScore('world', 'or'));
  });

  it('returns 0 when the query is not a subsequence', () => {
    expect(command.fuzzyScore('home', 'xyz')).toBe(0);
    // Order matters: a, c, b is not a subsequence of "abc".
    expect(command.fuzzyScore('abc', 'acb')).toBe(0);
  });

  it('treats query characters literally, not as a regex', () => {
    // A "." matches a literal dot...
    expect(command.fuzzyScore('a.b.c', '.')).toBeGreaterThan(0);
    expect(command.fuzzyScore('[id]', '[')).toBeGreaterThan(0);
    // ...and ".*" is NOT a wildcard: "plain" has no dot, so no match.
    expect(command.fuzzyScore('plain', '.*')).toBe(0);
  });

  it('orders realistic channel labels monotonically by score', () => {
    // Query "ho": "home" (prefix, +10), "shop" (h then o adjacent), "chrome"
    // (h then o, scattered). Sorting desc reproduces the autocomplete's order.
    const labels = ['chrome', 'home', 'shop'];
    const ranked = labels
      .map((l) => ({ l, s: command.fuzzyScore(l, 'ho') }))
      .sort((a, b) => b.s - a.s)
      .map((x) => x.l);
    expect(ranked).toEqual(['home', 'shop', 'chrome']);
  });
});

// ---- highlightFuzzy ------------------------------------------------------

describe('highlightFuzzy', () => {
  it('wraps each matched character in a .hit span, leaving the tail plain', () => {
    expect(command.highlightFuzzy('explorer', 'exp')).toBe(
      '<span class="hit">e</span><span class="hit">x</span><span class="hit">p</span>lorer'
    );
  });

  it('wraps non-adjacent matches with the literal text between them intact', () => {
    expect(command.highlightFuzzy('explorer', 'er')).toBe(
      '<span class="hit">e</span>xplo<span class="hit">r</span>er'
    );
  });

  it('no-match returns the input unchanged (escaped, no hit spans)', () => {
    expect(command.highlightFuzzy('home', 'xyz')).toBe('home');
    // "unchanged" still means HTML-escaped for safe interpolation.
    expect(command.highlightFuzzy('a<b', 'zzz')).toBe('a&lt;b');
  });

  it('empty query returns the escaped input without throwing', () => {
    expect(command.highlightFuzzy('home', '')).toBe('home');
    expect(command.highlightFuzzy('a<b', '')).toBe('a&lt;b');
  });

  it('escapes both surrounding text and the matched character (XSS-safe)', () => {
    // Matched "a" sits between escaped angle brackets.
    expect(command.highlightFuzzy('<a>', 'a')).toBe('&lt;<span class="hit">a</span>&gt;');
    // A matched special character is itself escaped inside the hit span.
    expect(command.highlightFuzzy('a<c', '<')).toBe('a<span class="hit">&lt;</span>c');
  });
});

// ---- autocomplete render -------------------------------------------------

describe('autocomplete render', () => {
  beforeEach(() => {
    setChannels([ch('home'), ch('explorer', 'explorer', 'file explorer'), ch('activity')]);
    command.initCommand({});
  });

  it('renders only the channels matching a partial "/foo" query', () => {
    type('/exp');
    expect(cc().hidden).toBe(false);
    const list = items();
    expect(list).toHaveLength(1);
    expect(list[0].dataset.ch).toBe('explorer');
  });

  it('highlights the matched characters of the rendered label', () => {
    type('/exp');
    expect(items()[0].querySelectorAll('.hit')).toHaveLength(3);
  });

  it('escapes the channel topic into the description cell', () => {
    setChannels([ch('explorer', 'explorer', 'a <b> topic')]);
    type('/exp');
    expect(items()[0].querySelector('.cc-desc').innerHTML).toBe('a &lt;b&gt; topic');
  });

  // Regression for audit #6282: data-ch used to interpolate m.id raw into
  // innerHTML. Quotes/angle brackets in a hostile project.channel break out of
  // the attribute (sidebar already escapeHtml's the same field).
  it('escapes channel id in data-ch so quote/angle breakout cannot inject attrs', () => {
    const hostile = 'foo" onclick=alert(1) x="<img src=x onerror=1>';
    setChannels([ch(hostile, 'foox', 'topic')]);
    type('/foo');
    const item = items()[0];
    expect(item).toBeTruthy();
    // Browser decodes the attribute — full id round-trips (not truncated at ").
    expect(item.getAttribute('data-ch')).toBe(hostile);
    expect(item.dataset.ch).toBe(hostile);
    // Breakout must not create real attributes or injected nodes.
    expect(item.hasAttribute('onclick')).toBe(false);
    expect(item.querySelector('img')).toBeNull();
    // Quotes were entity-escaped in the attribute source (not a raw " closer).
    expect(item.outerHTML).toContain('&quot;');
  });

  it('an empty query ("/") lists every channel with no highlight spans', () => {
    type('/');
    expect(items().map((el) => el.dataset.ch)).toEqual(['home', 'explorer', 'activity']);
    expect(cc().querySelectorAll('.hit')).toHaveLength(0);
  });

  it('sorts matches by descending fuzzy score', () => {
    setChannels([ch('chrome'), ch('home'), ch('shop')]);
    type('/ho');
    expect(items().map((el) => el.dataset.ch)).toEqual(['home', 'shop', 'chrome']);
  });

  it('hides the popup when nothing matches', () => {
    type('/zzz');
    expect(cc().hidden).toBe(true);
    expect(cc().innerHTML).toBe('');
  });
});

// ---- combobox ARIA (autocomplete announced to screen readers) ------------

describe('combobox ARIA', () => {
  const input = () => document.getElementById('cmd-input');
  const options = () => [...cc().querySelectorAll('[role="option"]')];

  beforeEach(() => {
    setChannels([ch('home'), ch('explorer'), ch('activity')]);
    command.initCommand({ meta: { server: 'irc.test', bootTime: Date.now() } });
  });

  it('slash mode marks the popup a listbox of options with an active descendant', () => {
    type('/o'); // matches home + explorer
    expect(cc().getAttribute('role')).toBe('listbox');
    const opts = options();
    expect(opts).toHaveLength(2);
    expect(opts.map((el) => el.id)).toEqual(['cc-opt-0', 'cc-opt-1']);
    expect(input().getAttribute('aria-expanded')).toBe('true');
    expect(input().getAttribute('aria-activedescendant')).toBe('cc-opt-0');
    expect(opts[0].getAttribute('aria-selected')).toBe('true');
    expect(opts[1].getAttribute('aria-selected')).toBe('false');
  });

  it('ArrowDown moves aria-activedescendant and aria-selected to the next option', () => {
    const el = type('/o');
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(input().getAttribute('aria-activedescendant')).toBe('cc-opt-1');
    const opts = options();
    expect(opts[0].getAttribute('aria-selected')).toBe('false');
    expect(opts[1].getAttribute('aria-selected')).toBe('true');
  });

  it('hovering an option syncs aria-selected and the active descendant', () => {
    type('/o');
    options()[1].dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    expect(input().getAttribute('aria-activedescendant')).toBe('cc-opt-1');
    expect(options()[1].getAttribute('aria-selected')).toBe('true');
  });

  it('help mode announces a note, not a listbox, with no active descendant', () => {
    type('?');
    expect(cc().getAttribute('role')).toBe('note');
    expect(options()).toHaveLength(0);
    expect(input().getAttribute('aria-expanded')).toBe('true');
    expect(input().hasAttribute('aria-activedescendant')).toBe(false);
  });

  it('collapses the combobox when the popup hides (no match / search)', () => {
    type('/o');
    type('/zzz'); // no match -> hidden
    expect(input().getAttribute('aria-expanded')).toBe('false');
    expect(input().hasAttribute('aria-activedescendant')).toBe(false);
    expect(cc().hasAttribute('role')).toBe(false);
  });
});

// ---- autocomplete choose (channel navigation) ----------------------------

describe('autocomplete choose', () => {
  beforeEach(() => {
    setChannels([ch('home'), ch('explorer'), ch('activity')]);
    command.initCommand({});
  });

  it('Enter navigates to the top-ranked match and clears the input', () => {
    const input = type('/exp');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(channels.navigate).toHaveBeenCalledWith('explorer');
    expect(input.value).toBe('');
  });

  it('clicking a hovered item navigates to that channel', () => {
    type('/o'); // matches home + explorer (both contain "o"), in registry order
    const list = items();
    expect(list.map((el) => el.dataset.ch)).toEqual(['home', 'explorer']);
    list[1].dispatchEvent(new MouseEvent('mouseenter', { bubbles: true })); // complete.idx → 1
    list[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(channels.navigate).toHaveBeenCalledWith('explorer');
  });
});

// ---- applySearch (feed highlight round-trip) -----------------------------

function feedRow(raw, text) {
  const row = document.createElement('div');
  row.className = 'feed-row';
  row.dataset.raw = raw;
  const msg = document.createElement('div');
  msg.className = 'msg';
  msg.textContent = text;
  row.appendChild(msg);
  return row;
}

describe('applySearch', () => {
  beforeEach(() => {
    setChannels([ch('home')]);
    document
      .getElementById('feed')
      .append(feedRow('hello world', 'hello world'), feedRow('goodbye moon', 'goodbye moon'));
    command.initCommand({});
  });

  it('marks matching rows and dims non-matching ones', () => {
    type('world');
    const rows = [...document.querySelectorAll('.feed-row')];
    expect(rows[0].classList.contains('search-dim')).toBe(false);
    expect(rows[0].querySelector('mark').textContent).toBe('world');
    expect(rows[1].classList.contains('search-dim')).toBe(true);
    expect(rows[1].querySelector('mark')).toBeNull();
  });

  it('clearing the query removes all marks and un-dims every row', () => {
    type('world');
    type('');
    expect(document.querySelector('mark')).toBeNull();
    expect(document.querySelector('.search-dim')).toBeNull();
  });
});

// ---- slash commands (easter-egg /help, /whoami, … in the "/" popup) -------

describe('slash commands', () => {
  const notices = () => [...document.getElementById('feed').querySelectorAll('.sys-notice')];

  beforeEach(() => {
    setChannels([ch('home'), ch('explorer'), ch('activity')]);
    command.initCommand({ meta: { server: 'irc.test', bootTime: Date.now() } });
  });

  it('surfaces a matching command in the "/" popup, tagged is-cmd', () => {
    type('/whoami'); // no channel matches "whoami"
    const list = items();
    expect(list).toHaveLength(1);
    expect(list[0].classList.contains('is-cmd')).toBe(true);
    expect(list[0].querySelector('.cc-ch').textContent).toContain('whoami');
  });

  it('keeps commands hidden on a bare "/" (channels only)', () => {
    type('/');
    expect(items().some((el) => el.classList.contains('is-cmd'))).toBe(false);
    expect(items().map((el) => el.dataset.ch)).toEqual(['home', 'explorer', 'activity']);
  });

  it('Enter on a command prints server-notice line(s) and does not navigate', () => {
    const input = type('/help');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    const out = notices();
    expect(out.length).toBeGreaterThan(1);
    expect(out[0].textContent).toMatch(/slash commands/);
    expect(input.value).toBe('');
    expect(channels.navigate).not.toHaveBeenCalled();
  });

  it('/clear removes existing notices', () => {
    let input = type('/help');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(notices().length).toBeGreaterThan(0);
    input = type('/clear');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(notices()).toHaveLength(0);
  });
});

// ---- formatRelativeActivity (autocomplete .cc-last column) ----------------

describe('formatRelativeActivity (cc-last column)', () => {
  const NOW = new Date('2026-06-13T12:00:00Z');

  function lastCell() {
    type('/home');
    return items()[0].querySelector('.cc-last').textContent;
  }

  function entryAt(iso) {
    return [{ date: iso }];
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    setChannels([ch('home')]);
    command.initCommand({});
  });

  afterEach(() => {
    vi.useRealTimers();
    data.entriesFor.mockImplementation(() => []);
  });

  it("renders '3m' for an entry three minutes ago", () => {
    data.entriesFor.mockReturnValue(entryAt('2026-06-13T11:57'));
    expect(lastCell()).toBe('3m');
  });

  it("renders '2h' for an entry two hours ago", () => {
    data.entriesFor.mockReturnValue(entryAt('2026-06-13T10:00'));
    expect(lastCell()).toBe('2h');
  });

  it("renders '3d' for an entry three days ago", () => {
    data.entriesFor.mockReturnValue(entryAt('2026-06-10T12:00'));
    expect(lastCell()).toBe('3d');
  });

  it("renders '—' when the channel has no entries", () => {
    expect(lastCell()).toBe('—');
  });

  it("clamps a future-dated entry to '0m'", () => {
    data.entriesFor.mockReturnValue(entryAt('2026-06-13T12:05'));
    expect(lastCell()).toBe('0m');
  });
});
