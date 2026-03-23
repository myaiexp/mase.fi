# Boot Phase 3 Handoff — Visual Construction Bug

## Status

Boot Phases 1-2 work correctly. Phase 3 has two problems:
1. **Visual construction sequence** — not verified to work correctly
2. **Replay button** — broken, needs end-to-end verification

The first-visit boot sequence was observed working on a desktop with fresh localStorage, but was never properly verified with rapid sequential screenshots. The replay button (`[▶ boot]`) has never been confirmed working.

## What the user currently sees (from first-visit boot)

> boot init works -> fade -> topbar is visible -> about 2 seconds pass -> everything pops in except hero -> hero types, finishes -> all feed lines pop in -> a few of them retype themselves, maybe like 3, in sequence

**Note:** This was observed on laptop where localStorage `mase-fi-boot-seen` was set. Ctrl+Shift+R clears HTTP cache but NOT localStorage, so the user was likely seeing the skip-boot path (`initApp`) rather than Phase 3. On desktop with fresh localStorage, the boot appeared to work. **The actual state of Phase 3 is uncertain — verify before assuming anything.**

## What it SHOULD look like (from spec)

After overlay fades:
1. Title bar types/fades in
2. Sidebar group headers type out character-by-character (`── home ──`, `── projects ──`, `── meta ──`)
3. Channel names appear one by one with stagger
4. ASCII hero types into content area
5. Tagline types below hero
6. Feed lines stagger in one by one
7. Input bar appears last, cursor starts blinking

Each step should be visually distinct and sequential — the user should watch the terminal "build itself."

## Known issues

### anime.js v4 API

We found `onComplete` callback doesn't exist in v4 — `animate()` returns a thenable instead. Fixed to `await animate(...)`. **But no other anime.js v4 API calls have been verified.** The `animate()` calls for channel slide-in, feed line stagger, titlebar fade-in etc. all use parameters that may not match v4's actual API.

**CRITICAL: Use Context7 to look up the anime.js v4 API before touching any code.**

### `initAfterBoot` re-rendering

After Phase 3 completes, `onComplete` calls `initAfterBoot` in `main.js` which calls `initSidebar(data)`. This **clears the sidebar DOM and re-renders it**, wiping what Phase 3 just built. This causes the "everything pops in" effect for the sidebar.

The "3 feed lines retyping" is `animateFeedLines` in `channels.js` — it types the first 3 feed lines on every `navigateTo` call. If `navigateTo` gets called after boot (via `initApp` or hashchange), it would retype them.

### Replay button

The replay handler has `e.stopPropagation()` to prevent the boot's click-to-skip handler from firing. But the full replay flow (clear overlay → re-run boot → Phase 3 → wire up) has never been verified end-to-end.

## Key files

- `src/boot.js` — Phase 3 implementation, `_finishBoot` abort handler, `initReplayButton`
- `src/main.js` — `initApp` (full init), `initAfterBoot` (post-boot wiring)
- `src/sidebar.js` — `initSidebar` clears and re-renders sidebar DOM
- `src/channels.js` — `navigateTo`, `animateFeedLines` (types first 3 lines on channel switch)
- `src/terminal.js` — `typeText`, `createLine`, `relativeDate`
- `src/data.js` — `getChannels`, `getChannelEntries`

## Architecture of Phase 3 (current)

Phase 3 in `boot.js` builds DOM directly:
- Gets `#sidebar`, `#content-pinned`, `#content-feed` elements
- Hides titlebar + inputbar via `style.opacity = '0'`
- Fades overlay with `await animate(overlay, { opacity: [1, 0], ... })`
- Creates sidebar groups/channels in a loop, appending to `#sidebar`
- Creates pinned ASCII + tagline, appending to `#content-pinned`
- Creates feed lines from `getChannelEntries('home', ...)`, appending to `#content-feed`
- Shows inputbar
- Calls `setActiveChannel('home')`

Then `onComplete` (`initAfterBoot` in main.js) calls:
- `initSidebar(data)` — **clears and re-renders sidebar** (needed for mobile dropdown wiring)
- `initRouter(data, prefersReducedMotion)` — adds hashchange listener
- `initSearch(data)` — wires up command input

## What to do

1. **Context7 first** — Look up anime.js v4 API. Verify `animate()` signature, return value, available parameters, how to await completion.

2. **Verify what actually works** — Test with rapid screenshots or browser devtools console logs. Don't assume.

3. **Fix the re-render problem** — `initAfterBoot` calling `initSidebar` wipes the sidebar Phase 3 built. Options:
   - Don't call `initSidebar` after boot (but then mobile dropdown wiring is missing)
   - Add a `wireOnly` mode to `initSidebar` that wires events without re-rendering
   - Have Phase 3 call `initSidebar` at the end and skip it in `initAfterBoot`

4. **Fix replay button** — Verify the full replay flow works end-to-end.

5. **Test properly** — Use agent-browser with rapid screenshots at 500ms intervals during boot, or add temporary console.log timestamps to each Phase 3 step.

## Entry data format

Real `updates.json` entries use these fields:
- `log` entries: `{ date, project, text, category }`
- `daily` entries: `{ date, project, summary, commits, category }`
- `feature` entries: `{ date, project, text, sticky, category }`
- `project` entries: `{ date, project, text, sticky, category }`

## Design spec

Full design spec at `.claude/plans/2026-03-23-irc-terminal-redesign.md`
Implementation plan at `.claude/plans/2026-03-23-irc-terminal-impl-plan.md`
