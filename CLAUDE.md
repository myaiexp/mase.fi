# mase.fi

> Personal homepage as an IRC/terminal hybrid client at https://mase.fi

## Architecture

- **Routing:** Hash-based (`#/home`, `#/activity`, `#/<project>`), browser back/forward; defaults to `#home` via `parseHash()` (no last-channel persistence — only the boot animation uses localStorage)
- **Error page:** `404.html` (second Vite entry) + `src/notfound.js` (pure matching ladder, tested) + `src/notfound-page.js` (DOM/probes/countdown) — the smart 404/403 nginx serves for any unmatched mase.fi path via `error_page` in `sites-enabled/default`. Probes parent paths (HEAD), fuzzy-matches routes from `updates.json`, 5s cancellable auto-redirect on a confident match; preview any path as `/404.html?p=/some/path`. Design handoff: `docs/2026-08-24-notfound-design-handoff.md`
- **Channels:** `#home` (daily summaries), project channels (that project's daily summaries + feature entries), `#activity` (commit log). Non-log entries are nick'd by their project, so `#home` reads as a color-coded standup (`pickNick` in `data-normalize.js`). Registry built in `registry.js` (`buildRegistry`) as `[home, ...projects, activity]`; `channels.js` is the hash-routing orchestrator and re-exports the registry reads as a facade — renderers import `registry.js` directly to keep the import graph acyclic. No `#about` channel (removed in the rework).
- **Boot:** 3-phase TTY animation on first visit (7-day localStorage TTL), skip on click/key; replay via the `window.__maseReplayBoot()` console helper (no visible replay button)
- **Search & commands:** Plain text highlights matching substrings and dims non-matching rows (`applySearch` in `command-search.js` — case-insensitive `includes`, not fuzzy). `/` prefix navigates to channels with autocomplete and runs easter-egg slash commands (`/help`, `/whoami`, `/uptime`, `/date`, `/clear` — registry in `slash-commands.js`, surfaced in the `/` popup on name-prefix match, output as ephemeral IRC server-notice lines in the feed via `command.js`). Search highlighting lives in `command-search.js`. Global shortcuts: `/` to focus, `?` for help, `g h` / `g a` jump to home / activity.
- **Mobile (≤820px):** Sidebar hidden; sticky bottom tab bar (`#tabbar`) with home + activity + the 4 most-recently-active projects, plus a mobile-only `.hero-line` quick-link row.
- **Scroll model:** Chat-style (newest at bottom), IntersectionObserver lazy loads older entries on scroll-up

## Content Management

Store is `/var/lib/mase-fi/updates.json` (mase-owned, outside the webroot, so writes are atomic renames), served by nginx `alias` and fetched as `/updates.json`. Shape: `{"entries": [...], "projects": [...], "stats": {...}}` — one fetch provides the hot window (all non-log entries + last 90 days of `log`s). Older logs live in `/updates-archive.json` and lazy-load on `#activity` scroll-up (`loadArchive` in `data-archive.js`; archive rows go through the same `normalizeEntry` as hot rows, in `data-normalize.js`). `stats` keeps all-history totals after the cut; `data.archiveLoaded` is set only after a successful merge, so a failed archive load keeps the totals on `stats.archivedLogs` / `stats.archivedByProject` (the feed drops its sentinel and retries on the next `#activity` render). Dates are ISO in JSON and render as ISO client-side: `YYYY-MM-DD` day separators and `HH:MM` row times (`dayOf` / `timeOf` in `dates.js`). Writers default omitted dates to today in `Europe/Helsinki`.

- **Categories → channels:** `daily` → `#home`, `log` → `#activity`, `feature` → per-project channel (the retired `project` category is migrated to `feature`)
- **Channel mapping:** `entry.project` (slug) is matched case-insensitively against `project.slug`, falling back to `project.channel`
- **Visibility:** only helm-showcase projects with a public GitHub repo or live public deployment appear as channels; internal tools stay unflagged and appear only in update entries
- Full pipeline (writers, lock, showcase generator, daily summaries): `docs/content-pipeline.md`

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

### Cross-origin caching contract

`base.css` and `base-components.js` are served from the webroot to other apps (helm, prospect, ghost, …). nginx (`$asset_cc` map) serves them **`no-cache, must-revalidate` + ETag when requested *unversioned*** — a bare `<link href="https://mase.fi/base.css">` revalidates every load (cheap 304), so a mase.fi push propagates to consumers with **no consumer redeploy** — and **`immutable, max-age=1y` when *any* `?v=` is present**. Consumer rule: **never append a `?v=` keyed to your own deploy hash** — that pins the asset immutably to a string that never changes when *mase.fi's* content does, so pushes go unseen until the consumer redeploys. Link shared assets **unversioned**, and a consumer **service worker must not `cacheFirst`** them (that defeats revalidation regardless of the HTTP header).

The one exception is `/fonts/`: `base.css` references `jetbrains-mono.woff2?v=<content hash>`, so the file is immutable and a font change is a new URL. `fonts.json` + `~/Projects/helm/scripts/webfonts` regenerate `src/fonts/` (then paste the new hash into `base.css`); the build copies `src/fonts/` into `dist/fonts/`, and nginx's `location ^~ /fonts/` adds the CORS header fonts need cross-origin (base.css itself only needs it for SRI).

A consumer that pins these assets with SRI (`integrity="sha384-…"`) must redeploy on every mase.fi push — a stale pin is not degraded, the browser refuses to load the file at all, silently. `forgejo-deploy mase.fi` runs `helm/scripts/check-sri-pins` after copying to the webroot and ntfys "mase.fi: stale SRI pins" with the list of apps holding stale pins (advisory — it never fails the apex publish).

## Deploy

- Run `deploy` — pushes to the Forgejo `origin`, which fires a post-receive hook → `sudo forgejo-deploy mase.fi`.
- Server-side build (`/usr/local/bin/forgejo-deploy`, `mase.fi` case): checks out to `/var/www/homepage-build`, runs `CI=true pnpm install --frozen-lockfile && pnpm run build` (build-lock-wrapped, includes `build:components`) as user `mase`, then copies `dist/.` → `/var/www/html` (chowned to www-data). Build failure aborts before the copy, so a broken build can't ship a stale/empty webroot.
- **Components:** `pnpm run build` now includes `build:components` automatically (chained in the script).
- **build-lock:** package.json's `build` and `build:components` scripts already wrap vite in `build-lock`. Do **not** double-prefix (e.g. `build-lock pnpm run build`) — invoke as plain `pnpm run build`.
- **Local / worktree:** `pnpm install` then `pnpm dev` (Vite). The app fetches `/updates.json`; drop a gitignored fixture at `public/updates.json` (`{"entries":[…],"projects":[…]}`) or the shell renders empty by design (404 → `projects: [], entries: []`). Gates: `pnpm lint` (eslint `src/` `scripts/`), `pnpm test` (vitest). `pnpm test:coverage` reports v8 coverage over `src/` and `scripts/` (excludes `*.test.js` and `dist/`) and exits non-zero below the floor in `vitest.config.js` (`coverage.thresholds`: 90% lines/functions/statements, 80% branches). pnpm installs devDependencies by default regardless of `NODE_ENV` (the old npm-era `.npmrc` `include=dev` hack was dropped in the pnpm migration: npm auto-set `omit=dev` under `NODE_ENV=production`, but pnpm does not).
