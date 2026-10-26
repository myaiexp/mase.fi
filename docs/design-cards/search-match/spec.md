# Search match — found-text highlight

Marks the text a search or filter box found, inside the results it kept. Part of
`base.css`, served to every project, as `::highlight(search-match)` and `mark`.

First shipped on helm's session detail filter: a query for an idea id kept several rows,
and nothing showed where in each row the id was. Before this card, mase.fi's feed and
helm's source tab each styled their own `<mark>`, with different tints.

## Usage

Either form gets the same look.

**Custom highlight** — paints Ranges, changes no DOM. Use it when the content re-renders
live, or something reads its `textContent` (copy menus, filters):

```js
CSS.highlights.set('search-match', new Highlight(...ranges));
CSS.highlights.delete('search-match'); // on clear
```

Guard on `CSS.highlights` existing: without it the filter still works, only the marking
is missing. helm's `web/events/search-highlight.js` builds the Ranges (case-insensitive,
matches spanning text nodes, a cap on range count).

**`<mark>`** — wrap each match. Use it for static content the page renders once and owns.

## Recipe

| Property | Value | Why |
|---|---|---|
| `background-color` | `color-mix(in srgb, var(--accent) 40%, transparent)` | Stronger than `::selection` (25%), so a match reads first |
| `color` | `var(--fg-1)` | Selection text turns `--accent`; a match keeps bright text, so the two stay apart where they overlap |

No padding, border or radius: `::highlight()` accepts only colour and decoration
properties, and `<mark>` matches it so both forms look identical. An `--accent` override
re-tints both.

## Rules

- **Two rules, never one selector list.** A browser that can't parse `::highlight()`
  drops the whole list, `mark` included. `src/base-search-match.test.js` pins this.
- **Mark the kept results, not instead of filtering.** The highlight says *where* in a
  row; the filter (hide, or dim, non-matching rows) says *which* rows.
- **Open what hides the match.** If a kept row folds its content (a collapsed result), open
  it while the search is active and close it again on clear — a highlight inside a closed
  fold shows nothing.
- **Don't restyle it per project.** A project that needs a different tint overrides
  `--accent`, not the rule.
