// Entry-date parse/normalize and UTC-day bucketing for the feed

/**
 * Parse an entry date into a Date. Entry dates are wall-clock Finnish-server
 * strings with no zone marker, so the 'Z' makes the parse explicitly UTC rather
 * than viewer-local — otherwise the same entry would land on a different day
 * depending on who's reading. The input is normalizeDate's output shape
 * ("YYYY-MM-DDTHH:MM", no zone suffix); keep the two in step if that changes.
 */
export function parseEntryDate(d) {
  return new Date(d + 'Z');
}

/** Normalize a date string to "YYYY-MM-DDTHH:MM" form used by the UI. */
export function normalizeDate(s) {
  if (!s || typeof s !== 'string') return '1970-01-01T00:00';
  // Already has time component
  if (/T\d{2}:\d{2}/.test(s)) return s.slice(0, 16);
  // Bare YYYY-MM-DD → append T00:00
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s + 'T00:00';
  // Anything else is malformed: don't let unbounded/garbage strings reach e.date
  // (downstream renderers slice and inject it into innerHTML). Bound to the epoch
  // fallback so the function always returns a known, ASCII-only date string.
  return '1970-01-01T00:00';
}

/**
 * UTC-midnight instant (ms) of a Date's UTC calendar day. Anchors day-bucketing
 * to the same UTC day the feed's separators use (parseEntryDate → UTC), and makes
 * day differences exact and DST-immune — every UTC day is exactly 86400000 ms.
 */
export function utcDayStart(d) {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}
