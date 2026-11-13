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

describe('noteCloudModel: front or behind (§1.3)', () => {
  it.each(['C4', 'D4', 'E4', 'F#4', 'G#4', 'A#4', 'Bb4', 'Gb3', 'Ab5', 'C-1'])('%s crosses in front', (note) => {
    expect(nextDrawnNote(freshRobot(), event(note))?.layer).toBe('front');
  });

  it.each(['Db4', 'F4', 'G4', 'A4', 'B4', 'Eb4', 'C#4', 'D#2', 'C#-1'])('%s crosses behind', (note) => {
    expect(nextDrawnNote(freshRobot(), event(note))?.layer).toBe('behind');
  });
});
