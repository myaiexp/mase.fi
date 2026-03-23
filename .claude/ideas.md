# Ideas

> Feature ideas, improvements, tech debt, and things worth revisiting.

## High Priority

<!-- Ideas that should be addressed soon or in the next phase -->

## Future

### 2026-03-23 — IRC terminal redesign brainstorming

- **Easter egg commands in the prompt**: The `/` navigation input could support hidden commands beyond channel switching — `/help`, `/uptime`, `/whoami`, etc. Fun discovery for technical visitors.

- **Per-project demo links**: The `?demo` convention exists per-app. Project channel headers could surface a "Try demo →" link for apps that support it (Tracker, Mindmap). Natural fit in the terminal output style.

- **Channel notifications / unread counts**: Channels could show unread-style indicators when new entries appear since last visit (tracked in localStorage). IRC clients show bold/highlight for channels with new messages.

- **`#about` ASCII art logo**: A small custom ASCII art piece next to the neofetch info block. Could be a stylized "M" or a minimal geometric design. Worth designing separately — it's a creative task.

- **Boot sequence variations**: Different boot messages on repeat visits (within the 1-week window when replay is used). Small randomized lines that make the replay feel fresh.

- **Stylized/fictional OS personality** (discussed, rejected for default): Messages like "Initializing creativity engine" felt cringe. But could work as an easter egg mode toggle — a `--silly` flag in the prompt that switches boot messages to the playful variants.

- **Motion library as surgical addition**: motion.dev has a 2.3 kB vanilla JS `animate()` with spring physics. Not needed now (anime.js covers everything), but worth revisiting if a specific animation need arises.

- **`#projects` overview channel**: A channel that shows all projects in a compact list (like `ls -la` output) instead of requiring sidebar navigation. Considered but felt redundant with the sidebar.

## Tech Debt

- **Boot Phase 3 visual construction broken** — The step-by-step UI construction (sidebar typing, channels sliding in) doesn't render visually. Likely anime.js v4 API issues + `initAfterBoot` re-rendering the sidebar. Handoff doc at `.claude/plans/boot-phase3-handoff.md`. Must use Context7 to verify anime.js v4 API before fixing.

- **Stale `production` git remote** — `/var/repo/homepage.git` doesn't exist on VPS. Deployment works via `origin`. Should remove: `git remote remove production`
