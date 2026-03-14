import { animate, stagger } from 'animejs';
import { scrollReveal } from './animations.js';

/** Format "YYYY-MM-DD" → "DD.MM.YYYY" */
function formatDate(isoDate) {
  const [y, m, d] = isoDate.split('-');
  return `${d}.${m}.${y}`;
}

/**
 * Filter entries. Always strips `log` category first, then applies pill filter:
 * 'all'     → all non-log entries
 * 'project' → category === 'project'
 * 'feature' → category === 'project' || category === 'feature' (cumulative)
 * 'daily'   → category === 'daily'
 */
function filterEntries(entries, filter) {
  const nonLog = entries.filter(e => e.category !== 'log');
  if (filter === 'project') return nonLog.filter(e => e.category === 'project');
  if (filter === 'feature') return nonLog.filter(e => e.category === 'project' || e.category === 'feature');
  if (filter === 'daily') return nonLog.filter(e => e.category === 'daily');
  return nonLog; // 'all'
}

/**
 * Render a project entry.
 * Full-width block, bg-card, 4px accent left border, display font name (~1.2rem),
 * description, date top-right.
 */
function renderProjectEntry(entry) {
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
  text.textContent = entry.text || entry.summary || '';

  node.appendChild(header);
  node.appendChild(text);

  return node;
}

/**
 * Render a feature entry.
 * No background, 2px --accent-dim left bar, badge + inline text.
 */
function renderFeatureEntry(entry) {
  const node = document.createElement('article');
  node.className = 'stream-entry stream-entry--feature';

  const badge = document.createElement('span');
  badge.className = 'stream-entry__project-badge';
  badge.textContent = entry.project;

  const text = document.createElement('span');
  text.className = 'stream-entry__text';
  text.textContent = entry.text || entry.summary || '';

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
function renderDailyEntry(entry) {
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
  summary.textContent = entry.summary || entry.text || '';

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
 * Clear container, append rendered entries, trigger scroll reveals.
 */
function renderStream(entries, container, prefersReducedMotion) {
  // Clear existing entries
  while (container.firstChild) container.removeChild(container.firstChild);

  entries.forEach(entry => {
    let node;
    if (entry.category === 'project') {
      node = renderProjectEntry(entry);
    } else if (entry.category === 'feature') {
      node = renderFeatureEntry(entry);
    } else if (entry.category === 'daily') {
      node = renderDailyEntry(entry);
    } else {
      // Fallback for unknown categories — render as feature-style
      node = renderFeatureEntry(entry);
    }
    container.appendChild(node);
  });

  // Trigger scroll reveals for new entries
  scrollReveal('.stream-entry', prefersReducedMotion);

  // If not using CSS scroll-driven animations, also do a stagger-in for visible items
  if (!prefersReducedMotion && !CSS.supports('animation-timeline: view()') && entries.length > 0) {
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
 * Initialize the updates stream: render pill-bar, render entries, attach filter handlers.
 * @param {Array} entries - The entries array from updates.json
 * @param {boolean} prefersReducedMotion - Reduced motion preference
 */
export function initUpdates(entries, prefersReducedMotion) {
  const controlsEl = document.querySelector('.updates-controls');
  const streamEl = document.querySelector('.updates-stream');

  if (!controlsEl || !streamEl) return;

  // Pill bar config: label → filter value
  const pills = [
    { label: 'All', value: 'all' },
    { label: 'Projects', value: 'project' },
    { label: 'Features', value: 'feature' },
    { label: 'Dev log', value: 'daily' },
  ];

  // Build pill bar
  const pillBar = document.createElement('nav');
  pillBar.className = 'pill-bar';
  pillBar.setAttribute('aria-label', 'Update filters');

  let activeFilter = 'all';

  pills.forEach(({ label, value }) => {
    const btn = document.createElement('button');
    btn.className = 'pill-btn' + (value === activeFilter ? ' active' : '');
    btn.textContent = label;
    btn.dataset.filter = value;
    btn.addEventListener('click', () => {
      if (value === activeFilter) return;
      activeFilter = value;

      // Update pill active state
      pillBar.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const filtered = filterEntries(entries, activeFilter);

      // View Transitions API for smooth filter swap
      if (document.startViewTransition) {
        document.startViewTransition(() => renderStream(filtered, streamEl, prefersReducedMotion));
      } else {
        renderStream(filtered, streamEl, prefersReducedMotion);
      }
    });
    pillBar.appendChild(btn);
  });

  controlsEl.appendChild(pillBar);

  // Initial render with default filter
  const initial = filterEntries(entries, activeFilter);
  renderStream(initial, streamEl, prefersReducedMotion);
}
