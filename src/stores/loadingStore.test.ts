// ========================================
// IMPORTS
// ========================================
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { DEFAULT_LOADING, useLoadingStore, type LoadingIdentity } from './loadingStore';
import { canonicalAspects, canonicalPicks, type AspectId } from '@/data/bands/aspects';
import { getBand } from '@/data/bands/loadingContext';
import { CLASSIC } from '@/data/bands/classic';

// ========================================
// MOCKS
// ========================================

// band-table T23: the loading context follows the store. The real Calm column is {} until the listen (plan Task 34), so
// one that moves bpm is injected over the spread originals.
vi.mock('@/data/bands/themes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/data/bands/themes')>();
  return { ...actual, THEMES: { ...actual.THEMES, calm: { bpm: { min: 150, max: 160 } } } };
});

// ========================================
// SETUP
// ========================================

const state = () => useLoadingStore.getState();

beforeEach(() => {
  // Through the action, so the context is reset with the store.
  useLoadingStore.getState().setLoading({ ...DEFAULT_LOADING });
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
      aspects: { melody: ['mechanical', 'hypnotic', 'hypnotic', 'zzz'] as AspectId[] },
    });
    expect(state().aspects).toStrictEqual({ melody: ['hypnotic', 'mechanical'] });
  });

  // docs/tasks/OFF_SCREEN_REVISIONS.md Task 6 (Crawford's note 4): the as-theme pick is gone; a stale one is an unknown id.
  it('drops a stale theme pick as any unknown id: wandering,theme is wandering alone', () => {
    state().setLoading({ theme: 'classic', aspects: { melody: ['wandering', 'theme' as AspectId] } });
    expect(state().aspects).toStrictEqual({ melody: ['wandering'] });
  });

  it('a list of only a stale theme pick is no family at all', () => {
    state().setLoading({ theme: 'classic', aspects: { melody: ['theme' as AspectId] } });
    expect(state().aspects).toStrictEqual({});
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
    state().setLoading({ theme: 'calm', aspects: { melody: ['zzz', 'yyy'] as unknown as AspectId[] } });
    expect(state().aspects).toStrictEqual({});
  });

  it('replaces the previous loading whole: a later setLoading with no aspects clears the earlier picks', () => {
    state().setLoading({ theme: 'calm', aspects: { melody: ['hypnotic', 'mechanical'] } });
    state().setLoading({ theme: 'perilous', aspects: {} });
    expect(state().theme).toBe('perilous');
    expect(state().aspects).toStrictEqual({});
  });

  it('never mutates the caller\'s list', () => {
    const picks: AspectId[] = ['wandering', 'hypnotic', 'hypnotic'];
    state().setLoading({ theme: 'classic', aspects: { melody: picks } });
    expect(picks).toEqual(['wandering', 'hypnotic', 'hypnotic']);
    expect(state().aspects.melody).not.toBe(picks);
  });

  it('holds only JSON: the loading round-trips through JSON.stringify unchanged', () => {
    state().setLoading({ theme: 'adventurous', aspects: { melody: ['hypnotic', 'mechanical'] } });
    const { theme, aspects } = state();
    expect(JSON.parse(JSON.stringify({ theme, aspects }))).toStrictEqual({ theme, aspects });
  });
});

describe('the loading context follows the store (band-table T23, spec assumptions 9 and 15)', () => {
  it('setLoading installs the theme\'s table: getBand reads Calm\'s bpm after the store moves to Calm, Classic\'s after it moves back', () => {
    state().setLoading({ theme: 'calm', aspects: {} });
    expect(getBand('bpm')).toStrictEqual({ min: 150, max: 160 });
    state().setLoading({ ...DEFAULT_LOADING });
    expect(getBand('bpm')).toStrictEqual(CLASSIC.bpm);
  });

  it('a direct setState is mirrored too: the context follows every write, not only the action', () => {
    useLoadingStore.setState({ theme: 'calm' });
    expect(getBand('bpm')).toStrictEqual({ min: 150, max: 160 });
  });

  it('aspects in the store never enter the context', () => {
    state().setLoading({ theme: 'calm', aspects: { melody: ['hypnotic', 'mechanical'] } });
    expect(getBand('robot.noteVariance')).toStrictEqual(CLASSIC['robot.noteVariance']);
    expect(getBand('robot.rhythmicDensity')).toStrictEqual(CLASSIC['robot.rhythmicDensity']);
  });
});

describe('canonicalPicks (spec assumption 9: lists in the family\'s canonical option order)', () => {
  it('sorts into option order and dedupes, dropping unknown ids: the plan\'s own case', () => {
    expect(canonicalPicks('melody', ['mechanical', 'hypnotic', 'hypnotic', 'zzz'] as AspectId[])).toEqual([
      'hypnotic',
      'mechanical',
    ]);
  });

  it('puts the options in their listed order', () => {
    expect(canonicalPicks('melody', ['wandering', 'mechanical', 'hypnotic'])).toEqual(['hypnotic', 'mechanical', 'wandering']);
  });

  it('drops a stale theme pick as any unknown id (revisions Task 6): theme,hypnotic is hypnotic', () => {
    expect(canonicalPicks('melody', ['theme' as AspectId, 'hypnotic'])).toEqual(['hypnotic']);
  });

  it('an empty list is an empty list', () => {
    expect(canonicalPicks('melody', [])).toEqual([]);
  });

  it('is idempotent: canonical in, the same list out, as a new array', () => {
    const once = canonicalPicks('melody', ['wandering', 'hypnotic']);
    const twice = canonicalPicks('melody', once);
    expect(twice).toEqual(once);
    expect(twice).not.toBe(once);
  });

  it('the same set in any order gives the same list, so a link encodes one way', () => {
    expect(canonicalPicks('melody', ['mechanical', 'hypnotic'])).toEqual(canonicalPicks('melody', ['hypnotic', 'mechanical']));
  });
});

// docs/tasks/OFF_SCREEN_REVISIONS.md Task 7: Envelope and Distance join Melody, each its own list.
describe('canonicalAspects over the three families (revisions Task 7)', () => {
  it('keeps every family, each list canonical, the families in family order', () => {
    const out = canonicalAspects({ distance: ['remote', 'near'], melody: ['wandering'], envelope: ['held', 'plucked', 'held'] });
    expect(out).toStrictEqual({ melody: ['wandering'], envelope: ['plucked', 'held'], distance: ['near', 'remote'] });
    expect(Object.keys(out)).toEqual(['melody', 'envelope', 'distance']);
  });

  it('drops an id from another family: hypnotic is no Envelope pick, plucked no Distance one', () => {
    expect(canonicalAspects({ envelope: ['hypnotic', 'held'], distance: ['plucked'] })).toStrictEqual({ envelope: ['held'] });
  });

  it('canonicalPicks orders each family by its own options', () => {
    expect(canonicalPicks('envelope', ['held', 'swelling', 'plucked'])).toEqual(['plucked', 'swelling', 'held']);
    expect(canonicalPicks('distance', ['remote', 'far', 'near'])).toEqual(['near', 'far', 'remote']);
  });

  it('the store holds all three families through setLoading, as JSON', () => {
    state().setLoading({ theme: 'calm', aspects: { envelope: ['swelling'], distance: ['far'], melody: ['mechanical'] } });
    expect(state().aspects).toStrictEqual({ melody: ['mechanical'], envelope: ['swelling'], distance: ['far'] });
    expect(JSON.parse(JSON.stringify(state().aspects))).toStrictEqual(state().aspects);
  });
});
