// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { addOverlayListeners, removeOverlayListeners } from './overlay-utils.js';

// A stand-in for an overlay component: the helper only ever touches `.close()`
// and the `._overlayListeners` storage slot.
function makeComponent() {
  return { close: vi.fn() };
}

function makeHost() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  return host;
}

let active = [];
function track(component) {
  active.push(component);
  return component;
}

afterEach(() => {
  // Detach anything still registered so listeners don't leak across tests.
  for (const c of active) removeOverlayListeners(c);
  active = [];
  document.body.textContent = '';
  vi.restoreAllMocks();
});

function clickOn(target) {
  target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function keydown(key) {
  document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
}

describe('overlay-utils', () => {
  // --- Registration ---

  it('registers click + keydown on document and stores the descriptors', () => {
    const c = track(makeComponent());
    addOverlayListeners(c, () => false);

    expect(Array.isArray(c._overlayListeners)).toBe(true);
    const docListeners = c._overlayListeners.filter((l) => l.target === document);
    const types = docListeners.map((l) => l.type);
    expect(types).toEqual(['click', 'keydown']);
  });

  // --- onClickOutside predicate drives close() ---

  it('calls component.close() on document click when onClickOutside returns true', () => {
    const c = track(makeComponent());
    addOverlayListeners(c, () => true);

    clickOn(document.body);
    expect(c.close).toHaveBeenCalledTimes(1);
  });

  it('does NOT call component.close() on document click when onClickOutside returns false', () => {
    const c = track(makeComponent());
    addOverlayListeners(c, () => false);

    clickOn(document.body);
    expect(c.close).not.toHaveBeenCalled();
  });

  it('closes on a click outside the component element but not on a click inside it', () => {
    const host = makeHost();
    const inside = document.createElement('button');
    host.appendChild(inside);

    const c = track(makeComponent());
    addOverlayListeners(c, (e) => !host.contains(e.target));

    // Inside click — predicate false, stays open.
    clickOn(inside);
    expect(c.close).not.toHaveBeenCalled();

    // Outside click — predicate true, closes.
    clickOn(document.body);
    expect(c.close).toHaveBeenCalledTimes(1);
  });

  it('passes the click event to the onClickOutside predicate', () => {
    const c = track(makeComponent());
    const predicate = vi.fn(() => false);
    addOverlayListeners(c, predicate);

    clickOn(document.body);
    expect(predicate).toHaveBeenCalledTimes(1);
    expect(predicate.mock.calls[0][0]).toBeInstanceOf(Event);
  });

  // --- Escape routes through the same lifecycle ---

  it('calls component.close() on Escape keydown', () => {
    const c = track(makeComponent());
    addOverlayListeners(c, () => false);

    keydown('Escape');
    expect(c.close).toHaveBeenCalledTimes(1);
  });

  it('does NOT close on non-Escape keys', () => {
    const c = track(makeComponent());
    addOverlayListeners(c, () => false);

    keydown('ArrowDown');
    keydown('Enter');
    keydown('a');
    expect(c.close).not.toHaveBeenCalled();
  });

  // --- extraListeners ---

  it('attaches extraListeners to their own targets and fires them', () => {
    const c = track(makeComponent());
    const onScroll = vi.fn();
    addOverlayListeners(c, () => false, [
      { target: window, type: 'scroll', handler: onScroll, options: { passive: true, capture: true } },
    ]);

    window.dispatchEvent(new Event('scroll'));
    expect(onScroll).toHaveBeenCalledTimes(1);
    // And the extra is recorded in the registry alongside the doc listeners.
    expect(c._overlayListeners.some((l) => l.target === window && l.type === 'scroll')).toBe(true);
  });

  it('detaches extraListeners with their original options on removal', () => {
    const c = track(makeComponent());
    const onScroll = vi.fn();
    const options = { passive: true, capture: true };
    const spy = vi.spyOn(window, 'removeEventListener');

    addOverlayListeners(c, () => false, [
      { target: window, type: 'scroll', handler: onScroll, options },
    ]);
    removeOverlayListeners(c);

    expect(spy).toHaveBeenCalledWith('scroll', onScroll, options);

    // After removal the extra no longer fires.
    onScroll.mockClear();
    window.dispatchEvent(new Event('scroll'));
    expect(onScroll).not.toHaveBeenCalled();
  });

  // --- Cleanup ---

  it('removeOverlayListeners detaches the click listener (no close after remove)', () => {
    const c = track(makeComponent());
    addOverlayListeners(c, () => true);
    removeOverlayListeners(c);

    clickOn(document.body);
    expect(c.close).not.toHaveBeenCalled();
  });

  it('removeOverlayListeners detaches the keydown listener (no close after remove)', () => {
    const c = track(makeComponent());
    addOverlayListeners(c, () => false);
    removeOverlayListeners(c);

    keydown('Escape');
    expect(c.close).not.toHaveBeenCalled();
  });

  it('removeOverlayListeners nulls the storage slot', () => {
    const c = track(makeComponent());
    addOverlayListeners(c, () => false);
    expect(c._overlayListeners).not.toBeNull();

    removeOverlayListeners(c);
    expect(c._overlayListeners).toBeNull();
  });

  it('removeOverlayListeners is a no-op when nothing was registered', () => {
    const c = makeComponent();
    expect(() => removeOverlayListeners(c)).not.toThrow();
    expect(c.close).not.toHaveBeenCalled();
  });
});
