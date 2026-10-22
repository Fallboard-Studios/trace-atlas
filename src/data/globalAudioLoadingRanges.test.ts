// ========================================
// IMPORTS
// ========================================
import { describe, it, expect } from 'vitest';

import { COLOUR_LOAD_MIX_MAX, GLOBAL_AUDIO_LOADING_RANGES, type LoadingRange } from './globalAudioLoadingRanges';
import {
  GLOBAL_AUDIO_SEED_RANGES,
  RETURN_FIELD_KEYS,
  type LoadingRangeKey,
} from './globalAudioSeedRanges';
import { ROBOT_SEND_LOADING_RANGES } from './robotSendLoadingRanges';

// ========================================
// TESTS
// ========================================

// Direct transcription of docs/reference/GLOBAL_CHAIN_GRID.md's "Loading
// Range" column — confirmed with the user effect-by-effect. The grid is the
// source of truth; this table (and this test) mirror it.
// The Reverb and Delay `wet` rows left at Robot Effect Sends T1: those keys are Returns, never seeded, and the per-robot
// send bands they used to carry live in src/data/robotSendLoadingRanges.ts.
const EXPECTED: Record<LoadingRangeKey, { min: number; max: number }> = {
  'eq3.low': { min: -6, max: 6 },
  'eq3.mid': { min: -6, max: 6 },
  'eq3.high': { min: -6, max: 6 },
  'filterLPF.frequency': { min: 2000, max: 20000 },
  'filterLPF.Q': { min: 0.1, max: 5 },
  'filterHPF.frequency': { min: 20, max: 120 },
  'filterHPF.Q': { min: 0.1, max: 5 },
  'delay.delayTime': { min: 0.05, max: 0.5 },
  'delay.feedback': { min: 0, max: 0.4 },
  'reverb.decay': { min: 0.5, max: 4 },
  'reverb.preDelay': { min: 0, max: 0.1 },
  // Classic Band Retune T6 (row 16, Crawford: "retune as proposed", 2026-10-21): -36 to -18 dB at 2-6:1. Attack, release and
  // knee are unchanged.
  'compressor.threshold': { min: -36, max: -18 },
  'compressor.ratio': { min: 2, max: 6 },
  'compressor.attack': { min: 0.003, max: 0.05 },
  'compressor.release': { min: 0.05, max: 0.3 },
  'compressor.knee': { min: 1, max: 15 },
  'limiter.threshold': { min: -3, max: -1 },
  // Global Colour T2 (docs/specs/GLOBAL_COLOUR.md assumption 7): the lit bands, placeholders tuned by ear in T14;
  // the three Mix bands retuned by Classic Band Retune T2 (0.2-0.3 / 0.25-0.35) and then, after Crawford's listen
  // (Checkpoint B, 2026-10-21: "much more subtle"), to one shared 0.1-0.2.
  'distortion.amount': { min: 0.1, max: 0.35 },
  'distortion.wet': { min: 0.1, max: 0.2 },
  'chebyshev.order': { min: 2, max: 5 },
  'chebyshev.wet': { min: 0.1, max: 0.2 },
  'bitCrusher.bits': { min: 6, max: 10 },
  'bitCrusher.wet': { min: 0.1, max: 0.2 },
  // Global Modulation T2 (docs/specs/GLOBAL_MODULATION_COLOUR.md assumption 6): the lit bands, retuned by Crawford's recommended ranges at T16 (2026-10-15).
  'autoWah.baseFrequency': { min: 50, max: 250 },
  'autoWah.octaves': { min: 2.5, max: 5 },
  // Classic Band Retune T1 (docs/tasks/CLASSIC_BAND_RETUNE.md §2 rows 5, 11): the AutoWah's Mix floor rises and its
  // sensitivity band narrows (a follower boosted by -sensitivity dB saturates at -40 on a fleet near 0 dBFS).
  'autoWah.sensitivity': { min: -20, max: -5 },
  'autoWah.Q': { min: 2, max: 6 },
  'autoWah.gain': { min: 2, max: 6 },
  'autoWah.follower': { min: 0.1, max: 0.4 },
  'autoWah.wet': { min: 0.35, max: 0.5 },
  'phaser.rate': { min: 0.1, max: 2.5 },
  'phaser.octaves': { min: 2, max: 5 },
  'phaser.baseFrequency': { min: 200, max: 800 },
  'phaser.stages': { min: 4, max: 12 },
  'phaser.Q': { min: 1, max: 10 },
  'phaser.wet': { min: 0.3, max: 0.4 },
  // Global Pedals T2 (docs/specs/GLOBAL_PEDALS.md assumption 6): the lit bands, placeholders tuned by ear at T16;
  // retuned by Classic Band Retune T1 (rows 1, 2, 7-9, 12).
  'chorus.rate': { min: 0.2, max: 2 },
  'chorus.delayTime': { min: 6, max: 15 },
  'chorus.depth': { min: 0.3, max: 0.7 },
  'chorus.spread': { min: 90, max: 180 },
  'chorus.feedback': { min: 0, max: 0.2 },
  'tremolo.rate': { min: 0.5, max: 6 },
  'tremolo.depth': { min: 0.3, max: 0.7 },
  'tremolo.spread': { min: 90, max: 180 },
  'tremolo.wet': { min: 0.35, max: 0.5 },
  'vibrato.rate': { min: 2, max: 7 },
  'vibrato.depth': { min: 0.03, max: 0.12 },
  'vibrato.wet': { min: 0.85, max: 1 },
  'frequencyShifter.shift': { min: 2, max: 20 },
  'stereoWidener.width': { min: 0.4, max: 0.65 },
};

const MOTION_PEDAL_PREFIXES = ['chorus.', 'tremolo.', 'vibrato.', 'frequencyShifter.'] as const;

describe('GLOBAL_AUDIO_LOADING_RANGES', () => {
  it('has exactly the key set of GLOBAL_AUDIO_SEED_RANGES less the Return keys — no more, no fewer', () => {
    const returns: readonly string[] = RETURN_FIELD_KEYS;
    expect(Object.keys(GLOBAL_AUDIO_LOADING_RANGES).sort()).toEqual(
      Object.keys(GLOBAL_AUDIO_SEED_RANGES).filter((key) => !returns.includes(key)).sort()
    );
  });

  // Robot Effect Sends T1 (spec assumption 5): a Return is never seeded, by type.
  it('has no Reverb or Delay wet row, and a Return row is a compile error, while the full ranges keep both keys', () => {
    expect(RETURN_FIELD_KEYS).toEqual(['reverb.wet', 'delay.wet', 'chorus.wet', 'frequencyShifter.wet']);
    expect('reverb.wet' in GLOBAL_AUDIO_LOADING_RANGES).toBe(false);
    expect('delay.wet' in GLOBAL_AUDIO_LOADING_RANGES).toBe(false);
    // @ts-expect-error - a Return key is not a LoadingRangeKey
    const row: Partial<Record<LoadingRangeKey, LoadingRange>> = { 'reverb.wet': { min: 0, max: 1 } };
    expect(row).toBeDefined();
    for (const key of RETURN_FIELD_KEYS) {
      expect(GLOBAL_AUDIO_SEED_RANGES[key], key).toStrictEqual({ min: 0, max: 1, scale: 'linear', step: 0.01 });
    }
  });

  it('matches docs/reference/GLOBAL_CHAIN_GRID.md\'s "Loading Range" column exactly, field by field', () => {
    for (const key of Object.keys(EXPECTED) as LoadingRangeKey[]) {
      expect(GLOBAL_AUDIO_LOADING_RANGES[key], key).toEqual(EXPECTED[key]);
    }
  });

  it('every loading range is a genuine subset of its field\'s full range', () => {
    for (const key of Object.keys(GLOBAL_AUDIO_LOADING_RANGES) as LoadingRangeKey[]) {
      const full = GLOBAL_AUDIO_SEED_RANGES[key];
      const loading = GLOBAL_AUDIO_LOADING_RANGES[key];
      expect(loading.min, `${key}: loading min should be >= full min`).toBeGreaterThanOrEqual(full.min);
      expect(loading.max, `${key}: loading max should be <= full max`).toBeLessThanOrEqual(full.max);
    }
  });

  it('keeps the loading band of each integer field on whole numbers, so a lit draw can land on both edges', () => {
    for (const key of ['chebyshev.order', 'bitCrusher.bits'] as const) {
      expect(Number.isInteger(GLOBAL_AUDIO_LOADING_RANGES[key].min), key + ' min').toBe(true);
      expect(Number.isInteger(GLOBAL_AUDIO_LOADING_RANGES[key].max), key + ' max').toBe(true);
    }
  });

  it('keeps every lit colour wet band above zero, so a lit node is always audible', () => {
    for (const key of ['distortion.wet', 'chebyshev.wet', 'bitCrusher.wet'] as const) {
      expect(GLOBAL_AUDIO_LOADING_RANGES[key].min, key).toBeGreaterThan(0);
    }
  });

  // Crawford, Global Colour T14 (2026-10-15): "don't allow any of the new color mixes to exceed .25 on load"; raised to
  // 0.35 by Classic Band Retune Decision 1 = B (2026-10-21), because the sends phase re-homes these three Mixes inside the
  // Colour room, so the fleet-wide Pixel protection the 0.25 gave stops applying. A fresh world seeds the Mix as a slider
  // position, so the ceiling is on the band the seed draws from. Saved sessions and share links carry whatever was
  // hand-set and are not clamped to it.
  it('holds the colour Mix ceiling back at 0.25 and never lets a colour wet band top out above it', () => {
    expect(COLOUR_LOAD_MIX_MAX).toBe(0.25);
    for (const key of ['distortion.wet', 'chebyshev.wet', 'bitCrusher.wet'] as const) {
      expect(GLOBAL_AUDIO_LOADING_RANGES[key].max, key).toBeLessThanOrEqual(COLOUR_LOAD_MIX_MAX);
    }
  });

  // Crawford's listen (Checkpoint B, 2026-10-21): the 0.2-0.35 bands were far too strong, "much more subtle". The wet layer
  // is sin(pi/2 * mix^2) (docs/tasks/CLASSIC_BAND_RETUNE.md §1): 0.1 is -36 dB, 0.15 -29 dB, 0.2 -24 dB, 0.3 -17 dB, 0.35 -14 dB.
  // So no lit colour effect may seed a wet layer above -23.5 dB, and none below -36.5 dB (a lit effect is still there).
  it('keeps every lit colour Mix subtle: the wet layer is between -36.5 dB at the floor and -23.5 dB at the ceiling', () => {
    const wetLayerDb = (mix: number) => 20 * Math.log10(Math.sin((Math.PI / 2) * mix * mix));
    for (const key of ['distortion.wet', 'chebyshev.wet', 'bitCrusher.wet'] as const) {
      expect(wetLayerDb(GLOBAL_AUDIO_LOADING_RANGES[key].min), `${key} floor`).toBeGreaterThanOrEqual(-36.5);
      expect(wetLayerDb(GLOBAL_AUDIO_LOADING_RANGES[key].max), `${key} ceiling`).toBeLessThanOrEqual(-23.5);
    }
  });

  // One band for all three (Crawford, 2026-10-21): the first retune split them, Distortion lower, with Chebyshev and Bit
  // Crusher above it, and he found every one too loud. Each band is a real band at least 0.05 wide.
  it('seeds all three colour Mixes from one shared band, and every colour band is a real band at least 0.05 wide', () => {
    expect(GLOBAL_AUDIO_LOADING_RANGES['distortion.wet']).toStrictEqual(GLOBAL_AUDIO_LOADING_RANGES['chebyshev.wet']);
    expect(GLOBAL_AUDIO_LOADING_RANGES['chebyshev.wet']).toStrictEqual(GLOBAL_AUDIO_LOADING_RANGES['bitCrusher.wet']);
    for (const key of ['distortion.wet', 'chebyshev.wet', 'bitCrusher.wet'] as const) {
      const { min, max } = GLOBAL_AUDIO_LOADING_RANGES[key];
      expect(max - min, key).toBeGreaterThanOrEqual(0.05 - 1e-9);
    }
  });

  it('keeps the colour ceiling off the send bands (it does not leak onto the robot send table)', () => {
    expect(ROBOT_SEND_LOADING_RANGES.reverbSend.max).toBeGreaterThan(COLOUR_LOAD_MIX_MAX);
    expect(ROBOT_SEND_LOADING_RANGES.delaySend.max).toBeGreaterThan(0);
  });

  // Global Modulation T16 (Crawford, 2026-10-15): the pedals no longer share Colour's Mix ceiling (spec assumption 9 said the bands and the ceiling may rise after the listen). Their recommended Mix bands (0.3-0.7, 0.25-0.6) were brought down a third after he heard them; the floors rose at Classic Band Retune T1.
  it('seeds the pedal Mix from its own bands, topping out above the colour ceiling', () => {
    expect(GLOBAL_AUDIO_LOADING_RANGES['autoWah.wet']).toStrictEqual({ min: 0.35, max: 0.5 });
    expect(GLOBAL_AUDIO_LOADING_RANGES['phaser.wet']).toStrictEqual({ min: 0.3, max: 0.4 });
    expect(GLOBAL_AUDIO_LOADING_RANGES['autoWah.wet'].max).toBeGreaterThan(COLOUR_LOAD_MIX_MAX);
    expect(GLOBAL_AUDIO_LOADING_RANGES['phaser.wet'].max).toBeGreaterThan(COLOUR_LOAD_MIX_MAX);
  });

  it('keeps both pedal Mix bands above zero, so a lit pedal is always audible', () => {
    for (const key of ['autoWah.wet', 'phaser.wet'] as const) {
      expect(GLOBAL_AUDIO_LOADING_RANGES[key].min, key).toBeGreaterThan(0);
    }
  });

  it('keeps phaser.stages seeded at 4 - 12, the full slider ceiling (the gate ran 12 on the Pixel)', () => {
    expect(GLOBAL_AUDIO_LOADING_RANGES['phaser.stages']).toStrictEqual({ min: 4, max: 12 });
    expect(GLOBAL_AUDIO_SEED_RANGES['phaser.stages']).toMatchObject({ min: 1, max: 12 });
  });

  it('puts both loading edges of every stepped pedal field on its full range grid, so a draw can land on either edge', () => {
    const pedalKeys = (Object.keys(GLOBAL_AUDIO_LOADING_RANGES) as LoadingRangeKey[]).filter(
      (key) => key.startsWith('autoWah.') || key.startsWith('phaser.'),
    );
    expect(pedalKeys).toHaveLength(13);
    for (const key of pedalKeys) {
      const { min: fullMin, step } = GLOBAL_AUDIO_SEED_RANGES[key];
      if (step === undefined) continue;
      for (const edge of ['min', 'max'] as const) {
        const stepsFromMin = (GLOBAL_AUDIO_LOADING_RANGES[key][edge] - fullMin) / step;
        expect(Math.abs(stepsFromMin - Math.round(stepsFromMin)), key + ' ' + edge).toBeLessThan(1e-9);
      }
    }
  });

  it('keeps every lit pedal field a real band: the wide fields are never a single point', () => {
    for (const key of ['autoWah.baseFrequency', 'autoWah.Q', 'autoWah.follower', 'phaser.rate', 'phaser.baseFrequency', 'phaser.Q'] as const) {
      const { min, max } = GLOBAL_AUDIO_LOADING_RANGES[key];
      expect(max / min, key).toBeGreaterThan(1.5);
    }
  });

  // Global Pedals T2 (docs/specs/GLOBAL_PEDALS.md assumption 6).
  it('keeps every motion pedal Mix band above zero, so a lit pedal is always audible', () => {
    // Robot Effect Sends T8: the Chorus and shifter Mixes are Returns with no loading row; the two in-chain pedals remain.
    for (const key of ['tremolo.wet', 'vibrato.wet'] as const) {
      expect(GLOBAL_AUDIO_LOADING_RANGES[key].min, key).toBeGreaterThan(0);
    }
  });

  it('seeds the shift as a magnitude band strictly above zero, inside the signed full range on the positive side', () => {
    const band = GLOBAL_AUDIO_LOADING_RANGES['frequencyShifter.shift'];
    const full = GLOBAL_AUDIO_SEED_RANGES['frequencyShifter.shift'];
    expect(band).toStrictEqual({ min: 2, max: 20 });
    expect(band.min).toBeGreaterThan(0);
    // The sign is a separate draw, so the negated band must fit inside the full range too.
    expect(-band.max).toBeGreaterThanOrEqual(full.min);
    expect(full.min).toBeLessThan(0);
  });

  it('never seeds the widener near a mono fold: the width band starts above zero and contains unity (0.5)', () => {
    const band = GLOBAL_AUDIO_LOADING_RANGES['stereoWidener.width'];
    expect(band.min).toBeGreaterThan(0);
    expect(band.min).toBeLessThanOrEqual(0.5);
    expect(band.max).toBeGreaterThanOrEqual(0.5);
  });

  it('puts both loading edges of every stepped Global Pedals field on its full range grid', () => {
    const keys = (Object.keys(GLOBAL_AUDIO_LOADING_RANGES) as LoadingRangeKey[]).filter(
      (key) => MOTION_PEDAL_PREFIXES.some((prefix) => key.startsWith(prefix)) || key.startsWith('stereoWidener.'),
    );
    // Robot Effect Sends T8: sixteen fields less the two Mixes that became Returns (chorus.wet, frequencyShifter.wet).
    expect(keys).toHaveLength(14);
    for (const key of keys) {
      const { min: fullMin, step } = GLOBAL_AUDIO_SEED_RANGES[key];
      expect(step, key + ' step').toBeDefined();
      for (const edge of ['min', 'max'] as const) {
        const stepsFromMin = (GLOBAL_AUDIO_LOADING_RANGES[key][edge] - fullMin) / (step as number);
        expect(Math.abs(stepsFromMin - Math.round(stepsFromMin)), key + ' ' + edge).toBeLessThan(1e-9);
      }
    }
  });

  it('keeps every lit pedal rate band a real band, never a single point', () => {
    for (const key of ['chorus.rate', 'tremolo.rate', 'vibrato.rate'] as const) {
      const { min, max } = GLOBAL_AUDIO_LOADING_RANGES[key];
      expect(max / min, key).toBeGreaterThan(1.5);
    }
  });

  // Classic Band Retune T1 (docs/tasks/CLASSIC_BAND_RETUNE.md §1). A Mix is stored as its slider position and squared at
  // the node; the bypass cell's wet layer is sin(pi/2 * mix^2) (DARK_EFFECT_BYPASS.md §1.1). The floors rose so a lit
  // pedal is never seeded at an inaudible wet layer: no lit motion pedal's floor sits below -20.5 dB.
  it('keeps every lit pedal Mix floor audible: the wet layer at the band floor is no quieter than -20.5 dB', () => {
    const wetLayerDb = (mix: number) => 20 * Math.log10(Math.sin((Math.PI / 2) * mix * mix));
    for (const key of ['autoWah.wet', 'phaser.wet', 'tremolo.wet', 'vibrato.wet'] as const) {
      expect(wetLayerDb(GLOBAL_AUDIO_LOADING_RANGES[key].min), key).toBeGreaterThanOrEqual(-20.5);
    }
  });

  it('seeds a Vibrato at (nearly) full wet, never a chorus: the Mix band sits at 0.85 or above and reaches 1', () => {
    expect(GLOBAL_AUDIO_LOADING_RANGES['vibrato.wet'].min).toBeGreaterThanOrEqual(0.85);
    expect(GLOBAL_AUDIO_LOADING_RANGES['vibrato.wet'].max).toBe(1);
  });

  it('keeps the Vibrato depth small enough that a full-wet pedal is a vibrato, not a siren: at most 0.12', () => {
    expect(GLOBAL_AUDIO_LOADING_RANGES['vibrato.depth'].max).toBeLessThanOrEqual(0.12);
  });

  it('seeds the high-pass cutoff below the lowest note any robot plays: C4 (261.63 Hz) and every octave-1..3 robot keep their fundamental', () => {
    const { min, max } = GLOBAL_AUDIO_LOADING_RANGES['filterHPF.frequency'];
    expect(max).toBeLessThan(261.63);
    // The band is still a real band, and the full range (which the LFO swing and the slider use) is untouched.
    expect(max / min).toBeGreaterThan(3);
    expect(GLOBAL_AUDIO_SEED_RANGES['filterHPF.frequency']).toMatchObject({ min: 20, max: 20000 });
  });

  it('keeps the AutoWah sensitivity out of the saturating zone: no lower than -20 dB, and the band still sweeps (5 dB or more wide)', () => {
    const { min, max } = GLOBAL_AUDIO_LOADING_RANGES['autoWah.sensitivity'];
    expect(min).toBeGreaterThanOrEqual(-20);
    expect(max - min).toBeGreaterThanOrEqual(5);
  });

  it('seeds the Chorus delay time at a chorus length, not a flanger length: no lower than 5 ms, while the full range still reaches 1 - 20 ms', () => {
    expect(GLOBAL_AUDIO_LOADING_RANGES['chorus.delayTime'].min).toBeGreaterThanOrEqual(5);
    expect(GLOBAL_AUDIO_SEED_RANGES['chorus.delayTime']).toMatchObject({ min: 1, max: 20 });
  });

  // Robot Effect Sends T8 (docs/specs/ROBOT_EFFECT_SENDS.md assumption 4): the Chorus and Frequency Shifter Mixes became
  // their rooms' Returns, never seeded, so their loading rows (Classic Band Retune rows 7 and 9) are history.
  it('has no Chorus or Frequency Shifter Mix row: both are Returns now, while the full ranges keep both keys', () => {
    expect('chorus.wet' in GLOBAL_AUDIO_LOADING_RANGES).toBe(false);
    expect('frequencyShifter.wet' in GLOBAL_AUDIO_LOADING_RANGES).toBe(false);
    expect(GLOBAL_AUDIO_SEED_RANGES['chorus.wet']).toMatchObject({ min: 0, max: 1 });
    expect(GLOBAL_AUDIO_SEED_RANGES['frequencyShifter.wet']).toMatchObject({ min: 0, max: 1 });
  });

  // Classic Band Retune T6 (docs/tasks/CLASSIC_BAND_RETUNE.md §7, the 2026-10-21 measurement). The Web Audio compressor
  // applies automatic makeup gain, so a deep threshold at a high ratio is a loudness lottery: the old band (-55 to -45 dB,
  // 10-20:1) swung fleet level by about 11 dB between seeds. The retuned band keeps a seeded Compressor shallow.
  it('seeds a shallow Compressor: threshold -36 to -18 dB, ratio 2-6:1, and attack, release and knee untouched', () => {
    expect(GLOBAL_AUDIO_LOADING_RANGES['compressor.threshold']).toStrictEqual({ min: -36, max: -18 });
    expect(GLOBAL_AUDIO_LOADING_RANGES['compressor.ratio']).toStrictEqual({ min: 2, max: 6 });
    expect(GLOBAL_AUDIO_LOADING_RANGES['compressor.attack']).toStrictEqual({ min: 0.003, max: 0.05 });
    expect(GLOBAL_AUDIO_LOADING_RANGES['compressor.release']).toStrictEqual({ min: 0.05, max: 0.3 });
    expect(GLOBAL_AUDIO_LOADING_RANGES['compressor.knee']).toStrictEqual({ min: 1, max: 15 });
  });

  it('keeps the Compressor threshold and ratio edges on whole numbers, so a draw can land on either edge', () => {
    for (const key of ['compressor.threshold', 'compressor.ratio'] as const) {
      expect(Number.isInteger(GLOBAL_AUDIO_LOADING_RANGES[key].min), key + ' min').toBe(true);
      expect(Number.isInteger(GLOBAL_AUDIO_LOADING_RANGES[key].max), key + ' max').toBe(true);
    }
  });

  it('keeps the Compressor band out of the deep, high-ratio corner: threshold never below -36 dB, ratio never above 6', () => {
    expect(GLOBAL_AUDIO_LOADING_RANGES['compressor.threshold'].min).toBeGreaterThanOrEqual(-36);
    expect(GLOBAL_AUDIO_LOADING_RANGES['compressor.ratio'].max).toBeLessThanOrEqual(6);
    // and still compresses something: the ratio floor is above 1 (unity) and the threshold ceiling is under 0 dB.
    expect(GLOBAL_AUDIO_LOADING_RANGES['compressor.ratio'].min).toBeGreaterThan(1);
    expect(GLOBAL_AUDIO_LOADING_RANGES['compressor.threshold'].max).toBeLessThan(0);
  });

  it('never has min >= max for any field', () => {
    for (const key of Object.keys(GLOBAL_AUDIO_LOADING_RANGES) as LoadingRangeKey[]) {
      const { min, max } = GLOBAL_AUDIO_LOADING_RANGES[key];
      expect(min, `${key}: min should be < max`).toBeLessThan(max);
    }
  });
});
