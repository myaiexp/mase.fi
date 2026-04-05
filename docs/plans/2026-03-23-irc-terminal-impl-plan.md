# IRC Terminal Redesign — Implementation Plan

**Goal:** Rewrite mase.fi from a scrolling portfolio into an IRC/terminal hybrid client with TTY boot sequence, channel-based navigation, and terminal-styled content.

**Architecture:** Full SPA rewrite. Hash-based routing (`#/home`, `#/explorer`, etc.) drives a two-pane layout (sidebar + content). Same `updates.json` data source, same Vite build. All new modules replace existing ones.

**Tech Stack:** Vite 7.3.1, vanilla JS (ES modules), anime.js 4.3.6 (`animate`, `stagger`, `createTimeline`), uFuzzy 1.0.19, self-hosted JetBrains Mono, Vitest 4.1.0.

**Design spec:** `.claude/plans/2026-03-23-irc-terminal-redesign.md`

---

## Task 1: Foundation — HTML Shell, Font, CSS Variables [Mode: Direct]

**Files:**
- Rewrite: `index.html` (removes old DOM targets — old Google Fonts links, hero, updates, projects sections)
- Rewrite: `src/style.css` (base layer only — layout, variables, font-face, reset)
- Create: `src/fonts/JetBrainsMono-Regular.woff2`
- Create: `src/fonts/JetBrainsMono-Bold.woff2`
- Delete: `src/animations.js`, `src/updates.js`, `src/projects.js`, `src/utils.js` (all old modules — their DOM targets no longer exist)
- Delete: `src/updates.test.js`, `src/projects.test.js`, `src/utils.test.js`
- Modify: `src/main.js` — stub to `import './style.css'` only (prevents build errors until Task 8 rewrites it)
- Modify: `eslint.config.js` — add `localStorage`, `location`, `matchMedia`, `IntersectionObserver`, `AbortController`, `MutationObserver` to globals

**Contracts:**

`index.html` — new DOM structure:
```html
<div id="boot-overlay" class="boot-overlay"></div>
<div class="terminal">
  <div class="terminal__titlebar">
    <span class="terminal__title">mase.fi</span>
    <button id="boot-replay" class="terminal__replay">▶ boot</button>
  </div>
  <div class="terminal__body">
    <aside id="sidebar" class="sidebar"></aside>
    <div class="content">
      <div id="content-pinned" class="content__pinned"></div>
      <div id="content-feed" class="content__feed"></div>
    </div>
  </div>
  <div class="terminal__inputbar">
    <span class="terminal__prompt">mase@fi:~$</span>
    <input id="command-input" type="text" class="terminal__input" autocomplete="off">
    <span class="terminal__cursor"></span>
  </div>
  <!-- Mobile top bar (hidden on desktop) -->
  <div id="mobile-topbar" class="mobile-topbar">
    <span id="mobile-channel-name" class="mobile-topbar__channel">#home</span>
    <button id="mobile-dropdown-toggle" class="mobile-topbar__toggle">▾</button>
  </div>
  <div id="mobile-dropdown" class="mobile-dropdown"></div>
</div>
```

CSS variables — extended palette:
```css
:root {
  --bg: #09090b;
  --bg-surface: #131316;
  --bg-content: #18181c;
  --text: #fafafa;
  --text-dim: #a1a1aa;
  --text-muted: #52525b;
  --accent: #e8a308;
  --accent-glow: rgba(232, 163, 8, 0.12);
  --green: #22c55e;
  --red: #ef4444;
  --cyan: #06b6d4;
  --border: #27272a;
  --border-hover: #3f3f46;
  --font-mono: 'JetBrains Mono', monospace;
  --sidebar-width: 200px;
}
```

Font via `@font-face` in style.css. Download woff2 files from JetBrains Mono GitHub releases.

CSS layout: `.terminal` is a CSS Grid (`grid-template-rows: auto 1fr auto`). `.terminal__body` is a two-column grid (`var(--sidebar-width) 1fr`). `.content` splits into `.content__pinned` (flex-shrink: 0) and `.content__feed` (flex: 1, overflow-y: auto).

**Test Cases:**
- Font loads (manual visual check via dev server)
- CSS variables render correct colors
- Two-pane layout visible at >640px

**Verification:**
```bash
npm run dev  # visual check: empty shell with two panes, correct font
npm run build  # verify build succeeds with font files
```

**Commit after passing.**

---

## Task 2: Terminal Primitives [Mode: Direct]

**Files:**
- Create: `src/terminal.js`
- Create: `src/terminal.test.js`
- Delete: `src/utils.js`, `src/utils.test.js` (logic absorbed here)

**Contracts:**

```js
/** Format ISO date to Finnish DD.MM.YYYY */
export function formatDate(isoDate) → string

/** Format ISO date to short DD.MM */
export function shortDate(isoDate) → string

/** Relative date: "today", "yesterday", "2d", "1w", "3w", "2mo" */
export function relativeDate(isoDate) → string

/**
 * Create a styled nick element (project name with consistent color).
 * Color assigned by hashing the name to a small palette.
 * @returns HTMLSpanElement with class 'nick' and inline color
 */
export function createNick(name) → HTMLSpanElement

/**
 * Create a complete feed line: [timestamp] nick text
 * @returns HTMLDivElement with class 'feed-line'
 */
export function createLine(date, nick, text) → HTMLDivElement

/**
 * Type text into an element character-by-character.
 * Resolves when done or rejects on abort signal.
 * @param {HTMLElement} el - target element
 * @param {string} text - text to type
 * @param {number} charDelay - ms between chars (default 20)
 * @param {AbortSignal} [signal] - on abort, instantly complete the remaining text (don't reject)
 */
export async function typeText(el, text, charDelay, signal) → Promise<void>

/**
 * Append a line of text to a container (for boot sequence).
 * @returns the created element
 */
export function appendLine(container, text, className) → HTMLDivElement
```

Nick color palette: 6-8 muted colors, deterministically assigned by simple string hash mod palette length. Not random — same project always gets same color.

**Test Cases:**
```js
// terminal.test.js
describe('formatDate', () => {
  it('converts ISO to Finnish format', () => expect(formatDate('2026-03-17')).toBe('17.03.2026'));
  it('handles single-digit days', () => expect(formatDate('2026-01-05')).toBe('05.01.2026'));
});

describe('shortDate', () => {
  it('returns DD.MM', () => expect(shortDate('2026-03-22')).toBe('22.03'));
});

describe('relativeDate', () => {
  it('returns "today" for today', () => ...);
  it('returns "yesterday" for yesterday', () => ...);
  it('returns "2d" for 2 days ago', () => ...);
  it('returns "1w" for 7 days ago', () => ...);
  it('returns "3w" for 21 days ago', () => ...);
});

describe('createNick', () => {
  it('returns span with nick class', () => ...);
  it('assigns consistent color for same name', () => ...);
  it('assigns different colors for different names', () => ...);
});

describe('createLine', () => {
  it('contains timestamp, nick, and text elements', () => ...);
});
```

**Verification:**
```bash
npm test -- src/terminal.test.js
```

**Commit after passing.**

---

## Task 3: Data Layer [Mode: Direct]

**Files:**
- Create: `src/data.js`
- Create: `src/data.test.js`
- Delete: `src/updates.js`, `src/updates.test.js`, `src/projects.js`, `src/projects.test.js`
- Modify (VPS): `updates.json` — add `channel` field to projects, remove `flagship`

**Contracts:**

```js
/**
 * Build lookup: project.name (lowercase) → project object.
 * Used to map entry.project → channel.
 */
export function buildProjectMap(projects) → Map<string, object>

/**
 * Get structured channel list for sidebar rendering.
 * Returns: [
 *   { group: 'home', channels: [{ id: 'home', label: '#home' }] },
 *   { group: 'projects', channels: [{ id: 'explorer', label: '#explorer', lastActivity: '2026-03-22', isNew: false }, ...] },
 *   { group: 'meta', channels: [{ id: 'activity', label: '#activity' }, { id: 'about', label: '#about' }] }
 * ]
 * Project channels sorted by most recent activity (descending).
 */
export function getChannels(entries, projects) → Array

/**
 * Get entries for a specific channel.
 * - 'home': category=daily entries, sorted date ascending (oldest first, newest last — chat order). Source data is date-descending, so this reverses it.
 * - 'activity': category=log entries, sorted date ascending (same reversal)
 * - project channel: category=feature|project entries matching project, sorted date ascending
 * - 'about': returns empty (static content)
 */
export function getChannelEntries(channelId, entries, projects) → Array

/**
 * Compute stats for #about channel.
 * - projectCount: projects.length
 * - featuresThisMonth: count of category=feature entries in current calendar month
 * - lastDeploy: relativeDate of most recent entry
 */
export function getAboutStats(entries, projects) → { projectCount, featuresThisMonth, lastDeploy }
```

**Channel ↔ entry mapping**: `entry.project` (lowercase, e.g. "explorer") matched case-insensitively against `project.name` (e.g. "Explorer"). The `project.channel` field (e.g. "explorer") is the routing key. Entries whose `entry.project` doesn't match any listed project are "unlinked" — they appear in `#home` (daily) and `#activity` (log) but have no project channel.

**updates.json project changes** (VPS):
```json
{ "name": "Explorer", "channel": "explorer", "url": "...", "desc": "..." }
{ "name": "Personal Tracker", "channel": "tracker", "url": "...", "desc": "..." }
{ "name": "Shapez 2 Solver", "channel": "shapez", "url": "...", "desc": "..." }
{ "name": "Pörssisähkö", "channel": "porssi", "url": "...", "desc": "..." }
{ "name": "Yatzy", "channel": "yatzy", "url": "...", "desc": "..." }
```

Remove `FreshRSS` from projects (it's no longer deployed per project visibility rule). Remove `flagship` field from all.

**Test Cases:**
```js
describe('buildProjectMap', () => {
  it('maps lowercase project name to project object', () => ...);
});

describe('getChannels', () => {
  it('returns three groups: home, projects, meta', () => ...);
  it('sorts project channels by most recent activity', () => ...);
  it('includes lastActivity date on project channels', () => ...);
  it('marks new projects with isNew flag', () => ...);
});

describe('getChannelEntries', () => {
  it('home: returns daily entries sorted ascending', () => ...);
  it('activity: returns log entries sorted ascending', () => ...);
  it('project: returns matching feature/project entries', () => ...);
  it('about: returns empty array', () => ...);
  it('unknown channel: returns empty array', () => ...);
});

describe('getAboutStats', () => {
  it('counts projects correctly', () => ...);
  it('counts features in current month', () => ...);
  it('computes lastDeploy relative date', () => ...);
});
```

**Verification:**
```bash
npm test -- src/data.test.js
ssh vps "jq '.projects' /var/www/html/updates.json"  # verify channel fields added
```

**Commit after passing.**

---

## Task 4: Sidebar [Mode: Delegated]

**Files:**
- Create: `src/sidebar.js`
- Add sidebar CSS to: `src/style.css`

**Contracts:**

```js
/**
 * Render the sidebar: channel groups with links and activity indicators.
 * Attaches click handlers that update hash (actual navigation via hashchange in router).
 * @param {{ entries: Array, projects: Array }} data
 */
export function initSidebar(data) → void

/**
 * Highlight the active channel in the sidebar (and update mobile top bar).
 * @param {string} channelId
 */
export function setActiveChannel(channelId) → void

/**
 * Check if boot animation mode is active (for staggered reveals).
 */
export function isBootAnimating() → boolean
export function setBootAnimating(value) → void
```

**DOM structure:**
```
aside.sidebar
  div.sidebar__group
    div.sidebar__group-header  "── home ──"
    a.sidebar__channel[href="#/home"]
      span.sidebar__name  "#home"
  div.sidebar__group
    div.sidebar__group-header  "── projects ──"
    a.sidebar__channel[href="#/explorer"]
      span.sidebar__name  "#explorer"
      span.sidebar__indicator  "2d"
    ...
  div.sidebar__group
    div.sidebar__group-header  "── meta ──"
    a.sidebar__channel[href="#/activity"]  ...
    a.sidebar__channel[href="#/about"]  ...
```

- Active channel: `.sidebar__channel--active` (amber text, bold, `> ` prefix)
- New project: `.sidebar__channel--new` (★ before name) — a project is "new" if it has a `category=project` entry within the last 14 days
- Activity indicators: `relativeDate()` from terminal.js, muted color
- Group headers: `──` are literal characters, dim color

**Boot animation integration:** When `isBootAnimating()` is true, sidebar renders with elements hidden (`opacity: 0`). Boot Phase 3 then animates them in with `stagger`.

**CSS key rules:**
- `.sidebar` — `width: var(--sidebar-width)`, `background: var(--bg-surface)`, `overflow-y: auto`, `border-right: 1px solid var(--border)`
- `.sidebar__channel:hover` — `background: var(--bg-content)`, 100ms transition
- `.sidebar__channel--active` — `color: var(--accent)`, `font-weight: 700`
- Mobile: `.sidebar { display: none }` below 640px

**Mobile support** (in sidebar.js): `setActiveChannel` also updates the mobile top bar text. `initSidebar` also renders the mobile dropdown content. The dropdown toggle and dismiss logic lives here. Uses `matchMedia('(max-width: 640px)')` to detect mobile. Task 8 adds the responsive CSS, this task owns the JS.

**Constraints:**
- Uses `getChannels()` from data.js for channel list
- Uses `relativeDate()` from terminal.js for indicators
- Navigation is via `<a href="#/channelId">` — no JS click handlers for navigation (hash change triggers router)

**Verification:**
- Dev server: sidebar renders with correct groups and indicators
- Click channel → hash changes, active state updates
- Multiple clicks back and forth → correct highlighting

**Commit after passing.**

---

## Task 5: Channel Renderers [Mode: Delegated]

**Files:**
- Create: `src/channels.js`
- Create: `src/channels.test.js`
- Add channel content CSS to: `src/style.css`

**Contracts:**

```js
/**
 * Initialize hash-based router. Listens for hashchange, renders channels.
 * @param {{ entries: Array, projects: Array }} data
 * @param {boolean} prefersReducedMotion
 */
export function initRouter(data, prefersReducedMotion) → void

/**
 * Navigate to a channel. Called by router on hashchange and directly during boot.
 * Clears content areas, renders pinned + feed for the channel.
 * Stores last-visited channel in localStorage.
 */
export function navigateTo(channelId, data, prefersReducedMotion) → void
```

**Channel rendering specs:**

`#home` — Pinned: ASCII art "mase.fi" + tagline. Feed: daily summary entries as chat lines (`shortDate`, `createNick`, summary text). Newest at bottom.

Project channels — Pinned: structured header (name, desc, url with clickable `→ Open` link in cyan, status, last update date). Feed: feature/project entries as chat lines. Newest at bottom.

`#activity` — No pinned. Feed: all log entries as dense chat lines. Muted colors. Newest at bottom.

`#about` — Pinned only, no feed. Neofetch-style block using `getAboutStats()`. Pre-formatted monospace layout.

**Scroll model:**
- `.content__feed` has `overflow-y: auto` and `display: flex; flex-direction: column`
- After rendering, scroll to bottom: `feedEl.scrollTop = feedEl.scrollHeight`
- Lazy loading: `IntersectionObserver` on a sentinel `div` at top of feed. When visible, prepend next batch of older entries (page size 20). Adjust `scrollTop` to maintain position after prepend.

**Channel switch animation:**
- If `!prefersReducedMotion && !isBootAnimating()`: type first 3 lines via `typeText(el, text, 15)`, rest appear instantly
- If boot animating: type all lines (boot controls the pacing)
- If reduced motion: all instant

**Routing:**
- `hashchange` listener parses `location.hash` → strip `#/` → channelId
- Default to `home` if hash is empty or invalid
- On load: check hash first, then `localStorage.getItem('mase-fi-channel')`, then default `home`
- Unknown channel: navigate to `home`

**Test Cases:**
```js
describe('route parsing', () => {
  it('extracts channelId from #/explorer', () => ...);
  it('defaults to home for empty hash', () => ...);
  it('defaults to home for invalid hash', () => ...);
});
```

**Verification:**
- Navigate to `#/home` → hero + daily summaries render
- Navigate to `#/explorer` → project header + feature feed
- Navigate to `#/activity` → dense commit log
- Navigate to `#/about` → neofetch block
- Browser back/forward works between channels
- Scroll to top of feed → older entries lazy-load
- Direct URL `mase.fi/#/about` → loads #about

**Commit after passing.**

---

## Task 6: Boot Sequence [Mode: Delegated]

**Files:**
- Create: `src/boot.js`
- Create: `src/boot.test.js`
- Add boot CSS to: `src/style.css`

**Contracts:**

```js
/**
 * Check if boot should be skipped.
 * True if: prefersReducedMotion, or localStorage boot-seen within 1 week.
 */
export function shouldSkipBoot(prefersReducedMotion) → boolean

/**
 * Run the full boot sequence (3 phases).
 * @param {Promise<object>} dataPromise - fetch promise for updates.json
 * @param {function} onComplete - called with resolved data when boot finishes
 */
export async function runBoot(dataPromise, onComplete) → void

/**
 * Attach replay button handler.
 * @param {function} getDataPromise - returns a fresh fetch promise
 * @param {function} onComplete - same callback as runBoot
 */
export function initReplayButton(getDataPromise, onComplete) → void
```

**Boot phases:**

Phase 1 (~1.5s): POST/kernel lines at 30-60ms intervals. No data dependency. Lines appended to `#boot-overlay`.

Phase 2 (~1.5s): Service lines at 100-200ms intervals. `[ OK ]` in green. Real entry count from data. Fetch fires in parallel with Phase 1 — Phase 2 blocks until fetch resolves or 3s timeout. On timeout: fallback counts, `[FAIL]` line in red.

Phase 3 (~2s): Overlay fades. `setBootAnimating(true)`. Call `initSidebar(data)` and `navigateTo('home', data, false)` — these render real DOM but with elements initially hidden. Then animate: sidebar headers type out, channels stagger in, content types in. `setBootAnimating(false)` when done.

**Skip**: click or keypress aborts via `AbortController`. On abort: instantly show final UI (call `initSidebar` + `navigateTo` without animation), mark boot as seen.

**Replay**: `[▶ boot]` button hides terminal content, shows overlay, re-runs full sequence.

**localStorage key:** `mase-fi-boot-seen` (timestamp). TTL: 7 days.

**Test Cases:**
```js
describe('shouldSkipBoot', () => {
  it('returns true when prefersReducedMotion', () => ...);
  it('returns false with fresh localStorage', () => ...);
  it('returns true with recent boot-seen', () => ...);
  it('returns false with expired boot-seen (>7 days)', () => ...);
});
```

**Verification:**
- First visit: full boot plays (~5s)
- Click during boot: instant UI
- Refresh within 1 week: no boot
- Clear `mase-fi-boot-seen` from localStorage: boot plays again
- `[▶ boot]` button: replays full sequence
- Set `prefers-reduced-motion` in devtools: boot skipped

**Commit after passing.**

---

## Task 7: Search & Command Input [Mode: Delegated]

**Files:**
- Create: `src/search.js`
- Create: `src/search.test.js`
- Add search/autocomplete CSS to: `src/style.css`

**Contracts:**

```js
/**
 * Initialize the command input with dual behavior.
 * @param {{ entries: Array, projects: Array }} data
 */
export function initSearch(data) → void
```

**Search behavior (plain text):**
- Debounced 100ms
- Scoped to current channel's visible `.feed-line` elements
- Fuzzy match via uFuzzy against each line's text content
- Matching lines get `<mark class="search-highlight">` wrapping on matched characters
- Non-matching lines stay visible (highlight-only, no filtering)
- Empty input clears all highlights
- Store original text nodes for cleanup

**Command behavior (`/` prefix):**
- Shows `.autocomplete` dropdown above input bar
- Fuzzy-matches partial input against channel names
- Dropdown items are keyboard-navigable (ArrowUp/Down)
- Enter navigates to selected/best match
- No match: brief "channel not found" inline message (2s auto-clear)
- Escape closes dropdown and clears input

**CSS:**
- `.autocomplete` — absolute position above input bar, dark bg, border, `max-height`
- `.autocomplete__item` — padding, monospace
- `.autocomplete__item--active` — amber accent bg
- `mark.search-highlight` — accent glow background

**Test Cases:**
```js
describe('channel name matching', () => {
  it('matches partial channel names', () => ...);
  it('returns empty for no match', () => ...);
});
```

**Verification:**
- Type "route" → matching text highlighted in feed
- Clear → highlights gone
- Type "/exp" → dropdown shows #explorer
- Enter → navigates to #/explorer
- "/asdf" + Enter → "channel not found"
- Escape → clears

**Commit after passing.**

---

## Task 8: Orchestrator & Mobile [Mode: Direct]

**Files:**
- Rewrite: `src/main.js`
- Add mobile CSS to: `src/style.css`

**Contracts:**

```js
// src/main.js
import { shouldSkipBoot, runBoot, initReplayButton } from './boot.js';
import { initSidebar } from './sidebar.js';
import { initRouter, navigateTo } from './channels.js';
import { initSearch } from './search.js';
import './style.css';

const prefersReducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const dataPromise = fetch('/updates.json').then(r => r.json()).catch(() => ({ entries: [], projects: [] }));

function initApp(data) {
  initSidebar(data);
  initRouter(data, prefersReducedMotion);
  initSearch(data);

  // Navigate to: hash > localStorage > default #home
  const hash = location.hash.replace('#/', '') || localStorage.getItem('mase-fi-channel')?.replace('/', '') || 'home';
  navigateTo(hash, data, prefersReducedMotion);
}

if (shouldSkipBoot(prefersReducedMotion)) {
  dataPromise.then(initApp);
} else {
  runBoot(dataPromise, initApp);
}

initReplayButton(() => fetch('/updates.json').then(r => r.json()), initApp);
```

**Mobile CSS (`@media (max-width: 640px)`):**
- `.sidebar` → `display: none`
- `.mobile-topbar` → visible, flex row, current channel + ▾ button
- `.mobile-dropdown` → full-width overlay below topbar, hidden by default
- `.terminal__body` → single column grid
- `.content` → full width

**Mobile JS** (in sidebar.js): `matchMedia('(max-width: 640px)')` listener toggles between sidebar and topbar rendering. Dropdown toggle shows/hides `.mobile-dropdown`. Tap outside or channel selection dismisses.

**Verification:**
- Full flow: first visit → boot → UI → navigate channels → search
- Return visit → instant load into last channel
- Mobile viewport: top bar, dropdown, channel switching
- Resize across 640px breakpoint: mode switches

**Commit after passing.**

---

## Task 9: Polish & Cleanup [Mode: Direct]

**Files:**
- Modify: `src/style.css` — final polish
- Modify: various JS files — reduced motion gates, animation refinements

**Polish items:**
- Cursor blink: CSS `animation: blink 1.06s step-end infinite` on `.terminal__cursor`
- ASCII hero animation: subtle glitch or character cycle (anime.js `animate` with loop)
- Selection color: `::selection { background: var(--accent-glow); color: var(--accent); }`
- Scrollbar: thin dark minimal (`::-webkit-scrollbar` + `scrollbar-width: thin`)
- View Transitions: wrap `navigateTo` content swap in `document.startViewTransition()` if available
- Focus: `/` key anywhere on page focuses the input with `/` prefix
- Reduced motion: verify all anime.js calls gated behind `!prefersReducedMotion`

**Verification:**
```bash
npm test              # all tests pass
npm run build         # build succeeds, check dist/ size
npx eslint src/       # no lint errors
```

Visual check on dev server: boot → all channels → search → mobile → replay.

**Commit after passing.**

---

## File Operations Summary

**Create:** `src/boot.js`, `src/sidebar.js`, `src/channels.js`, `src/terminal.js`, `src/search.js`, `src/data.js`, `src/fonts/JetBrainsMono-Regular.woff2`, `src/fonts/JetBrainsMono-Bold.woff2`, `src/terminal.test.js`, `src/data.test.js`, `src/channels.test.js`, `src/boot.test.js`, `src/search.test.js`

**Rewrite:** `index.html`, `src/main.js`, `src/style.css`

**Delete (Task 1):** `src/animations.js`, `src/updates.js`, `src/projects.js`, `src/utils.js`, `src/updates.test.js`, `src/projects.test.js`, `src/utils.test.js`

**VPS:** Update `updates.json` projects (add `channel`, remove `flagship` and FreshRSS)

---

## Dependency Graph

```
Task 1 (Foundation) → Task 2 (Terminal) → Task 3 (Data)
                                             ├→ Task 4 (Sidebar)      ─┐
                                             └→ Task 5 (Channels)     ─┼→ Task 6 (Boot)
                                                  └→ Task 7 (Search)   │
                                                                       └→ Task 8 (Orchestrator & Mobile) → Task 9 (Polish)
```

Tasks 4 and 5 can run in parallel. Task 6 depends on both 4 and 5. Task 7 depends on 5. Task 8 ties everything together. Task 9 is the final pass.

---

## Execution
**Skill:** superpowers:subagent-driven-development
- Mode A tasks (1, 2, 3, 8, 9): Opus implements directly
- Mode B tasks (4, 5, 6, 7): Dispatched to subagents
