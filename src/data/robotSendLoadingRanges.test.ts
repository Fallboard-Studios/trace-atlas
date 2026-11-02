// ========================================
// IMPORTS
// ========================================
import { describe, it, expect } from 'vitest';

import { EXCLUSIVE_SEND_FIELDS, SEND_FIELD_ROOM } from './robotSendLoadingRanges';
import { ROBOT_SEND_FIELDS, type RobotSendField } from './robotSends';
import { SEND_MAX, SEND_MIN } from '../constants';
import { CLASSIC } from './bands/classic';

// ========================================
// TESTS
// ========================================

// Robot Effect Sends T1 (docs/specs/ROBOT_EFFECT_SENDS.md assumption 6, §1.1): the per-robot send bands, Classic's send
// rows since band-table T22. These guards read ROBOT_SEND_LOADING_RANGES, a projection of those rows by name, until it
// went at docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R31.
describe('CLASSIC: the per-robot send rows', () => {
  it('lists the five send fields, the two existing sends first, each with a row', () => {
    expect(ROBOT_SEND_FIELDS).toEqual(['reverbSend', 'delaySend', 'gritSend', 'shimmerSend', 'doubleSend']);
    for (const field of ROBOT_SEND_FIELDS) expect(CLASSIC[field], field).toBeDefined();
  });

  it('carries the Reverb and Delay bands the global loading table carried at the retune merge (2dc5b4a2)', () => {
    expect(CLASSIC.reverbSend).toStrictEqual({ min: 0.1, max: 0.6, lit: 1 });
    // 1 - lit is the old SEND_DELAY_QUIET_THRESHOLD (0.25).
    expect(CLASSIC.delaySend).toStrictEqual({ min: 0, max: 0.3, lit: 0.75 });
  });

  it('carries the placeholder bands for the three new sends (tuned at the listen, T20)', () => {
    expect(CLASSIC.gritSend).toStrictEqual({ min: 0.4, max: 0.8, lit: 0.21 });
    expect(CLASSIC.shimmerSend).toStrictEqual({ min: 0.2, max: 0.5, lit: 0.16 });
    expect(CLASSIC.doubleSend).toStrictEqual({ min: 0.3, max: 0.6, lit: 0.19 });
  });

  it('keeps every row a real band inside the send range, with a lit share in (0, 1]', () => {
    for (const field of ROBOT_SEND_FIELDS) {
      const { min, max, lit } = CLASSIC[field];
      expect(min, field + ' min').toBeGreaterThanOrEqual(SEND_MIN);
      expect(max, field + ' max').toBeLessThanOrEqual(SEND_MAX);
      expect(min, field + ' min <= max').toBeLessThanOrEqual(max);
      expect(lit, field + ' lit').toBeGreaterThan(0);
      expect(lit, field + ' lit').toBeLessThanOrEqual(1);
    }
  });

  it('puts both band edges on the 1 % send grid, so a quantised draw can land on either edge', () => {
    for (const field of ROBOT_SEND_FIELDS) {
      for (const edge of ['min', 'max'] as const) {
        const percent = CLASSIC[field][edge] * 100;
        expect(Math.abs(percent - Math.round(percent)), field + ' ' + edge).toBeLessThan(1e-9);
      }
    }
  });

  it('names the three exclusive sends in roll order, Grit then Shimmer then Double', () => {
    expect(EXCLUSIVE_SEND_FIELDS).toEqual(['gritSend', 'shimmerSend', 'doubleSend']);
    for (const field of EXCLUSIVE_SEND_FIELDS) expect(ROBOT_SEND_FIELDS).toContain(field);
  });

  it('maps each exclusive send to its room key, one room per send', () => {
    expect(SEND_FIELD_ROOM).toStrictEqual({ gritSend: 'grit', shimmerSend: 'shimmer', doubleSend: 'double' });
  });

  it('types the rows by send field, so an unknown field is a compile error', () => {
    const field: RobotSendField = 'gritSend';
    expect(CLASSIC[field].lit).toBeGreaterThan(0);
    // @ts-expect-error - 'volumeSend' is not a send field
    const notAField: RobotSendField = 'volumeSend';
    expect(notAField).toBe('volumeSend');
  });
});
