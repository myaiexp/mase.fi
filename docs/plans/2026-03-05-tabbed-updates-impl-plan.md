# Tabbed Updates Implementation Plan

**Goal:** Replace the flat hardcoded updates list on mase.fi with a three-tab progressive disclosure UI (Projects / Features / Everything), backed by a JSON file on the VPS that's auto-populated by deployboth.

**Architecture:** Client-side JS fetches `/updates.json` (a static file on the VPS), renders entries into an empty `<ul>` based on active tab. The `git deployboth` alias becomes a script that also appends commit titles to the JSON via SSH.

**Tech Stack:** Vanilla JS, anime.js 4.3.6, CSS, jq on VPS, bash scripts

---

### Task 1: Create initial `updates.json` on VPS [Mode: Direct]

**Files:**
- Create: `/var/www/html/updates.json` (on VPS via SSH)

**Contracts:**
- SSH to VPS, write a JSON array with the 13 existing entries categorized as `project` or `feature`
- Each entry: `{ date: "YYYY-MM-DD", project: string, text: string, category: "project"|"feature" }`
- Newest-first ordering
- Set ownership to `www-data:www-data`

**Entry categorization:**

| Date | Text | project field | category |
|------|------|--------------|----------|
| 2026-03-03 | PoE Crafting engine — mod pool analysis, restart economics, recipe catalog | poe-crafting | project |
| 2026-03-01 | Launched PoE Trade Hub with cancellable search and rate limiting | poe-proof | project |
| 2026-03-01 | Central Hub MCP server deployed | central-hub | project |
| 2026-02-26 | Redesigned mase.fi homepage | mase.fi | feature |
| 2026-02-25 | Tori Monitor: AI deal scoring with GPT-4 verdicts | tori-app | feature |
| 2026-02-25 | Started Mindmap — D3-based vault visualizer | mindmap | project |
| 2026-02-17 | Rebuilt Explorer as round-trip route planner | explorer | feature |
| 2026-02-10 | Tracker: history view with weekly completion tracking | tracker | feature |
| 2026-01-28 | Added Pörssisähkö | singlepagers | project |
| 2026-01-18 | Added Shapez 2 Solver | shapez2-solver | project |
| 2026-01-15 | Added Yatzy game | singlepagers | project |
| 2026-01-09 | Added admin dashboard and dynamic project cards | mase.fi | feature |

**Verification:**
- `curl -s https://mase.fi/updates.json | jq length` → 13
- `curl -s https://mase.fi/updates.json | jq '.[0].category'` → "project"

**Commit after passing.**

---

### Task 2: Replace hardcoded HTML with tab skeleton [Mode: Direct]

**Files:**
- Modify: `/home/mse/Projects/mase.fi/index.html` (lines 68-125)

**Contracts:**
- Replace the entire updates `<section>` (lines 68-125) with:
  - Same `<h2 class="updates-heading">`
  - New `<nav class="updates-tabs">` with three `<button class="tab-btn">` elements
  - Buttons carry `data-filter` attributes: `"project"`, `"feature"`, `"all"`
  - First button has `class="tab-btn active"` (Projects is default)
  - Empty `<ul class="updates-list">` (JS populates it)

**Constraints:**
- Use semantic `<nav>` with `aria-label="Update filters"`
- Use `<button>` not `<a>` — these are interactive controls

**Verification:** `npm run dev` — heading + three tab buttons visible, empty list area below.

**Commit after passing.**

---

### Task 3: Add tab styles to CSS [Mode: Direct]

**Files:**
- Modify: `/home/mse/Projects/mase.fi/src/style.css`

**Contracts:**
- Add `.updates-tabs` (flex, gap, margin-bottom)
- Add `.tab-btn` (no background, transparent border-bottom 2px, `--text-secondary` color, `--font-body`)
- Add `.tab-btn:hover` (color `--text`)
- Add `.tab-btn.active` (color `--accent`, border-bottom-color `--accent`)
- Add `.tab-btn:focus-visible` (outline with `--accent`)
- Add responsive rule in `@media (max-width: 640px)` — smaller gap for tabs

**Constraints:**
- Understated text tabs — no pill buttons, no backgrounds
- `font-family: var(--font-body)` explicitly set (buttons don't inherit font in all browsers)
- Existing `prefers-reduced-motion` wildcard rule already covers tab transitions

**Verification:** Visual — tabs styled as minimal text with accent underline on active.

**Commit after passing.**

---

### Task 4: Fetch, render, tab switching, and animation [Mode: Delegated]

**Files:**
- Modify: `/home/mse/Projects/mase.fi/src/main.js`

**Contracts:**

```javascript
/** Format "YYYY-MM-DD" → "DD.MM.YYYY" */
function formatDate(isoDate: string): string

/**
 * Filter entries by tab. Cumulative:
 * "project" → category === "project"
 * "feature" → category === "project" || "feature"
 * "all" → everything
 */
function filterEntries(entries: Entry[], filter: string): Entry[]

/** Create <li class="update-item"> with <time> and <span>. Sets opacity:0 + translateY if animating. */
function createUpdateItem(entry: Entry, skipAnimation: boolean): HTMLLIElement

/** Clear list, insert filtered items, animate them in with stagger. */
function renderUpdates(entries: Entry[], list: HTMLUListElement, prefersReducedMotion: boolean): void
```

Initialization:
- Fetch `/updates.json` on load, render Projects tab
- Tab click handler: update active class, re-render with new filter
- Skip re-render if clicking already-active tab
- Graceful error handling: if fetch fails, list stays empty, tabs still visible

**Constraints:**
- Remove the static scroll-reveal for `.update-item` (lines 40-51) — items are now dynamic
- Remove `.update-item` from the reduced-motion fallback selector (line 126)
- Updates init block goes outside the `if (!prefersReducedMotion)` block — it handles reduced motion internally
- Animation: 400ms duration, 40ms stagger, `outExpo` ease (snappier than original scroll reveal)
- Uses existing `animate` and `stagger` imports from animejs

**Verification:**
- Page loads → Projects tab shows ~8 entries (all `project` category)
- Click Features → shows ~13 entries (projects + features)
- Click Everything → same as Features for now (no `log` entries yet)
- Click back to Projects → re-renders with fade animation
- DevTools `prefers-reduced-motion: reduce` → items appear instantly
- Network tab → single `/updates.json` fetch, no refetch on tab switch

**Commit after passing.**

---

### Task 5: Replace deployboth alias with a script [Mode: Delegated]

**Files:**
- Create: `/home/mse/.local/bin/git-deployboth` (executable)
- Modify: `/home/mse/.config/git/config` (remove line 7: the deployboth alias)

**Contracts:**
- Push to origin (required, fail-fast)
- Check for `production` remote — if missing, skip production push and log, exit 0
- Push to production
- SSH to VPS: prepend a `log` entry to `/var/www/html/updates.json`
  - date: `git log -1 --format=%cs`
  - project: `basename "$(git rev-parse --show-toplevel)"`
  - text: `git log -1 --format=%s`
  - category: `"log"`
- Use `ssh vps bash -s -- "$args" << 'HEREDOC'` pattern for safe quoting of commit titles with special chars
- Use `jq --arg` on VPS for JSON-safe escaping
- If SSH/JSON update fails: print warning, don't fail the script (deploy already succeeded)
- Create JSON file as `[]` if it doesn't exist yet

**Constraints:**
- Named `git-deployboth` on PATH so `git deployboth` discovers it as a subcommand
- `set -e` for push failures, but SSH append uses `&& ... || ...` to catch gracefully
- No deduplication — double-runs create double entries (acceptable, rare scenario)

**Verification:**
- From a project with production remote: `git deployboth` → pushes both, appends entry
- `ssh vps "jq '.[0]' /var/www/html/updates.json"` → shows new log entry
- From a project without production remote: only pushes to origin, prints skip message
- Test with special chars in commit title: `git commit --allow-empty -m "Fix 'edge case' with \"quotes\""`

**Commit after passing.**

---

### Task 6: Create manual entry helper script [Mode: Direct]

**Files:**
- Create: `/home/mse/.local/bin/mase-fi-update` (executable)

**Contracts:**
- Usage: `mase-fi-update <category> <project> <text> [date]`
- category: `"project"` or `"feature"` only — reject anything else
- date: optional, defaults to today (`date +%Y-%m-%d`)
- SSH to VPS, prepend entry to updates.json using same `bash -s` + heredoc + `jq --arg` pattern as deployboth
- Print confirmation on success

**Constraints:**
- Validate category is `project` or `feature`
- Show usage on missing args
- Same safe quoting pattern as deployboth

**Verification:**
- `mase-fi-update project test-app "Test entry"` → adds entry
- `mase-fi-update` → shows usage
- `mase-fi-update log tracker "test"` → rejects invalid category

**Commit after passing.**

---

## Execution
**Skill:** superpowers:subagent-driven-development
- Mode A tasks (Direct): Tasks 1, 2, 3, 6
- Mode B tasks (Delegated): Tasks 4, 5
