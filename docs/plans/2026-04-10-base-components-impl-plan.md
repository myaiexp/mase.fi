# Base Components Implementation Plan

**Goal:** Build a shared web components library (`base-components.js`) served from mase.fi alongside `base.css`.

**Architecture:** Five custom elements (modal, toast, tabs, dropdown, badge) in separate source files, bundled by Vite library mode into a single IIFE. Components use shadow DOM with `base.css` custom properties for theming. A singleton toast service exposes a static API on `window`.

**Tech Stack:** Vanilla JS, Web Components API (custom elements + shadow DOM), Vite library mode, Vitest + jsdom for testing.

---

### Task 1: Vite library mode config + scaffold [Mode: Direct]

**Files:**
- Create: `vite.components.config.js`
- Create: `src/components/index.js`
- Modify: `package.json` (add `build:components` script)

**Contracts:**
```js
// vite.components.config.js
// Vite config for library mode build
// Entry: src/components/index.js
// Output: dist/base-components.js (IIFE format, no external deps)

// package.json scripts
// "build:components": "vite build --config vite.components.config.js"
// "build:all": "vite build && npm run build:components"
```

**Constraints:**
- Must NOT interfere with the existing site build (default vite.config / no config)
- Output format: IIFE (self-executing, no import needed)
- Output filename: `base-components.js` (no hash — consumers reference a stable URL)
- No external dependencies — everything self-contained

**Verification:**
```bash
cd ~/Projects/mase.fi && npm run build:components
# Should produce dist/base-components.js
ls -la dist/base-components.js
```

**Commit after passing.**

### Task 2: Badge component [Mode: Direct]

**Files:**
- Create: `src/components/badge.js`
- Test: `src/components/badge.test.js`
- Modify: `src/components/index.js` (import badge)

**Contracts:**
```js
// <base-badge> custom element
// Attributes: variant ("success"|"danger"|"info"|"warning"|"neutral"), color (CSS color string), size ("sm"|default)
// Renders slotted text content inside a styled span
// Shadow DOM with styles using base.css custom properties (--green, --red, --blue, --orange, --text-muted)
customElements.define('base-badge', class extends HTMLElement { ... })
```

**Test Cases:**
```js
test('renders slotted text content', () => {
  // Create <base-badge>Active</base-badge>, verify text visible in shadow DOM slot
})

test('applies variant class for styling', () => {
  // Create with variant="success", verify shadow root has appropriate styles
})

test('custom color attribute overrides variant', () => {
  // Create with color="#e8a308", verify inline style uses that color
})

test('size="sm" applies smaller styling', () => {
  // Create with size="sm", verify different font-size/padding
})

test('variant change updates styling reactively', () => {
  // Create with variant="success", change to "danger", verify style updates
})
```

**Constraints:**
- Use `observedAttributes` + `attributeChangedCallback` for reactive updates
- Simplest component — good for validating the shadow DOM + CSS custom property approach before building the rest

**Verification:**
```bash
cd ~/Projects/mase.fi && npx vitest run src/components/badge.test.js
```

**Commit after passing.**

### Task 3: Toast service [Mode: Direct]

**Files:**
- Create: `src/components/toast.js`
- Test: `src/components/toast.test.js`
- Modify: `src/components/index.js` (import toast, expose on window)

**Contracts:**
```js
// BaseToast — singleton toast notification service
// No HTML tag — auto-creates a fixed-position container on first use
class BaseToast {
  static show(message: string, type?: 'success' | 'error' | 'info', duration?: number): void
  // type defaults to 'info', duration defaults to 5000ms
}
// Exposed as window.BaseToast after script loads
```

**Test Cases:**
```js
test('show() creates a toast element in the container', () => {
  BaseToast.show('test message');
  // Verify container exists in document, contains one toast with the message text
})

test('toast auto-removes after duration', async () => {
  BaseToast.show('gone soon', 'info', 100);
  // After 100ms+, verify toast element is removed
})

test('multiple toasts stack vertically', () => {
  BaseToast.show('first');
  BaseToast.show('second');
  // Verify container has two children
})

test('type applies correct semantic color', () => {
  BaseToast.show('error msg', 'error');
  // Verify toast element uses --red variable
})

test('container is created only once', () => {
  BaseToast.show('a');
  BaseToast.show('b');
  // Verify only one container element in document
})
```

**Constraints:**
- Container: `position: fixed; top: 1rem; right: 1rem; z-index: 10000`
- Toasts stack top-to-bottom with gap
- Fade-out animation before removal (CSS transition)
- Colors from base.css vars: success→`--green`, error→`--red`, info→`--blue`

**Verification:**
```bash
cd ~/Projects/mase.fi && npx vitest run src/components/toast.test.js
```

**Commit after passing.**

### Task 4: Modal component [Mode: Delegated]

**Files:**
- Create: `src/components/modal.js`
- Test: `src/components/modal.test.js`
- Modify: `src/components/index.js` (import modal)

**Contracts:**
```js
// <base-modal> custom element
// Slots: "header", default (body), "footer"
// Methods: open(), close()
// Events: dispatches "close" on close (backdrop click, Escape, or programmatic)
// Properties: isOpen (readonly boolean)
customElements.define('base-modal', class extends HTMLElement {
  open(): void
  close(): void
  get isOpen(): boolean
})
```

**Test Cases:**
```js
test('starts hidden, open() makes it visible', () => {
  // Create <base-modal>, verify not visible, call open(), verify visible
})

test('close() hides modal and dispatches close event', () => {
  // Open modal, listen for close event, call close(), verify hidden + event fired
})

test('Escape key closes modal', () => {
  // Open modal, dispatch keydown Escape, verify closed
})

test('backdrop click closes modal', () => {
  // Open modal, click the backdrop (not content), verify closed
})

test('click inside content does NOT close modal', () => {
  // Open modal, click inside the content area, verify still open
})

test('slots render header, body, and footer content', () => {
  // Create with slotted content in all three slots, verify they appear
})

test('focus trap keeps focus inside modal', () => {
  // Open modal with focusable elements, simulate keydown Tab
  // Note: jsdom doesn't implement real tab focus order — test the component's
  // focus management logic directly (query focusable elements, verify wrapping)
})
```

**Constraints:**
- Backdrop: semi-transparent overlay covering viewport
- Content: centered, max-width ~500px, max-height 80vh with scrollable body
- Focus trap: Tab cycles through focusable elements inside, doesn't escape
- Styling: uses `--bg-raised` for content background, `--border-color` for borders
- No `display: none` toggling — use a data attribute or CSS class for state

**Verification:**
```bash
cd ~/Projects/mase.fi && npx vitest run src/components/modal.test.js
```

**Commit after passing.**

### Task 5: Tabs component [Mode: Delegated]

**Files:**
- Create: `src/components/tabs.js`
- Test: `src/components/tabs.test.js`
- Modify: `src/components/index.js` (import tabs)

**Contracts:**
```js
// <base-tabs> parent element
// Discovers <base-tab> children via slotchange + assignedElements()
// Properties: activeIndex (read/write number)
// Methods: selectTab(index: number)
// Events: "tab-change" with detail: { index }
customElements.define('base-tabs', class extends HTMLElement {
  selectTab(index: number): void
  get activeIndex(): number
  set activeIndex(i: number)
})

// <base-tab> child element
// Attributes: label (string, required), active (boolean), disabled (boolean)
customElements.define('base-tab', class extends HTMLElement { ... })
```

**Test Cases:**
```js
test('renders tab buttons from child base-tab labels', () => {
  // Create <base-tabs> with 3 <base-tab label="..."> children
  // Verify 3 tab buttons rendered with correct labels
})

test('first tab is active by default', () => {
  // Verify first tab panel is visible, others hidden
})

test('clicking tab button switches active panel', () => {
  // Click second tab button, verify second panel visible, first hidden
})

test('selectTab(index) switches programmatically', () => {
  // Call selectTab(2), verify third tab active
})

test('tab-change event fires with correct index', () => {
  // Listen for tab-change, click second tab, verify detail.index === 1
})

test('disabled tab cannot be selected', () => {
  // Mark second tab disabled, click it, verify first tab still active
})

test('arrow keys navigate between tabs', () => {
  // Focus tab bar, press ArrowRight, verify next tab selected
})

test('active attribute on base-tab sets initial selection', () => {
  // Create with active on second <base-tab>, verify it starts selected
})
```

**Constraints:**
- Tab bar: horizontal row of buttons styled with `--bg-surface`, active tab uses `--accent`
- Panel area: below tab bar, shows only active panel
- Parent-child communication via `slotchange` event + `assignedElements()` (NOT `querySelectorAll`)
- Keyboard: ArrowLeft/Right navigate, Enter/Space select, wraps around

**Verification:**
```bash
cd ~/Projects/mase.fi && npx vitest run src/components/tabs.test.js
```

**Commit after passing.**

### Task 6: Dropdown component [Mode: Delegated]

**Files:**
- Create: `src/components/dropdown.js`
- Test: `src/components/dropdown.test.js`
- Modify: `src/components/index.js` (import dropdown)

**Contracts:**
```js
// <base-dropdown> container
// Discovers trigger via "trigger" slot, items as light DOM children
// Events: "select" with detail: { value }
customElements.define('base-dropdown', class extends HTMLElement {
  open(): void
  close(): void
  get isOpen(): boolean
})

// <base-dropdown-item>
// Attributes: value (string), variant ("danger"|default), disabled (boolean)
customElements.define('base-dropdown-item', class extends HTMLElement { ... })

// <base-dropdown-divider>
// Visual separator, no behavior
customElements.define('base-dropdown-divider', class extends HTMLElement { ... })
```

**Test Cases:**
```js
test('menu hidden by default, trigger click opens it', () => {
  // Create dropdown with trigger button, verify menu hidden, click trigger, verify visible
})

test('clicking an item fires select event with value', () => {
  // Listen for select, click item with value="edit", verify detail.value === "edit"
})

test('clicking an item closes the menu', () => {
  // Click item, verify menu closes
})

test('click outside closes menu', () => {
  // Open menu, click elsewhere on document, verify closed
})

test('Escape closes menu', () => {
  // Open menu, press Escape, verify closed
})

test('arrow keys navigate items', () => {
  // Open menu, press ArrowDown, verify focus moves to next item
})

test('disabled item cannot be selected', () => {
  // Open menu, click disabled item, verify no select event
})

test('variant="danger" applies danger styling', () => {
  // Create item with variant="danger", verify uses --red color
})

test('auto-flips when near viewport bottom', () => {
  // Position dropdown near bottom of viewport, open, verify menu opens upward
})

test('divider renders as visual separator', () => {
  // Create with divider between items, verify it renders with border/spacing
})
```

**Constraints:**
- Menu: positioned absolutely below trigger, `--bg-raised` background
- Item hover: `--bg-hover` background
- Keyboard: ArrowUp/Down navigate, Enter selects, first item focused on open
- Click-outside: document-level listener added on open, removed on close
- Auto-flip: check `getBoundingClientRect()` against `window.innerHeight`

**Verification:**
```bash
cd ~/Projects/mase.fi && npx vitest run src/components/dropdown.test.js
```

**Commit after passing.**

### Task 7: Build + deploy to /var/www/html/ [Mode: Direct]

**Files:**
- Modify: `package.json` (add deploy script if needed)

**Contracts:**
```bash
# Build components and copy to static site root
npm run build:components
cp dist/base-components.js /var/www/html/base-components.js
```

**Verification:**
```bash
# Verify file exists and is loadable
curl -s http://localhost/base-components.js | head -5
# Should output JS code, not 404
```

**Commit after passing.**

---

## Execution
**Skill:** Subagent Dev (if included in your instructions)
- Mode A tasks: Opus implements directly
- Mode B tasks: Dispatched to subagents
