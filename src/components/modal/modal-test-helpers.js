// Shared jsdom mount helpers for the <base-modal> test suites

export function createModal(slottedHtml = '') {
  const el = document.createElement('base-modal');
  if (slottedHtml) el.innerHTML = slottedHtml;
  document.body.appendChild(el);
  return el;
}

// Build a focusable button in light DOM via createElement (security hook blocks innerHTML=)
export function appendButton(modal, label, { disabled = false, hidden = false, slot = null } = {}) {
  const btn = document.createElement('button');
  btn.textContent = label;
  if (disabled) btn.disabled = true;
  if (hidden) btn.hidden = true;
  if (slot) btn.setAttribute('slot', slot);
  modal.appendChild(btn);
  return btn;
}
