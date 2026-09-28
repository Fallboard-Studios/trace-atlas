import { describe, it, expect } from 'vitest';

import { computeRobotAudioOverrideDiff, computeCompanyDiff } from './sessionDiff';
import type { Robot } from '../types/Robot';
import type { Company } from '../types/Company';
import type { RobotAudioBaseline } from '../systems/spawnSystem';
import { ROBOT_LFO_TARGET_IDS, type RobotLfoTargetId, type LfoSettings } from '../types/lfo';

function makeLfoSettings(rate = 0): Record<RobotLfoTargetId, LfoSettings> {
  const entries = ROBOT_LFO_TARGET_IDS.map((target) => [target, { shape: 'sine', rate, depth: 10 } satisfies LfoSettings] as const);
  return Object.fromEntries(entries) as Record<RobotLfoTargetId, LfoSettings>;
}

function makeBaseline(overrides: Partial<RobotAudioBaseline> = {}): RobotAudioBaseline {
  return {
    name: 'Iron Drifter',
    audioAttributes: {
      adsr: { attack: 0.2, decay: 0.3, sustain: 0.8, release: 1.5 },
      filterFreq: 900,
      waveform: 'sine',
      layers: [{ type: 'sine', gain: 1, detune: 0, phase: 0 }],
      octaveRange: [3, 5],
    },
    octaveRange: [3, 5],
    rhythmicDensity: 42,
    rhythmicMotifLength: { active: true, value: 6 },
    noteVariance: { active: true, value: 2 },
    pitchRepeat: 65,
    lfoSettings: makeLfoSettings(0),
    ...overrides,
  } as RobotAudioBaseline;
}

/** live Robot fields mirror the baseline exactly by default — a test overrides only the one
 *  field it wants to prove diffs, so an untouched-field assertion stays meaningful. */
function makeLiveRobot(baseline: RobotAudioBaseline, overrides: Partial<Robot> = {}): Robot {
  return {
    id: 'r1',
    name: baseline.name,
    identityColor: '#4f6d7a',
    state: 'idle',
    position: { x: 0, y: 0 },
    destination: null,
    direction: 'right',
    melody: [],
    audioAttributes: baseline.audioAttributes,
    octaveRange: baseline.octaveRange,
    createdAt: Date.now(),
    masterVolume: 0.6,
    docking: 'active',
    batteryLevel: 100,
    rhythmicDensity: baseline.rhythmicDensity,
    rhythmicMotifLength: baseline.rhythmicMotifLength,
    noteVariance: baseline.noteVariance,
    pitchRepeat: baseline.pitchRepeat,
    lfoSettings: baseline.lfoSettings,
    audioMode: 'none',
    ...overrides,
  } as Robot;
}

function makeCompany(overrides: Partial<Company> = {}): Company {
  return { id: 'c1', name: 'Iron Consortium', color: '#4f6d7a', robotIds: ['r1', 'r2'], ...overrides };
}

describe('computeRobotAudioOverrideDiff', () => {
  it('returns {} for a robot whose live values exactly match its seed baseline', () => {
    const baseline = makeBaseline();
    const live = makeLiveRobot(baseline);
    expect(computeRobotAudioOverrideDiff(live, baseline)).toEqual({});
  });

  it('diffs adsr alone when only adsr changed', () => {
    const baseline = makeBaseline();
    const changedAdsr = { attack: 0.9, decay: 0.3, sustain: 0.8, release: 1.5 };
    const live = makeLiveRobot(baseline, { audioAttributes: { ...baseline.audioAttributes, adsr: changedAdsr } });
    expect(computeRobotAudioOverrideDiff(live, baseline)).toEqual({ adsr: changedAdsr });
  });

  it('diffs layers alone when only layers changed', () => {
    const baseline = makeBaseline();
    const changedLayers = [{ type: 'square', gain: 0.5, detune: 3, phase: 90 }] as Robot['audioAttributes']['layers'];
    const live = makeLiveRobot(baseline, { audioAttributes: { ...baseline.audioAttributes, layers: changedLayers } });
    expect(computeRobotAudioOverrideDiff(live, baseline)).toEqual({ layers: changedLayers });
  });

  it('diffs filterFreq alone when only filterFreq changed', () => {
    const baseline = makeBaseline();
    const live = makeLiveRobot(baseline, { audioAttributes: { ...baseline.audioAttributes, filterFreq: 1800 } });
    expect(computeRobotAudioOverrideDiff(live, baseline)).toEqual({ filterFreq: 1800 });
  });

  it('diffs rhythmicDensity alone when only rhythmicDensity changed', () => {
    const baseline = makeBaseline();
    const live = makeLiveRobot(baseline, { rhythmicDensity: 90 });
    expect(computeRobotAudioOverrideDiff(live, baseline)).toEqual({ rhythmicDensity: 90 });
  });

  it('diffs rhythmicMotifLength alone when only rhythmicMotifLength changed', () => {
    const baseline = makeBaseline();
    const changed = { active: false, value: 0 };
    const live = makeLiveRobot(baseline, { rhythmicMotifLength: changed });
    expect(computeRobotAudioOverrideDiff(live, baseline)).toEqual({ rhythmicMotifLength: changed });
  });

  it('diffs noteVariance alone when only noteVariance changed', () => {
    const baseline = makeBaseline();
    const changed = { active: true, value: 7 };
    const live = makeLiveRobot(baseline, { noteVariance: changed });
    expect(computeRobotAudioOverrideDiff(live, baseline)).toEqual({ noteVariance: changed });
  });

  it('diffs pitchRepeat alone when only pitchRepeat changed', () => {
    const baseline = makeBaseline();
    const live = makeLiveRobot(baseline, { pitchRepeat: 10 });
    expect(computeRobotAudioOverrideDiff(live, baseline)).toEqual({ pitchRepeat: 10 });
  });

  it('diffs octaveRange alone when only octaveRange changed', () => {
    const baseline = makeBaseline();
    const live = makeLiveRobot(baseline, { octaveRange: [1, 3] });
    expect(computeRobotAudioOverrideDiff(live, baseline)).toEqual({ octaveRange: [1, 3] });
  });

  it('diffs only the one lfoSettings target that changed, not the whole record', () => {
    const baseline = makeBaseline();
    const changedTarget = ROBOT_LFO_TARGET_IDS[0];
    const changedSettings: LfoSettings = { shape: 'square', rate: 2, depth: 50 };
    const live = makeLiveRobot(baseline, {
      lfoSettings: { ...baseline.lfoSettings, [changedTarget]: changedSettings },
    });
    expect(computeRobotAudioOverrideDiff(live, baseline)).toEqual({ lfoSettings: { [changedTarget]: changedSettings } });
  });

  it('diffs name alone when the robot was renamed', () => {
    const baseline = makeBaseline();
    const live = makeLiveRobot(baseline, { name: 'Custom Name' });
    expect(computeRobotAudioOverrideDiff(live, baseline)).toEqual({ name: 'Custom Name' });
  });

  it('never includes audioMode, masterVolume, job assignment, docking, or battery level in the diff', () => {
    const baseline = makeBaseline();
    const live = makeLiveRobot(baseline, {
      audioMode: 'solo',
      masterVolume: 0.99,
      docking: 'docked',
      batteryLevel: 12,
      job: { type: 'acousticSurvey', assignedAtMeasure: 4 },
    });
    const diff = computeRobotAudioOverrideDiff(live, baseline);
    expect(diff).not.toHaveProperty('audioMode');
    expect(diff).not.toHaveProperty('masterVolume');
    expect(diff).not.toHaveProperty('docking');
    expect(diff).not.toHaveProperty('batteryLevel');
    expect(diff).not.toHaveProperty('job');
  });
});

describe('computeCompanyDiff', () => {
  it('returns {} for a company whose name and membership exactly match its spawn defaults', () => {
    const company = makeCompany();
    expect(computeCompanyDiff(company, { name: company.name, robotIds: company.robotIds })).toEqual({});
  });

  it('diffs name alone when only the name changed', () => {
    const company = makeCompany({ name: 'Renamed Guild' });
    expect(computeCompanyDiff(company, { name: 'Iron Consortium', robotIds: company.robotIds })).toEqual({ name: 'Renamed Guild' });
  });

  it('diffs robotIds alone when only membership changed', () => {
    const company = makeCompany({ robotIds: ['r1', 'r3'] });
    expect(computeCompanyDiff(company, { name: company.name, robotIds: ['r1', 'r2'] })).toEqual({ robotIds: ['r1', 'r3'] });
  });
});
