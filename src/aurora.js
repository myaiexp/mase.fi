// ========================================
// Aurora Borealis — Canvas renderer
// Finnish northern lights as the page identity
// ========================================

// --- Compact 2D value noise ---

function hash(x, y) {
  let n = x * 127.1 + y * 311.7;
  n = Math.sin(n) * 43758.5453;
  return n - Math.floor(n);
}

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

function noise2D(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = smoothstep(x - ix);
  const fy = smoothstep(y - iy);

  const a = hash(ix, iy);
  const b = hash(ix + 1, iy);
  const c = hash(ix, iy + 1);
  const d = hash(ix + 1, iy + 1);

  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

// Fractal brownian motion — layered noise for organic shapes
function fbm(x, y, octaves = 3) {
  let value = 0;
  let amplitude = 1;
  let frequency = 1;
  let total = 0;

  for (let i = 0; i < octaves; i++) {
    value += noise2D(x * frequency, y * frequency) * amplitude;
    total += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }

  return value / total;
}

// --- Aurora band configuration ---
// Layered like real aurora: green lowest, teal mid, violet highest
const BANDS = [
  {
    // Primary green curtain — the main event
    color: [34, 197, 94],     // green-500
    colorBright: [74, 222, 128], // green-400
    yBase: 0.38,
    amplitude: 0.12,
    thickness: 0.18,
    noiseScaleX: 0.0008,
    noiseScaleTime: 0.12,
    brightness: 0.14,
    seed: 0,
    rayFrequency: 0.004,
    rayStrength: 0.5,
  },
  {
    // Teal / cyan undertone — fills in below green
    color: [45, 212, 191],     // teal-400
    colorBright: [94, 234, 212], // teal-300
    yBase: 0.42,
    amplitude: 0.08,
    thickness: 0.14,
    noiseScaleX: 0.0012,
    noiseScaleTime: 0.09,
    brightness: 0.08,
    seed: 100,
    rayFrequency: 0.005,
    rayStrength: 0.3,
  },
  {
    // Violet crown — highest altitude, faintest
    color: [167, 139, 250],    // violet-400
    colorBright: [196, 181, 253], // violet-300
    yBase: 0.28,
    amplitude: 0.10,
    thickness: 0.12,
    noiseScaleX: 0.0006,
    noiseScaleTime: 0.07,
    brightness: 0.06,
    seed: 200,
    rayFrequency: 0.003,
    rayStrength: 0.4,
  },
  {
    // Faint blue wash — deep sky color
    color: [56, 189, 248],     // sky-400
    colorBright: [125, 211, 252], // sky-300
    yBase: 0.35,
    amplitude: 0.15,
    thickness: 0.22,
    noiseScaleX: 0.0004,
    noiseScaleTime: 0.05,
    brightness: 0.035,
    seed: 300,
    rayFrequency: 0.002,
    rayStrength: 0.2,
  },
];

// --- Renderer ---

export function initAurora(canvasEl) {
  const ctx = canvasEl.getContext('2d');
  let w, h, scale;
  let time = 0;
  let running = true;
  let lastFrame = 0;

  // Render at half resolution for performance — aurora is blurry anyway
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    scale = 0.4 * dpr; // 40% of device resolution
    w = Math.floor(window.innerWidth * scale);
    h = Math.floor(window.innerHeight * scale);
    canvasEl.width = w;
    canvasEl.height = h;
  }

  function drawBand(band, t) {
    const segments = Math.max(60, Math.floor(w / 3));
    const segWidth = w / segments;

    for (let i = 0; i <= segments; i++) {
      const xNorm = i / segments;
      const x = xNorm * w;

      // Center Y of band at this x position — undulates with noise
      const wave = fbm(
        xNorm * w * band.noiseScaleX + t * band.noiseScaleTime,
        band.seed + t * band.noiseScaleTime * 0.3,
        3
      );
      const centerY = h * (band.yBase + (wave - 0.5) * band.amplitude * 2);

      // Band thickness varies slightly
      const thickNoise = noise2D(
        xNorm * w * band.noiseScaleX * 2 + t * band.noiseScaleTime * 0.5,
        band.seed + 50
      );
      const bandHeight = h * band.thickness * (0.7 + thickNoise * 0.6);

      // Vertical ray structure — rapid brightness variation in x
      const ray = noise2D(
        x * band.rayFrequency,
        t * band.noiseScaleTime * 0.8 + band.seed
      );
      const rayIntensity = 0.5 + ray * band.rayStrength;

      // Brightness pulsing — slow, area-specific breathing
      const pulse = noise2D(
        xNorm * 2 + t * 0.03,
        band.seed + 500 + t * 0.02
      );
      const brightness = band.brightness * rayIntensity * (0.6 + pulse * 0.8);

      // Build vertical gradient for this strip
      // Top edge sharper, bottom edge fades more (authentic aurora look)
      const top = centerY - bandHeight * 0.6;
      const bottom = centerY + bandHeight * 1.2;

      const grad = ctx.createLinearGradient(0, top, 0, bottom);
      const [r, g, b] = band.color;
      const [rb, gb, bb] = band.colorBright;

      grad.addColorStop(0, 'transparent');
      grad.addColorStop(0.15, `rgba(${rb}, ${gb}, ${bb}, ${brightness * 0.3})`);
      grad.addColorStop(0.35, `rgba(${rb}, ${gb}, ${bb}, ${brightness * 0.8})`);
      grad.addColorStop(0.5, `rgba(${rb}, ${gb}, ${bb}, ${brightness})`);
      grad.addColorStop(0.65, `rgba(${r}, ${g}, ${b}, ${brightness * 0.6})`);
      grad.addColorStop(0.85, `rgba(${r}, ${g}, ${b}, ${brightness * 0.2})`);
      grad.addColorStop(1, 'transparent');

      ctx.fillStyle = grad;
      ctx.fillRect(x - segWidth * 0.5, top, segWidth + 1, bottom - top);
    }
  }

  function render(timestamp) {
    if (!running) return;

    // Throttle to ~30fps for performance
    if (timestamp - lastFrame < 30) {
      requestAnimationFrame(render);
      return;
    }
    lastFrame = timestamp;

    // Advance time slowly — this is the global animation clock
    time += 0.003;

    ctx.clearRect(0, 0, w, h);

    // Additive blending — bands combine to create richer colors where they overlap
    ctx.globalCompositeOperation = 'screen';

    // Apply blur for soft, diffuse aurora glow
    // At 40% resolution, 12px blur ≈ 30px effective
    ctx.filter = 'blur(12px)';

    // Render each band
    for (const band of BANDS) {
      drawBand(band, time);
    }

    // Reset
    ctx.filter = 'none';
    ctx.globalCompositeOperation = 'source-over';

    requestAnimationFrame(render);
  }

  // Setup
  resize();
  window.addEventListener('resize', resize);

  // Pause when tab hidden
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      running = false;
    } else {
      running = true;
      lastFrame = 0;
      requestAnimationFrame(render);
    }
  });

  // Start
  requestAnimationFrame(render);

  return { resize };
}
