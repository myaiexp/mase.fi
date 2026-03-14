/** Thin orchestrator. Single fetch, passes data to modules. */
import { initAnimations } from './animations.js';
import { initUpdates } from './updates.js';
import { initProjects } from './projects.js';
import './style.css';

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Initialize hero animations, mouse glow, click ripples
initAnimations(prefersReducedMotion);

// Fetch updates data and initialize modules
fetch('/updates.json')
  .then(res => res.json())
  .then(data => {
    const entries = Array.isArray(data) ? data : (data.entries ?? []);
    const projects = data.projects ?? [];

    initUpdates(entries, prefersReducedMotion);
    initProjects(entries, projects, prefersReducedMotion);
  })
  .catch(() => {
    // Graceful: stream stays empty, pill-bar still renders from initUpdates([])
    initUpdates([], prefersReducedMotion);
    initProjects([], [], prefersReducedMotion);
  });
