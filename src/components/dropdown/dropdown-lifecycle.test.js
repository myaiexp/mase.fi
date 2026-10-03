// @vitest-environment jsdom
// <base-dropdown> lifecycle: children rendered after upgrade (the MutationObserver
// re-bind), a swapped trigger, and disconnect teardown of the overlay listeners.
import { describe, it, expect, beforeAll, afterEach } from 'vitest';

beforeAll(async () => {
  await import('./dropdown.js');
});

function button(text) {
  const b = document.createElement('button');
  b.setAttribute('slot', 'trigger');
  b.textContent = text;
  return b;
}

function item(value) {
  const i = document.createElement('base-dropdown-item');
  i.setAttribute('value', value);
  i.setAttribute('slot', 'items');
  i.textContent = value;
  return i;
}

// The observer callback is a microtask; a macrotask boundary guarantees it ran.
const flushObserver = () => new Promise((r) => setTimeout(r, 0));

describe('base-dropdown lifecycle', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('an item added after connect is bound and fires select', async () => {
    const el = document.createElement('base-dropdown');
    el.appendChild(button('Open'));
    document.body.appendChild(el);

    const late = item('late');
    el.appendChild(late);
    await flushObserver();

    const received = [];
    el.addEventListener('select', (e) => received.push(e.detail.value));
    el.open();
    late.click();
    expect(received).toEqual(['late']);
    expect(el.isOpen).toBe(false);
  });

  it('a trigger added after connect opens the menu', async () => {
    const el = document.createElement('base-dropdown');
    el.appendChild(item('a'));
    document.body.appendChild(el);

    const trigger = button('Open');
    el.appendChild(trigger);
    await flushObserver();

    trigger.click();
    expect(el.isOpen).toBe(true);
  });

  it('swapping the trigger unbinds the old one and binds the new one', async () => {
    const el = document.createElement('base-dropdown');
    const oldTrigger = button('Old');
    el.append(oldTrigger, item('a'));
    document.body.appendChild(el);

    const newTrigger = button('New');
    oldTrigger.replaceWith(newTrigger);
    await flushObserver();

    // Detached, the old trigger still receives its own click — a leftover listener
    // would toggle the menu open.
    oldTrigger.click();
    expect(el.isOpen).toBe(false);

    newTrigger.click();
    expect(el.isOpen).toBe(true);
    newTrigger.click();
    expect(el.isOpen).toBe(false);
  });

  it('disconnect removes document listeners — no leak on a detached element', async () => {
    const el = document.createElement('base-dropdown');
    el.append(button('Open'), item('a'));
    document.body.appendChild(el);
    el.open();
    await Promise.resolve(); // let the deferred outside-click listener attach
    expect(el.isOpen).toBe(true);

    el.remove();
    document.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    // Neither event reached close(): a leaked listener would have flipped it to false.
    expect(el.isOpen).toBe(true);
  });

  it('disconnect stops the observer: children added while detached are not bound', async () => {
    const el = document.createElement('base-dropdown');
    el.appendChild(button('Open'));
    document.body.appendChild(el);
    el.remove();

    const late = item('late');
    el.appendChild(late);
    await flushObserver();

    const received = [];
    el.addEventListener('select', (e) => received.push(e.detail.value));
    late.click();
    expect(received).toEqual([]);
  });
});
