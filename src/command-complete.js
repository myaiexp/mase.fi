// Autocomplete popup for "/" channel + slash-command matches (cc-* rows).
// Registry leaf — not channels.js (the hash-routing orchestrator). Same rule
// as sidebar.js: renderers that only need getChannels/chAccent import registry
// directly so they don't pull feed/pinned/sidebar/transition as a back-edge.
import { getChannels, chAccent } from './registry.js';
import { escapeHtml } from './html.js';
import { fuzzyScore, highlightFuzzy } from './command-fuzzy.js';
import { optionAttrs, markListbox, setActive, collapseCombobox } from './command-aria.js';

/**
 * Build the autocomplete controller. DOM refs are bound later via `bind()`;
 * relative-activity label + choose callback + command list are injected so this
 * module stays free of command.js's search/data/init state (no import cycle).
 *
 * @param {{
 *   getCommands: () => Array<{name: string, desc: string, run: Function}>,
 *   formatRelativeActivity: (id: string) => string,
 *   onChoose: (match: object) => void,
 * }} deps
 */
export function createAutocomplete({
  getCommands,
  formatRelativeActivity,
  onChoose,
}) {
  // `idx` = highlighted row; `matches` = current channel+command list.
  const selection = { idx: 0, matches: [] };
  let $input = null;
  let $popup = null;

  function bind(input, popup) {
    $input = input;
    $popup = popup;
  }

  function hide() {
    // Drop leftover matches so isOpen() is false once this node is no longer a
    // listbox. Help mode reuses #cmd-complete; Enter/Tab must not choose a
    // stale channel from the previous "/…" query (or from a hide that only
    // collapsed the popup).
    selection.matches = [];
    selection.idx = 0;
    $popup.hidden = true;
    $popup.replaceChildren();
    collapseCombobox($input, $popup);
  }

  function setSelection(idx) {
    selection.idx = idx;
    $popup.querySelectorAll('.cc-item').forEach((el, i) => el.classList.toggle('selected', i === idx));
    setActive($input, $popup, idx);
  }

  // Arrow-key selection: wrap `delta` around the match list, then move the
  // highlight cheaply via setSelection instead of re-rendering.
  function moveSelection(delta) {
    const n = selection.matches.length;
    if (!n) return;
    setSelection((selection.idx + delta + n) % n);
  }

  function renderItem(m, i, q) {
    const sel = i === selection.idx ? 'selected' : '';
    const hit = highlightFuzzy(m.label, q);
    if (m.kind === 'cmd') {
      return `
      <div class="cc-item is-cmd ${sel}" data-i="${i}" ${optionAttrs(i, i === selection.idx)}>
        <div class="cc-ch"><span class="slash">/</span>${hit}</div>
        <div class="cc-desc">${escapeHtml(m.desc)}</div>
        <div class="cc-last">cmd</div>
      </div>`;
    }
    return `
    <div class="cc-item ${sel}" data-ch="${escapeHtml(m.id)}" data-i="${i}" ${optionAttrs(i, i === selection.idx)} style="--ch-accent:${chAccent(m.id)}">
      <div class="cc-ch"><span class="hash">#</span>${hit}</div>
      <div class="cc-desc">${escapeHtml(m.topic)}</div>
      <div class="cc-last">${formatRelativeActivity(m.id)}</div>
    </div>`;
  }

  function render(q) {
    q = q.toLowerCase();
    const chMatches = getChannels()
      .map(c => ({ kind: 'channel', id: c.id, label: c.label, topic: c.topic, score: fuzzyScore(c.label, q) }))
      .filter(x => q === '' || x.score > 0);
    // Commands stay hidden on a bare "/" — easter eggs, surfaced only on a
    // genuine name *prefix*. Prefix (not fuzzy subsequence): "/o" must not
    // dredge up /whoami. The +10 prefix bonus keeps them ranked sensibly.
    const cmdMatches = q === ''
      ? []
      : getCommands()
        .filter(cmd => cmd.name.startsWith(q))
        .map(cmd => ({ kind: 'cmd', cmd, label: cmd.name, desc: cmd.desc, score: fuzzyScore(cmd.name, q) }));
    const matches = [...chMatches, ...cmdMatches]
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
    if (!matches.length) { hide(); return; }
    selection.matches = matches;
    selection.idx = Math.min(selection.idx, matches.length - 1);
    $popup.innerHTML = `
    <div class="cc-head" aria-hidden="true">
      <span>jump to channel</span>
      <kbd>${matches.length}</kbd>
      <span style="flex:1"></span>
      <span>tab-complete</span>
    </div>
    ${matches.map((m, i) => renderItem(m, i, q)).join('')}
  `;
    $popup.hidden = false;
    $popup.querySelectorAll('.cc-item').forEach(el => {
      el.addEventListener('mouseenter', () => setSelection(Number(el.dataset.i)));
      el.addEventListener('click', () => choose());
    });
    markListbox($input, $popup, selection.idx);
  }

  function choose() {
    const m = selection.matches[selection.idx];
    if (m) onChoose(m);
  }

  function selected() {
    return selection.matches[selection.idx] ?? null;
  }

  function isOpen() {
    return Boolean($popup && !$popup.hidden && selection.matches.length);
  }

  return {
    bind,
    render,
    hide,
    setSelection,
    moveSelection,
    choose,
    selected,
    isOpen,
    get matches() { return selection.matches; },
  };
}
