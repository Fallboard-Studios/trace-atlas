// ========================================
// IMPORTS
// ========================================
import { describe, it, expect, beforeEach } from 'vitest';

import { currentWorldIdentity } from './worldIdentity';
import { useAttenuationStyleStore, DEFAULT_PELAGOS } from '../stores/attenuationStyleStore';
import { useLocaleStore, DEFAULT_LOCALE } from '../stores/localeStore';
import { DEFAULT_LOADING, useLoadingStore } from '../stores/loadingStore';

// ========================================
// TESTS
// ========================================

describe('currentWorldIdentity (docs/specs/OFF_SCREEN.md assumption 12; the loading joins at band-table T24)', () => {
  const localeId = 'world-identity-locale';

  beforeEach(() => {
    useAttenuationStyleStore.setState({
      attenuationStyles: [{ ...DEFAULT_PELAGOS, currentLocaleId: localeId }],
      currentAttenuationStyleId: DEFAULT_PELAGOS.id,
    });
    useLocaleStore.setState({ locales: { [localeId]: { ...DEFAULT_LOCALE, id: localeId, coordinates: { x: 3, y: -4 } } } });
    useLoadingStore.getState().setLoading(DEFAULT_LOADING);
  });

  it('is the current style\'s name, its locale\'s coordinates, and the loading store\'s theme and aspects', () => {
    useLoadingStore.getState().setLoading({ theme: 'bold', aspects: { melody: ['wandering', 'hypnotic'] } });
    expect(currentWorldIdentity()).toEqual({
      attenuationStyleName: DEFAULT_PELAGOS.name,
      coordinates: { x: 3, y: -4 },
      theme: 'bold',
      aspects: { melody: ['hypnotic', 'wandering'] },
    });
  });

  it('is Classic with no aspects for an untouched store', () => {
    expect(currentWorldIdentity()).toEqual({
      attenuationStyleName: DEFAULT_PELAGOS.name,
      coordinates: { x: 3, y: -4 },
      theme: 'classic',
      aspects: {},
    });
  });

  it('is undefined when the current style has no locale', () => {
    useLocaleStore.setState({ locales: {} });
    expect(currentWorldIdentity()).toBeUndefined();
  });
});
