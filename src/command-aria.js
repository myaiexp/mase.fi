// ARIA wiring for the command autocomplete popup (combobox + listbox pattern)
//
// Slash mode ("/…") is a real combobox: #cmd-input is role=combobox and
// #cmd-complete is its role=listbox of role=option rows, with the active row
// tracked via aria-activedescendant. Help mode ("?") reuses the same popup for
// non-selectable info rows, so it must NOT claim listbox semantics — markHelp
// keeps the popup announced as a note with no active descendant.

const OPTION_ID_PREFIX = 'cc-opt-';

export const optionId = (i) => `${OPTION_ID_PREFIX}${i}`;

// Attributes for one selectable row, spliced into the .cc-item template string.
export function optionAttrs(i, selected) {
  return `role="option" id="${optionId(i)}" aria-selected="${selected ? 'true' : 'false'}"`;
}

// Slash mode: mark the popup a listbox and point the input's combobox
// relationship at the option `activeIdx`.
export function markListbox($input, $cc, activeIdx) {
  $cc.setAttribute('role', 'listbox');
  $cc.setAttribute('aria-label', 'Channel and command matches');
  $input.setAttribute('aria-expanded', 'true');
  setActive($input, $cc, activeIdx);
}

// Move the active option without re-rendering: reflect aria-selected on the rows
// and aria-activedescendant on the input (used by the mouseenter hover path).
export function setActive($input, $cc, activeIdx) {
  $cc.querySelectorAll('[role="option"]').forEach((el, i) => {
    el.setAttribute('aria-selected', i === activeIdx ? 'true' : 'false');
  });
  if (activeIdx >= 0) $input.setAttribute('aria-activedescendant', optionId(activeIdx));
  else $input.removeAttribute('aria-activedescendant');
}

// Help mode: informational rows, not a listbox. Keep aria-expanded (a popup is
// visible) but drop the listbox role and any active descendant.
export function markHelp($input, $cc) {
  $cc.setAttribute('role', 'note');
  $cc.removeAttribute('aria-label');
  $input.setAttribute('aria-expanded', 'true');
  $input.removeAttribute('aria-activedescendant');
}

// Popup hidden: collapse the combobox and clear the popup's role.
export function collapseCombobox($input, $cc) {
  $input.setAttribute('aria-expanded', 'false');
  $input.removeAttribute('aria-activedescendant');
  $cc.removeAttribute('role');
  $cc.removeAttribute('aria-label');
}
