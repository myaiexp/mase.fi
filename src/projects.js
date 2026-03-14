import { scrollReveal, initCardRipples } from './animations.js';

/** Format "YYYY-MM-DD" → "DD.MM.YYYY" */
function formatDate(isoDate) {
  const [y, m, d] = isoDate.split('-');
  return `${d}.${m}.${y}`;
}

/**
 * Get entries for a specific project (case-insensitive match on entry.project field).
 * @param {Array} entries
 * @param {string} projectName
 * @returns {Array}
 */
function getProjectEntries(entries, projectName) {
  const lower = projectName.toLowerCase();
  return entries.filter(e => e.project && e.project.toLowerCase() === lower);
}

/**
 * Sort projects by most recent feature/project entry date (descending).
 * Projects with no matching entries go to the bottom.
 * @param {Array} projects
 * @param {Array} entries
 * @returns {Array}
 */
function sortProjects(projects, entries) {
  return [...projects].sort((a, b) => {
    const getLatest = (project) => {
      const projectEntries = getProjectEntries(entries, project.name)
        .filter(e => e.category === 'feature' || e.category === 'project');
      if (!projectEntries.length) return '';
      return projectEntries
        .map(e => e.date)
        .sort()
        .at(-1);
    };
    const dateA = getLatest(a);
    const dateB = getLatest(b);
    if (!dateA && !dateB) return 0;
    if (!dateA) return 1;
    if (!dateB) return -1;
    return dateB.localeCompare(dateA);
  });
}

/**
 * Render a single mini-feed item (date + text, no badges).
 * @param {Object} entry
 * @returns {HTMLElement}
 */
function renderFeedItem(entry) {
  const li = document.createElement('li');
  li.className = 'project-card__feed-item';

  const date = document.createElement('time');
  date.className = 'project-card__feed-date';
  date.dateTime = entry.date;
  date.textContent = formatDate(entry.date);

  const text = document.createElement('span');
  text.className = 'project-card__feed-text';
  text.textContent = entry.text || entry.summary || '';

  li.appendChild(date);
  li.appendChild(text);
  return li;
}

/**
 * Render a flagship card: full-width, display font name, description,
 * mini-feed of last 5 non-log entries, expand affordance if more.
 * @param {Object} project
 * @param {Array} projectEntries - All entries for this project
 * @returns {HTMLElement}
 */
function renderFlagshipCard(project, projectEntries) {
  const card = document.createElement('a');
  card.className = 'project-card project-card--flagship';
  card.href = project.url || '#';
  if (project.url) {
    card.target = '_blank';
    card.rel = 'noopener noreferrer';
  }

  const name = document.createElement('h3');
  name.className = 'project-card__name';
  name.textContent = project.name;

  card.appendChild(name);

  if (project.desc) {
    const desc = document.createElement('p');
    desc.className = 'project-card__desc';
    desc.textContent = project.desc;
    card.appendChild(desc);
  }

  // Mini-feed: last 5 non-log entries, most recent first
  const feedEntries = projectEntries
    .filter(e => e.category !== 'log')
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);

  if (feedEntries.length > 0) {
    const feed = document.createElement('ul');
    feed.className = 'project-card__feed';

    feedEntries.forEach(entry => {
      feed.appendChild(renderFeedItem(entry));
    });

    card.appendChild(feed);

    // Expand affordance if there are more than 5 non-log entries
    const totalFeedEntries = projectEntries.filter(e => e.category !== 'log').length;
    if (totalFeedEntries > 5) {
      const more = document.createElement('span');
      more.className = 'project-card__feed-more';
      more.textContent = `+${totalFeedEntries - 5} more`;
      card.appendChild(more);
    }
  }

  return card;
}

/**
 * Render a standard card: compact, name as link, one-line desc,
 * last 2-3 entries as tight list.
 * @param {Object} project
 * @param {Array} projectEntries - All entries for this project
 * @returns {HTMLElement}
 */
function renderStandardCard(project, projectEntries) {
  const card = document.createElement('a');
  card.className = 'project-card project-card--standard';
  card.href = project.url || '#';
  if (project.url) {
    card.target = '_blank';
    card.rel = 'noopener noreferrer';
  }

  const name = document.createElement('h3');
  name.className = 'project-card__name';
  name.textContent = project.name;

  card.appendChild(name);

  if (project.desc) {
    const desc = document.createElement('p');
    desc.className = 'project-card__desc';
    desc.textContent = project.desc;
    card.appendChild(desc);
  }

  // Mini-feed: last 3 non-log entries, most recent first
  const feedEntries = projectEntries
    .filter(e => e.category !== 'log')
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3);

  if (feedEntries.length > 0) {
    const feed = document.createElement('ul');
    feed.className = 'project-card__feed';

    feedEntries.forEach(entry => {
      feed.appendChild(renderFeedItem(entry));
    });

    card.appendChild(feed);
  }

  return card;
}

/**
 * Render data-driven project cards with flagship/standard variants and per-project mini-feeds.
 * @param {Array} entries - Full entries array (for mini-feeds and sorting)
 * @param {Array} projects - Projects array from updates.json
 * @param {boolean} prefersReducedMotion - Reduced motion preference
 */
export function initProjects(entries, projects, prefersReducedMotion) {
  const grid = document.querySelector('.projects-grid');
  if (!grid) return;

  // Clear any static fallback content
  while (grid.firstChild) grid.removeChild(grid.firstChild);

  if (!projects || !projects.length) return;

  const sorted = sortProjects(projects, entries);

  sorted.forEach(project => {
    const projectEntries = getProjectEntries(entries, project.name);
    const card = project.flagship
      ? renderFlagshipCard(project, projectEntries)
      : renderStandardCard(project, projectEntries);
    grid.appendChild(card);
  });

  // Scroll reveals and card ripples
  scrollReveal('.project-card', prefersReducedMotion);
  initCardRipples('.project-card');
}
