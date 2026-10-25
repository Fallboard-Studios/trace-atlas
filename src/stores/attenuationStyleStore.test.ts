// ========================================
// IMPORTS
// ========================================
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { useAttenuationStyleStore, DEFAULT_PELAGOS, selectCurrentAttenuationStyle } from './attenuationStyleStore';

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

describe('DEFAULT_ATTENUATION_STYLE_NAME -- the world link in the address bar (docs/specs/SHORT_WORLD_LINK.md)', () => {
  afterEach(() => {
    window.history.replaceState({}, '', '/');
    vi.resetModules();
  });

  /** A fresh store module, loaded with `query` in the address bar. */
  async function loadWithQuery(query: string) {
    window.history.replaceState({}, '', `/${query}`);
    vi.resetModules();
    return import('./attenuationStyleStore');
  }

  it('is the exact, unsanitized seed of a world link (?seed=Pelagos%207%21&x=29&y=-14)', async () => {
    const fresh = await loadWithQuery('?seed=Pelagos%207%21&x=29&y=-14');
    expect(fresh.DEFAULT_ATTENUATION_STYLE_NAME).toBe('Pelagos 7!');
  });

  it('is the seed of a link whose blob is unreadable: a bad blob drops alone, never the name', async () => {
    const fresh = await loadWithQuery('?seed=Pelagos%207%21&x=29&y=-14&s=2.notablob');
    expect(fresh.DEFAULT_ATTENUATION_STYLE_NAME).toBe('Pelagos 7!');
  });

  it('is a fresh random name when the link has coordinates but no seed (only the missing part is drawn)', async () => {
    const fresh = await loadWithQuery('?x=29&y=-14');
    expect(fresh.DEFAULT_ATTENUATION_STYLE_NAME).toMatch(/^[a-z0-9]+$/);
  });

  it('falls back to a fresh random name when the address bar names no world', async () => {
    const fresh = await loadWithQuery('?debug');
    expect(fresh.DEFAULT_ATTENUATION_STYLE_NAME).toMatch(/^[a-z0-9]+$/);
  });

  it('never touches the global seed override -- getGlobalAttenuationStyleSeedOverride() stays null after a world-link boot', async () => {
    window.history.replaceState({}, '', '/?seed=Pelagos%207%21&x=29&y=-14');
    vi.resetModules();

    await import('./attenuationStyleStore');
    const seed = await import('../utils/seedUtils');

    expect(seed.getGlobalAttenuationStyleSeedOverride()).toBeNull();
  });
});
