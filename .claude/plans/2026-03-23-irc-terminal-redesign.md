# IRC Terminal Redesign — Design Spec

> mase.fi reimagined as an IRC/terminal hybrid client. The entire site renders as a terminal application: projects are channels, content is chat-log output, and the UI assembles itself through a TTY boot sequence.

## Core Concept

The site presents as a terminal IRC client. A sidebar lists channels (projects + utility channels), a main content pane renders terminal-styled output per channel, and a command input at the bottom serves as both search and navigation.

The first visit features a TTY boot sequence where the entire UI — borders, sidebar, content — draws itself character-by-character as if rendered by a terminal. Return visits load instantly.

## Layout

### Desktop (>640px)

```
┌─ mase.fi ──────────────────────────────────────── [▶ boot] ─┐
├────────────┬─────────────────────────────────────────────────┤
│            │                                                  │
│ ── home ── │  [channel content area]                          │
│  #home     │                                                  │
│            │  terminal output / chat-log style                │
│ ── proj ── │  per active channel                              │
│  #explorer │                                                  │
│  #tracker  │                                                  │
│  #shapez   │                                                  │
│  #pörssi   │                                                  │
│  #yatzy    │                                                  │
│            │                                                  │
│ ── meta ── │                                                  │
│  #activity │                                                  │
│  #about    │                                                  │
│            │                                                  │
├────────────┼─────────────────────────────────────────────────┤
│            │ mase@fi:~$ _                                     │
└────────────┴─────────────────────────────────────────────────┘
```

- **Window title bar**: decorative chrome with `mase.fi` title and a `[▶ boot]` replay button (top-right).
- **Sidebar**: fixed 200px width. Grouped channels with living activity indicators. Scrollable if overflow.
- **Main content**: fills remaining width. Scrollable. Renders content for the active channel.
- **Input bar**: spans main content area. `mase@fi:~$` prompt with blinking cursor. Dual function:
  - **Plain text**: fuzzy search scoped to active channel. Highlights matches in current view (does not filter out non-matches).
  - **`/` prefix**: channel navigation. Shows autocomplete dropdown as you type, fuzzy-matched against channel names. Enter navigates to best match. No match → brief "channel not found" message.

### Mobile (<640px)

```
┌─────────────────────────┐
│ #home          ▾        │
├─────────────────────────┤
│                         │
│  [channel content]      │
│                         │
├─────────────────────────┤
│ mase@fi:~$ _            │
└─────────────────────────┘
```

- **Top bar**: current channel name with dropdown trigger. Tap `▾` to open full-width channel list overlay. Dismisses on channel selection or outside tap.
- **No persistent sidebar** — full width for content.
- **Same input bar** at bottom.

## Boot Sequence

Plays on first visit. Entire viewport, no layout yet.

### Phase 1 — POST/kernel (~1.5s)

```
BIOS POST... OK
mase.fi kernel 2.0.26 loading
[    0.001] mounting /dev/projects
[    0.012] loading configuration
[    0.034] initializing network interfaces
```

Lines appear rapidly (30-60ms intervals). Monospace, dim text. Authentic Linux boot feel.

### Phase 2 — Services (~1.5s)

```
[  OK  ] Starting project registry...
[  OK  ] Connecting to github.com/myaiexp
[  OK  ] Loading activity feed (47 entries)
[ .... ] Establishing channels
```

Slower pacing. `[ OK ]` in green. Real data woven in (actual entry count from fetched `updates.json`). Animated dots on last line before resolving.

**Fetch coordination**: Phase 1 starts immediately (no data needed). `updates.json` fetch fires in parallel. Phase 2 blocks until fetch completes or times out (3s). On timeout/failure, Phase 2 uses placeholder counts and the site loads with empty content and a terminal error line: `[FAIL] Could not load activity feed — retrying...`

### Phase 3 — UI construction (~2s)

Boot text clears. The terminal UI draws itself:

1. Window chrome borders render character-by-character / line-by-line
2. Sidebar separator draws downward
3. Channel group headers type out (`── home ──`, `── projects ──`, `── meta ──`)
4. Channel names appear one by one with staggered delay
5. `#home` content types into the main area (hero, then daily summaries)
6. Input bar draws at bottom, cursor starts blinking

The UI IS the final output of the boot process — one continuous rendering, not "animation ends, UI appears."

### Skip & Replay

- **Skip**: click anywhere or press any key during boot
- **Return visits**: `localStorage` flag with 1-week TTL. Boot skipped, site loads directly into last-visited channel (stored in `localStorage`). Falls back to `#home` if stored channel no longer exists.
- **Replay**: `[▶ boot]` button in window title bar replays the full sequence

### Reduced Motion

`prefers-reduced-motion`: boot skipped, content appears instantly, cursor still blinks.

## Content Mapping

| Content type     | Source                         | Channel      |
| ---------------- | ------------------------------ | ------------ |
| Daily summaries  | `entries` where `category=daily`  | `#home`      |
| Feature updates  | `entries` where `category=feature` or `category=project` | Per-project channel |
| Git commits      | `entries` where `category=log`    | `#activity`  |
| Project launches | `entries` where `category=project` | Sidebar highlight + per-project |
| Profile/identity | Static content                    | `#about`     |

### `#home`

**Hero area** (top ~6-10 lines): ASCII art or large monospace `mase.fi` text. Tagline below. Subtle ASCII animation.

**Daily summaries** below, chat-log style:

```
[22.03] central-hub  fix: use dynamic viewport for piclaw chat input
[22.03] c-monitor    Remove worktrees, fix runner resume/targeting
```

Timestamps in Finnish DD.MM format. Project name as colored "nick." Sorted by date descending. Terminal-style `-- more --` prompt at bottom for pagination.

### Project channels (e.g. `#explorer`)

**Project info header** — structured terminal output with clickable link:

```
#explorer — Round-trip route planning and place discovery
  url: https://mase.fi/explorer    → Open explorer
  status: active
  last update: 22.03.2026
```

The `→ Open explorer` is a clickable link (opens in new tab) styled as cyan terminal text.

**Feature feed** below:

```
[22.03] Added offline route caching
[18.03] Dark mode support for map tiles
[15.03] Export routes as GPX files
```

### `#activity`

Dense git commit timeline:

```
[22.03] c-monitor    Mobile UI: hide sidebars, stack kanban columns
[22.03] c-monitor    Fix runner launch: send project name, not path
[22.03] piclaw       docs: add mobile + button to image support doc
```

Muted/monochrome. Raw feed.

### `#about`

Neofetch-inspired:

```
        mase@fi
        -------
  OS    mase.fi v2.0
  Host  Central Finland
  Shell building apps, tools, and games

  Stack JS · Vite · Node · Python
  Links github.com/myaiexp

  Projects  12
  Features  47 this month
  Last deploy  2h ago
```

Optional small ASCII art logo to the left. Living stats derived from `updates.json` data:
- **Projects**: count from `.projects` array
- **Features this month**: `category=feature` entries in current calendar month
- **Last deploy**: most recent entry date, shown as relative ("today", "yesterday", "3d ago") — date-level granularity only (no timestamps in data)

## Sidebar

```
── home ──────────
  #home

── projects ──────
  #explorer    2d
  #tracker     5d
  #shapez     1w
  #pörssi     2w
  #yatzy      3w

── meta ─────────
  #activity
  #about
```

- **Active channel**: amber accent color, `>` prefix or background highlight
- **Activity indicators**: relative timestamps (`2d`, `1w`) from most recent entry per project. Muted color.
- **New project highlight**: accent color or `★` marker on channel name when it has a recent `project` category entry
- **Sort order**: project channels by most recent activity
- **Channel names**: defined in `updates.json` project data as a `channel` field (e.g. `"channel": "explorer"`). Short, recognizable, manually controlled.

## Animations & Interactions

- **Boot**: character/line-by-line rendering, UI assembles itself as terminal output
- **Channel switching**: content area clears, first ~3 lines type in with brief typing effect (~200-300ms), remaining content appears instantly. No slide transitions.
- **Blinking cursor**: standard terminal blink rate (~530ms) in input bar
- **ASCII hero**: subtle animation — slow cycle or occasional glitch frame
- **Hover on channels**: subtle highlight, snappy
- **Search**: `<mark>` highlighting with accent background
- **All programmatic animations**: anime.js 4. CSS for simple state transitions (hover, focus).

## Typography & Color

### Font

Self-hosted monospace font via `@font-face`, bundled by Vite. **JetBrains Mono** (open source, excellent legibility). Weights: Regular (400) and Bold (700). Single font family — hierarchy through weight, color, and size only.

No CDNs. No Google Fonts.

### Color Palette

Extended from current, adding terminal-standard accent colors:

```
--bg:           #09090b     near-black (keep)
--bg-surface:   #131316     sidebar background
--bg-card:      #18181c     active channel content area
--text:         #fafafa     primary text
--text-dim:     #a1a1aa     secondary text
--text-muted:   #52525b     timestamps, indicators
--accent:       #e8a308     amber — active channel, highlights, primary accent
--green:        #22c55e     [ OK ] in boot, status indicators
--red:          #ef4444     boot errors
--cyan:         #06b6d4     links, URLs
--border:       #27272a     box-drawing characters, separators
```

## Technical Architecture

### Module Structure

```
src/
  main.js         orchestrator: fetch data, init boot or direct load
  boot.js         boot sequence animation, skip logic, replay
  sidebar.js      channel list rendering, grouping, indicators, mobile dropdown
  channels.js     channel content renderers (home, project, activity, about)
  terminal.js     shared primitives: typing effect, timestamps, prompt, formatting
  search.js       command input: / navigation + fuzzy search highlighting
  style.css       all styles
```

### Data

Same `updates.json` contract. Changes to `.projects` objects:
- **Add** `channel` field (short name for routing/display)
- **Remove** `flagship` field (no longer used — all project channels render uniformly)

```json
{
  "name": "Explorer",
  "channel": "explorer",
  "url": "https://mase.fi/explorer",
  "desc": "Round-trip route planning and place discovery"
}
```

**Entry → channel mapping**: At init, build a lookup map from `project.name` (case-insensitive) → `project.channel`. Entries are matched via `entry.project` against this map. This is the same join logic as the current `getProjectEntries()` function, just routed to channels instead of cards.

**Non-listed projects** (e.g. `c-monitor`, `piclaw`, `central-hub`): These are internal tools without entries in `.projects`. Their entries appear in `#home` (daily summaries) and `#activity` (commit log) as plain text project nicks — no channel link, no sidebar entry. Clicking the nick does nothing. Only projects in the `.projects` array get channels.

No other backend changes.

### Routing

Hash-based: `#/explorer`, `#/activity`, `#/about`, `#/home` (default). Lightweight, no library. Browser back/forward works. Bookmarkable.

### Dependencies

- **Keep**: anime.js 4, uFuzzy
- **Add**: JetBrains Mono font files (self-hosted)
- **Remove**: Google Fonts (Bricolage Grotesque, DM Sans)
- **No new npm deps**

### Build & Deploy

Unchanged: Vite 7 build, same `production` remote, same post-receive hook.
