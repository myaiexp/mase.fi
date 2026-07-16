# Themes

AMOLED-default (the values in `base.css`) is the primary theme. Alt themes override the same token names via `[data-theme="name"]` on `<html>`.

## How themes attach

Nothing changes in component markup. Only `:root` tokens are overridden.

```css
[data-theme="mono"] {
  /* fully desaturated — accent becomes fg-1 */
  --accent:       var(--fg-1);
  --accent-glow:  rgba(255,255,255,0.08);
  --green: var(--fg-1); --red: var(--fg-1);
  --blue:  var(--fg-1); --orange: var(--fg-1);
  --purple: var(--fg-1); --cyan: var(--fg-1);
}

[data-theme="paper"] {
  /* inverted — light bg, dark fg. For print / export screenshots. */
  --bg:         #f7f7f5;
  --bg-surface: #efefec;
  --bg-raised:  #e4e4e0;
  --bg-hover:   #d8d8d4;
  --border:     #c8c8c4;
  --fg-1: #18181b; --fg-2: #52525b; --fg-3: #a1a1aa;
}
```

`--bg` (`#09090b`) is the only truly fixed value — it's the identity.

## Rules

- **Tokens only.** A theme never overrides a component class. If a theme wants to change how cards look, change the token, not the class.
- **AMOLED is the canonical.** Light mode (`paper`) is for exports/print. Don't spend design time tuning mid-tone themes.
- **Mono is a stress-test.** If the UI reads correctly with every semantic color collapsed to fg-1, the visual hierarchy works on shape and contrast alone. Good sanity check.

## Open questions

- **System preference (`prefers-color-scheme: light`) ignored.** Intentional for now — Helm is AMOLED-first. Revisit if a user ships screenshots to non-dark channels.
- **Accessibility audit** — semantic color contrast ratios against `--bg-raised` hover states aren't verified for AA. Do before shipping externally.
