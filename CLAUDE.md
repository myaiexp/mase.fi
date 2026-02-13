# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Static portfolio website at **mase.fi** — no build tools, no package.json, no framework. Pure HTML + vanilla JavaScript + Tailwind CSS (CDN).

## Development

No build/lint/test commands. Open HTML files directly in a browser or serve with any static file server. Changes deploy by pushing to git.

## Architecture

Three standalone HTML pages, each self-contained with inline CSS and JS:

- **index.html** — Portfolio homepage with particle background. Dynamically loads project cards from PocketBase API (`/collections/projects/records`) and updates from `/collections/updates/records`. Updates section has 4 switchable display modes (timeline, cards, ticker, typewriter) with localStorage-persisted preference.
- **porssi.html** — Finnish electricity price dashboard. Fetches from `spot-hinta.fi` API, renders Chart.js bar charts with tab-based today/tomorrow views.
- **yatzy.html** — 2-player Finnish Yatzy game (~51KB). Full game engine with state management, scoring for 15 categories, upper section bonus (≥63 → +50), localStorage-persisted statistics, and confetti animations.

## External Dependencies (all CDN-loaded)

- Tailwind CSS (with inline config and safelist)
- particles.js (index.html background)
- Chart.js (porssi.html price charts)
- Google Fonts (Inter)

## Conventions

- Inline Tailwind config in `<script>` tags — no tailwind.config.js
- Glassmorphism UI pattern: `backdrop-blur-sm`, `bg-gray-800/50`, gradient backgrounds (`#667eea` → `#764ba2`)
- Dark mode via Tailwind `dark:` classes
- Code sections in yatzy.html delimited by `===== SECTION NAME =====` comments
- localStorage for client-side persistence (game stats, player names)
- PocketBase backend at `mase.fi/api` for dynamic project data
