// The IRC-style "-!-" notice line slash commands and load failures print
//
// Not a .feed-row, so relayoutAll and search (both query .feed-row) skip it,
// and the next channel render wipes it. textContent only — no injection.

/**
 * One notice line: `-!- <text>`, classed `className` ('sys-notice' for command output).
 * @param {string} text
 * @param {string} [className]
 * @returns {HTMLDivElement}
 */
export function noticeLine(text, className = 'sys-notice') {
  const el = document.createElement('div');
  el.className = className;
  const pre = document.createElement('span');
  pre.className = 'sys-prefix';
  pre.textContent = '-!-';
  const body = document.createElement('span');
  body.className = 'sys-body';
  body.textContent = text;
  el.append(pre, body);
  return el;
}
