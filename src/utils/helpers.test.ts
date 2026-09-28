import { describe, it, expect, vi, afterEach } from 'vitest';

afterEach(() => {
  vi.doUnmock('../constants');
  vi.resetModules();
  vi.restoreAllMocks();
});

describe('swallow', () => {
  it('calls console.warn with a message containing ctx when provided', async () => {
    const { swallow } = await import('./helpers');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    swallow(new Error('boom'), 'MyContext');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('MyContext'), expect.any(Error));
  });

  it('falls back to "ignored error" when ctx is omitted', async () => {
    const { swallow } = await import('./helpers');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    swallow(new Error('boom'));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('ignored error'), expect.any(Error));
  });

  it('does not throw even if console.warn itself throws', async () => {
    const { swallow } = await import('./helpers');
    vi.spyOn(console, 'warn').mockImplementation(() => {
      throw new Error('console is broken');
    });
    expect(() => swallow(new Error('boom'), 'ctx')).not.toThrow();
  });
});

describe('devWarn', () => {
  it('calls console.warn when DEV_TUNING is true', async () => {
    vi.doMock('../constants', () => ({ DEV_TUNING: true }));
    vi.resetModules();
    const { devWarn } = await import('./helpers');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    devWarn('hello');
    expect(warnSpy).toHaveBeenCalledWith('hello');
  });

  it('does not call console.warn when DEV_TUNING is false', async () => {
    vi.doMock('../constants', () => ({ DEV_TUNING: false }));
    vi.resetModules();
    const { devWarn } = await import('./helpers');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    devWarn('hello');
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

describe('formatSessionTimestamp', () => {
  it('includes a recognizable month/day and time-of-day for a known timestamp', async () => {
    const { formatSessionTimestamp } = await import('./helpers');
    // 2026-09-28T14:14:00 local time
    const ms = new Date(2026, 8, 28, 14, 14, 0).getTime();
    const formatted = formatSessionTimestamp(ms);

    expect(formatted).toMatch(/Sep/);
    expect(formatted).toMatch(/28/);
    expect(formatted).toMatch(/2:14/);
  });

  it('never includes the year', async () => {
    const { formatSessionTimestamp } = await import('./helpers');
    const ms = new Date(2026, 8, 28, 14, 14, 0).getTime();
    expect(formatSessionTimestamp(ms)).not.toMatch(/2026/);
  });

  it('is pure -- the same timestamp always formats identically', async () => {
    const { formatSessionTimestamp } = await import('./helpers');
    const ms = new Date(2026, 0, 1, 9, 5, 0).getTime();
    expect(formatSessionTimestamp(ms)).toBe(formatSessionTimestamp(ms));
  });
});

describe('getScreenViewportDomNode', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('returns the element when a node with id="screen-viewport" exists', async () => {
    const { getScreenViewportDomNode, SCREEN_VIEWPORT_ID } = await import('./helpers');
    const el = document.createElement('div');
    el.id = SCREEN_VIEWPORT_ID;
    document.body.appendChild(el);
    expect(getScreenViewportDomNode()).toBe(el);
  });

  it('returns null when no such node exists', async () => {
    const { getScreenViewportDomNode } = await import('./helpers');
    expect(getScreenViewportDomNode()).toBeNull();
  });
});
