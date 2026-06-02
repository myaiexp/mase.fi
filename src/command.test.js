// @vitest-environment jsdom
// Unit tests for the command input module: the pure ranking helpers
// (fuzzyScore / highlightFuzzy) and the "/" channel-autocomplete flow
// (renderComplete + chooseFromComplete) driven through the public initCommand
// surface.
//
// fuzzyScore / highlightFuzzy are exported solely so the pure ranking logic can
// be pinned directly — highlightFuzzy's no-match branch is unreachable via the
// autocomplete UI (renderComplete pre-filters to score > 0, and both helpers
// share the same subsequence algorithm, so a survivor always matches). Adding
// the export keyword is behavior-preserving; the unused exports tree-shake out
// of the production bundle.
import { describe, it, expect, beforeEach, vi } from 'vitest';

// command.js needs CHANNELS/chAccent/navigate from the routing layer and
// entriesFor from the data adapter. Stub both so these tests exercise only what
// command.js OWNS: ranking, autocomplete rendering, and search highlighting.
// CHANNELS is mutated per test via setChannels(); navigate is a spy.
vi.mock('./channels.js', () => ({
  CHANNELS: [],
  chAccent: vi.fn(() => 'oklch(0.620 0.140 78.0)'),
  navigate: vi.fn(),
}));
vi.mock('./data.js', () => ({
  entriesFor: vi.fn(() => []),
}));

// Re-imported fresh per test so module state (ccIndex, the lazy DOM refs) starts
// clean and command.js binds to the same mocked-channel instance the test sees.
let command, channels;

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

// Replace the mocked CHANNELS contents in place (command.js holds the same array
// reference via its live import binding).
function setChannels(list) {
  channels.CHANNELS.length = 0;
  channels.CHANNELS.push(...list);
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
  channels = await import('./channels.js');
  command = await import('./command.js');
});

// ---- fuzzyScore ----------------------------------------------------------
// Note: fuzzyScore lowercases `str` but NOT `q` — the caller (renderComplete)
// lowercases the query first, so these tests pass lowercase queries to match
// the real call site.

describe('fuzzyScore', () => {
  it('empty query short-circuits to 1 (non-throwing baseline)', () => {
    expect(command.fuzzyScore('anything', '')).toBe(1);
    expect(command.fuzzyScore('', '')).toBe(1);
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
    // (h then o, scattered). Sorting desc reproduces renderComplete's order.
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

// ---- renderComplete (/ autocomplete) -------------------------------------

describe('renderComplete', () => {
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

// ---- chooseFromComplete (channel navigation) -----------------------------

describe('chooseFromComplete', () => {
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
    list[1].dispatchEvent(new MouseEvent('mouseenter', { bubbles: true })); // ccIndex → 1
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
