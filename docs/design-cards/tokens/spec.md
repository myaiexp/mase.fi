# Tokens — CSS variables

All defined on `:root` in `base.css`.

## Surface layers (AMOLED-black)

```css
--bg:          #09090b;   /* true-black page background */
--bg-surface:  #131316;   /* topbar, sticky headers, cards */
--bg-raised:   #18181c;   /* inputs, buttons, raised cards */
--bg-hover:    #27272a;   /* hover states */
```

## Borders

```css
--border:        #27272a;  /* 1px dividers */
--border-hover:  #3f3f46;
--border-color:  var(--border);   /* alias used by base-components.js */
```

## Elevation (overlays)

On pure-black bg, a single-step surface bump is invisible — modals/overlays get a two-step lift + stronger rim.

```css
--bg-overlay:       #1f1f24;   /* modal body */
--bg-overlay-rim:   #26262c;   /* modal header / footer (one tick brighter) */
--border-overlay:   #3f3f46;   /* stronger perimeter against pure-black bg */
```

## Foreground text

```css
--fg-1:   #fafafa;   /* primary — headings, key content */
--fg-2:   #a1a1aa;   /* secondary — body dim */
--fg-3:   #52525b;   /* muted — timestamps, meta */
```

## Accent (amber)

```css
--accent:       #e8a308;
--accent-glow:  rgba(232, 163, 8, 0.12);
--accent-text:  #e8a308;
```

## Semantic palette

```css
--green:  #22c55e;  /* success, working, user prompts */
--red:    #ef4444;  /* errors, danger */
--blue:   #58a6ff;  /* tools, info, links */
--cyan:   #06b6d4;  /* results, tokens */
--orange: #d29922;  /* landmarks, warnings, pending */
--purple: #bc8cff;  /* agents, thinking, Kelo */

--green-bg:  rgba(34, 197, 94, 0.15);
--red-bg:    rgba(239, 68, 68, 0.15);
--orange-bg: rgba(210, 153, 34, 0.15);
--purple-bg: rgba(188, 140, 255, 0.15);
--blue-bg:   rgba(88, 166, 255, 0.15);
```

## Type

```css
--font:       'JetBrains Mono', 'Consolas', 'Menlo', monospace;
--font-mono:  var(--font);

--text-xs:    10px;   /* micro-caps */
--text-sm:    11px;   /* meta */
--text-base:  12px;   /* body */
--text-md:    13px;   /* subhead */
--text-lg:    15px;   /* heading */

--leading:        1.4;
--leading-tight:  1.2;
```

## Spacing (2/4/8/12/16/24)

```css
--space-1:  2px;
--space-2:  4px;
--space-3:  8px;
--space-4:  12px;
--space-5:  16px;
--space-6:  24px;
```

## Motion + radii

```css
--transition: 0.15s ease;
--radius: 0;   /* intentionally zero — the system is square */
```

## Rules

- **Never use raw hex in Helm.** Every color should resolve through a token. If you need a color that isn't here, add it to `base.css` first.
- **Semantic tokens describe roles, not colors.** `--green` means "success/working/user-prompts" — don't use it for decorative green.
- **`--radius` is zero.** The system is square. If you add rounding in a component, that's a divergence — question it.
- **`--bg-hover` is a single value.** Don't invent hover tints per surface; use this one.
