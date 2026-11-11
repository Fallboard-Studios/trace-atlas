// ========================================
// IMPORTS
// ========================================
import alea from 'alea';
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
export type RobotMelodyInputs = Pick<Robot, 'compositionSeed' | 'lineage' | 'octaveRange'> &
  Partial<Pick<Robot, 'rhythmicDensity' | 'rhythmicMotifLength' | 'noteVariance' | 'pitchRepeat' | 'rests' | 'accents'>>;

/**
 * A robot's melody from its stored fields: the one recipe spawnSystem.ts's spawnRobot and
 * regenerateMelody below both use (Deterministic Robot Melody Generation, Roadmap Phase 31), so an
 * edit reverted to its spawn value reproduces the spawn melody exactly, stamps included (no
 * "first-edit ratchet"), for an original and a family member alike. Pure: no store, no engine.
 *
 * Company Families (docs/specs/NO_SILENCE_AND_COMPANY_FAMILIES.md §1.11): the onsets and lengths
 * draw from the rhythm stream on the rhythm seed (`lineage.rhythmSeed`, else the robot's own
 * composition seed), so a Note Variance, Pitch Repeat or octave edit leaves them where they were
 * (B7); the pitch-lock plan, octaves and notes from the composition stream; a member's
 * `lineage.movedOnsets` from a move stream on its own composition seed, so the move is its own; and
 * the Rests / Accents post-pass (docs/specs/ROBOT_PERFORMANCE.md §1.2) from the performance stream
 * on the rhythm seed, so a section rests and accents together (B12). An original's rhythm seed is
 * its composition seed, so its stamps draw from the stream they always did.
 */
export function composeRobotMelody(robot: RobotMelodyInputs): MelodyEvent[] {
  const rhythmicDensity = robot.rhythmicDensity ?? DEFAULT_RHYTHMIC_DENSITY;
  const rhythmicMotifLength = robot.rhythmicMotifLength ?? DEFAULT_RHYTHMIC_MOTIF_LENGTH;
  const noteVariance = robot.noteVariance ?? DEFAULT_NOTE_VARIANCE;
  const pitchRepeat = robot.pitchRepeat ?? DEFAULT_PITCH_REPEAT;
  const rhythmSeed = robot.lineage?.rhythmSeed ?? robot.compositionSeed;
  const movedOnsets = robot.lineage?.movedOnsets ?? 0;

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
    rhythmRand: buildSeededRhythm(rhythmSeed, { rhythmicDensity, rhythmicMotifLength }),
    ...(movedOnsets > 0 ? { onsetMoves: { count: movedOnsets, rand: alea(`${robot.compositionSeed}:onsetMoves`) } } : {}),
  });

  return applyPerformanceMarks(
    melody,
    { rests: robot.rests ?? DEFAULT_RESTS, accents: robot.accents ?? DEFAULT_ACCENTS },
    buildSeededPerformance(rhythmSeed),
  );
}

/**
 * Regenerate a robot's melody using its current rhythmic attributes and octave range,
 * then write the new melody to the locale store and register it with AudioEngine.
 *
 * Builds it with composeRobotMelody, the recipe spawn uses; absent composition fields fall back
 * to sensible defaults.
 *
 * Safe to call from UI event handlers — Zustand is synchronous, and
 * `AudioEngine.registerRobotMelody` is safe to call off the Transport tick.
 * Do NOT wrap in queueMicrotask/setTimeout.
 *
 * @param robot    The robot whose melody should be regenerated.
 * @param localeId The active locale ID (pass `getActiveLocaleId()` from the call site).
 */
export function regenerateMelody(robot: Robot, localeId: string): void {
  const newMelody = composeRobotMelody(robot);

  useLocaleStore.getState().updateRobot(localeId, robot.id, { melody: newMelody });
  // The engine gets the robot as stored, read back from its own locale: a rebuild regenerates (the deal's Melody push)
  // before that locale is current, where the engine's own lookup would find nothing, and the stored robot is fresh
  // where `robot` may be a caller's stale copy with one field spread in (docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R5).
  const stored = useLocaleStore.getState().getLocaleById(localeId)?.robots.find((r) => r.id === robot.id);
  AudioEngine.registerRobotMelody(robot.id, newMelody, stored ?? robot);
}
