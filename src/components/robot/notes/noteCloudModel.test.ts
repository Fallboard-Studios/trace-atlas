// ========================================
// noteCloudModel (docs/specs/ROBOT_NOTE_CLOUD.md §1.3, §4, §7.2 A3; plan Tasks 4–6)
// ========================================
import { describe, expect, it } from 'vitest';

import type { RobotNoteEvent } from '../../../engine/noteEvents';
import { nextDrawnNote } from './noteCloudModel';

/** Each test plays on robots of its own, so no model is shared between tests. */
let robotCount = 0;
const freshRobot = () => `model-test-${++robotCount}`;

/** A note event; `at` steps on so that, by default, no two notes run into each other by accident. */
let clock = 0;
function event(note: string, overrides: Partial<RobotNoteEvent> = {}): RobotNoteEvent {
  clock += 10;
  return { lead: 0.2, duration: 0.25, at: clock, note, ...overrides };
}

describe('noteCloudModel: a note’s row (§1.3, §7.2 A3)', () => {
  it('the first note sits at mid-height; a second an octave up sits at the top and moves nothing already returned', () => {
    const robot = freshRobot();
    const first = nextDrawnNote(robot, event('C4'));
    expect(first?.row).toBe(0);
    const second = nextDrawnNote(robot, event('C5'));
    expect(second?.row).toBe(0.5);
    expect(first?.row).toBe(0);
  });

  it('the range is at least an octave: a fifth up does not leap the whole roll', () => {
    const robot = freshRobot();
    nextDrawnNote(robot, event('C4'));
    // low 60, high 67, centre 63.5, range 12: (67 − 63.5) / 12
    expect(nextDrawnNote(robot, event('G4'))?.row).toBeCloseTo(3.5 / 12, 10);
  });

  it('a pitch above the range so far widens it for the notes after it', () => {
    const robot = freshRobot();
    nextDrawnNote(robot, event('C4'));
    expect(nextDrawnNote(robot, event('C5'))?.row).toBe(0.5);
    expect(nextDrawnNote(robot, event('C6'))?.row).toBe(0.5); // low 60, high 84, centre 72, range 24
    expect(nextDrawnNote(robot, event('C5'))?.row).toBe(0);
    expect(nextDrawnNote(robot, event('C4'))?.row).toBe(-0.5);
  });

  it('rows never leave −0.5 to 0.5, wherever the melody wanders', () => {
    const robot = freshRobot();
    const notes = ['E3', 'B5', 'C2', 'G7', 'D4', 'A0', 'F#6', 'C#4', 'Bb1', 'G4'];
    for (const note of notes) {
      const drawn = nextDrawnNote(robot, event(note));
      expect(drawn).not.toBeNull();
      expect(drawn!.row).toBeGreaterThanOrEqual(-0.5);
      expect(drawn!.row).toBeLessThanOrEqual(0.5);
    }
  });

  it('a flat and its sharp are the same pitch', () => {
    const robot = freshRobot();
    nextDrawnNote(robot, event('C4'));
    nextDrawnNote(robot, event('C5'));
    expect(nextDrawnNote(robot, event('Bb4'))?.row).toBe(nextDrawnNote(robot, event('A#4'))?.row);
  });

  it('a note that does not parse draws at mid-height, behind, and does not move the range', () => {
    const robot = freshRobot();
    expect(nextDrawnNote(robot, event('nonsense'))).toMatchObject({ row: 0, layer: 'behind' });
    nextDrawnNote(robot, event('C4'));
    expect(nextDrawnNote(robot, event('C5'))?.row).toBe(0.5);
    expect(nextDrawnNote(robot, event('H4'))).toMatchObject({ row: 0, layer: 'behind' });
    expect(nextDrawnNote(robot, event('C4'))?.row).toBe(-0.5);
  });

  it('carries the note’s sounding length', () => {
    expect(nextDrawnNote(freshRobot(), event('C4', { duration: 0.375 }))?.duration).toBe(0.375);
  });

  it('two robots’ models do not share a range', () => {
    const a = freshRobot();
    const b = freshRobot();
    nextDrawnNote(a, event('C4'));
    nextDrawnNote(a, event('C6'));
    expect(nextDrawnNote(b, event('C5'))?.row).toBe(0);
    expect(nextDrawnNote(b, event('C6'))?.row).toBe(0.5);
  });
});

/** Plays a melody on one robot, each note `[pitch, at, duration]`, and returns which were drawn. */
function drawnOf(robot: string, notes: Array<[string, number, number]>): boolean[] {
  return notes.map(([note, at, duration]) => nextDrawnNote(robot, { lead: 0.2, duration, at, note }) !== null);
}

/** `count` notes of one pitch and length, each starting as the one before stops sounding. */
function touching(note: string, count: number, start = 100, duration = 0.25): Array<[string, number, number]> {
  return Array.from({ length: count }, (_, i) => [note, start + i * duration, duration]);
}

describe('noteCloudModel: a repeated note is not drawn twice (§1.3, §7.2 A2, A4)', () => {
  it('two identical notes that run straight into each other draw the first only', () => {
    expect(drawnOf(freshRobot(), touching('C4', 2))).toEqual([true, false]);
  });

  it('a run of five draws the first, third and fifth (the run is counted on notes not drawn)', () => {
    expect(drawnOf(freshRobot(), touching('E4', 5))).toEqual([true, false, true, false, true]);
  });

  it('a flat and its sharp spelling are one pitch, so they make a run', () => {
    const robot = freshRobot();
    expect(drawnOf(robot, [['Bb4', 100, 0.25], ['A#4', 100.25, 0.25]])).toEqual([true, false]);
  });

  it('the same pitch at a different length is drawn and starts a new run', () => {
    const robot = freshRobot();
    expect(
      drawnOf(robot, [
        ['C4', 100, 0.25],
        ['C4', 100.25, 0.125],
        ['C4', 100.375, 0.125],
        ['C4', 100.5, 0.125],
      ]),
    ).toEqual([true, true, false, true]);
  });

  it('lengths equal to the millisecond are the same length', () => {
    const robot = freshRobot();
    expect(drawnOf(robot, [['C4', 100, 0.2502], ['C4', 100.2502, 0.2498]])).toEqual([true, false]);
  });

  it('a different pitch between two identical notes breaks the run', () => {
    const robot = freshRobot();
    expect(
      drawnOf(robot, [
        ['C4', 100, 0.25],
        ['D4', 100.25, 0.25],
        ['C4', 100.5, 0.25],
        ['C4', 100.75, 0.25],
      ]),
    ).toEqual([true, true, true, false]);
  });

  it('an identical note after a rest is drawn and starts a new run', () => {
    const robot = freshRobot();
    // 0.0625 s of silence after the first note: more than NOTE_REST_MIN_SECONDS. Without the rest the second note
    // would be the run's second, and not drawn.
    expect(
      drawnOf(robot, [
        ['C4', 100, 0.25],
        ['C4', 100.3125, 0.25],
        ['C4', 100.5625, 0.25],
        ['C4', 100.8125, 0.25],
      ]),
    ).toEqual([true, true, false, true]);
  });

  it('a note cut short by its articulation leaves a rest before the next', () => {
    const robot = freshRobot();
    // written as touching sixteenths, sounding as staccato: 0.125 of each 0.25 s step
    expect(
      drawnOf(robot, [
        ['C4', 100, 0.125],
        ['C4', 100.25, 0.125],
      ]),
    ).toEqual([true, true]);
  });

  it('two notes 40 ms apart are still a run (Humanize’s reach, not a rest)', () => {
    const robot = freshRobot();
    expect(drawnOf(robot, [['C4', 100, 0.25], ['C4', 100.29, 0.25]])).toEqual([true, false]);
  });

  it('notes that overlap are a run', () => {
    const robot = freshRobot();
    expect(drawnOf(robot, [['C4', 100, 0.25], ['C4', 100.2, 0.25]])).toEqual([true, false]);
  });

  it('two robots’ models do not share a run', () => {
    const a = freshRobot();
    const b = freshRobot();
    expect(drawnOf(a, touching('C4', 1))).toEqual([true]);
    expect(drawnOf(b, touching('C4', 1, 100.25))).toEqual([true]);
    expect(drawnOf(a, touching('C4', 1, 100.25))).toEqual([false]);
  });
});

describe('noteCloudModel: front or behind (§1.3)', () => {
  it.each(['C4', 'D4', 'E4', 'F#4', 'G#4', 'A#4', 'Bb4', 'Gb3', 'Ab5', 'C-1'])('%s crosses in front', (note) => {
    expect(nextDrawnNote(freshRobot(), event(note))?.layer).toBe('front');
  });

  it.each(['Db4', 'F4', 'G4', 'A4', 'B4', 'Eb4', 'C#4', 'D#2', 'C#-1'])('%s crosses behind', (note) => {
    expect(nextDrawnNote(freshRobot(), event(note))?.layer).toBe('behind');
  });
});
