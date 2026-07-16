// <base-option>, <base-option-group> — attribute-only data carriers for <base-select>

class BaseOption extends HTMLElement {
  static observedAttributes = ['value', 'disabled', 'action'];
  get value() { return this.getAttribute('value') ?? ''; }
  get disabled() { return this.hasAttribute('disabled'); }
  get action() { return this.hasAttribute('action'); }
  get label() { return this.textContent.trim(); }
}

customElements.define('base-option', BaseOption);

class BaseOptionGroup extends HTMLElement {
  static observedAttributes = ['label'];
  get label() { return this.getAttribute('label') ?? ''; }
}

customElements.define('base-option-group', BaseOptionGroup);

export { BaseOption, BaseOptionGroup };
