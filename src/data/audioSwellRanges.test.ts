// ========================================
// IMPORTS
// ========================================
import { describe, it, expect } from 'vitest';

import { ROBOT_SWELL_FIELD_RANGE } from './audioSwellRanges';
import { GLOBAL_AUDIO_SEED_RANGES } from './globalAudioSeedRanges';
import { SWELL_ROBOT_ATTRIBUTE_IDS } from '@/types/audioSwell';
import { SEND_MIN, SEND_MAX } from '@/constants';

// ========================================
// TESTS
// ========================================

describe('ROBOT_SWELL_FIELD_RANGE', () => {
  it('has an entry for every SwellRobotAttributeId, and no extras', () => {
    expect(Object.keys(ROBOT_SWELL_FIELD_RANGE).sort()).toEqual([...SWELL_ROBOT_ATTRIBUTE_IDS].sort());
  });

  it('has exactly 16 keys', () => {
    expect(Object.keys(ROBOT_SWELL_FIELD_RANGE)).toHaveLength(16);
  });

  it('gives each send the stored 0..1 range (SEND_MIN..SEND_MAX), not the 0-100 display range', () => {
    expect(ROBOT_SWELL_FIELD_RANGE.reverbSend).toEqual({ min: SEND_MIN, max: SEND_MAX });
    expect(ROBOT_SWELL_FIELD_RANGE.delaySend).toEqual({ min: SEND_MIN, max: SEND_MAX });
    expect(ROBOT_SWELL_FIELD_RANGE.gritSend).toEqual({ min: SEND_MIN, max: SEND_MAX });
    expect(ROBOT_SWELL_FIELD_RANGE.shimmerSend).toEqual({ min: SEND_MIN, max: SEND_MAX });
    expect(ROBOT_SWELL_FIELD_RANGE.doubleSend).toEqual({ min: SEND_MIN, max: SEND_MAX });
    expect(ROBOT_SWELL_FIELD_RANGE.reverbSend.max).toBe(1);
    expect(ROBOT_SWELL_FIELD_RANGE.gritSend.min).toBe(0);
  });

  it('never has min >= max for any field', () => {
    for (const attribute of SWELL_ROBOT_ATTRIBUTE_IDS) {
      const { min, max } = ROBOT_SWELL_FIELD_RANGE[attribute];
      expect(min, `${attribute}: min should be < max`).toBeLessThan(max);
    }
  });

  it('shares zero keys with GLOBAL_AUDIO_SEED_RANGES — a separate, global-chain-only table', () => {
    const globalKeys = new Set(Object.keys(GLOBAL_AUDIO_SEED_RANGES));
    const overlap = Object.keys(ROBOT_SWELL_FIELD_RANGE).filter((key) => globalKeys.has(key));
    expect(overlap).toEqual([]);
  });

  it("volume's range is {0, 1} — the store's real masterVolume fraction, NOT lfoEngine.ts's engine-internal ROBOT_LFO_FIELD_RANGE.volume ({0, 2})", () => {
    // Regression guard for spec §4.1: reusing the LFO table directly would silently
    // bound a Volume swell against the wrong domain (a fixed Tone.Gain(1) node's own
    // operating range, not the 0-1 fraction Robot.masterVolume/applyVolume actually store).
    expect(ROBOT_SWELL_FIELD_RANGE.volume).toEqual({ min: 0, max: 1 });
    expect(ROBOT_SWELL_FIELD_RANGE.volume).not.toEqual({ min: 0, max: 2 });
  });

  it("matches each layer field's real schema range (robotOptionsConfig.ts / SignatureArrayDrawer sliders)", () => {
    for (const layer of ['layer0', 'layer1', 'layer2'] as const) {
      expect(ROBOT_SWELL_FIELD_RANGE[`${layer}.gain`]).toEqual({ min: 0, max: 2 });
      expect(ROBOT_SWELL_FIELD_RANGE[`${layer}.detune`]).toEqual({ min: -50, max: 50 });
    }
  });

  it('matches each ADSR field\'s real schema range (robotOptionsConfig.ts\'s Attack/Decay/Sustain/Release)', () => {
    expect(ROBOT_SWELL_FIELD_RANGE['adsr.attack']).toEqual({ min: 0, max: 10 });
    expect(ROBOT_SWELL_FIELD_RANGE['adsr.decay']).toEqual({ min: 0, max: 10 });
    expect(ROBOT_SWELL_FIELD_RANGE['adsr.sustain']).toEqual({ min: 0, max: 1 });
    expect(ROBOT_SWELL_FIELD_RANGE['adsr.release']).toEqual({ min: 0, max: 10 });
  });
});
