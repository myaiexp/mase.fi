// Orchestrator: fetch updates, run boot (or skip), then wire all modules
import { fetchData } from './data.js';
import { shouldSkipBoot, writeBootStamp, runBoot, initReplayBoot } from './boot.js';
import { initChannels, applyInitialChannel, applyLateDemos, navigate } from './channels.js';
import { renderChanlist } from './sidebar.js';
import { initCommand } from './command.js';
import { initTickers } from './tickers.js';
import { prefersReducedMotion } from './motion.js';
import './styles/index.css';

const reduced = prefersReducedMotion();
const dataPromise = fetchData();
initReplayBoot();

async function init() {
  const data = await dataPromise;
  initChannels(data);
  renderChanlist(data, navigate);
  initCommand(data);
  initTickers(data.meta.bootTime);
  applyInitialChannel();
  // Lost the grace race: chips for the channel already on screen appear when
  // the manifest lands. A later navigation reads data.demos either way.
  data.pendingDemos?.then((demos) => applyLateDemos(demos));
}

if (shouldSkipBoot(reduced)) {
  if (reduced) writeBootStamp();
  document.getElementById('app').hidden = false;
  document.getElementById('boot')?.remove();
  init();
} else {
  window.addEventListener('mase:booted', init, { once: true });
  runBoot();
}
