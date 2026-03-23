/** Terminal primitives: formatting, nick colors, line creation, typing effect. */

/** Format ISO date to Finnish DD.MM.YYYY */
export function formatDate(isoDate) {
  const [y, m, d] = isoDate.split('-');
  return `${d}.${m}.${y}`;
}

/** Format ISO date to short DD.MM */
export function shortDate(isoDate) {
  const [, m, d] = isoDate.split('-');
  return `${d}.${m}`;
}

/** Relative date: "today", "yesterday", "2d", "1w", "3w", "2mo" */
export function relativeDate(isoDate) {
  const now = new Date();
  const then = new Date(isoDate + 'T00:00:00');
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.floor((today - then) / 86400000);

  if (diff <= 0) return 'today';
  if (diff === 1) return 'yesterday';
  if (diff < 7) return `${diff}d`;
  if (diff < 28) return `${Math.floor(diff / 7)}w`;
  return `${Math.floor(diff / 30)}mo`;
}

/** Nick color palette — muted terminal colors, deterministic by name hash. */
const NICK_COLORS = [
  '#e06c75', // red
  '#98c379', // green
  '#e5c07b', // yellow
  '#61afef', // blue
  '#c678dd', // purple
  '#56b6c2', // cyan
  '#d19a66', // orange
  '#be5046', // dark red
];

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/**
 * Create a styled nick element (project name with consistent color).
 * @param {string} name
 * @returns {HTMLSpanElement}
 */
export function createNick(name) {
  const span = document.createElement('span');
  span.className = 'nick';
  span.textContent = name;
  span.style.color = NICK_COLORS[hashString(name) % NICK_COLORS.length];
  return span;
}

/**
 * Create a complete feed line: [timestamp] nick text
 * @param {string} date - ISO date
 * @param {string} nick - project name
 * @param {string} text - line content
 * @returns {HTMLDivElement}
 */
export function createLine(date, nick, text) {
  const div = document.createElement('div');
  div.className = 'feed-line';

  const timeEl = document.createElement('span');
  timeEl.className = 'feed-line__time';
  timeEl.textContent = shortDate(date);

  const nickEl = createNick(nick);

  const textEl = document.createElement('span');
  textEl.className = 'feed-line__text';
  textEl.textContent = text;

  div.append(timeEl, nickEl, textEl);
  return div;
}

/**
 * Type text into an element character-by-character.
 * On abort signal, instantly complete the remaining text.
 * @param {HTMLElement} el
 * @param {string} text
 * @param {number} [charDelay=20]
 * @param {AbortSignal} [signal]
 * @returns {Promise<void>}
 */
export async function typeText(el, text, charDelay = 20, signal) {
  if (signal?.aborted) {
    el.textContent = text;
    return;
  }

  for (let i = 0; i < text.length; i++) {
    if (signal?.aborted) {
      el.textContent = text;
      return;
    }
    el.textContent += text[i];
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, charDelay);
      if (signal) {
        signal.addEventListener('abort', () => {
          clearTimeout(timer);
          resolve();
        }, { once: true });
      }
    });
  }
}

/**
 * Append a line of text to a container.
 * @param {HTMLElement} container
 * @param {string} text
 * @param {string} [className]
 * @returns {HTMLDivElement}
 */
export function appendLine(container, text, className) {
  const div = document.createElement('div');
  if (className) div.className = className;
  div.textContent = text;
  container.appendChild(div);
  return div;
}
