/** Format "YYYY-MM-DD" → "DD.MM.YYYY" (Finnish date format) */
export function formatDate(isoDate) {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-');
  return `${d}.${m}.${y}`;
}
