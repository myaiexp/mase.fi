# Iconography

One icon family, one weight. **Lucide**, 14px, 1.5-stroke, round caps and joins.

## Rules

- **Family: Lucide.** If you add a Feather icon because it "feels similar," it won't match stroke weight or corner treatment — redraw in Lucide style.
- **Size: 14px** for sidebar + inline in-row icons. **16px** for toolbar triggers. No other sizes.
- **Stroke: 1.5.** Not 2 (too heavy at 14px), not 1 (too thin on dense UI).
- **Caps/joins: round.** Consistent across everything.
- **Fill: none.** All icons are stroked, not filled. (Status dots are not icons — they're 6px circles drawn in CSS.)
- **Color: `currentColor`.** Every icon inherits — no hardcoded strokes.

## CSS defaults

```css
.icon {
  width: 14px; height: 14px;
  stroke: currentColor; fill: none;
  stroke-width: 1.5;
  stroke-linecap: round; stroke-linejoin: round;
  flex-shrink: 0;
}
```

## Rejections

- **No emoji.** Ever. Not in labels, not in empty states, not as fallbacks.
- **No filled/duotone icons.** Visual weight breaks the line-weight of the rest of the UI.
- **No custom bespoke icons.** If Lucide doesn't have what you need, pick the closest metaphor — don't hand-draw.
- **No cog for Settings.** Too detailed at 14px. Use `sliders-horizontal`.
