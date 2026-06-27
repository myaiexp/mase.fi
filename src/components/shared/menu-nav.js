// Wrap a highlight index by ±1 within [0, len) for keyboard menu navigation

// Steps `idx` by `direction` (+1/-1) and wraps around the ends of a list of
// `len` items. Shared by base-select and base-context-menu so the off-by-one
// edge handling lives in one tested place. Callers guarantee len > 0; an
// initial idx of -1 (nothing highlighted) lands on the first/last item.
export function wrapIndex(idx, direction, len) {
  let next = idx + direction;
  if (next < 0) next = len - 1;
  if (next >= len) next = 0;
  return next;
}
