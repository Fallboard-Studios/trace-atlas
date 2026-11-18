// ========================================
// IMPORTS
// ========================================
import { describe, it, expect } from 'vitest';
import alea from 'alea';
import { calmLimit, developMelody, developmentFloor, eventSixteenths } from './melodyDevelopment';
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

// How many calm changes a robot can make (spec §1.3, "A robot's pairs"; roadmap 92 Task 26).
describe('calmLimit (spec §1.3, §1.6)', () => {
  it('is the home notes less one: 2 for three notes, 0 for one and for none', () => {
    expect(calmLimit([ev(1, '4n'), ev(6, '8n'), ev(9, '4n')])).toBe(2);
    expect(calmLimit([ev(5, '4n')])).toBe(0);
    expect(calmLimit([])).toBe(0);
  });

  it('is where the calm side floors: one note at minus the limit, and one change past it the same melody', () => {
    const home = [ev(1, '4n'), ev(6, '8n'), ev(9, '4n'), ev(13, '16n')];
    const limit = calmLimit(home);
    const atLimit = developMelody(home, -limit, OPTS);
    expect(atLimit).toHaveLength(1);
    expect(developMelody(home, -limit + 1, OPTS)).toHaveLength(2);
    expect(developMelody(home, -limit - 1, OPTS)).toEqual(atLimit);
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

describe('developMelody: busier, the silence fills (spec §1.5, phase 3)', () => {
  const dirs = (seed: number, n: number) => {
    const rand = alea(`${seed}:development`);
    return Array.from({ length: n }, () => (rand() < 0.5 ? 1 : -1));
  };

  it('fills the one gap at the end of a bar with nothing left to split, as a neighbour of the bar first note', () => {
    // Twelve sixteenths, then silence at 13-16. T = 1: nothing splits; the fill length is 1.
    const twelve = Array.from({ length: 12 }, (_, i) => ev(i + 1, '16n', { noteIndex: i % 8 }));
    const want = dirs(OPTS.seed, 4);
    const one = developMelody(twelve, 1, OPTS);
    const fill = one.find((e) => e.startStep === 16)!;
    expect(fill).toMatchObject({ id: 'e1:d1', noteIndex: 0, octave: 4, sixteenths: 1, pitchStep: want[0] });
    expect(fill.rest).toBeUndefined();
    expect(fill.mark).toBeUndefined();
    // Each next fill sits flush against the one before, which leads into the bar first note.
    const four = developMelody(twelve, 4, OPTS);
    expect(four.filter((e) => e.startStep > 12).map((e) => e.startStep)).toEqual([13, 14, 15, 16]);
    expect(four.find((e) => e.startStep === 15)!.pitchStep).toBe(want[0] + want[1]);
    expect(four.find((e) => e.startStep === 13)!.noteIndex).toBe(0);
  });

  it('fills the longest gap first, the earliest on a tie, flush against the note it leads into', () => {
    // Gaps: 1-2 (2 long), 5-8 (4), 11-14 (4). T = 1.
    const melody = [ev(3, '16n'), ev(4, '16n'), ev(9, '16n'), ev(10, '16n'), ev(15, '16n'), ev(16, '16n')];
    expect(developMelody(melody, 1, OPTS).map((e) => e.startStep)).toEqual([3, 4, 8, 9, 10, 15, 16]);
    expect(developMelody(melody, 2, OPTS).map((e) => e.startStep)).toEqual([3, 4, 8, 9, 10, 14, 15, 16]);
    // Then three gaps of 3, 3 and 2: the earliest 3.
    expect(developMelody(melody, 3, OPTS).map((e) => e.startStep)).toEqual([3, 4, 7, 8, 9, 10, 14, 15, 16]);
    // The fill at 8 leads into the note at 9: its slot and octave.
    const leadsInto = developMelody(melody, 1, OPTS).find((e) => e.startStep === 8)!;
    expect(leadsInto.id).toBe('e9:d1');
  });

  it('fills a gap before the bar first note, leading into it', () => {
    // Floor 4: T = 4, one threshold, nothing at least 8 to split. The fill length is 4.
    const melody = [ev(5, '4n', { noteIndex: 3 }), ev(9, '4n'), ev(13, '4n')];
    const out = developMelody(melody, 1, { ...OPTS, floor: 4 });
    expect(bar(out)).toBe('1: 4, 5: 4, 9: 4, 13: 4');
    expect(out[0]).toMatchObject({ id: 'e5:d1', noteIndex: 3, sixteenths: 4 });
  });

  it('does not count a rest stamped on a note as a gap', () => {
    const rested = [ev(1, '4n', { rest: 0.75 }), ev(5, '4n', { rest: 0.5 }), ev(9, '4n'), ev(13, '4n', { rest: 0.25 })];
    for (const p of [1, 5, 20]) expect(bar(developMelody(rested, p, { ...OPTS, floor: 4 }))).toBe(bar(rested));
  });

  it('ends when no gap is a fill length long', () => {
    // A 1-sixteenth gap at 16 under a fill length of 2 is never filled.
    const melody = [ev(1, '4n'), ev(5, '4n'), ev(9, '4n'), ev(13, '4n', { sixteenths: 3 })];
    for (const p of [10, 30, 60]) {
      const out = developMelody(melody, p, { ...OPTS, floor: 2 });
      expect(out.some((e) => e.startStep === 16)).toBe(false);
      const last = out[out.length - 1];
      expect(last.startStep + eventSixteenths(last)).toBe(16);
    }
  });

  it('leaves no gap a fill length long once the fills are done', () => {
    const sparse = [ev(1, '8n'), ev(6, '4n'), ev(13, '16n')];
    const out = developMelody(sparse, 80, OPTS);
    let at = 1;
    for (const e of out) {
      expect(e.startStep).toBe(at);
      at = e.startStep + eventSixteenths(e);
    }
    expect(at).toBe(17);
  });
});

// A different path each trip (journey dynamics, 2026-11-18): with a variation (the journey's key and the trip) the
// visiting orders start somewhere else each trip and the directions are drawn afresh. The order comes from the key
// and the trip, never from the robot's seed, so robots that share a journey and a rhythm keep one rhythm.
describe('developMelody: a different path each trip', () => {
  // T = 2; the three quarters (3, 7, 11) are the first pass candidates, and every note but the first a calm candidate.
  const melody = [ev(1, '8n'), ev(3, '4n'), ev(7, '4n'), ev(11, '4n'), ev(15, '8n')];
  const vary = (trip: number, key = 'k:journey', seed = OPTS.seed) => ({ ...OPTS, seed, variation: { key, trip } });
  const TRIPS = Array.from({ length: 12 }, (_, t) => t);
  const steps = (events: MelodyEvent[]) => events.map((e) => e.pitchStep ?? 0).join(',');

  it('plays one path for one key and trip every time', () => {
    for (const p of [-3, -1, 1, 2, 5, 9]) expect(developMelody(melody, p, vary(3))).toEqual(developMelody(melody, p, vary(3)));
  });

  it('does not always split the same note first: the first busy change differs between trips', () => {
    expect(new Set(TRIPS.map((t) => bar(developMelody(melody, 1, vary(t))))).size).toBeGreaterThan(1);
  });

  it('does not always tie the same note first: the first calm change differs between trips', () => {
    expect(new Set(TRIPS.map((t) => bar(developMelody(melody, -1, vary(t))))).size).toBeGreaterThan(1);
  });

  it('keeps each change on top of the one before, within a trip, on both sides', () => {
    const starts = (events: MelodyEvent[]) => events.map((e) => e.startStep);
    for (const t of TRIPS) {
      for (let p = 0; p < 8; p++) {
        const a = starts(developMelody(melody, p, vary(t)));
        const next = starts(developMelody(melody, p + 1, vary(t)));
        for (const s of a) expect(next, `trip ${t} position ${p + 1}`).toContain(s);
      }
      for (let p = 0; p > -4; p--) {
        const a = starts(developMelody(melody, p, vary(t)));
        const next = starts(developMelody(melody, p - 1, vary(t)));
        expect(next).toHaveLength(a.length - 1);
        for (const s of next) expect(a, `trip ${t} position ${p - 1}`).toContain(s);
      }
    }
  });

  it('reaches the same calm floor whatever the order: the bar first note alone, sounding the whole bar', () => {
    for (const t of TRIPS) expect(bar(developMelody(melody, -4, vary(t)))).toBe('1: 16');
  });

  it('draws the order from the key and the trip, not the robot seed: two seeds play one rhythm at every position', () => {
    for (const t of TRIPS) {
      for (let p = -4; p <= 14; p++) {
        expect(bar(developMelody(melody, p, vary(t, 'k:journey', 0.1))), `trip ${t} position ${p}`).toBe(
          bar(developMelody(melody, p, vary(t, 'k:journey', 0.9))),
        );
      }
    }
  });

  it('draws the order from the key: another journey takes another order on some trip', () => {
    const paths = (key: string) => TRIPS.map((t) => bar(developMelody(melody, 1, vary(t, key)))).join(' / ');
    expect(new Set(['a:journey', 'b:journey', 'c:journey', 'd:journey'].map(paths)).size).toBeGreaterThan(1);
  });

  it('draws the directions afresh each trip, from the seed and the trip', () => {
    // Positions past the splits, so several notes carry a step.
    expect(new Set(TRIPS.map((t) => steps(developMelody(melody, 14, vary(t))))).size).toBeGreaterThan(1);
    // The rhythm aside, two seeds on one trip still differ in their steps somewhere.
    const differs = TRIPS.some((t) => steps(developMelody(melody, 14, vary(t, 'k:journey', 0.1))) !== steps(developMelody(melody, 14, vary(t, 'k:journey', 0.9))));
    expect(differs).toBe(true);
  });

  it('starts the octave jumps and the shifts somewhere else on another trip', () => {
    const full = [ev(1, '4n'), ev(5, '4n'), ev(9, '4n'), ev(13, '4n')];
    const jumped = (t: number) => developMelody(full, 1, { ...vary(t), floor: 4, octaveRange: [1, 7] }).findIndex((e) => e.octave === 5);
    expect(new Set(TRIPS.map(jumped)).size).toBeGreaterThan(1);
    const shifted = (t: number) => developMelody(full, 1, { ...vary(t), floor: 4 }).findIndex((e) => e.pitchStep !== undefined);
    expect(new Set(TRIPS.map(shifted)).size).toBeGreaterThan(1);
  });

  it('with no variation plays the written order: the shortest candidate first', () => {
    expect(bar(developMelody(melody, 1, OPTS))).toBe('1: 2, 3: 2, 5: 2, 7: 4, 11: 4, 15: 2');
    expect(bar(developMelody(melody, -1, OPTS))).toBe('1: 2, 3: 4, 7: 4, 11: 6');
  });
});

// The octave jumps (journey dynamics, Crawford 2026-11-18): after the fills and before the shifts, a change moves one
// note an octave. A note in octave 1, 4 or 5 jumps up; a note in any other octave jumps down.
describe('developMelody: busier, the octave jumps', () => {
  const WIDE = { ...OPTS, floor: 16, octaveRange: [1, 7] as [number, number] };
  /** One whole note at a floor of a whole note: nothing to split, no gap, so change 1 is its octave jump. */
  const whole = (octave: number | undefined) => [ev(1, '1n', octave === undefined ? { octave: undefined } : { octave })];

  it('jumps a note in octave 1, 4 or 5 up, and a note in octave 2, 3, 6 or 7 down', () => {
    const after: Record<number, number> = { 1: 2, 2: 1, 3: 2, 4: 5, 5: 6, 6: 5, 7: 6 };
    for (const [from, to] of Object.entries(after)) {
      const out = developMelody(whole(Number(from)), 1, WIDE);
      expect(out[0].octave, `octave ${from}`).toBe(to);
    }
  });

  it('reads a note with no octave as octave 4, and jumps it to 5', () => {
    expect(developMelody(whole(undefined), 1, WIDE)[0].octave).toBe(5);
  });

  it('changes the octave and nothing else: the id, slot, start, length, rest and mark stay, and no pitch step is added', () => {
    const home = [ev(1, '1n', { octave: 3, noteIndex: 5, rest: 0.25, mark: 'accent' })];
    const out = developMelody(home, 1, WIDE);
    expect(out[0]).toEqual({ ...home[0], octave: 2 });
    expect(out[0]).not.toBe(home[0]);
  });

  // Four quarters at floor 4: no split, no fill. By length then start they are 1, 5, 9, 13; from alternating ends 1, 13.
  const full = [ev(1, '4n', { octave: 1 }), ev(5, '4n', { octave: 2 }), ev(9, '4n', { octave: 4 }), ev(13, '4n', { octave: 6 })];
  const FLOOR4 = { ...OPTS, floor: 4, octaveRange: [1, 7] as [number, number] };
  const octaves = (events: MelodyEvent[]) => events.map((e) => e.octave);

  it('jumps one note a change, from alternating ends, and stops at half the notes that can jump, rounded up', () => {
    expect(octaves(developMelody(full, 1, FLOOR4))).toEqual([2, 2, 4, 6]);
    expect(octaves(developMelody(full, 2, FLOOR4))).toEqual([2, 2, 4, 5]);
    // Change 3 is a shift: no third jump, and the first note moves a palette step.
    const three = developMelody(full, 3, FLOOR4);
    expect(octaves(three)).toEqual([2, 2, 4, 5]);
    expect(three[0].pitchStep).toBeDefined();
    expect(octaves(developMelody(full, 30, FLOOR4))).toEqual([2, 2, 4, 5]);
  });

  it('never jumps a note out of the robot octave range: such a note is not counted, and the next in line jumps', () => {
    // Range 2 to 6: the octave-1 note is outside already and its jump lands inside (2); the octave-6 note may go to 5;
    // the octave-2 note would leave (to 1), so it is no candidate. Candidates 1, 9, 13: half of three is two.
    const out = developMelody(full, 2, { ...FLOOR4, octaveRange: [2, 6] });
    expect(octaves(out)).toEqual([2, 2, 4, 5]);
    // Range 4 to 4: the one note there would jump to 5, and the others stay outside it: no jump at all.
    const narrow = developMelody(full, 1, { ...FLOOR4, octaveRange: [4, 4] });
    expect(octaves(narrow)).toEqual([1, 2, 4, 6]);
    expect(narrow[0].pitchStep).toBeDefined(); // change 1 is already a shift
  });

  it('makes no jump with no octave range handed in: the shifts follow the fills', () => {
    const out = developMelody(full, 1, { ...OPTS, floor: 4 });
    expect(octaves(out)).toEqual([1, 2, 4, 6]);
    expect(out[0].pitchStep).toBeDefined();
  });

  it('starts once the fills are done, and a note a change added may jump too', () => {
    const twelve = Array.from({ length: 12 }, (_, i) => ev(i + 1, '16n'));
    const opts = { ...OPTS, octaveRange: [1, 7] as [number, number] };
    // Four fills (13 to 16), then sixteen notes of one length: change 5 jumps the first.
    expect(octaves(developMelody(twelve, 4, opts)).every((o) => o === 4)).toBe(true);
    const five = developMelody(twelve, 5, opts);
    expect(bar(five)).toBe(bar(developMelody(twelve, 4, opts)));
    expect(octaves(five)).toEqual([5, ...Array.from({ length: 15 }, () => 4)]);
    // Change 6 jumps the last note, a fill: half of sixteen is eight jumps in all.
    expect(octaves(developMelody(twelve, 6, opts))[15]).toBe(5);
    expect(octaves(developMelody(twelve, 40, opts)).filter((o) => o === 5)).toHaveLength(8);
  });
});

describe('developMelody: busier, the shifts (spec §1.5, phase 4)', () => {
  const dirs = (seed: number, n: number) => {
    const rand = alea(`${seed}:development`);
    return Array.from({ length: n }, () => (rand() < 0.5 ? 1 : -1));
  };
  // A full bar of four quarters at floor 4: nothing to split, no gap, so every change is a shift.
  const full = [ev(1, '4n', { rest: 0.5 }), ev(5, '4n', { mark: 'staccato' }), ev(9, '4n'), ev(13, '4n')];
  const FLOOR4 = { ...OPTS, floor: 4 };

  it('changes one note pitchStep by one and nothing else', () => {
    const want = dirs(OPTS.seed, 1);
    const out = developMelody(full, 1, FLOOR4);
    expect(out[0]).toEqual({ ...full[0], pitchStep: want[0] });
    for (let i = 1; i < 4; i++) expect(out[i]).toBe(full[i]);
  });

  it('visits the notes in start order, and wraps round', () => {
    const want = dirs(OPTS.seed, 9);
    const shuffled = [full[2], full[0], full[3], full[1]];
    const out = developMelody(shuffled, 9, FLOOR4);
    expect(out.map((e) => e.startStep)).toEqual([1, 5, 9, 13]);
    // Note i is moved by changes i+1, i+5 and (the first only) i+9, each time the way change i+1 sent it.
    expect(out.map((e) => e.pitchStep ?? 0)).toEqual([3 * want[0], 2 * want[1], 2 * want[2], 2 * want[3]]);
  });

  it('holds each note direction: its first shift draws it, and every later round moves it the same way', () => {
    const want = dirs(OPTS.seed, 4);
    for (const rounds of [1, 2, 5]) {
      const out = developMelody(full, 4 * rounds, FLOOR4);
      expect(out.map((e) => e.pitchStep ?? 0)).toEqual(want.map((d) => rounds * d));
    }
    // So a shift never undoes an earlier one: no note is back on its home pitch at any position.
    for (let p = 4; p < 60; p++) {
      for (const e of developMelody(full, p, FLOOR4)) expect(e.pitchStep ?? 0).not.toBe(0);
    }
  });

  it('moves a note a split added on the way the split sent it', () => {
    // Two half notes at floor 4: two splits at a quarter (1: 4, 5: 4, 9: 4, 13: 4), then the shifts.
    const halves = [ev(1, '2n'), ev(9, '2n')];
    const want = dirs(OPTS.seed, 6);
    const split = developMelody(halves, 2, FLOOR4);
    expect(bar(split)).toBe('1: 4, 5: 4, 9: 4, 13: 4');
    expect(split.map((e) => e.pitchStep ?? 0)).toEqual([0, want[0], 0, want[1]]);
    // One round of shifts: the two home notes take changes 3 and 5's draws, the added two keep their own way.
    const round = developMelody(halves, 6, FLOOR4);
    expect(round.map((e) => e.pitchStep ?? 0)).toEqual([want[2], 2 * want[0], want[4], 2 * want[1]]);
  });

  it('never runs out: each next position is one shift on top of the last', () => {
    for (let p = 1; p < 40; p++) {
      const a = developMelody(full, p, FLOOR4);
      const b = developMelody(full, p + 1, FLOOR4);
      const moved = b.filter((e, i) => (e.pitchStep ?? 0) !== (a[i].pitchStep ?? 0));
      expect(moved).toHaveLength(1);
      expect(bar(b)).toBe(bar(full));
    }
  });

  it('starts once the fills are done', () => {
    const twelve = Array.from({ length: 12 }, (_, i) => ev(i + 1, '16n'));
    // Four fills (13 to 16), then change 5 shifts the bar first note.
    const four = developMelody(twelve, 4, OPTS);
    const five = developMelody(twelve, 5, OPTS);
    expect(bar(five)).toBe(bar(four));
    expect(five[0].pitchStep).toBe(dirs(OPTS.seed, 5)[4]);
  });
});
