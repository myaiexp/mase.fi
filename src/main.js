// Orchestrator: fetch updates, run boot (or skip), then wire all modules
import { fetchData, fetchDemos } from './data.js';
import { shouldSkipBoot, runBoot, initReplayBoot } from './boot.js';
import { initChannels, applyInitialChannel, navigate } from './channels.js';
import { renderChanlist } from './sidebar.js';
import { initCommand } from './command.js';
import { initChrome } from './chrome.js';
import './styles/index.css';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const dataPromise = fetchData();
const demosPromise = fetchDemos();
initReplayBoot();

async function init() {
  const data = await dataPromise;
  // Attach the demo-channel list so pinned renderers can light up "try demo →".
  data.demos = await demosPromise;
  initChannels(data);
  renderChanlist(data, navigate);
  initCommand(data);
  initChrome(data.meta.bootTime);
  applyInitialChannel();
}

if (shouldSkipBoot(reduced)) {
  document.getElementById('app').hidden = false;
  document.getElementById('boot')?.remove();
  init();
} else {
  window.addEventListener('mase:booted', init, { once: true });
  runBoot();
}
