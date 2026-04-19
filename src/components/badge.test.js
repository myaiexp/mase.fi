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

  it('defaults to tag (no dot)', () => {
    const el = createBadge({ variant: 'feature' });
    const span = el.shadowRoot.querySelector('span');
    expect(span.classList.contains('dot')).toBe(false);
  });

  it('type="status" renders a dot', () => {
    const el = createBadge({ type: 'status', variant: 'running' });
    const span = el.shadowRoot.querySelector('span');
    expect(span.classList.contains('dot')).toBe(true);
  });

  it('type="tag" omits the dot', () => {
    const el = createBadge({ type: 'tag', variant: 'feature' });
    const span = el.shadowRoot.querySelector('span');
    expect(span.classList.contains('dot')).toBe(false);
  });

  it('status variant sets --bb-color and 8% --bb-tint', () => {
    const el = createBadge({ type: 'status', variant: 'running' });
    expect(el.style.getPropertyValue('--bb-color')).toBe('var(--green)');
    expect(el.style.getPropertyValue('--bb-tint')).toBe('8%');
  });

  it('tag variant resolves via the tag map', () => {
    const el = createBadge({ type: 'tag', variant: 'feature' });
    expect(el.style.getPropertyValue('--bb-color')).toBe('var(--blue)');
    expect(el.style.getPropertyValue('--bb-tint')).toBe('8%');
  });

  it('idle uses 4% tint', () => {
    const el = createBadge({ type: 'status', variant: 'idle' });
    expect(el.style.getPropertyValue('--bb-tint')).toBe('4%');
  });

  it('chore uses 4% tint', () => {
    const el = createBadge({ type: 'tag', variant: 'chore' });
    expect(el.style.getPropertyValue('--bb-tint')).toBe('4%');
  });

  it('color attribute overrides variant and drives --bb-color', () => {
    const el = createBadge({ variant: 'feature', color: '#e8a308' });
    expect(el.style.getPropertyValue('--bb-color')).toBe('#e8a308');
  });

  it('unknown variant leaves badge uncolored', () => {
    const el = createBadge({ variant: 'bogus' });
    expect(el.style.getPropertyValue('--bb-color')).toBe('');
  });

  it('size="sm" applies smaller styling', () => {
    const el = createBadge({ size: 'sm' });
    const span = el.shadowRoot.querySelector('span');
    expect(span.classList.contains('sm')).toBe(true);
  });

  it('type change toggles the dot reactively', () => {
    const el = createBadge({ type: 'tag', variant: 'feature' });
    const span = el.shadowRoot.querySelector('span');
    expect(span.classList.contains('dot')).toBe(false);
    el.setAttribute('type', 'status');
    el.setAttribute('variant', 'running');
    expect(span.classList.contains('dot')).toBe(true);
    expect(el.style.getPropertyValue('--bb-color')).toBe('var(--green)');
  });
});
