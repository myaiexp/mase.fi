/** Orchestrator: fetch data, boot or direct load, init all modules. */
import { shouldSkipBoot, runBoot, initReplayButton } from './boot.js';
import { initSidebar } from './sidebar.js';
import { initRouter, navigateTo, resolveInitialChannel } from './channels.js';
import { initSearch } from './search.js';
import './style.css';

const prefersReducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const dataPromise = fetch('/updates.json')
  .then((r) => r.json())
  .catch(() => ({ entries: [], projects: [] }));

/** Full init — used for skip-boot path and replay */
function initApp(data) {
  initSidebar(data);
  initRouter(data, prefersReducedMotion);
  initSearch(data);

  const channelId = resolveInitialChannel();
  navigateTo(channelId, data, prefersReducedMotion);
}

/** After boot: wire up functional modules without re-rendering content.
 *  Boot Phase 3 already built the sidebar DOM and #home content visually.
 *  We just need initSidebar for mobile dropdown + event wiring,
 *  then router + search. No navigateTo — content is already there. */
function initAfterBoot(data) {
  initSidebar(data);
  initRouter(data, prefersReducedMotion);
  initSearch(data);
}

if (shouldSkipBoot(prefersReducedMotion)) {
  dataPromise.then(initApp);
} else {
  runBoot(dataPromise, initAfterBoot);
}

initReplayButton(
  () => fetch('/updates.json').then((r) => r.json()),
  initApp,
);
