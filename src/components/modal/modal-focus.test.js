// @vitest-environment jsdom
// <base-modal> focus handling: the initial focus on open() and the Tab trap's
// focusable list (what counts as a Tab stop) and wrap boundaries.
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { createModal, appendButton } from './modal-test-helpers.js';

beforeAll(async () => {
  await import('./modal.js');
});

afterEach(() => {
  document.querySelectorAll('base-modal').forEach(el => el.remove());
});

describe('base-modal focus', () => {
  it('open() focuses the first light-DOM field, not the close button', async () => {
    // Initial focus must land on the first user-meaningful slotted control, not
    // the shadow close button (which leads the focusable list for Tab-order).
    const modal = createModal();
    const field = appendButton(modal, 'First field');
    appendButton(modal, 'Second field');
    const closeBtn = modal.shadowRoot.querySelector('[data-close]');
    const fieldSpy = vi.spyOn(field, 'focus');
    const closeSpy = vi.spyOn(closeBtn, 'focus');
    modal.open();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(fieldSpy).toHaveBeenCalled();
    expect(closeSpy).not.toHaveBeenCalled();
  });

  it('open() falls back to the close button when no light-DOM focusable exists', async () => {
    const modal = createModal();
    const closeBtn = modal.shadowRoot.querySelector('[data-close]');
    const closeSpy = vi.spyOn(closeBtn, 'focus');
    modal.open();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(closeSpy).toHaveBeenCalled();
  });

  it('Shift+Tab from the shadow close button wraps to the last light element', () => {
    // Regression: the close button lives in the shadow root, so document.active-
    // Element reports the host, not the button. The trap must use shadowRoot.active-
    // Element to detect it; otherwise Shift+Tab from the close button escapes the modal.
    const modal = createModal();
    appendButton(modal, 'B1');
    appendButton(modal, 'B2');
    modal.open();

    const focusable = modal._getFocusableElements();
    const closeBtn = modal.shadowRoot.querySelector('[data-close]');
    expect(focusable[0]).toBe(closeBtn); // close button leads the Tab order
    const last = focusable[focusable.length - 1];

    closeBtn.focus();
    expect(modal.shadowRoot.activeElement).toBe(closeBtn);

    const lastFocusSpy = vi.spyOn(last, 'focus');
    modal._handleKeyDown(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true }));
    expect(lastFocusSpy).toHaveBeenCalled();
  });

  it('focus trap excludes disabled focusables', () => {
    const modal = createModal();
    const b1 = appendButton(modal, 'B1');
    const disabled = appendButton(modal, 'B2', { disabled: true });
    const b3 = appendButton(modal, 'B3');

    const focusable = modal._getFocusableElements();
    expect(focusable).toContain(b1);
    expect(focusable).toContain(b3);
    expect(focusable).not.toContain(disabled);
  });

  it('focus trap excludes hidden focusables (#1789)', () => {
    // The trap must skip controls the user can't see: the hidden attribute,
    // display:none, and visibility:hidden all disqualify an element.
    const modal = createModal();
    const visible = appendButton(modal, 'V');
    const hidden = appendButton(modal, 'H', { hidden: true });

    const displayNone = appendButton(modal, 'D');
    displayNone.style.display = 'none';
    const invisible = appendButton(modal, 'I');
    invisible.style.visibility = 'hidden';

    const focusable = modal._getFocusableElements();
    expect(focusable).toContain(visible);
    expect(focusable).not.toContain(hidden);
    expect(focusable).not.toContain(displayNone);
    expect(focusable).not.toContain(invisible);
  });

  it('focus trap excludes a disabled control matched only by [tabindex] (#1789)', () => {
    // FOCUSABLE_SELECTORS' :not([disabled]) only applies to the native-control
    // clauses, so a disabled element carrying tabindex slips in via the
    // [tabindex] clause. isFocusable's el.disabled check catches it.
    const modal = createModal();
    const ok = appendButton(modal, 'OK');
    const sneaky = appendButton(modal, 'SNEAKY', { disabled: true });
    sneaky.setAttribute('tabindex', '0');

    const focusable = modal._getFocusableElements();
    expect(focusable).toContain(ok);
    expect(focusable).not.toContain(sneaky);
  });

  it('focus trap excludes controls with a negative tabindex', () => {
    // tabindex="-1" takes a control out of the Tab order, but the native-control
    // selector clauses (button:not([disabled]) …) still match it, and the
    // [tabindex] clause only rejects the literal "-1".
    const modal = createModal();
    const ok = appendButton(modal, 'OK');
    const skipped = appendButton(modal, 'Skipped');
    skipped.setAttribute('tabindex', '-1');
    const input = document.createElement('input');
    input.setAttribute('tabindex', '-1');
    const div = document.createElement('div');
    div.setAttribute('tabindex', '-2');
    const zero = document.createElement('div');
    zero.setAttribute('tabindex', '0');
    modal.append(input, div, zero);

    const focusable = modal._getFocusableElements();
    expect(focusable).toContain(ok);
    expect(focusable).toContain(zero);
    expect(focusable).not.toContain(skipped);
    expect(focusable).not.toContain(input);
    expect(focusable).not.toContain(div);
  });

  it('Tab from the last real stop wraps even when a tabindex=-1 control follows it', () => {
    // Were the trailing tabindex=-1 button the trap's "last" entry, Tab from the
    // real last stop would match nothing: no preventDefault, and focus leaves the dialog.
    const modal = createModal();
    appendButton(modal, 'First');
    const lastStop = appendButton(modal, 'Last stop');
    appendButton(modal, 'Not a stop').setAttribute('tabindex', '-1');
    modal.open();

    const closeBtn = modal.shadowRoot.querySelector('[data-close]');
    const wrapSpy = vi.spyOn(closeBtn, 'focus');
    lastStop.focus();
    expect(document.activeElement).toBe(lastStop);

    const tab = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true });
    modal._handleKeyDown(tab);

    expect(tab.defaultPrevented).toBe(true);
    expect(wrapSpy).toHaveBeenCalled();
  });

  it('open() skips a leading tabindex=-1 field for the initial focus', async () => {
    const modal = createModal();
    const skipped = appendButton(modal, 'Not a stop');
    skipped.setAttribute('tabindex', '-1');
    const field = appendButton(modal, 'First field');
    const skippedSpy = vi.spyOn(skipped, 'focus');
    const fieldSpy = vi.spyOn(field, 'focus');
    modal.open();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(fieldSpy).toHaveBeenCalled();
    expect(skippedSpy).not.toHaveBeenCalled();
  });
});
