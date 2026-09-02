// Orchestrator: fetch updates, run boot (or skip), then wire all modules
import { fetchData } from './data.js';
import { shouldSkipBoot, writeBootStamp, runBoot, initReplayBoot } from './boot.js';
import { initChannels, applyInitialChannel, navigate } from './channels.js';
import { renderChanlist } from './sidebar.js';
import { initCommand } from './command.js';
import { initTickers } from './tickers.js';
import './styles/index.css';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const dataPromise = fetchData();
initReplayBoot();

async function init() {
  const data = await dataPromise;
  initChannels(data);
  renderChanlist(data, navigate);
  initCommand(data);
  initTickers(data.meta.bootTime);
  applyInitialChannel();
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
