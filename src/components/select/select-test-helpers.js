// Shared jsdom fixtures for the <base-select> suites: build a select, reach its shadow parts

export function createSelect({ options = [], groups = [], placeholder = '', searchable = false, disabled = false, size = '', value = '' } = {}) {
  const el = document.createElement('base-select');
  if (placeholder) el.setAttribute('placeholder', placeholder);
  if (searchable) el.setAttribute('searchable', '');
  if (disabled) el.setAttribute('disabled', '');
  if (size) el.setAttribute('size', size);
  if (value) el.setAttribute('value', value);

  for (const opt of options) {
    const o = document.createElement('base-option');
    o.setAttribute('value', opt.value);
    if (opt.disabled) o.setAttribute('disabled', '');
    if (opt.action) o.setAttribute('action', '');
    o.textContent = opt.label ?? opt.value;
    el.appendChild(o);
  }

  for (const group of groups) {
    const g = document.createElement('base-option-group');
    g.setAttribute('label', group.label);
    for (const opt of group.options) {
      const o = document.createElement('base-option');
      o.setAttribute('value', opt.value);
      if (opt.disabled) o.setAttribute('disabled', '');
      o.textContent = opt.label ?? opt.value;
      g.appendChild(o);
    }
    el.appendChild(g);
  }

  document.body.appendChild(el);
  return el;
}

export function getMenu(el) {
  return el.shadowRoot.querySelector('[part="menu"]');
}

export function getTrigger(el) {
  return el.shadowRoot.querySelector('[part="trigger"]');
}

export function getOptions(el) {
  return [...getMenu(el).querySelectorAll('.option')];
}
