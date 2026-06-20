# Buttons

One size, three variants. No ghost, no `sm`.

## Classes

```css
.btn {
  display: inline-flex; align-items: center; justify-content: center;
  height: 22px; padding: 0 10px;
  border: 1px solid var(--border);
  background: var(--bg-raised);
  color: var(--fg-1);
  font-family: var(--font); font-size: 11px; font-weight: 500;
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
  background: var(--red-bg);
  border-color: rgba(239, 68, 68, 0.4);
  color: var(--red);
}

.btn[disabled] {
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

- **One size.** 22px tall, 10px horizontal padding, 11px font. If a surface needs a smaller control, use an icon-only 16px affordance — not a smaller button.
- **Primary is amber.** Reserved for the single most-forward action in a pane. Never more than one primary button visible at once.
- **Default (neutral) is the baseline.** Most buttons are default. Primary earns its amber.
- **Danger uses `--red`** (8% tint + 40% border + red text, same shape as primary).
- **`white-space: nowrap`.** Buttons never wrap. If a label is too long, shorten the label.
- **No focus ring from us** — use the browser default (or set `:focus-visible` once globally in Helm's reset).

## Open questions

- **Icon-only buttons** aren't documented yet. When Helm adds them (e.g. toolbar in Source tab), bring the markup back here.
- **Toggle/segmented** variants aren't defined. Likely needed for Kanban view toggles etc.
