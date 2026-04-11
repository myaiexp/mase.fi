# base-select Component Design

## Overview

Add `<base-select>`, `<base-option>`, and `<base-option-group>` to the global `base-components.js` library. Replaces native `<select>` elements across all mase.fi projects with a visually consistent, optionally searchable custom select component.

## Motivation

The Helm project picker uses a polished custom dropdown with search, grouping, and keyboard navigation. Every other dropdown in Helm (and other projects) uses a native `<select>` — visually inconsistent with the rest of the design system. A global component ensures unified aesthetics and behavior everywhere.

## API

### Usage — basic (non-searchable)

```html
<base-select placeholder="Select model...">
  <base-option value="haiku">Haiku</base-option>
  <base-option value="sonnet">Sonnet</base-option>
  <base-option value="opus">Opus</base-option>
</base-select>
```

### Usage — searchable with groups

```html
<base-select searchable placeholder="Search projects...">
  <base-option-group label="Pinned">
    <base-option value="helm">helm</base-option>
  </base-option-group>
  <base-option-group label="Projects">
    <base-option value="mase-fi">mase-fi</base-option>
    <base-option value="koto">koto</base-option>
  </base-option-group>
</base-select>
```

### Attributes

| Attribute     | Type    | Default      | Description                                              |
| ------------- | ------- | ------------ | -------------------------------------------------------- |
| `value`       | string  | `''`         | Selected value (reflects to property)                    |
| `placeholder` | string  | `'Select…'`  | Trigger text when empty / search input placeholder       |
| `searchable`  | boolean | `false`      | Show filter input instead of static trigger              |
| `disabled`    | boolean | `false`      | Disables interaction                                     |
| `size`        | `'sm'`  | —            | Compact variant for toolbar contexts                     |

### Properties & methods

- `value` (get/set) — current selected value
- `selectedOption` (get) — the selected `<base-option>` element, or null
- `open()` / `close()` — programmatic control
- `isOpen` (get) — boolean

### Events

- `change` — fired on selection. `detail: { value, label }`. Named `change` to mirror native `<select>`.

### Child elements

**`<base-option>`**: `value` attribute (required), optional `disabled` attribute. Text content is the display label.

**`<base-option-group>`**: `label` attribute renders a non-selectable group header. Children are `<base-option>` elements.

## Visual Design

### Trigger

**Non-searchable:** Styled button showing selected label (or placeholder in `--text-muted`). Small chevron on right. Click toggles menu.

**Searchable:** Text input. Typing filters options. When value is selected and input not focused, shows selected label. On focus, selects all text for immediate overwrite. Clearing input and blurring without selecting restores previous value.

### Menu

- Absolute positioned below trigger, full width of host
- `max-height: 200px`, overflow-y scroll
- Auto-flip above trigger if insufficient space below (same as `<base-dropdown>`)
- Background `--bg-raised`, border `--border`, box-shadow for depth

### Options

- `padding: 4px 12px`, `font-size: 13px`, monospace — matches `<base-dropdown-item>`
- Hover/focused: `background: var(--bg-hover)`
- Selected (current value): `color: var(--accent)` — accent text, no background change
- Disabled: `opacity: 0.4`, not interactive

### Group headers

- Uppercase label, `font-size: 11px`, `color: var(--text-muted)`, `padding: 4px 12px`
- Non-selectable, skipped by keyboard navigation
- `border-top` separator between groups (except first)

### Size variant

`size="sm"` — reduced padding and font size for toolbar/controls-bar contexts.

## Keyboard Behavior

| Key              | Behavior                                                    |
| ---------------- | ----------------------------------------------------------- |
| ArrowDown/Up     | Navigate options (skip disabled, skip headers, wrap around) |
| Enter            | Select focused option, close menu                           |
| Escape           | Close menu, restore focus to trigger                        |
| Tab              | Close menu, move focus normally                             |
| Letter (non-searchable) | Jump to first option starting with that letter. Repeated presses cycle through matches. |

## Open/Close Triggers

- **Non-searchable:** Click trigger opens. Click outside, Escape, Tab, or selection closes.
- **Searchable:** Focus on input opens (if options exist). Blur closes (150ms delay for click targets). Escape and selection close.

## Filtering (searchable mode)

- Case-insensitive substring match on option text content
- Group headers hide when all children filtered out
- Empty state: `"No matches"` in `--text-muted`
- Clearing search shows all options

## Architecture

### Files

- `src/components/select.js` — all three elements (`<base-select>`, `<base-option>`, `<base-option-group>`)
- `src/components/select.test.js` — tests
- `src/components/index.js` — add `import './select.js'`

### Shadow DOM strategy

`<base-select>` owns the shadow root and renders the trigger + menu internally. `<base-option>` and `<base-option-group>` are light DOM children — custom elements for semantic markup and attribute access, but no shadow roots. The parent scans children via `querySelectorAll`, reads their `value`/`textContent`/`label`, and builds internal menu items. Same pattern as `<base-tabs>` scanning `<base-tab>` children.

### Dynamic options

MutationObserver on the host watches for child additions/removals. On mutation, the menu is rebuilt from current children. Supports populating options from API responses after mount.

### Form integration

Consumers read `.value` directly or listen for `change`. No `ElementInternals` form association — unnecessary complexity for these use cases.

## Non-goals

- Context menus on options (Helm project picker specific)
- Collapsible groups (Helm project picker specific)
- Multi-select
- Remote/async data fetching — consumers populate children themselves
