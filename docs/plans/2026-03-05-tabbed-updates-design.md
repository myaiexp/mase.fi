# Tabbed Updates with Auto-Generated Dev Log

> Approved 2026-03-05

## Problem

The updates list is a flat chronological log. As project activity increases, the list becomes too long for casual visitors to parse, while also not being comprehensive enough to serve as a full dev log.

## Solution

Three-tab progressive disclosure with auto-generated commit entries.

### Data Model

Single JSON file on VPS at `/var/www/html/updates.json`. Entries are objects with:

- `date` — ISO format (`YYYY-MM-DD`)
- `project` — repo directory basename (e.g., `poe-crafting`, `tracker`)
- `text` — human-readable description
- `category` — one of `project`, `feature`, `log`

Stored newest-first.

### Categories

| Category | What it covers | How it's added |
|----------|---------------|----------------|
| `project` | New project launches | Manual |
| `feature` | Notable features, milestones, redesigns | Manual |
| `log` | Every deployed commit | Auto via deployboth |

### Tab UI

Three tabs below the "Recent updates" heading:

- **Projects** (default) — shows `project` only
- **Features** — shows `project` + `feature`
- **Everything** — shows all categories

Tabs are cumulative — each is a superset of the previous.

**Visual:** Understated text tabs. Active tab gets accent color underline. Inactive tabs in `--text-secondary`. No background pills.

**Animation:** Anime.js fade on list items during tab switch, ~150ms.

### Auto-Generation

The `git deployboth` alias gets extended to append commit data to the VPS JSON after pushing:

1. Extract commit title: `git log -1 --format=%s`
2. Extract commit date: `git log -1 --format=%cs`
3. Infer project name from repo directory basename
4. SSH to VPS, prepend entry to `/var/www/html/updates.json`

**Title only** — no commit description body. This keeps entries at the "what happened" level without exposing implementation details (important for private repos with competitive advantages).

### Manual Entry

For `project` and `feature` entries: a helper script or direct SSH to prepend entries to the JSON. Claude Code can do this as part of deploying new projects.

### Homepage Rendering

- JS fetches `/updates.json` on page load
- Renders into `.updates-list` based on active tab
- Dates formatted to Finnish format (`DD.MM.YYYY`) client-side
- Scroll-reveal animations apply to rendered entries

### Migration

Existing 13 hardcoded entries get categorized and moved into the initial `updates.json`. The HTML `<ul>` becomes an empty container populated by JS.

### Privacy

All repos included (public and private). Commit titles are safe to expose — they describe "what" not "how." Commit descriptions (which may contain implementation details) are never sent.
