# Themes

The system ships **one** theme — AMOLED-dark, all tokens on `:root` in `base.css`. "Theming"
is not a `base.css` feature: it's a **consumer sheet loaded after `base.css` that re-declares
`:root` tokens under `[data-theme="name"]` on `<html>`**. A theme recolors tokens; it never
touches markup, never touches component classes, and never re-lays-out.

In one line: **`--bg` and primary text are the fixed identity; everything else is a re-tintable
surface, and a theme is the minimal token override that carries it.**

## Identity — one theme

`base.css` ships a single AMOLED-true-black theme. There is **no** `[data-theme]`, **no**
`prefers-color-scheme`, **no** light mode in the shared sheet — the only media query is
`prefers-reduced-motion`. Dark-only is a decision, not a gap: the fleet is terminal-adjacent
and AMOLED-true-black is the identity (see the **tokens** card). A light or alternate theme is
opt-in per consumer via the contract below — never auto-flipped by a system preference.

## The override contract

A theme is a **stylesheet the consumer loads after `base.css`** that re-declares tokens under a
`[data-theme="name"]` attribute on `<html>`. Later source order + the attribute selector's
specificity mean the override wins; because components read tokens (never raw values), the whole
UI re-tints with zero markup change.

Reference implementation — helm's `web/themes.css` (`frost` / `terminal` / `ember` / `violet`):

```css
/* consumer sheet, loaded AFTER base.css */
[data-theme="frost"] {
  --bg-surface: #0e1117; --bg-raised: #151a22; --bg-hover: #1e2530;
  --border: #2a3040; --border-hover: #3a4858;
  --text-dim: #9aa8b8; --text-muted: #4c5a6b;
  --accent: #7dc4e4; --accent-glow: rgba(125,196,228,0.15); --accent-text: #7dc4e4;
  --green:#55d48e; --red:#e85c6a; --blue:#7dc4e4; --cyan:#52d6e8; --orange:#d4a055; --purple:#a8aaee;
}
```

- **Load order** — `base.css → themes.css → helm.css`. The theme sheet sits between the
  foundation and the component layer.
- **Switching** — JS sets `document.documentElement.dataset.theme` from `localStorage['helm-theme']`
  (helm's `applyTheme()`). No default theme = the bare `:root` AMOLED-dark.
- **Minimal form** — override just the `--accent` family. `base.css`'s own header invites it
  ("override `--accent` per project"); mase.fi runs an even lighter per-scope `--ch-accent`
  accent swap set from JS. A one-token accent change **is** a valid theme.

## What a theme may override

| Layer | Tokens | May a theme override? |
|---|---|---|
| **Page identity** | `--bg` `#09090b` | **No** — the AMOLED-black identity, held constant across every shipped theme |
| **Primary text** | `--fg-1` / `--text` `#fafafa` | **No** — the max-contrast reading layer stays fixed; themes re-tint only the dim/muted steps |
| **Surfaces** | `--bg-surface` `--bg-raised` `--bg-hover` | Yes — the theme's tonal body |
| **Borders** | `--border` `--border-hover` | Yes |
| **Secondary text** | `--fg-2`/`--text-dim`, `--fg-3`/`--text-muted` | Yes |
| **Accent** | `--accent` `--accent-glow` `--accent-text` | Yes — the headline lever |
| **Semantics** | `--green` `--red` `--blue` `--cyan` `--orange` `--purple` | Yes |
| **Structure** | type scale, line-heights, spacing, `--radius` `--transition` | **No** — geometry, not palette; overriding it forks the system, it isn't a theme |

## Override the source token, not the alias

`base.css` defines `--text-dim: var(--fg-2)`, `--text-muted: var(--fg-3)`, `--accent-text` alongside
`--accent`. Override the **canonical root** (`--fg-2`, `--fg-3`) and the alias re-tints with it for
free. Override only the `--text-*` alias (as helm's `themes.css` currently does) and any component
reading the canonical `--fg-*` is stranded at the base value. It works today because `base.css`'s
own components read the aliases — but it's a forward trap the moment a consumer styles against
`--fg-*`. Prefer overriding the root.

## Pre-mixed tints don't track

The semantic **surface** tokens (`--green-bg` … `--purple-bg`) and any component that hardcodes an
rgba are **frozen literals of the default hue** — they do **not** follow a re-themed `--green`. A
theme that re-tints a semantic color must also re-declare that color's tint, **or** the component
should mix at the call site: `color-mix(in srgb, var(--green) 15%, transparent)`. That is the
pattern `.status` / `.tag` already use, and it tracks a theme for free. Prefer it over a frozen
`--*-bg` when authoring anything meant to re-theme cleanly.

## Composable modifiers

Orthogonal axes are **separate `[data-*]` attributes**, each overriding a minimal token subset,
composed by attribute-stacking — not new full themes. helm's `[data-high-contrast]` overrides only
`--border` / `--border-hover` and stacks with any theme:

```css
[data-high-contrast]                    { --border:#52525b; --border-hover:#71717a; }
[data-high-contrast][data-theme="frost"]{ --border:#4a5568; --border-hover:#6a7a8e; }
```

Add a new axis as a new attribute (toggled independently in JS); don't multiply it into the theme
list.

## Refinement shipped (this card)

`base.css`'s documented "override `--accent`" lever wasn't fully wired: `.btn-primary`'s border and
hover and `::selection`'s background were frozen amber `rgba(232,163,8,…)` literals that ignored a
re-themed `--accent`. Converted to `color-mix(in srgb, var(--accent) N%, transparent)` — **byte-identical
computed color**, but the accent override now recolors every accented surface instead of most of
them. No new infrastructure, no light theme — just making the promised lever true.

## Rules

- **Tokens only.** A theme never overrides a component class. Want different cards? Re-tint the
  token the card reads, not `.card`.
- **Hold `--bg` and `--fg-1`.** Re-tinting them isn't a theme in this family — it's a light-mode
  redesign, out of scope and not shipped.
- **No `prefers-color-scheme` auto-flip.** Dark is the default; alternates are explicit
  `[data-theme]` opt-ins the consumer switches deliberately.
- **Override the root, not the alias** (`--fg-2` over `--text-dim`) so canonical + alias move together.
- **Structural tokens are not theme surface.** Type / space / radius / transition overrides fork
  the system rather than theme it.
- **Declare only the overridden subset** — never copy the whole `:root` into a theme.

## Anti-patterns

- `[data-theme="x"] .btn { … }` — theming a class instead of the token it reads.
- Re-declaring the entire `:root` in a theme — hides drift when `base.css` adds a token.
- Overriding `--bg`, a structural token, or the `--text-*`/`--accent-text` alias alone.
- Hardcoding an rgba that duplicates a token's default value — it silently won't track a theme.

## Out of scope

- The property **inventory / values** → **tokens** card. The **face / weights** → **type-family**.
  The **size steps** → **type-scale**. This card owns the theming **model**: what a theme is, what
  it may override, and how it attaches.
- A **light theme** or new theme infrastructure — not shipped; the system is AMOLED-dark by design.
