# Tokens — CSS variables

Every custom property in the design system, defined once on `:root` in `src/base.css` and
served to every project via `<link rel="stylesheet" href="https://mase.fi/base.css">`. This
is the canonical inventory; components consume these — they never hardcode the underlying
values. Override `--accent` (or add project-local vars) after the link if a project needs it.

Aesthetic in one line: **AMOLED-true-black, zinc greys, one amber accent, monospace, square.**

## Surfaces

AMOLED-black page with three app-level surfaces plus a shared hover tint. Elevation is
structural, not shadow — see the **elevation** card for the overlay contract.

| Token | Value | Role |
|---|---|---|
| `--bg` | `#09090b` | Page background (AMOLED-true-black) |
| `--bg-surface` | `#131316` | Sticky headers, topbar, inline cards |
| `--bg-raised` | `#18181c` | Inputs, buttons, raised cards |
| `--bg-hover` | `#27272a` | Any hover state — sits **on top of** whatever surface it's over |
| `--bg-overlay` | `#1f1f24` | Modal body — two steps above `--bg-raised` |
| `--bg-overlay-rim` | `#26262c` | Modal header/footer — one tick brighter than the body |

## Borders

1px dividers only — the system has no drop shadows. Overlays escalate to `--border-overlay`
so they don't bleed into the black.

| Token | Value | Role |
|---|---|---|
| `--border` | `#27272a` | Default 1px dividers, control borders |
| `--border-hover` | `#3f3f46` | Hover / focus border |
| `--border-overlay` | `#3f3f46` | Modal / popover perimeter against pure black |
| `--border-color` | → `--border` | Alias consumed by `base-components.js` — don't redefine |

## Foreground text

`--fg-*` is canonical. `--text*` are back-compat aliases pointing at the same values — both
are live and both appear across the fleet; prefer `--fg-*` in new code, but never assume a
consumer isn't using the alias.

| Token | Alias | Value | Role |
|---|---|---|---|
| `--fg-1` | `--text` | `#fafafa` | Primary — headings, key content |
| `--fg-2` | `--text-dim` | `#a1a1aa` | Secondary — body, dim labels |
| `--fg-3` | `--text-muted` | `#52525b` | Muted — timestamps, meta, placeholders |

## Accent (amber)

One accent for the whole system. `--accent-glow` is the accent's tint surface (used for
`.btn-primary`, `--accent-glow` fills, selection); it's the amber analog of a `--*-bg`.

| Token | Value | Role |
|---|---|---|
| `--accent` | `#e8a308` | Accent fills, focus ring, active state |
| `--accent-text` | `#e8a308` | Accent-colored text (same hue, separate token so text vs fill can diverge later) |
| `--accent-glow` | `rgba(232,163,8,0.12)` | Accent tint surface — primary-button bg, glow fills |

## Semantic palette

Roles, not decoration. `--green` means "success/working" — don't reach for it because you
want a green. Each maps to a fixed meaning across every project.

| Token | Value | Role |
|---|---|---|
| `--green` | `#22c55e` | Success, working, user prompts |
| `--red` | `#ef4444` | Error, danger, destructive |
| `--blue` | `#58a6ff` | Tools, info, links |
| `--cyan` | `#06b6d4` | Results, tokens, counts |
| `--orange` | `#d29922` | Warnings, pending, landmarks |
| `--purple` | `#bc8cff` | Agents, thinking, Kelo |

### Semantic surfaces (15% tint)

Pre-mixed fill tints for banners/badges. Note the asymmetry: **there is no `--cyan-bg`**
(cyan is used as text/marks, not as a filled surface). If you need a tint that isn't listed,
mix it at the point of use with `color-mix(in srgb, var(--x) N%, transparent)` rather than
adding a one-off token.

| Token | Value |
|---|---|
| `--green-bg` | `rgba(34,197,94,0.15)` |
| `--red-bg` | `rgba(239,68,68,0.15)` |
| `--orange-bg` | `rgba(210,153,34,0.15)` |
| `--blue-bg` | `rgba(88,166,255,0.15)` |
| `--purple-bg` | `rgba(188,140,255,0.15)` |

## Type

Monospace-only system. One family, five sizes, two line-heights.

| Token | Value | Role |
|---|---|---|
| `--font` | `'JetBrains Mono', 'Consolas', monospace` | The single system family |
| `--font-mono` | → `--font` | Alias — same stack, kept so the two can't drift |
| `--text-xs` | `10px` | Micro-caps, form labels, section headers |
| `--text-sm` | `11px` | Meta, badges, helper text, buttons |
| `--text-base` | `12px` | Body (the `body` default) |
| `--text-md` | `13px` | Subheads (`h2`) |
| `--text-lg` | `15px` | Headings (`h1`) |
| `--leading` | `1.4` | Default line-height |
| `--leading-tight` | `1.2` | Headings, dense rows |

Only two weights ship (400 + 700 `@font-face`). `font-weight: 500` renders from the 400 file
— safe to use for a subtle emphasis without loading a third weight.

## Spacing (2 / 4 / 8 / 12 / 16 / 24)

Six steps. Roughly doubling, tuned for a dense monospace UI. Use these for padding, gap, and
margin — no raw pixel values.

| Token | Value |
|---|---|
| `--space-1` | `2px` |
| `--space-2` | `4px` |
| `--space-3` | `8px` |
| `--space-4` | `12px` |
| `--space-5` | `16px` |
| `--space-6` | `24px` |

## Motion & radii

| Token | Value | Role |
|---|---|---|
| `--transition` | `0.15s ease` | The one transition timing — hover, focus, color shifts |
| `--radius` | `0` | Corner radius — **intentionally zero. The system is square.** |

## Rules

- **Never use raw hex.** Every color resolves through a token. If the color you need isn't
  here, add it to `base.css` first — don't inline it.
- **Semantic tokens describe roles, not colors.** `--green` = success/working; don't use it
  for a decorative green. Same for the rest.
- **`--radius` is zero.** The system is square. Rounding in a component is a divergence —
  question it before shipping it.
- **`--bg-hover` is one value, additive.** Don't invent per-surface hover tints; this one
  sits on top of every layer and reads the same everywhere.
- **Prefer `--fg-*` in new code**, but treat `--text*` as live — consumers use both.
- **One-off tints mix at the call site.** Reach for `color-mix(...)` on an existing color
  var before adding a new `--*-bg` token.
