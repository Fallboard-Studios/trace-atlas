import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEVICE_FLAGS_KEY, hasHeardWorld, markHeardWorld } from './deviceFlags';
import { STORAGE_KEY as SESSIONS_KEY } from './sessionStorageEngine';

// The off screen's gate (docs/specs/OFF_SCREEN.md assumption 7, docs/tasks/OFF_SCREEN.md Task 5): one boolean per
// device, "has this tablet ever heard a world", written at the first power-on and gone with Factory Reset's
// localStorage.clear(). A first visit shows the hint alone; a returning device shows the chooser.
describe('deviceFlags — the heard-a-world flag', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('reads false on an empty storage', () => {
    expect(hasHeardWorld()).toBe(false);
  });

  it('reads true after markHeardWorld(), and false again after localStorage.clear() (Factory Reset)', () => {
    markHeardWorld();
    expect(hasHeardWorld()).toBe(true);

    localStorage.clear();
    expect(hasHeardWorld()).toBe(false);
  });

  it('marking twice is one flag, under one key', () => {
    markHeardWorld();
    const once = localStorage.getItem(DEVICE_FLAGS_KEY);
    markHeardWorld();
    expect(localStorage.getItem(DEVICE_FLAGS_KEY)).toBe(once);
    expect(localStorage.length).toBe(1);
  });

  it('touches neither the sessions key nor any other', () => {
    localStorage.setItem(SESSIONS_KEY, '{"sessions":[]}');
    markHeardWorld();
    hasHeardWorld();
    expect(localStorage.getItem(SESSIONS_KEY)).toBe('{"sessions":[]}');
    expect(DEVICE_FLAGS_KEY).not.toBe(SESSIONS_KEY);
  });

  it('reads false, and never throws, when the stored value is garbage', () => {
    localStorage.setItem(DEVICE_FLAGS_KEY, '{not json');
    expect(hasHeardWorld()).toBe(false);
    localStorage.setItem(DEVICE_FLAGS_KEY, '"a string"');
    expect(hasHeardWorld()).toBe(false);
    localStorage.setItem(DEVICE_FLAGS_KEY, '{"heardWorld":"yes"}');
    expect(hasHeardWorld()).toBe(false);
  });

  it('reads false, and never throws, when storage itself throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(hasHeardWorld()).toBe(false);
    expect(() => markHeardWorld()).not.toThrow();
  });
});
