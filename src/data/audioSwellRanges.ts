import { recordByField } from './robotSends';
import { SEND_MIN, SEND_MAX } from '@/constants';
import type { SwellRobotAttributeId } from '@/types/audioSwell';

/**
 * UI/store-facing swing bounds for every robot swell attribute — matches each
 * field's real schema range in robotOptionsConfig.ts exactly (NOT
 * lfoEngine.ts's ROBOT_LFO_FIELD_RANGE, which is a different, engine-internal
 * range for the same-named fields: e.g. 'volume' there is 0-2, the fixed
 * Tone.Gain(1) mix-stage node's own operating range; here it's 0-1, the
 * actual masterVolume fraction Robot.masterVolume/updateRobot store (the UI
 * slider itself displays 0-100%, and applyVolume's own `pct` parameter takes
 * that display value — converting between this table's 0-1 domain and
 * applyVolume's pct/100 convention is the caller's job, not this table's).
 * Global targets reuse GLOBAL_AUDIO_SEED_RANGES directly — this table shares
 * zero keys with it (docs/specs/archive/AUDIO_SWELLS.md §2, §4).
 */
export const ROBOT_SWELL_FIELD_RANGE: Record<SwellRobotAttributeId, { min: number; max: number }> = {
  volume: { min: 0, max: 1 },
  'layer0.gain': { min: 0, max: 2 }, 'layer1.gain': { min: 0, max: 2 }, 'layer2.gain': { min: 0, max: 2 },
  'layer0.detune': { min: -50, max: 50 }, 'layer1.detune': { min: -50, max: 50 }, 'layer2.detune': { min: -50, max: 50 },
  'adsr.attack': { min: 0, max: 10 }, 'adsr.decay': { min: 0, max: 10 },
  'adsr.sustain': { min: 0, max: 1 }, 'adsr.release': { min: 0, max: 10 },
  // The five sends' stored 0..1 fractions, not the sliders' 0-100 % display (docs/specs/ROBOT_SEND_TABLE.md §1.5).
  ...recordByField(() => ({ min: SEND_MIN, max: SEND_MAX })),
};
