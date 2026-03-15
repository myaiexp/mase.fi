import { animate, stagger } from 'animejs';
import { scrollReveal } from './animations.js';
import uFuzzy from '@leeoniya/ufuzzy';
import { formatDate } from './utils.js';

/**
 * Filter entries by pill selection:
 * 'all'     → all non-log entries (project, feature, daily)
 * 'project' → category === 'project'
 * 'feature' → category === 'project' || category === 'feature' (cumulative)
 * 'daily'   → category === 'daily'
 * 'log'     → category === 'log' (commit log, hidden from "all")
 */
function filterEntries(entries, filter) {
  if (filter === 'log') return entries.filter(e => e.category === 'log');
  const nonLog = entries.filter(e => e.category !== 'log');
  if (filter === 'project') return nonLog.filter(e => e.category === 'project');
  if (filter === 'feature') return nonLog.filter(e => e.category === 'project' || e.category === 'feature');
  if (filter === 'daily') return nonLog.filter(e => e.category === 'daily');
  return nonLog; // 'all'
}

/** Get the searchable text for an entry (project name + text for broader search) */
function entrySearchText(entry) {
  const text = entry.text || entry.summary || '';
  return entry.project ? `${entry.project} ${text}` : text;
}

/** Get the display text for an entry */
function entryText(entry) {
  return entry.text || entry.summary || '';
}

const STREAM_PAGE_SIZE = 10;

/**
 * Build a DOM fragment with highlighted matched substrings using <mark> elements.
 * Safe: creates DOM nodes, no innerHTML.
 */
function buildHighlightedFragment(text, ranges) {
  const frag = document.createDocumentFragment();
  const mark = (part, matched) => {
    if (matched) {
      const el = document.createElement('mark');
      el.className = 'search-highlight';
      el.textContent = part;
      return el;
    }
    return document.createTextNode(part);
  };
  const append = (accum, node) => { accum.appendChild(node); };
  uFuzzy.highlight(text, ranges, mark, frag, append);
  return frag;
}

/**
 * Set text content on an element, optionally with search highlights.
 * @param {HTMLElement} el - Target element
 * @param {string} text - Plain text
 * @param {Int32Array|null} ranges - uFuzzy ranges for this entry (null = no highlight)
 * @param {string} haystackStr - The haystack string that was searched (for highlight alignment)
 */
function setTextWithHighlight(el, text, ranges, haystackStr) {
  if (ranges && haystackStr) {
    el.textContent = '';
    el.appendChild(buildHighlightedFragment(haystackStr, ranges));
  } else {
    el.textContent = text;
  }
}

/**
 * Render a project entry.
 * Full-width block, bg-card, 4px accent left border, display font name (~1.2rem),
 * description, date top-right.
 */
function renderProjectEntry(entry, ranges, haystackStr) {
  const node = document.createElement('article');
  node.className = 'stream-entry stream-entry--project';

  const header = document.createElement('div');
  header.className = 'stream-entry__header';

  const name = document.createElement('h3');
  name.className = 'stream-entry__name';
  name.textContent = entry.project;

  const date = document.createElement('time');
  date.className = 'stream-entry__date';
  date.dateTime = entry.date;
  date.textContent = formatDate(entry.date);

  header.appendChild(name);
  header.appendChild(date);

  const text = document.createElement('p');
  text.className = 'stream-entry__text';
  setTextWithHighlight(text, entryText(entry), ranges, haystackStr);

  node.appendChild(header);
  node.appendChild(text);

  return node;
}

/**
 * Render a feature entry.
 * No background, 2px --accent-dim left bar, badge + inline text.
 */
function renderFeatureEntry(entry, ranges, haystackStr) {
  const node = document.createElement('article');
  node.className = 'stream-entry stream-entry--feature';

  const badge = document.createElement('span');
  badge.className = 'stream-entry__project-badge';
  badge.textContent = entry.project;

  const text = document.createElement('span');
  text.className = 'stream-entry__text';
  setTextWithHighlight(text, entryText(entry), ranges, haystackStr);

  const date = document.createElement('time');
  date.className = 'stream-entry__date';
  date.dateTime = entry.date;
  date.textContent = formatDate(entry.date);

  const body = document.createElement('div');
  body.className = 'stream-entry__body';
  body.appendChild(badge);
  body.appendChild(text);

  node.appendChild(body);
  node.appendChild(date);

  return node;
}

/**
 * Render a daily entry.
 * Compact row with <details> accordion for commits.
 */
function renderDailyEntry(entry, ranges, haystackStr) {
  const supportsInterpolateSize = CSS.supports('interpolate-size', 'allow-keywords');

  const node = document.createElement('article');
  node.className = 'stream-entry stream-entry--daily';

  const header = document.createElement('div');
  header.className = 'stream-entry__header';

  const badge = document.createElement('span');
  badge.className = 'stream-entry__project-badge';
  badge.textContent = entry.project;

  const date = document.createElement('time');
  date.className = 'stream-entry__date';
  date.dateTime = entry.date;
  date.textContent = formatDate(entry.date);

  header.appendChild(badge);
  header.appendChild(date);

  const summary = document.createElement('p');
  summary.className = 'stream-entry__summary';
  setTextWithHighlight(summary, entry.summary || entry.text || '', ranges, haystackStr);

  node.appendChild(header);
  node.appendChild(summary);

  // Commits accordion (only if commits array exists and has entries)
  const commits = entry.commits;
  if (commits && commits.length > 0) {
    const details = document.createElement('details');
    details.className = 'stream-commits';

    const detailsSummary = document.createElement('summary');
    detailsSummary.className = 'stream-entry__summary-toggle';

    const chevron = document.createElement('span');
    chevron.className = 'stream-entry__chevron';
    chevron.setAttribute('aria-hidden', 'true');

    const label = document.createElement('span');
    label.textContent = `${commits.length} commit${commits.length !== 1 ? 's' : ''}`;

    detailsSummary.appendChild(chevron);
    detailsSummary.appendChild(label);

    const commitList = document.createElement('ul');
    commitList.className = 'stream-commits__list';
    commits.forEach(msg => {
      const li = document.createElement('li');
      li.className = 'stream-commits__item';
      li.textContent = msg;
      commitList.appendChild(li);
    });

    details.appendChild(detailsSummary);
    details.appendChild(commitList);

    // If interpolate-size is not supported, animate height with anime.js
    if (!supportsInterpolateSize) {
      details.addEventListener('toggle', () => {
        if (details.open) {
          const height = commitList.scrollHeight;
          animate(commitList, {
            height: [0, height],
            opacity: [0, 1],
            duration: 300,
            ease: 'outExpo',
          });
        }
      });
    }

    node.appendChild(details);
  }

  return node;
}

/**
 * Render a log entry (GitHub-style commit row).
 * Timeline dot on left, project badge, commit message, date.
 */
function renderLogEntry(entry, ranges, haystackStr) {
  const node = document.createElement('article');
  node.className = 'stream-entry stream-entry--log';

  const dot = document.createElement('span');
  dot.className = 'stream-entry__dot';
  dot.setAttribute('aria-hidden', 'true');

  const badge = document.createElement('span');
  badge.className = 'stream-entry__project-badge';
  badge.textContent = entry.project;

  const text = document.createElement('span');
  text.className = 'stream-entry__text';
  setTextWithHighlight(text, entryText(entry), ranges, haystackStr);

  const date = document.createElement('time');
  date.className = 'stream-entry__date';
  date.dateTime = entry.date;
  date.textContent = formatDate(entry.date);

  const body = document.createElement('div');
  body.className = 'stream-entry__body';
  body.appendChild(badge);
  body.appendChild(text);

  node.appendChild(dot);
  node.appendChild(body);
  node.appendChild(date);

  return node;
}

/**
 * Render an entry with the appropriate renderer.
 * @param {Object} entry
 * @param {Int32Array|null} ranges - uFuzzy highlight ranges (null = no highlight)
 * @param {string|null} haystackStr - Haystack string for highlight alignment
 */
function renderEntry(entry, ranges, haystackStr) {
  if (entry.category === 'project') return renderProjectEntry(entry, ranges, haystackStr);
  if (entry.category === 'feature') return renderFeatureEntry(entry, ranges, haystackStr);
  if (entry.category === 'daily') return renderDailyEntry(entry, ranges, haystackStr);
  if (entry.category === 'log') return renderLogEntry(entry, ranges, haystackStr);
  return renderFeatureEntry(entry, ranges, haystackStr);
}

/**
 * Clear container, append rendered entries, trigger scroll reveals.
 * @param {Array} entries - Entries to render
 * @param {HTMLElement} container
 * @param {boolean} prefersReducedMotion
 * @param {Map|null} highlightMap - Map of entry index → {ranges, haystack} for search highlights
 */
function renderStream(entries, container, prefersReducedMotion, highlightMap, limit) {
  while (container.firstChild) container.removeChild(container.firstChild);

  const cap = limit || STREAM_PAGE_SIZE;
  const visible = entries.slice(0, cap);
  const hasMore = entries.length > cap;

  visible.forEach((entry, i) => {
    const hl = highlightMap?.get(i);
    const node = renderEntry(entry, hl?.ranges ?? null, hl?.haystack ?? null);
    container.appendChild(node);
  });

  if (hasMore) {
    const showMore = document.createElement('button');
    showMore.className = 'stream-show-more';
    showMore.textContent = `Show ${entries.length - cap} more`;
    showMore.addEventListener('click', () => {
      renderStream(entries, container, prefersReducedMotion, highlightMap, entries.length);
    });
    container.appendChild(showMore);
  }

  scrollReveal('.stream-entry', prefersReducedMotion);

  if (!prefersReducedMotion && !CSS.supports('animation-timeline: view()') && visible.length > 0) {
    animate('.stream-entry', {
      opacity: [0, 1],
      translateY: ['1rem', 0],
      duration: 400,
      delay: stagger(40),
      ease: 'outExpo',
    });
  }
}

/**
 * Initialize the updates stream: render pill-bar, search, entries, attach handlers.
 * @param {Array} entries - The entries array from updates.json
 * @param {boolean} prefersReducedMotion - Reduced motion preference
 */
export function initUpdates(entries, prefersReducedMotion) {
  const controlsEl = document.querySelector('.updates-controls');
  const streamEl = document.querySelector('.updates-stream');

  if (!controlsEl || !streamEl) return;

  const uf = new uFuzzy();
  let activeFilter = 'all';
  let searchNeedle = '';

  /** Get pill-filtered entries */
  function getFiltered() {
    return filterEntries(entries, activeFilter);
  }

  /** Apply search within filtered entries, render results */
  function applySearchAndRender() {
    const filtered = getFiltered();

    if (!searchNeedle) {
      renderWithTransition(filtered, streamEl, prefersReducedMotion, null);
      return;
    }

    // Build haystack from filtered entries (includes project name for broader matching)
    const haystack = filtered.map(e => entrySearchText(e));
    const [idxs, info, order] = uf.search(haystack, searchNeedle, true);

    if (!idxs || idxs.length === 0) {
      renderWithTransition([], streamEl, prefersReducedMotion, null);
      return;
    }

    // Build ordered result entries with highlight data
    const resultEntries = [];
    const highlightMap = new Map();

    if (order) {
      order.forEach(orderIdx => {
        const haystackIdx = info.idx[orderIdx];
        const entry = filtered[haystackIdx];
        const resultIndex = resultEntries.length;
        resultEntries.push(entry);
        highlightMap.set(resultIndex, {
          ranges: info.ranges[orderIdx],
          haystack: haystack[haystackIdx],
        });
      });
    } else {
      idxs.forEach(idx => {
        resultEntries.push(filtered[idx]);
      });
    }

    renderWithTransition(resultEntries, streamEl, prefersReducedMotion, highlightMap);
  }

  /** Render with View Transitions API if available */
  function renderWithTransition(entries, container, reducedMotion, highlightMap) {
    container.classList.toggle('updates-stream--log', activeFilter === 'log');
    if (document.startViewTransition) {
      document.startViewTransition(() => renderStream(entries, container, reducedMotion, highlightMap));
    } else {
      renderStream(entries, container, reducedMotion, highlightMap);
    }
  }

  // ===== Pill bar =====
  const pills = [
    { label: 'All', value: 'all' },
    { label: 'Projects', value: 'project' },
    { label: 'Features', value: 'feature' },
    { label: 'Summaries', value: 'daily' },
    { label: 'Commit log', value: 'log' },
  ];

  const pillBar = document.createElement('nav');
  pillBar.className = 'pill-bar';
  pillBar.setAttribute('aria-label', 'Update filters');

  pills.forEach(({ label, value }) => {
    const btn = document.createElement('button');
    btn.className = 'pill-btn' + (value === activeFilter ? ' active' : '');
    btn.textContent = label;
    btn.dataset.filter = value;
    btn.addEventListener('click', () => {
      if (value === activeFilter) return;
      activeFilter = value;
      pillBar.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applySearchAndRender();
    });
    pillBar.appendChild(btn);
  });

  controlsEl.appendChild(pillBar);

  // ===== Search =====
  const searchToggle = document.createElement('button');
  searchToggle.className = 'search-toggle';
  searchToggle.setAttribute('aria-label', 'Search updates');
  // Magnifying glass SVG icon
  searchToggle.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>';

  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.className = 'search-input';
  searchInput.placeholder = 'Search...';
  searchInput.setAttribute('aria-label', 'Search updates');

  let debounceTimer = null;

  searchToggle.addEventListener('click', () => {
    searchInput.classList.add('active');
    searchToggle.classList.add('active');
    searchInput.focus();
  });

  searchInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      searchNeedle = searchInput.value.trim();
      applySearchAndRender();
    }, 100);
  });

  searchInput.addEventListener('blur', () => {
    if (!searchInput.value.trim()) {
      searchInput.classList.remove('active');
      searchToggle.classList.remove('active');
      if (searchNeedle) {
        searchNeedle = '';
        applySearchAndRender();
      }
    }
  });

  // Escape key clears and collapses search
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      searchInput.value = '';
      searchNeedle = '';
      searchInput.classList.remove('active');
      searchToggle.classList.remove('active');
      searchInput.blur();
      applySearchAndRender();
    }
  });

  controlsEl.appendChild(searchToggle);
  controlsEl.appendChild(searchInput);

  // ===== Initial render =====
  const initial = getFiltered();
  renderStream(initial, streamEl, prefersReducedMotion, null);
}
