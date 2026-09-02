// DOM driver for the smart 404 page: probes the ladder, renders a state, counts down
// Pure matching logic lives in notfound.js. Served as /404.html via nginx error_page,
// so location.pathname is the path the visitor actually typed — except when the page
// is opened as /404.html itself, where ?p=/some/path previews a typed path.
import { parentPrefixes, isJunkPath, buildRoutes, fuzzyCandidates, decide, reasonFor, sameOriginPath, isSafeRedirect } from './notfound.js';

const $ = (id) => document.getElementById(id);
const prefersReducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const isPreview = () => location.pathname === '/404.html';
const PATH_CLAMP = 160;

export function effectivePath() {
  if (isPreview()) {
    const p = new URLSearchParams(location.search).get('p');
    // Preview is a typed path: leading `/` AND same-origin after WHATWG parse.
    // The slash gate rejects `p=explorer` / `p=//evil`; sameOriginPath still
    // has to catch `/\evil.com` (backslash is a slash in the relative-slash state).
    if (typeof p === 'string' && p.startsWith('/') && !p.startsWith('//')) {
      const safe = sameOriginPath(p, location.origin);
      if (safe) return safe;
    }
  }
  return location.pathname;
}

function safeHref(target) {
  return isSafeRedirect(target, location.origin) ? target : '/';
}

async function probeHead(url, ms = 1500) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { method: 'HEAD', redirect: 'follow', signal: ctl.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// Longest-first: the deepest surviving parent is the confident target.
export async function probePrefixes(path) {
  for (const prefix of parentPrefixes(path)) {
    if (!sameOriginPath(prefix, location.origin)) continue;
    const res = await probeHead(prefix);
    if (res && res.ok) return prefix;
  }
  return null;
}

async function loadRoutes() {
  try {
    const res = await fetch('/updates.json', { signal: AbortSignal.timeout(1500) });
    if (!res.ok) throw new Error(String(res.status));
    return buildRoutes(await res.json());
  } catch {
    return buildRoutes(null);
  }
}

// error_page keeps the original status but the body can't see it — re-ask nginx.
export async function applyRealStatus(path) {
  if (isPreview()) return;
  const res = await probeHead(path, 1200);
  if (res && res.status === 403) {
    document.title = 'mase.fi — forbidden';
    $('badge').textContent = 'HTTP 403';
    $('badge').classList.add('warn');
    $('dot').classList.add('warn');
    $('ghost').textContent = '403';
    $('errline').textContent = 'error: forbidden';
    document.querySelector('.big')?.classList.add('small');
  }
}

function renderTyped(path, headLen) {
  const clamped = path.length > PATH_CLAMP;
  const shown = clamped ? path.slice(0, PATH_CLAMP) : path;
  $('phead').textContent = shown.slice(0, headLen);
  $('ptail').textContent = shown.slice(headLen);
  $('pellip').hidden = !clamped;
  if (clamped) {
    const n = $('pnote');
    n.hidden = false;
    n.textContent = `path truncated · ${path.length} chars · nothing here resembles it`;
  }
}

function setHints(desktop, mobile) {
  const f = $('fhints');
  f.textContent = '';
  const mk = (cls, parts) => {
    const s = document.createElement('span');
    s.className = cls;
    for (const p of parts) {
      if (typeof p === 'string') s.append(p);
      else s.append(Object.assign(document.createElement('a'), p));
    }
    f.append(s);
  };
  mk('hint-d', desktop);
  mk('hint-m', mobile);
}

function suggestionLink(plan) {
  const a = document.createElement('a');
  a.className = 'big';
  a.href = safeHref(plan.target);
  const arr = Object.assign(document.createElement('span'), { className: 'arr', textContent: '→' });
  const u = Object.assign(document.createElement('span'), { className: 'bu', textContent: plan.targetLabel });
  a.append(arr, u);
  if (plan.targetName) {
    a.append(Object.assign(document.createElement('span'), { className: 'bname', textContent: plan.targetName }));
  }
  return a;
}

export function renderConfident(path, plan) {
  if (plan.diff) {
    renderTyped(path, plan.target.length);
    const t = $('tailnote');
    t.hidden = false;
    t.append('the tail ');
    t.append(Object.assign(document.createElement('b'), { textContent: plan.tail }));
    t.append(' matched nothing · the head resolves');
  }
  const sugg = $('sugg');
  sugg.textContent = '';
  sugg.append(Object.assign(document.createElement('div'), { className: 'label', textContent: 'did you mean' }));
  const link = suggestionLink(plan);
  sugg.append(link);
  setHints(
    ['esc or any key to stay · enter to go now · ', { href: '/', textContent: 'mase.fi' }, ' for the full directory'],
    [{ href: '/', textContent: 'mase.fi' }, ' · tap anywhere to stay'],
  );
  startCountdown(plan, link);
}

export function renderFuzzy(path, candidates) {
  const sugg = $('sugg');
  sugg.textContent = '';
  sugg.append(Object.assign(document.createElement('div'), { className: 'label', textContent: 'closest matches' }));
  const list = Object.assign(document.createElement('div'), { className: 'cands' });
  candidates.forEach((c, i) => {
    const a = document.createElement('a');
    a.className = i === 0 ? 'cand first' : 'cand';
    a.href = safeHref(c.route.href);
    a.append(Object.assign(document.createElement('span'), { className: 'croute', textContent: '→ ' + c.route.label }));
    if (c.route.name) a.append(Object.assign(document.createElement('span'), { className: 'cname', textContent: c.route.name }));
    a.append(Object.assign(document.createElement('span'), { className: 'creason', textContent: reasonFor(c) }));
    list.append(a);
  });
  sugg.append(list);
  const foot = Object.assign(document.createElement('div'), { className: 'cfoot' });
  foot.append('no auto-redirect — pick one, or ');
  foot.append(Object.assign(document.createElement('a'), { href: '/', textContent: 'browse everything' }));
  foot.append('.');
  sugg.append(foot);
  setHints(
    [`1–${candidates.length} to jump · h for home`],
    [{ href: '/', textContent: 'mase.fi' }, ' for the full directory'],
  );
  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const n = Number(e.key);
    if (n >= 1 && n <= candidates.length) location.href = safeHref(candidates[n - 1].route.href);
    else if (e.key === 'h') location.href = '/';
  });
}

export function renderNone(projectCount) {
  const sugg = $('sugg');
  sugg.textContent = '';
  const link = suggestionLink({
    target: '/',
    targetLabel: 'mase.fi',
    targetName: 'the full directory' + (projectCount ? ` — ${projectCount} active projects` : ''),
  });
  sugg.append(link);
  setHints(['enter for home'], [{ href: '/', textContent: 'mase.fi' }, ' for the full directory']);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') location.href = '/';
  });
}

export function startCountdown(plan, suggEl) {
  const box = $('countbox');
  box.hidden = false;
  const go = () => {
    if (!isSafeRedirect(plan.target, location.origin)) return;
    location.replace(plan.target);
  };
  $('gobtn').addEventListener('click', go);
  if (prefersReducedMotion()) {
    // An involuntary navigation is a motion problem too: buttons only, no timer.
    $('cnum').textContent = '—';
    for (const s of $('csegs').children) s.classList.remove('on');
    $('staybtn').addEventListener('click', () => { box.hidden = true; });
    return;
  }
  const drain = $('drain');
  drain.hidden = false;
  let count = 5;
  let iv;
  const cancel = () => {
    clearInterval(iv);
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('click', onAny);
    document.removeEventListener('wheel', onAny);
    document.removeEventListener('touchstart', onAny);
    drain.hidden = true;
    box.hidden = true;
    const note = $('cancelnote');
    note.hidden = false;
    note.append(Object.assign(document.createElement('span'), { className: 'x', textContent: '✕ ' }));
    note.append('redirect cancelled — staying put. ');
    note.append(Object.assign(document.createElement('a'), { href: safeHref(plan.target), textContent: plan.targetLabel }));
    note.append(' · ');
    note.append(Object.assign(document.createElement('a'), { href: '/', textContent: 'mase.fi' }));
    setHints([{ href: '/', textContent: 'mase.fi' }, ' for the full directory'], [{ href: '/', textContent: 'mase.fi' }]);
  };
  // Interacting with the redirect target must never count as "stay".
  const onAny = (e) => {
    if (e.target instanceof Element && (e.target.closest('#gobtn') || (suggEl && suggEl.contains(e.target)))) return;
    cancel();
  };
  const onKey = (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Enter') go();
    else cancel();
  };
  $('staybtn').addEventListener('click', cancel);
  document.addEventListener('keydown', onKey);
  document.addEventListener('click', onAny);
  document.addEventListener('wheel', onAny, { passive: true });
  document.addEventListener('touchstart', onAny, { passive: true });
  const tick = () => {
    count--;
    if (count <= 0) { go(); return; }
    $('cnum').textContent = String(count);
    const segs = [...$('csegs').children];
    segs.forEach((s, i) => s.classList.toggle('on', i < count));
    drain.style.width = (count / 5) * 100 + '%';
  };
  iv = setInterval(tick, 1000);
}

export async function start() {
  const path = effectivePath();
  renderTyped(path, path.length);
  applyRealStatus(path);
  if (isJunkPath(path)) {
    renderNone(0);
    return;
  }
  const [prefix, routes] = await Promise.all([probePrefixes(path), loadRoutes()]);
  if (prefix) {
    const known = routes.find((r) => r.kind === 'path' && r.href === prefix);
    renderConfident(path, decide({
      prefixHit: { href: prefix, label: prefix, name: known ? known.name : '' },
      candidates: [],
      path,
    }));
    return;
  }
  const plan = decide({ prefixHit: null, candidates: fuzzyCandidates(path, routes), path });
  if (plan.state === 'confident') renderConfident(path, plan);
  else if (plan.state === 'fuzzy') renderFuzzy(path, plan.candidates);
  else renderNone(routes.filter((r) => !r.extra).length);
}
