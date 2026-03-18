# Phase 2: Tabbed Updates — COMPLETE

> Redesign the updates section with three-tier progressive disclosure and auto-generated dev log from commits.

## Goals

- Replace flat update list with tabbed UI: Projects / Features / Everything
- Auto-generate "Everything" entries from `git deployboth` commit titles
- Migrate existing hardcoded entries to `updates.json` on VPS
- Keep manual workflow for `project` and `feature` tier entries

## Design

Full design doc: `docs/plans/2026-03-05-tabbed-updates-design.md`

## Key Decisions

- **Data source:** Single `updates.json` on VPS at `/var/www/html/updates.json`, fetched client-side
- **Commit data:** Title only (`git log -1 --format=%s`) — no description body, to protect implementation details of private repos
- **Tabs are cumulative:** Projects < Features < Everything
- **Default tab:** Projects
- **deployboth extended:** Appends `log` entries to VPS JSON after pushing

## Architecture Notes

- Updates section changes from static HTML to client-side rendered from JSON
- No backend — JSON is a static file served by nginx
- Tab switching animated with anime.js (~150ms fade)
- Dates stored as ISO in JSON, formatted to Finnish `DD.MM.YYYY` client-side

## Implementation Notes

_To be filled during implementation._
