// Sole writer of the #cmd-complete popup: "/" channel + slash-command matches and
// "?" help. "cc" = command-complete, the popup's CSS/ARIA row vocabulary (cc-*).
// Registry leaf — not channels.js (the hash-routing orchestrator). Same rule
// as sidebar.js: renderers that only need getChannels/chAccent import registry
// directly so they don't pull feed/pinned/sidebar/transition as a back-edge.
import { getChannels, chAccent } from './registry.js';
import { escapeHtml } from './html.js';
import { fuzzyScore, highlightFuzzy } from './command-fuzzy.js';
import { optionAttrs, markListbox, markHelp, setActive, collapseCombobox } from './command-aria.js';

/** @typedef {{name: string, desc: string, run: () => string | string[] | null | undefined}} Command */
/** @typedef {{kind: 'channel', id: string, label: string, name: string, topic: string, score: number}} ChannelMatch */
/** @typedef {{kind: 'cmd', cmd: Command, label: string, desc: string, score: number}} CmdMatch */
/** @typedef {ChannelMatch | CmdMatch} Match */

const HELP_HTML = `
    <div class="cc-head"><span>help</span></div>
    <div class="cc-item"><div class="cc-ch">/&lt;chan&gt;</div><div class="cc-desc">jump to a channel (fuzzy)</div><div class="cc-last">↵</div></div>
    <div class="cc-item"><div class="cc-ch">text</div><div class="cc-desc">highlight matching lines in this channel</div><div class="cc-last">esc</div></div>
    <div class="cc-item"><div class="cc-ch">?</div><div class="cc-desc">show this help</div><div class="cc-last"></div></div>
    <div class="cc-item"><div class="cc-ch">g-h / g-a</div><div class="cc-desc">go home · go activity</div><div class="cc-last">2 keys</div></div>
  `;

/**
 * Build the autocomplete controller. DOM refs are bound later via `bind()`;
 * relative-activity label + choose callback + command list are injected so this
 * module stays free of command.js's search/data/init state (no import cycle).
 *
 * @param {{
 *   getCommands: () => Command[],
 *   formatRelativeActivity: (id: string) => string,
 *   onChoose: (match: Match) => void,
 * }} deps
 */
export function createAutocomplete({
  getCommands,
  formatRelativeActivity,
  onChoose,
}) {
  // `idx` = highlighted row; `matches` = current channel+command list.
  /** @type {{idx: number, matches: Match[]}} */
  const selection = { idx: 0, matches: [] };
  // Query the current list was ranked for. A new query re-ranks the rows, so
  // the highlight returns to the top match instead of keeping a stale slot.
  /** @type {string | null} */
  let lastQ = null;
  /** @type {HTMLInputElement} */
  let $input;
  /** @type {HTMLElement} */
  let $popup;

  /**
   * @param {HTMLInputElement} input
   * @param {HTMLElement} popup
   */
  function bind(input, popup) {
    $input = input;
    $popup = popup;
  }

  function clearMatches() {
    selection.matches = [];
    selection.idx = 0;
    lastQ = null;
  }

  function hide() {
    clearMatches();
    $popup.hidden = true;
    $popup.replaceChildren();
    collapseCombobox($input, $popup);
  }

  function showHelp() {
    clearMatches();
    $popup.innerHTML = HELP_HTML;
    $popup.hidden = false;
    markHelp($input, $popup);
  }

  /** @param {number} idx */
  function setSelection(idx) {
    selection.idx = idx;
    $popup.querySelectorAll('.cc-item').forEach((el, i) => el.classList.toggle('selected', i === idx));
    setActive($input, $popup, idx);
  }

  // Arrow-key selection: wrap `delta` around the match list, then move the
  // highlight cheaply via setSelection instead of re-rendering.
  /** @param {number} delta */
  function moveSelection(delta) {
    const n = selection.matches.length;
    if (!n) return;
    setSelection((selection.idx + delta + n) % n);
  }

  /**
   * @param {Match} m
   * @param {number} i
   * @param {string} q
   */
  function renderItem(m, i, q) {
    const sel = i === selection.idx ? 'selected' : '';
    if (m.kind === 'cmd') {
      const hit = highlightFuzzy(m.label, q);
      return `
      <div class="cc-item is-cmd ${sel}" data-i="${i}" ${optionAttrs(i, i === selection.idx)}>
        <div class="cc-ch"><span class="slash">/</span>${hit}</div>
        <div class="cc-desc">${escapeHtml(m.desc)}</div>
        <div class="cc-last">cmd</div>
      </div>`;
    }
    // A heading that differs from the id shows the id too: it is what the
    // hash and "/" accept, and it explains a match the name alone doesn't.
    const idHtml = m.name === m.label ? '' : ` <span class="cc-id">${highlightFuzzy(m.label, q)}</span>`;
    return `
    <div class="cc-item ${sel}" data-ch="${escapeHtml(m.id)}" data-i="${i}" ${optionAttrs(i, i === selection.idx)} style="--ch-accent:${chAccent(m.id)}">
      <div class="cc-ch"><span class="hash">#</span>${highlightFuzzy(m.name, q)}${idHtml}</div>
      <div class="cc-desc">${escapeHtml(m.topic)}</div>
      <div class="cc-last">${formatRelativeActivity(m.id)}</div>
    </div>`;
  }

  /** @param {string} q */
  function render(q) {
    q = q.toLowerCase();
    const chMatches = getChannels()
      // Scored by the visible name and the id, so "/diet-app" and "/ruoka" both
      // reach a channel headed Ruoka.
      .map(c => ({
        kind: /** @type {const} */ ('channel'), id: c.id, label: c.label, name: c.name, topic: c.topic,
        score: Math.max(fuzzyScore(c.name, q), fuzzyScore(c.label, q)),
      }))
      .filter(x => q === '' || x.score > 0);
    // Commands stay hidden on a bare "/" — easter eggs, surfaced only on a
    // genuine name *prefix*. Prefix (not fuzzy subsequence): "/o" must not
    // dredge up /whoami. The +10 prefix bonus keeps them ranked sensibly.
    const cmdMatches = q === ''
      ? []
      : getCommands()
        .filter(cmd => cmd.name.startsWith(q))
        .map(cmd => ({ kind: /** @type {const} */ ('cmd'), cmd, label: cmd.name, desc: cmd.desc, score: fuzzyScore(cmd.name, q) }));
    const matches = [...chMatches, ...cmdMatches]
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
    if (!matches.length) { hide(); return; }
    selection.matches = matches;
    selection.idx = q === lastQ ? Math.min(selection.idx, matches.length - 1) : 0;
    lastQ = q;
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
    $popup.querySelectorAll('.cc-item').forEach(item => {
      const el = /** @type {HTMLElement} */ (item);
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
    return selection.matches.length > 0;
  }

  return {
    bind,
    render,
    hide,
    showHelp,
    setSelection,
    moveSelection,
    choose,
    selected,
    isOpen,
    get matches() { return selection.matches; },
  };
}
