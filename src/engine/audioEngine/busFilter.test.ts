import { describe, it, expect } from 'vitest';
import { resolveBusFilterCutoff, resolveBusFilterQ, resolveBusFilterType } from './busFilter';
import type { RobotFilterType } from '@/types/Robot';

describe('resolveBusFilterCutoff', () => {
  it('returns a stored cutoff as it is', () => {
    expect(resolveBusFilterCutoff(900)).toBe(900);
    expect(resolveBusFilterCutoff(20)).toBe(20);
    expect(resolveBusFilterCutoff(20000)).toBe(20000);
  });

  it('falls back to the 1200 Hz default when nothing is stored or the value is not a number', () => {
    expect(resolveBusFilterCutoff(undefined)).toBe(1200);
    expect(resolveBusFilterCutoff(NaN)).toBe(1200);
  });

  it('reads 0 as "no filter" and opens the cutoff to the top of the band', () => {
    expect(resolveBusFilterCutoff(0)).toBe(20000);
  });

  it('treats a negative stored cutoff like 0, never a negative frequency', () => {
    expect(resolveBusFilterCutoff(-5)).toBe(20000);
  });
});

describe('resolveBusFilterQ', () => {
  it('returns a stored resonance as it is', () => {
    expect(resolveBusFilterQ(6)).toBe(6);
    expect(resolveBusFilterQ(0.1)).toBe(0.1);
  });

  it('falls back to Q 1 when nothing is stored or the value is NaN', () => {
    expect(resolveBusFilterQ(undefined)).toBe(1);
    expect(resolveBusFilterQ(NaN)).toBe(1);
  });
});

describe('resolveBusFilterType', () => {
  it.each<RobotFilterType>(['lowpass', 'bandpass', 'highpass'])('returns the stored type %s as it is', (type) => {
    expect(resolveBusFilterType(type)).toBe(type);
  });

  it('falls back to lowpass when nothing is stored', () => {
    expect(resolveBusFilterType(undefined)).toBe('lowpass');
  });

  it('falls back to lowpass for an unrecognised type (a stale payload)', () => {
    expect(resolveBusFilterType('notch' as RobotFilterType)).toBe('lowpass');
  });
});
