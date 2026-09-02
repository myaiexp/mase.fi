// Pretext-measured beam-destruction effect for the home channel ASCII LOGO
import { prepareWithSegments, measureNaturalWidth } from '@chenglou/pretext';

const SCRAMBLE = '!@#$%&*+=<>/\\|?~^░▒▓█';
const DECAY_RAMP = ['▓', '▒', '░', '·', ' '];

const CHARGE_R = 56;   // px ahead of beam: char enters scramble state
const BEAM_R   = 18;   // px around beam center: peak destruction
const DECAY_R  = 96;   // px behind beam: tail of fading glyphs
const SWEEP_MS = 2400;
const HOLD_MS  =  600;
const REFORM_MS = 1900;
const REST_MS  = 24000;
const FIRST_DELAY_MS = 1600;

// Deliberate single-active-beam singleton: only one beam runs at a time. mountBeam
// tears down the previous beam (calls activeCleanup) before mounting the next, so a
// re-mount never leaves a second animation loop running. Not a multi-beam registry by design.
let activeCleanup = null;

// Per-span bucket cache: { b: lastBucket, sb: lastDecaySubBucket }. Keyed off the
// span so the cache is GC'd with the element instead of polluting the DOM node.
const buckets = new WeakMap();

function sampleScramble() {
  return SCRAMBLE[(Math.random() * SCRAMBLE.length) | 0];
}

// Returns a destruction progress in [0,1] for a char at `charX` given beam center `beamX`.
// 0 = pristine, 1 = ash. The slope models charge → peak → decay → ash.
// Exported for unit testing — pure, deterministic, no DOM/animation dependency.
export function destructionAt(charX, beamX) {
  const d = beamX - charX;
  if (d < -CHARGE_R)            return 0;
  if (d < 0)                    return (d + CHARGE_R) / CHARGE_R * 0.40;       // 0..0.40 charge
  if (d < BEAM_R)               return 0.40 + (d / BEAM_R) * 0.30;             // 0.40..0.70 peak
  if (d < BEAM_R + DECAY_R)     return 0.70 + ((d - BEAM_R) / DECAY_R) * 0.30; // 0.70..1.0 decay
  return 1;
}

// Exported for unit testing — the bucket cache is the cheap invariant worth
// pinning (same-bucket dest must not rewrite textContent).
export function paintChar(span, original, dest) {
  // Bucket the destruction value so we only mutate textContent when state changes.
  let bucket;
  if (dest < 0.08)       bucket = 0; // pristine
  else if (dest < 0.40)  bucket = 1; // charging (scramble, golden)
  else if (dest < 0.70)  bucket = 2; // peak (█, hot white)
  else if (dest < 1.0)   bucket = 3; // decay (ramp ▓▒░·)
  else                   bucket = 4; // ash

  let rec = buckets.get(span);
  if (!rec) { rec = { b: undefined, sb: undefined }; buckets.set(span, rec); }
  const prevBucket = rec.b;
  const prevSubBucket = rec.sb;

  if (bucket === 0) {
    if (prevBucket !== 0) {
      span.textContent = original;
      span.className = 'bch';
    }
  } else if (bucket === 1) {
    // Re-scramble on every frame for jitter, but keep class assignment cheap.
    span.textContent = sampleScramble();
    if (prevBucket !== 1) span.className = 'bch ch';
  } else if (bucket === 2) {
    if (prevBucket !== 2) {
      span.textContent = '█';
      span.className = 'bch pk';
    }
  } else if (bucket === 3) {
    // Sub-bucket within decay: pick ramp glyph by progress.
    const t = (dest - 0.70) / 0.30;
    const idx = Math.min(DECAY_RAMP.length - 1, (t * DECAY_RAMP.length) | 0);
    if (prevBucket !== 3 || prevSubBucket !== idx) {
      span.textContent = DECAY_RAMP[idx];
      span.className = 'bch dc dc' + idx;
      rec.sb = idx;
    }
  } else {
    if (prevBucket !== 4) {
      span.textContent = ' ';
      span.className = 'bch ash';
    }
  }
  rec.b = bucket;
}

/** Mount the beam effect over an `.ascii` element. Returns a cleanup fn. */
export function mountBeam(asciiEl, logoText) {
  if (activeCleanup) activeCleanup();
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    asciiEl.textContent = logoText;
    return null;
  }
  // Skip on hidden hosts (e.g. mobile `.pin-grid > .ascii { display: none }`)
  // — measuring 0×0 produces a NaN beam track.
  if (asciiEl.offsetParent === null) {
    asciiEl.textContent = logoText;
    return null;
  }

  const cs = getComputedStyle(asciiEl);
  const fontShorthand = cs.font || `${cs.fontSize} ${cs.fontFamily}`;
  const lineHeight = parseFloat(cs.lineHeight) || (parseFloat(cs.fontSize) * 1.15);

  const rows = logoText.split('\n');
  const longest = rows.reduce((a, b) => a.length > b.length ? a : b, '');
  const longestPrepared = prepareWithSegments(longest, fontShorthand, { whiteSpace: 'pre-wrap' });
  const longestWidth = measureNaturalWidth(longestPrepared);
  const charWidth = longest.length > 0 ? longestWidth / longest.length : 0;

  if (!(charWidth > 0)) {
    asciiEl.textContent = logoText;
    return null;
  }

  const totalWidth = longestWidth;
  const totalHeight = rows.length * lineHeight;

  asciiEl.classList.add('beam-host');
  asciiEl.style.width = totalWidth + 'px';
  asciiEl.style.height = totalHeight + 'px';
  asciiEl.textContent = '';

  const chars = []; // {el, original, x}
  for (let r = 0; r < rows.length; r++) {
    const text = rows[r];
    for (let c = 0; c < text.length; c++) {
      const span = document.createElement('span');
      span.className = 'bch';
      span.style.left = (c * charWidth) + 'px';
      span.style.top = (r * lineHeight) + 'px';
      span.textContent = text[c];
      asciiEl.appendChild(span);
      chars.push({ el: span, original: text[c], x: c * charWidth + charWidth / 2 });
    }
  }

  const beam = document.createElement('div');
  beam.className = 'ascii-beam';
  beam.style.height = totalHeight + 'px';
  asciiEl.appendChild(beam);

  // Beam x-range: starts off-screen left, ends past right edge.
  const X0 = -CHARGE_R;
  const X1 = totalWidth + BEAM_R + DECAY_R;

  let raf = 0;
  let schedule = 0;

  function placeBeam(x, intensity) {
    beam.style.transform = `translateX(${x}px)`;
    beam.style.opacity = String(intensity);
  }

  function paintAll(beamX, reform) {
    for (const c of chars) {
      const d = reform ? 1 - destructionAt(c.x, beamX) : destructionAt(c.x, beamX);
      paintChar(c.el, c.original, d);
    }
  }

  function restorePristine() {
    for (const c of chars) {
      c.el.textContent = c.original;
      c.el.className = 'bch';
      buckets.set(c.el, { b: 0, sb: undefined });
    }
    beam.style.opacity = '0';
  }

  function play(phase) {
    // Detached host: #pinned was replaced without unmountBeam. Tear the
    // rAF/timeout chain down so we don't keep painting into dead nodes.
    if (!asciiEl.isConnected) {
      cleanup();
      return;
    }
    const t0 = performance.now();
    const dur = phase === 'sweep' ? SWEEP_MS : REFORM_MS;
    function step(now) {
      if (!asciiEl.isConnected) {
        cleanup();
        return;
      }
      const t = Math.min(1, (now - t0) / dur);
      // Ease in-out cubic so the beam accelerates through the middle.
      const k = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      const x = X0 + k * (X1 - X0);
      const intensity = phase === 'sweep'
        ? Math.sin(t * Math.PI) * 0.95         // peak in the middle
        : Math.sin(t * Math.PI) * 0.55;        // dimmer for the reform pass
      placeBeam(x, intensity);
      paintAll(x, phase === 'reform');
      if (t < 1) {
        raf = requestAnimationFrame(step);
      } else if (phase === 'sweep') {
        schedule = setTimeout(() => play('reform'), HOLD_MS);
      } else {
        restorePristine();
        schedule = setTimeout(() => play('sweep'), REST_MS);
      }
    }
    raf = requestAnimationFrame(step);
  }

  function trigger() {
    if (raf) cancelAnimationFrame(raf);
    if (schedule) clearTimeout(schedule);
    restorePristine();
    play('sweep');
  }
  asciiEl.addEventListener('click', trigger);

  schedule = setTimeout(() => play('sweep'), FIRST_DELAY_MS);

  function cleanup() {
    if (raf) cancelAnimationFrame(raf);
    if (schedule) clearTimeout(schedule);
    asciiEl.removeEventListener('click', trigger);
    asciiEl.classList.remove('beam-host');
    asciiEl.style.width = '';
    asciiEl.style.height = '';
    asciiEl.textContent = logoText;
    activeCleanup = null;
  }
  activeCleanup = cleanup;
  return cleanup;
}

/** Tear down the active beam, if any. Safe to call when nothing is mounted. */
export function unmountBeam() {
  if (activeCleanup) activeCleanup();
}
