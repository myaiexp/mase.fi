// @vitest-environment jsdom
// The autocomplete controller is the only writer of #cmd-complete: help mode goes
// through showHelp, and isOpen answers from the match list alone.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createAutocomplete } from './command-complete.js';
import { buildRegistry } from './registry.js';

let $input, $popup, onChoose, ac;

const rows = () => [...$popup.querySelectorAll('.cc-item')];

beforeEach(() => {
  document.body.replaceChildren();
  $input = document.createElement('input');
  $popup = document.createElement('div');
  document.body.append($input, $popup);
  buildRegistry({ projects: [{ channel: 'explorer' }, { channel: 'excalibur' }] });
  onChoose = vi.fn();
  ac = createAutocomplete({
    getCommands: () => [],
    formatRelativeActivity: () => '1d',
    onChoose,
  });
  ac.bind($input, $popup);
});

describe('isOpen', () => {
  it('is false before bind has given the controller a popup', () => {
    const unbound = createAutocomplete({
      getCommands: () => [],
      formatRelativeActivity: () => '',
      onChoose,
    });
    expect(unbound.isOpen()).toBe(false);
  });

  it('is true with matches and false once they are hidden', () => {
    ac.render('ex');
    expect(ac.isOpen()).toBe(true);
    ac.hide();
    expect(ac.isOpen()).toBe(false);
  });

  it('is false while the visible popup holds help rows', () => {
    ac.showHelp();
    expect($popup.hidden).toBe(false);
    expect(ac.isOpen()).toBe(false);
  });
});

describe('showHelp', () => {
  it('replaces slash matches with help rows in one call', () => {
    ac.render('ex');
    ac.showHelp();
    expect($popup.querySelector('.cc-head').textContent).toBe('help');
    expect(rows().length).toBeGreaterThan(0);
    expect(rows().some(r => r.hasAttribute('role'))).toBe(false);
  });

  it('leaves nothing for Enter or Tab to choose', () => {
    ac.render('ex');
    ac.showHelp();
    ac.choose();
    expect(onChoose).not.toHaveBeenCalled();
    expect(ac.selected()).toBeNull();
  });

  it('announces a note with no active descendant', () => {
    ac.render('ex');
    ac.showHelp();
    expect($popup.getAttribute('role')).toBe('note');
    expect($popup.hasAttribute('aria-label')).toBe(false);
    expect($input.getAttribute('aria-expanded')).toBe('true');
    expect($input.hasAttribute('aria-activedescendant')).toBe(false);
  });

  it('drops the remembered query so the same query re-ranks from the top', () => {
    ac.render('ex');
    ac.moveSelection(1);
    ac.showHelp();
    ac.render('ex');
    expect(rows()[0].classList.contains('selected')).toBe(true);
  });

  it('hands the popup back to the listbox on the next render', () => {
    ac.showHelp();
    ac.render('ex');
    expect($popup.getAttribute('role')).toBe('listbox');
    expect(ac.isOpen()).toBe(true);
  });
});
