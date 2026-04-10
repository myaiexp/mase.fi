// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest';

beforeAll(async () => {
  await import('./badge.js');
});

function createBadge(attrs = {}, text = '') {
  const el = document.createElement('base-badge');
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (text) el.textContent = text;
  document.body.appendChild(el);
  return el;
}

describe('base-badge', () => {
  it('renders slotted text content', () => {
    const el = createBadge({}, 'Active');
    const slot = el.shadowRoot.querySelector('slot');
    expect(slot).toBeTruthy();
  });

  it('applies variant class for styling', () => {
    const el = createBadge({ variant: 'success' });
    const span = el.shadowRoot.querySelector('span');
    expect(span.classList.contains('success')).toBe(true);
  });

  it('custom color attribute overrides variant', () => {
    const el = createBadge({ variant: 'success', color: '#e8a308' });
    const span = el.shadowRoot.querySelector('span');
    expect(span.style.backgroundColor).toBe('rgb(232, 163, 8)');
  });

  it('size="sm" applies smaller styling', () => {
    const el = createBadge({ size: 'sm' });
    const span = el.shadowRoot.querySelector('span');
    expect(span.classList.contains('sm')).toBe(true);
  });

  it('variant change updates styling reactively', () => {
    const el = createBadge({ variant: 'success' });
    const span = el.shadowRoot.querySelector('span');
    expect(span.classList.contains('success')).toBe(true);
    el.setAttribute('variant', 'danger');
    expect(span.classList.contains('danger')).toBe(true);
    expect(span.classList.contains('success')).toBe(false);
  });
});
