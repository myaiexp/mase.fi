// Trigger element factory for <base-select> — searchable input or button, plus placeholder span

/**
 * @typedef {object} TriggerHost
 * @property {boolean} isOpen
 * @property {() => void} open
 * @property {() => void} close
 * @property {(name: string) => boolean} hasAttribute
 */

// Build the trigger control. `onFilter` and `onKeydown` stay with the select
// (they drive its private highlight state); open/close go through the host.
/**
 * @param {TriggerHost} host
 * @param {boolean} searchable
 * @param {{ onFilter: () => void, onKeydown: (e: KeyboardEvent) => void }} handlers
 * @returns {HTMLInputElement | HTMLButtonElement}
 */
export function createTrigger(host, searchable, { onFilter, onKeydown }) {
  if (searchable) {
    const input = document.createElement('input');
    input.setAttribute('type', 'text');
    input.setAttribute('part', 'trigger');
    // A filter input must never be an autofill target. Password managers
    // (Bitwarden et al.) traverse open shadow roots, attach inline-menu
    // observers to this persistent text field, and thrash field-heavy pages.
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('data-bwignore', 'true'); // Bitwarden
    input.setAttribute('data-lpignore', 'true'); // LastPass
    input.setAttribute('data-1p-ignore', ''); // 1Password
    input.setAttribute('data-form-type', 'other'); // Dashlane
    input.addEventListener('click', () => { if (!host.isOpen) host.open(); });
    input.addEventListener('focus', () => { if (!host.isOpen) host.open(); });
    input.addEventListener('input', () => onFilter());
    input.addEventListener('keydown', (e) => onKeydown(e));
    return input;
  }
  const btn = document.createElement('button');
  btn.setAttribute('type', 'button');
  btn.setAttribute('part', 'trigger');
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (host.hasAttribute('disabled')) return;
    host.isOpen ? host.close() : host.open();
  });
  btn.addEventListener('keydown', (e) => onKeydown(e));
  return btn;
}

/**
 * @param {string} text
 * @returns {HTMLSpanElement}
 */
export function makePlaceholderSpan(text) {
  const span = document.createElement('span');
  span.className = 'placeholder';
  span.textContent = text;
  return span;
}
