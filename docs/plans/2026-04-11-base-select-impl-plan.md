# base-select Component Implementation Plan

**Goal:** Add `<base-select>`, `<base-option>`, and `<base-option-group>` to the base-components library as a form-ready value picker that replaces native `<select>` elements.

**Architecture:** Three custom elements in one file. `<base-select>` owns the shadow DOM, renders trigger + menu internally. `<base-option>` and `<base-option-group>` are light DOM children with no shadow roots — the parent scans them and builds menu items. Follows the same patterns as `<base-dropdown>` (auto-flip, keyboard nav, MutationObserver, document listeners).

**Tech Stack:** Vanilla Web Components, CSS custom properties, Vitest + jsdom for testing.

---

### Task 1: Implement base-select component [Mode: Delegated]

**Files:**
- Create: `src/components/select.js`
- Create: `src/components/select.test.js`

**Contracts:**

`BaseOption` (custom element `base-option`):
- `static observedAttributes = ['value', 'disabled']`
- `get value(): string` — returns `value` attribute
- `get disabled(): boolean` — returns presence of `disabled` attribute
- `get label(): string` — returns `textContent.trim()`
- No shadow DOM

`BaseOptionGroup` (custom element `base-option-group`):
- `static observedAttributes = ['label']`
- `get label(): string` — returns `label` attribute
- No shadow DOM

`BaseSelect` (custom element `base-select`):
- `static observedAttributes = ['value', 'placeholder', 'searchable', 'disabled', 'size']`
- `get/set value: string` — current selected value, reflects to attribute
- `get selectedOption: BaseOption | null` — the selected child element
- `get isOpen: boolean`
- `open(): void` — opens menu, focuses first option (or input if searchable)
- `close(): void` — closes menu, cleans up document listeners
- Fires `change` CustomEvent with `detail: { value, label }` on selection
- Shadow DOM contains: trigger area (button or input), menu container
- MutationObserver on host for dynamic child changes — rebuilds menu items
- Auto-flip: check `getBoundingClientRect()` vs `window.innerHeight`, toggle `.flip` class (same as `<base-dropdown>`)
- Document-level click-outside and Escape listeners added on open, removed on close + disconnectedCallback

Shadow DOM template structure:
```
<slot name="trigger"> (unused — trigger rendered internally)
<div part="trigger">  — button (non-searchable) or input (searchable)
<div part="menu" hidden>  — menu container, items rendered here
```

Menu item rendering: parent reads children (`querySelectorAll('base-option, base-option-group')`), creates internal divs for each:
- `<base-option>` → `<div class="option" data-value="..." tabindex="-1">label</div>`
- `<base-option-group>` → `<div class="group-header">LABEL</div>` + recurse into group's `<base-option>` children
- Selected option gets `.selected` class (accent color)
- Disabled options get `.disabled` class

Non-searchable trigger: `<button>` showing selected label or placeholder. Chevron via CSS `::after`. Click toggles menu.

Searchable trigger: `<input type="text">`. Shows selected label when not focused. On focus, selects all text. On input, filters menu items (case-insensitive substring on label). On blur without selection, restores previous value (150ms delay for click targets — clear timeout on disconnectedCallback).

Keyboard handling (on menu items for non-searchable, on input for searchable):
- ArrowDown/ArrowUp: navigate rendered option divs (skip `.group-header`, skip `.disabled`, wrap around)
- Enter: select focused option, close
- Escape: close, focus trigger
- Tab: close (default browser behavior moves focus)
- Letter keys (non-searchable only): jump to first option starting with letter, repeated same letter cycles through matches

Filtering (searchable): hide option divs whose label doesn't match, hide group headers when all their options are hidden. Show "No matches" div when everything filtered out.

Size variant: `size="sm"` → add `sm` class on host, reduce padding/font in shadow CSS.

**Constraints:**
- Follow exact patterns from `src/components/dropdown.js` for: template cloning, MutationObserver setup, document listener management, auto-flip logic
- CSS uses only `var(--token)` references — no hardcoded colors
- No shadow DOM on child elements (`<base-option>`, `<base-option-group>`)

**Test Cases:**

```js
// @vitest-environment jsdom

// --- BaseOption ---

describe('base-option', () => {
  it('exposes value attribute as property', () => {
    // create base-option with value="foo", assert .value === 'foo'
  });

  it('exposes textContent as label property', () => {
    // create base-option with textContent 'Hello', assert .label === 'Hello'
  });

  it('reports disabled state', () => {
    // create base-option with disabled attribute, assert .disabled === true
    // without attribute, assert .disabled === false
  });
});

// --- BaseOptionGroup ---

describe('base-option-group', () => {
  it('exposes label attribute as property', () => {
    // create base-option-group with label="Pinned", assert .label === 'Pinned'
  });
});

// --- BaseSelect core ---

describe('base-select', () => {
  it('menu hidden by default', () => {
    // create base-select with options, assert isOpen === false, menu hidden
  });

  it('click trigger opens menu', () => {
    // non-searchable: click trigger button, assert isOpen === true, menu visible
  });

  it('clicking option fires change event with value and label', () => {
    // open, click option div, assert change event detail: { value, label }
  });

  it('clicking option closes menu', () => {
    // open, click option, assert isOpen === false
  });

  it('clicking option updates value property', () => {
    // open, click option with value="x", assert el.value === 'x'
  });

  it('trigger shows selected label after selection', () => {
    // set value programmatically, assert trigger text matches option label
  });

  it('trigger shows placeholder when no value', () => {
    // create with placeholder="Pick one", no value set, assert trigger shows placeholder
  });

  it('selectedOption returns the matching base-option element', () => {
    // set value="foo", assert selectedOption is the base-option with value="foo"
  });

  it('selectedOption returns null when no match', () => {
    // no value set, assert selectedOption === null
  });

  it('programmatic value set updates trigger text', () => {
    // el.value = 'x', assert trigger shows label for value 'x'
  });

  it('click outside closes menu', () => {
    // open, click document.body, assert closed
  });

  it('Escape closes menu', () => {
    // open, dispatch Escape keydown, assert closed
  });

  it('open() and close() work programmatically', () => {
    // el.open(), assert isOpen true. el.close(), assert isOpen false
  });

  it('disabled attribute prevents opening', () => {
    // set disabled, click trigger, assert isOpen stays false
  });

  // --- Keyboard navigation ---

  it('ArrowDown moves focus to next option', () => {
    // open, assert first option focused, dispatch ArrowDown, assert second focused
  });

  it('ArrowUp moves focus to previous option', () => {
    // open, focus second, dispatch ArrowUp, assert first focused
  });

  it('ArrowDown wraps to first option at end', () => {
    // open, focus last, dispatch ArrowDown, assert first focused
  });

  it('ArrowUp wraps to last option at start', () => {
    // open, focus first, dispatch ArrowUp, assert last focused
  });

  it('keyboard skips disabled options', () => {
    // options: [enabled, disabled, enabled], ArrowDown from first skips to third
  });

  it('Enter on focused option selects it', () => {
    // open, focus option, Enter, assert value set and change event fired
  });

  it('letter key jumps to first matching option (non-searchable)', () => {
    // options: Apple, Banana, Cherry. press 'b', assert Banana focused
  });

  it('repeated letter key cycles through matches (non-searchable)', () => {
    // options: Apple, Avocado, Banana. press 'a', assert Apple. press 'a' again, assert Avocado
  });

  // --- Groups ---

  it('renders group headers from base-option-group labels', () => {
    // create with groups, assert header divs present in shadow menu
  });

  it('keyboard navigation skips group headers', () => {
    // group with options, ArrowDown doesn't land on header
  });

  // --- Auto-flip ---

  it('adds flip class when near viewport bottom', () => {
    // mock getBoundingClientRect to return high top value, mock innerHeight
    // open, assert menu has flip class
  });

  it('no flip class when space below', () => {
    // mock normal position, assert no flip class
  });

  // --- Dynamic options ---

  it('rebuilds menu when options added dynamically', () => {
    // create empty, append base-option, wait for MutationObserver, assert menu has item
  });

  // --- Searchable mode ---

  it('searchable renders input instead of button', () => {
    // create with searchable attribute, assert trigger is input element
  });

  it('typing filters options by substring', () => {
    // searchable, type 'ba' into input, assert only 'Banana' option visible
  });

  it('filter is case-insensitive', () => {
    // type 'BA', assert Banana still visible
  });

  it('group headers hide when all children filtered out', () => {
    // group with no matching options after filter, assert header hidden
  });

  it('shows no-matches message when nothing matches', () => {
    // type 'zzz', assert no-matches element visible
  });

  it('clearing search shows all options', () => {
    // type query, clear input, assert all options visible
  });

  it('focus on searchable input opens menu', () => {
    // focus input, assert menu opens
  });

  it('selecting in searchable mode shows label in input', () => {
    // open, click option, assert input.value === option label
  });

  // --- Size variant ---

  it('size="sm" applies compact styling', () => {
    // create with size="sm", assert sm class on trigger or host
  });
});
```

**Verification:**
```bash
cd /home/mase/Projects/mase.fi && npx vitest run src/components/select.test.js
```
Expected: All tests pass.

**Commit after passing.**

---

### Task 2: Build integration and deploy [Mode: Direct]

**Files:**
- Modify: `src/components/index.js` — add `import './select.js'`

**Steps:**
1. Add import to `src/components/index.js`
2. Run `npm run build:components` — verify `dist/base-components.js` includes new elements
3. Run full test suite: `npx vitest run` — all tests pass
4. Commit and deploy

**Verification:**
```bash
cd /home/mase/Projects/mase.fi && npm run build:components && npx vitest run
```
Expected: Build succeeds, all tests pass, `dist/base-components.js` registers `base-select`, `base-option`, `base-option-group`.

**Commit after passing.**

---

## Execution
**Skill:** Subagent Dev (if included in your instructions)
- Mode A tasks: Opus implements directly
- Mode B tasks: Dispatched to subagents
