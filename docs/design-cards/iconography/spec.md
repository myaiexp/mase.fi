# Iconography

One family of line icons, one weight, one alignment primitive. Icons ship **per-app as
inline SVG** — `base.css` owns the sizing + alignment class, never the paths (no icon font,
no sprite).

Part of mase.fi's `base.css` design system (served to every project via
`https://mase.fi/base.css`). Builds on the foundation cards: sizes read against **type-scale**,
color is always a **tokens** var resolved through `currentColor`, and because icons never carry
a hue of their own they re-tint under any **themes** override for free.

## Intent

An icon is a **line drawing at text weight**, not an illustration. It shares the stroke weight
of the surrounding UI so a row of text, a label, and an icon read as one material. Hierarchy is
carried by the *color* the icon inherits and the *company it keeps* — never by a filled mass or a
bespoke flourish. The whole fleet should look like one hand drew every glyph.

## The geometry contract

Every icon — Lucide, hand-drawn, or borrowed — is authored to this contract. It is what makes
20-grid and 24-grid sets read as one family.

| Property | Value | Why |
|---|---|---|
| **viewBox** | square — `0 0 24 24` (Lucide) or `0 0 20 20` (helm's set) | Both grids land ~6-7.5% optical stroke; either reads as one family. Don't draw on a 16-grid — stroke 1.5 there is 9.4%, visibly heavier. |
| **stroke** | `currentColor` | The icon inherits the parent's text color. Never a hardcoded hex. |
| **fill** | `none` | Icons are stroked outlines. (Exception: a small `fill="currentColor"` *dot* as an internal node/marker — helm's roadmap/insights icons — is fine. A solid-filled *glyph* is not.) |
| **stroke-width** | `1.5` | In viewBox units. 2 over-prints at small sizes; 1 vanishes on dense rows. 1.5 is the fleet weight. |
| **caps / joins** | `round` | Consistent corner treatment across every glyph. |

## Family & sets

- **Lucide is the reference set** for new mase.fi work. Consistent 24-grid, drawn to exactly the
  contract above. If Lucide lacks a metaphor, pick the closest one — don't hand-draw a one-off.
- **helm ships its own 20-grid set** (`web/icons.js`, ~25 hand-drawn glyphs for sidebar tabs).
  It is not a violation — it's the same contract on a 20 grid, and it's the strongest existing
  precedent in the fleet. New helm icons match that set; new mase.fi icons use Lucide.
- **Don't mix stroke aesthetics.** A Feather or filled/duotone icon dropped next to these won't
  match corner treatment or weight — redraw it to the contract or leave it out.

## Sizing

`base.css` ships the sizing through `.icon` + `--icon-size` — a surface sizes once, never scatters
raw `width`/`height`.

| Size | Class | Role |
|---|---|---|
| **14px** | `.icon` (default) | Inline-in-text, sidebar rows, table cells, button leading-icons. mase.fi's baseline. |
| **16px** | `.icon .icon-16` | Toolbar triggers and icon-only buttons — the sanctioned compact affordance (the buttons card's replacement for `.btn-sm`). |
| **20px** | `--icon-size: 20px` at the call site | App-scale override for a surface that genuinely needs a larger glyph. Not a mase.fi size — set it inline, don't mint a class. (helm's sidebar formerly ran 20px; its design card moved it to the 14px default on 2026-07-16.) |

Pick a **small fixed set per surface** and hold it. mase.fi is 14/16 — that density has no 20px
and no in-between sizes. The rule is not "exactly 14 and 16 everywhere"; it's "few fixed steps,
no arbitrary sizes" — 12, 18, 20-as-a-one-off are the drift to avoid.

## Alignment recipes

The one real friction icons cause is vertical alignment. The `.icon` class solves both cases with
no per-call tuning:

- **In a flex row** (`.btn`, `.status`, sidebar rows, toolbars) — the parent's `align-items:center`
  centers the icon; `.icon`'s `vertical-align` is ignored here. Just drop the `<svg class="icon">`
  in. `.btn` already ships `gap: var(--space-2)` so icon+label spacing is correct out of the box.
- **Inline in a text run** (`.form-label`, prose, table cells, meta strings) — `.icon` carries
  `vertical-align: -0.2em`, which optically centers a 14px icon on the text baseline. No inline
  `style="vertical-align:-2px"` hack, no wrapper needed.

```html
<!-- flex row: parent centers, .icon just drops in -->
<button class="btn"><svg class="icon">…</svg> Copy SHA</button>

<!-- inline in text: vertical-align on .icon does the work -->
<label class="form-label"><svg class="icon">…</svg> Branch</label>
<td><svg class="icon">…</svg> master</td>
```

## What shipped in `base.css`

The implementation leg is the **`.icon` sizing/alignment primitive** — the paths stay per-app.

```css
.icon {
  width: var(--icon-size, 14px);
  height: var(--icon-size, 14px);
  stroke: currentColor; fill: none;
  stroke-width: 1.5;
  stroke-linecap: round; stroke-linejoin: round;
  flex-shrink: 0;
  vertical-align: -0.2em;
}
.icon-16 { --icon-size: 16px; }
```

Refinement over the April draft (which hardcoded `14px` and had no alignment):
`--icon-size` makes the size a single knob (`.icon-16` = one line; `20px` = a call-site override),
and `vertical-align: -0.2em` folds the inline-in-text alignment into the class so it's ignored in
flex and correct inline. `flex-shrink: 0` stops an icon collapsing in a tight row.

## Rules

- **currentColor, always.** The icon never carries its own hue — the surrounding text role does.
  Same glyph reads as `--fg-3` in meta, `--green` on success, `--accent` when active. A hardcoded
  stroke breaks theming and the color inheritance the whole system leans on.
- **1.5 stroke, round caps, on a 20- or 24-grid.** The three constants that make the fleet cohere.
  A 16-grid or a stroke of 2 breaks the weight; redraw off-contract icons.
- **Stroked, not filled.** No filled or duotone glyphs. A small filled dot as an internal marker is
  the only fill allowed.
- **Few fixed sizes per surface.** 14/16 on mase.fi, 20/16 on helm. No arbitrary sizes; size via
  `.icon` / `.icon-16` / `--icon-size`, never raw `width`/`height`.
- **No emoji.** Not in labels, empty states, or fallbacks — an emoji breaks color, scale, and weight
  all at once.
- **No cog for Settings.** Too detailed at 14px. Use `sliders-horizontal`.

## Out of scope

- **The icon paths themselves.** `base.css` ships no glyphs — no font, no sprite. Each app inlines
  its SVGs (Lucide for mase.fi, `web/icons.js` for helm).
- **Icon-only *button* styling** (the 16px affordance's border/hover box) belongs to the **buttons**
  card — this card owns the icon's size and alignment inside it, not the button chrome.
- **A shared cross-app icon library.** Consolidating Lucide + helm's set into one served module is a
  future migration, not this card.
