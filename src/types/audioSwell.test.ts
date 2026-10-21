// ========================================
// IMPORTS
// ========================================
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
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
  // Its own explicit list since 2026-09-30 (docs/specs/LFO_LOAD_FIX.md assumption 9): the LFO
  // target set dropped volume/pulseWidth, but swells keep ramping both. Every remaining LFO
  // target is still a swell attribute; the swell set is a strict superset.
  it('is volume + every layer field (gain/detune/phase/pulseWidth × 3) + the 4 adsr.* fields + the five sends', () => {
    expect([...SWELL_ROBOT_ATTRIBUTE_IDS].sort()).toEqual(
      [
        'volume',
        'layer0.gain', 'layer0.detune', 'layer0.phase', 'layer0.pulseWidth',
        'layer1.gain', 'layer1.detune', 'layer1.phase', 'layer1.pulseWidth',
        'layer2.gain', 'layer2.detune', 'layer2.phase', 'layer2.pulseWidth',
        'adsr.attack', 'adsr.decay', 'adsr.sustain', 'adsr.release',
        'reverbSend', 'delaySend', 'gritSend', 'shimmerSend', 'doubleSend',
      ].sort()
    );
  });

  it('lists the five sends after every pre-existing attribute, so no earlier index-based pick shifts', () => {
    expect(SWELL_ROBOT_ATTRIBUTE_IDS.slice(-5)).toEqual(['reverbSend', 'delaySend', 'gritSend', 'shimmerSend', 'doubleSend']);
    expect(SWELL_ROBOT_ATTRIBUTE_IDS[0]).toBe('volume');
    expect(SWELL_ROBOT_ATTRIBUTE_IDS[16]).toBe('adsr.release');
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

  it('has exactly 22 members, no duplicates', () => {
    expect(SWELL_ROBOT_ATTRIBUTE_IDS).toHaveLength(22);
    expect(new Set(SWELL_ROBOT_ATTRIBUTE_IDS).size).toBe(22);
  });

  it('includes layer0/1/2.phase — a real divergence from LFO/Drift, not an oversight (spec §1.3)', () => {
    expect(SWELL_ROBOT_ATTRIBUTE_IDS).toContain('layer0.phase');
    expect(SWELL_ROBOT_ATTRIBUTE_IDS).toContain('layer1.phase');
    expect(SWELL_ROBOT_ATTRIBUTE_IDS).toContain('layer2.phase');
  });

  it('never includes a Robot Ping Control field', () => {
    expect(SWELL_ROBOT_ATTRIBUTE_IDS).not.toContain('rhythmicDensity');
    expect(SWELL_ROBOT_ATTRIBUTE_IDS).not.toContain('rhythmicMotifLength');
    expect(SWELL_ROBOT_ATTRIBUTE_IDS).not.toContain('noteVariance');
    expect(SWELL_ROBOT_ATTRIBUTE_IDS).not.toContain('octaveRange');
  });

  it('does not modify ROBOT_LFO_TARGET_IDS itself — still its own 7 members, bus.frequency being the non-swell target (volume/pulseWidth/phase stay swell attributes even though they are no longer LFO targets)', () => {
    expect(ROBOT_LFO_TARGET_IDS).toHaveLength(7);
    expect(SWELL_ROBOT_ATTRIBUTE_IDS).toContain('volume');
    expect(SWELL_ROBOT_ATTRIBUTE_IDS).toContain('layer0.pulseWidth');
  });
});

describe('SwellPhase', () => {
  it("is declared as exactly 'rising' | 'falling' — no third 'holding' member (source-scan regression guard, per spec §1.5)", () => {
    const thisFile = fileURLToPath(import.meta.url);
    const source = readFileSync(join(dirname(thisFile), 'audioSwell.ts'), 'utf-8');
    const declaration = source.match(/export type SwellPhase =[^;]+;/);
    expect(declaration).not.toBeNull();
    expect(declaration![0]).toBe("export type SwellPhase = 'rising' | 'falling';");
  });

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
