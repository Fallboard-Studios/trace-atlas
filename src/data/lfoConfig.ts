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
  type LfoLaneId,
} from '../types/lfo';
import { CONTENT, fill } from '@/content';
import type { Shell } from '@/components/panels/screen/useShell';

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

// ========================================
// LANE TITLES (docs/specs/LAYOUT_REWORK.md §1.4)
// ========================================

/** Each lane's content entry. fleet.lfoBank.laneA-D restate ui.lfoLane's own a-d names verbatim (kept in
 *  sync by hand, not by reference — see fleet.ts's own comment on these keys). */
export const LFO_BANK_LANE_CONTENT = {
  a: 'fleet.lfoBank.laneA',
  b: 'fleet.lfoBank.laneB',
  c: 'fleet.lfoBank.laneC',
  d: 'fleet.lfoBank.laneD',
} as const satisfies Record<LfoLaneId, keyof typeof CONTENT>;

/** A lane's title: "Core LFO (LFO A)" wherever the desk shell has room, "LFO A" on the phone. */
export function laneTitle(lane: LfoLaneId, shell: Shell): string {
  const { human, short } = CONTENT[LFO_BANK_LANE_CONTENT[lane]];
  return shell === 'phone' ? short : fill('fleet.lfoBank.laneTitle', { lane: human, short });
}
