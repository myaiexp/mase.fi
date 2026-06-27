# Buttons

One size, three variants. No ghost, no `sm`.

Part of mase.fi's `base.css` design system (promoted from Helm). Replaces the current `.btn` rules — which still carry `.btn-sm` and `.btn-ghost` — with a single fixed-height button. Migrating existing consumers off `sm`/`ghost` is a separate task.

## Classes

```css
.btn {
  display: inline-flex; align-items: center; justify-content: center;
  height: 22px; padding: 0 10px;
  border: 1px solid var(--border);
  background: var(--bg-raised);
  color: var(--text);
  font-size: var(--text-sm); font-weight: 500;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  transition: background var(--transition);
}
.btn:hover { background: var(--bg-hover); }

.btn-primary {
  background: var(--accent-glow);
  border-color: rgba(232, 163, 8, 0.4);
  color: var(--accent);
}
.btn-primary:hover {
  background: rgba(232, 163, 8, 0.18);
}

.btn-danger {
  background: rgba(239, 68, 68, 0.08);
  border-color: rgba(239, 68, 68, 0.4);
  color: var(--red);
}
.btn-danger:hover {
  background: rgba(239, 68, 68, 0.16);
}

.btn:disabled {
  opacity: 0.5; cursor: not-allowed;
}
```

## Markup

```html
<button class="btn">Cancel</button>
<button class="btn btn-primary">Launch</button>
<button class="btn btn-danger">Delete</button>
<button class="btn" disabled>Waiting…</button>
```

## Rules

- **One size.** 22px tall, 10px horizontal padding, `--text-sm` (11px) font. If a surface needs a smaller control, use an icon-only 16px affordance — not a smaller button.
- **Primary is amber.** Reserved for the single most-forward action in a pane. Never more than one primary button visible at once.
- **Default (neutral) is the baseline.** Most buttons are default. Primary earns its amber.
- **Danger uses `--red`** (8% tint + 40% border + red text; hover lifts the tint to 16%, same shape as primary).
- **`white-space: nowrap`.** Buttons never wrap. If a label is too long, shorten the label.
- **No focus ring from `.btn`.** mase.fi's `base.css` already sets a global `:focus-visible` (1px amber outline, 1px offset) — buttons inherit it. Don't add a button-specific ring.

## Open questions

- **Icon-only buttons** aren't documented yet. When a mase.fi surface needs a compact affordance (toolbars, dense rows), document the 16px icon-only variant here.
- **Toggle/segmented** variants aren't defined. Document them here when a surface needs a view switch (e.g. channel/feed view toggles).
