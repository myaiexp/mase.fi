# Elevation

On AMOLED-black bg (`#09090b`), a single-step surface bump is invisible. Elevation is
**structural** — each layer has a named role, and overlays jump two steps plus a stronger
rim. No drop shadows: `box-shadow` doesn't render on pure black and isn't the aesthetic.

This card owns the **overlay contract** — which surface sits on which rung, the rim
escalation, and the backdrop scrim. The underlying token *values* are owned by the
**tokens** card (already on `:root` in `base.css`); the themeability of surfaces is owned
by the **themes** card. This card codifies how those tokens compose into an overlay.

## The layers

The five surface tokens + hover all ship on `:root` in `base.css` (tokens card):

| Token | Value | Role |
|---|---|---|
| `--bg` | `#09090b` | Page background (AMOLED-true-black) |
| `--bg-surface` | `#131316` | Sticky headers, topbar, inline cards |
| `--bg-raised` | `#18181c` | Inputs, buttons, raised cards |
| `--bg-hover` | `#27272a` | Any hover state (doesn't replace a surface; sits on top) |
| `--bg-overlay` | `#1f1f24` | **Modal body** — two steps above `--bg-raised` |
| `--bg-overlay-rim` | `#26262c` | Modal header/footer — one tick brighter than the body |

## Border escalation

Overlays get a stronger perimeter so they don't bleed into the black. All three ship on
`:root` (tokens card):

```css
--border:          #27272a;   /* default — 1px row dividers */
--border-hover:    #3f3f46;   /* hover/focus */
--border-overlay:  #3f3f46;   /* modal/popover perimeter */
```

## Modal contract (shipped in base.css)

The `<base-modal>` web component's shadow DOM reads `--bg-raised` (body), `--bg-surface`
(header/footer) and `--border-color` (perimeter + dividers). Left alone, that renders the
body at `--bg-raised` and the header/footer at the *darker* `--bg-surface` — inverted, and
a full step too dim for an overlay on pure black. `base.css` now re-points those three
tokens on the `base-modal` host so custom-property inheritance lifts the whole shadow tree
to the overlay rung:

```css
base-modal {
  --bg-raised:    var(--bg-overlay);       /* [data-content] body          */
  --bg-surface:   var(--bg-overlay-rim);   /* [data-header], [data-footer]  */
  --border-color: var(--border-overlay);   /* perimeter + dividers          */
}
```

Header/footer end up **one tick above** the body (`--bg-overlay-rim` over `--bg-overlay`),
not below it. The plain-CSS `.modal` box (no component) gets the same lift directly: body
on `--bg-overlay`, perimeter on `--border-overlay`.

This contract was proven in helm's `web/helm.css` first; this card lifts it into `base.css`
so **every** project that loads the sheet inherits an overlay-lifted modal, not just helm.

## Backdrop

The overlay scrim (`.modal-backdrop`, and the component's `[data-backdrop]`) is a neutral
pure-black `rgba(0, 0, 0, 0.6)` — deliberately **not** a token. It darkens the whole app
uniformly and is theme-independent; a theme re-tints surfaces, never the scrim. It's the
second separation signal after the rim: on AMOLED, the rim defines the overlay's edge and
the scrim pushes the app behind it back.

## Theme interaction

The three overlay tokens are frozen hex on `:root`, so — like every un-re-declared token —
they **anchor to the AMOLED identity** under any `[data-theme]`. helm's `themes.css`
re-tints `--border`/`--border-hover` but not the overlay tokens, so a themed app still gets
true-AMOLED overlays. That's a defensible default (overlays read as the system's own
surface floating over a re-tinted app), consistent with the themes card holding `--bg`
constant as identity. A theme that *wants* themed modals re-declares the three overlay
tokens in its own sheet — the themes contract's "declare only the overridden subset."
Filed as an idea for helm's `themes.css` if Mase wants theme-tracking overlays.

## Rules

- **No drop shadows for elevation.** They don't render on pure-black and they're not our
  aesthetic. `box-shadow` appears nowhere in `base.css`; keep it that way.
- **Elevation is not a ramp.** There are exactly three app-level surfaces (`bg`,
  `bg-surface`, `bg-raised`) plus two overlay surfaces. Don't add intermediates.
- **Hover is additive**, not a replacement. `--bg-hover` sits on top of whatever the row's
  background is — it's one token, visibly the same in every layer. Don't invent per-surface
  hover tints.
- **The rim matters.** On pure-black, a raised surface without `--border-overlay` looks like
  it's floating in a void. Always include the 1px perimeter on overlays.
- **The backdrop is a scrim, not a surface.** Pure-black luminance, theme-independent, never
  tokenized.
