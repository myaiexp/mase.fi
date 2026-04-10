# mase.fi

> Personal homepage as an IRC/terminal hybrid client at https://mase.fi

## Architecture

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

## Base Components

Shared web components library built from `src/components/` via Vite library mode.

- **Build:** `npm run build:components` → `dist/base-components.js` (IIFE)
- **URL:** `https://mase.fi/base-components.js`
- **Components:** `<base-badge>`, `<base-modal>`, `<base-tabs>`/`<base-tab>`, `<base-dropdown>`/`<base-dropdown-item>`/`<base-dropdown-divider>`
- **Toast:** `window.BaseToast.show(message, type, duration)` — no HTML tag, static API
- **Theming:** Shadow DOM with `base.css` custom properties (`--bg-raised`, `--accent`, `--green`, etc.)

## Deploy

- `git push production main` then `git push origin main` (keep GitHub in sync)
- Post-receive hook: `npm install` → `vite build` → copies `dist/` to webroot
- **Components:** `npm run build:components` must run separately (or use `build:all`). Post-receive hook needs updating to include this.

## Decisions from previous phases

- **Module architecture:** `main.js` orchestrates boot/skip decision, each domain owns its module
- **JSON shape:** `{entries: [], projects: []}` — single fetch, dual arrays. Projects have `channel` field for routing.
- **Sticky capacity:** `mase-fi-update` enforces limits (2 project, 3 feature) server-side via jq
- **Channel mapping:** `entry.project` matched case-insensitively against `project.name`, routed via `project.channel`
- **Boot skip logic:** `prefers-reduced-motion` or `mase-fi-boot-seen` localStorage within 7 days
- **View Transitions:** Used for channel switches with direct-render fallback
