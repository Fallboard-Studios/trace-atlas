// Tests for the pure helpers behind `npm run perf:level` (scripts/perf/output-level.mjs).
// The Chrome/CDP plumbing is not unit-tested; it is verified by a real run (see docs/PERFORMANCE.md).
import { describe, expect, it } from 'vitest';

import { parseOutputFromHud, summarizeLevels } from './output-level-lib.mjs';

// ========================================
// HELPERS
// ========================================

/** A HUD's text with `outputLine` among its neighbours, one line per row as the probe reads it. */
function hud(outputLine) {
  return [
    'random @ -116,-2   up 0:42',
    'ctx running   clock x1.00   transport started',
    'voices 6/16   audible 7/12',
    'fps 60   lag 4ms (max 18ms)',
    outputLine,
    'underruns 0 (0ms) · lat 44ms (0-47)',
    'no events yet',
  ].join('\n');
}

/** One probe reading: peaks and RMS in dB (`null` for no reading, `-Infinity` for silence) and the `fin` token. */
const reading = (t, outPeakDb, prePeakDb, outRmsDb = null, fin = 'ok') => ({ t, outPeakDb, outRmsDb, prePeakDb, fin });

// ========================================
// THE HUD'S OUTPUT LINE
// ========================================

describe('parseOutputFromHud', () => {
  it('reads master peak, master RMS and pre-chain peak as dB numbers, each with its own sign', () => {
    expect(parseOutputFromHud(hud('out 1.2dB rms -14.0dB  pre -5.1dB  fin ok'))).toEqual({
      outPeakDb: 1.2,
      outRmsDb: -14,
      prePeakDb: -5.1,
      fin: 'ok',
    });
  });

  it('keeps the taps apart: a negative master peak beside a positive pre-chain peak', () => {
    expect(parseOutputFromHud(hud('out -2.5dB rms -17.25dB  pre 12.8dB  fin ok'))).toEqual({
      outPeakDb: -2.5,
      outRmsDb: -17.25,
      prePeakDb: 12.8,
      fin: 'ok',
    });
  });

  it('reads a dash as null, a tap with no reading', () => {
    expect(parseOutputFromHud(hud('out - rms -  pre -  fin -'))).toEqual({
      outPeakDb: null,
      outRmsDb: null,
      prePeakDb: null,
      fin: null,
    });
    expect(parseOutputFromHud(hud('out -6.0dB rms -12.0dB  pre -  fin ok'))).toEqual({
      outPeakDb: -6,
      outRmsDb: -12,
      prePeakDb: null,
      fin: 'ok',
    });
  });

  it('reads -inf as -Infinity, a silent tap, not as null or a dash', () => {
    expect(parseOutputFromHud(hud('out -inf rms -inf  pre -9.5dB  fin ok'))).toEqual({
      outPeakDb: -Infinity,
      outRmsDb: -Infinity,
      prePeakDb: -9.5,
      fin: 'ok',
    });
  });

  it('reads the non-finite flag', () => {
    expect(parseOutputFromHud(hud('out -120.0dB rms -120.0dB  pre -120.0dB  fin NaN!'))).toEqual({
      outPeakDb: -120,
      outRmsDb: -120,
      prePeakDb: -120,
      fin: 'NaN!',
    });
  });

  it('reads a level the HUD rounded to -0.0 as plain 0, so it counts as reaching full scale', () => {
    const parsed = parseOutputFromHud(hud('out -0.0dB rms -11.0dB  pre 0.0dB  fin ok'));
    expect(Object.is(parsed.outPeakDb, 0)).toBe(true);
    expect(Object.is(parsed.prePeakDb, 0)).toBe(true);
  });

  it('finds the line when the rows run together, as the HUD element textContent joins them', () => {
    const text = 'fps 60   lag 4ms (max 18ms)out -3.0dB rms -15.5dB  pre 1.0dB  fin okunderruns 0 (0ms) · lat 44ms (0-47)';
    expect(parseOutputFromHud(text)).toEqual({ outPeakDb: -3, outRmsDb: -15.5, prePeakDb: 1, fin: 'ok' });
  });

  it('returns null when there is no output line', () => {
    expect(parseOutputFromHud('')).toBeNull();
    expect(parseOutputFromHud(null)).toBeNull();
    expect(parseOutputFromHud(undefined)).toBeNull();
    expect(parseOutputFromHud('voices 3/16   audible 5/12\nfps 60   lag 4ms (max 18ms)')).toBeNull();
  });

  it('returns null for a line whose tokens are not levels, rather than guessing', () => {
    expect(parseOutputFromHud(hud('out loud rms -14.0dB  pre -5.1dB  fin ok'))).toBeNull();
    expect(parseOutputFromHud(hud('out 1.2dB rms -14.0dB  pre -5.1dB  fin maybe'))).toBeNull();
  });
});

// ========================================
// THE SUMMARY
// ========================================

describe('summarizeLevels', () => {
  it('gives each tap its peak max, peak mean, count and share of readings at or above 0 dB', () => {
    const summary = summarizeLevels([
      reading(0, -3, -8, -15),
      reading(0.5, -1, -6, -13),
      reading(1, 0.4, -4, -12),
      reading(1.5, 2, -2, -10),
    ]);
    expect(summary.out).toMatchObject({ n: 4, peakMax: 2, atOrAboveZero: 2, atOrAboveZeroFraction: 0.5 });
    expect(summary.pre).toMatchObject({ n: 4, peakMax: -2, peakMean: -5, atOrAboveZero: 0, atOrAboveZeroFraction: 0 });
    expect(summary.out.peakMean).toBeCloseTo(-0.4, 12);
  });

  it('counts a reading of exactly 0 dB as at or above full scale', () => {
    const summary = summarizeLevels([reading(0, -0.1, 0), reading(0.5, 0, -0.1)]);
    expect(summary.out.atOrAboveZero).toBe(1);
    expect(summary.pre.atOrAboveZero).toBe(1);
    expect(summary.out.atOrAboveZeroFraction).toBe(0.5);
  });

  it('gives the master tap an RMS mean and the pre-chain tap none', () => {
    const summary = summarizeLevels([reading(0, -3, -8, -15), reading(0.5, -1, -6, -13)]);
    expect(summary.out.rmsMean).toBe(-14);
    expect(summary.pre).not.toHaveProperty('rmsMean');
  });

  it('drops a reading with no peak from that tap only, counts it as missing, and leaves the mean and share alone', () => {
    const summary = summarizeLevels([
      reading(0, -4, null, -16),
      reading(0.5, null, -6, null),
      reading(1, 2, -10, -14),
    ]);
    expect(summary.out).toMatchObject({ n: 2, missing: 1, peakMax: 2, peakMean: -1, rmsMean: -15, atOrAboveZero: 1 });
    expect(summary.out.atOrAboveZeroFraction).toBe(0.5);
    expect(summary.pre).toMatchObject({ n: 2, missing: 1, peakMax: -6, peakMean: -8 });
  });

  it('counts a silent reading in n and below 0 dB, but keeps it out of the mean and reports how many there were', () => {
    const summary = summarizeLevels([
      reading(0, -Infinity, -Infinity, -Infinity),
      reading(0.5, -6, -2, -18),
      reading(1, -4, 1, -16),
    ]);
    expect(summary.out).toMatchObject({ n: 3, silent: 1, peakMax: -4, peakMean: -5, rmsMean: -17 });
    expect(summary.out.atOrAboveZeroFraction).toBeCloseTo(0, 12);
    expect(summary.pre).toMatchObject({ n: 3, silent: 1, peakMax: 1, peakMean: -0.5, atOrAboveZero: 1 });
    expect(summary.pre.atOrAboveZeroFraction).toBeCloseTo(1 / 3, 12);
  });

  it('reads an all-silent tap as a -Infinity max with no mean', () => {
    const summary = summarizeLevels([reading(0, -Infinity, -3), reading(0.5, -Infinity, -2)]);
    expect(summary.out).toMatchObject({ n: 2, silent: 2, peakMax: -Infinity, peakMean: null, rmsMean: null });
  });

  it('reads an empty series as no readings, never NaN or Infinity', () => {
    const summary = summarizeLevels([]);
    for (const tap of [summary.out, summary.pre]) {
      expect(tap).toMatchObject({ n: 0, missing: 0, silent: 0, peakMax: null, peakMean: null });
      expect(tap.atOrAboveZero).toBe(0);
      expect(tap.atOrAboveZeroFraction).toBeNull();
    }
    expect(summary.out.rmsMean).toBeNull();
  });

  it('counts the fin token: ok, a non-finite flag, and readings without one', () => {
    const summary = summarizeLevels([
      reading(0, -3, -8, null, 'ok'),
      reading(0.5, -3, -8, null, 'NaN!'),
      reading(1, -3, -8, null, 'ok'),
      reading(1.5, null, null, null, null),
    ]);
    expect(summary.fin).toEqual({ ok: 2, nonFinite: 1, none: 1 });
  });
});
