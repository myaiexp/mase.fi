# Flagged — attention edge

A persistent "look at this" marker for a card or row: a 1px `--accent` outline on all
four edges. Part of `base.css` (`.flagged`), served to every project.

First shipped on helm's session kanban, where a flagged session (machine trouble, or the
manual ⚑ bookmark) was a 6px dot lost among the card's other state dots.

## Usage

```html
<div class="card flagged">…</div>
```

Add or remove the class. The element's own border, padding and background stay as they
are; flagging never shifts layout.

## Recipe

| Property | Value | Why |
|---|---|---|
| `outline` | `var(--ring-flag) solid var(--accent)` (1px) | An outline, not a border: toggling it never moves a pixel of layout |
| `outline-offset` | `calc(-1 * var(--ring-flag))` | Inset by its own width, so it sits on the element's edge — inside an `overflow: hidden` parent, not in the gap to a neighbour |
| on `:focus-visible` | `var(--ring-focus)` (2px), offset `1px` | A focused flagged element shows the focus ring |

## Focus vs. flag

Both are `--accent` outlines. They differ in width (focus 2px, flag 1px) and side (focus
1px outside, flag inside). `src/base-rings.test.js` fails if `--ring-focus` stops being
wider than `--ring-flag`, or if either rule stops using its token.

`.flagged` and `:focus-visible` have the same specificity and `.flagged` comes later in
the file, so `.flagged:focus-visible` restates the focus ring. Without that rule, a
focused flagged element would show only the flag.

An app with its own focus ring (helm's 2px nav cursor, `[data-nav]:focus-visible`) keeps
it: that selector outranks both.

## Colour

Amber (`--accent`), not red. A flag asks for a look, not immediate action; red reads as
"act now" and belongs to errors (`.status-error`, `.dot-red`). An `--accent` override
re-tints the edge with the rest of the app.

## Rules

- **Four edges, never a left bar.** A thick coloured left-edge bar is the pattern this
  replaces; don't add a new one for any state.
- **Pair it with a text cue.** The edge is colour-only and screen readers never see it.
  Give the element a label, a `title`, a `.status` badge or a dot with a title, so the
  reason is readable too.
- **One edge per element.** Don't combine `.flagged` with another outline on the same
  element. A stronger state can build on it: helm's parked card is `.flagged` plus an
  `--accent-glow` background and a reason row.
- **Block and flex elements.** Outline on `<tr>` has historically rendered unevenly
  across browsers; flag a row element that is a block, or the cells' container.
- **Not for selection, hover or focus.** Those are transient; a flag is a state that
  persists until someone clears it. Hover is `--bg-hover`, focus is the global
  `:focus-visible` ring.
