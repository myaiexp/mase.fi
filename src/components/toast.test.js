// @vitest-environment jsdom
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';

let BaseToast;

beforeAll(async () => {
  const mod = await import('./toast.js');
  BaseToast = mod.BaseToast;
});

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  // Clean up container between tests
  const container = document.querySelector('[data-toast-container]');
  if (container) container.remove();
});

describe('BaseToast', () => {
  it('show() creates a toast element in the container', () => {
    BaseToast.show('test message');
    const container = document.querySelector('[data-toast-container]');
    expect(container).toBeTruthy();
    expect(container.children.length).toBe(1);
    expect(container.children[0].textContent).toBe('test message');
  });

  it('toast auto-removes after duration', () => {
    BaseToast.show('gone soon', 'info', 100);
    const container = document.querySelector('[data-toast-container]');
    expect(container.children.length).toBe(1);
    vi.advanceTimersByTime(500); // 100ms duration + 300ms fade-out
    expect(container.children.length).toBe(0);
  });

  it('fades out (opacity 0) before removal, not abruptly', () => {
    BaseToast.show('fading', 'info', 100);
    const container = document.querySelector('[data-toast-container]');
    const toast = container.children[0];

    // The opacity transition is what makes the fade visible rather than a snap.
    expect(toast.style.transition).toBe('opacity 0.3s');
    // Fully visible while the duration is still counting down.
    expect(toast.style.opacity).toBe('1');

    // At the duration boundary the fade begins, but the toast is NOT yet removed.
    vi.advanceTimersByTime(100);
    expect(toast.style.opacity).toBe('0');
    expect(container.children.length).toBe(1);

    // Mid-fade (before the 300ms transition completes) the toast is still present.
    vi.advanceTimersByTime(299);
    expect(container.children.length).toBe(1);

    // Only after the full 300ms fade does the toast leave the DOM.
    vi.advanceTimersByTime(1);
    expect(container.children.length).toBe(0);
  });

  it('multiple toasts stack vertically', () => {
    BaseToast.show('first');
    BaseToast.show('second');
    const container = document.querySelector('[data-toast-container]');
    expect(container.children.length).toBe(2);
  });

  it('type applies correct semantic color', () => {
    BaseToast.show('error msg', 'error');
    const container = document.querySelector('[data-toast-container]');
    const toast = container.children[0];
    expect(toast.style.borderColor).toBe('var(--red)');
  });

  it('container is created only once', () => {
    BaseToast.show('a');
    BaseToast.show('b');
    const containers = document.querySelectorAll('[data-toast-container]');
    expect(containers.length).toBe(1);
  });
});
