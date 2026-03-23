# mase.fi

> Personal homepage as an IRC/terminal hybrid client at https://mase.fi

## Stack

- **Build:** Vite 7 (vanilla JS, no framework)
- **Animations:** anime.js 4
- **Search:** uFuzzy (fuzzy search + channel autocomplete)
- **Testing:** Vitest 4 (jsdom environment for DOM tests)
- **Linting:** ESLint (flat config)
- **Font:** JetBrains Mono (self-hosted woff2, Regular + Bold)
- **Styling:** Custom CSS with variables — no Tailwind, no utility classes

## Structure

```
index.html          — terminal shell: boot overlay, sidebar, content, input bar
src/main.js         — orchestrator: fetch, boot-or-skip, init all modules
src/boot.js         — 3-phase TTY boot sequence, skip/replay, localStorage TTL
src/sidebar.js      — channel groups, activity indicators, mobile dropdown
src/channels.js     — hash-based router, channel renderers, lazy loading
src/terminal.js     — shared primitives: dates, nicks, lines, typing effect
src/data.js         — project maps, channel lists, entry filtering
src/search.js       — dual-mode input: fuzzy search + /channel navigation
src/style.css       — all styles, CSS variables, responsive, boot/feed/sidebar
src/fonts/          — JetBrains Mono woff2 (Regular, Bold)
src/*.test.js       — Vitest unit tests (68 tests across 5 files)
eslint.config.js    — ESLint flat config with browser globals
```

## Architecture

- **Layout:** Two-pane terminal — fixed sidebar (200px) + scrollable content area
- **Routing:** Hash-based (`#/home`, `#/explorer`, `#/about`), browser back/forward, localStorage last-channel
- **Channels:** `#home` (daily summaries), project channels (feature feed), `#activity` (commit log), `#about` (neofetch stats)
- **Boot:** 3-phase TTY animation on first visit (7-day localStorage TTL), skip on click/key, `[▶ boot]` replay
- **Search:** Plain text fuzzy-highlights feed lines, `/` prefix navigates to channels with autocomplete
- **Mobile (<640px):** Sidebar hidden, top bar with dropdown channel picker
- **Scroll model:** Chat-style (newest at bottom), IntersectionObserver lazy loads older entries on scroll-up

## Content Management

- **Projects:** Data-driven from `updates.json` `.projects` array with `channel` field for routing (e.g. `"channel": "explorer"`)
- **Updates:** Activity entries from `updates.json` `.entries` array, routed to channels by category: `daily` → `#home`, `log` → `#activity`, `feature`/`project` → per-project channel
- **Auto-generated entries:** `git deployboth` appends commit titles as `log` category entries. Manual `project`/`feature` entries via `mase-fi-update`.
- **Daily summaries:** Systemd timer at 23:55 Finnish time. Consumes `log` entries, creates `daily` entries.
- **JSON format:** `{"entries": [...], "projects": [...]}` — single fetch provides both arrays
- Dates: ISO in JSON, Finnish DD.MM format client-side

### Project Visibility Rule

Only list projects with a **public GitHub repo** or **live public deployment**. Internal tools appear only in update entries.

## Demo Convention

Apps requiring login support `?demo` query param (per-app, not centrally).

## Design

- **Background:** `#09090b` (near-black)
- **Accent:** `#e8a308` (golden-orange)
- **Text:** `#fafafa` (off-white), dim `#a1a1aa`, muted `#52525b`
- **Terminal colors:** green `#22c55e`, red `#ef4444`, cyan `#06b6d4`
- **Nick colors:** 8-color palette, deterministic by name hash
- **Effects:** Boot animation, typing effects, View Transitions for channel switches, blinking cursor

## Deployment

- **Remote:** `production` → `vps:/var/repo/homepage.git` (SSH alias)
- **Push command:** `git push production main`
- Post-receive hook runs `npm install` → `vite build` → copies `dist/` to `/var/www/html/`
- Also push to `origin` (GitHub) to keep the public repo in sync

---

## Current Phase

**No active phase.** IRC terminal redesign complete.

### Decisions from previous phases

- **Module architecture:** `main.js` orchestrates boot/skip decision, each domain owns its module
- **JSON shape:** `{entries: [], projects: []}` — single fetch, dual arrays. Projects have `channel` field for routing.
- **Sticky capacity:** `mase-fi-update` enforces limits (2 project, 3 feature) server-side via jq
- **Channel mapping:** `entry.project` matched case-insensitively against `project.name`, routed via `project.channel`
- **Scroll model:** Chat-style (newest at bottom), lazy-loads older entries via IntersectionObserver sentinel
- **Boot skip logic:** `prefers-reduced-motion` or `mase-fi-boot-seen` localStorage within 7 days
- **View Transitions:** Used for channel switches with direct-render fallback

---

## Doc Management

This project splits documentation to minimize context usage. Follow these rules:

### File layout

| File                         | Purpose                                                      | When to read                              |
| ---------------------------- | ------------------------------------------------------------ | ----------------------------------------- |
| `CLAUDE.md` (this file)      | Project identity, structure, patterns, current phase pointer | Auto-loaded every session                 |
| `.claude/phases/current.md`  | Symlink → active phase file                                  | Read when starting phase work             |
| `.claude/phases/NNN-name.md` | Phase files (active via symlink, completed ones local-only)  | Only if you need historical context       |
| `.claude/ideas.md`           | Future feature ideas, tech debt, and enhancements            | When planning next phase or brainstorming |
| `.claude/plans/`             | Design docs and implementation plans from brainstorming      | When implementing or reviewing designs    |
| `.claude/references/`        | Domain reference material (specs, external docs, data sources) | When you need domain knowledge          |
| `.claude/[freeform].md`      | Project-specific context docs (architecture, deployment, etc.) | As referenced from this file            |

### Phase transitions

When a phase is completed:

1. **Condense** — extract lasting decisions from the active phase file and add to "Decisions from previous phases". Keep each to 1-2 lines.
2. **Archive** — remove the `current.md` symlink. The completed phase file stays but is no longer committed.
3. **Start fresh** — create a new numbered phase file from `~/.claude/phase-template.md`, then symlink `current.md` → it.
4. **Update this file** — update the "Current Phase" section above.
5. **Prune** — remove anything from this file that was phase-specific and no longer applies.

### What goes where

- **This file**: project-wide truths (stack, structure, patterns, conventions). Things that are true regardless of which phase you're in.
- **Phase doc**: goals, requirements, architecture decisions, implementation notes, and anything specific to the current body of work.
- **Process rules**: delegation and modularization standards live in `~/.claude/process.md` (global, not per-project).
