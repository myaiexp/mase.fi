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

// Steps from `current` by `direction` (+1/-1), wrapping at the ends and skipping
// any index where `isDisabledAt(idx)` is truthy, returning the first enabled
// index reached. Bounded to a single lap so an all-disabled list terminates and
// returns -1 instead of spinning forever. Shared by base-context-menu (skip
// separators/disabled items) and base-tabs (skip disabled tabs) so the
// termination guarantee lives in one tested place. Callers pass len > 0.
export function nextEnabledIndex(current, direction, len, isDisabledAt) {
  let idx = current;
  for (let step = 0; step < len; step++) {
    idx = wrapIndex(idx, direction, len);
    if (!isDisabledAt(idx)) return idx;
  }
  return -1;
}
