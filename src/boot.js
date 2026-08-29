// Boot sequence — fake TTY POST, 3 phases, skip-on-click
import { LOGO } from './ascii.js';

const BOOT_TTL_MS = 7 * 24 * 3600 * 1000;
const BOOT_STAMP_KEY = 'mase.boot.last';

// localStorage throws in Safari private mode, when cookies are disabled, and
// when the quota is full. The boot overlay starts with #app hidden, so a
// thrown get/set would freeze the visitor on the overlay. Treat any storage
// failure as "no stamp" / "couldn't persist" rather than aborting the reveal.
function readBootStamp() {
  try {
    return Number(localStorage.getItem(BOOT_STAMP_KEY) || 0);
  } catch {
    return 0;
  }
}

function writeBootStamp() {
  try {
    localStorage.setItem(BOOT_STAMP_KEY, String(Date.now()));
  } catch { /* best-effort TTL; reveal must still proceed */ }
}

function clearBootStamp() {
  try {
    localStorage.removeItem(BOOT_STAMP_KEY);
  } catch { /* replay still reloads even if the stamp couldn't be cleared */ }
}

/**
 * @param {boolean} prefersReducedMotion
 * @returns {boolean} true if boot should be skipped entirely.
 *                    If prefersReducedMotion is true, also writes the TTL stamp.
 */
export function shouldSkipBoot(prefersReducedMotion) {
  const lastBoot = readBootStamp();
  const fresh = Date.now() - lastBoot > BOOT_TTL_MS;
  const forceReplay = window.MASE_FORCE_BOOT === true;

  if (!fresh && !forceReplay) return true;

  if (prefersReducedMotion) {
    writeBootStamp();
    return true;
  }

  return false;
}

/**
 * Run the boot animation. Dismiss on any click/keypress. When done, write the TTL stamp,
 * reveal #app, remove #boot, and dispatch a 'mase:booted' event on window.
 */
export function runBoot() {
  const boot = document.getElementById('boot');
  const app  = document.getElementById('app');

  function finish() {
    writeBootStamp();
    boot.style.transition = 'opacity .28s ease';
    boot.style.opacity = '0';
    app.hidden = false;
    setTimeout(() => { boot.remove(); window.dispatchEvent(new Event('mase:booted')); }, 300);
  }

  // Phase 1: POST / kernel lines
  const POST = [
    ['POST: probing cpu ·······················', 'ok'],
    ['POST: memory controller at 0xfed1c000 ····', 'ok'],
    ['POST: nvme0n1 seq=512 throughput=3.1gb/s ·', 'ok'],
    ['POST: tty1 vt100 raw mode ················', 'ok'],
    ['load: kernel image (vmmasefi-6.9)', 'dim'],
    ['decompress: 11.4 MiB → 42.7 MiB ···········', 'ok'],
  ];
  // Phase 2: services
  const SERVICES = [
    ['started:  ircd                  ', 'ok'],
    ['started:  log.collector         ', 'ok'],
    ['started:  feed.watcher          ', 'ok'],
    ['started:  summariser.daily      ', 'ok'],
    ['started:  deploy.hooks          ', 'ok'],
    ['warning:  cdn.mase.fi latency 248ms', 'warn'],
    ['started:  www                   ', 'ok'],
  ];
  // Phase 3: banner (rendered as one pre block, not line-by-line, to keep block chars flush)
  const BANNER = [[LOGO, 'logo-block']];
  const TAIL = [
    ['', 'dim'],
    ['welcome, mase.  connected to irc.mase.fi (6667/ssl)', 'dim'],
    ['type / to jump between channels.  ? for help.', 'dim'],
    ['', 'dim'],
  ];

  const script = [
    ...POST.map(x => [...x, 30]),
    ['', 'dim', 120],
    ...SERVICES.map(x => [...x, 55]),
    ['', 'dim', 180],
    ...BANNER.map(x => [...x, 200]),
    ...TAIL.map(x => [...x, 40]),
  ];

  let done = false;
  function skip() {
    if (done) return;
    done = true;
    finish();
  }
  boot.addEventListener('click', skip);
  // delay the keydown skip so stray keystrokes from the preceding interaction don't insta-skip
  setTimeout(() => {
    addEventListener('keydown', skip, { once: true });
  }, 400);

  // render
  let i = 0;
  function renderOne() {
    if (done) return;
    if (i >= script.length) {
      setTimeout(finish, 400);
      return;
    }
    const [text, kind, delay] = script[i];
    i++;
    const line = document.createElement('div');
    line.className = 'boot-line';
    if (kind === 'logo-block') {
      const pre = document.createElement('pre');
      pre.className = 'boot-line boot-logo';
      pre.textContent = text;
      boot.appendChild(pre);
      boot.scrollTop = boot.scrollHeight;
      setTimeout(renderOne, delay);
      return;
    }
    if (kind === 'ok' || kind === 'fail' || kind === 'warn') {
      const body = document.createElement('span');
      body.textContent = text + ' ';
      const tag = document.createElement('span');
      tag.className = 'boot-' + kind;
      tag.textContent = kind === 'ok' ? '[  OK  ]' : kind === 'fail' ? '[ FAIL ]' : '[ WARN ]';
      line.append(body, tag);
    } else {
      line.classList.add('boot-dim');
      line.textContent = text || ' ';
    }
    boot.appendChild(line);
    // keep scroll pegged
    boot.scrollTop = boot.scrollHeight;
    setTimeout(renderOne, delay);
  }

  // skip hint
  const skipHint = document.createElement('div');
  skipHint.className = 'boot-skip';
  const hintText = document.createTextNode('click or press ');
  const kbd = document.createElement('kbd');
  kbd.textContent = 'any key';
  const hintAfter = document.createTextNode(' to skip');
  skipHint.append(hintText, kbd, hintAfter);
  boot.appendChild(skipHint);

  renderOne();
}

/**
 * Expose window.__maseReplayBoot for console use.
 */
export function initReplayBoot() {
  window.__maseReplayBoot = () => {
    clearBootStamp();
    location.reload();
  };
}
