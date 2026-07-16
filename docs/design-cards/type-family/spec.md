# Type — JetBrains Mono

One family for the whole system, self-hosted. Everything — prose, labels, headings,
numbers, code — is set in the same monospace face. **Mono-everywhere is the identity**, not a
constraint to design around: the fleet is code-adjacent (terminal output, file paths, git
hashes, tool calls, IRC feeds), so a proportional "content" face would fight the aesthetic.
Hierarchy is carried by weight, `--fg-*` color, and the size scale — never by a second
typeface.

## Stack

Defined once in `base.css`, inventoried by the **tokens** card — this card owns the family's
loading, weights, and feature policy, not the token value.

| Token | Value |
|---|---|
| `--font` | `'JetBrains Mono', 'Consolas', monospace` |
| `--font-mono` | → `--font` (alias — same stack, kept so the two can't drift) |

**Fallback behavior.** JetBrains Mono is self-hosted with `font-display: swap`, so the
fallback shows only during the load flash or if the woff2 fails outright — `Consolas`
(Windows) then the platform's generic `monospace`. Metrics differ from JetBrains Mono, so a
swap-in reflow is expected and acceptable; don't design layouts that assume the webfont has
already loaded.

## Loading

Two `.woff2` files in `src/fonts/`, served from `https://mase.fi/fonts/` and referenced by
`base.css` with absolute URLs (so every consumer project resolves them, not just mase.fi).

```css
@font-face {
  font-family: 'JetBrains Mono';
  src: url('https://mase.fi/fonts/JetBrainsMono-Regular.woff2') format('woff2');
  font-weight: 400 500;   /* Regular file serves 400-500 */
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: 'JetBrains Mono';
  src: url('https://mase.fi/fonts/JetBrainsMono-Bold.woff2') format('woff2');
  font-weight: 600 700;   /* Bold file serves 600-700 */
  font-style: normal;
  font-display: swap;
}
```

Only these two files ship. No italic face is loaded — italics synthesize (oblique) and are
avoided in the UI anyway.

## Weights

Two files, **four weights invoked across the fleet** (400, 500, 600, 700). The declared
ranges map the in-between weights to a real file, so 500 and 600 render deterministically
instead of relying on the browser's weight-fallback algorithm.

| Weight | Renders from | Role |
|---|---|---|
| 400 | Regular | Body, prose, meta, timestamps, form/input text |
| 500 | Regular | Labels, badges (`.status`/`.tag`/`.label`), buttons, section + form labels, subtle emphasis |
| 600 | Bold | Nicks, subheads, active-channel, dense-row emphasis (mase.fi app) |
| 700 | Bold | Headings (`h1`/`h2`/`h3`), `.bold`, hard emphasis |

400 and 500 are the same file; 600 and 700 are the same file. The step that reads on screen
is Regular → Bold; 500 and 600 are the same pixels as 400 and 700 respectively, chosen for
authoring intent, not a distinct rendered weight.

## Features

`base.css` sets **no** `font-feature-settings`, so JetBrains Mono renders at the browser
default: contextual coding ligatures (`calt`) **on**, stylistic sets **off**. Features are
opt-in at the point of use — never forced globally in the shared sheet.

- **Ligatures** — `calt` is default-on. In the shared system that means `->`, `=>`, `!=`,
  `==`, `>=`, `<=`, `:=`, `...`, `//` render as coding ligatures unless a consumer opts out.
- **Tabular numerics** — not global. Apply `font-variant-numeric: tabular-nums` on the
  container that holds a numeric column so figures align without a wrapper (mase.fi does this
  on feed timestamps). Prose keeps proportional figures; there's no downside to leaving it off
  where columns don't line up.

**App-level opt-out (precedent).** The mase.fi homepage overrides on `body`:
`font-feature-settings: "ss01", "ss02", "calt" 0` — coding ligatures **off**, JetBrains Mono
stylistic sets **on** — for an authentic terminal feel (a real terminal has no ligatures).
That is the correct pattern for a consumer that wants a different feature policy: set it on
your own root, don't change `base.css`.

## Rules

- **One family. No second typeface.** Not for marketing, not for a display headline. Weight +
  `--fg-*` color + the size scale carry all hierarchy. A proportional face anywhere is a
  divergence — question it before shipping it.
- **Only the two shipped files.** Author with 400 / 500 / 600 / 700; any other weight resolves
  to the nearest range and buys nothing. Don't add a third weight file for emphasis — reach for
  600/700, color, or size instead.
- **Features are opt-in locally, never global in `base.css`.** Want ligatures off or a
  stylistic set on? Set `font-feature-settings` on your app root (see the mase.fi precedent),
  not in the shared sheet.
- **`tabular-nums` per container, not global.** Apply it where numbers form columns; leave
  prose proportional.
- **No synthesized italic.** No italic face ships; don't rely on `<em>`/`font-style: italic`
  rendering as a designed weight — use color or 500/600 for emphasis.

## Out of scope

Type **sizes and scale** (`--text-xs`…`--text-lg`, `--leading*`) belong to the **type-scale**
card, not here. This card documents the family — the face, its weights, and its feature
policy.
