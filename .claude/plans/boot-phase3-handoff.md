# Boot Phase 3 Handoff — Visual Construction Bug

## Status

Boot Phases 1-2 work correctly. Phase 3 (UI construction after overlay fades) does NOT work as intended. The visual step-by-step construction is broken.

## What the user currently sees

> boot init works -> fade -> topbar is visible -> about 2 seconds pass -> everything pops in except hero -> hero types, finishes -> all feed lines pop in -> a few of them retype themselves, maybe like 3, in sequence

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

## Root cause (not yet fully diagnosed)

The Phase 3 rewrite builds DOM directly (no pre-render + reveal), but something prevents the visual construction from being visible. Likely candidates:

1. **anime.js v4 API mismatch** — We already found `onComplete` doesn't exist in v4 (it's thenable instead). There may be OTHER API mismatches in the `animate()` calls used for channel slide-in, feed line stagger, etc. **Use Context7 to verify the full anime.js v4 API before touching anything.**

2. **`initAfterBoot` re-rendering** — After Phase 3 completes, `onComplete` calls `initAfterBoot` in `main.js` which calls `initSidebar(data)`. This clears the sidebar DOM and re-renders it (wiping out what Phase 3 just built). This might cause the "everything pops in" effect. The "3 feed lines retyping" is likely `animateFeedLines` being triggered somehow.

3. **CSS visibility** — The sidebar container, content areas, or their children might have CSS that hides them during construction. Check computed styles on `.sidebar`, `.content`, `.content__pinned`, `.content__feed` during Phase 3.

## Key files

- `src/boot.js` — Phase 3 implementation (lines ~206-320), `_finishBoot` abort handler
- `src/main.js` — `initAfterBoot` (called after boot completes, may re-render)
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

1. **Context7 first** — Look up anime.js v4 API. Verify `animate()` signature, return value, how to await completion, how to animate DOM elements.

2. **Verify the overlay fade actually works** — Add `console.log` before/after the `await animate(...)` call, or test in browser devtools. If it hangs, the thenable approach may also be wrong.

3. **Fix the re-render problem** — `initAfterBoot` calling `initSidebar` wipes the sidebar Phase 3 built. Options:
   - Don't call `initSidebar` after boot (but then mobile dropdown and sidebar event wiring is missing)
   - Add a `wireOnly` mode to `initSidebar` that wires events without re-rendering
   - Have Phase 3 call `initSidebar` itself at the end (accepting the visual pop) and remove it from `initAfterBoot`

4. **Test with rapid screenshots** — Use agent-browser to take screenshots at 500ms intervals during boot to verify visual sequence.

## Entry data format

Real `updates.json` entries use these fields:
- `log` entries: `{ date, project, text, category }`
- `daily` entries: `{ date, project, summary, commits, category }`
- `feature` entries: `{ date, project, text, sticky, category }`
- `project` entries: `{ date, project, text, sticky, category }`

## Design spec

Full design spec at `.claude/plans/2026-03-23-irc-terminal-redesign.md`
Implementation plan at `.claude/plans/2026-03-23-irc-terminal-impl-plan.md`
