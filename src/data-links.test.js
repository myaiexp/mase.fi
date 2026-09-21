// Unit tests for fetchData's project links builder: p.url → links[]. The builder
// must surface only http(s) links and drop protocol-based XSS vectors
// (javascript:/data:/vbscript:) that parse cleanly via new URL() but carry no
// usable host. Scheme-relative / backslash forms (`//host`, `/\host`) throw
// without a base and must not be kept as-is.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchData } from './data.js';
import { stubFetch } from './data-test-helpers.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('fetchData project links', () => {
  async function linksFor(url) {
    stubFetch({ projects: [{ name: 'P', channel: 'p', url }], entries: [] });
    const data = await fetchData();
    return data.projects[0].links;
  }

  it('builds an http(s) link labelled by host, stripping a www. prefix', async () => {
    expect(await linksFor('https://www.example.com/path')).toEqual([
      { label: 'example.com', href: 'https://www.example.com/path' },
    ]);
  });

  it('keeps a bare https host as the label', async () => {
    expect(await linksFor('https://mase.fi/explorer')).toEqual([
      { label: 'mase.fi', href: 'https://mase.fi/explorer' },
    ]);
  });

  it('drops a javascript: URL (parses cleanly but is not http/https)', async () => {
    expect(await linksFor('javascript:alert(1)')).toEqual([]);
  });

  it('drops a data: URL', async () => {
    expect(await linksFor('data:text/html,<script>alert(1)</script>')).toEqual([]);
  });

  it('drops a vbscript: URL', async () => {
    expect(await linksFor('vbscript:msgbox(1)')).toEqual([]);
  });

  it('falls back to an "open" link for a schemeless/relative URL', async () => {
    expect(await linksFor('/explorer')).toEqual([{ label: 'open', href: '/explorer' }]);
  });

  it('drops scheme-relative and backslash forms that resolve off-origin', async () => {
    expect(await linksFor('//evil.com')).toEqual([]);
    expect(await linksFor('//evil.com/x')).toEqual([]);
    expect(await linksFor('/\\evil.com')).toEqual([]);
    expect(await linksFor('\\\\evil.com')).toEqual([]);
  });

  it('keeps an absolute http(s) URL even when the host is not mase.fi', async () => {
    expect(await linksFor('https://github.com/mase/explorer')).toEqual([
      { label: 'github.com', href: 'https://github.com/mase/explorer' },
    ]);
  });

  it('produces no links when the project has no url', async () => {
    expect(await linksFor(undefined)).toEqual([]);
  });
});
