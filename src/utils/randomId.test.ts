// ========================================
// IMPORTS
// ========================================
import { describe, it, expect, afterEach, vi } from 'vitest';

import { generateUUID } from './randomId';

// ========================================
// HELPERS
// ========================================
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// ========================================
// TESTS
// ========================================

describe('generateUUID', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the native crypto.randomUUID when it exists (secure contexts)', () => {
    const randomUUID = vi.fn(() => '11111111-2222-4333-8444-555555555555');
    vi.stubGlobal('crypto', { randomUUID, getRandomValues: vi.fn() });
    expect(generateUUID()).toBe('11111111-2222-4333-8444-555555555555');
    expect(randomUUID).toHaveBeenCalledTimes(1);
  });

  it('falls back to getRandomValues when randomUUID is missing — as on an http:// LAN address, an insecure context', () => {
    // Regression: `crypto.randomUUID is not a function` aborted AudioEngine.start() (beatClock's
    // scheduleRepeat) when the app was opened from a phone over http://<lan-ip>, so the power
    // rocker snapped back and the tablet never powered on.
    const getRandomValues = vi.fn((bytes: Uint8Array) => {
      for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 37 + 11) & 0xff;
      return bytes;
    });
    vi.stubGlobal('crypto', { getRandomValues });
    const id = generateUUID();
    expect(id).toMatch(UUID_V4);
    expect(getRandomValues).toHaveBeenCalledTimes(1);
  });

  it('produces distinct, well-formed v4 ids from the fallback', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: (bytes: Uint8Array) => {
        for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
        return bytes;
      },
    });
    const ids = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const id = generateUUID();
      expect(id).toMatch(UUID_V4);
      ids.add(id);
    }
    expect(ids.size).toBe(500);
  });

  it('still returns a well-formed id when crypto is absent entirely', () => {
    vi.stubGlobal('crypto', undefined);
    const a = generateUUID();
    const b = generateUUID();
    expect(a).toMatch(UUID_V4);
    expect(b).toMatch(UUID_V4);
    expect(a).not.toBe(b);
  });
});
