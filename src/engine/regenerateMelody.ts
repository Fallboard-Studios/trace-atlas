// ========================================
// IMPORTS
// ========================================
import { generateMelodyForRobot, buildSeededComposition, DEFAULT_RHYTHMIC_DENSITY, DEFAULT_RHYTHMIC_MOTIF_LENGTH, DEFAULT_NOTE_VARIANCE, DEFAULT_PITCH_REPEAT } from './melodyGenerator';
import { AudioEngine } from './AudioEngine';
import { useLocaleStore } from '../stores/localeStore';
import type { Robot } from '../types/Robot';

// ========================================
// EXPORTS
// ========================================

/**
 * Regenerate a robot's melody using its current rhythmic attributes and octave range,
 * then write the new melody to the locale store and register it with AudioEngine.
 *
 * Uses the new GenerateMelodyForRobotOptions path (motif-density algorithm) when
 * `robot.rhythmicDensity` and `robot.rhythmicMotifLength` are present; falls back
 * to sensible defaults when they are absent.
 *
 * Safe to call from UI event handlers — Zustand is synchronous, and
 * `AudioEngine.registerRobotMelody` is safe to call off the Transport tick.
 * Do NOT wrap in queueMicrotask/setTimeout.
 *
 * @param robot    The robot whose melody should be regenerated.
 * @param localeId The active locale ID (pass `getActiveLocaleId()` from the call site).
 */
export function regenerateMelody(robot: Robot, localeId: string): void {
  const [octMin, octMax] = robot.octaveRange;
  const rhythmicDensity = robot.rhythmicDensity ?? DEFAULT_RHYTHMIC_DENSITY;
  const rhythmicMotifLength = robot.rhythmicMotifLength ?? DEFAULT_RHYTHMIC_MOTIF_LENGTH;
  const noteVariance = robot.noteVariance ?? DEFAULT_NOTE_VARIANCE;
  const pitchRepeat = robot.pitchRepeat ?? DEFAULT_PITCH_REPEAT;

  // Deterministic Robot Melody Generation (Roadmap Phase 31) -- the same formula
  // spawnSystem.ts uses for a robot's initial melody, so an edit reverted to its original
  // value reproduces the exact melody it had before (no "first-edit ratchet").
  const rand = buildSeededComposition(robot.compositionSeed, {
    rhythmicDensity,
    rhythmicMotifLength,
    noteVariance,
    pitchRepeat,
    octaveRange: robot.octaveRange,
  });

  const newMelody = generateMelodyForRobot({
    octaveMin: octMin,
    octaveMax: octMax,
    rhythmicDensity,
    rhythmicMotifLength,
    noteVariance,
    pitchRepeat,
    rand,
  });

  useLocaleStore.getState().updateRobot(localeId, robot.id, { melody: newMelody });
  AudioEngine.registerRobotMelody(robot.id, newMelody);
}
