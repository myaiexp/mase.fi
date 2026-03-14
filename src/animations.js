import { animate, stagger, onScroll } from 'animejs';

/**
 * Initialize hero animations, mouse glow, click ripples.
 * Skips animation setup if prefersReducedMotion — elements are made visible directly via CSS.
 */
export function initAnimations(prefersReducedMotion) {
  if (!prefersReducedMotion) {
    // Hero: staggered letter reveal
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

    // Mouse-following glow
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

    // Click ripples
    document.addEventListener('click', (e) => {
      const ripple = document.createElement('div');
      ripple.className = 'click-ripple';
      ripple.style.left = `${e.clientX}px`;
      ripple.style.top = `${e.clientY}px`;
      document.body.appendChild(ripple);
      ripple.addEventListener('animationend', () => ripple.remove());
    });
  }
}

/**
 * Animate elements in on scroll entry. Reusable for any section.
 * Uses CSS animation-timeline: view() where supported,
 * falls back to anime.js onScroll() otherwise.
 * Skips entirely if prefersReducedMotion — sets opacity:1/transform:none directly.
 */
export function scrollReveal(selector, prefersReducedMotion) {
  const elements = document.querySelectorAll(selector);
  if (!elements.length) return;

  if (prefersReducedMotion) {
    elements.forEach(el => {
      el.style.opacity = '1';
      el.style.transform = 'none';
    });
    return;
  }

  if (CSS.supports('animation-timeline: view()')) {
    // Pure CSS scroll-driven animation — add a class, CSS handles it
    elements.forEach(el => el.classList.add('scroll-reveal'));
  } else {
    // Fallback: anime.js onScroll
    animate(selector, {
      opacity: [0, 1],
      translateY: ['1.5rem', 0],
      delay: stagger(60),
      duration: 600,
      ease: 'outExpo',
      autoplay: onScroll({
        enter: 'bottom-=80 top',
        sync: true,
      }),
    });
  }
}

/**
 * Attach card ripple fill handlers to elements matching selector.
 */
export function initCardRipples(selector) {
  document.querySelectorAll(selector).forEach(card => {
    card.addEventListener('mousedown', (e) => {
      const rect = card.getBoundingClientRect();
      const ripple = document.createElement('div');
      ripple.className = 'card-ripple';

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
}
