/**
 * Default LFO settings per target, resolving docs/tasks/LFO_INTEGRATION_PLAN.md
 * Task 8. Follows the src/types/globalAudio.ts DEFAULT_* const pattern —
 * every target gets a typed default, no magic numbers.
 */

import {
  ROBOT_LFO_TARGET_IDS,
  GLOBAL_LFO_TARGET_IDS,
  LFO_RATE_MIN,
  LFO_DEPTH_MIN,
  type RobotLfoTargetId,
  type GlobalLfoTargetId,
  type LfoSettings,
} from '../types/lfo';

/**
 * Inert by default — both rate and depth pinned to their own MIN constants
 * (LFO_RATE_MIN/LFO_DEPTH_MIN, both 0) rather than an arbitrary "typical"
 * value, tracing to Task 7's exported constants, not invented here. Rate 0
 * doubles as the "off" state (replacing the removed OSCILLATION STATE
 * toggle — see lfoEngine.ts's connect/disconnect callers), so an
 * unconfigured LFO is doubly inert: not connected, and would add nothing
 * even if it were. 'sine' is the conventional default LFO waveform (smooth,
 * no discontinuities at zero depth) — not a bounds concern, just the shape pick.
 */
function makeDefaultLfoSettings(): LfoSettings {
  return { shape: 'sine', rate: LFO_RATE_MIN, depth: LFO_DEPTH_MIN };
}

/**
 * One entry per target — 6 robot + 7 global = 13 (robot was 13 until the
 * volume/pulseWidth targets were removed, docs/specs/LFO_LOAD_FIX.md, then 9 until the phase
 * targets were cut, docs/specs/LFO_BANK.md Task 1; V2: global was 9 until Chorus, and its
 * 'chorus.delayTime' LFO target, was removed). Each target gets its own settings object (not a
 * shared reference), since lfoEngine.ts's setters (Task 11) will mutate these in place.
 */
export const DEFAULT_LFO_SETTINGS: Record<RobotLfoTargetId | GlobalLfoTargetId, LfoSettings> = Object.fromEntries(
  [...ROBOT_LFO_TARGET_IDS, ...GLOBAL_LFO_TARGET_IDS].map((id) => [id, makeDefaultLfoSettings()])
) as Record<RobotLfoTargetId | GlobalLfoTargetId, LfoSettings>;
