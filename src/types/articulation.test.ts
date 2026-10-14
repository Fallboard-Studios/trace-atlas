// ========================================
// IMPORTS
// ========================================
import { describe, it, expect } from 'vitest';

import {
  ENVELOPE_CURVE_NAMES,
  ROBOT_FILTER_TYPES,
  type ADSREnvelope,
  type AudioAttributes,
  type EnvelopeCurveName,
  type RobotFilterType,
} from './Robot';
import {
  PORTAMENTO_MAX,
  PORTAMENTO_MIN,
  ROBOT_BUS_FILTER_FREQ_RANGE,
  ROBOT_BUS_FILTER_Q_RANGE,
  FILTER_RAMP_SECONDS,
} from '@/constants';


// Robot Articulation (roadmap 50.1) Task 1: the vocabulary every later task reads.
// docs/specs/ROBOT_ARTICULATION.md section 1.1.

// ========================================
// TESTS
// ========================================

describe('ENVELOPE_CURVE_NAMES', () => {
  it('lists the seven Tone curve names with linear first', () => {
    expect(ENVELOPE_CURVE_NAMES).toHaveLength(7);
    expect(ENVELOPE_CURVE_NAMES[0]).toBe('linear');
    expect([...ENVELOPE_CURVE_NAMES].sort()).toEqual(
      ['linear', 'exponential', 'sine', 'cosine', 'bounce', 'ripple', 'step'].sort(),
    );
  });

  it('has no duplicates', () => {
    expect(new Set(ENVELOPE_CURVE_NAMES).size).toBe(ENVELOPE_CURVE_NAMES.length);
  });
});

describe('ROBOT_FILTER_TYPES', () => {
  it('lists lowpass first, then bandpass and highpass', () => {
    expect(ROBOT_FILTER_TYPES).toEqual(['lowpass', 'bandpass', 'highpass']);
  });

  it('has no duplicates', () => {
    expect(new Set(ROBOT_FILTER_TYPES).size).toBe(3);
  });
});

describe('articulation fields are optional (absence is today sound)', () => {
  it('an ADSREnvelope with only a, d, s, r still type-checks (compile-time check via build:types)', () => {
    const adsr: ADSREnvelope = { attack: 0.01, decay: 0.1, sustain: 0.5, release: 0.4 };
    expect(adsr.attackCurve).toBeUndefined();
    expect(adsr.releaseCurve).toBeUndefined();
  });

  it('an ADSREnvelope accepts both curve names', () => {
    const attackCurve: EnvelopeCurveName = 'bounce';
    const releaseCurve: EnvelopeCurveName = 'step';
    const adsr: ADSREnvelope = { attack: 0.01, decay: 0.1, sustain: 0.5, release: 0.4, attackCurve, releaseCurve };
    expect(adsr.attackCurve).toBe('bounce');
    expect(adsr.releaseCurve).toBe('step');
  });

  it('AudioAttributes accepts portamento, filterQ and filterType but requires none of them', () => {
    const filterType: RobotFilterType = 'bandpass';
    const withAll: Pick<AudioAttributes, 'portamento' | 'filterQ' | 'filterType'> = {
      portamento: 0.12,
      filterQ: 4,
      filterType,
    };
    const withNone: Pick<AudioAttributes, 'portamento' | 'filterQ' | 'filterType'> = {};
    expect(withAll.filterType).toBe('bandpass');
    expect(withNone.portamento).toBeUndefined();
  });
});

describe('articulation constants', () => {
  it('portamento slider runs 0 (no glide) to 2 seconds', () => {
    expect(PORTAMENTO_MIN).toBe(0);
    expect(PORTAMENTO_MAX).toBe(2);
  });

  it('bus filter cutoff range is the slider and global LPF range, 20 to 20000 Hz', () => {
    expect(ROBOT_BUS_FILTER_FREQ_RANGE).toEqual({ min: 20, max: 20000 });
  });

  it('bus filter Q range is 0.1 to 20, the global LPF pair, and contains today fixed Q of 1', () => {
    expect(ROBOT_BUS_FILTER_Q_RANGE).toEqual({ min: 0.1, max: 20 });
    expect(ROBOT_BUS_FILTER_Q_RANGE.min).toBeLessThanOrEqual(1);
    expect(ROBOT_BUS_FILTER_Q_RANGE.max).toBeGreaterThanOrEqual(1);
  });

  it('both ranges are well-formed (min below max, min positive for a log slider)', () => {
    for (const r of [ROBOT_BUS_FILTER_FREQ_RANGE, ROBOT_BUS_FILTER_Q_RANGE]) {
      expect(r.min).toBeGreaterThan(0);
      expect(r.min).toBeLessThan(r.max);
    }
  });

  it('the filter ramp is a short positive time, shorter than a 100 ms lookahead', () => {
    expect(FILTER_RAMP_SECONDS).toBe(0.05);
    expect(FILTER_RAMP_SECONDS).toBeGreaterThan(0);
    expect(FILTER_RAMP_SECONDS).toBeLessThan(0.1);
  });
});
