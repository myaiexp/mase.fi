# Elevation

On AMOLED-black bg (`#09090b`), a single-step surface bump is invisible. Elevation is **structural** — each layer has a named role, and overlays jump two steps plus a stronger rim.

## The layers

| Token | Value | Role |
|---|---|---|
| `--bg` | `#09090b` | Page background (AMOLED-true-black) |
| `--bg-surface` | `#131316` | Sticky headers, topbar, inline cards |
| `--bg-raised` | `#18181c` | Inputs, buttons, raised cards |
| `--bg-hover` | `#27272a` | Any hover state (doesn't replace a surface; sits on top) |
| `--bg-overlay` | `#1f1f24` | **Modal body** — two steps above `--bg-raised` |
| `--bg-overlay-rim` | `#26262c` | Modal header/footer — one tick brighter than the body |

## Border escalation

Overlays get a stronger perimeter so they don't bleed into the black:

```css
--border:          #27272a;   /* default — 1px row dividers */
--border-hover:    #3f3f46;   /* hover/focus */
--border-overlay:  #3f3f46;   /* modal/popover perimeter */
```

## Modal contract

The `<base-modal>` web component consumes these via a selector in `base.css`:

```css
base-modal {
  --bg-raised:    var(--bg-overlay);       /* [data-content]   */
  --bg-surface:   var(--bg-overlay-rim);   /* [data-header], [data-footer] */
  --border-color: var(--border-overlay);   /* perimeter + dividers */
}
```

The component ships with sensible defaults; the outer rule is what makes the modal read as "above the app" on AMOLED.

## Rules

- **No drop shadows for elevation.** They don't render on pure-black and they're not our aesthetic.
- **Elevation is not a ramp.** There are exactly three app-level surfaces (`bg`, `bg-surface`, `bg-raised`) plus two overlay surfaces. Don't add intermediates.
- **Hover is additive**, not a replacement. `--bg-hover` sits on top of whatever the row's background is — it's visibly the same in every layer.
- **The rim matters.** On pure-black, a raised surface without `--border-overlay` looks like it's floating in a void. Always include the 1px perimeter on overlays.
