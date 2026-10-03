// The site's single motion policy: whether effects should skip their animation

/** True when the visitor asked the OS/browser for reduced motion. Read live on
 *  every call, so a preference flipped mid-session applies to the next effect. */
export function prefersReducedMotion() {
  return matchMedia('(prefers-reduced-motion: reduce)').matches;
}
