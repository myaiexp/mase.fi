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

  // ===== Update items: scroll-triggered stagger =====

  animate('.update-item', {
    opacity: [0, 1],
    translateY: ['1rem', 0],
    delay: stagger(60),
    duration: 800,
    ease: 'outExpo',
    autoplay: onScroll({
      enter: 'bottom-=80 top',
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
  document.querySelectorAll('.hero-letter, .hero-tagline, .app-card, .update-item').forEach(el => {
    el.style.opacity = '1';
    el.style.transform = 'none';
  });
}
