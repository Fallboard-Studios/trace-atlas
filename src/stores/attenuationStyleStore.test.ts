// ========================================
// IMPORTS
// ========================================
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { useAttenuationStyleStore, DEFAULT_PELAGOS, selectCurrentAttenuationStyle } from './attenuationStyleStore';
import { encodeSessionPayload } from '../utils/sessionShareUtils';
import type { SessionPayload } from '../types/session';

// ========================================
// TESTS
// ========================================

describe('attenuationStyleStore', () => {
  beforeEach(() => {
    useAttenuationStyleStore.setState({ attenuationStyles: [{ ...DEFAULT_PELAGOS }], currentAttenuationStyleId: DEFAULT_PELAGOS.id });
  });

  describe('initial state', () => {
    it('has one Attenuation Style on init', () => {
      expect(useAttenuationStyleStore.getState().attenuationStyles).toHaveLength(1);
    });

    it('default Attenuation Style id is pelagos', () => {
      const pelagos = useAttenuationStyleStore.getState().attenuationStyles.find((p) => p.id === 'pelagos');
      expect(pelagos?.id).toBe('pelagos');
    });

    it('maintains serializable state', () => {
      expect(() => JSON.stringify(useAttenuationStyleStore.getState())).not.toThrow();
    });
  });

  describe('setCurrentLocale', () => {
    it('updates currentLocaleId', () => {
      useAttenuationStyleStore.getState().setCurrentLocale('pelagos', 'other-locale');
      const pelagos = useAttenuationStyleStore.getState().attenuationStyles.find((p) => p.id === 'pelagos');
      expect(pelagos?.currentLocaleId).toBe('other-locale');
    });
  });

  describe('addAttenuationStyle', () => {
    it('appends an Attenuation Style to the list', () => {
      useAttenuationStyleStore.getState().addAttenuationStyle({ ...DEFAULT_PELAGOS, id: 'new-planet', name: 'New' });
      expect(useAttenuationStyleStore.getState().attenuationStyles).toHaveLength(2);
      expect(useAttenuationStyleStore.getState().attenuationStyles[1].id).toBe('new-planet');
    });
  });

  describe('removeAttenuationStyle', () => {
    it('removes the Attenuation Style by id', () => {
      useAttenuationStyleStore.getState().removeAttenuationStyle('pelagos');
      expect(useAttenuationStyleStore.getState().attenuationStyles).toHaveLength(0);
    });

    it('does not affect other Attenuation Styles', () => {
      useAttenuationStyleStore.getState().addAttenuationStyle({ ...DEFAULT_PELAGOS, id: 'extra', name: 'Extra' });
      useAttenuationStyleStore.getState().removeAttenuationStyle('pelagos');
      expect(useAttenuationStyleStore.getState().attenuationStyles).toHaveLength(1);
      const extra = useAttenuationStyleStore.getState().attenuationStyles.find((p) => p.id === 'extra');
      expect(extra).toBeDefined();
    });
  });

  describe('currentAttenuationStyleId', () => {
    it('defaults to the default Attenuation Style on init', () => {
      expect(useAttenuationStyleStore.getState().currentAttenuationStyleId).toBe('pelagos');
    });

    it('updates via setCurrentAttenuationStyleId', () => {
      useAttenuationStyleStore.getState().addAttenuationStyle({ ...DEFAULT_PELAGOS, id: 'other', name: 'Other' });
      useAttenuationStyleStore.getState().setCurrentAttenuationStyleId('other');
      expect(useAttenuationStyleStore.getState().currentAttenuationStyleId).toBe('other');
    });

    it('does not validate the id against the attenuationStyles list', () => {
      // setCurrentAttenuationStyleId is a plain setter — selectCurrentAttenuationStyle is what
      // resolves a currentAttenuationStyleId that doesn't match any entry (see below).
      useAttenuationStyleStore.getState().setCurrentAttenuationStyleId('does-not-exist');
      expect(useAttenuationStyleStore.getState().currentAttenuationStyleId).toBe('does-not-exist');
    });
  });

  describe('selectCurrentAttenuationStyle', () => {
    it('returns the Attenuation Style matching currentAttenuationStyleId', () => {
      expect(selectCurrentAttenuationStyle(useAttenuationStyleStore.getState())?.id).toBe('pelagos');
    });

    it('returns the newly selected Attenuation Style after setCurrentAttenuationStyleId', () => {
      useAttenuationStyleStore.getState().addAttenuationStyle({ ...DEFAULT_PELAGOS, id: 'other', name: 'Other' });
      useAttenuationStyleStore.getState().setCurrentAttenuationStyleId('other');
      expect(selectCurrentAttenuationStyle(useAttenuationStyleStore.getState())?.id).toBe('other');
    });

    it('returns undefined without throwing when no Attenuation Style is selected', () => {
      useAttenuationStyleStore.getState().setCurrentAttenuationStyleId('does-not-exist');
      expect(() => selectCurrentAttenuationStyle(useAttenuationStyleStore.getState())).not.toThrow();
      expect(selectCurrentAttenuationStyle(useAttenuationStyleStore.getState())).toBeUndefined();
    });

    it('returns undefined without throwing when the attenuationStyles list is empty', () => {
      useAttenuationStyleStore.getState().removeAttenuationStyle('pelagos');
      expect(() => selectCurrentAttenuationStyle(useAttenuationStyleStore.getState())).not.toThrow();
      expect(selectCurrentAttenuationStyle(useAttenuationStyleStore.getState())).toBeUndefined();
    });
  });
});

describe('DEFAULT_ATTENUATION_STYLE_NAME -- ?session= share-payload priority (roadmap Phase 21)', () => {
  afterEach(() => {
    window.history.replaceState({}, '', '/');
    vi.resetModules();
  });

  function makePayload(overrides: Partial<SessionPayload> = {}): SessionPayload {
    return {
      version: 1,
      attenuationStyleName: 'Pelagos 7!',
      coordinates: { x: -5, y: 777 },
      globalAudio: {} as SessionPayload['globalAudio'],
      robotOverrides: {},
      companyDiffs: {},
      userCreatedCompanies: [],
      ...overrides,
    };
  }

  it('uses a share payload\'s exact, unsanitized attenuationStyleName when ?session= is present', async () => {
    const payload = makePayload({ attenuationStyleName: 'Pelagos 7!' });
    window.history.replaceState({}, '', `/?session=${encodeSessionPayload(payload)}`);
    vi.resetModules();

    const fresh = await import('./attenuationStyleStore');

    expect(fresh.DEFAULT_ATTENUATION_STYLE_NAME).toBe('Pelagos 7!');
  });

  it('falls back to a fresh random name when ?session= is absent', async () => {
    vi.resetModules();
    const fresh = await import('./attenuationStyleStore');
    expect(fresh.DEFAULT_ATTENUATION_STYLE_NAME).toMatch(/^[a-z0-9]+$/);
  });

  it('never touches the global seed override -- getGlobalAttenuationStyleSeedOverride() stays null after a share-link boot', async () => {
    const payload = makePayload({ attenuationStyleName: 'Pelagos 7!' });
    window.history.replaceState({}, '', `/?session=${encodeSessionPayload(payload)}`);
    vi.resetModules();

    await import('./attenuationStyleStore');
    const seed = await import('../utils/seedUtils');

    expect(seed.getGlobalAttenuationStyleSeedOverride()).toBeNull();
  });
});
