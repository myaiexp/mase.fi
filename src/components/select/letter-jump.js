// Single-letter typeahead for <base-select> — cycle matches, idle-reset

// Native <select> drops its typeahead buffer after about a second of inactivity.
// Repeat the same letter inside the window to cycle; after the gap, the first
// match is reachable again. close() also resets so a fresh open starts clean.
export const TYPEAHEAD_TIMEOUT_MS = 1000;

export function createLetterJump(timeoutMs = TYPEAHEAD_TIMEOUT_MS) {
  let lastKey = '';
  let cycleIdx = -1;
  let lastAt = 0;

  function reset() {
    lastKey = '';
    cycleIdx = -1;
    lastAt = 0;
  }

  // Returns the highlight index into `opts`, or -1 when nothing matches.
  // `now` is injectable so tests can drive the idle window without fake timers.
  function jump(letter, opts, now = Date.now()) {
    const lower = letter.toLowerCase();
    const matches = [];
    for (let i = 0; i < opts.length; i++) {
      if (opts[i].textContent.toLowerCase().startsWith(lower)) matches.push(i);
    }
    if (!matches.length) return -1;

    const stale = now - lastAt >= timeoutMs;
    let highlightIdx;
    if (!stale && lastKey === lower && cycleIdx >= 0) {
      const nextIdx = (cycleIdx + 1) % matches.length;
      highlightIdx = matches[nextIdx];
      cycleIdx = nextIdx;
    } else {
      highlightIdx = matches[0];
      lastKey = lower;
      cycleIdx = 0;
    }
    lastAt = now;
    return highlightIdx;
  }

  return { jump, reset };
}
