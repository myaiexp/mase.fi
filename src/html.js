// HTML-escaping helper for safe string interpolation into markup
const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** @param {unknown} s @returns {string} */
export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ENTITIES[/** @type {keyof typeof ENTITIES} */ (c)]);
}
