# Type — Scale

Five roles. Each bundles size + weight + color + tracking as a single unit. Never mix-and-match.

## Roles

| Role | Size | Weight | Color | Tracking | Class |
|---|---|---|---|---|---|
| **micro-caps** | 10px | 600 | `--fg-3` | `0.04em` uppercase | `.section-header` |
| **meta** | 11px | 400 | `--fg-3` | — | `.meta` |
| **body** | 12px | 400 | `--fg-1` | — | default (no class) |
| **subhead** | 13px | 600 | `--fg-1` | — | `.h2` |
| **heading** | 15px | 600 | `--fg-1` | `-0.01em` | `.h1` |

## Usage

- **micro-caps** — section headers, gutter labels, column titles ("WORKING · 2", "NET", "SESSIONS")
- **meta** — timestamps, durations, helper text, byline ("17:08 · 2m 17s ago · helm/02c0935")
- **body** — default for everything: rows, buttons, inputs, chat, session names
- **subhead** — pane subheaders, grouped-list titles, card headings inside a larger pane ("Active sessions")
- **heading** — modal titles, pane H1, empty-state title ("New session")

## Rules

- **Two weights only:** 400 for prose, 600 for emphasis. 500 and 700 aren't loaded.
- **Color carries hierarchy, not size.** The step from `--fg-3` (meta) → `--fg-1` (body) does more work than the 1px size jump.
- **Tracking is exclusive to micro-caps.** Nothing else gets letter-spacing.
- **No `1.5em` line-heights** — `--leading: 1.4` for prose, `--leading-tight: 1.2` for headings and single-line labels.
