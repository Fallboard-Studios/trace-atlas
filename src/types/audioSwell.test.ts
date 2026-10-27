// ========================================
// IMPORTS
// ========================================
import { describe, it, expect } from 'vitest';

import { GLOBAL_LFO_TARGET_IDS, ROBOT_LFO_TARGET_IDS } from './lfo';
import {
  SWELL_GLOBAL_TARGET_IDS,
  SWELL_ROBOT_ATTRIBUTE_IDS,
  type SwellPool,
  type SwellPhase,
  type SwellMember,
  type ActiveSwell,
} from './audioSwell';

// ========================================
// TESTS
// ========================================

describe('SWELL_GLOBAL_TARGET_IDS', () => {
  // The global wet sliders became fixed full returns (docs/specs/ROBOT_SENDS.md assumption 13), so their swells
  // moved to the robots' own sends: the global pool is exactly the 7 LFO targets again.
  it('is exactly the GLOBAL_LFO_TARGET_IDS entries', () => {
    expect([...SWELL_GLOBAL_TARGET_IDS].sort()).toEqual([...GLOBAL_LFO_TARGET_IDS].sort());
  });

  it('has exactly 7 members, no duplicates', () => {
    expect(SWELL_GLOBAL_TARGET_IDS).toHaveLength(7);
    expect(new Set(SWELL_GLOBAL_TARGET_IDS).size).toBe(7);
  });

  it('no longer lists the global delay or reverb wet', () => {
    expect(SWELL_GLOBAL_TARGET_IDS).not.toContain('delay.wet');
    expect(SWELL_GLOBAL_TARGET_IDS).not.toContain('reverb.wet');
  });

  it('does not modify GLOBAL_LFO_TARGET_IDS itself — still 7 members', () => {
    expect(GLOBAL_LFO_TARGET_IDS).toHaveLength(7);
  });
});

describe('SWELL_ROBOT_ATTRIBUTE_IDS', () => {
  // Its own explicit list (docs/specs/LFO_LOAD_FIX.md assumption 9): the LFO target set has no volume, but
  // swells ramp it. Every layer LFO target is a swell attribute. A layer's phase and pulse width are not
  // (docs/specs/SWELL_PHASE_PULSE_WIDTH_CUT.md section 3, which also fixes this order).
  it('is volume + every layer gain/detune (x 3) + the 4 adsr.* fields + the five sends, in that order', () => {
    expect(SWELL_ROBOT_ATTRIBUTE_IDS).toEqual([
      'volume',
      'layer0.gain', 'layer0.detune',
      'layer1.gain', 'layer1.detune',
      'layer2.gain', 'layer2.detune',
      'adsr.attack', 'adsr.decay', 'adsr.sustain', 'adsr.release',
      'reverbSend', 'delaySend', 'gritSend', 'shimmerSend', 'doubleSend',
    ]);
  });

  it('lists the five sends after every other attribute', () => {
    expect(SWELL_ROBOT_ATTRIBUTE_IDS.slice(-5)).toEqual(['reverbSend', 'delaySend', 'gritSend', 'shimmerSend', 'doubleSend']);
    expect(SWELL_ROBOT_ATTRIBUTE_IDS[0]).toBe('volume');
    expect(SWELL_ROBOT_ATTRIBUTE_IDS[10]).toBe('adsr.release');
  });

  // bus.frequency (docs/specs/ROBOT_ARTICULATION.md assumption 10) is an LFO target with no swell apply
  // path, so the invariant narrows to the six layer ids: every layer id that was a swellable LFO target still is.
  it('still contains every layer-scoped ROBOT_LFO_TARGET_IDS entry — a strict superset of the six layer LFO targets', () => {
    const layerTargets = ROBOT_LFO_TARGET_IDS.filter((id) => id.startsWith('layer'));
    expect(layerTargets).toHaveLength(6);
    for (const id of layerTargets) expect(SWELL_ROBOT_ATTRIBUTE_IDS).toContain(id);
  });

  it('does not contain bus.frequency — the one LFO target that is not a swell attribute', () => {
    expect(SWELL_ROBOT_ATTRIBUTE_IDS as readonly string[]).not.toContain('bus.frequency');
  });

  it('has exactly 16 members, no duplicates', () => {
    expect(SWELL_ROBOT_ATTRIBUTE_IDS).toHaveLength(16);
    expect(new Set(SWELL_ROBOT_ATTRIBUTE_IDS).size).toBe(16);
  });

  it('never includes a Robot Ping Control field', () => {
    expect(SWELL_ROBOT_ATTRIBUTE_IDS).not.toContain('rhythmicDensity');
    expect(SWELL_ROBOT_ATTRIBUTE_IDS).not.toContain('rhythmicMotifLength');
    expect(SWELL_ROBOT_ATTRIBUTE_IDS).not.toContain('noteVariance');
    expect(SWELL_ROBOT_ATTRIBUTE_IDS).not.toContain('octaveRange');
  });

  it('does not modify ROBOT_LFO_TARGET_IDS itself — still its own 7 members, bus.frequency being the non-swell target (volume stays a swell attribute though it is no LFO target, and pulseWidth is neither)', () => {
    expect(ROBOT_LFO_TARGET_IDS).toHaveLength(7);
    expect(SWELL_ROBOT_ATTRIBUTE_IDS).toContain('volume');
    expect(SWELL_ROBOT_ATTRIBUTE_IDS as readonly string[]).not.toContain('layer0.pulseWidth');
  });
});

describe('SwellPhase', () => {
  it('accepts both documented phase values (compile-time check via build:types)', () => {
    const rising: SwellPhase = 'rising';
    const falling: SwellPhase = 'falling';
    expect([rising, falling]).toEqual(['rising', 'falling']);
  });
});

describe('SwellPool', () => {
  it('accepts both documented pool values (compile-time check via build:types)', () => {
    const global: SwellPool = 'global';
    const robot: SwellPool = 'robot';
    expect([global, robot]).toEqual(['global', 'robot']);
  });
});

describe('ActiveSwell', () => {
  it('type-checks a global-pool swell (single target, no members)', () => {
    const swell: ActiveSwell = {
      pool: 'global',
      globalTarget: 'lpf.Q',
      baseValue: 0.3,
      peakDelta: 0.5,
      phase: 'rising',
      startMeasure: 12,
      risingMeasures: 8,
      fallingMeasures: 6,
    };
    expect(swell.pool).toBe('global');
    expect(swell.members).toBeUndefined();
  });

  it('type-checks a single-robot swell (exactly one SwellMember)', () => {
    const member: SwellMember = { robotId: 'robot-1', baseValue: 0.4, peakDelta: 0.2 };
    const swell: ActiveSwell = {
      pool: 'robot',
      robotAttribute: 'volume',
      members: [member],
      phase: 'falling',
      startMeasure: 40,
      risingMeasures: 4,
      fallingMeasures: 5,
    };
    expect(swell.members).toHaveLength(1);
  });

  it('type-checks a company-wide swell (2+ SwellMembers, no additional type needed)', () => {
    const members: SwellMember[] = [
      { robotId: 'robot-1', baseValue: 0.4, peakDelta: 0.2 },
      { robotId: 'robot-2', baseValue: 0.6, peakDelta: -0.1 },
      { robotId: 'robot-3', baseValue: 0.1, peakDelta: 0.35 },
    ];
    const swell: ActiveSwell = {
      pool: 'robot',
      robotAttribute: 'layer0.gain',
      members,
      companyId: 'company-1',
      phase: 'rising',
      startMeasure: 100,
      risingMeasures: 3,
      fallingMeasures: 3,
    };
    expect(swell.members).toHaveLength(3);
    expect(swell.companyId).toBe('company-1');
  });
});
