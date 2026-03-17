# Living Portfolio Redesign — Implementation Plan

**Goal:** Redesign mase.fi content display from static card grid + tabbed updates into a weighted activity stream + data-driven project showcase.

**Architecture:** Single JSON fetch provides both `entries` and `projects` arrays. Frontend splits into focused modules (`animations.js`, `updates.js`, `projects.js`) orchestrated by a thin `main.js`. Updates stream renders three visual weights (project/feature/daily) in a unified chronological feed. Projects section renders from data with flagship/standard variants and per-project mini-feeds. VPS-side scripts updated for new JSON shape, plus a new daily cron for AI commit summaries.

**Tech Stack:** Vite 7, anime.js 4, uFuzzy (new), View Transitions API, CSS `interpolate-size`, vanilla JS modules

**Spec:** `docs/plans/2026-03-14-living-portfolio-redesign.md`

---

## File Structure

```
src/
  main.js          → thin orchestrator: single fetch, passes data to modules
  animations.js    → hero animations, mouse glow, click ripples, scrollReveal() helper
  updates.js       → stream rendering (3 weights), pill-bar filtering, search, accordions
  projects.js      → project cards from data, flagship/standard variants, mini-feeds, sorting
  style.css        → all styles (single file, CSS has no import cost with Vite)
index.html         → section reorder, remove hardcoded cards/tabs, new containers
~/.local/bin/
  git-deployboth       → jq path change for new JSON shape
  mase-fi-update       → jq path change + sticky capacity enforcement
VPS:
  /usr/local/bin/mase-fi-daily-summary  → new: cron script for AI commit summaries
```

---

## Chunk 1: Data Layer + Infrastructure

### Task 1: Migrate JSON format + update scripts [Mode: Direct]

**Files:**
- Modify: `~/.local/bin/git-deployboth`
- Modify: `~/.local/bin/mase-fi-update`
- Modify: `src/main.js` (temporary backward-compat shim)

**Contracts:**

`git-deployboth` — jq command changes from:
```
'[{date: $date, project: $project, text: $text, category: "log"}] + .'
```
to:
```
'.entries = [{date: $date, project: $project, text: $text, category: "log"}] + .entries'
```

Also update the file-creation guard from `echo '[]'` to `echo '{"entries":[],"projects":[]}'` (both in `deployboth` and `mase-fi-update`).

`mase-fi-update` — same jq path change, plus:
- Insert entry with `sticky: true`: `.entries = [{date: $date, project: $project, text: $text, category: $category, sticky: true}] + .entries`
- After insert, enforce sticky capacity per category. The limit is passed as a variable (`$limit`, 5 for project, 8 for feature). Use jq to:
  1. Collect indices of entries matching `category == $C and sticky == true`
  2. If count exceeds `$limit`, set `sticky: false` on all but the newest `$limit` entries of that category
- Update file-creation guard to write `{"entries":[],"projects":[]}` instead of `[]`

`main.js` — temporary shim in fetch handler:
```js
const data = await res.json();
const entries = Array.isArray(data) ? data : data.entries;
```

**VPS migration (one-shot via SSH):**
- Read current flat array from `/var/www/html/updates.json`
- Wrap as `{"entries": <array>, "projects": [<seed>]}`
- Write atomically (`.tmp` + `mv`)
- Seed `projects` array:
```json
[
  {"name": "FreshRSS", "url": "https://mase.fi/rss/", "desc": "Self-hosted RSS reader with a custom dark theme", "flagship": false},
  {"name": "Explorer", "url": "https://mase.fi/explorer", "desc": "Round-trip route planning and place discovery", "flagship": true},
  {"name": "Personal Tracker", "url": "https://mase.fi/tracker", "desc": "Daily habit tracking with streaks, history, and data export", "flagship": false},
  {"name": "Shapez 2 Solver", "url": "https://mase.fi/shapez", "desc": "Figure out how to build any shape in Shapez 2", "flagship": false},
  {"name": "Pörssisähkö", "url": "https://mase.fi/porssi.html", "desc": "Finnish electricity spot prices at a glance", "flagship": false},
  {"name": "Yatzy", "url": "https://mase.fi/yatzy.html", "desc": "Classic Finnish Yatzy for two players", "flagship": false}
]
```
Only Explorer is flagship initially. More projects will be added after implementation as a test of the data-driven system.

**Constraints:**
- Deploy the `main.js` compat shim FIRST (via `git deployboth`), THEN migrate the VPS JSON — ensures zero downtime
- The compat shim is removed in Task 2

**Verification:**
1. `curl -s https://mase.fi/updates.json | jq 'keys'` → `["entries", "projects"]`
2. Site still renders updates correctly with the compat shim
3. `mase-fi-update feature test-project "Test entry"` → entry appears in `.entries` with `sticky: true`
4. Clean up the test entry

**Commit after passing.**

---

## Chunk 2: Frontend — Updates Stream

### Task 2: Module split + updates stream rendering [Mode: Delegated]

**Files:**
- Create: `src/animations.js`
- Create: `src/updates.js`
- Rewrite: `src/main.js`
- Modify: `src/style.css`
- Modify: `index.html`

**Contracts:**

`src/animations.js`:
```js
/** Initialize hero animations, mouse glow, click ripples. Skips if prefersReducedMotion. */
export function initAnimations(prefersReducedMotion: boolean): void

/**
 * Animate elements in on scroll entry. Reusable for any section.
 * Uses CSS animation-timeline: view() where supported (check via CSS.supports()),
 * falls back to anime.js onScroll() otherwise.
 * Skips entirely if prefersReducedMotion — sets opacity:1/transform:none directly.
 */
export function scrollReveal(selector: string, prefersReducedMotion: boolean): void

/** Attach click ripple handlers to elements matching selector. */
export function initCardRipples(selector: string): void
```

`src/updates.js`:
```js
/**
 * Initialize the updates stream: render pill-bar, render entries, attach filter handlers.
 * @param entries - The entries array from updates.json
 * @param prefersReducedMotion - Reduced motion preference
 */
export function initUpdates(entries: Entry[], prefersReducedMotion: boolean): void
```

Internal functions (not exported, but contracts matter for implementation):
- `renderProjectEntry(entry)` → DOM node: full-width block, bg-card, 4px accent left border, display font name (~1.2rem), description, date top-right
- `renderFeatureEntry(entry)` → DOM node: no background, 2px `--accent-dim` left bar, badge + inline text
- `renderDailyEntry(entry)` → DOM node: compact row with `<details>` accordion for commits
- `filterEntries(entries, filter)` → filtered array. Always excludes `log` category first, then applies pill filter:
  - `'all'` → all non-log entries
  - `'project'` → `category === 'project'`
  - `'feature'` → `category === 'project' || category === 'feature'` (cumulative)
  - `'daily'` → `category === 'daily'`
- `renderStream(entries, container)` → clear container, append entries, trigger scroll reveals

`src/main.js`:
```js
/** Thin orchestrator. Single fetch, passes data to modules. */
import { initAnimations, scrollReveal } from './animations.js';
import { initUpdates } from './updates.js';
// import { initProjects } from './projects.js';  // Task 3
```

`index.html` changes:
- Section order: hero → updates → projects → footer
- Tagline: "building apps, tools, and games for myself"
- Updates section HTML: `<section class="updates"><h2>Recent updates</h2><div class="updates-controls"></div><div class="updates-stream"></div></section>`
- Remove hardcoded tab buttons (pill-bar rendered by JS)
- Keep apps section container but empty it (cards removed, populated in Task 3)

`style.css` additions:
- `.updates-controls` — flex row, pill bar left, search right (search icon added in Task 4)
- `.pill-bar` / `.pill-btn` / `.pill-btn.active` — small rounded pills, subtler than current tabs
- `.stream-entry` — base class for all entries
- `.stream-entry--project` — `--bg-card` background, 4px `--accent` left border, display font
- `.stream-entry--feature` — 2px `--accent-dim` left border, no background
- `.stream-entry--daily` — compact row
- `.stream-entry__date`, `__project-badge`, `__text`, `__summary`, `__chevron`
- `details.stream-commits` — expandable commit list
- `interpolate-size: allow-keywords` on `details` where supported
- Remove old: `.tab-btn`, `.update-item`, `.update-date`, `.update-project`, `.update-text`
- Responsive: project entry date moves above content on mobile

**Constraints:**
- Pill-bar labels and filter values: `All` (default) | `Projects` | `Features` | `Dev log`
- View Transitions API for filter swaps: `document.startViewTransition(() => renderStream(...))`, with fallback to direct render if API unavailable
- `<details>` accordion: detect `interpolate-size` support via `CSS.supports()`. If supported, pure CSS animation. Otherwise, anime.js `toggle` event handler for height animation.
- `log` category entries are never rendered — `filterEntries` strips them before any pill filter
- Scroll reveals via `scrollReveal()` called after each render cycle
- Section headings: `.updates-heading` must use uppercase muted style (existing pattern: `font-size: 1rem, font-weight: 600, color: --text-muted, text-transform: uppercase, letter-spacing: 0.08em`). Projects heading in Task 3 must match.

**Verification:**
1. `npm run dev` → page loads, updates stream renders below hero
2. Seed test data if needed: use `mase-fi-update` to create a `project` and `feature` entry, manually add a `daily` entry with commits array via SSH jq
3. All 3 entry types visually distinct (project = bg + thick accent border, feature = thin border, daily = compact with chevron)
4. Pill-bar filtering works: each filter shows correct subset, `log` entries never appear
5. Daily entry accordion expands/collapses smoothly
6. Mobile layout (≤640px) stacks properly
7. Reduced motion: all elements visible immediately, no animations

**Commit after passing.**

---

## Chunk 3: Frontend — Projects + Search + Cron

### Task 3: Projects showcase (data-driven) [Mode: Delegated]

**Files:**
- Create: `src/projects.js`
- Modify: `src/main.js` (uncomment initProjects import/call)
- Modify: `src/style.css`
- Modify: `index.html`

**Contracts:**

`src/projects.js`:
```js
/**
 * Render data-driven project cards with flagship/standard variants and per-project mini-feeds.
 * @param entries - Full entries array (for mini-feeds and sorting)
 * @param projects - Projects array from updates.json
 * @param prefersReducedMotion - Reduced motion preference
 */
export function initProjects(entries: Entry[], projects: Project[], prefersReducedMotion: boolean): void
```

Internal functions:
- `sortProjects(projects, entries)` → projects sorted by most recent `feature`/`project` entry date (descending). Projects with no matching entries go to bottom.
- `renderFlagshipCard(project, projectEntries)` → DOM node: full-width, display font name ~1.5rem, description, mini-feed (last 5 entries for this project from all categories), expand affordance if >5
- `renderStandardCard(project, projectEntries)` → DOM node: compact, name as link, one-line desc, last 2-3 entries as tight list
- `getProjectEntries(entries, projectName)` → entries filtered by project name match

`index.html`:
- Rename apps section: `<section class="projects"><h2 class="projects-heading">Projects</h2><div class="projects-grid"></div></section>`

`style.css` additions:
- `.projects` / `.projects-heading` — must match `.updates-heading` pattern exactly (uppercase, muted, same font-size/weight/spacing)
- `.projects-grid` — 2-column CSS Grid, gap matching design
- `.project-card` — base card styling (border, radius, hover, focus-visible, `::after` arrow)
- `.project-card--flagship` — `grid-column: 1 / -1`, larger padding, display font
- `.project-card--standard` — single column
- `.project-card__name`, `__desc`, `__feed`, `__feed-item`
- Remove old: `.apps`, `.apps-grid`, `.app-card`, `.app-name`, `.app-desc`
- Responsive: single column on mobile

**Constraints:**
- Mini-feed entries are simplified: date + text only, no badges (project already known from card context)
- Card ripples: call `initCardRipples('.project-card')` after rendering
- Scroll reveals: call `scrollReveal('.project-card', prefersReducedMotion)` after rendering

**Verification:**
1. All projects from JSON render in the grid
2. Flagship projects span full width with visible mini-feed
3. Standard projects are compact with 2-3 recent updates
4. Sorting reflects actual activity dates
5. Links navigate to correct project URLs
6. Mobile layout is single column

**Commit after passing.**

---

### Task 4: Search (uFuzzy integration) [Mode: Direct]

**Files:**
- Modify: `package.json` (add uFuzzy dependency)
- Modify: `src/updates.js`
- Modify: `src/style.css`

**Contracts:**

In `updates.js`:
- Add search icon button to `.updates-controls` (right side of pill bar)
- On click: icon slides, text input expands (CSS transition, width 0 → ~200px)
- On input (debounced ~100ms): build uFuzzy haystack from entry text/summary strings, search, filter stream to matches, highlight matched substrings with `<mark>`
- On blur when empty: collapse input back to icon
- Search applies within the currently active pill filter

`style.css` additions:
- `.search-toggle` — icon button, right end of `.updates-controls`
- `.search-input` — text input, `width: 0` → `width: 200px` transition
- `.search-input.active` — expanded state
- `mark.search-highlight` — subtle `--accent-glow` background

**Verification:**
1. Click search icon → input expands
2. Type project name → stream filters to matching entries with highlights
3. Works within each pill filter
4. Clear input + blur → collapses
5. No layout thrashing during expand/collapse

**Commit after passing.**

---

### Task 5: Daily AI summary cron job [Mode: Direct]

**Files:**
- Create: VPS `/usr/local/bin/mase-fi-daily-summary` (deployed via SSH)

**Contracts:**

Bash script that:
1. Reads `/var/www/html/updates.json`
2. Extracts `log` entries for today's date
3. Groups by `project`
4. For each project group:
   - If only 1 commit: use commit text directly as summary (skip API call)
   - If 2+ commits: call Anthropic API (Claude Haiku) with prompt: "Summarize these commit messages for [project] into a single concise sentence: [commits]"
   - Create `daily` entry: `{date, category: "daily", project, summary, commits: [original texts]}`
5. Prepend all `daily` entries to `.entries`
6. Remove consumed `log` entries
7. Write atomically

**Constraints:**
- API key: `ANTHROPIC_API_KEY` stored in `/root/.env`, sourced by script
- If API call fails: keep `log` entries, log error, exit non-zero (cron will retry next run, and next run will pick up both days' logs)
- Cron schedule: `55 23 * * *` — VPS timezone must be checked (`timedatectl`). If UTC, adjust to `55 20 * * *` (20:55 UTC = 23:55 EET) or `55 21 * * *` during EEST. Alternatively, use systemd timer with `Europe/Helsinki` timezone.
- Use `jq` for JSON manipulation, `curl` for API calls (consistent with existing scripts)

**Verification:**
1. Seed a few `log` entries for today via `git deployboth` on any project
2. Run `/usr/local/bin/mase-fi-daily-summary` manually
3. `curl -s https://mase.fi/updates.json | jq '.entries[] | select(.category == "daily")'` → shows new daily entries with AI summaries
4. Confirm `log` entries for today are gone
5. Verify JSON is valid: `curl -s https://mase.fi/updates.json | jq . > /dev/null`

**Commit after passing.**

---

## Dependency Graph

```
Task 1 (Data Migration)
  ├──→ Task 2 (Updates Stream)
  │      ├──→ Task 3 (Projects Showcase)
  │      └──→ Task 4 (Search)
  └──→ Task 5 (Cron Job) — independent of frontend tasks
```

---

## Execution
**Skill:** superpowers:subagent-driven-development
- Mode A (Direct) tasks: 1, 4, 5 — Opus implements directly
- Mode B (Delegated) tasks: 2, 3 — Dispatched to subagents
