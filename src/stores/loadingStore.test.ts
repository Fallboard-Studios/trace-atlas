// ========================================
// IMPORTS
// ========================================
import { describe, it, expect, beforeEach } from 'vitest';

import { DEFAULT_LOADING, useLoadingStore, type LoadingIdentity } from './loadingStore';
import { canonicalPicks, type AspectPick } from '@/data/bands/aspects';

// ========================================
// SETUP
// ========================================

const state = () => useLoadingStore.getState();

beforeEach(() => {
  useLoadingStore.setState({ ...DEFAULT_LOADING });
});

// ========================================
// TESTS
// ========================================

describe('loadingStore (docs/specs/OFF_SCREEN.md assumption 9, plan Task 19)', () => {
  it('defaults to Classic with no aspects: every robot as theme', () => {
    expect(state().theme).toBe('classic');
    expect(state().aspects).toStrictEqual({});
    expect(DEFAULT_LOADING).toStrictEqual({ theme: 'classic', aspects: {} });
  });

  it('setLoading installs a theme and a family\'s picks', () => {
    state().setLoading({ theme: 'calm', aspects: { melody: ['hypnotic'] } });
    expect(state().theme).toBe('calm');
    expect(state().aspects).toStrictEqual({ melody: ['hypnotic'] });
  });

  it('keeps each list in canonical option order, deduped, unknown ids dropped', () => {
    state().setLoading({
      theme: 'bold',
      aspects: { melody: ['mechanical', 'hypnotic', 'hypnotic', 'zzz'] as AspectPick[] },
    });
    expect(state().aspects).toStrictEqual({ melody: ['hypnotic', 'mechanical'] });
  });

  it('sorts the as-theme pick first, so the list reads as the link does: theme,wandering', () => {
    state().setLoading({ theme: 'classic', aspects: { melody: ['wandering', 'theme'] } });
    expect(state().aspects).toStrictEqual({ melody: ['theme', 'wandering'] });
  });

  it('drops an empty family and an unknown family, so an all-as-theme world is always the one shape {}', () => {
    state().setLoading({ theme: 'calm', aspects: { melody: [] } });
    expect(state().aspects).toStrictEqual({});
    state().setLoading({
      theme: 'calm',
      aspects: { melody: ['hypnotic'], voice: ['warm'] } as unknown as LoadingIdentity['aspects'],
    });
    expect(state().aspects).toStrictEqual({ melody: ['hypnotic'] });
  });

  it('a list that is only unknown ids is dropped too', () => {
    state().setLoading({ theme: 'calm', aspects: { melody: ['zzz', 'yyy'] as unknown as AspectPick[] } });
    expect(state().aspects).toStrictEqual({});
  });

  it('replaces the previous loading whole: a later setLoading with no aspects clears the earlier picks', () => {
    state().setLoading({ theme: 'calm', aspects: { melody: ['hypnotic', 'mechanical'] } });
    state().setLoading({ theme: 'perilous', aspects: {} });
    expect(state().theme).toBe('perilous');
    expect(state().aspects).toStrictEqual({});
  });

  it('never mutates the caller\'s list', () => {
    const picks: AspectPick[] = ['wandering', 'theme', 'theme'];
    state().setLoading({ theme: 'classic', aspects: { melody: picks } });
    expect(picks).toEqual(['wandering', 'theme', 'theme']);
    expect(state().aspects.melody).not.toBe(picks);
  });

  it('holds only JSON: the loading round-trips through JSON.stringify unchanged', () => {
    state().setLoading({ theme: 'adventurous', aspects: { melody: ['theme', 'mechanical'] } });
    const { theme, aspects } = state();
    expect(JSON.parse(JSON.stringify({ theme, aspects }))).toStrictEqual({ theme, aspects });
  });
});

describe('canonicalPicks (spec assumption 9: lists in the family\'s canonical option order)', () => {
  it('sorts into option order and dedupes, dropping unknown ids: the plan\'s own case', () => {
    expect(canonicalPicks('melody', ['mechanical', 'hypnotic', 'hypnotic', 'zzz'] as AspectPick[])).toEqual([
      'hypnotic',
      'mechanical',
    ]);
  });

  it('puts the as-theme member first, then the options in their listed order', () => {
    expect(canonicalPicks('melody', ['wandering', 'mechanical', 'theme', 'hypnotic'])).toEqual([
      'theme',
      'hypnotic',
      'mechanical',
      'wandering',
    ]);
  });

  it('an empty list is an empty list', () => {
    expect(canonicalPicks('melody', [])).toEqual([]);
  });

  it('is idempotent: canonical in, the same list out, as a new array', () => {
    const once = canonicalPicks('melody', ['theme', 'wandering']);
    const twice = canonicalPicks('melody', once);
    expect(twice).toEqual(once);
    expect(twice).not.toBe(once);
  });

  it('the same set in any order gives the same list, so a link encodes one way', () => {
    expect(canonicalPicks('melody', ['mechanical', 'hypnotic'])).toEqual(canonicalPicks('melody', ['hypnotic', 'mechanical']));
  });
});
