// Command input — slash-jump, ?-help, plain-text search; global / ? g-leader shortcuts.
import { getChannels, chAccent, navigate } from './channels.js';
import { entriesFor, parseEntryDate } from './data.js';
import { escapeHtml } from './html.js';
import { buildCommands } from './commands.js';
import { applySearch } from './command-search.js';
import { optionAttrs, markListbox, setActive, markHelp, collapseCombobox } from './command-aria.js';

let ccIndex = 0;
let searchTerm = '';
let _commands = [];
// Current autocomplete match list, shared between renderComplete (writer) and
// chooseFromComplete + the keydown handler (readers). Module-level, not an
// expando on the popup element, so the data lifecycle is explicit.
let currentMatches = [];

// Run a feed search and remember the term so feed:relayout can re-apply it.
function search(term) {
  searchTerm = term.toLowerCase();
  applySearch($feed, searchTerm);
}

// DOM refs — resolved lazily at init time
let $cmd, $cmdInput, $cmdPrompt, $cmdHint, $cmdCC, $feed;

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
  ccIndex = Math.min(ccIndex, matches.length - 1);
  $cmdCC.innerHTML = `
    <div class="cc-head" aria-hidden="true">
      <span>jump to channel</span>
      <kbd>${matches.length}</kbd>
      <span style="flex:1"></span>
      <span>tab-complete</span>
    </div>
    ${matches.map((m, i) => renderCompleteItem(m, i, q)).join('')}
  `;
  $cmdCC.hidden = false;
  $cmdCC.querySelectorAll('.cc-item').forEach(el => {
    el.addEventListener('mouseenter', () => {
      ccIndex = Number(el.dataset.i);
      $cmdCC.querySelectorAll('.cc-item').forEach((e2, i) => e2.classList.toggle('selected', i === ccIndex));
      setActive($cmdInput, $cmdCC, ccIndex);
    });
    el.addEventListener('click', () => {
      chooseFromComplete();
    });
  });
  currentMatches = matches;
  markListbox($cmdInput, $cmdCC, ccIndex);
}

// Render one autocomplete row — a channel (#label, topic, recency) or a
// slash-command (/name, description, "cmd" tag). All interpolated text is
// escaped (highlightFuzzy escapes; escapeHtml on desc/topic; ids are slugs).
function renderCompleteItem(m, i, q) {
  const sel = i === ccIndex ? 'selected' : '';
  const hit = highlightFuzzy(m.label, q);
  if (m.kind === 'cmd') {
    return `
      <div class="cc-item is-cmd ${sel}" data-i="${i}" ${optionAttrs(i, i === ccIndex)}>
        <div class="cc-ch"><span class="slash">/</span>${hit}</div>
        <div class="cc-desc">${escapeHtml(m.desc)}</div>
        <div class="cc-last">cmd</div>
      </div>`;
  }
  return `
    <div class="cc-item ${sel}" data-ch="${m.id}" data-i="${i}" ${optionAttrs(i, i === ccIndex)} style="--ch-accent:${chAccent(m.id)}">
      <div class="cc-ch"><span class="hash">#</span>${hit}</div>
      <div class="cc-desc">${escapeHtml(m.topic)}</div>
      <div class="cc-last">${lastActivity(m.id)}</div>
    </div>`;
}

function renderHelp() {
  $cmdCC.innerHTML = `
    <div class="cc-head"><span>help</span></div>
    <div class="cc-item"><div class="cc-ch">/&lt;chan&gt;</div><div class="cc-desc">jump to a channel (fuzzy)</div><div class="cc-last">↵</div></div>
    <div class="cc-item"><div class="cc-ch">text</div><div class="cc-desc">highlight matching lines in this channel</div><div class="cc-last">esc</div></div>
    <div class="cc-item"><div class="cc-ch">?</div><div class="cc-desc">show this help</div><div class="cc-last"></div></div>
    <div class="cc-item"><div class="cc-ch">g-h / g-a</div><div class="cc-desc">go home · go activity</div><div class="cc-last">2 keys</div></div>
  `;
  $cmdCC.hidden = false;
  markHelp($cmdInput, $cmdCC);
}

function hideComplete() {
  $cmdCC.hidden = true;
  $cmdCC.replaceChildren();
  collapseCombobox($cmdInput, $cmdCC);
}

function chooseFromComplete() {
  const m = currentMatches[ccIndex];
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
  $cmdCC     = document.getElementById('cmd-complete');
  $feed      = document.getElementById('feed');

  // Build the slash-command registry, wiring the side-effect hooks commands
  // need (search reset + notice teardown) without commands.js touching the DOM.
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
    if (!$cmdCC.hidden && currentMatches.length) {
      const n = currentMatches.length;
      if (e.key === 'ArrowDown') { e.preventDefault(); ccIndex = (ccIndex + 1) % n; updateMode(); return; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); ccIndex = (ccIndex - 1 + n) % n; updateMode(); return; }
      if (e.key === 'Tab')       { e.preventDefault(); const m = currentMatches[ccIndex]; $cmdInput.value = '/' + m.label; updateMode(); return; }
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
