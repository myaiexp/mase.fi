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

function initApp(data) {
  initSidebar(data);
  initRouter(data, prefersReducedMotion);
  initSearch(data);

  const channelId = resolveInitialChannel();
  navigateTo(channelId, data, prefersReducedMotion);
}

if (shouldSkipBoot(prefersReducedMotion)) {
  dataPromise.then(initApp);
} else {
  runBoot(dataPromise, initApp);
}

initReplayButton(
  () => fetch('/updates.json').then((r) => r.json()),
  initApp,
);
