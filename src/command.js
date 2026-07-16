// Command input — slash-jump, ?-help, plain-text search; global / ? g-leader shortcuts.
import { getChannels, chAccent, navigate } from './channels.js';
import { entriesFor, parseEntryDate } from './data.js';
import { escapeHtml } from './html.js';
import { buildCommands } from './slash-commands.js';
import { applySearch } from './command-search.js';
import { optionAttrs, markListbox, setActive, markHelp, collapseCombobox } from './command-aria.js';

// Autocomplete popup selection state in one object, shared by every writer
// (renderComplete, setSelection, the keydown handler) instead of scattered
// globals. `idx` = highlighted row (into `matches`); `matches` = current
// channel+command match list. On a module object, not a popup-element expando,
// so the lifecycle stays explicit.
const complete = { idx: 0, matches: [] };
let searchTerm = '';
let _commands = [];

// Run a feed search and remember the term so feed:relayout can re-apply it.
function search(term) {
  searchTerm = term.toLowerCase();
  applySearch($feed, searchTerm);
}

// DOM refs — resolved lazily at init time. $cmdComplete is the #cmd-complete
// popup; its rows use the cc- ("command-complete") CSS/ARIA vocabulary.
let $cmd, $cmdInput, $cmdPrompt, $cmdHint, $cmdComplete, $feed;

function updateMode() {
  const v = $cmdInput.value;
  $cmd.classList.remove('mode-slash', 'mode-search', 'mode-help');
  if (v.startsWith('/')) {
    $cmd.classList.add('mode-slash');
    $cmdPrompt.textContent = '/';
    renderComplete(v.slice(1));
    $cmdHint.innerHTML = `<kbd>↑↓</kbd> pick <kbd>↵</kbd> jump <kbd>esc</kbd> cancel`;
  } else if (v.startsWith('?')) {
    $cmd.classList.add('mode-help');
    $cmdPrompt.textContent = '?';
    renderHelp();
    $cmdHint.innerHTML = '';
  } else {
    $cmdPrompt.textContent = '>';
    hideComplete();
    if (v.trim()) {
      $cmd.classList.add('mode-search');
      $cmdHint.innerHTML = `<kbd>esc</kbd> clear`;
      search(v.trim());
    } else {
      $cmdHint.innerHTML = '';
      search('');
    }
  }
}

function renderComplete(q) {
  q = q.toLowerCase();
  const chMatches = getChannels()
    .map(c => ({ kind: 'channel', id: c.id, label: c.label, topic: c.topic, score: fuzzyScore(c.label, q) }))
    .filter(x => q === '' || x.score > 0);
  // Commands stay hidden on a bare "/" — they're easter eggs, surfaced only
  // once the visitor types a genuine name *prefix* (or discovers them via /help
  // and ?). Prefix, not fuzzy subsequence: otherwise "/o" (a channel hunt) would
  // dredge up /whoami. The +10 prefix bonus keeps them ranked sensibly.
  const cmdMatches = q === ''
    ? []
    : _commands
      .filter(cmd => cmd.name.startsWith(q))
      .map(cmd => ({ kind: 'cmd', cmd, label: cmd.name, desc: cmd.desc, score: fuzzyScore(cmd.name, q) }));
  const matches = [...chMatches, ...cmdMatches]
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
  if (!matches.length) { hideComplete(); return; }
  complete.matches = matches;
  complete.idx = Math.min(complete.idx, matches.length - 1);
  $cmdComplete.innerHTML = `
    <div class="cc-head" aria-hidden="true">
      <span>jump to channel</span>
      <kbd>${matches.length}</kbd>
      <span style="flex:1"></span>
      <span>tab-complete</span>
    </div>
    ${matches.map((m, i) => renderCompleteItem(m, i, q)).join('')}
  `;
  $cmdComplete.hidden = false;
  $cmdComplete.querySelectorAll('.cc-item').forEach(el => {
    el.addEventListener('mouseenter', () => setSelection(Number(el.dataset.i)));
    el.addEventListener('click', () => {
      chooseFromComplete();
    });
  });
  markListbox($cmdInput, $cmdComplete, complete.idx);
}

// Move the highlighted row to an absolute `idx` (already in range) without
// rebuilding the popup: toggle the .selected class and sync ARIA. This is the
// "move selection" path — a keypress (via moveSelection) or a hover moves a
// highlight, it does NOT re-run fuzzy scoring or re-attach listeners the way
// renderComplete does.
function setSelection(idx) {
  complete.idx = idx;
  $cmdComplete.querySelectorAll('.cc-item').forEach((el, i) => el.classList.toggle('selected', i === idx));
  setActive($cmdInput, $cmdComplete, idx);
}

// Arrow-key selection: wrap `delta` around the current match list, then move the
// highlight cheaply via setSelection instead of re-entering updateMode.
function moveSelection(delta) {
  const n = complete.matches.length;
  if (!n) return;
  setSelection((complete.idx + delta + n) % n);
}

// Render one autocomplete row — a channel (#label, topic, recency) or a
// slash-command (/name, description, "cmd" tag). All interpolated text is
// escaped (highlightFuzzy escapes; escapeHtml on desc/topic; ids are slugs).
function renderCompleteItem(m, i, q) {
  const sel = i === complete.idx ? 'selected' : '';
  const hit = highlightFuzzy(m.label, q);
  if (m.kind === 'cmd') {
    return `
      <div class="cc-item is-cmd ${sel}" data-i="${i}" ${optionAttrs(i, i === complete.idx)}>
        <div class="cc-ch"><span class="slash">/</span>${hit}</div>
        <div class="cc-desc">${escapeHtml(m.desc)}</div>
        <div class="cc-last">cmd</div>
      </div>`;
  }
  return `
    <div class="cc-item ${sel}" data-ch="${m.id}" data-i="${i}" ${optionAttrs(i, i === complete.idx)} style="--ch-accent:${chAccent(m.id)}">
      <div class="cc-ch"><span class="hash">#</span>${hit}</div>
      <div class="cc-desc">${escapeHtml(m.topic)}</div>
      <div class="cc-last">${lastActivity(m.id)}</div>
    </div>`;
}

function renderHelp() {
  $cmdComplete.innerHTML = `
    <div class="cc-head"><span>help</span></div>
    <div class="cc-item"><div class="cc-ch">/&lt;chan&gt;</div><div class="cc-desc">jump to a channel (fuzzy)</div><div class="cc-last">↵</div></div>
    <div class="cc-item"><div class="cc-ch">text</div><div class="cc-desc">highlight matching lines in this channel</div><div class="cc-last">esc</div></div>
    <div class="cc-item"><div class="cc-ch">?</div><div class="cc-desc">show this help</div><div class="cc-last"></div></div>
    <div class="cc-item"><div class="cc-ch">g-h / g-a</div><div class="cc-desc">go home · go activity</div><div class="cc-last">2 keys</div></div>
  `;
  $cmdComplete.hidden = false;
  markHelp($cmdInput, $cmdComplete);
}

function hideComplete() {
  $cmdComplete.hidden = true;
  $cmdComplete.replaceChildren();
  collapseCombobox($cmdInput, $cmdComplete);
}

function chooseFromComplete() {
  const m = complete.matches[complete.idx];
  if (!m) return;
  if (m.kind === 'cmd') { runCommand(m.cmd); return; }
  $cmdInput.value = '';
  updateMode();
  navigate(m.id);
  $cmdInput.blur();
}

// Append ephemeral IRC-style server-notice line(s) to the feed. Not .feed-row,
// so relayoutAll and search (both query .feed-row) skip them; the next channel
// render wipes them via replaceChildren. textContent only — no injection.
function notice(lines) {
  const arr = Array.isArray(lines) ? lines : [lines];
  for (const text of arr) {
    if (text == null) continue;
    const el = document.createElement('div');
    el.className = 'sys-notice';
    const pre = document.createElement('span');
    pre.className = 'sys-prefix';
    pre.textContent = '-!-';
    const body = document.createElement('span');
    body.className = 'sys-body';
    body.textContent = text;
    el.append(pre, body);
    $feed.appendChild(el);
  }
  $feed.scrollTop = $feed.scrollHeight;
}

function clearNotices() {
  $feed.querySelectorAll('.sys-notice').forEach(el => el.remove());
}

// Run a slash-command: print its returned line(s) as notices, then reset input.
function runCommand(cmd) {
  const out = cmd.run();
  if (out != null) notice(out);
  $cmdInput.value = '';
  updateMode();
  $cmdInput.blur();
}

export function fuzzyScore(str, q) {
  if (q === '') return 1;
  str = str.toLowerCase();
  let si = 0, score = 0, streak = 0;
  for (const c of q) {
    const idx = str.indexOf(c, si);
    if (idx < 0) return 0;
    score += (idx === si ? 2 : 1);
    streak = (idx === si ? streak + 1 : 0);
    score += streak;
    si = idx + 1;
  }
  if (str.startsWith(q)) score += 10;
  return score;
}

export function highlightFuzzy(str, q) {
  if (!q) return escapeHtml(str);
  let out = '', si = 0;
  for (const c of q.toLowerCase()) {
    const idx = str.toLowerCase().indexOf(c, si);
    if (idx < 0) return escapeHtml(str);
    out += escapeHtml(str.slice(si, idx)) + `<span class="hit">${escapeHtml(str[idx])}</span>`;
    si = idx + 1;
  }
  out += escapeHtml(str.slice(si));
  return out;
}

function lastActivity(id) {
  const es = entriesFor(id, _data);
  if (!es.length) return '—';
  const t = parseEntryDate(es[es.length - 1].date);
  const mins = Math.max(0, Math.round((new Date() - t) / 60000));
  if (mins < 60) return mins + 'm';
  if (mins < 1440) return Math.round(mins / 60) + 'h';
  return Math.round(mins / 1440) + 'd';
}

// Module-level data ref set at init time
let _data = null;

/** Wire the command input with mode switching, autocomplete popup, search, and global shortcuts. */
export function initCommand(data) {
  _data = data;

  $cmd       = document.getElementById('cmd');
  $cmdInput  = document.getElementById('cmd-input');
  $cmdPrompt = document.getElementById('cmd-prompt');
  $cmdHint   = document.getElementById('cmd-hint');
  $cmdComplete     = document.getElementById('cmd-complete');
  $feed      = document.getElementById('feed');

  // Build the slash-command registry, wiring the side-effect hooks commands
  // need (search reset + notice teardown) without slash-commands.js touching the DOM.
  _commands = buildCommands({
    data,
    clearSearch: () => { $cmdInput.value = ''; search(''); },
    clearNotices,
  });

  // Feed re-lays itself out on resize or channel switch; if a search is
  // active, the highlights are gone from the freshly-laid DOM, so re-apply.
  $feed.addEventListener('feed:relayout', () => {
    if (searchTerm) applySearch($feed, searchTerm);
  });

  $cmdInput.addEventListener('input', updateMode);
  $cmdInput.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      $cmdInput.value = '';
      updateMode();
      $cmdInput.blur();
      return;
    }
    if (!$cmdComplete.hidden && complete.matches.length) {
      // Arrow keys only move the highlight — moveSelection toggles classes + ARIA
      // without rebuilding the popup. Tab rewrites the input (a genuine mode change),
      // so it still re-renders via updateMode.
      if (e.key === 'ArrowDown') { e.preventDefault(); moveSelection(1); return; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); moveSelection(-1); return; }
      if (e.key === 'Tab')       { e.preventDefault(); const m = complete.matches[complete.idx]; $cmdInput.value = '/' + m.label; updateMode(); return; }
      if (e.key === 'Enter')     { e.preventDefault(); chooseFromComplete(); return; }
    }
  });

  // Global: "/" to focus, "?" for help, "g h" / "g a" quick jumps
  let leader = null;
  window.addEventListener('keydown', e => {
    if (e.target === $cmdInput) return;
    if (e.target.matches('input, textarea')) return;
    if (e.key === '/') {
      e.preventDefault();
      $cmdInput.value = '/';
      $cmdInput.focus();
      updateMode();
      return;
    }
    if (e.key === '?') {
      e.preventDefault();
      $cmdInput.value = '?';
      $cmdInput.focus();
      updateMode();
      return;
    }
    if (e.key === 'g') { leader = 'g'; setTimeout(() => { leader = null; }, 900); return; }
    if (leader === 'g') {
      if (e.key === 'h') navigate('home');
      else if (e.key === 'a') navigate('activity');
      leader = null;
    }
  });
}
