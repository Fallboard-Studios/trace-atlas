// ========================================
// IMPORTS
// ========================================
import {
  generateMelodyForRobot,
  buildSeededComposition,
  buildSeededRhythm,
  buildSeededPerformance,
  applyPerformanceMarks,
  DEFAULT_RHYTHMIC_DENSITY,
  DEFAULT_RHYTHMIC_MOTIF_LENGTH,
  DEFAULT_NOTE_VARIANCE,
  DEFAULT_PITCH_REPEAT,
  DEFAULT_RESTS,
  DEFAULT_ACCENTS,
} from './melodyGenerator';
import { AudioEngine } from './AudioEngine';
import { useLocaleStore } from '../stores/localeStore';
import type { MelodyEvent, Robot } from '../types/Robot';

// ========================================
// EXPORTS
// ========================================

/** What composeRobotMelody reads from a robot; absent composition fields read as their defaults. */
export type RobotMelodyInputs = Pick<Robot, 'compositionSeed' | 'octaveRange'> &
  Partial<Pick<Robot, 'rhythmicDensity' | 'rhythmicMotifLength' | 'noteVariance' | 'pitchRepeat' | 'rests' | 'accents'>>;

/**
 * The world a melody's rhythm belongs to (Company Families, docs/specs/NO_SILENCE_AND_COMPANY_FAMILIES.md
 * §1.11, B19): the locale's coordinates, `${x}:${y}`, the same input its noise map hashes, so a
 * world reloaded from a save or a link plays the rhythms it had, whatever its locale id. The locale
 * id stands in when the store has no such locale (a unit test's mocked store, a spawn into a locale
 * that is not there). Spawn and regenerate both ask here, so they always agree.
 */
export function melodyWorldKey(localeId: string): string {
  const coordinates = useLocaleStore.getState().getLocaleById(localeId)?.coordinates;
  return coordinates ? `${coordinates.x}:${coordinates.y}` : localeId;
}

/**
 * A robot's melody from its stored fields and its world: the one recipe spawnSystem.ts's
 * spawnRobot and regenerateMelody below both use (Deterministic Robot Melody Generation, Roadmap
 * Phase 31), so an edit reverted to its spawn value reproduces the spawn melody exactly, stamps
 * included (no "first-edit ratchet"). Pure: no store, no engine.
 *
 * Company Families (docs/specs/NO_SILENCE_AND_COMPANY_FAMILIES.md §1.11, B16–B19): the onsets and
 * lengths draw from the rhythm stream on the world key and the rhythm shape, nothing of the
 * robot's own, so in one world every robot whose density and motif make one shape plays one
 * rhythm (a family member, which inherits its founder's settings, or any robot set to match), and
 * a Note Variance, Pitch Repeat or octave edit leaves the rhythm where it was (B7). The pitch-lock
 * plan, octaves and notes draw from the robot's own composition stream. The Rests / Accents
 * post-pass (docs/specs/ROBOT_PERFORMANCE.md §1.2) draws from the performance stream on the same
 * world key and shape, so robots sharing a rhythm and the same slider values rest and accent
 * together.
 */
export function composeRobotMelody(robot: RobotMelodyInputs, worldKey: string): MelodyEvent[] {
  const rhythmicDensity = robot.rhythmicDensity ?? DEFAULT_RHYTHMIC_DENSITY;
  const rhythmicMotifLength = robot.rhythmicMotifLength ?? DEFAULT_RHYTHMIC_MOTIF_LENGTH;
  const noteVariance = robot.noteVariance ?? DEFAULT_NOTE_VARIANCE;
  const pitchRepeat = robot.pitchRepeat ?? DEFAULT_PITCH_REPEAT;
  const rhythm = { rhythmicDensity, rhythmicMotifLength };

  const melody = generateMelodyForRobot({
    octaveMin: robot.octaveRange[0],
    octaveMax: robot.octaveRange[1],
    rhythmicDensity,
    rhythmicMotifLength,
    noteVariance,
    pitchRepeat,
    rand: buildSeededComposition(robot.compositionSeed, {
      rhythmicDensity,
      rhythmicMotifLength,
      noteVariance,
      pitchRepeat,
      octaveRange: robot.octaveRange,
    }),
    rhythmRand: buildSeededRhythm(worldKey, rhythm),
  });

  return applyPerformanceMarks(
    melody,
    { rests: robot.rests ?? DEFAULT_RESTS, accents: robot.accents ?? DEFAULT_ACCENTS },
    buildSeededPerformance(worldKey, rhythm),
  );
}

/**
 * Regenerate a robot's melody using its current rhythmic attributes and octave range,
 * then write the new melody to the locale store and register it with AudioEngine.
 *
 * Builds it with composeRobotMelody, the recipe spawn uses, in the world melodyWorldKey finds for
 * `localeId`; absent composition fields fall back to sensible defaults.
 *
 * Safe to call from UI event handlers — Zustand is synchronous, and
 * `AudioEngine.registerRobotMelody` is safe to call off the Transport tick.
 * Do NOT wrap in queueMicrotask/setTimeout.
 *
 * @param robot    The robot whose melody should be regenerated.
 * @param localeId The active locale ID (pass `getActiveLocaleId()` from the call site).
 */
export function regenerateMelody(robot: Robot, localeId: string): void {
  const newMelody = composeRobotMelody(robot, melodyWorldKey(localeId));

  useLocaleStore.getState().updateRobot(localeId, robot.id, { melody: newMelody });
  // The engine gets the robot as stored, read back from its own locale: a rebuild regenerates (the deal's Melody push)
  // before that locale is current, where the engine's own lookup would find nothing, and the stored robot is fresh
  // where `robot` may be a caller's stale copy with one field spread in (docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R5).
  const stored = useLocaleStore.getState().getLocaleById(localeId)?.robots.find((r) => r.id === robot.id);
  AudioEngine.registerRobotMelody(robot.id, newMelody, stored ?? robot);
}
