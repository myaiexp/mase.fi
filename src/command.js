// Command input — slash-jump, ?-help, plain-text search; global / ? g-leader shortcuts.
import { CHANNELS, chAccent, navigate } from './channels.js';
import { entriesFor } from './data.js';

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let ccIndex = 0;
let searchTerm = '';

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
      applySearch(v.trim());
    } else {
      $cmdHint.innerHTML = '';
      applySearch('');
    }
  }
}

function renderComplete(q) {
  q = q.toLowerCase();
  const matches = CHANNELS
    .map(c => ({ c, score: fuzzyScore(c.label, q) }))
    .filter(x => q === '' || x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
  if (!matches.length) { hideComplete(); return; }
  ccIndex = Math.min(ccIndex, matches.length - 1);
  $cmdCC.innerHTML = `
    <div class="cc-head">
      <span>jump to channel</span>
      <kbd>${matches.length}</kbd>
      <span style="flex:1"></span>
      <span>tab-complete</span>
    </div>
    ${matches.map((m, i) => {
      const hit = highlightFuzzy(m.c.label, q);
      const last = lastActivity(m.c.id);
      return `
        <div class="cc-item ${i === ccIndex ? 'selected' : ''}" data-ch="${m.c.id}" data-i="${i}" style="--ch-accent:${chAccent(m.c.id)}">
          <div class="cc-ch"><span class="hash">#</span>${hit}</div>
          <div class="cc-desc">${escapeHtml(m.c.topic)}</div>
          <div class="cc-last">${last}</div>
        </div>`;
    }).join('')}
  `;
  $cmdCC.hidden = false;
  $cmdCC.querySelectorAll('.cc-item').forEach(el => {
    el.addEventListener('mouseenter', () => {
      ccIndex = Number(el.dataset.i);
      $cmdCC.querySelectorAll('.cc-item').forEach((e2, i) => e2.classList.toggle('selected', i === ccIndex));
    });
    el.addEventListener('click', () => {
      chooseFromComplete();
    });
  });
  $cmdCC._matches = matches;
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
}

function hideComplete() { $cmdCC.hidden = true; $cmdCC.innerHTML = ''; }

function chooseFromComplete() {
  const m = ($cmdCC._matches || [])[ccIndex];
  if (!m) return;
  $cmdInput.value = '';
  updateMode();
  navigate(m.c.id);
  $cmdInput.blur();
}

function fuzzyScore(str, q) {
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

function highlightFuzzy(str, q) {
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
  const d = es[es.length - 1].date;
  const now = new Date();
  const iso = d.includes('T') ? d : d + 'T00:00';
  const t = new Date(iso.endsWith('Z') ? iso : iso + 'Z');
  const mins = Math.max(0, Math.round((now - t) / 60000));
  if (mins < 60) return mins + 'm';
  if (mins < 1440) return Math.round(mins / 60) + 'h';
  return Math.round(mins / 1440) + 'd';
}

function applySearch(q) {
  searchTerm = q.toLowerCase();
  $feed.querySelectorAll('.feed-row').forEach(row => {
    const msg = row.querySelector('.msg');
    if (!msg) return; // defensive: skip rows without .msg
    const raw = msg.dataset.raw || (msg.dataset.raw = msg.textContent);
    if (!q) {
      msg.innerHTML = msg.dataset.html || escapeHtml(raw);
      row.classList.remove('search-dim');
      return;
    }
    if (!msg.dataset.html) msg.dataset.html = msg.innerHTML;
    const lc = raw.toLowerCase();
    if (lc.includes(searchTerm)) {
      const parts = [];
      let i = 0;
      while (i < raw.length) {
        const hit = lc.indexOf(searchTerm, i);
        if (hit < 0) { parts.push(escapeHtml(raw.slice(i))); break; }
        parts.push(escapeHtml(raw.slice(i, hit)));
        parts.push(`<mark>${escapeHtml(raw.slice(hit, hit + searchTerm.length))}</mark>`);
        i = hit + searchTerm.length;
      }
      msg.innerHTML = parts.join('');
      row.classList.remove('search-dim');
    } else {
      msg.innerHTML = msg.dataset.html;
      row.classList.add('search-dim');
    }
  });
  // Inject dim style once
  if (!document.getElementById('search-dim-style')) {
    const s = document.createElement('style');
    s.id = 'search-dim-style';
    s.textContent = '.feed-row.search-dim { opacity: 0.28; }';
    document.head.appendChild(s);
  }
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

  $cmdInput.addEventListener('input', updateMode);
  $cmdInput.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      $cmdInput.value = '';
      updateMode();
      $cmdInput.blur();
      return;
    }
    if (!$cmdCC.hidden && ($cmdCC._matches || []).length) {
      const n = $cmdCC._matches.length;
      if (e.key === 'ArrowDown') { e.preventDefault(); ccIndex = (ccIndex + 1) % n; updateMode(); return; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); ccIndex = (ccIndex - 1 + n) % n; updateMode(); return; }
      if (e.key === 'Tab')       { e.preventDefault(); const m = $cmdCC._matches[ccIndex]; $cmdInput.value = '/' + m.c.label; updateMode(); return; }
      if (e.key === 'Enter')     { e.preventDefault(); chooseFromComplete(); return; }
    }
  });

  // Global: "/" to focus, "?" for help, "g h" / "g a" quick jumps
  let leader = null;
  addEventListener('keydown', e => {
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
