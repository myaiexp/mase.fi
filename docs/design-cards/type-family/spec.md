# Type — JetBrains Mono

Sole family, self-hosted. Picked over Menlo/Consolas because Helm is fundamentally a code-adjacent UI — terminal output, file paths, git hashes, tool calls.

## Loading

```css
@font-face {
  font-family: 'JetBrains Mono';
  font-style: normal;
  font-weight: 400 500;
  font-display: swap;
  src: url('assets/fonts/JetBrainsMono-Regular.woff2') format('woff2');
}
@font-face {
  font-family: 'JetBrains Mono';
  font-style: normal;
  font-weight: 600 700;
  font-display: swap;
  src: url('assets/fonts/JetBrainsMono-Bold.woff2') format('woff2');
}
```

`--font` token references it with Consolas/Menlo as fallbacks.

## Weights

**Only 400 and 600 are used.** The woff2 files support the full 400–700 range but we never invoke 500 or 700.

- **400** — prose, body, meta, forms
- **600** — emphasis, micro-caps, subhead, heading

## Features

- **Programming ligatures** on by default: `->`, `=>`, `!=`, `==`, `>=`, `<=`, `:=`, `||`, `&&`, `...`, `//`
- **Tabular numerics** — every numeric surface uses `font-variant-numeric: tabular-nums` so columns align without a wrapper. Applied on: topbar metrics, session-card times, kanban counts, Kelo footer tokens.

## Rules

- **Don't introduce a second family.** Even for brand/marketing — one face keeps the system honest.
- **Don't load 500 or 700.** If emphasis needs more weight than 600, use color (`--fg-1`) or size (`--text-md` subhead role) instead.
- **Apply `font-variant-numeric: tabular-nums` on containers that hold numeric columns.** Don't apply globally — ligature rendering for prose is fine with proportional figures.
