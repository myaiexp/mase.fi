/** Thin orchestrator. Single fetch, passes data to modules. */
import { initAnimations, scrollReveal } from './animations.js'; // scrollReveal used in Task 3
import { initUpdates } from './updates.js';
// import { initProjects } from './projects.js';  // Task 3
import './style.css';

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Initialize hero animations, mouse glow, click ripples
initAnimations(prefersReducedMotion);

// Fetch updates data and initialize modules
fetch('/updates.json')
  .then(res => res.json())
  .then(data => {
    const entries = Array.isArray(data) ? data : (data.entries ?? []);
    // const projects = data.projects ?? [];  // Task 3

    initUpdates(entries, prefersReducedMotion);
    // initProjects(entries, projects, prefersReducedMotion);  // Task 3
  })
  .catch(() => {
    // Graceful: stream stays empty, pill-bar still renders from initUpdates([])
    initUpdates([], prefersReducedMotion);
  });
