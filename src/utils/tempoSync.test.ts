// ========================================
// IMPORTS
// ========================================
import { describe, it, expect } from 'vitest';

import {
  RATE_DRIFT_APPLIES_TO_SYNCED,
  resolveLaneRateHz,
  isLaneRunning,
  resolveLaneForEngine,
  resolveLfoBankForEngine,
  resolveDelayTimeSeconds,
  allowedLaneNoteValues,
  allowedDelayNoteValues,
  laneToSync,
  laneToFree,
  delayToSync,
  delayToFree,
  resolvePhaserRateHz,
  allowedPhaserNoteValues,
  phaserToSync,
  phaserToFree,
  pickSeedNoteValue,
} from './tempoSync';
import { LFO_BANK_RATE_BANDS } from './globalAudioSeed';
import {
  NOTE_VALUES,
  allowedNoteValues,
  isNoteValue,
  noteValueEquals,
  noteValueHz,
  noteValueSeconds,
  type NoteValue,
} from '@/data/noteValues';
import {
  LFO_LANE_IDS,
  LFO_RATE_MAX,
  LFO_RATE_MIN,
  LFO_RATE_STEP,
  type BankLfoSettings,
  type LfoLaneId,
} from '@/types/lfo';
import {
  DELAY_TIME_RANGE_SECONDS,
  DELAY_TIME_STEP_SECONDS,
  PHASER_RATE_RANGE_HZ,
  PHASER_RATE_STEP_HZ,
  type DelaySettings,
  type PhaserSettings,
} from '@/types/globalAudio';

// ========================================
// HELPERS
// ========================================

const nv = (
  division: NoteValue['division'],
  modifier: NoteValue['modifier'] = 'straight'
): NoteValue => ({
  division,
  modifier,
});

const lane = (over: Partial<BankLfoSettings> = {}): BankLfoSettings => ({
  shape: 'triangle',
  rate: 0.8,
  rateDrift: 0.25,
  depthDrift: -0.4,
  ...over,
});

const delay = (over: Partial<DelaySettings> = {}): DelaySettings => ({
  delayTime: 0.3,
  feedback: 0.4,
  wet: 0.6,
  ...over,
});

/** An untrusted `sync` as it could arrive from a hand-edited session or share link. */
const junk = (value: unknown): NoteValue => value as NoteValue;

const INVALID_SYNCS: [string, unknown][] = [
  ['unknown division', { division: '1/3', modifier: 'straight' }],
  ['multi-bar dotted', { division: '2', modifier: 'dotted' }],
  ['the old "off" idea', 'off'],
  ['null', null],
  ['a number', 4],
];

// ========================================
// TESTS — docs/specs/FREE_SYNC_TOGGLE.md §1.3
// ========================================

describe('the shared range/step constants', () => {
  it('LFO_RATE_STEP is the lane Rate slider step; DELAY_* mirror the Delay Time slider and the 10 s node cap', () => {
    expect(LFO_RATE_STEP).toBe(0.05);
    expect(DELAY_TIME_RANGE_SECONDS).toEqual({ min: 0, max: 10 });
    expect(DELAY_TIME_STEP_SECONDS).toBe(0.001);
  });
});

describe('RATE_DRIFT_APPLIES_TO_SYNCED', () => {
  it('ships true: drift keeps applying to synced lanes (spec assumption 8)', () => {
    expect(RATE_DRIFT_APPLIES_TO_SYNCED).toBe(true);
  });
});

describe('resolveLaneRateHz', () => {
  it('passes a Free rate through untouched, including both ends of the range', () => {
    expect(resolveLaneRateHz(lane({ rate: 0 }), 60)).toBe(0);
    expect(resolveLaneRateHz(lane({ rate: 1.35 }), 60)).toBe(1.35);
    expect(resolveLaneRateHz(lane({ rate: 20 }), 60)).toBe(20);
  });

  it('a Free rate does not depend on tempo', () => {
    expect(resolveLaneRateHz(lane({ rate: 3 }), 40)).toBe(3);
    expect(resolveLaneRateHz(lane({ rate: 3 }), 180)).toBe(3);
  });

  it('derives a Sync rate from the note and tempo: 1/4 is 1 Hz at 60 BPM and 2 Hz at 120', () => {
    expect(resolveLaneRateHz(lane({ sync: nv('1/4') }), 60)).toBeCloseTo(1, 9);
    expect(resolveLaneRateHz(lane({ sync: nv('1/4') }), 120)).toBeCloseTo(2, 9);
  });

  it('ignores the stored Free rate while synced', () => {
    expect(resolveLaneRateHz(lane({ rate: 7, sync: nv('1/4') }), 60)).toBeCloseTo(1, 9);
    expect(resolveLaneRateHz(lane({ rate: 0, sync: nv('1/4') }), 60)).toBeCloseTo(1, 9);
  });

  it('clamps a note faster than the lane range to LFO_RATE_MAX (1/32 triplet is 40 Hz at 200 BPM)', () => {
    expect(resolveLaneRateHz(lane({ sync: nv('1/32', 'triplet') }), 200)).toBe(LFO_RATE_MAX);
  });

  it('never resolves a synced lane to 0 Hz, even for the slowest note at a hostile tempo', () => {
    expect(resolveLaneRateHz(lane({ sync: nv('4') }), 0.001)).toBeGreaterThan(LFO_RATE_MIN);
  });

  it.each(INVALID_SYNCS)('resolves an invalid sync (%s) as Free', (_name, bad) => {
    expect(resolveLaneRateHz(lane({ rate: 2.5, sync: junk(bad) }), 60)).toBe(2.5);
  });
});

describe('isLaneRunning', () => {
  it('Free: false at 0 Hz, true above it', () => {
    expect(isLaneRunning(lane({ rate: 0 }))).toBe(false);
    expect(isLaneRunning(lane({ rate: 0.05 }))).toBe(true);
    expect(isLaneRunning(lane({ rate: 20 }))).toBe(true);
  });

  it('Sync: always running, even with a stored Free rate of 0', () => {
    expect(isLaneRunning(lane({ rate: 0, sync: nv('4') }))).toBe(true);
  });

  it('an invalid sync counts as Free, so rate 0 is not running and rate > 0 is', () => {
    expect(
      isLaneRunning(lane({ rate: 0, sync: junk({ division: '1/3', modifier: 'straight' }) }))
    ).toBe(false);
    expect(isLaneRunning(lane({ rate: 3, sync: junk('off') }))).toBe(true);
  });
});

describe('resolveLaneForEngine', () => {
  it('hands the engine the resolved Hz and strips sync, leaving shape and drifts alone', () => {
    const out = resolveLaneForEngine(lane({ rate: 9, sync: nv('1/4') }), 120);
    expect(out.rate).toBeCloseTo(2, 9);
    expect('sync' in out).toBe(false);
    expect(out.shape).toBe('triangle');
    expect(out.rateDrift).toBe(0.25);
    expect(out.depthDrift).toBe(-0.4);
  });

  it('a Free lane comes back equal, as a new object', () => {
    const input = lane({ rate: 1.5 });
    const out = resolveLaneForEngine(input, 120);
    expect(out).toEqual(input);
    expect(out).not.toBe(input);
  });

  it('strips an invalid sync too, so garbage never reaches the engine', () => {
    const out = resolveLaneForEngine(lane({ rate: 2, sync: junk('off') }), 60);
    expect(out.rate).toBe(2);
    expect('sync' in out).toBe(false);
  });

  it('does not mutate its input', () => {
    const input = lane({ rate: 9, sync: nv('1/4') });
    resolveLaneForEngine(input, 120);
    expect(input).toEqual(lane({ rate: 9, sync: nv('1/4') }));
  });

  it('with drift disabled for synced lanes, a synced lane gets rateDrift 0 but keeps depthDrift', () => {
    const out = resolveLaneForEngine(lane({ sync: nv('1/4') }), 60, false);
    expect(out.rateDrift).toBe(0);
    expect(out.depthDrift).toBe(-0.4);
  });

  it('with drift disabled for synced lanes, a Free lane keeps its rateDrift', () => {
    expect(resolveLaneForEngine(lane({ rate: 2 }), 60, false).rateDrift).toBe(0.25);
  });

  it('with drift disabled, an invalid sync is Free, so its rateDrift is kept', () => {
    expect(resolveLaneForEngine(lane({ sync: junk('off') }), 60, false).rateDrift).toBe(0.25);
  });

  it('defaults to the shipped constant: a synced lane keeps rateDrift', () => {
    expect(resolveLaneForEngine(lane({ sync: nv('1/4') }), 60).rateDrift).toBe(0.25);
  });
});

describe('resolveLfoBankForEngine', () => {
  it('resolves every lane, keyed a-d, Free and Sync side by side', () => {
    const bank: Record<LfoLaneId, BankLfoSettings> = {
      a: lane({ rate: 0.1, sync: nv('1') }),
      b: lane({ rate: 0.9 }),
      c: lane({ rate: 0, sync: nv('1/8') }),
      d: lane({ rate: 6 }),
    };
    const out = resolveLfoBankForEngine(bank, 120);
    expect(Object.keys(out)).toEqual([...LFO_LANE_IDS]);
    expect(out.a.rate).toBeCloseTo(0.5, 9); // 1 bar = 2 s at 120 BPM
    expect(out.b.rate).toBe(0.9);
    expect(out.c.rate).toBeCloseTo(4, 9); // 1/8 = 0.25 s
    expect(out.d.rate).toBe(6);
    for (const id of LFO_LANE_IDS) expect('sync' in out[id]).toBe(false);
  });

  it('does not mutate the bank it was given', () => {
    const bank = { a: lane({ sync: nv('1') }), b: lane(), c: lane(), d: lane() };
    resolveLfoBankForEngine(bank, 120);
    expect(bank.a.sync).toEqual(nv('1'));
  });
});

describe('resolveDelayTimeSeconds', () => {
  it('passes a Free delayTime through, including both ends of the range', () => {
    expect(resolveDelayTimeSeconds(delay({ delayTime: 0 }), 60)).toBe(0);
    expect(resolveDelayTimeSeconds(delay({ delayTime: 0.3 }), 60)).toBe(0.3);
    expect(resolveDelayTimeSeconds(delay({ delayTime: 10 }), 60)).toBe(10);
  });

  it('derives a Sync time from the note and tempo, ignoring the stored Free value', () => {
    expect(resolveDelayTimeSeconds(delay({ delayTime: 7, sync: nv('1/4') }), 60)).toBeCloseTo(1, 9);
    expect(resolveDelayTimeSeconds(delay({ delayTime: 7, sync: nv('1/4') }), 120)).toBeCloseTo(
      0.5,
      9
    );
  });

  it('clamps a note longer than the 10 s node cap (2 bars is 24 s at 20 BPM)', () => {
    expect(resolveDelayTimeSeconds(delay({ sync: nv('2') }), 20)).toBe(
      DELAY_TIME_RANGE_SECONDS.max
    );
    expect(resolveDelayTimeSeconds(delay({ sync: nv('4') }), 60)).toBe(
      DELAY_TIME_RANGE_SECONDS.max
    );
  });

  it('keeps a note exactly at the cap un-clamped (1 bar at 24 BPM is exactly 10 s)', () => {
    expect(resolveDelayTimeSeconds(delay({ sync: nv('1') }), 24)).toBeCloseTo(10, 9);
  });

  it.each(INVALID_SYNCS)('resolves an invalid sync (%s) as Free', (_name, bad) => {
    expect(resolveDelayTimeSeconds(delay({ delayTime: 0.45, sync: junk(bad) }), 60)).toBe(0.45);
  });
});

describe('allowedLaneNoteValues', () => {
  it('runs slowest to fastest in Hz', () => {
    const hz = allowedLaneNoteValues(97).map((v) => noteValueHz(v, 97));
    for (let i = 1; i < hz.length; i++) expect(hz[i]).toBeGreaterThan(hz[i - 1]);
  });

  it('keeps every note whose rate lies inside the lane range', () => {
    for (const v of allowedLaneNoteValues(97)) {
      const hz = noteValueHz(v, 97);
      expect(hz).toBeGreaterThanOrEqual(LFO_RATE_MIN);
      expect(hz).toBeLessThanOrEqual(LFO_RATE_MAX);
    }
  });

  it('offers the whole table at 60 BPM (4 bars is 0.0625 Hz, 1/32 triplet 12 Hz) — slowest first', () => {
    const list = allowedLaneNoteValues(60);
    expect(list).toHaveLength(20);
    expect(list[0]).toEqual(nv('4'));
    expect(list[list.length - 1]).toEqual(nv('1/32', 'triplet'));
  });

  it('drops notes faster than 20 Hz at 200 BPM (1/32 triplet is 40 Hz)', () => {
    expect(allowedLaneNoteValues(200).some((v) => noteValueEquals(v, nv('1/32', 'triplet')))).toBe(
      false
    );
  });

  it('does not reorder the shared table when it reverses its result', () => {
    allowedLaneNoteValues(60);
    expect(NOTE_VALUES[0]).toEqual(nv('1/32', 'triplet'));
  });
});

describe('allowedDelayNoteValues', () => {
  it('runs shortest to longest in seconds', () => {
    const seconds = allowedDelayNoteValues(97).map((v) => noteValueSeconds(v, 97));
    for (let i = 1; i < seconds.length; i++) expect(seconds[i]).toBeGreaterThan(seconds[i - 1]);
  });

  it('at 60 BPM includes 2 bars (8 s) and excludes 4 bars (16 s)', () => {
    const list = allowedDelayNoteValues(60);
    expect(list.some((v) => noteValueEquals(v, nv('2')))).toBe(true);
    expect(list.some((v) => noteValueEquals(v, nv('4')))).toBe(false);
  });

  it('at 20 BPM (3 s per beat) the longest allowed note is 1/2 dotted (9 s)', () => {
    const list = allowedDelayNoteValues(20);
    expect(list[list.length - 1]).toEqual(nv('1/2', 'dotted'));
  });

  it('offers the whole table at 200 BPM (4 bars is 4.8 s)', () => {
    expect(allowedDelayNoteValues(200)).toHaveLength(20);
  });
});

describe('laneToSync', () => {
  it('snaps 0 Hz to the slowest allowed note and keeps rate as it was', () => {
    const out = laneToSync(lane({ rate: 0 }), 60);
    expect(out.sync).toEqual(allowedLaneNoteValues(60)[0]);
    expect(out.sync).toEqual(nv('4'));
    expect(out.rate).toBe(0);
  });

  it('snaps 1.5 Hz at 60 BPM to 1/4 triplet and keeps rate', () => {
    const out = laneToSync(lane({ rate: 1.5 }), 60);
    expect(out.sync).toEqual(nv('1/4', 'triplet'));
    expect(out.rate).toBe(1.5);
  });

  it('snaps 20 Hz at 60 BPM to the fastest allowed note', () => {
    expect(laneToSync(lane({ rate: 20 }), 60).sync).toEqual(nv('1/32', 'triplet'));
  });

  it('keeps shape and both drifts', () => {
    const out = laneToSync(lane({ rate: 1.5 }), 60);
    expect(out.shape).toBe('triangle');
    expect(out.rateDrift).toBe(0.25);
    expect(out.depthDrift).toBe(-0.4);
  });

  it('returns a new object and does not mutate its input', () => {
    const input = lane({ rate: 1.5 });
    const out = laneToSync(input, 60);
    expect(out).not.toBe(input);
    expect('sync' in input).toBe(false);
  });

  it('leaves an already-synced lane on its note (its stored rate is stale, not a request)', () => {
    const out = laneToSync(lane({ rate: 20, sync: nv('1/2') }), 60);
    expect(out.sync).toEqual(nv('1/2'));
  });

  it('treats an invalid sync as Free and snaps from the rate', () => {
    const out = laneToSync(lane({ rate: 1.5, sync: junk('off') }), 60);
    expect(out.sync).toEqual(nv('1/4', 'triplet'));
  });

  it('always yields a real note, even when the tempo leaves nothing allowed (never throws)', () => {
    // At 100000 BPM every note is faster than 20 Hz, so the lane's allowed list is empty.
    expect(allowedLaneNoteValues(100000)).toEqual([]);
    const out = laneToSync(lane({ rate: 5 }), 100000);
    expect(isNoteValue(out.sync)).toBe(true);
  });
});

describe('laneToFree', () => {
  it('keeps what the user hears, quantised to the slider step: 1/8 dotted at 60 BPM → 1.35 Hz', () => {
    const out = laneToFree(lane({ rate: 9, sync: nv('1/8', 'dotted') }), 60);
    expect(out.rate).toBe(1.35);
    expect('sync' in out).toBe(false);
  });

  it('never freezes a running lane: 4 bars at 20 BPM (0.021 Hz) floors at one step, 0.05', () => {
    const out = laneToFree(lane({ rate: 0, sync: nv('4') }), 20);
    expect(out.rate).toBe(LFO_RATE_STEP);
    expect(out.rate).toBeGreaterThan(0);
  });

  it('clamps a note faster than the range: 1/32 triplet at 200 BPM → 20 Hz', () => {
    expect(laneToFree(lane({ sync: nv('1/32', 'triplet') }), 200).rate).toBe(LFO_RATE_MAX);
  });

  it('lands on the slider grid for every note at an awkward tempo', () => {
    for (const v of NOTE_VALUES) {
      const { rate } = laneToFree(lane({ sync: v }), 97);
      expect(rate, `${v.division}/${v.modifier}`).toBeGreaterThanOrEqual(LFO_RATE_STEP);
      expect(rate).toBeLessThanOrEqual(LFO_RATE_MAX);
      const steps = rate / LFO_RATE_STEP;
      expect(Math.abs(steps - Math.round(steps))).toBeLessThan(1e-9);
      // Stored clean — no 1.3500000000000001 style residue in state.
      expect(rate).toBe(Number(rate.toFixed(2)));
    }
  });

  it('keeps shape and both drifts', () => {
    const out = laneToFree(lane({ sync: nv('1/4') }), 60);
    expect(out.shape).toBe('triangle');
    expect(out.rateDrift).toBe(0.25);
    expect(out.depthDrift).toBe(-0.4);
  });

  it('on a lane that was never synced, leaves rate alone — a held 0 Hz stays 0, not 0.05', () => {
    const out = laneToFree(lane({ rate: 0 }), 60);
    expect(out.rate).toBe(0);
    expect('sync' in out).toBe(false);
  });

  it('on an invalid sync, drops it and keeps the stored rate', () => {
    const out = laneToFree(lane({ rate: 2.5, sync: junk('off') }), 60);
    expect(out.rate).toBe(2.5);
    expect('sync' in out).toBe(false);
  });

  it('returns a new object and does not mutate its input', () => {
    const input = lane({ sync: nv('1/4') });
    const out = laneToFree(input, 60);
    expect(out).not.toBe(input);
    expect(input.sync).toEqual(nv('1/4'));
  });

  it('round-trips an on-grid rate: 1.5 Hz → Sync → Free at the same tempo is 1.5 Hz with no sync key', () => {
    const back = laneToFree(laneToSync(lane({ rate: 1.5 }), 60), 60);
    expect(back.rate).toBe(1.5);
    expect('sync' in back).toBe(false);
  });
});

describe('delayToSync', () => {
  it('snaps 0.3 s at 60 BPM to 1/8 triplet (0.333 s) and keeps delayTime', () => {
    const out = delayToSync(delay({ delayTime: 0.3 }), 60);
    expect(out.sync).toEqual(nv('1/8', 'triplet'));
    expect(out.delayTime).toBe(0.3);
  });

  it('snaps 0 s to the shortest allowed note', () => {
    expect(delayToSync(delay({ delayTime: 0 }), 60).sync).toEqual(allowedDelayNoteValues(60)[0]);
  });

  it('snaps a time above every allowed note to the longest allowed (10 s at 60 BPM → 2 bars)', () => {
    expect(delayToSync(delay({ delayTime: 10 }), 60).sync).toEqual(nv('2'));
  });

  it('keeps feedback and wet, returns a new object, does not mutate its input', () => {
    const input = delay({ delayTime: 0.3 });
    const out = delayToSync(input, 60);
    expect(out.feedback).toBe(0.4);
    expect(out.wet).toBe(0.6);
    expect(out).not.toBe(input);
    expect('sync' in input).toBe(false);
  });

  it('leaves an already-synced delay on its note', () => {
    expect(delayToSync(delay({ delayTime: 0.3, sync: nv('1/2') }), 60).sync).toEqual(nv('1/2'));
  });

  it('treats an invalid sync as Free and snaps from delayTime', () => {
    expect(delayToSync(delay({ delayTime: 0.3, sync: junk('off') }), 60).sync).toEqual(
      nv('1/8', 'triplet')
    );
  });

  it('always yields a real note, even when the tempo leaves nothing allowed (never throws)', () => {
    // At 0.1 BPM the shortest note is already 50 s, past the 10 s cap.
    expect(allowedDelayNoteValues(0.1)).toEqual([]);
    expect(isNoteValue(delayToSync(delay(), 0.1).sync)).toBe(true);
  });
});

describe('delayToFree', () => {
  it('keeps what the user hears, quantised to 1 ms: 1/4 triplet at 60 BPM → 0.667 s', () => {
    const out = delayToFree(delay({ delayTime: 5, sync: nv('1/4', 'triplet') }), 60);
    expect(out.delayTime).toBe(0.667);
    expect('sync' in out).toBe(false);
  });

  it('1/8 triplet at 60 BPM → 0.333 s (the delayToSync round trip)', () => {
    const back = delayToFree(delayToSync(delay({ delayTime: 0.3 }), 60), 60);
    expect(back.delayTime).toBe(0.333);
    expect('sync' in back).toBe(false);
  });

  it('clamps a note past the cap: 2 bars at 20 BPM → 10 s', () => {
    expect(delayToFree(delay({ sync: nv('2') }), 20).delayTime).toBe(DELAY_TIME_RANGE_SECONDS.max);
  });

  it('lands on the slider grid for every note at an awkward tempo', () => {
    for (const v of NOTE_VALUES) {
      const { delayTime } = delayToFree(delay({ sync: v }), 97);
      expect(delayTime, `${v.division}/${v.modifier}`).toBeGreaterThanOrEqual(
        DELAY_TIME_RANGE_SECONDS.min
      );
      expect(delayTime).toBeLessThanOrEqual(DELAY_TIME_RANGE_SECONDS.max);
      expect(delayTime).toBe(Number(delayTime.toFixed(3)));
    }
  });

  it('on a delay that was never synced, leaves delayTime alone (0 stays 0)', () => {
    const out = delayToFree(delay({ delayTime: 0 }), 60);
    expect(out.delayTime).toBe(0);
    expect('sync' in out).toBe(false);
  });

  it('on an invalid sync, drops it and keeps the stored delayTime', () => {
    const out = delayToFree(delay({ delayTime: 0.45, sync: junk('off') }), 60);
    expect(out.delayTime).toBe(0.45);
    expect('sync' in out).toBe(false);
  });

  it('keeps feedback and wet, returns a new object, does not mutate its input', () => {
    const input = delay({ sync: nv('1/4') });
    const out = delayToFree(input, 60);
    expect(out.feedback).toBe(0.4);
    expect(out.wet).toBe(0.6);
    expect(out).not.toBe(input);
    expect(input.sync).toEqual(nv('1/4'));
  });
});

// ========================================
// TESTS — docs/specs/GLOBAL_MODULATION_COLOUR.md §1.5 (Global Modulation T3): the Phaser's Rate rail
// ========================================

const phaser = (over: Partial<PhaserSettings> = {}): PhaserSettings => ({
  rate: 0.5,
  octaves: 3,
  baseFrequency: 350,
  stages: 10,
  Q: 10,
  wet: 0.2,
  ...over,
});

describe('resolvePhaserRateHz', () => {
  it('passes a Free rate through, including both ends of the range', () => {
    expect(resolvePhaserRateHz(phaser({ rate: PHASER_RATE_RANGE_HZ.min }), 60)).toBe(PHASER_RATE_RANGE_HZ.min);
    expect(resolvePhaserRateHz(phaser({ rate: 2.35 }), 60)).toBe(2.35);
    expect(resolvePhaserRateHz(phaser({ rate: PHASER_RATE_RANGE_HZ.max }), 60)).toBe(PHASER_RATE_RANGE_HZ.max);
  });

  it('derives a Sync rate from the note and tempo, ignoring the stored Free value', () => {
    expect(resolvePhaserRateHz(phaser({ rate: 7, sync: nv('1/4') }), 60)).toBeCloseTo(1, 9);
    expect(resolvePhaserRateHz(phaser({ rate: 7, sync: nv('1/4') }), 120)).toBeCloseTo(2, 9);
  });

  it('follows the tempo: the same note runs twice as fast at twice the BPM', () => {
    const slow = resolvePhaserRateHz(phaser({ sync: nv('1/2') }), 60);
    const fast = resolvePhaserRateHz(phaser({ sync: nv('1/2') }), 120);
    expect(fast / slow).toBeCloseTo(2, 9);
  });

  it('clamps a note slower than the range up to its minimum (4 bars is 0.0208 Hz at 20 BPM)', () => {
    expect(resolvePhaserRateHz(phaser({ sync: nv('4') }), 20)).toBe(PHASER_RATE_RANGE_HZ.min);
  });

  it('clamps a note faster than the range down to its maximum (1/32 triplet is 12 Hz at 60 BPM)', () => {
    expect(resolvePhaserRateHz(phaser({ sync: nv('1/32', 'triplet') }), 60)).toBe(PHASER_RATE_RANGE_HZ.max);
  });

  it('keeps a note exactly at the range minimum un-clamped (1 bar at 12 BPM is exactly 0.05 Hz)', () => {
    expect(resolvePhaserRateHz(phaser({ sync: nv('1') }), 12)).toBeCloseTo(PHASER_RATE_RANGE_HZ.min, 9);
  });

  it.each(INVALID_SYNCS)('resolves an invalid sync (%s) as Free', (_name, bad) => {
    expect(resolvePhaserRateHz(phaser({ rate: 1.7, sync: junk(bad) }), 60)).toBe(1.7);
  });
});

describe('allowedPhaserNoteValues', () => {
  it('runs slowest to fastest in Hz', () => {
    const hz = allowedPhaserNoteValues(97).map((v) => noteValueHz(v, 97));
    for (let i = 1; i < hz.length; i++) expect(hz[i]).toBeGreaterThan(hz[i - 1]);
  });

  it('keeps every note whose rate lies inside the Phaser range, at several tempos', () => {
    for (const bpm of [20, 60, 97, 140, 200]) {
      const list = allowedPhaserNoteValues(bpm);
      expect(list.length, `bpm ${bpm}`).toBeGreaterThan(0);
      for (const v of list) {
        const hz = noteValueHz(v, bpm);
        expect(hz, `${v.division}/${v.modifier} at ${bpm}`).toBeGreaterThanOrEqual(PHASER_RATE_RANGE_HZ.min);
        expect(hz, `${v.division}/${v.modifier} at ${bpm}`).toBeLessThanOrEqual(PHASER_RATE_RANGE_HZ.max);
      }
    }
  });

  it('drops only the 1/32 triplet at 60 BPM (12 Hz): 19 of 20 notes, 4 bars first', () => {
    const list = allowedPhaserNoteValues(60);
    expect(list).toHaveLength(19);
    expect(list[0]).toEqual(nv('4'));
    expect(list[list.length - 1]).toEqual(nv('1/32'));
  });

  it('drops the slowest notes at a slow tempo (4 bars is 0.0208 Hz at 20 BPM)', () => {
    expect(allowedPhaserNoteValues(20).some((v) => noteValueEquals(v, nv('4')))).toBe(false);
  });

  it('drops the fastest notes at a fast tempo (1/32 is 26.7 Hz at 200 BPM)', () => {
    expect(allowedPhaserNoteValues(200).some((v) => noteValueEquals(v, nv('1/32')))).toBe(false);
  });

  it('is empty when the tempo leaves no note inside the range', () => {
    expect(allowedPhaserNoteValues(0.1)).toEqual([]);
  });

  it('does not reorder the shared table when it reverses its result', () => {
    allowedPhaserNoteValues(60);
    expect(NOTE_VALUES[0]).toEqual(nv('1/32', 'triplet'));
  });
});

describe('phaserToSync', () => {
  it('snaps 0.5 Hz at 60 BPM to 1/2 (exactly 0.5 Hz) and keeps rate underneath', () => {
    const out = phaserToSync(phaser({ rate: 0.5 }), 60);
    expect(out.sync).toEqual(nv('1/2'));
    expect(out.rate).toBe(0.5);
  });

  it('snaps to the NEAREST note in Hz: 0.3 Hz at 60 BPM is 1/2 dotted (0.333 Hz), not 1 bar (0.25 Hz)', () => {
    expect(phaserToSync(phaser({ rate: 0.3 }), 60).sync).toEqual(nv('1/2', 'dotted'));
  });

  it('snaps the minimum rate to the slowest allowed note', () => {
    expect(phaserToSync(phaser({ rate: PHASER_RATE_RANGE_HZ.min }), 60).sync).toEqual(allowedPhaserNoteValues(60)[0]);
  });

  it('snaps the maximum rate to the fastest allowed note', () => {
    const allowed = allowedPhaserNoteValues(60);
    expect(phaserToSync(phaser({ rate: PHASER_RATE_RANGE_HZ.max }), 60).sync).toEqual(allowed[allowed.length - 1]);
  });

  it('only ever picks a note from the allowed list, whatever the rate and tempo', () => {
    for (const bpm of [20, 77, 120, 200]) {
      for (const rate of [0.05, 0.1, 0.5, 1.35, 4, 9.95, 10]) {
        const out = phaserToSync(phaser({ rate }), bpm).sync;
        expect(allowedPhaserNoteValues(bpm).some((v) => noteValueEquals(v, out as NoteValue)), `${rate} Hz at ${bpm}`).toBe(true);
      }
    }
  });

  it('keeps every other field, returns a new object, does not mutate its input', () => {
    const input = phaser({ rate: 0.5 });
    const out = phaserToSync(input, 60);
    expect([out.octaves, out.baseFrequency, out.stages, out.Q, out.wet]).toEqual([3, 350, 10, 10, 0.2]);
    expect(out).not.toBe(input);
    expect('sync' in input).toBe(false);
  });

  it('returns an already-synced Phaser as a copy on the same note: its stored rate is stale, not a request', () => {
    const input = phaser({ rate: 9, sync: nv('1/4', 'dotted') });
    const out = phaserToSync(input, 60);
    expect(out.sync).toEqual(nv('1/4', 'dotted'));
    expect(out).not.toBe(input);
    expect(out).toEqual(input);
  });

  it('treats an invalid sync as Free and snaps from rate', () => {
    expect(phaserToSync(phaser({ rate: 0.5, sync: junk('off') }), 60).sync).toEqual(nv('1/2'));
  });

  it('always yields a real note, even when the tempo leaves nothing allowed (never throws)', () => {
    expect(allowedPhaserNoteValues(0.1)).toEqual([]);
    expect(isNoteValue(phaserToSync(phaser(), 0.1).sync)).toBe(true);
  });
});

describe('phaserToFree', () => {
  it('keeps what the user hears, quantised to 0.05 Hz: 1/4 dotted at 60 BPM (0.667 Hz) → 0.65', () => {
    const out = phaserToFree(phaser({ rate: 5, sync: nv('1/4', 'dotted') }), 60);
    expect(out.rate).toBe(0.65);
    expect('sync' in out).toBe(false);
  });

  it('is exact when the note lands on the grid: 1/8 triplet at 60 BPM is 3 Hz', () => {
    expect(phaserToFree(phaser({ rate: 5, sync: nv('1/8', 'triplet') }), 60).rate).toBe(3);
  });

  it('round-trips a Free rate that sits on a note: 0.5 Hz → 1/2 → 0.5 Hz', () => {
    const back = phaserToFree(phaserToSync(phaser({ rate: 0.5 }), 60), 60);
    expect(back.rate).toBe(0.5);
    expect('sync' in back).toBe(false);
  });

  it('never goes below the range minimum, even for the slowest note at the slowest tempo (rate stays 0.05, never 0)', () => {
    for (const bpm of [20, 40]) {
      const out = phaserToFree(phaser({ sync: nv('4') }), bpm);
      expect(out.rate, `bpm ${bpm}`).toBe(PHASER_RATE_RANGE_HZ.min);
    }
  });

  it('never goes above the range maximum: 1/32 triplet at 60 BPM (12 Hz) → 10', () => {
    expect(phaserToFree(phaser({ sync: nv('1/32', 'triplet') }), 60).rate).toBe(PHASER_RATE_RANGE_HZ.max);
  });

  it('lands on the 0.05 Hz slider grid, inside the range, for every note at an awkward tempo', () => {
    for (const v of NOTE_VALUES) {
      const { rate } = phaserToFree(phaser({ sync: v }), 97);
      expect(rate, `${v.division}/${v.modifier}`).toBeGreaterThanOrEqual(PHASER_RATE_RANGE_HZ.min);
      expect(rate).toBeLessThanOrEqual(PHASER_RATE_RANGE_HZ.max);
      expect(rate).toBe(Number(rate.toFixed(2)));
      expect(Math.abs(rate / PHASER_RATE_STEP_HZ - Math.round(rate / PHASER_RATE_STEP_HZ))).toBeLessThan(1e-9);
    }
  });

  it('on a Phaser that was never synced, returns an equal copy (rate untouched, no sync key)', () => {
    const input = phaser({ rate: 1.35 });
    const out = phaserToFree(input, 60);
    expect(out).toEqual(input);
    expect(out).not.toBe(input);
    expect('sync' in out).toBe(false);
  });

  it('on an invalid sync, drops it and keeps the stored rate', () => {
    const out = phaserToFree(phaser({ rate: 1.35, sync: junk('off') }), 60);
    expect(out.rate).toBe(1.35);
    expect('sync' in out).toBe(false);
  });

  it('keeps every other field, returns a new object, does not mutate its input', () => {
    const input = phaser({ sync: nv('1/4') });
    const out = phaserToFree(input, 60);
    expect([out.octaves, out.baseFrequency, out.stages, out.Q, out.wet]).toEqual([3, 350, 10, 10, 0.2]);
    expect(out).not.toBe(input);
    expect(input.sync).toEqual(nv('1/4'));
  });
});

describe('pickSeedNoteValue', () => {
  const hzBand = { min: 0.1, max: 0.4 }; // lane a's band shape: a handful of slow notes at 60 BPM
  const inBand = (
    v: NoteValue | undefined,
    bpm: number,
    band: { min: number; max: number },
    unit: 'seconds' | 'hz'
  ) => {
    expect(v).toBeDefined();
    const value = unit === 'hz' ? noteValueHz(v!, bpm) : noteValueSeconds(v!, bpm);
    expect(value).toBeGreaterThanOrEqual(band.min);
    expect(value).toBeLessThanOrEqual(band.max);
  };

  it('picks a note inside the band, in Hz', () => {
    for (const t of [0, 0.2, 0.5, 0.8, 0.999]) {
      inBand(pickSeedNoteValue(t, 60, [hzBand], 'hz'), 60, hzBand, 'hz');
    }
  });

  it('picks a note inside the band, in seconds', () => {
    const band = { min: 0.05, max: 0.5 }; // Delay's seed range
    for (const t of [0, 0.3, 0.6, 0.999]) {
      inBand(pickSeedNoteValue(t, 60, [band], 'seconds'), 60, band, 'seconds');
    }
  });

  it('is deterministic: the same t, tempo and bands give the same note', () => {
    expect(pickSeedNoteValue(0.37, 83, [hzBand], 'hz')).toEqual(
      pickSeedNoteValue(0.37, 83, [hzBand], 'hz')
    );
  });

  it('is uniform over the candidates: t = (i + 0.5) / n selects the i-th, in NOTE_VALUES order', () => {
    const band = { min: 0, max: 20 };
    const candidates = allowedNoteValues(60, band, 'hz');
    const n = candidates.length;
    for (let i = 0; i < n; i++) {
      expect(pickSeedNoteValue((i + 0.5) / n, 60, [band], 'hz')).toEqual(candidates[i]);
    }
  });

  it('t = 0 is the first candidate, and t at or past 1 clamps to the last (never out of bounds)', () => {
    const band = { min: 0, max: 20 };
    const candidates = allowedNoteValues(60, band, 'hz');
    expect(pickSeedNoteValue(0, 60, [band], 'hz')).toEqual(candidates[0]);
    expect(pickSeedNoteValue(1, 60, [band], 'hz')).toEqual(candidates[candidates.length - 1]);
    expect(pickSeedNoteValue(1.5, 60, [band], 'hz')).toEqual(candidates[candidates.length - 1]);
  });

  it('a t below 0 clamps to the first candidate', () => {
    const band = { min: 0, max: 20 };
    expect(pickSeedNoteValue(-0.3, 60, [band], 'hz')).toEqual(allowedNoteValues(60, band, 'hz')[0]);
  });

  it('falls through an empty first band to the second', () => {
    const empty = { min: 500, max: 600 };
    const live = { min: 0.1, max: 0.4 };
    const out = pickSeedNoteValue(0.5, 60, [empty, live], 'hz');
    inBand(out, 60, live, 'hz');
  });

  it('the first non-empty band wins even when a later band has more candidates', () => {
    const narrow = { min: 0.2, max: 0.3 }; // 1 bar (0.25 Hz) only at 60 BPM
    const wide = { min: 0, max: 20 };
    expect(pickSeedNoteValue(0.9, 60, [narrow, wide], 'hz')).toEqual(nv('1'));
  });

  it('returns undefined when every band is empty', () => {
    const empty = { min: 500, max: 600 };
    expect(pickSeedNoteValue(0.5, 60, [empty, { min: 700, max: 800 }], 'hz')).toBeUndefined();
  });

  it('returns undefined for no bands at all', () => {
    expect(pickSeedNoteValue(0.5, 60, [], 'hz')).toBeUndefined();
  });

  it('every lane band has a pick at every integer tempo in the 40-100 seed range', () => {
    for (let bpm = 40; bpm <= 100; bpm++) {
      for (const id of LFO_LANE_IDS) {
        const band = LFO_BANK_RATE_BANDS[id];
        inBand(pickSeedNoteValue(0.5, bpm, [band], 'hz'), bpm, band, 'hz');
      }
    }
  });
});
