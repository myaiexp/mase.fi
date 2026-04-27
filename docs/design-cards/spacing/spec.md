# Spacing

Six-step scale. Doubling with a 2px seed.

```css
--space-1:  2px;
--space-2:  4px;
--space-3:  8px;
--space-4:  12px;
--space-5:  16px;
--space-6:  24px;
```

## When to use which

| Step | Use for |
|---|---|
| **2px** | Intra-row gaps (title → metadata inside a card, icon → label when tight) |
| **4px** | Inline gaps between siblings in a row (badge dot → label, separator `·`) |
| **8px** | Standard padding inside compact rows (card, table, list item) |
| **12px** | Section padding inside panels (modal body, card grids) |
| **16px** | Pane-level padding, between grouped-list sections |
| **24px** | Between top-level landmarks (header group → content group on same pane) |

## Rules

- **Don't use raw px** for gap/padding/margin in Helm. Use the tokens.
- **Never `margin`; prefer `gap`** on flex/grid containers. Margins pile up unpredictably; gaps are composable.
- **One step per jump.** If 4px feels too tight and 8px feels too loose, the problem is layout structure, not the scale.
- **No values between 16 and 24.** Pick a side. If 20px looks right, you're probably over-padding one element when the structure wants fewer elements.
