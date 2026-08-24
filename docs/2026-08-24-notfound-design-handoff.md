# Design handoff: smart 404 page (from claude.ai/design, 2026-08-24)


## Overview
The error page nginx serves for any unmatched path on `mase.fi`. It is a single static
HTML file with no build step, no framework, and no network calls. Its job is not to
apologize — it is to figure out where the visitor meant to go and get them there.

The page reads `window.location.pathname`, matches it against a hardcoded route table
baked into the file at deploy time, and renders one of three states:

- **State 1 — confident match.** One clear winner (e.g. `/explorer/operator` → `/explorer`).
  Shows the suggestion large, auto-redirects on a visible 5-second countdown, cancellable.
- **State 2 — fuzzy.** 2–3 plausible candidates, no auto-redirect. User picks.
- **State 3 — no match.** Junk/scanner path. One link home, no countdown, no drama.

A **403** variant reuses the identical layout with one word swapped.

## About the design files
The files in this bundle are **design references created in HTML** — prototypes showing
intended look and behavior, not production code to lift wholesale. The `.dc.html` file is
authored in a component format that needs its `support.js` runtime; it is for *viewing the
design*, not for deploying.

The deliverable in the real world is the opposite of that: **one hand-written static
`404.html`**, inline `<style>`, small inline `<script>`, no dependencies, served by nginx via
`error_page 404 /404.html;`. Recreate the design in that form. Total page weight target:
**under 15 KB** including the font fallback path.

## Fidelity
**High-fidelity.** Colors, type, spacing, and interaction timing are final. Match them.
The one deliberately open area is the route table contents — see *Data*.

## Viewing the design
Open `404 - mase.fi.dc.html` in a browser. It is a canvas with six artboards side by side:

| id | Artboard | Size |
|----|----------|------|
| 1a | State 1, desktop, counting down (live — the countdown really ticks; `[ stay ]` cancels) | 1440×760 |
| 1b | State 1 after cancel | 1440×420 |
| 1c | State 1, mobile | 390×760 |
| 1d | State 2, fuzzy candidates | 1440×620 |
| 1e | State 3, no match, hostile 400-char path | 1440×560 |
| 1f | 403 variant | 1440×420 |

---

## Design tokens

Sourced from the mase.fi kit (`reference/base.css`). Use the codebase's existing variables
if they exist; these are the resolved values.

### Color
| Token | Hex | Use |
|-------|-----|-----|
| bg page | `#050506` | canvas behind the frame (in production: page background) |
| bg surface | `#09090b` | the page itself |
| bg raised | `#131316` | countdown box, candidate rows |
| bg button | `#18181c` | secondary button |
| border | `#27272a` | all hairlines, header/footer rules, button borders |
| border strong | `#3f3f46` | segment-bar outlines, inline link underlines |
| text primary | `#fafafa` | path head, headings |
| text secondary | `#a1a1aa` | descriptions, hints |
| text muted | `#52525b` | labels, chrome, `$ open` prefix |
| accent | `#e8a308` | suggestions, countdown, cursor, prompt caret |
| accent hover | `#ffc23d` | link hover |
| accent wash | `rgba(232,163,8,.12)` | primary button fill, badge fill |
| accent line | `rgba(232,163,8,.35)` | underline on the big suggestion |
| error | `#ef4444` | 404 status, "error: no such page", struck path tail |
| error wash | `rgba(239,68,68,.15)` | HTTP 404 badge fill |
| warn | `#d29922` | 403 status and its badge (`rgba(210,153,34,.15)`) |

Only two background colors carry the whole page: `#09090b` and `#131316`.

### Typography
Single family: **JetBrains Mono**, weights 400 / 500 / 700.
Fallback stack: `'JetBrains Mono', ui-monospace, 'SF Mono', Consolas, monospace`.
Self-host or subset it — do not block first paint on Google Fonts for an error page;
the design must be legible in the fallback.

| Role | Size | Weight | Notes |
|------|------|--------|-------|
| Big suggestion (desktop) | 38px | 700 | `letter-spacing:-.02em` |
| Big suggestion (mobile) | 28px | 700 | `letter-spacing:-.02em` |
| Candidate row route | 20px | 700 | `letter-spacing:-.01em` |
| Countdown number | 26px desktop / 22px mobile | 700 | `line-height:1` |
| Typed path line | 15px desktop / 13px mobile | 400, path in 700 | `line-height:1.4–1.5` |
| Error line | 13px | 400 | |
| Body / descriptions | 12px | 400 | |
| Chrome, hints, meta | 11px | 400 | |
| Section labels | 11px | 400 | `uppercase`, `letter-spacing:.08em` |
| Ghost "404" watermark | 420px desktop / 200px mobile | 700 | `opacity:.05`, `letter-spacing:-.04em` |

Nothing below 11px. Mobile body text stays at 12–13px.

### Spacing & geometry
- Page padding: `0 20px` desktop, `0 14px` mobile. Content column `max-width:900px`, centered.
- Header/footer bars: `10px 20px` desktop, `10–12px 14px` mobile, separated by 1px `#27272a`.
- Main content block gap: `20–26px`. Sub-group gap: `8–12px`.
- **Border radius: 0 everywhere.** No rounded corners anywhere in this design.
- **No shadows**, except the countdown drain bar's `0 0 12px rgba(232,163,8,.6)` glow.
- Buttons: 26px tall desktop (`padding:0 14px`), **46px tall mobile, full-width halves**
  in a `flex; gap:8px` row — mobile hit targets must not go below 44px.

---

## Anatomy (shared by all states)

Top to bottom, a `flex-direction:column` page filling the viewport (`min-height:100dvh`):

1. **Drain bar** — `position:absolute; top:0; left:0; height:2px; background:#e8a308`,
   width = `count / total * 100%`, glow `0 0 12px rgba(232,163,8,.6)`, `z-index:6`.
   Only present in state 1 while counting.
2. **Scanlines** — full-bleed overlay, `pointer-events:none`, `z-index:5`:
   `repeating-linear-gradient(to bottom, rgba(255,255,255,.022) 0 1px, transparent 1px 3px)`.
3. **Ghost status number** — `404` (or `403`) bottom-right, bleeding off both edges,
   `opacity:.05`, `pointer-events:none; user-select:none`.
4. **Header bar** — 6px square status dot (`#ef4444` / `#d29922`), `mase.fi`, `:80` muted;
   right side `nginx · static` and the status badge.
5. **Body** — vertically centered, `flex:1 1 auto; min-height:0`.
6. **Footer bar** — amber `>` prompt, keyboard hints, blinking block cursor
   (`7×14px`, `#e8a308`, `blink 1.1s steps(1,end) infinite`).

### The path diff — the core idea
The requested path renders as a **diff**, not as an error string:

```
$ open /explorer/operator
        ^^^^^^^^^ ^^^^^^^^
        white 700  red, line-through, opacity .75
```

- `$` in accent, ` open ` in muted — the whole line reads as a shell command the visitor typed.
- The **surviving head** (the longest prefix that resolves) is `#fafafa`, weight 700.
- The **dead tail** is `#ef4444`, `text-decoration:line-through`, `opacity:.75`.
- Below it, 11px muted: `the tail /operator matched nothing · the head resolves`.
- `overflow-wrap:anywhere` on the line — paths are unbreakable strings and will otherwise
  blow out the layout.

Then `error: no such page` in `#ef4444` at 13px, carrying a subtle `jitter` animation
(a 2px shudder for ~6% of a 6s loop — a flicker, not a wiggle; see *Motion*).

A dashed rule separates diagnosis from suggestion:
`repeating-linear-gradient(to right, #27272a 0 6px, transparent 6px 12px)`, 1px tall.

---

## Screens

### 1a / 1c — State 1: confident match
**Purpose:** get the visitor to the one right page with minimum reading.

- Label `DID YOU MEAN` (11px, uppercase, `.08em`, muted).
- The suggestion is **the largest interactive thing on the page**: 38px/700 accent,
  prefixed by a 24px `→` at `opacity:.6`, underlined `2px solid rgba(232,163,8,.35)`,
  with the human name (`map explorer`) trailing at 12px/400 in `#a1a1aa`.
  It is a real `<a href>` — middle-click and right-click must work.
- **Countdown box** (`#131316`, 1px `#27272a`, padding `12px 16px`):
  `redirecting in` · the number (26px/700 accent) · a segment bar of 5 cells
  (`22×10px`, 1px `#3f3f46`, filled `#e8a308` while remaining, transparent once spent),
  then buttons right-aligned: `[ go now ]` (accent wash, accent border/text) and
  `[ stay ]` (`#18181c`, `#27272a` border, `#fafafa` text).
  On mobile the box stacks: meter row, then two 46px full-width buttons.
- Footer: `esc or any key to stay · enter to go now · mase.fi for the full directory`.
  Mobile footer instead: `mase.fi · tap anywhere to stay`.

**1b — cancelled.** The countdown box is replaced by a single quiet line:
`✕ redirect cancelled — staying put.` followed by inline links `/explorer` and `mase.fi`
(12px, `#a1a1aa`, 1px `#3f3f46` underline). The suggestion stays large and clickable.
The drain bar and segment fill are gone; nothing else moves.

### 1d — State 2: fuzzy candidates
**Purpose:** two or three plausible destinations, so the machine must not choose.

- Label `CLOSEST MATCHES`. **No countdown, no drain bar, no auto-redirect.**
- Rows: `#131316`, `padding:12px 14px`, `gap:2px` between them, each a full-row `<a>`.
  The top row gets `border-left:2px solid #e8a308` and accent route text; the rest get
  `border-left:2px solid #3f3f46` and `#fafafa` route text. Hover → `#18181c`.
- Each row: `→ /route` (20px/700) · human name (12px `#a1a1aa`) · right-aligned reason
  (11px muted) — `1 char off`, `fuzzy`, `moved`.
- Closing line, 12px muted: `no auto-redirect — pick one, or browse everything.`
- Footer: `1–3 to jump · h for home`.

### 1e — State 3: no match
**Purpose:** absorb junk and scanner traffic without looking broken.

- The path renders on its own, no diff highlighting — nothing survived. Clamp it:
  `overflow-wrap:anywhere; max-height:66px; overflow:hidden`, then an ellipsis span in
  `#3f3f46`. Below, 11px muted: `path truncated · 412 chars · nothing here resembles it`
  (real character count).
- Single 38px suggestion: `→ mase.fi — the full directory — 21 active projects`.
- Footer: `enter for home`. No countdown.
- **Escaping is mandatory** — the path goes into the DOM via `textContent`, never
  `innerHTML`. See *Security*.

### 1f — 403 variant
Identical structure and layout. Status dot and badge become `#d29922`
(`HTTP 403`, wash `rgba(210,153,34,.15)`); ghost number reads `403`; the error line reads
`error: forbidden`; the suggestion points at the public sibling of the blocked path
(`/pulse/internal` → `/pulse`, "the public part of this app"). The suggestion is 32px here
rather than 38px, since the state is less common. Serve from the same file if convenient
(`error_page 403 404 /error.html;` plus a status check) or duplicate — it is 15 KB.

---

## Interactions & behavior

### Countdown (state 1 only)
- Starts at **5**, ticks every **1000ms**, redirects at 0 via `location.replace(target)`
  (`replace`, not `assign` — the dead URL must not sit in history).
- Each tick updates three things in lockstep: the number, one segment cell going
  transparent, and the drain bar width (`count / 5 * 100%`).
- **Cancel on any of:** `[ stay ]`, `Escape`, any keypress, any click/tap on the page
  background, `wheel`, `touchstart`. Erring toward cancelling is correct — an unwanted
  redirect is far worse than a missed one.
- Cancel is **permanent for the pageview**: clear the interval, do not restart on blur/focus.
- `[ go now ]` and `Enter` redirect immediately.
- Cancelled state: number → `—`, drain bar removed, box replaced per 1b.

### Reduced motion & no-JS
- `@media (prefers-reduced-motion: reduce)`: kill the jitter, blink, and the
  **auto-redirect itself**. Show the suggestion and buttons statically — an involuntary
  navigation is a motion problem too.
- **No JS:** the page must still be complete and useful. Server-render nothing; author the
  markup so the suggestion links exist in the static HTML where possible, or accept that
  the JS-less fallback is the state-3 layout (path + link home). Never leave a blank page.

### Responsive
One breakpoint at **720px**. Below it:
- Content padding `14px`; the typed path wraps after `$ open` onto its own line.
- Suggestion 38px → 28px; the trailing human name moves to its own line below.
- Countdown box stacks vertically; buttons become two 46px full-width halves.
- Ghost number 420px → 200px.
- Footer collapses to `mase.fi · tap anywhere to stay`.
Between 720px and 1440px the content column simply centers at `max-width:900px` — no
intermediate breakpoint is needed.

---

## Motion

| Name | Keyframes | Timing |
|------|-----------|--------|
| `blink` | `0%,49%{opacity:1} 50%,100%{opacity:0}` | `1.1s steps(1,end) infinite` |
| `jitter` | still 0–92%, then ±2px nudges at 94/96/98%, back to 0 at 100% | `6s steps(1,end) infinite` |

All decorative. Nothing animates layout or blocks input.

---

## State management
Three variables, all local:

- `state` — `'confident' | 'fuzzy' | 'none'`, computed once at load from the match.
- `count` — integer, 5 → 0, only meaningful in `'confident'`.
- `cancelled` — boolean, one-way latch; once true the countdown never resumes.

No storage, no fetch, no analytics unless the codebase already has a beacon it must use.

## Data — the route table
The design assumes a hardcoded table baked into the file at deploy time. Shape:

```js
const ROUTES = [
  { path: '/explorer', name: 'map explorer' },
  { path: '/tulkki',   name: 'interpretation booking' },
  { path: '/pulse',    name: 'pulse' },
  // …21 active projects
];
```

Matching, in order:
1. **Prefix match** — longest prefix of the requested path that is a known route.
   A hit with a non-empty tail is the *confident* case and drives the diff rendering.
2. **Fuzzy** — Levenshtein ≤ 2 against route names, or a known moved-to-subdomain map.
   Score them; if the best is ≥ 2 better than the runner-up, treat as confident, else fuzzy.
3. **Otherwise** — state 3.

Junk guard: if the path is over ~120 chars, contains `wp-`, `.php`, `.env`, or `%2F`
sequences, skip matching entirely and go straight to state 3.

## Security
The requested path is attacker-controlled. Insert it with `textContent` only —
never `innerHTML`, never a template literal into markup. The truncation display must
count characters on the raw string but render an escaped, clamped copy.

## Assets
None. No images, no icon fonts, no SVG — every visual element (scanlines, segment
bar, ghost number, cursor) is CSS or a text glyph. The only external asset is the
JetBrains Mono webfont, which should be self-hosted and subset.

## Files in this bundle
- `404 - mase.fi.dc.html` — the design, six artboards. Needs `support.js` beside it.
- `screenshots/` — 2× PNG of each artboard, named by id (`1a-state1-counting.png` …).
- `support.js` — runtime for the design file only. Not part of the deliverable.
- `reference/BRIEF.md` — the original brief.
- `reference/base.css` — the mase.fi design-system foundation the tokens come from.
