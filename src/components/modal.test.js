// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';

beforeAll(async () => {
  await import('./modal.js');
});

function createModal(slottedHtml = '') {
  const el = document.createElement('base-modal');
  if (slottedHtml) el.innerHTML = slottedHtml;
  document.body.appendChild(el);
  return el;
}

afterEach(() => {
  document.querySelectorAll('base-modal').forEach(el => el.remove());
});

describe('base-modal', () => {
  it('starts hidden; open() makes it visible', () => {
    const modal = createModal();
    expect(modal.isOpen).toBe(false);
    modal.open();
    expect(modal.isOpen).toBe(true);
  });

  it('close() hides modal and dispatches close event', () => {
    const modal = createModal();
    modal.open();
    expect(modal.isOpen).toBe(true);

    const handler = vi.fn();
    modal.addEventListener('close', handler);

    modal.close();
    expect(modal.isOpen).toBe(false);
    expect(handler).toHaveBeenCalledOnce();
  });

  it('Escape key closes modal', () => {
    const modal = createModal();
    modal.open();
    expect(modal.isOpen).toBe(true);

    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
    document.dispatchEvent(event);

    expect(modal.isOpen).toBe(false);
  });

  it('backdrop click closes modal', () => {
    const modal = createModal();
    modal.open();

    const backdrop = modal.shadowRoot.querySelector('[data-backdrop]');
    expect(backdrop).toBeTruthy();

    backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(modal.isOpen).toBe(false);
  });

  it('click inside content does NOT close modal', () => {
    const modal = createModal('<p>body text</p>');
    modal.open();

    const content = modal.shadowRoot.querySelector('[data-content]');
    expect(content).toBeTruthy();

    content.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(modal.isOpen).toBe(true);
  });

  it('slots render header, body, and footer content', () => {
    const modal = createModal(`
      <span slot="header">My Title</span>
      <p>Body text here</p>
      <button slot="footer">OK</button>
    `);

    const headerSlot = modal.shadowRoot.querySelector('slot[name="header"]');
    const defaultSlot = modal.shadowRoot.querySelector('slot:not([name])');
    const footerSlot = modal.shadowRoot.querySelector('slot[name="footer"]');

    expect(headerSlot).toBeTruthy();
    expect(defaultSlot).toBeTruthy();
    expect(footerSlot).toBeTruthy();

    const headerAssigned = headerSlot.assignedNodes();
    const bodyAssigned = defaultSlot.assignedNodes();
    const footerAssigned = footerSlot.assignedNodes();

    expect(headerAssigned.length).toBeGreaterThan(0);
    expect(bodyAssigned.length).toBeGreaterThan(0);
    expect(footerAssigned.length).toBeGreaterThan(0);
  });

  it('focus trap keeps focus cycling inside modal', () => {
    const modal = createModal(`
      <button>B1</button>
      <button>B2</button>
      <button slot="footer">F</button>
    `);
    modal.open();

    // Verify _getFocusableElements returns multiple elements (trap is meaningful)
    const focusable = modal._getFocusableElements();
    expect(focusable.length).toBeGreaterThan(1);

    // Spy on focus() for the first and last elements to verify wrapping behavior
    const firstFocusSpy = vi.spyOn(focusable[0], 'focus');
    const lastFocusSpy = vi.spyOn(focusable[focusable.length - 1], 'focus');

    // Place focus on last element, then dispatch Tab — should wrap to first
    focusable[focusable.length - 1].focus();
    // Manually simulate: component checks document.activeElement === last
    // Since jsdom shadow focus is tricky, call _handleKeyDown directly
    // with a stubbed activeElement matching last
    const lastEl = focusable[focusable.length - 1];
    const firstEl = focusable[0];

    // Stub activeElement to return lastEl for Tab-forward wrap test
    const activeStub = vi.spyOn(document, 'activeElement', 'get').mockReturnValue(lastEl);
    modal._handleKeyDown(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: false }));
    expect(firstFocusSpy).toHaveBeenCalled();
    activeStub.mockRestore();

    // Stub activeElement to return firstEl for Shift+Tab backward wrap test
    const activeStub2 = vi.spyOn(document, 'activeElement', 'get').mockReturnValue(firstEl);
    modal._handleKeyDown(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true }));
    expect(lastFocusSpy).toHaveBeenCalled();
    activeStub2.mockRestore();
  });
});
