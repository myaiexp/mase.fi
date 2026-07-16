# mase.fi

> Personal homepage as an IRC/terminal hybrid client at https://mase.fi

## Architecture

- **Routing:** Hash-based (`#/home`, `#/activity`, `#/<project>`), browser back/forward; defaults to `#home` via `parseHash()` (no last-channel persistence — only the boot animation uses localStorage)
- **Channels:** `#home` (daily summaries, nick'd per-project for a color-coded standup via `pickNick` in `data.js`), project channels (feature feed), `#activity` (commit log). Registry built in `channels.js` from `home` + `updates.json` projects + `activity` — no `#about` channel (removed in the rework).
- **Boot:** 3-phase TTY animation on first visit (7-day localStorage TTL), skip on click/key; replay via the `window.__maseReplayBoot()` console helper (no visible replay button)
- **Search & commands:** Plain text fuzzy-highlights feed lines; `/` prefix navigates to channels with autocomplete and runs easter-egg slash commands (`/help`, `/whoami`, `/uptime`, `/date`, `/clear` — registry in `slash-commands.js`, surfaced in the `/` popup on name-prefix match, output as ephemeral IRC server-notice lines in the feed via `command.js`). Search highlighting lives in `command-search.js`; `?` shows the help panel.
- **Mobile (<640px):** Sidebar hidden, top bar with dropdown channel picker
- **Scroll model:** Chat-style (newest at bottom), IntersectionObserver lazy loads older entries on scroll-up

## Content Management

- **Projects:** Data-driven from `updates.json` `.projects` array with `channel` field for routing (e.g. `"channel": "explorer"`)
- **Updates:** Activity entries from `updates.json` `.entries` array, routed to channels by category: `daily` → `#home`, `log` → `#activity`, `feature`/`project` → per-project channel
- **Auto-generated entries:** `git deployboth` appends commit titles as `log` category entries. Manual `project`/`feature` entries via `mase-fi-update`, which enforces sticky capacity limits server-side via `jq` (2 `project` entries, 3 `feature` entries).
- **Channel mapping:** `entry.project` (slug) is matched case-insensitively against `project.slug`, falling back to `project.channel`.
- **Daily summaries:** Systemd timer at 23:55 Finnish time. Groups `log` entries by project; for multi-commit projects calls the **Claude Code CLI** (`claude -p --model sonnet`, headless print mode — absolute path `/home/mase/.local/bin/claude` since the systemd *user* PATH omits `~/.local/bin`; uses `~/.claude` OAuth creds) to generate terse comma-separated highlight summaries, creates `daily` entries. Single-commit projects use the raw commit subject verbatim. Falls back to `"project: N commits"` on timeout/empty/non-zero exit (logged to the journal; a degraded run fires one ntfy alert). Script: `~/.local/bin/mase-fi-daily-summary` (symlink → `scripts/mase-fi-daily-summary`).
- **JSON format:** `{"entries": [...], "projects": [...]}` — single fetch provides both arrays
- Dates: ISO in JSON, Finnish DD.MM format client-side

### Project Visibility Rule

Only list projects with a **public GitHub repo** or **live public deployment**. Internal tools appear only in update entries.

## Demo Convention

Apps requiring login support `?demo` query param (per-app, not centrally).

**Demo links:** A project channel surfaces a `try demo →` chip (hero card + mobile hero line) when the project has a published static demo in the `demos` repo, served at `https://mase.fi/demos/<channel>/`. mase.fi fetches `/demos/manifest.json` (written by the demos repo's `scripts/post-deploy.sh` from its `synced-dirs.txt`) and lights up the chip for any matching channel — adding a demo is a demos-repo-only change, no mase.fi edit needed. See `fetchDemos()` in `data.js` and the `demoLink` branches in `pinned.js`. Absent/404 manifest → no chips (local dev degrades cleanly).

## Design

- **Background:** `#09090b` (near-black)
- **Accent:** `#e8a308` (golden-orange)
- **Text:** `#fafafa` (off-white), dim `#a1a1aa`, muted `#52525b`
- **Terminal colors:** green `#22c55e`, red `#ef4444`, cyan `#06b6d4`
- **Nick colors:** 8-color palette, deterministic by name hash
- **Effects:** Boot animation, typing effects, View Transitions for channel switches, blinking cursor

## Base Components

Shared web components library built from `src/components/` via Vite library mode.

- **Build:** `pnpm build:components` → `dist/base-components.js` (IIFE)
- **URL:** `https://mase.fi/base-components.js`
- Full per-component API (props/attrs/behavior for `<base-text-fit>`, `<base-context-menu>`, etc.): `docs/base-components.md`

## Deploy

- Run `deploy` — pushes to the Forgejo `origin`, which fires a post-receive hook → `sudo forgejo-deploy mase.fi`.
- Server-side build (`/usr/local/bin/forgejo-deploy`, `mase.fi` case): checks out to `/var/www/homepage-build`, runs `CI=true pnpm install --frozen-lockfile && pnpm run build` (build-lock-wrapped, includes `build:components`) as user `mase`, then copies `dist/.` → `/var/www/html` (chowned to www-data). Build failure aborts before the copy, so a broken build can't ship a stale/empty webroot.
- **Components:** `pnpm run build` now includes `build:components` automatically (chained in the script).
- **build-lock:** package.json's `build` and `build:components` scripts already wrap vite in `build-lock`. Do **not** double-prefix (e.g. `build-lock pnpm run build`) — invoke as plain `pnpm run build`.
- **Dev / worktree gates:** pnpm installs devDependencies by default regardless of `NODE_ENV`, so in a fresh worktree just run `pnpm install` and the lint/test/build gates work. (The old npm-era `.npmrc` `include=dev` hack was dropped in the pnpm migration: npm auto-set `omit=dev` under `NODE_ENV=production`, but pnpm does not.)
