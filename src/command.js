// Command input — slash-jump, ?-help, plain-text search; global / ? g-leader shortcuts.
import { navigate } from './channels.js';
import { entriesFor, parseEntryDate } from './data.js';
import { escapeHtml } from './html.js';
import { buildCommands } from './slash-commands.js';
import { applySearch } from './command-search.js';
import { markHelp } from './command-aria.js';
import { createAutocomplete } from './command-complete.js';

let searchTerm = '';
let _commands = [];
let ac = null; // autocomplete controller — created in initCommand

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
    ac.render(v.slice(1));
    $cmdHint.innerHTML = `<kbd>↑↓</kbd> pick <kbd>↵</kbd> jump <kbd>esc</kbd> cancel`;
  } else if (v.startsWith('?')) {
    $cmd.classList.add('mode-help');
    $cmdPrompt.textContent = '?';
    renderHelp();
    $cmdHint.innerHTML = '';
  } else {
    $cmdPrompt.textContent = '>';
    ac.hide();
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

function onChooseMatch(m) {
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

  ac = createAutocomplete({
    getCommands: () => _commands,
    fuzzyScore,
    highlightFuzzy,
    lastActivity,
    onChoose: onChooseMatch,
  });
  ac.bind($cmdInput, $cmdComplete);

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
    if (ac.isOpen()) {
      // Arrow keys only move the highlight — moveSelection toggles classes + ARIA
      // without rebuilding the popup. Tab rewrites the input (a genuine mode change),
      // so it still re-renders via updateMode.
      if (e.key === 'ArrowDown') { e.preventDefault(); ac.moveSelection(1); return; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); ac.moveSelection(-1); return; }
      if (e.key === 'Tab')       { e.preventDefault(); const m = ac.selected(); $cmdInput.value = '/' + m.label; updateMode(); return; }
      if (e.key === 'Enter')     { e.preventDefault(); ac.choose(); return; }
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
