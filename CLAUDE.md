# mase.fi

> Personal homepage and project showcase at https://mase.fi

## Stack

- **Build:** Vite 7 (vanilla JS, no framework)
- **Animations:** anime.js 4
- **Search:** uFuzzy (fuzzy search in updates stream)
- **Testing:** Vitest 4
- **Linting:** ESLint (flat config)
- **Fonts:** Bricolage Grotesque (display), DM Sans (body)
- **Styling:** Custom CSS with variables — no Tailwind, no utility classes

## Structure

```
index.html          — the entire site (hero, updates, projects, footer)
src/main.js         — thin orchestrator: single fetch, passes data to modules
src/animations.js   — hero animations, mouse glow, click ripples, scrollReveal()
src/updates.js      — weighted stream (4 entry types), pill-bar, fuzzy search
src/projects.js     — data-driven project cards (flagship/standard), mini-feeds
src/utils.js        — shared helpers (formatDate)
src/style.css       — all styles, CSS variables for colors/spacing/typography
src/*.test.js       — Vitest unit tests for modules
eslint.config.js    — ESLint flat config
```

## Content Management

- **Projects:** Data-driven from `updates.json` `.projects` array — rendered as flagship (full-width) or standard (half-width) cards with per-project mini-feeds. Sorted by most recent activity.
- **Updates:** Weighted activity stream from `updates.json` `.entries` array. Four visual weights: project (heaviest, bg-card), feature (medium, accent border), daily (lightest, accordion), log (GitHub-style commit timeline). Pill-bar filtering (All/Projects/Features/Summaries/Commit log). Log entries hidden from "All" tab. Fuzzy search via uFuzzy with `<mark>` highlighting.
- **Auto-generated entries:** `git deployboth` appends commit titles as `log` category entries to `.entries`. Manual `project`/`feature` entries via `mase-fi-update` (adds `sticky: true`, enforces capacity: 2 project, 3 feature).
- **Daily summaries:** Systemd timer runs daily at 23:55 Finnish time. Consumes `log` entries, groups by project, summarizes via Claude Haiku (single commits used as-is), creates `daily` entries with `{date, category, project, summary, commits[]}`.
- **JSON format:** `{"entries": [...], "projects": [...]}` — single fetch provides both arrays
- Dates use Finnish format: `DD.MM.YYYY` (stored as ISO in JSON, formatted client-side)

### Project Visibility Rule

Only list projects that have either a **public GitHub repo** or a **live public deployment**. Private repos and internal tools stay off the homepage — they can still appear in updates as dev log entries.

## Demo Convention

Apps that require login or personal data (e.g., Tracker, Mindmap) should support a `?demo` query param:
- Bypasses authentication
- Loads hardcoded mock data instead of real data source
- Read-only or sandboxed — no writes to production
- mase.fi links to demos via the project card URL (e.g., `mase.fi/tracker?demo`)

This is implemented per-app, not centrally. Each app owns its own demo experience.

## Design

- **Background:** `#09090b` (near-black)
- **Accent:** `#e8a308` (golden-orange)
- **Text:** `#fafafa` (off-white)
- **Borders:** `#27272a`, hover `#3f3f46`
- **Layout:** max-width 64rem, 2-column grid (1 on mobile)
- **Effects:** gradient mesh background, mouse-following glow, click ripples, scroll-triggered reveals

## Deployment

- **Remote:** `production` → `vps:/var/repo/homepage.git` (SSH alias)
- **Push command:** `git push production main`
- Post-receive hook runs `npm install` → `vite build` → copies `dist/` to `/var/www/html/`
- Also push to `origin` (GitHub) to keep the public repo in sync

---

## Current Phase

**No active phase.** Living portfolio redesign complete.

### Decisions from previous phases

- **Module architecture:** `main.js` is a thin orchestrator — each feature domain owns its module (`animations.js`, `updates.js`, `projects.js`)
- **JSON shape:** `{entries: [], projects: []}` — single fetch, dual arrays. Scripts use `.entries` path for jq operations.
- **Sticky capacity:** `mase-fi-update` enforces limits (2 project, 3 feature) server-side via jq. Client-side just reads the flag.
- **Scroll reveals:** CSS `animation-timeline: view()` with anime.js `onScroll()` fallback, detected via `CSS.supports()`
- **Accordions:** `<details>` with CSS `interpolate-size: allow-keywords`, anime.js height fallback
- **View Transitions:** Used for filter swaps with direct-render fallback

---

## Doc Management

This project splits documentation to minimize context usage. Follow these rules:

### File layout

| File | Purpose | When to read |
|------|---------|-------------|
| `CLAUDE.md` (this file) | Project identity, structure, patterns, current phase pointer | Auto-loaded every session |
| `.claude/phases/current.md` | Active phase: goals, requirements, architecture, implementation notes | Read when starting phase work |
| `.claude/phases/NNN-name.md` | Archived phases (completed) | Only if you need historical context |

### Phase transitions

When a phase is completed:

1. **Condense** — extract lasting decisions from `.claude/phases/current.md` (architecture choices, patterns established, conventions) and add them to the "Decisions from previous phases" section above. Keep each to 1-2 lines.
2. **Archive** — rename `.claude/phases/current.md` to `.claude/phases/NNN-name.md` (e.g., `001-auth-system.md`)
3. **Start fresh** — create a new `.claude/phases/current.md` from `~/.claude/phase-template.md`
4. **Update this file** — update the "Current Phase" section above
5. **Prune** — remove anything from this file that was phase-specific and no longer applies

### What goes where

- **This file**: project-wide truths (stack, structure, patterns, conventions). Things that are true regardless of which phase you're in.
- **Phase doc**: goals, requirements, architecture decisions, implementation notes, and anything specific to the current body of work.
- **Process rules**: delegation and modularization standards live in `~/.claude/process.md` (global, not per-project).
