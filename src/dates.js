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

const EPOCH = '1970-01-01T00:00';

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** UTC calendar stamp matching normalizeDate's output shape. */
function utcMinuteStamp(d) {
  return `${String(d.getUTCFullYear()).padStart(4, '0')}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}T${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
}

/**
 * Normalize a date string to "YYYY-MM-DDTHH:MM". Always returns that shape so
 * parseEntryDate(d + 'Z') is a real Date — feed dayLabel calls toISOString()
 * on it, which throws on Invalid Date. The timestamp branch is start-anchored
 * and round-tripped: a Tdd:dd buried in junk, or a calendar that isn't a real
 * UTC instant (month 13, Feb 31), must not escape as a "date".
 */
export function normalizeDate(s) {
  if (typeof s !== 'string') return EPOCH;
  s = s.trim();
  if (!s) return EPOCH;
  let candidate;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) {
    candidate = s.slice(0, 16);
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    candidate = s + 'T00:00';
  } else {
    return EPOCH;
  }
  const parsed = new Date(candidate + 'Z');
  if (Number.isNaN(parsed.getTime())) return EPOCH;
  return utcMinuteStamp(parsed) === candidate ? candidate : EPOCH;
}

/**
 * UTC-midnight instant (ms) of a Date's UTC calendar day. Anchors day-bucketing
 * to the same UTC day the feed's separators use (parseEntryDate → UTC), and makes
 * day differences exact and DST-immune — every UTC day is exactly 86400000 ms.
 */
export function utcDayStart(d) {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}
