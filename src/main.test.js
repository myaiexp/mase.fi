// @vitest-environment jsdom
// Tests for main.js, the entry orchestrator: the boot gate decides whether the
// page is ever revealed, and init() wires the modules in a fixed order once data
// resolves. Every collaborator is mocked; each case re-imports main.js fresh so
// its top-level code runs against that case's boot decision and media query.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const m = vi.hoisted(() => {
  const order = [];
  const spy = (name, impl) => vi.fn((...args) => { order.push(name); return impl?.(...args); });
  return {
    order,
    navigate: () => {},
    fetchData: vi.fn(),
    shouldSkipBoot: vi.fn(),
    writeBootStamp: spy('writeBootStamp'),
    runBoot: spy('runBoot'),
    initReplayBoot: spy('initReplayBoot'),
    initChannels: spy('initChannels'),
    applyInitialChannel: spy('applyInitialChannel'),
    renderChanlist: spy('renderChanlist'),
    initCommand: spy('initCommand'),
    initTickers: spy('initTickers'),
  };
});

vi.mock('./data.js', () => ({ fetchData: m.fetchData }));
vi.mock('./boot.js', () => ({
  shouldSkipBoot: m.shouldSkipBoot,
  writeBootStamp: m.writeBootStamp,
  runBoot: m.runBoot,
  initReplayBoot: m.initReplayBoot,
}));
vi.mock('./channels.js', () => ({
  initChannels: m.initChannels,
  applyInitialChannel: m.applyInitialChannel,
  navigate: m.navigate,
}));
vi.mock('./sidebar.js', () => ({ renderChanlist: m.renderChanlist }));
vi.mock('./command.js', () => ({ initCommand: m.initCommand }));
vi.mock('./tickers.js', () => ({ initTickers: m.initTickers }));
vi.mock('./styles/index.css', () => ({}));

const INIT_ORDER = ['initChannels', 'renderChanlist', 'initCommand', 'initTickers', 'applyInitialChannel'];
const data = { meta: { bootTime: 1234 }, entries: [], projects: [] };
let resolveData;

const app = () => document.getElementById('app');
const boot = () => document.getElementById('boot');
const initCalls = () => m.order.filter((n) => INIT_ORDER.includes(n));
// init() awaits the data promise; let its continuation run.
const settle = () => new Promise((r) => setTimeout(r, 0));

/** Import main.js fresh under one boot decision and reduced-motion setting. */
async function loadMain({ skip, reduced = false }) {
  m.shouldSkipBoot.mockReturnValue(skip);
  vi.stubGlobal('matchMedia', vi.fn((q) => ({
    matches: q === '(prefers-reduced-motion: reduce)' && reduced,
    media: q,
  })));
  vi.resetModules();
  await import('./main.js');
}

beforeEach(() => {
  vi.clearAllMocks();
  m.order.length = 0;
  m.fetchData.mockImplementation(() => {
    m.order.push('fetchData');
    return new Promise((r) => { resolveData = () => r(data); });
  });
  document.body.innerHTML = '<div id="boot"></div><div id="app" hidden></div>';
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('main.js skip-boot path', () => {
  it('reveals #app, removes #boot and runs init in order once data resolves', async () => {
    await loadMain({ skip: true });
    expect(app().hidden).toBe(false);
    expect(boot()).toBeNull();
    expect(m.runBoot).not.toHaveBeenCalled();

    // Nothing is wired until the data promise settles.
    await settle();
    expect(initCalls()).toEqual([]);

    resolveData();
    await settle();
    expect(initCalls()).toEqual(INIT_ORDER);
    expect(m.initChannels).toHaveBeenCalledWith(data);
    expect(m.renderChanlist).toHaveBeenCalledWith(data, m.navigate);
    expect(m.initCommand).toHaveBeenCalledWith(data);
    expect(m.initTickers).toHaveBeenCalledWith(1234);
  });

  it('starts the data fetch and the replay helper before deciding on boot', async () => {
    await loadMain({ skip: true });
    expect(m.order.slice(0, 2)).toEqual(['fetchData', 'initReplayBoot']);
    expect(m.fetchData).toHaveBeenCalledOnce();
  });

  it('writes the boot stamp when reduced motion skips the boot', async () => {
    await loadMain({ skip: true, reduced: true });
    expect(m.shouldSkipBoot).toHaveBeenCalledWith(true);
    expect(m.writeBootStamp).toHaveBeenCalledOnce();
    expect(app().hidden).toBe(false);
  });

  it('leaves the boot stamp alone when the skip comes from a fresh stamp', async () => {
    await loadMain({ skip: true, reduced: false });
    expect(m.shouldSkipBoot).toHaveBeenCalledWith(false);
    expect(m.writeBootStamp).not.toHaveBeenCalled();
  });

  it('tolerates a page without #boot', async () => {
    boot().remove();
    await expect(loadMain({ skip: true })).resolves.toBeUndefined();
    expect(app().hidden).toBe(false);
  });
});

describe('main.js boot path', () => {
  it('runs the boot and defers init until mase:booted fires, exactly once', async () => {
    await loadMain({ skip: false });
    expect(m.runBoot).toHaveBeenCalledOnce();
    expect(m.writeBootStamp).not.toHaveBeenCalled();
    // runBoot (mocked here) owns revealing #app and removing #boot on this path.
    expect(app().hidden).toBe(true);
    expect(boot()).not.toBeNull();

    resolveData();
    await settle();
    expect(initCalls()).toEqual([]);

    window.dispatchEvent(new Event('mase:booted'));
    await settle();
    expect(initCalls()).toEqual(INIT_ORDER);

    window.dispatchEvent(new Event('mase:booted'));
    await settle();
    expect(initCalls()).toEqual(INIT_ORDER);
  });
});
