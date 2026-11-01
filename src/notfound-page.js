// DOM driver for the smart 404 page: probes the ladder, renders a state, counts down
// Pure matching logic lives in notfound.js. Served as /404.html via nginx error_page,
// so location.pathname is the path the visitor actually typed — except when the page
// is opened as /404.html itself, where ?p=/some/path previews a typed path.
import { parentPrefixes, isJunkPath, buildRoutes, fuzzyCandidates, decide, reasonFor, isSafeRedirect } from './notfound.js';
import { sameOriginPath } from './same-origin.js';
import { fetchJson, fetchWithTimeout } from './fetch-json.js';
import { prefersReducedMotion } from './motion.js';

const $ = (id) => document.getElementById(id);
const isPreview = () => location.pathname === '/404.html';
const PATH_CLAMP = 160;

function el(tag, props, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

// A function, not a shared node: a node can only sit in one place in the DOM.
const homeLink = (textContent = 'mase.fi') => el('a', { href: '/', textContent });

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
  try {
    return await fetchWithTimeout(url, { method: 'HEAD', redirect: 'follow' }, ms);
  } catch {
    return null;
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
    return buildRoutes(await fetchJson('/updates.json', 1500));
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
    const pathNote = $('pnote');
    pathNote.hidden = false;
    pathNote.textContent = `path truncated · ${path.length} chars · nothing here resembles it`;
  }
}

function setHints(desktop, mobile) {
  $('fhints').replaceChildren(
    el('span', { className: 'hint-d' }, ...desktop),
    el('span', { className: 'hint-m' }, ...mobile),
  );
}

function suggestionLink(plan) {
  const a = el('a', { className: 'big', href: safeHref(plan.target) },
    el('span', { className: 'arr', textContent: '→' }),
    el('span', { className: 'bu', textContent: plan.targetLabel }),
  );
  if (plan.targetCaption) a.append(el('span', { className: 'bname', textContent: plan.targetCaption }));
  return a;
}

export function renderConfident(path, plan) {
  if (plan.diff) {
    renderTyped(path, plan.target.length);
    const tailNote = $('tailnote');
    tailNote.hidden = false;
    tailNote.append('the tail ', el('b', { textContent: plan.tail }), ' matched nothing · the head resolves');
  }
  const sugg = $('sugg');
  sugg.textContent = '';
  sugg.append(el('div', { className: 'label', textContent: 'did you mean' }));
  const link = suggestionLink(plan);
  sugg.append(link);
  setHints(
    ['esc or any key to stay · enter to go now · ', homeLink(), ' for the full directory'],
    [homeLink(), ' · tap anywhere to stay'],
  );
  startCountdown(plan, link);
}

export function renderFuzzy(path, candidates) {
  const sugg = $('sugg');
  sugg.textContent = '';
  sugg.append(el('div', { className: 'label', textContent: 'closest matches' }));
  const list = el('div', { className: 'cands' });
  candidates.forEach((c, i) => {
    const a = el('a', { className: i === 0 ? 'cand first' : 'cand', href: safeHref(c.route.href) },
      el('span', { className: 'croute', textContent: '→ ' + c.route.label }),
    );
    if (c.route.caption) a.append(el('span', { className: 'cname', textContent: c.route.caption }));
    a.append(el('span', { className: 'creason', textContent: reasonFor(c) }));
    list.append(a);
  });
  sugg.append(list);
  sugg.append(el('div', { className: 'cfoot' }, 'no auto-redirect — pick one, or ', homeLink('browse everything'), '.'));
  setHints([`1–${candidates.length} to jump · h for home`], [homeLink(), ' for the full directory']);
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
    targetCaption: 'the full directory' + (projectCount ? ` — ${projectCount} active projects` : ''),
  });
  sugg.append(link);
  setHints(['enter for home'], [homeLink(), ' for the full directory']);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') location.href = '/';
  });
}

export function startCountdown(plan, suggEl) {
  const box = $('countbox');
  box.hidden = false;
  // Every listener below hangs off this signal, so stop() ends them all at once.
  const ac = new AbortController();
  const on = { signal: ac.signal };
  let iv;
  const stop = () => {
    clearInterval(iv);
    ac.abort();
  };
  // replace() only starts a navigation and the page stays live until it
  // unloads, so going ends the countdown: a live timer would replace() again,
  // and a later key or click would show "redirect cancelled" mid-navigation.
  const go = () => {
    if (!isSafeRedirect(plan.target, location.origin)) return;
    stop();
    location.replace(plan.target);
  };
  $('gobtn').addEventListener('click', go, on);
  if (prefersReducedMotion()) {
    // An involuntary navigation is a motion problem too: buttons only, no timer.
    // The static "redirecting in" label would promise a countdown that never starts.
    $('clabel').textContent = 'go now or stay';
    $('cnum').hidden = true;
    $('csegs').hidden = true;
    $('staybtn').addEventListener('click', () => { box.hidden = true; }, on);
    return;
  }
  const drain = $('drain');
  drain.hidden = false;
  let count = 5;
  const cancel = () => {
    stop();
    drain.hidden = true;
    box.hidden = true;
    const note = $('cancelnote');
    note.hidden = false;
    note.append(
      el('span', { className: 'x', textContent: '✕ ' }),
      'redirect cancelled — staying put. ',
      el('a', { href: safeHref(plan.target), textContent: plan.targetLabel }),
      ' · ',
      homeLink(),
    );
    setHints([homeLink(), ' for the full directory'], [homeLink()]);
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
  $('staybtn').addEventListener('click', cancel, on);
  document.addEventListener('keydown', onKey, on);
  document.addEventListener('click', onAny, on);
  document.addEventListener('wheel', onAny, { ...on, passive: true });
  document.addEventListener('touchstart', onAny, { ...on, passive: true });
  const tick = () => {
    count--;
    // stop() here too: go() refuses an unsafe target without stopping, and
    // the interval would otherwise tick on into negative counts.
    if (count <= 0) { stop(); go(); return; }
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
    // Project urls may end in `/`; parent prefixes never do.
    const known = routes.find((r) => r.kind === 'path' && r.href.replace(/\/$/, '') === prefix);
    renderConfident(path, decide({
      prefixHit: { href: prefix, label: prefix, caption: known ? known.caption : '' },
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
