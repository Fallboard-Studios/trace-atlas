// ========================================
// IMPORTS
// ========================================
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { getActiveLocaleId, useActiveLocaleId } from './localeHelpers';
import { useAttenuationStyleStore, DEFAULT_PELAGOS } from '@/stores/attenuationStyleStore';

// ========================================
// TESTS
// ========================================

describe('getActiveLocaleId', () => {
  beforeEach(() => {
    useAttenuationStyleStore.setState({ attenuationStyles: [{ ...DEFAULT_PELAGOS }], currentAttenuationStyleId: DEFAULT_PELAGOS.id });
  });

  it('returns the current Attenuation Style\'s currentLocaleId', () => {
    expect(getActiveLocaleId()).toBe(DEFAULT_PELAGOS.currentLocaleId);
  });

  it('follows setCurrentAttenuationStyleId to a newly selected Attenuation Style', () => {
    useAttenuationStyleStore.getState().addAttenuationStyle({
      ...DEFAULT_PELAGOS,
      id: 'other',
      name: 'Other',
      currentLocaleId: 'other-locale',
    });
    useAttenuationStyleStore.getState().setCurrentAttenuationStyleId('other');
    expect(getActiveLocaleId()).toBe('other-locale');
  });

  it('returns an empty string without throwing when no Attenuation Style is selected', () => {
    useAttenuationStyleStore.getState().setCurrentAttenuationStyleId('does-not-exist');
    expect(() => getActiveLocaleId()).not.toThrow();
    expect(getActiveLocaleId()).toBe('');
  });

  it('returns an empty string without throwing when the attenuationStyles list is empty', () => {
    useAttenuationStyleStore.getState().removeAttenuationStyle('pelagos');
    expect(() => getActiveLocaleId()).not.toThrow();
    expect(getActiveLocaleId()).toBe('');
  });
});

// The subscribed form, for a render body: a component that reads the id with it re-renders when the active locale
// changes. getActiveLocaleId() is a one-off read, for handlers and systems.
describe('useActiveLocaleId', () => {
  beforeEach(() => {
    useAttenuationStyleStore.setState({ attenuationStyles: [{ ...DEFAULT_PELAGOS }], currentAttenuationStyleId: DEFAULT_PELAGOS.id });
  });

  it('returns the active locale id', () => {
    const { result } = renderHook(() => useActiveLocaleId());
    expect(result.current).toBe(DEFAULT_PELAGOS.currentLocaleId);
  });

  it('follows the current style to another locale', () => {
    const { result } = renderHook(() => useActiveLocaleId());
    act(() => useAttenuationStyleStore.getState().setCurrentLocale(DEFAULT_PELAGOS.id, 'next-locale'));
    expect(result.current).toBe('next-locale');
  });

  it('follows a switch to another style', () => {
    const { result } = renderHook(() => useActiveLocaleId());
    act(() => {
      useAttenuationStyleStore.getState().addAttenuationStyle({ ...DEFAULT_PELAGOS, id: 'other', name: 'Other', currentLocaleId: 'other-locale' });
      useAttenuationStyleStore.getState().setCurrentAttenuationStyleId('other');
    });
    expect(result.current).toBe('other-locale');
  });

  it('is an empty string when no style is selected', () => {
    const { result } = renderHook(() => useActiveLocaleId());
    act(() => useAttenuationStyleStore.getState().setCurrentAttenuationStyleId('does-not-exist'));
    expect(result.current).toBe('');
  });
});
