# Type — Scale

Five size steps, two line-heights — the size system the whole fleet builds hierarchy from.
This card owns the **steps** and the **role recipes** (size × weight × color). The **face and
weights** belong to the **type-family** card; the **raw token values** to the **tokens** card.

In one line: **a tight 10–15px monospace ramp where color and weight carry hierarchy and size
only sets the coarse tier.**

## The scale

Five steps, defined once on `:root` in `base.css`. Hand-tuned for a dense monospace UI — this
is **not** a geometric/modular scale. The jumps are `+1 / +1 / +1 / +2` across a 5px total
range, so don't try to "regularise" it to a 1.2× ratio; the closeness is the point.

| Token | px | Tier |
|---|---|---|
| `--text-xs` | 10px | micro-caps · labels |
| `--text-sm` | 11px | meta · controls · badges |
| `--text-base` | 12px | body (the `body` default) |
| `--text-md` | 13px | subhead (`h2`) |
| `--text-lg` | 15px | heading (`h1`) |

`--text-base` (12px) is the anchor — `body { font-size: var(--text-base) }`. Every other step is
read relative to it: two down to the smallest label, one and three up to the largest heading.

## Line-height

Two values, no more.

| Token | Value | Applies to |
|---|---|---|
| `--leading` | 1.4 | body, prose, any multi-line run |
| `--leading-tight` | 1.2 | headings (`h1`/`h2`/`h3`), dense single-line rows and labels |

**Two sanctioned exceptions** live in `base.css` and are part of the contract, not drift:

- `pre` → `1.3` — code blocks want a hair tighter than prose but looser than a heading.
- `.status` / `.tag` badges → `1` — single-line pills sized by their own height box.

Everything else picks the nearer of 1.4 / 1.2 — don't mint a third value for a one-off.

## Roles — size × weight × color

A "role" is a **recipe**, not a size. `base.css` ships the recipes below; component authors reach
for the class, never the raw size token. (Weights are the **type-family** ladder — `base.css`
itself uses 400 / 500 / 700; the 600 step is added by the mase.fi app layer, not here.)

| Role | Size | Weight | Color | Case / tracking | Realised by |
|---|---|---|---|---|---|
| **Heading** | 15px `--text-lg` | 700 | `--fg-1` | — | `h1` |
| **Subhead** | 13px `--text-md` | 700 | `--fg-1` | — | `h2` |
| **Strong body** | 12px `--text-base` | 700 | `--fg-1` | — | `h3` |
| **Body** | 12px `--text-base` | 400 | `--fg-1` | — | default, `.input` |
| **Control / badge** | 11px `--text-sm` | 500 | contextual | — | `.btn`, `.status`, `.tag` |
| **Meta / helper** | 11px `--text-sm` | 400–500 | `--fg-3` | — | `.helper`, inline timestamps |
| **Section header** | 10px `--text-xs` | 700 | `--fg-3` | UPPER · 0.04em | `.section-header` |
| **Form label** | 10px `--text-xs` | 500 | `--fg-2` | UPPER · 0.03em | `.form-label` |
| **Label / tag** | 10px `--text-xs` | 500 | `--fg-2` | — | `.label`, `.btn-sm` |

Two recipes worth staring at, because they carry the card's whole thesis:

- **`h3` and body are the same 12px.** They differ only by weight (700 vs 400) — proof that the
  emphasis you usually reach for is a weight, not a size.
- **The section header is *smaller* than body** (10px vs 12px) yet outranks it structurally.
  Uppercase + tracking + weight mark it as a label; size is not what puts it on top.

## Building hierarchy

Three independent levers. Reach for them in this order — size is deliberately last.

1. **Color first** — `--fg-1` (primary) / `--fg-2` (secondary) / `--fg-3` (muted). The
   `--fg-3 → --fg-1` jump separates a timestamp from its message more decisively than any 1px
   size change. The palette lives in the **tokens** card.
2. **Weight second** — 400 for prose, 700 for headings and hard emphasis (500 for labels and
   controls, per **type-family**). Regular → Bold is a real, loaded contrast, not a synthesized one.
3. **Size last** — only to set the coarse tier: page title (15) / subhead (13) / body (12) /
   micro (10–11). Because the whole range is 5px, size is the *finest* adjustment, not the loudest.

A well-formed piece of UI text names all three — "12px / 400 / `--fg-2`" is a spec; "small grey"
is not.

## Rules

- **Five steps, closed.** Don't add, remove, or renumber a size — downstream cards are designed
  against exactly these five. Need something bigger than 15px? The system has **no display tier by
  design** (dense, terminal-adjacent). Reach for weight, color, or a larger structural container —
  not a new `--text-*`.
- **Never fake emphasis with size.** Bumping body 12→13 to "make it pop" steals the subhead step.
  Use 700 or `--fg-1`.
- **No raw px font-size.** Always a `--text-*` token. The one relative exception is
  `code { font-size: 0.9em }` — deliberately relative so inline code tracks whatever text hosts
  it. It is not a rogue value and must not be hoisted to a token.
- **Tracking is for the uppercase 10px micro-labels only** — `.section-header` (0.04em),
  `.form-label` (0.03em). Never letter-space body or headings; a monospace face is already wide.
- **Two line-heights**, plus the documented `pre` (1.3) and badge (1) exceptions. Pick the nearer
  of 1.4 / 1.2 rather than inventing a value.

## Out of scope

- **Raw token values / the full custom-property inventory** → **tokens** card.
- **The typeface, its weight files, and feature policy** → **type-family** card.
- This card owns the **size steps, the line-height policy, and the role recipes** authors follow —
  nothing else.
