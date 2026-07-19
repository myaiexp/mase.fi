# Buttons

One size, three variants. No `sm`, no `ghost` in the vocabulary going forward.

Part of mase.fi's `base.css` design system (served to every project via
`https://mase.fi/base.css`). This card owns the `.btn` family; it builds on the
foundation cards — sizes come from **type-scale**, weight from **type-family**,
every color/tint resolves through a **tokens** var, and the tint recipe follows the
**themes** override contract.

## Intent

A button is a **control**, not a headline. It sits at the bottom of the type
hierarchy (11px / 500) and carries weight through color, not size. The whole family
is one fixed height so a row of buttons, inputs, and badges lines up without
per-call tuning — geometry is deterministic, like `.status` / `.tag`.

## Variants

| Variant | Class | Role |
|---|---|---|
| **Default** (neutral) | `.btn` | The baseline. Most buttons. Raised surface, 1px border. |
| **Primary** | `.btn .btn-primary` | The single most-forward action in a pane. Amber. |
| **Danger** | `.btn .btn-danger` | Destructive action. Same shape as primary, red instead of amber. |

Plus a shared `:disabled` state (0.5 opacity, `not-allowed`), and one modifier —
`.btn-stretch` — for a button that flanks a growing control (see below).

## Recipe (size × weight × color)

Per the **type-scale** "Control / badge" role: **11px `--text-sm` · 500 · contextual color**.

- **Height** — fixed `22px` with `line-height: 1`, centered by `inline-flex`. Not
  derived from padding, so font load / long labels can't shift it. (Same box model
  as `.status`/`.tag`, which fix `16px`.) The value lives in a component-local
  `--btn-h` (the `--icon-size` idiom) so a variant re-points one var instead of
  restating the box — `.btn-sm` shrinks it, `.btn-stretch` demotes it to a floor.
- **Horizontal padding** — `var(--space-3)` (8px). No vertical padding; the fixed
  height owns vertical size. (The April draft used a raw `10px`; snapped to the
  spacing ramp — the **tokens** card forbids raw-px padding.)
- **Gap** — `var(--space-2)` (4px) between an icon and its label, so icon+label
  buttons space correctly out of the box (a no-op for text-only buttons).
- **Border** — `1px solid var(--border)`; `--radius` is `0`, the system is square.

## Tokens & tints

Every value is a token; the two colored variants tint via `color-mix` so an
`--accent` / `--red` override — or a whole `[data-theme]` — re-tints them for free
(the **themes** contract; frozen rgba would not track).

```css
.btn {
  --btn-h: 22px;
  display: inline-flex; align-items: center; justify-content: center;
  gap: var(--space-2);
  height: var(--btn-h); padding: 0 var(--space-3);
  border: 1px solid var(--border);
  font-size: var(--text-sm); font-weight: 500; line-height: 1;
  background: var(--bg-raised); color: var(--text);
  white-space: nowrap; cursor: pointer;
  transition: background var(--transition);
}
.btn:hover    { background: var(--bg-hover); }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }

.btn-primary {
  background: var(--accent-glow);
  border-color: color-mix(in srgb, var(--accent) 40%, transparent);
  color: var(--accent-text);
}
.btn-primary:hover { background: color-mix(in srgb, var(--accent) 20%, transparent); }

.btn-danger {
  background:    color-mix(in srgb, var(--red) 8%,  transparent);
  border-color:  color-mix(in srgb, var(--red) 40%, transparent);
  color: var(--red);
}
.btn-danger:hover { background: color-mix(in srgb, var(--red) 16%, transparent); }
```

## Modifier — `.btn-stretch`

The **one sanctioned escape** from the fixed height: a button that flanks a control
which grows. The motivating case is a composer — attach / Stop / Queue / Send in a
flex row beside an auto-growing `<textarea>`. With a hard `height`, those buttons
pin to 22px and float at the top of a tall row; the fixed height is a *deterministic
box* rule, not an instruction to ignore the row it sits in.

```css
.btn-stretch {
  height: auto;
  min-height: var(--btn-h);
  align-self: stretch;
}
```

- Must be declared **after** `.btn-sm` / `.btn-ghost` in the sheet — same
  specificity, so source order decides which `height` wins.
- `--btn-h` becomes a **floor**, not a fixed value: in a one-line row a stretch
  button is indistinguishable from an ordinary one.
- `align-self: stretch` is set explicitly so it also works in an
  `align-items: center` row, not only an `align-items: stretch` one.
- **Opt-in per call site.** It is not a way to make a button "bigger" — one size
  still governs everything else. If nothing beside the button grows, don't use it.

## Markup

```html
<button class="btn">Cancel</button>
<button class="btn btn-primary">Launch</button>
<button class="btn btn-danger">Delete</button>
<button class="btn" disabled>Waiting…</button>

<!-- composer: send tracks the textarea's height -->
<form style="display:flex; align-items:stretch">
  <textarea class="textarea"></textarea>
  <button class="btn btn-primary btn-stretch">Send</button>
</form>
```

## Rules

- **One size.** 22px tall, `--text-sm` (11px). If a surface needs a smaller control,
  use an icon-only 16px affordance — not a smaller button. The only height escape is
  `.btn-stretch`, and only when a flex sibling grows.
- **One primary per pane.** Primary earns its amber; it marks the single most-forward
  action. Never two amber buttons competing at once.
- **Default is the baseline.** Most buttons are neutral. Primary is the exception.
- **Danger tracks `--red`** (8% tint · 40% border · red text; hover lifts to 16%).
- **Primary/danger tint via `color-mix`**, never frozen rgba — so an accent override
  or theme re-tints them. (This resolves idea #2467: `.btn-danger` was frozen amber-
  era rgba that ignored a re-themed `--red`.)
- **`white-space: nowrap`.** Buttons never wrap. Too long? Shorten the label.
- **No button-specific focus ring.** `base.css`'s global `:focus-visible` (1px amber
  outline, 1px offset) already covers buttons. Don't add one.

## Legacy — `.btn-sm`, `.btn-ghost`

Deprecated and **not** part of the vocabulary above, but **retained in `base.css`**
so the ~250 `.btn-sm` and ~24 `.btn-ghost` usages across the fleet keep rendering.
Removing them is a separate fleet-wide migration, not this card.

- `.btn-sm` — overrides height to `18px`, padding to `var(--space-2)`, font to
  `--text-xs`, so it stays visibly smaller than the fixed-height `.btn`.
- `.btn-ghost` — transparent bg + border, dim text; hover fills with `--bg-hover`.

Don't reach for either in new work: prefer neutral `.btn`, or a 16px icon-only
affordance where `.btn-sm` was tempting, and a real `.btn` or `<a>` where
`.btn-ghost` was.

## Open questions

- **Icon-only buttons** aren't documented yet. When a mase.fi surface needs a compact
  affordance (toolbars, dense rows), document the 16px icon-only variant here — it's
  the sanctioned replacement for `.btn-sm`.
- **Toggle / segmented** variants aren't defined. Document them here when a surface
  needs a view switch (e.g. channel/feed view toggles).
