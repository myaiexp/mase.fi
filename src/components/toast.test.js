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
