// Feed search highlighting — dim non-matching rows, wrap matched substrings in <mark>.

// Walk text nodes inside an element and wrap substring matches with <mark>.
// Operates per text node so we never touch element boundaries (pretext line
// spans, .proj-pill). Cross-line matches simply won't highlight — both
// pretext and word search break at word boundaries, so this is rare.
/**
 * @param {Element} root
 * @param {string} needle
 */
function highlightTextNodes(root, needle) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  /** @type {Node[]} */
  const targets = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (/** @type {string} */ (n.nodeValue).toLowerCase().includes(needle)) targets.push(n);
  }
  for (const node of targets) {
    const text = /** @type {string} */ (node.nodeValue);
    const lc = text.toLowerCase();
    const frag = document.createDocumentFragment();
    let i = 0;
    while (i < text.length) {
      const hit = lc.indexOf(needle, i);
      if (hit < 0) { frag.appendChild(document.createTextNode(text.slice(i))); break; }
      if (hit > i) frag.appendChild(document.createTextNode(text.slice(i, hit)));
      const m = document.createElement('mark');
      m.textContent = text.slice(hit, hit + needle.length);
      frag.appendChild(m);
      i = hit + needle.length;
    }
    /** @type {ParentNode} */ (node.parentNode).replaceChild(frag, node);
  }
}

// Remove any <mark> wrappers and merge their text back into adjacent nodes.
/** @param {Element} root */
function clearMarks(root) {
  const marks = root.querySelectorAll('mark');
  for (const m of marks) {
    const text = document.createTextNode(m.textContent);
    /** @type {ParentNode} */ (m.parentNode).replaceChild(text, m);
  }
  // Normalize merges adjacent text nodes so future searches see one node per run.
  root.normalize();
}

/** Highlight `needle` (already lowercased) across the feed's rows; dim non-matches.
 *  Empty needle clears all marks and un-dims every row. Returns how many rows
 *  contained the needle, 0 when the needle is empty.
 *  @param {Element} feedEl
 *  @param {string} needle
 *  @returns {number}
 */
export function applySearch(feedEl, needle) {
  let matches = 0;
  feedEl.querySelectorAll('.feed-row').forEach(el => {
    const row = /** @type {HTMLElement} */ (el);
    const msg = row.querySelector('.msg');
    if (!msg) return;
    clearMarks(msg);
    if (!needle) {
      row.classList.remove('search-dim');
      return;
    }
    const raw = (row.dataset.raw || '').toLowerCase();
    if (raw.includes(needle)) {
      matches += 1;
      highlightTextNodes(msg, needle);
      row.classList.remove('search-dim');
    } else {
      row.classList.add('search-dim');
    }
  });
  return matches;
}
