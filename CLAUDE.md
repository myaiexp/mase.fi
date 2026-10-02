# mase.fi

> Personal homepage as an IRC/terminal hybrid client at https://mase.fi

## Architecture

- **Routing:** Hash-based (`#/home`, `#/activity`, `#/<project>`), browser back/forward; defaults to `#home` via `parseHash()` (no last-channel persistence — only the boot animation uses localStorage)
- **Error page:** `404.html` (second Vite entry) + `src/notfound.js` (pure matching ladder, tested) + `src/notfound-page.js` (DOM/probes/countdown) — the smart 404/403 nginx serves for any unmatched mase.fi path via `error_page` in `sites-enabled/default`. Probes parent paths (HEAD), fuzzy-matches routes from `updates.json`, 5s cancellable auto-redirect on a confident match; preview any path as `/404.html?p=/some/path`. Design handoff: `docs/2026-08-24-notfound-design-handoff.md`
- **Channels:** `#home` (daily summaries), project channels (that project's daily summaries + feature entries), `#activity` (commit log). Non-log entries are nick'd by their project, so `#home` reads as a color-coded standup (`pickNick` in `data-normalize.js`). Registry built in `registry.js` (`buildRegistry`) as `[home, ...projects, activity]`; `channels.js` is the hash-routing orchestrator and re-exports the registry reads as a facade — renderers import `registry.js` directly to keep the import graph acyclic. No `#about` channel (removed in the rework).
- **Boot:** 3-phase TTY animation on first visit (7-day localStorage TTL), skip on click/key; replay via the `window.__maseReplayBoot()` console helper (no visible replay button)
- **Search & commands:** Plain text highlights matching substrings and dims non-matching rows (`applySearch` in `command-search.js` — case-insensitive `includes`, not fuzzy). `/` prefix navigates to channels with autocomplete and runs easter-egg slash commands (`/help`, `/whoami`, `/uptime`, `/date`, `/clear` — registry in `slash-commands.js`, surfaced in the `/` popup on name-prefix match, output as ephemeral IRC server-notice lines in the feed via `command.js`). Global shortcuts: `/` to focus, `?` for help, `g h` / `g a` jump to home / activity.
- **Mobile (≤820px):** Sidebar hidden; sticky bottom tab bar (`#tabbar`) with home + activity + the 4 most-recently-active projects, plus a mobile-only `.hero-line` quick-link row.
- **Scroll model:** Chat-style (newest at bottom), IntersectionObserver lazy loads older entries on scroll-up

## Content Management

- **Store:** `/var/lib/mase-fi/updates.json` (outside the webroot), served by nginx `alias` and fetched as `/updates.json`
- **Hot window + archive:** one fetch holds all non-log entries + the last 90 days of `log`s; older logs lazy-load from `/updates-archive.json` on `#activity` scroll-up (`loadArchive` in `data-archive.js`)
- **Categories → channels:** `daily` → `#home`, `log` → `#activity`, `feature` → per-project channel
- Full pipeline (shape, stats, writers, lock, showcase generator, daily summaries, client archive semantics): `docs/content-pipeline.md`

## Demo Convention

Apps requiring login support `?demo` query param (per-app, not centrally).

**Demo links:** A project channel surfaces a `try demo →` chip (hero card + mobile hero line) when the project has a published static demo in the `demos` repo, served at `https://mase.fi/demos/<channel>/`. mase.fi fetches `/demos/manifest.json` (written by the demos repo's `scripts/post-deploy.sh` from its `synced-dirs.txt`) and lights up the chip for any matching channel — adding a demo is a demos-repo-only change, no mase.fi edit needed. See `fetchDemos()` in `data-demos.js` and the `demoLink` branches in `pinned.js`. Absent/404 manifest → no chips (local dev degrades cleanly).

## Design

- **Background:** `#09090b` (near-black)
- **Accent:** `#e8a308` (golden-orange)
- **Text:** `#fafafa` (off-white), dim `#a1a1aa`, muted `#52525b`
- **Terminal colors:** green `#22c55e`, red `#ef4444`, cyan `#06b6d4`
- **Nick colors:** `git` (cyan) and `mase` (accent) are pinned; every other nick hashes into a 7-colour warm palette (`nickColor` in `feed.js`)
- **Effects:** Boot line-reveal animation (`boot.js`), modem-decode jitter scramble on the newest feed rows (`jitter.js`), the `#home` ASCII-logo beam (`beam.js`), hand-rolled CRT scanline sweep for channel switches (`playSwitchTransition` in `transition.js`; content swaps about a third of the way into the sweep, reduced-motion bypasses it), blinking cursor
- **Design cards:** `docs/design-cards/` is the live spec for `base.css` (tokens, type-family, type-scale, spacing, elevation, themes, inputs, buttons, badges, iconography, flagged) — each card is a `spec.md` and/or `prototype.html`. Token/type changes in `base.css` track the cards.
- Historical design/impl plans: `docs/plans/`

## Base Components

Shared web components library built from `src/components/` via Vite library mode.

- **Build:** `pnpm build:components` → `dist/base-components.js` (IIFE)
- **URL:** `https://mase.fi/base-components.js`
- Full per-component API (props/attrs/behavior for `<base-text-fit>`, `<base-context-menu>`, etc.): `docs/base-components.md`
- **Cross-origin caching:** `base.css` and `base-components.js` are served to other apps. Unversioned URLs get `max-age=0, stale-while-revalidate=7d` (a push reaches consumers with no consumer redeploy); any `?v=` makes them `immutable`. Consumers link them unversioned — no deploy-hash `?v=`, no SRI pin, no service-worker `cacheFirst`. `/fonts/` is the content-hashed exception. Full contract: `docs/shared-assets.md`

## Deploy

- Run `deploy` — pushes to the Forgejo `origin`, which fires a post-receive hook → `sudo forgejo-deploy mase.fi`.
- Server-side build (`/usr/local/bin/forgejo-deploy`, `mase.fi` case): checks out to `/var/www/homepage-build`, runs `CI=true pnpm install --frozen-lockfile && pnpm run build` (build-lock-wrapped, includes `build:components`) as user `mase`, then copies `dist/.` → `/var/www/html` (chowned to www-data). Build failure aborts before the copy, so a broken build can't ship a stale/empty webroot.
- **build-lock:** package.json's `build` and `build:components` scripts already wrap vite in `build-lock`. Do **not** double-prefix (e.g. `build-lock pnpm run build`) — invoke as plain `pnpm run build`.
- **Local / worktree:** `pnpm install` then `pnpm dev` (Vite). The app fetches `/updates.json`; drop a gitignored fixture at `public/updates.json` (`{"entries":[…],"projects":[…]}`) or the shell renders empty by design (404 → `projects: [], entries: []`). Gates: `pnpm lint`, `pnpm test`, and `pnpm test:coverage`, which fails below the floor in `vitest.config.js`.
