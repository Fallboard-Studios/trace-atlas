// ========================================
// IMPORTS
// ========================================
import { describe, it, expect, vi, afterEach } from 'vitest';

import { getBand, setLoading, withLoading } from './loadingContext';
import { CLASSIC } from './classic';
import { DEFAULT_LOADING, type LoadingIdentity } from './loadingIdentity';
import type { BandKey } from './bandKeys';

// ========================================
// MOCKS
// ========================================

// The context is proved on injected columns, whatever the real placeholders hold (plan Task 34 filled them, Task 35 tunes
// them): Calm and Bold get one key each here, Perilous an EMPTY column, Hypnotic one Melody key, over the spread originals.
vi.mock('./themes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./themes')>();
  return {
    ...actual,
    THEMES: {
      ...actual.THEMES,
      calm: { bpm: { min: 150, max: 160 } },
      bold: { 'robot.rests': { min: 0, max: 10 } },
      perilous: {},
    },
  };
});

vi.mock('./aspects', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./aspects')>();
  const melody = actual.ASPECT_FAMILIES.melody;
  return {
    ...actual,
    ASPECT_FAMILIES: {
      ...actual.ASPECT_FAMILIES,
      melody: { ...melody, options: { ...melody.options, hypnotic: { 'robot.noteVariance': { offShare: 0, min: 1, max: 2 } } } },
    },
  };
});

// ========================================
// SETUP
// ========================================

const CALM: LoadingIdentity = { theme: 'calm', aspects: {} };
const BOLD: LoadingIdentity = { theme: 'bold', aspects: {} };
const CALM_HYPNOTIC: LoadingIdentity = { theme: 'calm', aspects: { melody: ['hypnotic'] } };

/** Every band as the context reads it now. */
const snapshot = () => Object.fromEntries((Object.keys(CLASSIC) as BandKey[]).map((key) => [key, getBand(key)]));

afterEach(() => {
  setLoading(DEFAULT_LOADING);
});

// ========================================
// TESTS
// ========================================

describe('loadingContext (docs/specs/OFF_SCREEN.md assumption 15, plan Task 20)', () => {
  it('reads Classic until a world installs a theme: every key is CLASSIC\'s', () => {
    expect(snapshot()).toStrictEqual(CLASSIC);
  });

  it('setLoading installs the theme\'s table: Calm moves bpm and nothing else', () => {
    setLoading(CALM);
    expect(getBand('bpm')).toStrictEqual({ min: 150, max: 160 });
    expect(snapshot()).toStrictEqual({ ...CLASSIC, bpm: { min: 150, max: 160 } });
  });

  it('aspects in the identity never enter the context: Calm with Hypnotic picked leaves robot.noteVariance Classic\'s', () => {
    setLoading(CALM_HYPNOTIC);
    expect(getBand('robot.noteVariance')).toStrictEqual(CLASSIC['robot.noteVariance']);
    expect(snapshot()).toStrictEqual({ ...CLASSIC, bpm: { min: 150, max: 160 } });
  });

  it('setLoading replaces the previous table whole: Calm then Bold has Classic\'s bpm and Bold\'s rests', () => {
    setLoading(CALM);
    setLoading(BOLD);
    expect(getBand('bpm')).toStrictEqual(CLASSIC.bpm);
    expect(getBand('robot.rests')).toStrictEqual({ min: 0, max: 10 });
  });

  it('setLoading of Classic restores every band', () => {
    setLoading(CALM);
    setLoading(DEFAULT_LOADING);
    expect(snapshot()).toStrictEqual(CLASSIC);
  });

  it('a theme whose column is empty (Perilous, injected empty) reads as Classic', () => {
    setLoading({ theme: 'perilous', aspects: {} });
    expect(snapshot()).toStrictEqual(CLASSIC);
  });

  it('withLoading installs for the duration of fn and then restores what was installed before, not Classic', () => {
    setLoading(BOLD);
    const inside = withLoading(CALM, () => ({ bpm: getBand('bpm'), rests: getBand('robot.rests') }));
    expect(inside).toStrictEqual({ bpm: { min: 150, max: 160 }, rests: CLASSIC['robot.rests'] });
    expect(getBand('bpm')).toStrictEqual(CLASSIC.bpm);
    expect(getBand('robot.rests')).toStrictEqual({ min: 0, max: 10 });
  });

  it('withLoading returns fn\'s value', () => {
    expect(withLoading(CALM, () => 42)).toBe(42);
  });

  it('withLoading restores after a throw and rethrows the error', () => {
    const boom = new Error('boom');
    expect(() =>
      withLoading(CALM, () => {
        throw boom;
      }),
    ).toThrow(boom);
    expect(snapshot()).toStrictEqual(CLASSIC);
  });

  it('withLoading nests: the inner identity is installed inside, the outer one is back after it, Classic after both', () => {
    const seen = withLoading(BOLD, () => {
      const innerBpm = withLoading(CALM, () => getBand('bpm'));
      return { innerBpm, outerBpm: getBand('bpm'), outerRests: getBand('robot.rests') };
    });
    expect(seen).toStrictEqual({ innerBpm: { min: 150, max: 160 }, outerBpm: CLASSIC.bpm, outerRests: { min: 0, max: 10 } });
    expect(snapshot()).toStrictEqual(CLASSIC);
  });

  it('withLoading ignores aspects too', () => {
    const variance = withLoading(CALM_HYPNOTIC, () => getBand('robot.noteVariance'));
    expect(variance).toStrictEqual(CLASSIC['robot.noteVariance']);
  });

  it('getBand is typed by its key\'s kind', () => {
    expect(getBand('robot.noteVariance').offShare).toBe(0.15);
    expect(getBand('reverbSend').lit).toBe(1);
    // @ts-expect-error - a range band carries no lit share
    expect(getBand('bpm').lit).toBeUndefined();
  });
});
