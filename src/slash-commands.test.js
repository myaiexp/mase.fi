// Unit tests for the slash-command registry: pure formatters + buildCommands.
import { describe, it, expect, vi } from 'vitest';
import { describeAgent, formatServerTime, buildCommands } from './slash-commands.js';

describe('describeAgent', () => {
  it('detects Firefox on Linux', () => {
    expect(describeAgent('Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0'))
      .toBe('Firefox on Linux');
  });
  it('detects Chrome on Windows', () => {
    expect(describeAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36'))
      .toBe('Chrome on Windows');
  });
  it('prefers Edge over the Chrome token it carries', () => {
    expect(describeAgent('Mozilla/5.0 (Windows NT 10.0) Chrome/126.0 Safari/537.36 Edg/126.0'))
      .toBe('Edge on Windows');
  });
  it('detects Safari on iOS', () => {
    expect(describeAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605 Safari/604'))
      .toBe('Safari on iOS');
  });
  it('falls back to platform and unknown client', () => {
    expect(describeAgent('', 'SomePlatform')).toBe('an unknown client on SomePlatform');
  });
});

describe('formatServerTime', () => {
  it('formats a fixed date deterministically', () => {
    // 2026-06-24T14:32:05 local
    const d = new Date(2026, 5, 24, 14, 32, 5);
    expect(formatServerTime(d)).toBe('Wed 24 Jun 2026 \xb7 14:32:05');
  });
  it('zero-pads single-digit fields', () => {
    const d = new Date(2026, 0, 3, 9, 5, 7);
    expect(formatServerTime(d)).toBe('Sat 03 Jan 2026 \xb7 09:05:07');
  });
});

describe('buildCommands', () => {
  it('registers the five commands by name', () => {
    const names = buildCommands().map((c) => c.name);
    expect(names).toEqual(['help', 'whoami', 'uptime', 'date', 'clear']);
  });

  it('help lists every command and the channel-jump hint', () => {
    const help = buildCommands().find((c) => c.name === 'help');
    const lines = help.run();
    expect(lines[0]).toMatch(/slash commands/);
    expect(lines.some((l) => l.includes('/whoami'))).toBe(true);
    expect(lines.some((l) => l.includes('/clear'))).toBe(true);
    expect(lines[lines.length - 1]).toMatch(/jump to a channel/);
  });

  it('uptime uses meta.server and bootTime', () => {
    const data = { meta: { server: 'irc.test', bootTime: Date.now() - 3661000 } };
    const out = buildCommands({ data }).find((c) => c.name === 'uptime').run();
    expect(out).toMatch(/^irc\.test \xb7 up 0d 01h 01m \xb7 ping \d+ms$/);
  });

  it('clear invokes both clearSearch and clearNotices and prints nothing', () => {
    const clearSearch = vi.fn();
    const clearNotices = vi.fn();
    const out = buildCommands({ clearSearch, clearNotices }).find((c) => c.name === 'clear').run();
    expect(out).toBeNull();
    expect(clearSearch).toHaveBeenCalledOnce();
    expect(clearNotices).toHaveBeenCalledOnce();
  });
});
