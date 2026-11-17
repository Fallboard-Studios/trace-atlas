// ========================================
// IMPORTS
// ========================================
import { describe, it, expect } from 'vitest';
import { developMelody, developmentFloor, eventSixteenths } from './melodyDevelopment';
import type { MelodyEvent, NoteDuration } from '../types/Robot';

// ========================================
// HELPERS
// ========================================
function ev(startStep: number, length: NoteDuration, extra: Partial<MelodyEvent> = {}): MelodyEvent {
  return { id: `e${startStep}`, startStep, length, noteIndex: 0, octave: 4, ...extra };
}

/** A melody as the spec's tables write it: `start: sixteenths`, in start order. */
function bar(events: MelodyEvent[]): string {
  return [...events]
    .sort((a, b) => a.startStep - b.startStep)
    .map((e) => `${e.startStep}: ${eventSixteenths(e)}`)
    .join(', ');
}

const OPTS = { floor: 1, seed: 0.4375 };

// ========================================
// TESTS
// ========================================
describe('eventSixteenths (spec §1.4)', () => {
  it('reads the four home lengths as 1, 2, 4 and 8 sixteenths', () => {
    expect(eventSixteenths(ev(1, '16n'))).toBe(1);
    expect(eventSixteenths(ev(1, '8n'))).toBe(2);
    expect(eventSixteenths(ev(1, '4n'))).toBe(4);
    expect(eventSixteenths(ev(1, '2n'))).toBe(8);
  });

  it('reads anything a bar or longer as 16, and a thirty-second as 1', () => {
    expect(eventSixteenths(ev(1, '1n'))).toBe(16);
    expect(eventSixteenths(ev(1, '2m'))).toBe(16);
    expect(eventSixteenths(ev(1, '4m'))).toBe(16);
    expect(eventSixteenths(ev(1, '32n'))).toBe(1);
  });

  it('prefers the sixteenths field when it is set', () => {
    expect(eventSixteenths(ev(1, '4n', { sixteenths: 3 }))).toBe(3);
    expect(eventSixteenths(ev(1, '16n', { sixteenths: 7 }))).toBe(7);
    expect(eventSixteenths(ev(1, '2n', { sixteenths: 1 }))).toBe(1);
  });
});

describe('developmentFloor (spec §1.8)', () => {
  it('is 1 for attacks up to 0.3 s at a band top of 100 BPM', () => {
    for (const attack of [0.015, 0.1, 0.2, 0.29, 0.3]) expect(developmentFloor(attack, 100)).toBe(1);
  });

  it('rises past 0.3 s, and is 4 (a quarter note) at 1.14 s', () => {
    expect(developmentFloor(0.31, 100)).toBe(2);
    expect(developmentFloor(0.6, 100)).toBe(2);
    expect(developmentFloor(0.61, 100)).toBe(3);
    expect(developmentFloor(1.14, 100)).toBe(4);
  });

  it('follows the band top: a faster top raises the floor', () => {
    expect(developmentFloor(0.3, 200)).toBe(2);
    expect(developmentFloor(1.14, 50)).toBe(2);
  });

  it('is never below 1', () => {
    expect(developmentFloor(0, 100)).toBe(1);
    expect(developmentFloor(-1, 100)).toBe(1);
    expect(developmentFloor(Number.NaN, 100)).toBe(1);
    expect(developmentFloor(0.5, 0)).toBe(1);
    expect(developmentFloor(0.5, Number.NaN)).toBe(1);
  });
});

describe('developMelody: home and the calm side (spec §1.6)', () => {
  // Candidates (every note but the first), by length then start: 13:1, 6:2, 9:4. Visits: 13, then 9, then 6.
  const home = [ev(1, '4n'), ev(6, '8n'), ev(9, '4n'), ev(13, '16n')];

  it('returns the home array itself at position 0', () => {
    expect(developMelody(home, 0, OPTS)).toBe(home);
  });

  it('at -1 removes the shortest candidate, and the note before it sounds on to its end', () => {
    expect(bar(developMelody(home, -1, OPTS))).toBe('1: 4, 6: 2, 9: 5');
  });

  it('covers any silence between the note before and the tied note', () => {
    // 1 ends at 3, 5 is the shortest candidate: 1 sounds on through the silence at 3-4 to 5's end, 6.
    const gappy = [ev(1, '8n'), ev(5, '16n'), ev(9, '4n')];
    expect(bar(developMelody(gappy, -1, OPTS))).toBe('1: 5, 9: 4');
  });

  it('visits the candidates from alternating ends: shortest, longest, second shortest', () => {
    expect(bar(developMelody(home, -2, OPTS))).toBe('1: 4, 6: 8');
    expect(bar(developMelody(home, -3, OPTS))).toBe('1: 13');
  });

  it('breaks a tie in length by start', () => {
    const even = [ev(1, '8n'), ev(5, '8n'), ev(9, '8n'), ev(13, '8n')];
    // By length then start: 5, 9, 13. Shortest first is 5, then the longest end (13), then 9.
    expect(bar(developMelody(even, -1, OPTS))).toBe('1: 6, 9: 2, 13: 2');
    expect(bar(developMelody(even, -2, OPTS))).toBe('1: 6, 9: 6');
  });

  it('floors at one note, the bar first at its home start, and every position below equals the floor', () => {
    const floor = developMelody(home, -3, OPTS);
    expect(floor).toHaveLength(1);
    expect(floor[0].startStep).toBe(1);
    for (const p of [-4, -5, -20, -1000]) expect(developMelody(home, p, OPTS)).toEqual(floor);
  });

  it('keeps the bar first note even when the home melody is out of start order', () => {
    const shuffled = [home[2], home[0], home[3], home[1]];
    expect(bar(developMelody(shuffled, -1, OPTS))).toBe('1: 4, 6: 2, 9: 5');
    expect(developMelody(shuffled, -9, OPTS).map((e) => e.startStep)).toEqual([1]);
  });

  it('returns a one-note and an empty home melody unchanged at any negative position', () => {
    const one = [ev(5, '4n')];
    const none: MelodyEvent[] = [];
    for (const p of [-1, -2, -50]) {
      expect(developMelody(one, p, OPTS)).toEqual(one);
      expect(developMelody(none, p, OPTS)).toEqual([]);
    }
  });

  it('keeps an untouched home event as the same object, and makes a lengthened one a new object with its id, rest and mark', () => {
    const marked = [ev(1, '4n'), ev(6, '8n', { rest: 0.5, mark: 'tenuto' }), ev(9, '4n'), ev(13, '16n')];
    const out = developMelody(marked, -2, OPTS);
    expect(out[0]).toBe(marked[0]);
    expect(out[1]).not.toBe(marked[1]);
    expect(out[1]).toMatchObject({ id: 'e6', startStep: 6, rest: 0.5, mark: 'tenuto', noteIndex: 0, octave: 4, sixteenths: 8 });
    expect(out[1].pitchStep).toBeUndefined();
    expect(marked[1].sixteenths).toBeUndefined();
  });

  it('never moves a start: each note left sounds on its home start', () => {
    for (let p = -1; p >= -3; p--) {
      for (const e of developMelody(home, p, OPTS)) expect(home.some((h) => h.id === e.id && h.startStep === e.startStep)).toBe(true);
    }
  });
});
