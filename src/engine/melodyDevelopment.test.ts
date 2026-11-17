// ========================================
// IMPORTS
// ========================================
import { describe, it, expect } from 'vitest';
import alea from 'alea';
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

describe('developMelody: busier, the first pass of splits (spec §1.5, phase 1)', () => {
  // The worked example: a half note at 1, a quarter at 9, an eighth at 13. T = 2; candidates at T: the quarter, the half.
  const worked = [ev(1, '2n'), ev(9, '4n'), ev(13, '8n')];
  /** draw k of the robot's development stream, as a direction. */
  const directions = (seed: number, n: number) => {
    const rand = alea(`${seed}:development`);
    return Array.from({ length: n }, () => (rand() < 0.5 ? 1 : -1));
  };

  it('plays the worked example, position 1, literally', () => {
    expect(bar(developMelody(worked, 1, OPTS))).toBe('1: 8, 9: 2, 11: 2, 13: 2');
  });

  it('splits a six-sixteenth note at an eighth-note threshold into four and two', () => {
    const dotted = [ev(1, '8n'), ev(3, '4n', { sixteenths: 6 })];
    expect(bar(developMelody(dotted, 1, OPTS))).toBe('1: 2, 3: 4, 7: 2');
  });

  it('keeps the split note id, slot, rest and mark, and gives the new note none, its derived id and a neighbour step', () => {
    const marked = [ev(1, '2n'), ev(9, '4n', { noteIndex: 5, octave: 3, rest: 0.25, mark: 'accent', pitchLocked: true }), ev(13, '8n')];
    const out = developMelody(marked, 1, OPTS);
    const kept = out.find((e) => e.id === 'e9')!;
    const added = out.find((e) => e.startStep === 11)!;
    expect(kept).toMatchObject({ startStep: 9, noteIndex: 5, octave: 3, rest: 0.25, mark: 'accent', sixteenths: 2 });
    expect(kept.pitchStep).toBeUndefined();
    expect(added).toMatchObject({ id: 'e9:d1', startStep: 11, noteIndex: 5, octave: 3, sixteenths: 2, pitchStep: directions(OPTS.seed, 1)[0] });
    expect(added.rest).toBeUndefined();
    expect(added.mark).toBeUndefined();
    expect(added.pitchLocked).toBeUndefined();
    expect(out.find((e) => e.id === 'e1')).toBe(marked[0]);
    expect(out.find((e) => e.id === 'e13')).toBe(marked[2]);
  });

  it('keeps the two parts of a split summing to the note split', () => {
    const out = developMelody(worked, 1, OPTS);
    const parts = out.filter((e) => e.startStep >= 9 && e.startStep < 13).map(eventSixteenths);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(4);
  });

  it('never splits a note shorter than 2T: a note one and a half thresholds long stays whole', () => {
    // T = 2; the 3-long note is under 2T = 4, so the only candidate is the 4.
    const melody = [ev(1, '8n'), ev(3, '4n', { sixteenths: 3 }), ev(6, '4n')];
    expect(bar(developMelody(melody, 1, OPTS))).toBe('1: 2, 3: 3, 6: 2, 8: 2');
  });

  it('raises the threshold to a floor above T', () => {
    const melody = [ev(1, '8n'), ev(3, '4n'), ev(7, '2n')];
    // Floor 1: T = 2, candidates 3:4 and 7:8, half of two is one: the 4 splits at 2.
    expect(bar(developMelody(melody, 1, { ...OPTS, floor: 1 }))).toBe('1: 2, 3: 2, 5: 2, 7: 8');
    // Floor 3: T = 3, the only candidate is the 8, split at 3.
    expect(bar(developMelody(melody, 1, { ...OPTS, floor: 3 }))).toBe('1: 2, 3: 4, 7: 5, 12: 3');
  });

  it('visits from alternating ends and stops at half the candidates, rounded up', () => {
    // T = 2. Candidates at T, by length then start: 3, 7, 11 (all 4 long). Visits: 3, then 11; half of three is two.
    const melody = [ev(1, '8n'), ev(3, '4n'), ev(7, '4n'), ev(11, '4n'), ev(15, '8n')];
    expect(bar(developMelody(melody, 1, OPTS))).toBe('1: 2, 3: 2, 5: 2, 7: 4, 11: 4, 15: 2');
    expect(bar(developMelody(melody, 2, OPTS))).toBe('1: 2, 3: 2, 5: 2, 7: 4, 11: 2, 13: 2, 15: 2');
    // The third candidate is never split at T by this pass.
    const third = developMelody(melody, 3, OPTS).find((e) => e.id === 'e7')!;
    expect(eventSixteenths(third)).toBe(4);
  });

  it('makes no split with no candidate: a bar of sixteenths keeps its rhythm', () => {
    const sixteenths = Array.from({ length: 16 }, (_, i) => ev(i + 1, '16n'));
    expect(bar(developMelody(sixteenths, 1, OPTS))).toBe(bar(sixteenths));
  });

  it('takes change k direction from draw k of the seed development stream', () => {
    const melody = [ev(1, '8n'), ev(3, '4n'), ev(7, '4n'), ev(11, '4n'), ev(15, '8n')];
    const want = directions(OPTS.seed, 2);
    const out = developMelody(melody, 2, OPTS);
    expect(out.find((e) => e.id === 'e3:d1')!.pitchStep).toBe(want[0]);
    expect(out.find((e) => e.id === 'e11:d2')!.pitchStep).toBe(want[1]);
  });

  it('gives the same directions for one seed every time, and the same rhythm with other directions for another', () => {
    const melody = [ev(1, '8n'), ev(3, '4n'), ev(7, '4n'), ev(11, '4n'), ev(15, '8n')];
    const a = developMelody(melody, 2, OPTS);
    expect(developMelody(melody, 2, OPTS)).toEqual(a);
    const steps = (out: MelodyEvent[]) => out.map((e) => e.pitchStep ?? 0).join(',');
    const seeds = [0.1, 0.2, 0.3, 0.55, 0.7, 0.9];
    for (const seed of seeds) expect(bar(developMelody(melody, 2, { ...OPTS, seed }))).toBe(bar(a));
    expect(new Set(seeds.map((seed) => steps(developMelody(melody, 2, { ...OPTS, seed })))).size).toBeGreaterThan(1);
  });

  it('returns an empty home melody unchanged at any positive position', () => {
    for (const p of [1, 2, 30]) expect(developMelody([], p, OPTS)).toEqual([]);
  });
});

describe('developMelody: busier, two thresholds (spec §1.5, phase 2)', () => {
  const worked = [ev(1, '2n'), ev(9, '4n'), ev(13, '8n')];
  const lengths = (events: MelodyEvent[]) => events.map(eventSixteenths);

  it('plays the worked example, positions 2 and 3, literally', () => {
    expect(bar(developMelody(worked, 2, OPTS))).toBe('1: 8, 9: 1, 10: 1, 11: 2, 13: 2');
    expect(bar(developMelody(worked, 3, OPTS))).toBe('1: 6, 7: 2, 9: 1, 10: 1, 11: 2, 13: 2');
  });

  it('splits a piece an earlier split made, when it is long enough', () => {
    // Position 4 is at T / 2 = 1 again, the shortest: the 2 made at 7 by position 3.
    expect(bar(developMelody(worked, 4, OPTS))).toBe('1: 6, 7: 1, 8: 1, 9: 1, 10: 1, 11: 2, 13: 2');
  });

  it('hands a threshold with no candidate its turn to the other', () => {
    // T = 8, T / 2 = 4. Change 2 is at T, the longest, but nothing is 16 long: it splits the longest at 4.
    const halves = [ev(1, '2n'), ev(9, '2n')];
    expect(bar(developMelody(halves, 1, OPTS))).toBe('1: 4, 5: 4, 9: 8');
    expect(bar(developMelody(halves, 2, OPTS))).toBe('1: 4, 5: 4, 9: 4, 13: 4');
  });

  it('ends with no note at least twice the smaller threshold', () => {
    const at = developMelody(worked, 60, OPTS);
    expect(Math.max(...lengths(at))).toBeLessThan(2);
    const halves = developMelody([ev(1, '2n'), ev(9, '2n')], 60, OPTS);
    expect(Math.max(...lengths(halves))).toBeLessThan(8);
  });

  it('uses the one threshold when T is 1, and still ends', () => {
    const withSixteenth = [ev(1, '16n'), ev(2, '4n'), ev(6, '2n')];
    expect(lengths(developMelody(withSixteenth, 60, OPTS)).every((l) => l === 1)).toBe(true);
  });

  it('uses the one threshold when the floor is at or above T, and still ends', () => {
    const melody = [ev(1, '8n'), ev(3, '4n'), ev(7, '2n')];
    const at = lengths(developMelody(melody, 60, { ...OPTS, floor: 4 }));
    expect(Math.max(...at)).toBeLessThan(8);
    expect(Math.min(...at)).toBeGreaterThanOrEqual(2);
    // The home 2 is under the floor already; no change makes anything new under 4.
    expect(developMelody(melody, 60, { ...OPTS, floor: 4 }).filter((e) => eventSixteenths(e) < 4).map((e) => e.id)).toEqual(['e1']);
  });

  it('reads an odd T subdivision as its whole half', () => {
    // T = 3 (floor 1): the subdivision is 1. Phase 1 splits the 6 at 3; phase 2 then splits the shortest at 1.
    const odd = [ev(1, '4n', { sixteenths: 3 }), ev(4, '2n', { sixteenths: 6 })];
    expect(bar(developMelody(odd, 1, OPTS))).toBe('1: 3, 4: 3, 7: 3');
    expect(bar(developMelody(odd, 2, OPTS))).toBe('1: 2, 3: 1, 4: 3, 7: 3');
  });

  it('never makes a note shorter than the floor, at any position', () => {
    const melody = [ev(1, '2n'), ev(9, '4n'), ev(13, '8n'), ev(15, '8n')];
    for (const floor of [1, 2, 3, 4]) {
      for (let p = 1; p <= 40; p++) {
        const made = developMelody(melody, p, { ...OPTS, floor }).filter((e) => !melody.includes(e) && e.id.includes(':d'));
        for (const e of made) expect(eventSixteenths(e)).toBeGreaterThanOrEqual(floor);
      }
    }
  });
});
