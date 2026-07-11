# mase.fi

> Personal homepage as an IRC/terminal hybrid client at https://mase.fi

## Architecture

- **Routing:** Hash-based (`#/home`, `#/activity`, `#/<project>`), browser back/forward; defaults to `#home` via `parseHash()` (no last-channel persistence — only the boot animation uses localStorage)
- **Channels:** `#home` (daily summaries, nick'd per-project for a color-coded standup via `pickNick` in `data.js`), project channels (feature feed), `#activity` (commit log). Registry built in `channels.js` from `home` + `updates.json` projects + `activity` — no `#about` channel (removed in the rework).
- **Boot:** 3-phase TTY animation on first visit (7-day localStorage TTL), skip on click/key; replay via the `window.__maseReplayBoot()` console helper (no visible replay button)
- **Search & commands:** Plain text fuzzy-highlights feed lines; `/` prefix navigates to channels with autocomplete and runs easter-egg slash commands (`/help`, `/whoami`, `/uptime`, `/date`, `/clear` — registry in `commands.js`, surfaced in the `/` popup on name-prefix match, output as ephemeral IRC server-notice lines in the feed via `command.js`). Search highlighting lives in `command-search.js`; `?` shows the help panel.
- **Mobile (<640px):** Sidebar hidden, top bar with dropdown channel picker
- **Scroll model:** Chat-style (newest at bottom), IntersectionObserver lazy loads older entries on scroll-up

## Content Management

- **Projects:** Data-driven from `updates.json` `.projects` array with `channel` field for routing (e.g. `"channel": "explorer"`)
- **Updates:** Activity entries from `updates.json` `.entries` array, routed to channels by category: `daily` → `#home`, `log` → `#activity`, `feature`/`project` → per-project channel
- **Auto-generated entries:** `git deployboth` appends commit titles as `log` category entries. Manual `project`/`feature` entries via `mase-fi-update`.
- **Daily summaries:** Systemd timer at 23:55 Finnish time. Groups `log` entries by project, calls **helm delegate** (`localhost:9754/api/delegate`, Nous Hermes — no OAuth token) to generate terse comma-separated highlight summaries, creates `daily` entries. Falls back to `"project: N commits"` if delegate is unavailable. Script: `~/.local/bin/mase-fi-daily-summary` (symlink → `scripts/mase-fi-daily-summary`).
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

- **Build:** `npm run build:components` → `dist/base-components.js` (IIFE)
- **URL:** `https://mase.fi/base-components.js`
- **Components:** `<base-badge>`, `<base-modal>`, `<base-tabs>`/`<base-tab>`, `<base-dropdown>`/`<base-dropdown-item>`/`<base-dropdown-divider>`, `<base-select>`/`<base-option>`/`<base-option-group>`, `<base-text-fit>`, `<base-context-menu>`
- **Toast:** `window.BaseToast.show(message, type, duration)` — no HTML tag, static API
- **Text-fit:** `<base-text-fit lines="2" mode="wrap">…</base-text-fit>` — pretext-measured truncation/wrapping of its text content. Attrs: `lines` (max, default `1`; `0` = unlimited), `mode` (`fit` default = ellipsis truncate, `wrap` = balanced binary-search wrap, `justify` = word-spacing justify), `hyphenate` (no-op stub, warns once). Auto-sets `title` to full text; reflows on resize/content-change/font-load. No custom events.
- **Context-menu:** singleton — place one `<base-context-menu>` in the DOM (it listens for `contextmenu` on `document`). Imperative API: `register(id, {selector, items})` (zone matched via `target.closest(selector)`; `items(target, selection)` callback returns an item array, or `[]`/falsy to fall through to the native menu), `unregister(id)`, `show(x, y, items)`, `close()`, `isOpen` getter. Item shape: `{label, action}`, `{separator: true}`, optional `disabled: true`. Keyboard nav (↑/↓/Enter/Esc), viewport-edge flip; closes on outside-click/scroll/blur. No custom events — selection runs the item's `action()`.
- **Theming:** Shadow DOM with `base.css` custom properties (`--bg-raised`, `--accent`, `--green`, etc.)

## Deploy

- Run `deploy` — pushes to the Forgejo `origin`, which fires a post-receive hook → `sudo forgejo-deploy mase.fi`.
- Server-side build (`/usr/local/bin/forgejo-deploy`, `mase.fi` case): checks out to `/var/www/homepage-build`, runs `npm install --production=false && npm run build` (build-lock-wrapped, includes `build:components`) as user `mase`, then copies `dist/.` → `/var/www/html` (chowned to www-data). Build failure aborts before the copy, so a broken build can't ship a stale/empty webroot.
- **Components:** `npm run build` now includes `build:components` automatically (chained in the script).
- **build-lock:** package.json's `build` and `build:components` scripts already wrap vite in `build-lock`. Do **not** double-prefix (e.g. `build-lock npm run build`) — nesting two flocks on `/tmp/helm-build.lock` deadlocks the inner one for 30 min and produces an empty `dist/`. Invoke as plain `npm run build`.
- **Dev / worktree gates:** Helm sessions run with `NODE_ENV=production`, which makes npm auto-set `omit=dev` and skip devDependencies on plain `npm install` — gates would then fail with `eslint: not found`. The committed `.npmrc` (`include=dev`) overrides this: npm reconciles `include` over `omit`, so `npm install` always pulls devDeps regardless of `NODE_ENV`. So in a fresh worktree just run `npm install` and the gates work. (If you ever wipe `.npmrc`, the manual fallback is `npm install --include=dev`.) Harmless for the server build, which already passes `--production=false`.

## Decisions from previous phases

- **Module architecture:** `main.js` orchestrates boot/skip decision, each domain owns its module
- **JSON shape:** `{entries: [], projects: []}` — single fetch, dual arrays. Projects have `channel` field for routing.
- **Sticky capacity:** `mase-fi-update` enforces limits (2 project, 3 feature) server-side via jq
- **Channel mapping:** `entry.project` (slug) matched case-insensitively against `project.slug` (falling back to `project.channel`), routed via `project.channel`
- **Boot skip logic:** `prefers-reduced-motion` or a fresh `mase.boot.last` localStorage stamp within 7 days (force-replay via `window.MASE_FORCE_BOOT = true`)
- **View Transitions:** Used for channel switches with direct-render fallback
