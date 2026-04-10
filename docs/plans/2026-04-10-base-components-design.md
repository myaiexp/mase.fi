# Base Components — Shared Web Components Library

## Problem

`base.css` provides shared design tokens and styling across all mase.fi projects. But interactive UI patterns — modals, toasts, tabs, dropdowns, badges — are hand-rolled independently in every project. Helm alone has 4+ modal implementations, tabs in 3 different styles, and dropdowns in 5+ files. Other projects (explorer, spot-price, central-hub) repeat the same patterns.

## Solution

A companion JS file (`base-components.js`) served alongside `base.css` from `mase.fi`. Web components that use shadow DOM with `base.css` custom properties for theming. One script tag to consume, zero build step required.

## Delivery

- **Source**: `~/Projects/mase.fi/src/components/` — one file per component
- **Build**: Vite library mode with a separate entry point (`src/components/index.js`), outputs `base-components.js` as an IIFE — independent from the main site bundle
- **Serve**: `/var/www/html/base-components.js` (static, next to `base.css`)
- **Consume**: `<script src="https://mase.fi/base-components.js"></script>`

## Module guidance

The frontend module should note:
- At project start, confirm with the user whether to use the standardized base-components setup
- These are designed for personal projects — not every project will use them
- If the user specifies a setup, follow that; otherwise ask

## Components

### 1. Modal — `<base-modal>`

```html
<base-modal id="my-modal">
  <h3 slot="header">Title</h3>
  <p>Body content here</p>
  <div slot="footer"><button class="btn primary">Save</button></div>
</base-modal>
```

**API**:
- Methods: `open()`, `close()`
- Slots: `header`, default (body), `footer` — all optional
- Events: `close`
- Behavior: backdrop click closes, Escape closes, focus trap inside
- Sizing: content-driven, max-width capped, scrollable body on overflow

### 2. Toast — `BaseToast` (singleton service)

```js
BaseToast.show('Session archived', 'success');
BaseToast.show('Failed to save', 'error');
BaseToast.show('Select a project first', 'info');
```

**API**:
- Static method: `BaseToast.show(message, type?, duration?)`
- Types: `success`, `error`, `info` — maps to base.css semantic color vars
- Auto-dismiss: 5s default, configurable per call
- Position: top-right, stacks vertically
- No HTML tag needed — auto-creates container on first use

### 3. Tabs — `<base-tabs>`

```html
<base-tabs>
  <base-tab label="General">General content</base-tab>
  <base-tab label="Advanced">Advanced content</base-tab>
  <base-tab label="Danger" disabled>Disabled tab</base-tab>
</base-tabs>
```

**API**:
- Child elements: `<base-tab label="..." [active] [disabled]>`
- Methods: `selectTab(index)`
- Properties: `activeIndex` (read/write)
- Events: `tab-change` with `detail: { index }`
- Keyboard: arrow keys navigate, Enter/Space selects
- Parent-child communication: `<base-tabs>` discovers children via `slotchange` event + `assignedElements()` on the default slot (not `querySelectorAll`, which doesn't find slotted nodes)

### 4. Dropdown — `<base-dropdown>`

```html
<base-dropdown>
  <button slot="trigger" class="btn">Actions</button>
  <base-dropdown-item value="edit">Edit</base-dropdown-item>
  <base-dropdown-item value="delete" variant="danger">Delete</base-dropdown-item>
  <base-dropdown-divider></base-dropdown-divider>
  <base-dropdown-item value="archive">Archive</base-dropdown-item>
</base-dropdown>
```

**API**:
- Trigger: slotted — any element works
- Child elements: `<base-dropdown-item value="..." [variant="danger"]>`, `<base-dropdown-divider>`
- Events: `select` with `detail: { value }`
- Behavior: click-outside closes, Escape closes, auto-positions (flips up near viewport bottom)
- Keyboard: arrow keys navigate, Enter selects

### 5. Badge — `<base-badge>`

```html
<base-badge variant="success">Active</base-badge>
<base-badge variant="danger">Critical</base-badge>
<base-badge variant="warning">Degraded</base-badge>
<base-badge color="#e8a308">Custom</base-badge>
```

**API**:
- Variants: `success`, `danger`, `info`, `warning`, `neutral`
- Custom color: `color` attribute for arbitrary values
- Size: default, `size="sm"` for smaller

## Theming

All components inherit from `base.css` custom properties — they don't define their own colors. Shadow DOM isolates structure but CSS custom properties cross the boundary. This means:

- Components automatically match any project's theme
- Per-project accent overrides (`--accent`) apply to components
- Semantic colors (`--green`, `--red`, `--blue`, etc.) drive variant styles

## Migration path

Existing projects migrate incrementally. For Helm specifically:
- Replace `showToast()` in `utils.js` with `BaseToast.show()`
- Replace hand-rolled modals one at a time
- Sidebar tabs are too Helm-specific to replace — `<base-tabs>` is for simpler tab groups within views

## File structure

```
src/
  components/
    modal.js        # <base-modal>
    toast.js        # BaseToast singleton
    tabs.js         # <base-tabs>, <base-tab>
    dropdown.js     # <base-dropdown>, <base-dropdown-item>, <base-dropdown-divider>
    badge.js        # <base-badge>
    index.js        # Registers all elements, exports BaseToast
```

## Non-goals

- Not replacing project-specific UI (Helm's sidebar tabs, kanban cards, event renderer)
- Not a framework — no state management, no routing, no data binding
- Not for React projects directly (central-hub, investiq) — they can use these via standard DOM if needed, but no React wrappers in v1
