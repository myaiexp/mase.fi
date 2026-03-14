import { animate, stagger, onScroll } from 'animejs';
import './style.css';

// Respect reduced motion preference
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (!prefersReducedMotion) {
  // ===== Hero: staggered letter reveal =====

  animate('.hero-letter', {
    opacity: [0, 1],
    translateY: ['1.5rem', 0],
    delay: stagger(65, { from: 'first' }),
    duration: 900,
    ease: 'outExpo',
  });

  // Hero tagline: fade in after letters
  animate('.hero-tagline', {
    opacity: [0, 1],
    translateY: ['1rem', 0],
    duration: 1000,
    ease: 'outExpo',
    delay: 500,
  });

  // ===== App cards: scroll-linked reveal =====

  animate('.app-card', {
    opacity: [0, 1],
    translateY: ['2rem', 0],
    delay: stagger(100),
    ease: 'outExpo',
    autoplay: onScroll({
      enter: 'bottom-=100 top',
      sync: true,
    }),
  });

  // ===== Ambient: Mouse-following glow =====

  const glow = document.querySelector('.mouse-glow');
  if (glow) {
    let mouseX = 0, mouseY = 0;
    let glowX = 0, glowY = 0;
    let isMouseOnPage = false;

    document.addEventListener('mousemove', (e) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
      if (!isMouseOnPage) {
        isMouseOnPage = true;
        glowX = mouseX;
        glowY = mouseY;
        glow.style.opacity = '1';
      }
    });

    document.addEventListener('mouseleave', () => {
      isMouseOnPage = false;
      glow.style.opacity = '0';
    });

    function updateGlow() {
      glowX += (mouseX - glowX) * 0.08;
      glowY += (mouseY - glowY) * 0.08;
      glow.style.transform = `translate(calc(${glowX}px - 50%), calc(${glowY}px - 50%))`;
      requestAnimationFrame(updateGlow);
    }
    requestAnimationFrame(updateGlow);
  }

  // ===== Ambient: Click ripples =====

  document.addEventListener('click', (e) => {
    const ripple = document.createElement('div');
    ripple.className = 'click-ripple';
    ripple.style.left = `${e.clientX}px`;
    ripple.style.top = `${e.clientY}px`;
    document.body.appendChild(ripple);
    ripple.addEventListener('animationend', () => ripple.remove());
  });

  // ===== Card ripple fill =====

  document.querySelectorAll('.app-card').forEach(card => {
    card.addEventListener('mousedown', (e) => {
      const rect = card.getBoundingClientRect();
      const ripple = document.createElement('div');
      ripple.className = 'card-ripple';

      // Size ripple to cover the entire card from click point
      const maxDist = Math.max(
        Math.hypot(e.clientX - rect.left, e.clientY - rect.top),
        Math.hypot(e.clientX - rect.right, e.clientY - rect.top),
        Math.hypot(e.clientX - rect.left, e.clientY - rect.bottom),
        Math.hypot(e.clientX - rect.right, e.clientY - rect.bottom),
      );
      const size = maxDist * 2;

      ripple.style.width = `${size}px`;
      ripple.style.height = `${size}px`;
      ripple.style.left = `${e.clientX - rect.left - size / 2}px`;
      ripple.style.top = `${e.clientY - rect.top - size / 2}px`;

      card.appendChild(ripple);
      ripple.addEventListener('animationend', () => ripple.remove());
    });
  });

} else {
  // Immediately show everything for reduced motion
  document.querySelectorAll('.hero-letter, .hero-tagline, .app-card').forEach(el => {
    el.style.opacity = '1';
    el.style.transform = 'none';
  });
}

// ===== Updates: fetch, render, tab switching =====

/** Format "YYYY-MM-DD" → "DD.MM.YYYY" */
function formatDate(isoDate) {
  const [y, m, d] = isoDate.split('-');
  return `${d}.${m}.${y}`;
}

/**
 * Filter entries by tab (cumulative):
 * "project" → category === "project"
 * "feature" → category === "project" || "feature"
 * "all" → everything
 */
function filterEntries(entries, filter) {
  if (filter === 'project') return entries.filter(e => e.category === 'project');
  if (filter === 'feature') return entries.filter(e => e.category === 'project' || e.category === 'feature');
  return entries;
}

/** Create <li class="update-item"> with <time> and <span>. Sets opacity:0 + translateY if animating. */
function createUpdateItem(entry, skipAnimation) {
  const li = document.createElement('li');
  li.className = 'update-item';

  const time = document.createElement('time');
  time.className = 'update-date';
  time.dateTime = entry.date;
  time.textContent = formatDate(entry.date);

  const project = document.createElement('span');
  project.className = 'update-project';
  project.textContent = entry.project;

  const text = document.createElement('span');
  text.className = 'update-text';
  text.textContent = entry.text;

  li.appendChild(time);
  li.appendChild(project);
  li.appendChild(text);

  if (!skipAnimation) {
    li.style.opacity = '0';
    li.style.transform = 'translateY(1rem)';
  }

  return li;
}

/** Clear list, insert filtered items, animate them in with stagger. */
function renderUpdates(entries, list, skipAnimation) {
  while (list.firstChild) list.removeChild(list.firstChild);
  const items = entries.map(entry => createUpdateItem(entry, skipAnimation));
  items.forEach(item => list.appendChild(item));

  if (!skipAnimation && items.length > 0) {
    animate('.update-item', {
      opacity: [0, 1],
      translateY: ['1rem', 0],
      duration: 400,
      delay: stagger(40),
      ease: 'outExpo',
    });
  }
}

// ===== Updates initialization =====

{
  const list = document.querySelector('.updates-list');
  const tabs = document.querySelectorAll('.tab-btn');

  if (list && tabs.length > 0) {
    let allEntries = [];
    let activeFilter = 'project';

    // Tab click handler
    tabs.forEach(btn => {
      btn.addEventListener('click', () => {
        const filter = btn.dataset.filter;
        if (filter === activeFilter) return;

        activeFilter = filter;
        tabs.forEach(t => t.classList.remove('active'));
        btn.classList.add('active');

        const filtered = filterEntries(allEntries, activeFilter);
        renderUpdates(filtered, list, prefersReducedMotion);
      });
    });

    // Fetch and render default tab
    fetch('/updates.json')
      .then(res => res.json())
      .then(data => {
        // Compat shim: handle both flat array (old) and {entries} (new) format
        const entries = Array.isArray(data) ? data : data.entries;
        allEntries = entries;
        const filtered = filterEntries(allEntries, activeFilter);
        renderUpdates(filtered, list, prefersReducedMotion);
      })
      .catch(() => {
        // Graceful: list stays empty, tabs still visible
      });
  }
}
