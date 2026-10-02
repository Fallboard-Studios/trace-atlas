/**
 * Default LFO Bank link/lane values, resolving docs/specs/LFO_BANK.md §1.1. Follows the
 * src/types/globalAudio.ts DEFAULT_* const pattern — every target/lane gets a typed default,
 * no magic numbers.
 */

import {
  ROBOT_LFO_TARGET_IDS,
  GLOBAL_LFO_TARGET_IDS,
  LFO_RATE_MIN,
  LFO_DEPTH_MIN,
  type RobotLfoTargetId,
  type GlobalLfoTargetId,
  type LfoLink,
  type BankLfoSettings,
} from '../types/lfo';

// ========================================
// LFO BANK (docs/specs/LFO_BANK.md §1.1)
// ========================================

/** Unlinked by default: no lane, no depth. One entry per target (robot + global), each its own
 *  object — lfoEngine.ts's linkTarget will read these but never mutate the engine's own copy
 *  in place. */
function makeDefaultLfoLink(): LfoLink {
  return { lane: null, depth: LFO_DEPTH_MIN };
}

export const DEFAULT_LFO_LINK: Record<RobotLfoTargetId | GlobalLfoTargetId, LfoLink> = Object.fromEntries(
  [...ROBOT_LFO_TARGET_IDS, ...GLOBAL_LFO_TARGET_IDS].map((id) => [id, makeDefaultLfoLink()])
) as Record<RobotLfoTargetId | GlobalLfoTargetId, LfoLink>;

/** A bank lane with no motion: rate 0 (the lane holds still) and no drift — the seed
 *  never emits these values, but an unconfigured lane should start inert. */
export const DEFAULT_BANK_LFO: BankLfoSettings = { shape: 'sine', rate: LFO_RATE_MIN, rateDrift: 0, depthDrift: 0 };
