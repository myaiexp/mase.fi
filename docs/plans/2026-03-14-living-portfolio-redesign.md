# Living Portfolio Redesign

> Redesign mase.fi content display from static card grid + tabbed updates into a weighted activity stream + data-driven project showcase.

## Motivation

- Card grids are generic and visually same-y — every project looks identical
- The tabbed updates default to the slowest-changing view (projects tab), hiding daily activity from returning visitors
- The site should feel alive — a "living portfolio" worth checking back regularly
- Development pace is high (dozens of commits/day across projects), and that velocity should be visible

## Page Structure

```
Hero (100vh) → Updates Stream → Projects Showcase → Footer
```

This reverses the current order of updates and projects. Updates become the first content below the fold.

### Hero

No visual changes. One copy tweak:

- **Before**: "apps, tools, and games I built for myself"
- **After**: "building apps, tools, and games for myself" (present tense, implies ongoing activity)

## Data Model

The flat `updates.json` array evolves into a structured format served from the VPS:

```json
{
  "entries": [
    {
      "date": "2026-03-14",
      "category": "project",
      "project": "Explorer",
      "text": "Round-trip route planning and place discovery",
      "sticky": true
    },
    {
      "date": "2026-03-14",
      "category": "feature",
      "project": "Tracker",
      "text": "Added CSV export with custom date ranges",
      "sticky": true
    },
    {
      "date": "2026-03-14",
      "category": "daily",
      "project": "Explorer",
      "summary": "Refactored route engine, added GPX export support",
      "commits": [
        "Refactor route calculation into separate module",
        "Add GPX file export for planned routes",
        "Fix coordinate rounding in waypoint display"
      ]
    }
  ],
  "projects": [
    {
      "name": "Explorer",
      "url": "https://mase.fi/explorer",
      "desc": "Round-trip route planning and place discovery",
      "flagship": true
    },
    {
      "name": "Yatzy",
      "url": "https://mase.fi/yatzy.html",
      "desc": "Classic Finnish Yatzy for two players",
      "flagship": false
    }
  ]
}
```

### Entry categories

| Category | Source | Sticky | Visual weight | Description field |
| -------- | ------ | ------ | ------------- | ----------------- |
| `project` | Manual (new project announcement) | Yes | Heaviest | `text` |
| `feature` | Manual (notable feature/milestone) | Yes | Medium | `text` |
| `daily` | Automated cron (AI-summarized commits) | No | Lightest | `summary` + `commits[]` |
| `log` | `deployboth` (raw, transient) | No | Not rendered | `text` |

The `text` vs `summary` split is intentional: `project` and `feature` entries have a single `text` string. `daily` entries have a `summary` (AI-generated) plus a `commits` array (expandable). `log` entries are transient intermediates consumed by the cron — never rendered client-side.

### Raw `log` entry schema (transient)

```json
{
  "date": "2026-03-14",
  "category": "log",
  "project": "explorer",
  "text": "Fix coordinate rounding in waypoint display"
}
```

The `project` field is derived from the git remote name or repo directory name during `deployboth`. Each repo's post-receive hook already knows which project it belongs to.

### Automation pipeline

1. `git deployboth` appends raw commit titles as `log` entries to the JSON, tagged with the project name from the post-receive hook
2. A daily cron job:
   - Collects all `log` entries for the current day, grouped by `project`
   - Calls Claude to generate a one-line summary per project from that project's commit messages
   - Appends `daily` entries (with `summary` + `commits` array) to the JSON
   - Removes the consumed `log` entries
3. `project` and `feature` entries are added manually (via `mase-fi-update` helper script)

### Sticky capacity

- Project sticky slots: ~5 globally (oldest by entry `date` drops when a 6th is added)
- Feature sticky slots: ~8 globally (oldest by entry `date` drops when a 9th is added)
- Managed by the `mase-fi-update` helper script when adding new `project`/`feature` entries — it sets `sticky: true` on the new entry and unsets it on the oldest if capacity is exceeded
- Client-side rendering respects the flag; no client-side sticky logic needed

### Projects array

- Replaces hardcoded HTML cards — projects are rendered from data
- `flagship: true` controls variable sizing in the showcase
- Client-side sorts projects by most recent `feature` or `project` entry date (descending) — actively developed projects float to the top

## Updates Stream

### Visual treatment — three weights

**Project announcements** (heaviest):
- Full-width block with subtle `--bg-card` background
- Left accent border: 4px solid `--accent`
- Project name in display font (Bricolage Grotesque, ~1.2rem)
- Description text below in body font
- Date in `--accent-dim`, top-right

**Feature updates** (medium):
- No background fill
- Left accent bar: 2px, dimmer than project entries
- Project name as small badge, text inline
- Slightly larger than daily rows

**Daily summaries** (lightest):
- Single compact row: date, project badge, AI-generated summary
- Small expand chevron on the right
- Expanding reveals indented commit list in muted text
- Accordion: `<details>` + `interpolate-size: allow-keywords` (Chrome/Safari), anime.js fallback for other browsers

### Stream behavior

- Single column, full content width
- No connecting line/rail — varying block sizes create visual rhythm
- Newest entries at top
- Sticky items persist at their chronological position — they don't float to the top, they just remain visible longer as newer items stack above
- No visual dividers between entries — spacing and weight changes are sufficient

### Filtering

- Small pill-bar replaces prominent tabs: `All | Projects | Features | Dev log`
- Filter-to-category mapping: `All` → no filter, `Projects` → `project`, `Features` → `project` + `feature` (cumulative, same as current), `Dev log` → `daily`
- Default view: `All` (unified stream)
- View Transitions API handles filter swap animation
- Replaces the current tab-first interaction model

### Search

- Small magnifying glass icon at the right end of the pill-bar
- Expands into a text input on click
- uFuzzy for client-side fuzzy matching, filters stream in real-time
- Collapses back when empty/blurred
- Subtle — not a prominent UI element

### Scroll animations

- Entries animate in via anime.js `onScroll()` on first viewport entry
- CSS `animation-timeline: view()` for simple opacity/translate reveals where supported

## Projects Showcase

### Layout

- **Desktop**: 2-column CSS Grid
- **Mobile**: single column
- Flagship projects span full width (`grid-column: 1 / -1`)
- Standard projects fill the 2-column grid

### Flagship projects (`flagship: true`)

- Wider padding, display font name at ~1.5rem
- Description visible
- Mini update feed: last 5 entries for that project (filtered from entries data)
- Subtle expand affordance if more updates exist

### Standard projects (`flagship: false`)

- Compact treatment — project name (linked), one-line description inline
- Last 2-3 updates as a tight list beneath, muted text
- Roughly half the vertical height of a flagship

### Sorting

- Auto-sorted by most recent `feature` or `project` category entry date (descending)
- Projects with no recent updates sink to the bottom
- No manual ordering needed

### No per-project imagery

- Differentiation through layout, typography, and spatial treatment only
- No screenshots, icons, or illustrations

## Section Transitions

- No hard dividers or horizontal rules between sections
- Spacing and heading style changes mark boundaries
- Both "Recent updates" and "Projects" headings use uppercase muted style (current pattern)
- Scroll-reveal animations carry through both sections consistently

## Technology

| Concern | Solution |
| ------- | -------- |
| Animations | anime.js 4 (existing) |
| Filter transitions | View Transitions API |
| Scroll reveals | CSS `animation-timeline: view()` + anime.js `onScroll()` fallback |
| Accordions | `<details>` + `interpolate-size: allow-keywords`, anime.js fallback |
| Layout | CSS Grid with span classes |
| Fuzzy search | uFuzzy (only new dependency) |
| Build | Vite 7 (unchanged) |

No framework. No other new dependencies.

## Performance

- Single JSON fetch for both entries and projects data
- No lazy loading initially — add "show more" or intersection-observer loading if volume becomes an issue over time
- View Transitions for filter changes avoid layout thrashing

## What this replaces

- Hardcoded HTML project cards → data-driven rendering from JSON
- Tabbed updates with "Projects" as default → unified weighted stream with "All" as default
- Flat update list with identical rows → three-weight visual treatment
- Static project grid → auto-sorted 2-column layout with variable sizing and per-project mini-feeds
