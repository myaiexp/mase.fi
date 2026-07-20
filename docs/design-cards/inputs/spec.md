# Inputs & labels

Text input, textarea, and form label. Part of mase.fi's `base.css` design system
(served to every project via `https://mase.fi/base.css`). This card owns the
`.input` / `.textarea` / `.select` controls, the `.form-label`/`.input`/`.helper`
composition, and the `.helper` line — building on the foundation cards for its
values.

## Intent

An input is a **control**, not content. Its whole thesis is that it shares the
button box model: **one fixed height (22px) with `line-height: 1`**, so an input,
a native select, and a `.btn` line up in a single row without per-call tuning —
the same deterministic geometry `.btn` / `.status` / `.tag` use. The **border
carries every state**; there is no glow, no background shift, no shake.

## Foundation this builds on

| Concern | Owned by | What inputs consume |
|---|---|---|
| Every color/tint token | **tokens** | `--bg-raised`, `--border`, `--accent`, `--red`, `--fg-*` |
| Size steps + role recipes | **type-scale** | `.input` = **Body** (12px / 400 / `--fg-1`); `.form-label` = **Form label**; `.helper` = **Meta / helper** |
| Weight ladder | **type-family** | 400 for input text, 500 for the label (base.css uses 400 / 500 / 700 — 600 is app-layer only) |
| Fixed-height control precedent | **buttons** | the 22px `line-height: 1` box the input pairs with |

## The recipe

### `.input` (and `.select`)

Per the type-scale **Body** role — 12px / 400 / `--fg-1`.

- **Height** — fixed `22px` with `line-height: 1`, so font load or a long value
  can't shift it. This is the pairing contract with `.btn` (also 22px / `line-height: 1`).
- **Padding** — `0 var(--space-3)` (0 8px). Horizontal only; the fixed height owns
  vertical size. Matches the button's horizontal padding exactly, so an input and a
  button in one row share the same inner rhythm.
- **Border** — `1px solid var(--border)`; `--radius` is 0, the system is square.
- **Background** — `var(--bg-raised)` (the tokens card's "inputs, buttons, raised
  cards" surface).
- **Native `.select`** shares this box for row alignment; the rich combobox is the
  `<base-select>` web component (see `docs/base-components.md`).

### `.textarea`

Adds `.textarea` beside `.input` for the multi-line case.

- `height: auto; min-height: 60px` — grows with content from a 60px floor.
- `padding: var(--space-2) var(--space-3)` (4px 8px) — horizontal matches the
  input; a little vertical room for multi-line.
- `line-height: var(--leading)` (1.4) — prose line-height, unlike the single-line
  input's `1`.
- `resize: vertical` — overrides the base reset's `resize: none`.

### `.form-label`

The card's "label." It **consumes** the type-scale **Form label** role already in
`base.css` (10px / 500 / `--fg-2` / UPPER / 0.03em tracking) — it does **not**
redefine it. The one composition value this card sets is the label→input gap:
`margin-bottom: var(--space-2)` (4px).

> Note: `.label` in `base.css` is a **chip**, not a form label. Use `.form-label`
> for the field label. (The April draft used `.label`; reconciled to `.form-label`
> when the type-scale card codified the role.)

### `.helper` / `.helper-error`

Per the type-scale **Meta / helper** role — 11px / `--fg-3`, `margin-top:
var(--space-2)` (4px). `.helper-error` recolors to `--red`. Only rendered when
there's something to say.

## States

| State | Treatment |
|---|---|
| **Rest** | `--border`, `--bg-raised`, `--fg-1` text |
| **Placeholder** | text is `--fg-3` (a hint, same color as labels/meta — not content) |
| **Focus** | border → `--accent`, outline removed. Via the global `.input:focus-visible` rule; no per-input ring, no glow |
| **Disabled** | `opacity: 0.5; cursor: not-allowed` |
| **Invalid** | `[aria-invalid="true"]` → border `--red`, plus a `.helper-error` line below |

Invalid is **controlled** via `aria-invalid`, not native `:invalid` — so an empty
required field doesn't flash red before the user has touched it.

## Markup

```html
<div class="field">
  <label class="form-label" for="branch">Branch</label>
  <input class="input" id="branch" value="helm/new-feature">
  <div class="helper">Used as the working-tree branch name.</div>
</div>

<div class="field">
  <label class="form-label" for="prompt">Prompt</label>
  <textarea class="input textarea" id="prompt">…</textarea>
</div>

<div class="field">
  <label class="form-label" for="repo">Repo URL</label>
  <input class="input" id="repo" value="…" aria-invalid="true">
  <div class="helper helper-error">Repository not reachable (404).</div>
</div>

<!-- input + button, both 22px, aligned by the shared box model -->
<div class="row">
  <input class="input" value="helm/design-inputs">
  <button class="btn btn-primary">Create</button>
</div>
```

## Rules

- **Height matches buttons (22px).** Inputs, selects, and buttons in one row are
  equal-height and baseline-aligned. Don't override the height per surface.
- **Label is always `.form-label`** — micro-caps, 10px, 500, `--fg-2`, UPPER,
  0.03em. Same role the type-scale card defines; never restyle it here.
- **Focus = amber border.** No glow, no outline, no offset ring — the border color
  shift is the whole signal.
- **Invalid = red border + `.helper-error`.** Don't shake, don't emoji, don't tint
  the background.
- **Placeholder is `--fg-3`.** A hint, not a value — and never a substitute for a
  label; it vanishes the moment text is typed.
- **Square.** `--radius` is 0. Rounded corners read as a foreign design system.

## Consumer impact

This card restyles `.input` / `.textarea` / `.select` / `.form-label` / `.helper`
fleet-wide (every project loads `base.css`). Changes vs the pre-card sheet:

- Inputs gain a **deterministic 22px height** (were padding-driven ~22px, now fixed
  + `line-height: 1`).
- Input padding `2px 4px` → `0 var(--space-3)` (horizontal 8px, vertical owned by
  height) — matches the button.
- `.textarea` split from the shared rule: `min-height: 60px`, 1.4 line-height,
  vertical resize.
- Label→input and input→helper gaps `2px` → `var(--space-2)` (4px).

## Reconciliation from the April draft

- `.label` (form-label role) → **`.form-label`** — `.label` is the chip; the
  type-scale card owns the form-label role.
- Label weight `600` → **500** (type-family: base.css ships 400 / 500 / 700; 600 is
  app-layer only).
- Label color `--fg-3` → **`--fg-2`**, tracking `0.04em` → **0.03em** (the
  type-scale Form-label recipe; 0.04em is the section-header).
- Raw `8px` / `6px` paddings → **`var(--space-*)`** tokens (no raw px, per tokens).

## Open questions

- **Checkbox / radio** not documented. When first needed, add here.
- **Select / combobox** — native `.select` shares the input box; the rich control is
  `<base-select>`. A dedicated select card can supersede this note. `<base-select>`
  sizes to its widest option and opts into filling with `stretch` (the `.btn-stretch`
  idiom); see `docs/base-components.md`.
