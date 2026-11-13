import type { MelodyEvent } from '../types/Robot';

/**
 * A fixed test pattern, standing in for a robot's real melody so the step, the beat and the measure can be followed by
 * ear — not a generated melody, and never written into Robot.melody (see robotOptionsActions.ts's
 * applyClickTrackActive). A straight sixteenth on every step of the measure (startStep 1 to 16, per MELODY_SYSTEM.md's
 * 16-subdivision-per-measure grid), each beat's four on its own noteIndex — 0000 1111 2222 3333 into whatever harmony
 * palette is active — so where a beat starts is heard as a change of note. Every event sits at the given octave except
 * the measure's first, an octave up: the downbeat is heard, and with it where the palette changes
 * (docs/tasks/ONE_MUSIC_CLOCK.md Task 10c).
 */
const BEATS_PER_MEASURE = 4;
const SIXTEENTHS_PER_BEAT = 4;

export function buildClickTrackMelody(octave: number): MelodyEvent[] {
  return Array.from({ length: BEATS_PER_MEASURE * SIXTEENTHS_PER_BEAT }, (_, i) => ({
    id: `click-track-${i}`,
    startStep: i + 1,
    length: '16n' as const,
    noteIndex: Math.floor(i / SIXTEENTHS_PER_BEAT),
    octave: i === 0 ? octave + 1 : octave,
  }));
}
