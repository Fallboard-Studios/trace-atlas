// ========================================
// MOCKS
// ========================================
import { describe, it, expect, beforeEach, vi } from 'vitest';

/*
 * docs/tasks/OFF_SCREEN.md Task 15 (spec assumption 12): the boot path OceanScene's mount effect runs, as a unit —
 * build the world with its systems held or started by the power state, then either apply the arrival link's payload
 * over it (the arrival URL stands, blob included) or, on a bare boot, mirror the random identity the stores rolled
 * into the address bar so a reload brings the same world back. Never both, and never a mirror while a link's URL is
 * in the bar.
 */
const calls = vi.hoisted(() => ({ order: [] as string[] }));
vi.mock('./worldTransition', () => ({
  initializeLocale: vi.fn(() => calls.order.push('initializeLocale')),
}));
vi.mock('../utils/sessionDiff', () => ({
  applySessionPayload: vi.fn(() => calls.order.push('applySessionPayload')),
}));
const share = vi.hoisted(() => ({
  consume: vi.fn<() => unknown>(),
  get: vi.fn<() => unknown>(),
  mirror: vi.fn(),
}));
vi.mock('../utils/sessionShareUtils', () => ({
  consumeSessionSharePayload: () => share.consume(),
  getSessionSharePayload: () => share.get(),
  mirrorWorldToUrl: (identity: unknown) => {
    calls.order.push('mirrorWorldToUrl');
    share.mirror(identity);
  },
}));

// ========================================
// IMPORTS
// ========================================
import { bootWorld } from './worldBoot';
import { initializeLocale } from './worldTransition';
import { applySessionPayload } from '../utils/sessionDiff';
import { useAttenuationStyleStore, DEFAULT_PELAGOS } from '../stores/attenuationStyleStore';
import { useLocaleStore, DEFAULT_LOCALE, DEFAULT_LOCALE_ID } from '../stores/localeStore';
import { useUIStore } from '../stores/uiStore';
import { untouchedWorld } from '../testUtils/worldLinkFixtures';

// ========================================
// TESTS
// ========================================

describe('bootWorld', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    calls.order.length = 0;
    share.consume.mockReturnValue(null);
    share.get.mockReturnValue(null);
    useAttenuationStyleStore.setState({ attenuationStyles: [{ ...DEFAULT_PELAGOS }], currentAttenuationStyleId: DEFAULT_PELAGOS.id });
    useLocaleStore.setState({ locales: { [DEFAULT_LOCALE_ID]: { ...DEFAULT_LOCALE, robots: [], actors: [] } } });
    useUIStore.setState({ isPoweredOn: false });
  });

  it('builds the world first, with its systems held while the tablet is off', () => {
    bootWorld(DEFAULT_LOCALE_ID);
    expect(initializeLocale).toHaveBeenCalledTimes(1);
    expect(initializeLocale).toHaveBeenCalledWith(DEFAULT_LOCALE_ID, { startSystems: false });
    expect(calls.order[0]).toBe('initializeLocale');
  });

  it('starts the systems when the tablet is already on', () => {
    useUIStore.setState({ isPoweredOn: true });
    bootWorld(DEFAULT_LOCALE_ID);
    expect(initializeLocale).toHaveBeenCalledWith(DEFAULT_LOCALE_ID, { startSystems: true });
  });

  it('a bare boot (no link in the address bar) applies nothing and mirrors the identity the stores rolled, after the build', () => {
    bootWorld(DEFAULT_LOCALE_ID);
    expect(applySessionPayload).not.toHaveBeenCalled();
    expect(share.mirror).toHaveBeenCalledTimes(1);
    // band-table T24: the identity carries the loading too (Classic, nothing dealt, for a bare boot).
    expect(share.mirror).toHaveBeenCalledWith({
      attenuationStyleName: DEFAULT_PELAGOS.name,
      coordinates: DEFAULT_LOCALE.coordinates,
      theme: 'classic',
      aspects: {},
    });
    expect(calls.order).toEqual(['initializeLocale', 'mirrorWorldToUrl']);
  });

  it('a link arrival applies its payload over the built world, with skipLocaleRebuild, and mirrors nothing: the arrival URL stands', () => {
    const payload = untouchedWorld();
    share.consume.mockReturnValue(payload);
    share.get.mockReturnValue(payload);
    bootWorld(DEFAULT_LOCALE_ID);
    expect(applySessionPayload).toHaveBeenCalledTimes(1);
    expect(applySessionPayload).toHaveBeenCalledWith(payload, { skipLocaleRebuild: true });
    expect(share.mirror).not.toHaveBeenCalled();
    expect(calls.order).toEqual(['initializeLocale', 'applySessionPayload']);
  });

  it('a second boot in the same page load after a link arrival (a remount) neither re-applies nor mirrors — the blob is not dropped', () => {
    const payload = untouchedWorld();
    share.consume.mockReturnValueOnce(payload).mockReturnValue(null);
    share.get.mockReturnValue(payload);
    bootWorld(DEFAULT_LOCALE_ID);
    bootWorld(DEFAULT_LOCALE_ID);
    expect(applySessionPayload).toHaveBeenCalledTimes(1);
    expect(share.mirror).not.toHaveBeenCalled();
    expect(initializeLocale).toHaveBeenCalledTimes(2);
  });

  it('a second bare boot mirrors again — harmless, mirrorWorldToUrl writes nothing when the bar already names the world', () => {
    bootWorld(DEFAULT_LOCALE_ID);
    bootWorld(DEFAULT_LOCALE_ID);
    expect(share.mirror).toHaveBeenCalledTimes(2);
  });

  it('mirrors nothing when the stores hold no current world to name', () => {
    useAttenuationStyleStore.setState({ attenuationStyles: [], currentAttenuationStyleId: 'nobody' });
    expect(() => bootWorld(DEFAULT_LOCALE_ID)).not.toThrow();
    expect(share.mirror).not.toHaveBeenCalled();
  });
});
