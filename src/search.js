/**
 * Search and command input.
 * Plain text: fuzzy-highlights visible feed lines in the current channel.
 * Slash prefix (/): autocomplete channel navigation.
 */

import uFuzzy from '@leeoniya/ufuzzy';
import { getChannels } from './data.js';

/** @type {uFuzzy} */
const uf = new uFuzzy();

/**
 * Fuzzy-match a needle against a list of channel ids.
 * Returns matching ids sorted by relevance, or empty array if none.
 * @param {string[]} channelIds
 * @param {string} needle
 * @returns {string[]}
 */
export function matchChannels(channelIds, needle) {
  if (!needle) return [];
  const [idxs, , order] = uf.search(channelIds, needle);
  if (!idxs || idxs.length === 0) return [];
  // order is sorted by relevance; map back to channelIds
  return order.map((rank) => channelIds[idxs[rank]]);
}

/**
 * Apply <mark class="search-highlight"> to characters matching ranges in a text node.
 * Returns an array of nodes (text + mark) to replace the original text node.
 * @param {string} text
 * @param {number[][]} ranges - array of [start, end] pairs (end exclusive)
 * @returns {Node[]}
 */
function applyRanges(text, ranges) {
  const nodes = [];
  let cursor = 0;

  for (const [start, end] of ranges) {
    if (start > cursor) {
      nodes.push(document.createTextNode(text.slice(cursor, start)));
    }
    const mark = document.createElement('mark');
    mark.className = 'search-highlight';
    mark.textContent = text.slice(start, end);
    nodes.push(mark);
    cursor = end;
  }

  if (cursor < text.length) {
    nodes.push(document.createTextNode(text.slice(cursor)));
  }

  return nodes;
}

/**
 * Clear all search highlights from a list of feed line elements,
 * restoring their original text content.
 * @param {HTMLElement[]} lineEls
 */
function clearHighlights(lineEls) {
  for (const line of lineEls) {
    const textEl = line.querySelector('.feed-line__text');
    if (!textEl) continue;
    // Only restore if we've marked it
    const original = textEl.dataset.originalText;
    if (original !== undefined) {
      textEl.textContent = original;
      delete textEl.dataset.originalText;
    }
  }
}

/**
 * Apply fuzzy highlights to feed lines matching needle.
 * Non-matching lines remain visible (highlight-only, no filtering).
 * @param {HTMLElement[]} lineEls
 * @param {string} needle
 */
function applyHighlights(lineEls, needle) {
  const texts = lineEls.map((line) => {
    const textEl = line.querySelector('.feed-line__text');
    if (!textEl) return '';
    // Use original if already stored, otherwise current text
    return textEl.dataset.originalText ?? textEl.textContent;
  });

  const [idxs, info, order] = uf.search(texts, needle);

  // Build a map of index -> ranges for O(1) lookup
  const rangeMap = new Map();
  if (idxs && info && order) {
    for (let rank = 0; rank < order.length; rank++) {
      const idx = idxs[order[rank]];
      const ranges = info.ranges[rank]; // [start, end] pairs
      rangeMap.set(idx, ranges);
    }
  }

  lineEls.forEach((line, i) => {
    const textEl = line.querySelector('.feed-line__text');
    if (!textEl) return;

    // Store original text on first highlight pass
    if (textEl.dataset.originalText === undefined) {
      textEl.dataset.originalText = textEl.textContent;
    }

    const original = textEl.dataset.originalText;

    if (!rangeMap.has(i) || !rangeMap.get(i)) {
      // No match — restore plain text (remove any previous marks)
      textEl.textContent = original;
      return;
    }

    const ranges = rangeMap.get(i);
    const nodes = applyRanges(original, ranges);

    // Replace content with marked nodes
    while (textEl.firstChild) textEl.removeChild(textEl.firstChild);
    for (const node of nodes) {
      textEl.appendChild(node);
    }
  });
}

/**
 * Create and insert the autocomplete dropdown above the input bar.
 * @param {HTMLElement} inputBar
 * @returns {HTMLElement} the dropdown element
 */
function createAutocomplete(inputBar) {
  const dropdown = document.createElement('div');
  dropdown.className = 'autocomplete';
  dropdown.setAttribute('role', 'listbox');
  dropdown.setAttribute('aria-label', 'Channel suggestions');
  // Insert as sibling before input bar
  inputBar.parentElement.insertBefore(dropdown, inputBar);
  return dropdown;
}

/**
 * Render autocomplete items into the dropdown.
 * @param {HTMLElement} dropdown
 * @param {string[]} matches - channel ids to show
 * @param {number} activeIdx - currently highlighted index
 */
function renderAutocomplete(dropdown, matches, activeIdx) {
  while (dropdown.firstChild) dropdown.removeChild(dropdown.firstChild);

  for (let i = 0; i < matches.length; i++) {
    const item = document.createElement('div');
    item.className =
      'autocomplete__item' + (i === activeIdx ? ' autocomplete__item--active' : '');
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', String(i === activeIdx));
    item.textContent = `#${matches[i]}`;
    item.dataset.channelId = matches[i];
    dropdown.appendChild(item);
  }

  dropdown.classList.toggle('autocomplete--visible', matches.length > 0);
}

/**
 * Show a brief inline message next to the prompt, auto-clearing after 2s.
 * @param {string} message
 */
function showInlineMessage(message) {
  const existing = document.querySelector('.terminal__inline-msg');
  if (existing) existing.remove();

  const msg = document.createElement('span');
  msg.className = 'terminal__inline-msg';
  msg.textContent = message;

  const inputBar = document.querySelector('.terminal__inputbar');
  if (inputBar) inputBar.appendChild(msg);

  setTimeout(() => msg.remove(), 2000);
}

/**
 * Get the currently visible feed lines in the content feed.
 * @returns {HTMLElement[]}
 */
function getVisibleFeedLines() {
  const feedEl = document.getElementById('content-feed');
  if (!feedEl) return [];
  return Array.from(feedEl.querySelectorAll('.feed-line'));
}

/**
 * Initialize the command input with dual behavior.
 * @param {{ entries: Array, projects: Array }} data
 */
export function initSearch(data) {
  const input = document.getElementById('command-input');
  if (!input) return;

  const inputBar = document.querySelector('.terminal__inputbar');
  if (!inputBar) return;

  // Build flat channel id list from data
  const channelGroups = getChannels(data.entries, data.projects);
  const allChannelIds = channelGroups.flatMap((g) => g.channels.map((c) => c.id));

  const dropdown = createAutocomplete(inputBar);

  let debounceTimer = null;
  let activeIdx = -1;
  let currentMatches = [];

  function closeDropdown() {
    currentMatches = [];
    activeIdx = -1;
    renderAutocomplete(dropdown, [], -1);
  }

  function navigateToChannel(channelId) {
    location.hash = `#/${channelId}`;
    input.value = '';
    closeDropdown();
    input.blur();
  }

  function handleCommandInput(value) {
    // Strip leading slash for matching
    const needle = value.slice(1).trim();

    if (!needle) {
      closeDropdown();
      return;
    }

    currentMatches = matchChannels(allChannelIds, needle);
    activeIdx = currentMatches.length > 0 ? 0 : -1;
    renderAutocomplete(dropdown, currentMatches, activeIdx);
  }

  function handleSearchInput(value) {
    const feedLines = getVisibleFeedLines();

    if (!value.trim()) {
      clearHighlights(feedLines);
      return;
    }

    applyHighlights(feedLines, value.trim());
  }

  // Debounced input handler
  input.addEventListener('input', () => {
    const value = input.value;

    if (value.startsWith('/')) {
      // Command mode — clear any search highlights
      clearHighlights(getVisibleFeedLines());
      handleCommandInput(value);
    } else {
      // Search mode — close dropdown
      closeDropdown();
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => handleSearchInput(value), 100);
    }
  });

  // Keyboard navigation
  input.addEventListener('keydown', (e) => {
    const value = input.value;
    const isCommandMode = value.startsWith('/');

    if (isCommandMode && currentMatches.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeIdx = (activeIdx + 1) % currentMatches.length;
        renderAutocomplete(dropdown, currentMatches, activeIdx);
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeIdx = (activeIdx - 1 + currentMatches.length) % currentMatches.length;
        renderAutocomplete(dropdown, currentMatches, activeIdx);
        return;
      }
    }

    if (e.key === 'Enter') {
      if (isCommandMode) {
        const target =
          activeIdx >= 0 ? currentMatches[activeIdx] : currentMatches[0];
        if (target) {
          navigateToChannel(target);
        } else {
          showInlineMessage('channel not found');
          input.value = '';
          closeDropdown();
        }
      }
      // In search mode Enter does nothing special
      return;
    }

    if (e.key === 'Escape') {
      if (isCommandMode) {
        input.value = '';
        closeDropdown();
      } else {
        // Clear search highlights
        clearHighlights(getVisibleFeedLines());
        input.value = '';
      }
      e.preventDefault();
      return;
    }
  });

  // Click on autocomplete item
  dropdown.addEventListener('click', (e) => {
    const item = e.target.closest('.autocomplete__item');
    if (item?.dataset.channelId) {
      navigateToChannel(item.dataset.channelId);
    }
  });
}
