import { describe, it, expect, vi, afterEach } from 'vitest';

// Same mock worldTransition.test.ts itself uses: applySessionPayload calls retransmitWorld,
// which (via initializeLocale) starts the robot-lifecycle/audio-swells ticks -- those subscribe
// to BeatClock, which needs a real AudioContext/Transport outside this test's jsdom environment.
vi.mock('../engine/beatClock', () => ({
  subscribeToMeasure: vi.fn(() => vi.fn()),
  getCurrentMeasure: vi.fn(() => 0),
  scheduleRepeat: vi.fn(() => 'schedule-id'),
  cancelSchedule: vi.fn(),
  getCurrentMeasurePrecise: vi.fn(() => 0),
}));

import { computeRobotAudioOverrideDiff, computeCompanyDiff, buildSessionPayload, applySessionPayload } from './sessionDiff';
import type { Robot } from '../types/Robot';
import type { Company } from '../types/Company';
import type { SessionPayload } from '../types/session';
import { DEFAULT_GLOBAL_AUDIO_SETTINGS } from '../types/globalAudio';
import type { RobotAudioBaseline } from '../systems/spawnSystem';
import { useAttenuationStyleStore, selectCurrentAttenuationStyle, DEFAULT_PELAGOS } from '../stores/attenuationStyleStore';
import { generateAttenuationStyleBpm } from './bpmSeed';
import { useLocaleStore, DEFAULT_LOCALE } from '../stores/localeStore';
import { useAudioStore } from '../stores/audioStore';
import { spawnInitialRoster, spawnInitialCompanies } from '../systems/spawnSystem';
import * as worldTransition from '../systems/worldTransition';
import { stopRobotLifecycle } from '../systems/robotSystems';
import { stopAudioSwells, tickAudioSwells, getActiveSwellSnapshot } from '../systems/audioSwells';
import * as audioSwells from '../systems/audioSwells';
import { precomputeDataX } from './getSeededVal';
import * as noiseMaps from './noiseMaps';
import { buildSeededComposition, buildSeededPerformance, applyPerformanceMarks, generateMelodyForRobot, DEFAULT_RHYTHMIC_MOTIF_LENGTH, DEFAULT_NOTE_VARIANCE, DEFAULT_PITCH_REPEAT, DEFAULT_RESTS, DEFAULT_ACCENTS } from '../engine/melodyGenerator';
import { RHYTHMIC_DENSITY_MAX } from '../constants';
import { ROBOT_LFO_TARGET_IDS, GLOBAL_LFO_TARGET_IDS, LFO_LANE_IDS, type RobotLfoTargetId, type LfoLink } from '../types/lfo';
import { DEFAULT_BANK_LFO, DEFAULT_LFO_LINK } from '../data/lfoConfig';
import { noteValueHz } from '../data/noteValues';
import { resolveLaneRateHz, resolveDelayTimeSeconds, resolvePhaserRateHz } from './tempoSync';
import { lfoEngine } from '../engine/lfoEngine';
import { AudioEngine } from '../engine/AudioEngine';

afterEach(() => {
  stopRobotLifecycle();
  stopAudioSwells();
});

/** All 6 targets unlinked -- matches DEFAULT_LFO_LINK, so a live robot with no lfoLinks override
 *  (computeRobotAudioOverrideDiff's own DEFAULT_LFO_LINK fallback) still diffs to {} against this. */
function makeDefaultLfoLinks(): Record<RobotLfoTargetId, LfoLink> {
  return Object.fromEntries(ROBOT_LFO_TARGET_IDS.map((t) => [t, { lane: null, depth: 0 }])) as Record<RobotLfoTargetId, LfoLink>;
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
    lfoLinks: makeDefaultLfoLinks(),
    reverbSend: 0.3,
    delaySend: 0.1,
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
    position: { x: 0, y: 0 },
    melody: [],
    audioAttributes: baseline.audioAttributes,
    octaveRange: baseline.octaveRange,
    masterVolume: 0.6,
    docking: 'active',
    batteryLevel: 100,
    rhythmicDensity: baseline.rhythmicDensity,
    rhythmicMotifLength: baseline.rhythmicMotifLength,
    noteVariance: baseline.noteVariance,
    pitchRepeat: baseline.pitchRepeat,
    reverbSend: baseline.reverbSend,
    delaySend: baseline.delaySend,
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

  describe('pan (Robot Pan T11)', () => {
    it('diffs a manual robot to its pan alone', () => {
      const baseline = makeBaseline();
      const live = makeLiveRobot(baseline, { panAuto: false, pan: 0.4 });
      expect(computeRobotAudioOverrideDiff(live, baseline)).toEqual({ pan: 0.4 });
    });

    it('keeps a negative manual pan, and the extremes', () => {
      const baseline = makeBaseline();
      expect(computeRobotAudioOverrideDiff(makeLiveRobot(baseline, { panAuto: false, pan: -1 }), baseline)).toEqual({ pan: -1 });
      expect(computeRobotAudioOverrideDiff(makeLiveRobot(baseline, { panAuto: false, pan: 1 }), baseline)).toEqual({ pan: 1 });
    });

    it('rounds to two decimals, the slider step', () => {
      const baseline = makeBaseline();
      const live = makeLiveRobot(baseline, { panAuto: false, pan: 0.123456 });
      expect(computeRobotAudioOverrideDiff(live, baseline)).toEqual({ pan: 0.12 });
    });

    it('keeps a manual pan of exactly 0: Auto off at the centre is still a change from Auto', () => {
      const baseline = makeBaseline();
      const live = makeLiveRobot(baseline, { panAuto: false, pan: 0 });
      expect(computeRobotAudioOverrideDiff(live, baseline)).toEqual({ pan: 0 });
    });

    it('diffs an Auto robot with a stale pan to nothing', () => {
      const baseline = makeBaseline();
      const live = makeLiveRobot(baseline, { panAuto: true, pan: 0.4 });
      expect(computeRobotAudioOverrideDiff(live, baseline)).toEqual({});
    });

    it('diffs an older robot with neither field to nothing', () => {
      const baseline = makeBaseline();
      expect(computeRobotAudioOverrideDiff(makeLiveRobot(baseline), baseline)).toEqual({});
    });
  });

  // docs/tasks/ROBOT_SENDS.md Task 15: a send diffs against the seeded baseline at two decimals (the slider's step),
  // and a swell in flight saves its base, not the interpolated value.
  describe('reverbSend and delaySend (Robot Sends T15)', () => {
    const SEEDED = { reverbSend: 0.3, delaySend: 0.1 };
    const withSends = (baselineOverrides: Partial<RobotAudioBaseline> = {}) => makeBaseline({ ...SEEDED, ...baselineOverrides });
    const live = (baseline: RobotAudioBaseline, overrides: Partial<Robot> = {}) =>
      makeLiveRobot(baseline, { reverbSend: baseline.reverbSend, delaySend: baseline.delaySend, ...overrides });
    const swellOn = (attribute: string, robotId: string, baseValue: number) =>
      vi.spyOn(audioSwells, 'getActiveSwellSnapshot').mockImplementation((pool) =>
        pool === 'robot'
          ? [{ pool: 'robot', robotAttribute: attribute, members: [{ robotId, baseValue, peakDelta: 0.4 }], phase: 'rising', startMeasure: 0, risingMeasures: 4, fallingMeasures: 4 } as never]
          : [],
      );

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('an untouched robot diffs to {}', () => {
      const baseline = withSends();
      expect(computeRobotAudioOverrideDiff(live(baseline), baseline)).toEqual({});
    });

    it('a robot moved one step diffs to that send alone, at two decimals', () => {
      const baseline = withSends();
      expect(computeRobotAudioOverrideDiff(live(baseline, { reverbSend: 0.35 }), baseline)).toEqual({ reverbSend: 0.35 });
      expect(computeRobotAudioOverrideDiff(live(baseline, { delaySend: 0.15 }), baseline)).toEqual({ delaySend: 0.15 });
    });

    it('both sends moved write both keys', () => {
      const baseline = withSends();
      expect(computeRobotAudioOverrideDiff(live(baseline, { reverbSend: 0.9, delaySend: 0 }), baseline)).toEqual({ reverbSend: 0.9, delaySend: 0 });
    });

    it('rounds the saved value to two decimals', () => {
      const baseline = withSends();
      expect(computeRobotAudioOverrideDiff(live(baseline, { reverbSend: 0.123456 }), baseline)).toEqual({ reverbSend: 0.12 });
    });

    it('a send equal to its seed after float noise diffs to nothing', () => {
      const baseline = withSends();
      expect(computeRobotAudioOverrideDiff(live(baseline, { reverbSend: 0.1 + 0.2, delaySend: 0.1 + 1e-17 }), baseline)).toEqual({});
    });

    it('a seed that is not itself on the two-decimal grid still compares equal to its rounded live value', () => {
      const baseline = withSends({ reverbSend: 0.3049999 });
      expect(computeRobotAudioOverrideDiff(live(baseline, { reverbSend: 0.3 }), baseline)).toEqual({});
    });

    it('a live value within half a step of the seed diffs to nothing', () => {
      const baseline = withSends();
      expect(computeRobotAudioOverrideDiff(live(baseline, { reverbSend: 0.304 }), baseline)).toEqual({});
    });

    it('dry (0) against a seeded send is a real change, and 0 against a seeded 0 is not', () => {
      const dry = withSends({ reverbSend: 0.3, delaySend: 0 });
      expect(computeRobotAudioOverrideDiff(live(dry, { reverbSend: 0 }), dry)).toEqual({ reverbSend: 0 });
      expect(computeRobotAudioOverrideDiff(live(dry, { delaySend: 0 }), dry)).toEqual({});
    });

    it('a send raised from a seeded 0 is a change', () => {
      const dry = withSends({ delaySend: 0 });
      expect(computeRobotAudioOverrideDiff(live(dry, { delaySend: 0.5 }), dry)).toEqual({ delaySend: 0.5 });
    });

    it('the full-scale send 1 is kept', () => {
      const baseline = withSends();
      expect(computeRobotAudioOverrideDiff(live(baseline, { reverbSend: 1 }), baseline)).toEqual({ reverbSend: 1 });
    });

    it('the send keys touch no other field of the diff', () => {
      const baseline = withSends();
      expect(computeRobotAudioOverrideDiff(live(baseline, { reverbSend: 0.5, rhythmicDensity: 90 }), baseline)).toEqual({ reverbSend: 0.5, rhythmicDensity: 90 });
    });

    describe('with a swell in flight', () => {
      it('an untouched robot with a swell on reverbSend still diffs to {} (the base is the seed, the live value is mid-ramp)', () => {
        const baseline = withSends();
        swellOn('reverbSend', 'r1', 0.3);
        expect(computeRobotAudioOverrideDiff(live(baseline, { reverbSend: 0.55 }), baseline)).toEqual({});
      });

      it('the same for delaySend', () => {
        const baseline = withSends();
        swellOn('delaySend', 'r1', 0.1);
        expect(computeRobotAudioOverrideDiff(live(baseline, { delaySend: 0.6 }), baseline)).toEqual({});
      });

      it('a swell that began from a hand-edited value saves that base, not the seed and not the interpolated value', () => {
        const baseline = withSends();
        swellOn('reverbSend', 'r1', 0.5);
        expect(computeRobotAudioOverrideDiff(live(baseline, { reverbSend: 0.8 }), baseline)).toEqual({ reverbSend: 0.5 });
      });

      it('a swell on the other send leaves this one reading its live value', () => {
        const baseline = withSends();
        swellOn('delaySend', 'r1', 0.1);
        expect(computeRobotAudioOverrideDiff(live(baseline, { reverbSend: 0.55 }), baseline)).toEqual({ reverbSend: 0.55 });
      });

      it('a swell on another robot leaves this robot reading its live value', () => {
        const baseline = withSends();
        swellOn('reverbSend', 'r2', 0.3);
        expect(computeRobotAudioOverrideDiff(live(baseline, { reverbSend: 0.55 }), baseline)).toEqual({ reverbSend: 0.55 });
      });

      it('a swell\'s base is rounded to two decimals like the live value', () => {
        const baseline = withSends();
        swellOn('reverbSend', 'r1', 0.123456);
        expect(computeRobotAudioOverrideDiff(live(baseline, { reverbSend: 0.8 }), baseline)).toEqual({ reverbSend: 0.12 });
      });
    });
  });

  // docs/tasks/ROBOT_PERFORMANCE.md Task 15: the three performance fields diff like rhythmicDensity, key by key.
  describe('dynamics, rests and accents (Robot Performance T15)', () => {
    const SEEDED = { dynamics: 50, rests: 10, accents: 20 };
    const withPerformance = (baselineOverrides: Partial<RobotAudioBaseline> = {}) => makeBaseline({ ...SEEDED, ...baselineOverrides });
    const live = (baseline: RobotAudioBaseline, overrides: Partial<Robot> = {}) =>
      makeLiveRobot(baseline, { dynamics: baseline.dynamics, rests: baseline.rests, accents: baseline.accents, ...overrides });

    it('an untouched robot diffs to {}', () => {
      const baseline = withPerformance();
      expect(computeRobotAudioOverrideDiff(live(baseline), baseline)).toEqual({});
    });

    it('a robot edited to dynamics 70 / rests 30 / accents 60 diffs to exactly those three keys', () => {
      const baseline = withPerformance();
      expect(computeRobotAudioOverrideDiff(live(baseline, { dynamics: 70, rests: 30, accents: 60 }), baseline)).toEqual({ dynamics: 70, rests: 30, accents: 60 });
    });

    it('one moved field diffs to that key alone', () => {
      const baseline = withPerformance();
      expect(computeRobotAudioOverrideDiff(live(baseline, { dynamics: 70 }), baseline)).toEqual({ dynamics: 70 });
      expect(computeRobotAudioOverrideDiff(live(baseline, { rests: 30 }), baseline)).toEqual({ rests: 30 });
      expect(computeRobotAudioOverrideDiff(live(baseline, { accents: 60 }), baseline)).toEqual({ accents: 60 });
    });

    it('a robot flattened to 0 against a non-zero seed diffs to 0 (a real value)', () => {
      const baseline = withPerformance();
      expect(computeRobotAudioOverrideDiff(live(baseline, { dynamics: 0, rests: 0, accents: 0 }), baseline)).toEqual({ dynamics: 0, rests: 0, accents: 0 });
    });

    it('a live robot carrying none of the fields writes no key (never an undefined-valued one)', () => {
      const baseline = withPerformance();
      const diff = computeRobotAudioOverrideDiff(makeLiveRobot(baseline), baseline);
      expect('dynamics' in diff).toBe(false);
      expect('rests' in diff).toBe(false);
      expect('accents' in diff).toBe(false);
    });

    it('sits beside the other keys without disturbing them', () => {
      const baseline = withPerformance();
      expect(computeRobotAudioOverrideDiff(live(baseline, { rests: 30, rhythmicDensity: 90 }), baseline)).toEqual({ rests: 30, rhythmicDensity: 90 });
    });
  });

  describe('articulation (Robot Articulation T11)', () => {
    /** A glider with an accent filter and shaped attack: every new field holds a distinguishing value. */
    function makeArticulatedBaseline() {
      return makeBaseline({
        audioAttributes: {
          ...makeBaseline().audioAttributes,
          adsr: { attack: 0.2, decay: 0.3, sustain: 0.8, release: 1.5, attackCurve: 'bounce', releaseCurve: 'linear' },
          portamento: 0.15,
          filterQ: 5,
          filterType: 'bandpass',
        },
      });
    }

    it('diffs an edited robot to exactly the adsr (with its curve), portamento, filterQ and filterType', () => {
      const baseline = makeBaseline();
      const editedAdsr = { ...baseline.audioAttributes.adsr, attackCurve: 'sine' as const };
      const live = makeLiveRobot(baseline, {
        audioAttributes: { ...baseline.audioAttributes, adsr: editedAdsr, portamento: 0.2, filterQ: 4, filterType: 'bandpass' },
      });
      expect(computeRobotAudioOverrideDiff(live, baseline)).toEqual({
        adsr: editedAdsr,
        portamento: 0.2,
        filterQ: 4,
        filterType: 'bandpass',
      });
    });

    it('diffs an untouched glider / accent-filter / shaped-attack robot to nothing', () => {
      const baseline = makeArticulatedBaseline();
      expect(computeRobotAudioOverrideDiff(makeLiveRobot(baseline), baseline)).toEqual({});
    });

    it('diffs portamento alone', () => {
      const baseline = makeBaseline();
      const live = makeLiveRobot(baseline, { audioAttributes: { ...baseline.audioAttributes, portamento: 0.1 } });
      expect(computeRobotAudioOverrideDiff(live, baseline)).toEqual({ portamento: 0.1 });
    });

    it('diffs filterQ alone', () => {
      const baseline = makeBaseline();
      const live = makeLiveRobot(baseline, { audioAttributes: { ...baseline.audioAttributes, filterQ: 6 } });
      expect(computeRobotAudioOverrideDiff(live, baseline)).toEqual({ filterQ: 6 });
    });

    it('diffs filterType alone', () => {
      const baseline = makeBaseline();
      const live = makeLiveRobot(baseline, { audioAttributes: { ...baseline.audioAttributes, filterType: 'highpass' } });
      expect(computeRobotAudioOverrideDiff(live, baseline)).toEqual({ filterType: 'highpass' });
    });

    it('diffs a releaseCurve change as the adsr alone', () => {
      const baseline = makeArticulatedBaseline();
      const editedAdsr = { ...baseline.audioAttributes.adsr, releaseCurve: 'step' as const };
      const live = makeLiveRobot(baseline, { audioAttributes: { ...baseline.audioAttributes, adsr: editedAdsr } });
      expect(computeRobotAudioOverrideDiff(live, baseline)).toEqual({ adsr: editedAdsr });
    });

    it('keeps a portamento of exactly 0 when the seeded baseline glides: the glide switched off is still a change', () => {
      const baseline = makeArticulatedBaseline();
      const live = makeLiveRobot(baseline, { audioAttributes: { ...baseline.audioAttributes, portamento: 0 } });
      expect(computeRobotAudioOverrideDiff(live, baseline)).toEqual({ portamento: 0 });
    });

    it('writes no key (not an undefined-valued one) for a live robot that carries none of the three fields', () => {
      const baseline = makeArticulatedBaseline();
      const { portamento: _p, filterQ: _q, filterType: _t, ...bare } = baseline.audioAttributes;
      const live = makeLiveRobot(baseline, { audioAttributes: bare });
      const diff = computeRobotAudioOverrideDiff(live, baseline);
      expect(diff).not.toHaveProperty('portamento');
      expect(diff).not.toHaveProperty('filterQ');
      expect(diff).not.toHaveProperty('filterType');
    });
  });

  it('diffs octaveRange alone when only octaveRange changed', () => {
    const baseline = makeBaseline();
    const live = makeLiveRobot(baseline, { octaveRange: [1, 3] });
    expect(computeRobotAudioOverrideDiff(live, baseline)).toEqual({ octaveRange: [1, 3] });
  });

  it('diffs name alone when the robot was renamed', () => {
    const baseline = makeBaseline();
    const live = makeLiveRobot(baseline, { name: 'Custom Name' });
    expect(computeRobotAudioOverrideDiff(live, baseline)).toEqual({ name: 'Custom Name' });
  });

  it('diffs lfoLinks alone when only one target\'s link changed', () => {
    const baseline = makeBaseline();
    const changedLink: LfoLink = { lane: 'b', depth: 42 };
    const live = makeLiveRobot(baseline, { lfoLinks: { ...baseline.lfoLinks, 'layer1.gain': changedLink } });
    expect(computeRobotAudioOverrideDiff(live, baseline)).toEqual({ lfoLinks: { 'layer1.gain': changedLink } });
  });

  it('diffs every changed lfoLinks target, keyed only by the targets that actually changed', () => {
    const baseline = makeBaseline();
    const changedA: LfoLink = { lane: 'a', depth: 10 };
    const changedB: LfoLink = { lane: 'd', depth: 99 };
    const live = makeLiveRobot(baseline, {
      lfoLinks: { ...baseline.lfoLinks, 'layer0.gain': changedA, 'layer2.detune': changedB },
    });
    expect(computeRobotAudioOverrideDiff(live, baseline)).toEqual({
      lfoLinks: { 'layer0.gain': changedA, 'layer2.detune': changedB },
    });
  });

  it('treats a live robot with no lfoLinks at all as the default (unlinked) map, diffing to {} against a default baseline', () => {
    const baseline = makeBaseline();
    const live = makeLiveRobot(baseline, { lfoLinks: undefined });
    expect(computeRobotAudioOverrideDiff(live, baseline)).toEqual({});
  });

  it('never includes audioMode, masterVolume, job assignment, docking, or battery level in the diff', () => {
    const baseline = makeBaseline();
    const live = makeLiveRobot(baseline, {
      audioMode: 'solo',
      masterVolume: 0.99,
      docking: 'docked',
      batteryLevel: 12,
      job: 'acousticSurvey',
    });
    const diff = computeRobotAudioOverrideDiff(live, baseline);
    expect(diff).not.toHaveProperty('audioMode');
    expect(diff).not.toHaveProperty('masterVolume');
    expect(diff).not.toHaveProperty('docking');
    expect(diff).not.toHaveProperty('batteryLevel');
    expect(diff).not.toHaveProperty('job');
  });
});

describe('buildSessionPayload', () => {
  // A fresh, dedicated locale id per test, not DEFAULT_LOCALE_ID: spawnSystem.ts's spawnCounters
  // map is keyed per-locale and lives at module scope, so it survives a Zustand store reset --
  // reusing one literal id across tests would make each test's spawnCount start wherever the
  // previous test left off, exactly the pitfall spawnSystem.test.ts's own "dedicated locale ID"
  // tests already document.
  let localeIdCounter = 0;
  function setupWorld() {
    const localeId = `build-session-payload-locale-${localeIdCounter++}`;
    useAttenuationStyleStore.setState({
      attenuationStyles: [{ ...DEFAULT_PELAGOS, currentLocaleId: localeId }],
      currentAttenuationStyleId: DEFAULT_PELAGOS.id,
    });
    useLocaleStore.setState({ locales: { [localeId]: { ...DEFAULT_LOCALE, id: localeId, robots: [], companies: [] } } });
    return localeId;
  }

  it('stamps version: 2 and captures the current Attenuation Style name/coordinates/globalAudio', () => {
    const localeId = setupWorld();
    spawnInitialRoster(localeId);
    const payload = buildSessionPayload();
    expect(payload.version).toBe(2);
    expect(payload.attenuationStyleName).toBe(DEFAULT_PELAGOS.name);
    expect(payload.coordinates).toEqual(DEFAULT_LOCALE.coordinates);
    // globalAudio is normalized/quantized at save time, so it may differ from raw store state
    // Verify structure and key fields are present, not exact equality
    expect(Object.keys(payload.globalAudio)).toContain('compressor');
    expect(Object.keys(payload.globalAudio)).toContain('eq3');
  });

  it('always captures lfoBank (4 lanes) and globalLfoLinks (7 targets) whole, even for an untouched world', () => {
    const localeId = setupWorld();
    spawnInitialRoster(localeId);
    const payload = buildSessionPayload();
    expect(Object.keys(payload.lfoBank!).sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(Object.keys(payload.globalLfoLinks!).sort()).toEqual([...GLOBAL_LFO_TARGET_IDS].sort());
  });

  it('quantizes a lane\'s rateDrift/depthDrift to 2 decimal places (floating-point cleanup)', () => {
    const localeId = setupWorld();
    spawnInitialRoster(localeId);
    useAudioStore.setState((state) => ({
      lfoBank: { ...state.lfoBank, b: { ...state.lfoBank.b, rateDrift: 0.123456, depthDrift: -0.987654 } },
    }));

    const payload = buildSessionPayload();

    expect(payload.lfoBank!.b.rateDrift).toBe(0.12);
    expect(payload.lfoBank!.b.depthDrift).toBe(-0.99);
  });

  it('includes only the one robot\'s changed lfoLinks target, keyed under lfoLinks', () => {
    const localeId = setupWorld();
    spawnInitialRoster(localeId);
    const robot = useLocaleStore.getState().getLocaleById(localeId)!.robots[0];
    const current = robot.lfoLinks!['layer0.detune'];
    const changedLink: LfoLink = { lane: current.lane === 'a' ? 'b' : 'a', depth: (current.depth + 20) % 101 };
    useLocaleStore.getState().updateRobot(localeId, robot.id, { lfoLinks: { ...robot.lfoLinks, 'layer0.detune': changedLink } as Record<RobotLfoTargetId, LfoLink> });

    const payload = buildSessionPayload();

    expect(payload.robotOverrides[robot.id]).toEqual({ lfoLinks: { 'layer0.detune': changedLink } });
  });

  it('captures bpm/swellFrequency/swellDuration/pingVarianceAutomation from audioStore, not just globalAudio', () => {
    const localeId = setupWorld();
    spawnInitialRoster(localeId);
    useAudioStore.setState({ bpm: 77, swellFrequency: 9, swellDuration: 5, pingVarianceAutomation: 0.42 });

    const payload = buildSessionPayload();

    expect(payload.bpm).toBe(77);
    expect(payload.swellFrequency).toBe(9);
    expect(payload.swellDuration).toBe(5);
    expect(payload.pingVarianceAutomation).toBe(0.42);
  });

  // The global pool lost delay.wet / reverb.wet (docs/specs/ROBOT_SENDS.md assumption 13) and applyGlobalSwellBasesToAudio
  // lost their two blocks; the blocks that remain must still save the base, not the value caught mid-ramp.
  it('saves a global swell in flight at its base value, not the interpolated one', () => {
    const localeId = setupWorld();
    useAudioStore.setState({ swellFrequency: 16, swellDuration: 15 });
    // Every draw at its minimum: target index 0, eq3.low. Restored below so no other test in this file sees it.
    const noise = vi.spyOn(noiseMaps, 'getAttenuationStyleNoiseMap').mockReturnValue(() => -1);
    try {
      tickAudioSwells(localeId, 0);
      const swell = getActiveSwellSnapshot('global').find((s) => s.globalTarget === 'eq3.low')!;
      expect(swell).toBeDefined();
      tickAudioSwells(localeId, 2); // advance: writes the interpolated value into the store
      const live = useAudioStore.getState().globalAudio.eq3.low;
      expect(Math.abs(live - swell.baseValue!)).toBeGreaterThan(0.5); // precondition: it really is mid-ramp

      const payload = buildSessionPayload();

      expect(payload.globalAudio.eq3.low).toBeCloseTo(swell.baseValue!, 1);
    } finally {
      noise.mockRestore();
    }
  });

  it('has no robotOverrides entries for an untouched roster', () => {
    const localeId = setupWorld();
    spawnInitialRoster(localeId);
    const payload = buildSessionPayload();
    expect(Object.keys(payload.robotOverrides)).toEqual([]);
  });

  it('includes only the one robot that was edited, with only its changed field', () => {
    const localeId = setupWorld();
    spawnInitialRoster(localeId);
    const robot = useLocaleStore.getState().getLocaleById(localeId)!.robots[0];
    useLocaleStore.getState().updateRobot(localeId, robot.id, { rhythmicDensity: 7 });

    const payload = buildSessionPayload();
    expect(Object.keys(payload.robotOverrides)).toEqual([robot.id]);
    expect(payload.robotOverrides[robot.id]).toEqual({ rhythmicDensity: 7 });
  });

  it('has no companyDiffs entries and no userCreatedCompanies for an untouched, fully spawn-generated world', () => {
    const localeId = setupWorld();
    spawnInitialRoster(localeId);
    spawnInitialCompanies(localeId);
    const payload = buildSessionPayload();
    expect(Object.keys(payload.companyDiffs)).toEqual([]);
    expect(payload.userCreatedCompanies).toEqual([]);
  });

  it('includes only the one company that was renamed, with only its changed field', () => {
    const localeId = setupWorld();
    spawnInitialRoster(localeId);
    spawnInitialCompanies(localeId);
    const company = useLocaleStore.getState().getLocaleById(localeId)!.companies[0];
    useLocaleStore.getState().updateCompany(localeId, company.id, { name: 'Renamed Guild' });

    const payload = buildSessionPayload();
    expect(Object.keys(payload.companyDiffs)).toEqual([company.id]);
    expect(payload.companyDiffs[company.id]).toEqual({ name: 'Renamed Guild' });
  });

  it('puts a company with no match in the regenerated baseline set into userCreatedCompanies as a full object, never into companyDiffs', () => {
    const localeId = setupWorld();
    spawnInitialRoster(localeId);
    spawnInitialCompanies(localeId);
    const userCompany: Company = { id: 'user-created-uuid-1234', name: 'Hand Built Crew', color: '#123456', robotIds: [] };
    useLocaleStore.getState().addCompany(localeId, userCompany);

    const payload = buildSessionPayload();
    expect(payload.userCreatedCompanies).toEqual([userCompany]);
    expect(payload.companyDiffs).not.toHaveProperty('user-created-uuid-1234');
  });
});

describe('applySessionPayload', () => {
  let localeIdCounter = 0;
  function setupWorld() {
    const localeId = `apply-session-payload-locale-${localeIdCounter++}`;
    useAttenuationStyleStore.setState({
      attenuationStyles: [{ ...DEFAULT_PELAGOS, currentLocaleId: localeId }],
      currentAttenuationStyleId: DEFAULT_PELAGOS.id,
    });
    useLocaleStore.setState({ locales: { [localeId]: { ...DEFAULT_LOCALE, id: localeId, robots: [], companies: [] } } });
    return localeId;
  }

  function currentLocale() {
    const attenuationStyle = useAttenuationStyleStore.getState().attenuationStyles.find((p) => p.id === useAttenuationStyleStore.getState().currentAttenuationStyleId);
    return attenuationStyle?.currentLocaleId ? useLocaleStore.getState().getLocaleById(attenuationStyle.currentLocaleId) : undefined;
  }

  it('applies a user-created company whose stored lastEditedOptions still carries a legacy volumeLfo (saved before the Volume LFO target was removed) without error, keeping the company and its other options', () => {
    const localeId = setupWorld();
    spawnInitialRoster(localeId);
    const payload = buildSessionPayload();
    // docs/specs/LFO_LOAD_FIX.md assumption 9: the field is gone from CompanyOptionsSnapshot, so an
    // old payload is the only way it can appear — cast through unknown, since decodeSessionPayload's
    // own doc comment treats this as untyped JSON from outside the app. The stale key is inert:
    // never read, never thrown on.
    const legacyCompany = {
      id: 'user-created-legacy-volume-lfo',
      name: 'Old Guard',
      color: '#abcdef',
      robotIds: [],
      lastEditedOptions: { masterVolume: 0.4, volumeLfo: { shape: 'sine', rate: 2, depth: 40 } },
    } as unknown as Company;
    const stalePayload = { ...payload, userCreatedCompanies: [legacyCompany] };

    expect(() => applySessionPayload(stalePayload)).not.toThrow();

    const applied = currentLocale()?.companies.find((c) => c.id === 'user-created-legacy-volume-lfo');
    expect(applied).toBeDefined();
    expect(applied?.lastEditedOptions?.masterVolume).toBe(0.4);
  });

  it('calls worldTransition.retransmitWorld, not a parallel regeneration path — omitting attenuationStyleName when it matches the currently active one', () => {
    // Omitting it routes through retransmitWorld's coordsOnly branch, which preserves the
    // current Attenuation Style untouched -- passing it unconditionally would instead hit
    // attenuationStyleStore.addAttenuationStyle's silent same-name refusal (it returns false and
    // does not append), corrupting currentAttenuationStyleId. See applySessionPayload's own
    // comment for the full explanation.
    const localeId = setupWorld();
    spawnInitialRoster(localeId);
    const payload = buildSessionPayload();
    const spy = vi.spyOn(worldTransition, 'retransmitWorld');

    applySessionPayload(payload);

    expect(spy).toHaveBeenCalledWith({ coordinates: payload.coordinates });
    spy.mockRestore();
  });

  it('passes attenuationStyleName through when the payload names a different Attenuation Style than the one currently active', () => {
    const localeId = setupWorld();
    spawnInitialRoster(localeId);
    const payload = buildSessionPayload();
    const differentNamePayload = { ...payload, attenuationStyleName: `${payload.attenuationStyleName} Alt` };
    const spy = vi.spyOn(worldTransition, 'retransmitWorld');

    applySessionPayload(differentNamePayload);

    expect(spy).toHaveBeenCalledWith({ attenuationStyleName: differentNamePayload.attenuationStyleName, coordinates: differentNamePayload.coordinates });
    spy.mockRestore();
  });

  it('skipLocaleRebuild: true never calls retransmitWorld', () => {
    const localeId = setupWorld();
    spawnInitialRoster(localeId);
    const payload = buildSessionPayload();
    const spy = vi.spyOn(worldTransition, 'retransmitWorld');

    applySessionPayload(payload, { skipLocaleRebuild: true });

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('skipLocaleRebuild: true still applies globalAudio/robotOverrides/companyDiffs, same as the default call', () => {
    const localeId = setupWorld();
    spawnInitialRoster(localeId);
    const robot = useLocaleStore.getState().getLocaleById(localeId)!.robots[0];
    useLocaleStore.getState().updateRobot(localeId, robot.id, { rhythmicDensity: 3 });
    const payload = buildSessionPayload();
    useLocaleStore.getState().updateRobot(localeId, robot.id, { rhythmicDensity: 0 });

    applySessionPayload(payload, { skipLocaleRebuild: true });

    const restoredRobot = currentLocale()!.robots.find((r) => r.id === robot.id);
    expect(restoredRobot?.rhythmicDensity).toBe(3);
  });

  it('restores an edited robot field after a full save/wipe/load round trip', () => {
    const localeId = setupWorld();
    spawnInitialRoster(localeId);
    const robot = useLocaleStore.getState().getLocaleById(localeId)!.robots[0];
    useLocaleStore.getState().updateRobot(localeId, robot.id, { rhythmicDensity: 3 });
    const payload = buildSessionPayload();

    // Wipe to different coordinates -- a genuinely different world, not a no-op retransmit.
    // retransmitWorld builds a brand-new locale with its own fresh id (buildLocale's own
    // generateUUID()), so the old `localeId` is gone from the store after this -- currentLocale()
    // (via the Attenuation Style's live currentLocaleId) is the only way to find it afterward.
    // Different coordinates also mean a different noise map, so `robot.id` itself (seed-derived)
    // doesn't carry over -- checking the coordinates actually changed is what proves this step
    // did real work, not a no-op.
    const wipedCoords = { x: payload.coordinates.x + 500, y: payload.coordinates.y + 500 };
    applySessionPayload({ ...payload, coordinates: wipedCoords });
    expect(currentLocale()!.coordinates).toEqual(wipedCoords);

    applySessionPayload(payload);
    const restoredRobot = currentLocale()!.robots.find((r) => r.id === robot.id);
    expect(restoredRobot?.rhythmicDensity).toBe(3);
  });

  it('restores a robot\'s exact melody, not just its rhythmicDensity value, after a full save/wipe/load round trip (Deterministic Robot Melody Generation, Task 4)', async () => {
    // Belt-and-suspenders guard: proves SessionPayload's existing five-input diff is actually
    // SUFFICIENT for melody fidelity, not just attribute-value fidelity -- the whole point of
    // making compositionSeed itself re-derive identically from the seed on regeneration (never
    // diffed) rather than needing a SessionPayload change. Uses applyDensity (the real user-facing
    // action, which also calls regenerateMelody), not a raw updateRobot write, so this test
    // reflects what actually happens when an operator edits a slider.
    const { applyDensity } = await import('../systems/robotOptionsActions');
    const localeId = setupWorld();
    spawnInitialRoster(localeId);
    const robot = useLocaleStore.getState().getLocaleById(localeId)!.robots[0];
    applyDensity(robot, localeId, 3);
    const editedRobot = useLocaleStore.getState().getLocaleById(localeId)!.robots.find((r) => r.id === robot.id)!;
    const editedMelody = editedRobot.melody;
    const payload = buildSessionPayload();

    applySessionPayload({ ...payload, coordinates: { x: payload.coordinates.x + 500, y: payload.coordinates.y + 500 } });
    applySessionPayload(payload);

    const restoredRobot = currentLocale()!.robots.find((r) => r.id === robot.id)!;
    expect(restoredRobot.rhythmicDensity).toBe(3);
    // MelodyEvent.id is a fresh crypto.randomUUID() by design, never seeded -- strip before comparing.
    const stripIds = (melody: typeof editedMelody) => melody.map(({ id: _id, ...rest }) => rest);
    expect(stripIds(restoredRobot.melody)).toEqual(stripIds(editedMelody));
  });

  it('regenerates melody from the store\'s NORMALIZED attribute value, not the raw diff, when a diff carries an out-of-range value (code review follow-up)', () => {
    // localeStore.ts's updateRobot clamps rhythmicDensity to [RHYTHMIC_DENSITY_MIN,
    // RHYTHMIC_DENSITY_MAX] before persisting it. applySessionPayload must feed that SAME
    // clamped value into regenerateMelody -- not the raw, unclamped diff value -- or the
    // persisted rhythmicDensity and the melody actually generated from it would silently
    // diverge (the robot would show density 100 but sound like density 150).
    const localeId = setupWorld();
    spawnInitialRoster(localeId);
    const robot = useLocaleStore.getState().getLocaleById(localeId)!.robots[0];
    const payload = buildSessionPayload();
    const outOfRangeValue = RHYTHMIC_DENSITY_MAX + 50;
    const outOfRangePayload = {
      ...payload,
      robotOverrides: {
        ...payload.robotOverrides,
        [robot.id]: { ...payload.robotOverrides[robot.id], rhythmicDensity: outOfRangeValue },
      },
    };

    applySessionPayload(outOfRangePayload);

    const restoredRobot = currentLocale()!.robots.find((r) => r.id === robot.id)!;
    expect(restoredRobot.rhythmicDensity).toBe(RHYTHMIC_DENSITY_MAX); // store-level clamp, already true today

    const expectedRand = buildSeededComposition(restoredRobot.compositionSeed, {
      rhythmicDensity: RHYTHMIC_DENSITY_MAX,
      rhythmicMotifLength: restoredRobot.rhythmicMotifLength ?? DEFAULT_RHYTHMIC_MOTIF_LENGTH,
      noteVariance: restoredRobot.noteVariance ?? DEFAULT_NOTE_VARIANCE,
      pitchRepeat: restoredRobot.pitchRepeat ?? DEFAULT_PITCH_REPEAT,
      octaveRange: restoredRobot.octaveRange,
    });
    // Robot Performance T4: a seeded robot carries rests and accents, so its melody is the generated
    // one with the same post-pass regenerateMelody applies (docs/specs/ROBOT_PERFORMANCE.md section 1.2).
    const expectedMelody = applyPerformanceMarks(
      generateMelodyForRobot({
        octaveMin: restoredRobot.octaveRange[0],
        octaveMax: restoredRobot.octaveRange[1],
        rhythmicDensity: RHYTHMIC_DENSITY_MAX,
        rhythmicMotifLength: restoredRobot.rhythmicMotifLength ?? DEFAULT_RHYTHMIC_MOTIF_LENGTH,
        noteVariance: restoredRobot.noteVariance ?? DEFAULT_NOTE_VARIANCE,
        pitchRepeat: restoredRobot.pitchRepeat ?? DEFAULT_PITCH_REPEAT,
        rand: expectedRand,
      }),
      { rests: restoredRobot.rests ?? DEFAULT_RESTS, accents: restoredRobot.accents ?? DEFAULT_ACCENTS },
      buildSeededPerformance(restoredRobot.compositionSeed),
    );
    const stripIds = (melody: typeof expectedMelody) => melody.map(({ id: _id, ...rest }) => rest);
    expect(stripIds(restoredRobot.melody)).toEqual(stripIds(expectedMelody));
  });

  it('restores bpm/swellFrequency/swellDuration/pingVarianceAutomation after a full save/wipe/load round trip, overriding retransmitWorld\'s own reseed', () => {
    const localeId = setupWorld();
    spawnInitialRoster(localeId);
    useAudioStore.setState({ bpm: 77, swellFrequency: 9, swellDuration: 5, pingVarianceAutomation: 0.42 });
    const payload = buildSessionPayload();

    // Wipe to a different Attenuation Style and coordinates first, with bpm stripped from the wipe
    // payload so nothing overrides the reseed: an Attenuation Style change reseeds bpm via
    // regenerateBpmFromSeed (a coordinates-only move would not). Restoring afterward must override
    // whatever that reseed produced, not just coincidentally match an untouched value.
    const { bpm: _bpm, ...wipePayload } = payload;
    applySessionPayload({
      ...wipePayload,
      attenuationStyleName: 'Wipe Style',
      coordinates: { x: payload.coordinates.x + 500, y: payload.coordinates.y + 500 },
    });
    expect(useAudioStore.getState().bpm).not.toBe(77);

    applySessionPayload(payload);

    expect(useAudioStore.getState().bpm).toBe(77);
    expect(useAudioStore.getState().swellFrequency).toBe(9);
    expect(useAudioStore.getState().swellDuration).toBe(5);
    expect(useAudioStore.getState().pingVarianceAutomation).toBe(0.42);
  });

  it('leaves the current bpm/swellFrequency/swellDuration/pingVarianceAutomation untouched when an older payload lacks those fields', () => {
    const localeId = setupWorld();
    spawnInitialRoster(localeId);
    const payload = buildSessionPayload();
    const { bpm: _bpm, swellFrequency: _sf, swellDuration: _sd, pingVarianceAutomation: _pva, ...oldShapePayload } = payload;

    useAudioStore.setState({ bpm: 123, swellFrequency: 11, swellDuration: 8, pingVarianceAutomation: 0.9 });
    expect(() => applySessionPayload(oldShapePayload as typeof payload)).not.toThrow();

    // This payload keeps the current Attenuation Style, so retransmitWorld is a coordinates-only
    // move and bpm is no longer reseeded (docs/specs/FREE_SYNC_TOGGLE.md §1.7) -- the carried-forward
    // value survives. Asserting it is untouched proves the absent field didn't crash or silently
    // zero anything out.
    expect(useAudioStore.getState().bpm).toBe(123);
  });

  it('reseeds bpm from the new Attenuation Style when an older payload without bpm switches styles', () => {
    const localeId = setupWorld();
    spawnInitialRoster(localeId);
    const payload = buildSessionPayload();
    const { bpm: _bpm, ...oldShapePayload } = payload;

    useAudioStore.setState({ bpm: 123 });
    applySessionPayload({ ...oldShapePayload, attenuationStyleName: 'Reseed Style' } as typeof payload);

    const attenuationStyle = selectCurrentAttenuationStyle(useAttenuationStyleStore.getState())!;
    expect(attenuationStyle.name).toBe('Reseed Style');
    expect(useAudioStore.getState().bpm).toBe(generateAttenuationStyleBpm(attenuationStyle.id, attenuationStyle.name));
  });

  it('restores a renamed company after a full save/wipe/load round trip', () => {
    const localeId = setupWorld();
    spawnInitialRoster(localeId);
    spawnInitialCompanies(localeId);
    const company = useLocaleStore.getState().getLocaleById(localeId)!.companies[0];
    useLocaleStore.getState().updateCompany(localeId, company.id, { name: 'Renamed Guild' });
    const payload = buildSessionPayload();

    applySessionPayload({ ...payload, coordinates: { x: payload.coordinates.x + 500, y: payload.coordinates.y + 500 } });
    applySessionPayload(payload);

    const restoredCompany = currentLocale()!.companies.find((c) => c.id === company.id);
    expect(restoredCompany?.name).toBe('Renamed Guild');
  });

  it('restores company membership bidirectionally: robotIds and every member\'s own companyId agree after the round trip', () => {
    const localeId = setupWorld();
    spawnInitialRoster(localeId);
    spawnInitialCompanies(localeId);
    const locale = useLocaleStore.getState().getLocaleById(localeId)!;
    const company = locale.companies[0];
    const freelanceRobot = locale.robots.find((r) => !r.companyId);
    expect(freelanceRobot, 'test needs at least one Freelance robot to move into the company').toBeDefined();

    useLocaleStore.getState().assignRobotToCompany(localeId, freelanceRobot!.id, company.id);
    const payload = buildSessionPayload();
    expect(payload.companyDiffs[company.id]?.robotIds).toContain(freelanceRobot!.id);

    applySessionPayload({ ...payload, coordinates: { x: payload.coordinates.x + 500, y: payload.coordinates.y + 500 } });
    applySessionPayload(payload);

    const restoredLocale = currentLocale()!;
    const restoredCompany = restoredLocale.companies.find((c) => c.id === company.id)!;
    expect(restoredCompany.robotIds).toContain(freelanceRobot!.id);
    const restoredRobot = restoredLocale.robots.find((r) => r.id === freelanceRobot!.id)!;
    expect(restoredRobot.companyId).toBe(company.id);
  });

  it('a robot removed from a company stays out of it (and back to Freelance) after the round trip, not just added members', () => {
    const localeId = setupWorld();
    spawnInitialRoster(localeId);
    spawnInitialCompanies(localeId);
    const locale = useLocaleStore.getState().getLocaleById(localeId)!;
    const company = locale.companies.find((c) => c.robotIds.length > 0)!;
    const removedMemberId = company.robotIds[0];

    useLocaleStore.getState().assignRobotToCompany(localeId, removedMemberId, null);
    const payload = buildSessionPayload();
    expect(payload.companyDiffs[company.id]?.robotIds).not.toContain(removedMemberId);

    applySessionPayload({ ...payload, coordinates: { x: payload.coordinates.x + 500, y: payload.coordinates.y + 500 } });
    applySessionPayload(payload);

    const restoredLocale = currentLocale()!;
    const restoredCompany = restoredLocale.companies.find((c) => c.id === company.id)!;
    expect(restoredCompany.robotIds).not.toContain(removedMemberId);
    const restoredRobot = restoredLocale.robots.find((r) => r.id === removedMemberId)!;
    expect(restoredRobot.companyId).not.toBe(company.id);
  });

  it('restores a user-created company, with its members\' companyId pointing back at it', () => {
    const localeId = setupWorld();
    spawnInitialRoster(localeId);
    spawnInitialCompanies(localeId);
    const someRobotId = useLocaleStore.getState().getLocaleById(localeId)!.robots[0].id;
    const userCompany: Company = { id: 'user-created-uuid-9999', name: 'Hand Built Crew', color: '#123456', robotIds: [someRobotId] };
    useLocaleStore.getState().addCompany(localeId, userCompany);
    useLocaleStore.getState().assignRobotToCompany(localeId, someRobotId, userCompany.id);
    const payload = buildSessionPayload();

    applySessionPayload({ ...payload, coordinates: { x: payload.coordinates.x + 500, y: payload.coordinates.y + 500 } });
    applySessionPayload(payload);

    const restoredLocale = currentLocale()!;
    const restoredCompany = restoredLocale.companies.find((c) => c.id === userCompany.id);
    expect(restoredCompany?.robotIds).toEqual([someRobotId]);
    const restoredRobot = restoredLocale.robots.find((r) => r.id === someRobotId);
    expect(restoredRobot?.companyId).toBe(userCompany.id);
  });

  it('the update object built from a robot override diff never also carries audioMode, job, docking, or batteryLevel', () => {
    // applySessionPayload's own retransmitWorld call triggers OTHER real updateRobot calls too
    // (initializeLocale's job assignment for the freshly regenerated roster) -- this isolates the
    // one call driven by THIS payload's own robotOverrides diff (identifiable by rhythmicDensity,
    // the field this test edited) from those unrelated ones, rather than asserting over every
    // updateRobot call made during the whole apply.
    const localeId = setupWorld();
    spawnInitialRoster(localeId);
    const robot = useLocaleStore.getState().getLocaleById(localeId)!.robots[0];
    useLocaleStore.getState().updateRobot(localeId, robot.id, { rhythmicDensity: 3 });
    const payload = buildSessionPayload();

    const updateSpy = vi.spyOn(useLocaleStore.getState(), 'updateRobot');
    applySessionPayload(payload);

    const diffDrivenCalls = updateSpy.mock.calls.filter((call) => call[2].rhythmicDensity !== undefined);
    expect(diffDrivenCalls.length).toBeGreaterThan(0); // sanity: the spy actually saw the diff-driven call
    for (const call of diffDrivenCalls) {
      const updates = call[2];
      expect(updates).not.toHaveProperty('audioMode');
      expect(updates).not.toHaveProperty('job');
      expect(updates).not.toHaveProperty('docking');
      expect(updates).not.toHaveProperty('batteryLevel');
    }
    updateSpy.mockRestore();
  });

  it('restores lfoBank/globalLfoLinks after a full save/wipe/load round trip', () => {
    const localeId = setupWorld();
    spawnInitialRoster(localeId);
    useAudioStore.setState((state) => ({
      lfoBank: { ...state.lfoBank, c: { shape: 'square', rate: 4, rateDrift: 0.3, depthDrift: -0.4 } },
    }));
    const payload = buildSessionPayload();

    applySessionPayload({ ...payload, coordinates: { x: payload.coordinates.x + 500, y: payload.coordinates.y + 500 } });
    applySessionPayload(payload);

    expect(useAudioStore.getState().lfoBank).toEqual(payload.lfoBank);
    expect(useAudioStore.getState().globalLfoLinks).toEqual(payload.globalLfoLinks);
  });

  it('restores a robot\'s changed lfoLinks target after a full save/wipe/load round trip (fixture seeds a non-default lane + depth)', () => {
    const localeId = setupWorld();
    spawnInitialRoster(localeId);
    const robot = useLocaleStore.getState().getLocaleById(localeId)!.robots[0];
    const current = robot.lfoLinks!['layer2.detune'];
    const changedLink: LfoLink = { lane: current.lane === 'c' ? 'd' : 'c', depth: (current.depth + 37) % 101 };
    useLocaleStore.getState().updateRobot(localeId, robot.id, { lfoLinks: { ...robot.lfoLinks, 'layer2.detune': changedLink } as Record<RobotLfoTargetId, LfoLink> });
    const payload = buildSessionPayload();
    expect(payload.robotOverrides[robot.id]?.lfoLinks).toEqual({ 'layer2.detune': changedLink });

    applySessionPayload({ ...payload, coordinates: { x: payload.coordinates.x + 500, y: payload.coordinates.y + 500 } });
    applySessionPayload(payload);

    const restoredRobot = currentLocale()!.robots.find((r) => r.id === robot.id)!;
    expect(restoredRobot.lfoLinks?.['layer2.detune']).toEqual(changedLink);
  });

  it('re-primes only the changed target via primeRobotLinks when applying a robot\'s lfoLinks diff', async () => {
    const robotLfoLinks = await import('../systems/robotLfoLinks');
    const localeId = setupWorld();
    spawnInitialRoster(localeId);
    const robot = useLocaleStore.getState().getLocaleById(localeId)!.robots[0];
    const current = robot.lfoLinks!['layer1.gain'];
    const changedLink: LfoLink = { lane: current.lane === 'a' ? 'b' : 'a', depth: (current.depth + 15) % 101 };
    useLocaleStore.getState().updateRobot(localeId, robot.id, { lfoLinks: { ...robot.lfoLinks, 'layer1.gain': changedLink } as Record<RobotLfoTargetId, LfoLink> });
    const payload = buildSessionPayload();
    const primeSpy = vi.spyOn(robotLfoLinks, 'primeRobotLinks').mockImplementation(() => {});

    applySessionPayload(payload, { skipLocaleRebuild: true });

    const callForRobot = primeSpy.mock.calls.find((call) => (call[0] as Robot).id === robot.id);
    expect(callForRobot?.[1]).toEqual(['layer1.gain']);
    primeSpy.mockRestore();
  });

  describe('pan across a session restore (Robot Pan T11)', () => {
    function manualRobotPayload(pan: number) {
      const localeId = setupWorld();
      spawnInitialRoster(localeId);
      const robot = useLocaleStore.getState().getLocaleById(localeId)!.robots[0];
      useLocaleStore.getState().updateRobot(localeId, robot.id, { panAuto: false, pan });
      return { localeId, robot, payload: buildSessionPayload() };
    }

    it('captures a manual robot as a pan key and nothing else', () => {
      const { robot, payload } = manualRobotPayload(0.4);
      expect(payload.robotOverrides[robot.id]).toEqual({ pan: 0.4 });
    });

    it('restores pan and switches Auto off, and primes the engine once with the stored value', () => {
      const { robot, payload } = manualRobotPayload(-0.25);
      const primeSpy = vi.spyOn(AudioEngine, 'updateRobotPan').mockImplementation(() => {});

      applySessionPayload({ ...payload, coordinates: { x: payload.coordinates.x + 500, y: payload.coordinates.y + 500 } });
      primeSpy.mockClear();
      applySessionPayload(payload);

      const restored = currentLocale()!.robots.find((r) => r.id === robot.id)!;
      expect(restored.pan).toBe(-0.25);
      expect(restored.panAuto).toBe(false);
      expect(primeSpy.mock.calls.filter((c) => c[0] === robot.id)).toEqual([[robot.id, -0.25]]);
      primeSpy.mockRestore();
    });

    it('a payload without pan leaves every robot on Auto and never primes a pan', () => {
      const localeId = setupWorld();
      spawnInitialRoster(localeId);
      const payload = buildSessionPayload();
      const primeSpy = vi.spyOn(AudioEngine, 'updateRobotPan').mockImplementation(() => {});

      applySessionPayload(payload, { skipLocaleRebuild: true });

      expect(currentLocale()!.robots.every((r) => r.panAuto === true && r.pan === 0)).toBe(true);
      expect(primeSpy).not.toHaveBeenCalled();
      primeSpy.mockRestore();
    });

    it('round-trips one manual robot among eleven Auto robots and writes no other override', () => {
      const { localeId, robot, payload } = manualRobotPayload(0.4);
      const roster = useLocaleStore.getState().getLocaleById(localeId)!.robots;
      expect(roster).toHaveLength(12);
      vi.spyOn(AudioEngine, 'updateRobotPan').mockImplementation(() => {});

      applySessionPayload({ ...payload, coordinates: { x: payload.coordinates.x + 500, y: payload.coordinates.y + 500 } });
      applySessionPayload(payload);

      const restored = currentLocale()!.robots;
      expect(restored.filter((r) => !r.panAuto).map((r) => [r.id, r.pan])).toEqual([[robot.id, 0.4]]);
      expect(buildSessionPayload().robotOverrides).toEqual({ [robot.id]: { pan: 0.4 } });
    });

    it('a hand-edited out-of-range pan is stored clamped and the engine is primed with the stored value', () => {
      const { robot, payload } = manualRobotPayload(0.4);
      const wild = { ...payload, robotOverrides: { [robot.id]: { pan: 7 } } };
      const primeSpy = vi.spyOn(AudioEngine, 'updateRobotPan').mockImplementation(() => {});

      applySessionPayload(wild, { skipLocaleRebuild: true });

      expect(currentLocale()!.robots.find((r) => r.id === robot.id)!.pan).toBe(1);
      expect(primeSpy).toHaveBeenCalledWith(robot.id, 1);
      primeSpy.mockRestore();
    });

    it('a non-finite pan is ignored: the robot stays Auto and nothing is primed', () => {
      const localeId = setupWorld();
      spawnInitialRoster(localeId);
      const robot = useLocaleStore.getState().getLocaleById(localeId)!.robots[0];
      const wild = { ...buildSessionPayload(), robotOverrides: { [robot.id]: { pan: Number.NaN } } };
      const primeSpy = vi.spyOn(AudioEngine, 'updateRobotPan').mockImplementation(() => {});

      applySessionPayload(wild, { skipLocaleRebuild: true });

      const restored = currentLocale()!.robots.find((r) => r.id === robot.id)!;
      expect(restored.panAuto).toBe(true);
      expect(primeSpy).not.toHaveBeenCalled();
      primeSpy.mockRestore();
    });
  });

  // docs/tasks/ROBOT_PERFORMANCE.md Task 15: dynamics / rests / accents are restored only when finite, key by key,
  // and the restore's existing regenerateMelody call re-stamps the restored rests / accents into the melody.
  describe('dynamics, rests and accents across a session restore (Robot Performance T15)', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    // Outside every seed range (dynamics 25–75, rests 10–60, accents 20–80), so no seeded robot can coincide.
    const TARGET = { dynamics: 90, rests: 70, accents: 90 };

    function seededWorld() {
      const localeId = setupWorld();
      spawnInitialRoster(localeId);
      const robots = useLocaleStore.getState().getLocaleById(localeId)!.robots;
      return { localeId, robot: robots[0], robots };
    }
    const stored = (id: string) => currentLocale()!.robots.find((r) => r.id === id)!;
    const shifted = (payload: SessionPayload): SessionPayload => ({ ...payload, coordinates: { x: payload.coordinates.x + 500, y: payload.coordinates.y + 500 } });
    const stripIds = (melody: Robot['melody']) => melody.map(({ id: _id, ...rest }) => rest);
    /** What regenerateMelody produces for this stored robot: its seeded notes with its own rests / accents stamped on. */
    function expectedMelody(robot: Robot) {
      const rand = buildSeededComposition(robot.compositionSeed, {
        rhythmicDensity: robot.rhythmicDensity!,
        rhythmicMotifLength: robot.rhythmicMotifLength ?? DEFAULT_RHYTHMIC_MOTIF_LENGTH,
        noteVariance: robot.noteVariance ?? DEFAULT_NOTE_VARIANCE,
        pitchRepeat: robot.pitchRepeat ?? DEFAULT_PITCH_REPEAT,
        octaveRange: robot.octaveRange,
      });
      return applyPerformanceMarks(
        generateMelodyForRobot({
          octaveMin: robot.octaveRange[0],
          octaveMax: robot.octaveRange[1],
          rhythmicDensity: robot.rhythmicDensity!,
          rhythmicMotifLength: robot.rhythmicMotifLength ?? DEFAULT_RHYTHMIC_MOTIF_LENGTH,
          noteVariance: robot.noteVariance ?? DEFAULT_NOTE_VARIANCE,
          pitchRepeat: robot.pitchRepeat ?? DEFAULT_PITCH_REPEAT,
          rand,
        }),
        { rests: robot.rests ?? DEFAULT_RESTS, accents: robot.accents ?? DEFAULT_ACCENTS },
        buildSeededPerformance(robot.compositionSeed),
      );
    }

    it('an untouched world captures none of the three keys', () => {
      seededWorld();
      expect(Object.keys(buildSessionPayload().robotOverrides)).toEqual([]);
    });

    it('captures one edited robot as exactly its three keys', () => {
      const { localeId, robot } = seededWorld();
      useLocaleStore.getState().updateRobot(localeId, robot.id, TARGET);
      expect(buildSessionPayload().robotOverrides).toEqual({ [robot.id]: TARGET });
    });

    it('restores the three fields after a full save/wipe/load round trip, and the registered melody carries the restored marks', () => {
      const { localeId, robot } = seededWorld();
      useLocaleStore.getState().updateRobot(localeId, robot.id, TARGET);
      const payload = buildSessionPayload();
      const register = vi.spyOn(AudioEngine, 'registerRobotMelody');

      applySessionPayload(shifted(payload));
      register.mockClear();
      applySessionPayload(payload);

      const restored = stored(robot.id);
      expect(restored).toMatchObject(TARGET);
      expect(stripIds(restored.melody)).toEqual(stripIds(expectedMelody(restored)));
      const mine = register.mock.calls.filter((c) => c[0] === robot.id);
      expect(mine.length).toBeGreaterThan(0);
      expect(stripIds(mine[mine.length - 1][1])).toEqual(stripIds(expectedMelody(restored)));
      expect(restored.melody.some((e) => e.rest || e.mark), 'the restored marks are visible in the melody').toBe(true);
    });

    it('a payload without the keys leaves every robot at its seeded values', () => {
      const { robots } = seededWorld();
      const seeds = Object.fromEntries(robots.map((r) => [r.id, [r.dynamics, r.rests, r.accents]]));
      const payload = buildSessionPayload();

      applySessionPayload(shifted(payload));
      applySessionPayload(payload);

      for (const r of currentLocale()!.robots) expect([r.dynamics, r.rests, r.accents]).toEqual(seeds[r.id]);
    });

    it('drops rests: NaN and accents: "x" whole, key by key, while a finite dynamics beside them still lands', () => {
      const { robot } = seededWorld();
      const payload = buildSessionPayload();
      const bad = {
        ...payload,
        robotOverrides: { [robot.id]: { dynamics: 90, rests: NaN, accents: 'x' } },
      } as unknown as SessionPayload;

      applySessionPayload(shifted(payload));
      applySessionPayload(bad);

      const restored = stored(robot.id);
      expect(restored.dynamics).toBe(90);
      expect(restored.rests).toBe(robot.rests);
      expect(restored.accents).toBe(robot.accents);
    });

    it('drops a non-finite dynamics (Infinity) and a non-number rests whole', () => {
      const { robot } = seededWorld();
      const payload = buildSessionPayload();
      const bad = {
        ...payload,
        robotOverrides: { [robot.id]: { dynamics: Infinity, rests: '30' } },
      } as unknown as SessionPayload;

      applySessionPayload(shifted(payload));
      applySessionPayload(bad);

      const restored = stored(robot.id);
      expect(restored.dynamics).toBe(robot.dynamics);
      expect(restored.rests).toBe(robot.rests);
    });
  });

  // docs/tasks/ROBOT_PERFORMANCE.md Task 15: humanize is captured beside swellDuration and restored through
  // audioStore.setHumanize, which is the one path that pushes it to the engine.
  describe('humanize across a session restore (Robot Performance T15)', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('captures audioStore.humanize', () => {
      const localeId = setupWorld();
      spawnInitialRoster(localeId);
      useAudioStore.getState().setHumanize(12);

      expect(buildSessionPayload().humanize).toBe(12);
    });

    it('restores humanize: 12 through setHumanize, so AudioEngine.setHumanize(12) is pushed too', () => {
      const localeId = setupWorld();
      spawnInitialRoster(localeId);
      useAudioStore.getState().setHumanize(12);
      const payload = buildSessionPayload();
      useAudioStore.getState().setHumanize(3);
      const push = vi.spyOn(AudioEngine, 'setHumanize');

      applySessionPayload(payload);

      expect(useAudioStore.getState().humanize).toBe(12);
      expect(push).toHaveBeenCalledWith(12);
    });

    it('leaves the current humanize untouched when an older payload lacks the field', () => {
      const localeId = setupWorld();
      spawnInitialRoster(localeId);
      const { humanize: _hm, ...oldShapePayload } = buildSessionPayload();
      useAudioStore.getState().setHumanize(7);
      const push = vi.spyOn(AudioEngine, 'setHumanize');

      applySessionPayload(oldShapePayload as SessionPayload);

      expect(useAudioStore.getState().humanize).toBe(7);
      expect(push).not.toHaveBeenCalled();
    });
  });

  describe('sends across a session restore (Robot Sends T15)', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    function seededWorld() {
      const localeId = setupWorld();
      spawnInitialRoster(localeId);
      const robots = useLocaleStore.getState().getLocaleById(localeId)!.robots;
      return { localeId, robot: robots[0], robots };
    }
    const stored = (id: string) => currentLocale()!.robots.find((r) => r.id === id)!;
    const spyPrime = () => vi.spyOn(AudioEngine, 'updateRobotSends').mockImplementation(() => {});
    const shifted = (payload: SessionPayload): SessionPayload => ({ ...payload, coordinates: { x: payload.coordinates.x + 500, y: payload.coordinates.y + 500 } });

    it('an untouched world captures no send key at all', () => {
      seededWorld();
      const overrides = buildSessionPayload().robotOverrides;
      expect(Object.keys(overrides)).toEqual([]);
    });

    it('captures one moved robot as its send alone, at two decimals', () => {
      const { localeId, robot } = seededWorld();
      const target = robot.reverbSend === 0.35 ? 0.36 : 0.35;
      useLocaleStore.getState().updateRobot(localeId, robot.id, { reverbSend: target });
      expect(buildSessionPayload().robotOverrides).toEqual({ [robot.id]: { reverbSend: target } });
    });

    it('a session saved mid-swell stores the base send, not the interpolated one', () => {
      const { localeId, robots } = seededWorld();
      useAudioStore.setState({ swellFrequency: 16, swellDuration: 15, pingVarianceAutomation: 1 });
      const byX = new Map<number, number>([
        [precomputeDataX('audioSwell.trigger.robot'), -1], // the robot pool fires
        [precomputeDataX('audioSwell.company.chance'), 1], // a single-robot swell
        [precomputeDataX('audioSwell.target.robot'), 1], // the last eligible pair
        [precomputeDataX('audioSwell.trigger.global'), 1], // the global pool stays quiet
      ]);
      const noise = vi.spyOn(noiseMaps, 'getAttenuationStyleNoiseMap').mockReturnValue(((x: number) => byX.get(x) ?? 0) as never);
      try {
        tickAudioSwells(localeId, 0);
        const swell = getActiveSwellSnapshot('robot').find((s) => s.robotAttribute === 'reverbSend' || s.robotAttribute === 'delaySend')!;
        expect(swell, 'the forced start landed on a send').toBeDefined();
        const member = swell.members![0];
        const field = swell.robotAttribute as 'reverbSend' | 'delaySend';
        tickAudioSwells(localeId, 2);
        const liveValue = stored(member.robotId)[field];
        expect(Math.abs(liveValue - member.baseValue)).toBeGreaterThan(0.01); // precondition: it really is mid-ramp
        expect(robots.some((r) => r.id === member.robotId)).toBe(true);

        const payload = buildSessionPayload();

        expect(payload.robotOverrides[member.robotId]?.[field]).toBeUndefined(); // base = seed, so nothing is saved
      } finally {
        noise.mockRestore();
      }
    });

    // The world rebuild first hands every freshly reserved voice its SEEDED sends (both keys), then the restore primes
    // the one send the diff carried: that is the last word for the robot, and the only call with just one key.
    it('restores a moved send after a full save/wipe/load round trip, priming the carried key last and only once', () => {
      const { localeId, robot } = seededWorld();
      const target = robot.reverbSend === 0.35 ? 0.36 : 0.35;
      useLocaleStore.getState().updateRobot(localeId, robot.id, { reverbSend: target });
      const payload = buildSessionPayload();
      const prime = spyPrime();

      applySessionPayload(shifted(payload));
      prime.mockClear();
      applySessionPayload(payload);

      expect(stored(robot.id).reverbSend).toBe(target);
      expect(stored(robot.id).delaySend).toBe(robot.delaySend);
      const mine = prime.mock.calls.filter((c) => c[0] === robot.id);
      expect(mine[mine.length - 1]).toEqual([robot.id, { reverb: target }]);
      expect(mine.filter((c) => Object.keys(c[1]).length === 1)).toHaveLength(1);
    });

    it('round-trips one moved robot among eleven untouched ones, every other robot back at its seed', () => {
      const { localeId, robot, robots } = seededWorld();
      expect(robots).toHaveLength(12);
      const seeds = Object.fromEntries(robots.map((r) => [r.id, [r.reverbSend, r.delaySend]]));
      useLocaleStore.getState().updateRobot(localeId, robot.id, { delaySend: robot.delaySend === 0.8 ? 0.7 : 0.8 });
      const payload = buildSessionPayload();
      spyPrime();

      applySessionPayload(shifted(payload));
      applySessionPayload(payload);

      for (const r of currentLocale()!.robots) {
        if (r.id === robot.id) expect(r.delaySend).toBe(robot.delaySend === 0.8 ? 0.7 : 0.8);
        else expect([r.reverbSend, r.delaySend]).toEqual(seeds[r.id]);
      }
      expect(Object.keys(buildSessionPayload().robotOverrides)).toEqual([robot.id]);
    });

    it('restoring { delaySend: 0 } sets the field and primes { delay: 0 }', () => {
      const { localeId, robot } = seededWorld();
      useLocaleStore.getState().updateRobot(localeId, robot.id, { delaySend: 0.4 });
      const prime = spyPrime();

      applySessionPayload({ ...buildSessionPayload(), robotOverrides: { [robot.id]: { delaySend: 0 } } }, { skipLocaleRebuild: true });

      expect(stored(robot.id).delaySend).toBe(0);
      expect(prime).toHaveBeenCalledWith(robot.id, { delay: 0 });
    });

    it('restoring { reverbSend: 1 } (the top of the range) is accepted', () => {
      const { robot } = seededWorld();
      const prime = spyPrime();

      applySessionPayload({ ...buildSessionPayload(), robotOverrides: { [robot.id]: { reverbSend: 1 } } }, { skipLocaleRebuild: true });

      expect(stored(robot.id).reverbSend).toBe(1);
      expect(prime).toHaveBeenCalledWith(robot.id, { reverb: 1 });
    });

    it('both keys prime together in one call', () => {
      const { robot } = seededWorld();
      const prime = spyPrime();

      applySessionPayload({ ...buildSessionPayload(), robotOverrides: { [robot.id]: { reverbSend: 0.2, delaySend: 0.6 } } }, { skipLocaleRebuild: true });

      expect(prime.mock.calls.filter((c) => c[0] === robot.id)).toEqual([[robot.id, { reverb: 0.2, delay: 0.6 }]]);
    });

    it('a payload with no send key leaves the seeded values and makes no prime call', () => {
      const { robots } = seededWorld();
      const seeds = robots.map((r) => [r.id, r.reverbSend, r.delaySend]);
      const prime = spyPrime();

      applySessionPayload(buildSessionPayload(), { skipLocaleRebuild: true });

      expect(currentLocale()!.robots.map((r) => [r.id, r.reverbSend, r.delaySend])).toEqual(seeds);
      expect(prime).not.toHaveBeenCalled();
    });

    it('a diff carrying other keys but no send does not prime the sends', () => {
      const { robot } = seededWorld();
      const prime = spyPrime();

      applySessionPayload({ ...buildSessionPayload(), robotOverrides: { [robot.id]: { rhythmicDensity: 33 } } }, { skipLocaleRebuild: true });

      expect(stored(robot.id).rhythmicDensity).toBe(33);
      expect(prime).not.toHaveBeenCalled();
    });

    it.each([
      ['NaN', Number.NaN],
      ['Infinity', Number.POSITIVE_INFINITY],
      ['a string', 'loud'],
      ['null', null],
      ['below the range', -0.1],
      ['above the range', 1.5],
      ['far above the range', 7],
    ])('a hand-edited reverbSend that is %s is ignored whole: the seeded value stays and nothing is primed', (_name, wild) => {
      const { robot } = seededWorld();
      const prime = spyPrime();

      applySessionPayload({ ...buildSessionPayload(), robotOverrides: { [robot.id]: { reverbSend: wild as number } } }, { skipLocaleRebuild: true });

      expect(stored(robot.id).reverbSend).toBe(robot.reverbSend);
      expect(prime).not.toHaveBeenCalled();
    });

    it('a bad delaySend does not cost the valid reverbSend or another field beside it', () => {
      const { robot } = seededWorld();
      const prime = spyPrime();

      applySessionPayload(
        { ...buildSessionPayload(), robotOverrides: { [robot.id]: { reverbSend: 0.25, delaySend: 9, rhythmicDensity: 21 } } },
        { skipLocaleRebuild: true },
      );

      expect(stored(robot.id)).toMatchObject({ reverbSend: 0.25, delaySend: robot.delaySend, rhythmicDensity: 21 });
      expect(prime).toHaveBeenCalledTimes(1);
      expect(prime).toHaveBeenCalledWith(robot.id, { reverb: 0.25 });
    });

    it('a robot id in the payload that is not in the roster is skipped without a prime', () => {
      seededWorld();
      const prime = spyPrime();

      expect(() => applySessionPayload({ ...buildSessionPayload(), robotOverrides: { 'no-such-robot': { reverbSend: 0.5 } } }, { skipLocaleRebuild: true })).not.toThrow();
      expect(prime).not.toHaveBeenCalled();
    });
  });

  describe('articulation across a session restore (Robot Articulation T11)', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    const EDIT = {
      portamento: 0.2,
      filterQ: 4,
      filterType: 'bandpass' as const,
    };

    function articulatedWorld() {
      const localeId = setupWorld();
      spawnInitialRoster(localeId);
      const robot = useLocaleStore.getState().getLocaleById(localeId)!.robots[0];
      const seeded = robot.audioAttributes;
      useLocaleStore.getState().updateRobot(localeId, robot.id, {
        audioAttributes: { ...seeded, ...EDIT, adsr: { ...seeded.adsr, attackCurve: 'sine' } },
      });
      return { localeId, robot, seeded, payload: buildSessionPayload() };
    }

    function spyEngine() {
      return {
        bus: vi.spyOn(AudioEngine, 'updateRobotBusFilter').mockImplementation(() => {}),
        glide: vi.spyOn(AudioEngine, 'updateVoicePortamento').mockImplementation(() => {}),
      };
    }

    function restoredAttrs(robotId: string) {
      return currentLocale()!.robots.find((r) => r.id === robotId)!.audioAttributes;
    }

    function elsewhere(payload: SessionPayload): SessionPayload {
      return { ...payload, coordinates: { x: payload.coordinates.x + 500, y: payload.coordinates.y + 500 } };
    }

    it('captures an edited robot as adsr + portamento + filterQ + filterType and nothing else', () => {
      const { robot, seeded, payload } = articulatedWorld();
      expect(payload.robotOverrides[robot.id]).toEqual({
        adsr: { ...seeded.adsr, attackCurve: 'sine' },
        ...EDIT,
      });
    });

    it('restores the fields and primes the engine with the bus filter Q and type and the portamento', () => {
      const { robot, seeded, payload } = articulatedWorld();
      const { bus, glide } = spyEngine();

      applySessionPayload(elsewhere(payload));
      bus.mockClear();
      glide.mockClear();
      applySessionPayload(payload);

      const attrs = restoredAttrs(robot.id);
      expect(attrs.portamento).toBe(0.2);
      expect(attrs.filterQ).toBe(4);
      expect(attrs.filterType).toBe('bandpass');
      expect(attrs.adsr).toEqual({ ...seeded.adsr, attackCurve: 'sine' });
      expect(bus.mock.calls.filter((c) => c[0] === robot.id)).toEqual([[robot.id, { Q: 4, type: 'bandpass' }]]);
      expect(glide.mock.calls.filter((c) => c[0] === robot.id)).toEqual([[robot.id, 0.2]]);
      bus.mockRestore();
      glide.mockRestore();
    });

    it('round-trips: the restored world re-saves to the same single override', () => {
      const { robot, payload } = articulatedWorld();
      spyEngine();

      applySessionPayload(elsewhere(payload));
      applySessionPayload(payload);

      expect(buildSessionPayload().robotOverrides).toEqual({ [robot.id]: payload.robotOverrides[robot.id] });
    });

    it('a payload without the keys leaves the seeded values alone and primes nothing', () => {
      const localeId = setupWorld();
      spawnInitialRoster(localeId);
      const before = useLocaleStore.getState().getLocaleById(localeId)!.robots.map((r) => r.audioAttributes);
      const payload = buildSessionPayload();
      const { bus, glide } = spyEngine();

      applySessionPayload(payload, { skipLocaleRebuild: true });

      const after = currentLocale()!.robots.map((r) => r.audioAttributes);
      expect(after.map((a) => [a.portamento, a.filterQ, a.filterType])).toEqual(
        before.map((a) => [a.portamento, a.filterQ, a.filterType]),
      );
      expect(bus).not.toHaveBeenCalled();
      expect(glide).not.toHaveBeenCalled();
      bus.mockRestore();
      glide.mockRestore();
    });

    it('restores a portamento of exactly 0 and primes it: a falsy recorded value is still a value', () => {
      const { robot, payload } = articulatedWorld();
      const wild = { ...payload, robotOverrides: { [robot.id]: { portamento: 0 } } };
      const { glide } = spyEngine();

      applySessionPayload(wild, { skipLocaleRebuild: true });

      expect(restoredAttrs(robot.id).portamento).toBe(0);
      expect(glide).toHaveBeenCalledWith(robot.id, 0);
      glide.mockRestore();
    });

    it('primes only the bus keys the payload carries', () => {
      const { robot, payload } = articulatedWorld();
      const { bus, glide } = spyEngine();

      applySessionPayload({ ...payload, robotOverrides: { [robot.id]: { filterQ: 7 } } }, { skipLocaleRebuild: true });
      expect(bus.mock.calls.filter((c) => c[0] === robot.id)).toEqual([[robot.id, { Q: 7 }]]);
      bus.mockClear();

      applySessionPayload({ ...payload, robotOverrides: { [robot.id]: { filterType: 'highpass' } } }, { skipLocaleRebuild: true });
      expect(bus.mock.calls.filter((c) => c[0] === robot.id)).toEqual([[robot.id, { type: 'highpass' }]]);
      expect(glide).not.toHaveBeenCalled();
      bus.mockRestore();
      glide.mockRestore();
    });

    it('drops an unlisted filterType and restores the rest of the diff', () => {
      const { robot, payload } = articulatedWorld();
      const hostile = { ...payload, robotOverrides: { [robot.id]: { filterType: 'notch', filterQ: 6, portamento: 0.1 } } };
      const { bus } = spyEngine();

      applySessionPayload(hostile as unknown as SessionPayload, { skipLocaleRebuild: true });

      const attrs = restoredAttrs(robot.id);
      expect(attrs.filterQ).toBe(6);
      expect(attrs.portamento).toBe(0.1);
      expect(attrs.filterType).toBe(EDIT.filterType);
      expect(bus.mock.calls.filter((c) => c[0] === robot.id)).toEqual([[robot.id, { Q: 6 }]]);
      bus.mockRestore();
    });

    it('drops an unlisted attackCurve and restores the rest of the adsr, keeping a valid releaseCurve', () => {
      const { robot, payload } = articulatedWorld();
      const adsr = { attack: 0.5, decay: 0.25, sustain: 0.6, release: 0.75, attackCurve: 'zigzag', releaseCurve: 'ripple' };
      const hostile = { ...payload, robotOverrides: { [robot.id]: { adsr } } };
      spyEngine();

      applySessionPayload(hostile as unknown as SessionPayload, { skipLocaleRebuild: true });

      const restored = restoredAttrs(robot.id).adsr;
      expect(restored).toEqual({ attack: 0.5, decay: 0.25, sustain: 0.6, release: 0.75, releaseCurve: 'ripple' });
      expect(restored).not.toHaveProperty('attackCurve');
      expect(restoredAttrs(robot.id).filterQ).toBe(EDIT.filterQ);
    });

    it('drops a non-finite or non-numeric portamento and filterQ, and primes nothing for them', () => {
      for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, null, 'x']) {
        const { robot, seeded, payload } = articulatedWorld();
        const hostile = { ...payload, robotOverrides: { [robot.id]: { portamento: bad, filterQ: bad } } };
        const { bus, glide } = spyEngine();

        applySessionPayload(hostile as unknown as SessionPayload, { skipLocaleRebuild: true });

        const attrs = restoredAttrs(robot.id);
        expect(attrs.portamento).toBe(EDIT.portamento);
        expect(attrs.filterQ).toBe(EDIT.filterQ);
        expect(seeded.portamento).not.toBe(EDIT.portamento);
        expect(bus).not.toHaveBeenCalled();
        expect(glide).not.toHaveBeenCalled();
        bus.mockRestore();
        glide.mockRestore();
      }
    });
  });

  it('when the audio context is running, pushes lfoBank/globalLfoLinks through replaceLfoBankLane/setGlobalLfoLink so a loaded session is audible without a power cycle', async () => {
    const lfoShared = await import('../engine/lfoShared');
    const localeId = setupWorld();
    spawnInitialRoster(localeId);
    const payload = buildSessionPayload();
    const runningSpy = vi.spyOn(lfoShared, 'isAudioContextRunning').mockReturnValue(true);
    const replaceLaneSpy = vi.spyOn(useAudioStore.getState(), 'replaceLfoBankLane');
    const setLfoBankSpy = vi.spyOn(useAudioStore.getState(), 'setLfoBank');
    const setGlobalLfoLinkSpy = vi.spyOn(useAudioStore.getState(), 'setGlobalLfoLink');

    applySessionPayload(payload, { skipLocaleRebuild: true });

    expect(replaceLaneSpy.mock.calls.map((call) => call[0]).sort()).toEqual([...LFO_LANE_IDS].sort());
    // A per-lane setLfoBank merge cannot delete a stale `sync` key, so the restore must not use it.
    expect(setLfoBankSpy).not.toHaveBeenCalled();
    expect(setGlobalLfoLinkSpy).toHaveBeenCalled();
    runningSpy.mockRestore();
    replaceLaneSpy.mockRestore();
    setLfoBankSpy.mockRestore();
    setGlobalLfoLinkSpy.mockRestore();
  });

  // docs/specs/FREE_SYNC_TOGGLE.md assumption 6, Task 5: the restore REPLACES each lane. A merge
  // would let a Free lane in the loaded session inherit the live lane's stale `sync`.
  describe('lane Sync across a session restore', () => {
    const QUARTER = { division: '1/4', modifier: 'straight' } as const;
    const FREE_A = { shape: 'sine', rate: 1.5, rateDrift: 0, depthDrift: 0 } as const;

    /** Live lane `a` synced; the payload carries lane `a` Free (and the given extra lane overrides). */
    function setupStaleSync(extraLanes: Record<string, unknown> = {}) {
      const localeId = setupWorld();
      spawnInitialRoster(localeId);
      const payload = buildSessionPayload();
      const lfoBank = { ...payload.lfoBank!, a: { ...FREE_A }, ...extraLanes } as typeof payload.lfoBank;
      useAudioStore.setState({ lfoBank: { ...useAudioStore.getState().lfoBank, a: { ...FREE_A, rate: 9, sync: QUARTER } } });
      return { ...payload, lfoBank };
    }

    it('a Free lane in the payload leaves no stale `sync` on a live synced lane, when the audio context is running', async () => {
      const lfoShared = await import('../engine/lfoShared');
      const payload = setupStaleSync();
      const runningSpy = vi.spyOn(lfoShared, 'isAudioContextRunning').mockReturnValue(true);

      applySessionPayload(payload, { skipLocaleRebuild: true });

      expect('sync' in useAudioStore.getState().lfoBank.a).toBe(false);
      expect(useAudioStore.getState().lfoBank.a).toEqual(FREE_A);
      runningSpy.mockRestore();
    });

    it('a Free lane in the payload leaves no stale `sync` when the audio context is not running either (whole setState)', async () => {
      const lfoShared = await import('../engine/lfoShared');
      const payload = setupStaleSync();
      const runningSpy = vi.spyOn(lfoShared, 'isAudioContextRunning').mockReturnValue(false);

      applySessionPayload(payload, { skipLocaleRebuild: true });

      expect('sync' in useAudioStore.getState().lfoBank.a).toBe(false);
      runningSpy.mockRestore();
    });

    it('the engine receives the Free rate, not the stale synced Hz, after the restore', async () => {
      const lfoShared = await import('../engine/lfoShared');
      const payload = setupStaleSync();
      const runningSpy = vi.spyOn(lfoShared, 'isAudioContextRunning').mockReturnValue(true);
      lfoEngine.setBankRate('a', 8); // the engine's module state outlives each test -- start from a value the restore must overwrite

      applySessionPayload(payload, { skipLocaleRebuild: true });

      expect(lfoEngine.getBankSettings('a').rate).toBe(1.5);
      runningSpy.mockRestore();
    });

    it('a synced lane in the payload restores with its note and reaches the engine as that note\'s Hz at the payload\'s own tempo', async () => {
      const lfoShared = await import('../engine/lfoShared');
      const payload = setupStaleSync({ b: { shape: 'triangle', rate: 7, rateDrift: 0.2, depthDrift: 0.1, sync: QUARTER } });
      const runningSpy = vi.spyOn(lfoShared, 'isAudioContextRunning').mockReturnValue(true);
      lfoEngine.setBankRate('b', 3); // start from a value the restore must overwrite

      applySessionPayload({ ...payload, bpm: 90 }, { skipLocaleRebuild: true });

      expect(useAudioStore.getState().lfoBank.b.sync).toEqual(QUARTER);
      expect(lfoEngine.getBankSettings('b').rate).toBeCloseTo(noteValueHz(QUARTER, 90), 10); // 1.5 Hz, not the stored 7
      runningSpy.mockRestore();
    });
  });

  // docs/specs/FREE_SYNC_TOGGLE.md §1.3, §1.8, Task 11: a restored Delay reaches the node as seconds,
  // resolved at the payload's own tempo — never the stored Free delayTime under a `sync`, and never
  // the tempo the live world happened to be at a moment before the payload's bpm lands.
  describe('Delay Sync across a session restore', () => {
    const QUARTER = { division: '1/4', modifier: 'straight' } as const;

    function payloadWithDelay(delay: Record<string, unknown>, bpm: number | undefined) {
      const localeId = setupWorld();
      spawnInitialRoster(localeId);
      const payload = buildSessionPayload();
      return { ...payload, bpm, globalAudio: { ...payload.globalAudio, delay: delay as never } };
    }

    it('pushes a synced Delay as that note\'s seconds at the payload\'s tempo — 1/4 at 120 BPM is 0.5 s, not the stored 3', async () => {
      const payload = payloadWithDelay({ delayTime: 3, feedback: 0.3, wet: 0.2, sync: QUARTER }, 120);
      useAudioStore.setState({ bpm: 60 }); // the live tempo differs: the payload's must win
      const pushSpy = vi.spyOn(AudioEngine, 'setGlobalDelay');

      applySessionPayload(payload, { skipLocaleRebuild: true });

      const pushed = pushSpy.mock.calls.map((call) => call[0]);
      expect(pushed.at(-1)).toStrictEqual({ delayTime: 0.5 });
      pushSpy.mockRestore();
    });

    it('never pushes a `sync` key to the engine, and never the stale stored delayTime at the end', async () => {
      const payload = payloadWithDelay({ delayTime: 3, feedback: 0.3, wet: 0.2, sync: QUARTER }, 60);
      const pushSpy = vi.spyOn(AudioEngine, 'setGlobalDelay');

      applySessionPayload(payload, { skipLocaleRebuild: true });

      for (const [params] of pushSpy.mock.calls) expect('sync' in params).toBe(false);
      expect(pushSpy.mock.calls.at(-1)![0].delayTime).toBe(1);
      pushSpy.mockRestore();
    });

    it('keeps the note in state, so the next tempo change re-resolves it', async () => {
      const payload = payloadWithDelay({ delayTime: 3, feedback: 0.3, wet: 0.2, sync: QUARTER }, 120);

      applySessionPayload(payload, { skipLocaleRebuild: true });

      expect(useAudioStore.getState().globalAudio.delay.sync).toEqual(QUARTER);
      const pushSpy = vi.spyOn(AudioEngine, 'setGlobalDelay');
      useAudioStore.getState().setBPM(60);
      expect(pushSpy.mock.calls.at(-1)![0]).toStrictEqual({ delayTime: 1 });
      pushSpy.mockRestore();
    });

    it('a payload with no bpm resolves at the tempo the world is at', async () => {
      const payload = payloadWithDelay({ delayTime: 3, feedback: 0.3, wet: 0.2, sync: QUARTER }, undefined);
      useAudioStore.setState({ bpm: 90 });
      const pushSpy = vi.spyOn(AudioEngine, 'setGlobalDelay');

      applySessionPayload(payload, { skipLocaleRebuild: true });

      expect(pushSpy.mock.calls.at(-1)![0].delayTime).toBeCloseTo(60 / 90, 10);
      pushSpy.mockRestore();
    });

    it('a Free Delay in the payload reaches the engine as its stored delayTime', async () => {
      const payload = payloadWithDelay({ delayTime: 3, feedback: 0.3, wet: 0.2 }, 120);
      const pushSpy = vi.spyOn(AudioEngine, 'setGlobalDelay');

      applySessionPayload(payload, { skipLocaleRebuild: true });

      expect(pushSpy.mock.calls.at(-1)![0]).toStrictEqual({ delayTime: 3, feedback: 0.3, wet: 0.2 });
      pushSpy.mockRestore();
    });
  });

  // docs/specs/FREE_SYNC_TOGGLE.md §1.8, Task 14: a `sync` that is not a real note (a hand-edited save,
  // a corrupt share link, a future format) must not reach state — the resolvers would treat it as
  // Free for audio, but the toggle would read it, the next save would re-persist it, and a UI
  // switch would show a state the audio isn't in. Dropped at the one restore boundary instead.
  describe('Sync sanitisers at the restore boundary', () => {
    const QUARTER = { division: '1/4', modifier: 'straight' } as const;
    const FREE_LANE = { shape: 'sine', rate: 1.5, rateDrift: 0, depthDrift: 0 } as const;
    const FREE_DELAY = { delayTime: 0.4, feedback: 0.3, wet: 0.2 } as const;
    const INVALID_SYNCS: Array<[string, unknown]> = [
      ['an unknown division', { division: '1/3', modifier: 'straight' }],
      ['a modifier the division does not offer (2 bars dotted)', { division: '2', modifier: 'dotted' }],
      ['the string "off"', 'off'],
      ['null', null],
      ['an explicit undefined', undefined],
      ['a number', 7],
      ['a slash-form string', '1/4'],
      ['an array', ['1/4', 'straight']],
      ['a missing modifier', { division: '1/4' }],
      ['an extra key', { division: '1/4', modifier: 'straight', extra: 1 }],
      ['an empty object', {}],
    ];
    // Distinct per-lane rates so a lane can never match another's value by coincidence.
    const STORED_RATES = { a: 1.5, b: 2, c: 3, d: 5 } as const;

    /** A payload whose four lanes and Delay are exactly what the caller says — never the random seed. */
    function buildPayload(lanes: Record<string, unknown>, delay: Record<string, unknown>, bpm?: number): SessionPayload {
      const localeId = setupWorld();
      spawnInitialRoster(localeId);
      const payload = buildSessionPayload();
      return {
        ...payload,
        bpm,
        lfoBank: lanes as SessionPayload['lfoBank'],
        globalAudio: { ...payload.globalAudio, delay: delay as never },
      };
    }

    const allLanes = (lane: Record<string, unknown>) => ({ a: { ...lane }, b: { ...lane }, c: { ...lane }, d: { ...lane } });
    const freeLanes = () =>
      Object.fromEntries(LFO_LANE_IDS.map((l) => [l, { ...FREE_LANE, rate: STORED_RATES[l] }])) as Record<string, unknown>;

    async function notRunning() {
      const lfoShared = await import('../engine/lfoShared');
      return vi.spyOn(lfoShared, 'isAudioContextRunning').mockReturnValue(false);
    }
    async function running() {
      const lfoShared = await import('../engine/lfoShared');
      return vi.spyOn(lfoShared, 'isAudioContextRunning').mockReturnValue(true);
    }

    describe('a lane', () => {
      it.each(INVALID_SYNCS)('with %s applies as Free: no `sync` key left in state (context not running)', async (_label, bad) => {
        const payload = buildPayload({ ...freeLanes(), a: { ...FREE_LANE, sync: bad } }, FREE_DELAY);
        const spy = await notRunning();

        applySessionPayload(payload, { skipLocaleRebuild: true });

        expect(useAudioStore.getState().lfoBank.a).toStrictEqual(FREE_LANE);
        spy.mockRestore();
      });

      it.each(INVALID_SYNCS)('with %s applies as Free: no `sync` key in state, engine plays the stored rate (context running)', async (_label, bad) => {
        const payload = buildPayload({ ...freeLanes(), a: { ...FREE_LANE, sync: bad } }, FREE_DELAY);
        const spy = await running();
        lfoEngine.setBankRate('a', 8); // the engine's state outlives each test -- start from a value the restore must overwrite

        applySessionPayload(payload, { skipLocaleRebuild: true });

        expect(useAudioStore.getState().lfoBank.a).toStrictEqual(FREE_LANE);
        expect(lfoEngine.getBankSettings('a').rate).toBe(1.5);
        spy.mockRestore();
      });

      it('is sanitised on every lane, not just the first', async () => {
        const bad = { division: '1/3', modifier: 'straight' };
        const payload = buildPayload(allLanes({ ...FREE_LANE, sync: bad }), FREE_DELAY);
        const spy = await notRunning();

        applySessionPayload(payload, { skipLocaleRebuild: true });

        for (const lane of LFO_LANE_IDS) expect(useAudioStore.getState().lfoBank[lane], lane).toStrictEqual(FREE_LANE);
        spy.mockRestore();
      });

      it('keeps a valid `sync` exactly as it came — the sanitiser drops only what is not a note', async () => {
        const payload = buildPayload({ ...freeLanes(), b: { ...FREE_LANE, rate: 7, sync: QUARTER } }, FREE_DELAY);
        const spy = await notRunning();

        applySessionPayload(payload, { skipLocaleRebuild: true });

        expect(useAudioStore.getState().lfoBank.b).toStrictEqual({ ...FREE_LANE, rate: 7, sync: QUARTER });
        spy.mockRestore();
      });

      it('keeps the rest of an invalid-synced lane intact — shape, rate and both drifts survive', async () => {
        const lane = { shape: 'triangle', rate: 3.25, rateDrift: 0.4, depthDrift: -0.3, sync: 'off' };
        const payload = buildPayload({ ...freeLanes(), c: lane }, FREE_DELAY);
        const spy = await notRunning();

        applySessionPayload(payload, { skipLocaleRebuild: true });

        expect(useAudioStore.getState().lfoBank.c).toStrictEqual({ shape: 'triangle', rate: 3.25, rateDrift: 0.4, depthDrift: -0.3 });
        spy.mockRestore();
      });

      it('does not mutate the payload it was given — a saved session object can be applied again', async () => {
        const bad = { division: '1/3', modifier: 'straight' };
        const payload = buildPayload({ ...freeLanes(), a: { ...FREE_LANE, sync: bad } }, FREE_DELAY);
        const spy = await notRunning();

        applySessionPayload(payload, { skipLocaleRebuild: true });

        expect(payload.lfoBank!.a).toStrictEqual({ ...FREE_LANE, sync: bad });
        spy.mockRestore();
      });
    });

    describe('the Delay', () => {
      it.each(INVALID_SYNCS)('with %s applies as Free: no `sync` key in state, engine hears the stored delayTime', async (_label, bad) => {
        const payload = buildPayload(freeLanes(), { ...FREE_DELAY, sync: bad }, 120);
        const pushSpy = vi.spyOn(AudioEngine, 'setGlobalDelay');

        applySessionPayload(payload, { skipLocaleRebuild: true });

        expect(useAudioStore.getState().globalAudio.delay).toStrictEqual(FREE_DELAY);
        expect(pushSpy.mock.calls.at(-1)![0]).toStrictEqual(FREE_DELAY);
        pushSpy.mockRestore();
      });

      it('keeps a valid `sync` exactly as it came', async () => {
        const payload = buildPayload(freeLanes(), { ...FREE_DELAY, sync: QUARTER }, 120);

        applySessionPayload(payload, { skipLocaleRebuild: true });

        expect(useAudioStore.getState().globalAudio.delay).toStrictEqual({ ...FREE_DELAY, sync: QUARTER });
      });

      it('leaves every other effect untouched while it drops the bad Delay `sync`', async () => {
        const payload = buildPayload(freeLanes(), { ...FREE_DELAY, sync: 'off' }, 120);

        applySessionPayload(payload, { skipLocaleRebuild: true });

        const { delay: _d, ...restApplied } = useAudioStore.getState().globalAudio;
        const { delay: _p, ...restPayload } = payload.globalAudio;
        expect(restApplied).toStrictEqual(restPayload);
      });

      it('does not mutate the payload it was given', async () => {
        const payload = buildPayload(freeLanes(), { ...FREE_DELAY, sync: 'off' }, 120);

        applySessionPayload(payload, { skipLocaleRebuild: true });

        expect(payload.globalAudio.delay).toStrictEqual({ ...FREE_DELAY, sync: 'off' });
      });
    });

    // docs/tasks/GLOBAL_MODULATION_COLOUR.md Task 12: the Phaser's Rate is the third synced field and takes the
    // same rule at the same boundary.
    describe('the Phaser', () => {
      const FREE_PHASER = { rate: 0.8, octaves: 4, baseFrequency: 420, stages: 7, Q: 6, wet: 0.3 } as const;

      /** A payload whose Phaser is exactly what the caller says; the Delay is free unless given. */
      function buildPhaserPayload(phaser: Record<string, unknown>, bpm?: number, delay: Record<string, unknown> = FREE_DELAY): SessionPayload {
        const payload = buildPayload(freeLanes(), delay, bpm);
        return { ...payload, globalAudio: { ...payload.globalAudio, phaser: phaser as never } };
      }

      it.each(INVALID_SYNCS)('with %s applies as Free: no `sync` key in state, engine hears the stored rate', async (_label, bad) => {
        const payload = buildPhaserPayload({ ...FREE_PHASER, sync: bad }, 120);
        const pushSpy = vi.spyOn(AudioEngine, 'setGlobalPhaser');

        applySessionPayload(payload, { skipLocaleRebuild: true });

        expect(useAudioStore.getState().globalAudio.phaser).toStrictEqual(FREE_PHASER);
        expect(pushSpy.mock.calls.at(-1)![0]).toStrictEqual(FREE_PHASER);
        pushSpy.mockRestore();
      });

      it('keeps a valid `sync` exactly as it came, and the engine hears that note\'s Hz at the payload tempo, never a sync key', async () => {
        const payload = buildPhaserPayload({ ...FREE_PHASER, sync: QUARTER }, 120);
        const pushSpy = vi.spyOn(AudioEngine, 'setGlobalPhaser');

        applySessionPayload(payload, { skipLocaleRebuild: true });

        expect(useAudioStore.getState().globalAudio.phaser).toStrictEqual({ ...FREE_PHASER, sync: QUARTER });
        const pushed = pushSpy.mock.calls.at(-1)![0];
        expect(pushed).not.toHaveProperty('sync');
        expect(pushed.rate).toBe(noteValueHz(QUARTER, 120));
        expect(pushed.rate).not.toBe(FREE_PHASER.rate);
        pushSpy.mockRestore();
      });

      it('keeps the rest of an invalid-synced Phaser intact: rate, stages, Q and Mix all survive', async () => {
        const payload = buildPhaserPayload({ ...FREE_PHASER, sync: 'off' }, 120);

        applySessionPayload(payload, { skipLocaleRebuild: true });

        const { phaser } = useAudioStore.getState().globalAudio;
        expect([phaser.rate, phaser.octaves, phaser.baseFrequency, phaser.stages, phaser.Q, phaser.wet]).toEqual([0.8, 4, 420, 7, 6, 0.3]);
      });

      it('leaves every other effect untouched while it drops the bad Phaser `sync`', async () => {
        const payload = buildPhaserPayload({ ...FREE_PHASER, sync: 'off' }, 120);

        applySessionPayload(payload, { skipLocaleRebuild: true });

        const { phaser: _a, ...restApplied } = useAudioStore.getState().globalAudio;
        const { phaser: _p, ...restPayload } = payload.globalAudio;
        expect(restApplied).toStrictEqual(restPayload);
      });

      it('sanitises the Phaser and the Delay independently: a bad one never costs the other a valid `sync`', async () => {
        applySessionPayload(buildPhaserPayload({ ...FREE_PHASER, sync: 'off' }, 120, { ...FREE_DELAY, sync: QUARTER }), { skipLocaleRebuild: true });
        expect(useAudioStore.getState().globalAudio.phaser).toStrictEqual(FREE_PHASER);
        expect(useAudioStore.getState().globalAudio.delay).toStrictEqual({ ...FREE_DELAY, sync: QUARTER });

        applySessionPayload(buildPhaserPayload({ ...FREE_PHASER, sync: QUARTER }, 120, { ...FREE_DELAY, sync: 'off' }), { skipLocaleRebuild: true });
        expect(useAudioStore.getState().globalAudio.phaser).toStrictEqual({ ...FREE_PHASER, sync: QUARTER });
        expect(useAudioStore.getState().globalAudio.delay).toStrictEqual(FREE_DELAY);
      });

      it('does not mutate the payload it was given', async () => {
        const payload = buildPhaserPayload({ ...FREE_PHASER, sync: 'off' }, 120);

        applySessionPayload(payload, { skipLocaleRebuild: true });

        expect(payload.globalAudio.phaser).toStrictEqual({ ...FREE_PHASER, sync: 'off' });
      });

      it('a Phaser with no `sync` key is returned untouched, and resolves to its stored rate at any tempo', async () => {
        for (const bpm of [20, 60, 200]) {
          applySessionPayload(buildPhaserPayload(FREE_PHASER, bpm), { skipLocaleRebuild: true });
          const { phaser } = useAudioStore.getState().globalAudio;
          expect('sync' in phaser, `${bpm} BPM`).toBe(false);
          expect(resolvePhaserRateHz(phaser, bpm), `${bpm} BPM`).toBe(FREE_PHASER.rate);
        }
      });
    });

    // docs/tasks/GLOBAL_PEDALS.md Task 12: the Chorus, Tremolo and Vibrato Rates are synced fields too, and
    // sanitizeSyncedRate drops a bad `sync` on all four synced blocks at the same boundary.
    describe('the three LFO pedals', () => {
      // Non-default values throughout, so a block restored from the defaults can never pass by coincidence.
      const FREE_PEDALS = {
        chorus: { rate: 2.2, delayTime: 4, depth: 0.6, spread: 90, feedback: 0.2, wet: 0.35 },
        tremolo: { rate: 6, depth: 0.4, spread: 120, wet: 0.25 },
        vibrato: { rate: 3.5, depth: 0.3, wet: 0.15 },
      } as const;
      const FREE_PHASER = { rate: 0.8, octaves: 4, baseFrequency: 420, stages: 7, Q: 6, wet: 0.3 } as const;
      type LfoPedal = keyof typeof FREE_PEDALS;
      const LFO_PEDALS = Object.keys(FREE_PEDALS) as LfoPedal[];
      const SETTER = { chorus: 'setGlobalChorus', tremolo: 'setGlobalTremolo', vibrato: 'setGlobalVibrato' } as const;

      /** A payload whose three LFO pedals are the Free blocks above, with the caller's overrides on top. */
      function buildPedalPayload(overrides: Partial<Record<LfoPedal | 'phaser', Record<string, unknown>>>, bpm?: number): SessionPayload {
        const payload = buildPayload(freeLanes(), FREE_DELAY, bpm);
        return { ...payload, globalAudio: { ...payload.globalAudio, ...FREE_PEDALS, phaser: FREE_PHASER, ...overrides } as never };
      }

      describe.each(LFO_PEDALS)('the %s', (key) => {
        it.each(INVALID_SYNCS)('with %s applies as Free: no `sync` key in state, engine hears the stored rate', async (_label, bad) => {
          const payload = buildPedalPayload({ [key]: { ...FREE_PEDALS[key], sync: bad } }, 120);
          const pushSpy = vi.spyOn(AudioEngine, SETTER[key]);

          applySessionPayload(payload, { skipLocaleRebuild: true });

          const block = useAudioStore.getState().globalAudio[key];
          expect('sync' in block).toBe(false);
          expect(block).toStrictEqual(FREE_PEDALS[key]);
          expect(pushSpy.mock.calls.at(-1)![0]).toStrictEqual(FREE_PEDALS[key]);
          pushSpy.mockRestore();
        });

        it('keeps a valid `sync` exactly as it came, and the engine hears that note\'s Hz at the payload tempo, never a sync key', async () => {
          const payload = buildPedalPayload({ [key]: { ...FREE_PEDALS[key], sync: QUARTER } }, 120);
          const pushSpy = vi.spyOn(AudioEngine, SETTER[key]);

          applySessionPayload(payload, { skipLocaleRebuild: true });

          expect(useAudioStore.getState().globalAudio[key]).toStrictEqual({ ...FREE_PEDALS[key], sync: QUARTER });
          const pushed = pushSpy.mock.calls.at(-1)![0] as { rate: number };
          expect(pushed).not.toHaveProperty('sync');
          expect(pushed.rate).toBe(noteValueHz(QUARTER, 120));
          expect(pushed.rate).not.toBe(FREE_PEDALS[key].rate);
          pushSpy.mockRestore();
        });

        it('leaves every other effect untouched while it drops the bad `sync`', async () => {
          const payload = buildPedalPayload({ [key]: { ...FREE_PEDALS[key], sync: 'off' } }, 120);

          applySessionPayload(payload, { skipLocaleRebuild: true });

          const { [key]: _a, ...restApplied } = useAudioStore.getState().globalAudio;
          const { [key]: _p, ...restPayload } = payload.globalAudio;
          expect(restApplied).toStrictEqual(restPayload);
        });

        it('does not mutate the payload it was given', async () => {
          const payload = buildPedalPayload({ [key]: { ...FREE_PEDALS[key], sync: 'off' } }, 120);

          applySessionPayload(payload, { skipLocaleRebuild: true });

          expect(payload.globalAudio[key]).toStrictEqual({ ...FREE_PEDALS[key], sync: 'off' });
        });

        it('a block with no `sync` key is returned as the very object the payload carried', async () => {
          const payload = buildPedalPayload({}, 120);

          applySessionPayload(payload, { skipLocaleRebuild: true });

          expect(useAudioStore.getState().globalAudio[key]).toBe(payload.globalAudio[key]);
        });
      });

      it('sanitises the four synced blocks independently: a bad Tremolo never costs the others a valid `sync`', async () => {
        const QUARTER_DOTTED = { division: '1/4', modifier: 'dotted' } as const;
        const payload = buildPedalPayload(
          {
            phaser: { ...FREE_PHASER, sync: QUARTER },
            chorus: { ...FREE_PEDALS.chorus, sync: QUARTER_DOTTED },
            tremolo: { ...FREE_PEDALS.tremolo, sync: 'nope' },
            vibrato: { ...FREE_PEDALS.vibrato, sync: QUARTER },
          },
          120,
        );

        applySessionPayload(payload, { skipLocaleRebuild: true });

        const { globalAudio } = useAudioStore.getState();
        expect(globalAudio.phaser).toStrictEqual({ ...FREE_PHASER, sync: QUARTER });
        expect(globalAudio.chorus).toStrictEqual({ ...FREE_PEDALS.chorus, sync: QUARTER_DOTTED });
        expect('sync' in globalAudio.tremolo).toBe(false);
        expect(globalAudio.tremolo).toStrictEqual(FREE_PEDALS.tremolo);
        expect(globalAudio.vibrato).toStrictEqual({ ...FREE_PEDALS.vibrato, sync: QUARTER });
      });

      it('a bad `sync` on all four synced blocks at once leaves none of them with a `sync` key', async () => {
        const payload = buildPedalPayload(
          {
            phaser: { ...FREE_PHASER, sync: 'off' },
            chorus: { ...FREE_PEDALS.chorus, sync: null },
            tremolo: { ...FREE_PEDALS.tremolo, sync: 7 },
            vibrato: { ...FREE_PEDALS.vibrato, sync: { division: '1/3', modifier: 'straight' } },
          },
          120,
        );

        applySessionPayload(payload, { skipLocaleRebuild: true });

        const { globalAudio } = useAudioStore.getState();
        for (const key of ['phaser', ...LFO_PEDALS] as const) expect('sync' in globalAudio[key], key).toBe(false);
      });
    });

    describe('a version-2 payload with no `sync` anywhere', () => {
      it.each([20, 40, 100, 200])('resolves to its stored numbers at %i BPM — lanes in state and engine, Delay in state and engine', async (bpm) => {
        const payload = buildPayload(freeLanes(), FREE_DELAY, bpm);
        const spy = await running();
        const pushSpy = vi.spyOn(AudioEngine, 'setGlobalDelay');
        for (const lane of LFO_LANE_IDS) lfoEngine.setBankRate(lane, 9); // a value the restore must overwrite

        applySessionPayload(payload, { skipLocaleRebuild: true });

        const { lfoBank, globalAudio } = useAudioStore.getState();
        for (const lane of LFO_LANE_IDS) {
          expect('sync' in lfoBank[lane], `${lane} has no sync`).toBe(false);
          expect(resolveLaneRateHz(lfoBank[lane], bpm), `${lane} state`).toBe(STORED_RATES[lane]);
          expect(lfoEngine.getBankSettings(lane).rate, `${lane} engine`).toBe(STORED_RATES[lane]);
        }
        expect('sync' in globalAudio.delay).toBe(false);
        expect(resolveDelayTimeSeconds(globalAudio.delay, bpm)).toBe(FREE_DELAY.delayTime);
        expect(pushSpy.mock.calls.at(-1)![0]).toStrictEqual(FREE_DELAY);
        spy.mockRestore();
        pushSpy.mockRestore();
      });
    });
  });

  it('when the audio context is not running, writes lfoBank/globalLfoLinks data-only -- no engine push', async () => {
    const lfoShared = await import('../engine/lfoShared');
    const localeId = setupWorld();
    spawnInitialRoster(localeId);
    const payload = buildSessionPayload();
    const runningSpy = vi.spyOn(lfoShared, 'isAudioContextRunning').mockReturnValue(false);
    const setLfoBankSpy = vi.spyOn(useAudioStore.getState(), 'setLfoBank');

    applySessionPayload(payload, { skipLocaleRebuild: true });

    expect(setLfoBankSpy).not.toHaveBeenCalled();
    expect(useAudioStore.getState().lfoBank).toEqual(payload.lfoBank);
    runningSpy.mockRestore();
    setLfoBankSpy.mockRestore();
  });

  it('backfills a lfoBank missing a lane / globalLfoLinks missing a target instead of installing a hole, when the audio context is not running (a stale/hand-edited saved session, not a share-link -- that boundary already backfills)', async () => {
    const lfoShared = await import('../engine/lfoShared');
    const localeId = setupWorld();
    spawnInitialRoster(localeId);
    const payload = buildSessionPayload();
    const { d: _droppedLane, ...partialLfoBank } = payload.lfoBank!;
    const { 'eq3.low': _droppedTarget, ...partialGlobalLfoLinks } = payload.globalLfoLinks!;
    const holeyPayload = {
      ...payload,
      lfoBank: partialLfoBank as typeof payload.lfoBank,
      globalLfoLinks: partialGlobalLfoLinks as typeof payload.globalLfoLinks,
    };
    const runningSpy = vi.spyOn(lfoShared, 'isAudioContextRunning').mockReturnValue(false);

    expect(() => applySessionPayload(holeyPayload, { skipLocaleRebuild: true })).not.toThrow();

    expect(useAudioStore.getState().lfoBank.d).toEqual(DEFAULT_BANK_LFO);
    expect(useAudioStore.getState().globalLfoLinks['eq3.low']).toEqual(DEFAULT_LFO_LINK['eq3.low']);
    expect(Object.keys(useAudioStore.getState().lfoBank).sort()).toEqual([...LFO_LANE_IDS].sort());
    expect(Object.keys(useAudioStore.getState().globalLfoLinks).sort()).toEqual([...GLOBAL_LFO_TARGET_IDS].sort());
    runningSpy.mockRestore();
  });

  it('backfills the same hole when the audio context IS running -- replaceLfoBankLane/setGlobalLfoLink never receive undefined', async () => {
    const lfoShared = await import('../engine/lfoShared');
    const localeId = setupWorld();
    spawnInitialRoster(localeId);
    const payload = buildSessionPayload();
    const { d: _droppedLane, ...partialLfoBank } = payload.lfoBank!;
    const holeyPayload = { ...payload, lfoBank: partialLfoBank as typeof payload.lfoBank };
    const runningSpy = vi.spyOn(lfoShared, 'isAudioContextRunning').mockReturnValue(true);
    const replaceLaneSpy = vi.spyOn(useAudioStore.getState(), 'replaceLfoBankLane');

    applySessionPayload(holeyPayload, { skipLocaleRebuild: true });

    const laneDCall = replaceLaneSpy.mock.calls.find((call) => call[0] === 'd');
    expect(laneDCall?.[1]).toEqual(DEFAULT_BANK_LFO);
    runningSpy.mockRestore();
    replaceLaneSpy.mockRestore();
  });

  it('leaves the current lfoBank/globalLfoLinks untouched when an older (v1) payload lacks those fields', () => {
    const localeId = setupWorld();
    spawnInitialRoster(localeId);
    const payload = buildSessionPayload();
    const { lfoBank: _lfoBank, globalLfoLinks: _globalLfoLinks, ...v1ShapePayload } = payload;

    // skipLocaleRebuild: true isolates this field's own "absent means untouched" branch --
    // retransmitWorld only resyncs lfoBank/globalLfoLinks on an ACTUAL Attenuation Style switch
    // (audioStore.ts's syncGlobalAudioToCurrentAttenuationStyle, keyed off currentAttenuationStyleId
    // changing), never on a same-Attenuation-Style coords-only reseed -- asserting against that
    // unrelated mechanism would prove nothing about this code path either way.
    const customLfoBank = { ...useAudioStore.getState().lfoBank, a: { shape: 'sawtooth' as const, rate: 9, rateDrift: 0.9, depthDrift: 0.9 } };
    useAudioStore.setState({ lfoBank: customLfoBank });

    expect(() => applySessionPayload({ ...v1ShapePayload, version: 1 } as typeof payload, { skipLocaleRebuild: true })).not.toThrow();

    expect(useAudioStore.getState().lfoBank).toEqual(customLfoBank);
  });

  it('applies a pre-branch v1 payload carrying legacy globalLfo/lfoDrift/lfoSettings fields without throwing, restoring ADSR and company rename while leaving them out of the resulting state', () => {
    const localeId = setupWorld();
    spawnInitialRoster(localeId);
    spawnInitialCompanies(localeId);
    const robot = useLocaleStore.getState().getLocaleById(localeId)!.robots[0];
    useLocaleStore.getState().updateRobot(localeId, robot.id, { audioAttributes: { ...robot.audioAttributes, filterFreq: 1234 } });
    const company = useLocaleStore.getState().getLocaleById(localeId)!.companies[0];
    useLocaleStore.getState().updateCompany(localeId, company.id, { name: 'Legacy Guild' });
    const freshPayload = buildSessionPayload();

    // Simulates a session saved on `main` before this branch: version 1, no lfoBank/
    // globalLfoLinks, and still carrying the exact fields Task 17 removed from the TYPE -- a real
    // pre-branch blob on disk/in a share link still has them as plain JSON, since nothing migrates
    // old saves forward. Cast through unknown: decodeSessionPayload's own doc comment treats a
    // loaded payload as untyped JSON from outside the app, same as the existing legacy-company test above.
    const v1Payload = {
      ...freshPayload,
      version: 1,
      lfoBank: undefined,
      globalLfoLinks: undefined,
      globalLfo: { 'eq3.low': { shape: 'sine', rate: 1, depth: 10 } },
      robotOverrides: Object.fromEntries(
        Object.entries(freshPayload.robotOverrides).map(([id, diff]) => [
          id,
          { ...diff, lfoSettings: { 'layer0.gain': { shape: 'sine', rate: 1, depth: 10 } } },
        ]),
      ),
      globalAudio: { ...freshPayload.globalAudio, lfoDrift: { environmental: { rateDrift: 0.5, depthDrift: 0.5 } } },
    } as unknown as SessionPayload;

    expect(() => applySessionPayload({ ...v1Payload, coordinates: { x: v1Payload.coordinates.x + 500, y: v1Payload.coordinates.y + 500 } })).not.toThrow();
    expect(() => applySessionPayload(v1Payload)).not.toThrow();

    const restoredRobot = currentLocale()!.robots.find((r) => r.id === robot.id)!;
    expect(restoredRobot.audioAttributes.filterFreq).toBe(1234);
    const restoredCompany = currentLocale()!.companies.find((c) => c.id === company.id);
    expect(restoredCompany?.name).toBe('Legacy Guild');
    expect(useAudioStore.getState().globalAudio).not.toHaveProperty('lfoDrift');
  });

  it('applies a malformed v1 payload missing robotOverrides entirely without throwing', () => {
    const localeId = setupWorld();
    spawnInitialRoster(localeId);
    const freshPayload = buildSessionPayload();
    // A corrupted/hand-truncated v1 blob on disk or in a share link -- robotOverrides absent
    // rather than {} (stripLegacyV1LfoFields's own Object.entries(raw.robotOverrides) used to
    // throw TypeError: Cannot convert undefined or null to object on exactly this shape).
    const { robotOverrides: _robotOverrides, ...payloadWithoutRobotOverrides } = freshPayload;
    const v1Payload = { ...payloadWithoutRobotOverrides, version: 1, lfoBank: undefined, globalLfoLinks: undefined } as unknown as SessionPayload;

    expect(() => applySessionPayload(v1Payload, { skipLocaleRebuild: true })).not.toThrow();
  });

  it('migrateLfoDrift no longer exists', async () => {
    const sessionDiffModule = await import('./sessionDiff');
    expect('migrateLfoDrift' in sessionDiffModule).toBe(false);
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

// ----------------------------------------
// GLOBAL COLOUR DEFAULTS ON RESTORE (docs/specs/GLOBAL_COLOUR.md assumption 11; docs/tasks/GLOBAL_COLOUR.md Task 10)
// ----------------------------------------
// A session saved before the colour blocks existed has no distortion / chebyshev / bitCrusher in its
// globalAudio. Restoring it must fill them from the defaults (dry) before anything reads them, so the
// engine push never dereferences a missing block. A payload that carries them restores them as given.

describe('applySessionPayload — globalAudio defaults (Global Colour T10)', () => {
  let colourLocaleCounter = 0;
  function setupColourWorld() {
    const localeId = `apply-session-colour-locale-${colourLocaleCounter++}`;
    useAttenuationStyleStore.setState({
      attenuationStyles: [{ ...DEFAULT_PELAGOS, currentLocaleId: localeId }],
      currentAttenuationStyleId: DEFAULT_PELAGOS.id,
    });
    useLocaleStore.setState({ locales: { [localeId]: { ...DEFAULT_LOCALE, id: localeId, robots: [], companies: [] } } });
    spawnInitialRoster(localeId);
    return localeId;
  }

  const LOUD = {
    distortion: { amount: 0.77, wet: 0.41 },
    chebyshev: { order: 5, wet: 0.22 },
    bitCrusher: { bits: 3, wet: 0.6 },
  };

  /** A payload as an older build wrote it: no colour block at all. */
  function preColourPayload(): SessionPayload {
    const payload = buildSessionPayload();
    const { distortion: _d, chebyshev: _c, bitCrusher: _b, ...old } = payload.globalAudio;
    return { ...payload, globalAudio: old as unknown as SessionPayload['globalAudio'] };
  }

  function spyColourSetters() {
    return {
      distortion: vi.spyOn(AudioEngine, 'setGlobalDistortion').mockImplementation(() => {}),
      chebyshev: vi.spyOn(AudioEngine, 'setGlobalChebyshev').mockImplementation(() => {}),
      bitCrusher: vi.spyOn(AudioEngine, 'setGlobalBitCrusher').mockImplementation(() => {}),
    };
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('a payload without the three colour blocks restores them at the defaults, dry, and leaves every other block as saved', () => {
    setupColourWorld();
    const payload = preColourPayload();
    applySessionPayload(payload);
    const restored = useAudioStore.getState().globalAudio;
    expect(restored.distortion).toEqual(DEFAULT_GLOBAL_AUDIO_SETTINGS.distortion);
    expect(restored.chebyshev).toEqual(DEFAULT_GLOBAL_AUDIO_SETTINGS.chebyshev);
    expect(restored.bitCrusher).toEqual(DEFAULT_GLOBAL_AUDIO_SETTINGS.bitCrusher);
    expect([restored.distortion.wet, restored.chebyshev.wet, restored.bitCrusher.wet]).toEqual([0, 0, 0]);
    expect(restored.reverb).toEqual(payload.globalAudio.reverb);
    expect(restored.compressor).toEqual(payload.globalAudio.compressor);
    expect(restored.limiter).toEqual(payload.globalAudio.limiter);
  });

  it('the engine is pushed the full default colour blocks, never undefined', () => {
    setupColourWorld();
    const spies = spyColourSetters();
    applySessionPayload(preColourPayload());
    expect(spies.distortion).toHaveBeenCalledWith(DEFAULT_GLOBAL_AUDIO_SETTINGS.distortion);
    expect(spies.chebyshev).toHaveBeenCalledWith(DEFAULT_GLOBAL_AUDIO_SETTINGS.chebyshev);
    expect(spies.bitCrusher).toHaveBeenCalledWith(DEFAULT_GLOBAL_AUDIO_SETTINGS.bitCrusher);
  });

  it('a payload that carries non-default colour blocks restores them as given, in the store and at the engine', () => {
    setupColourWorld();
    const spies = spyColourSetters();
    const payload = { ...buildSessionPayload(), globalAudio: { ...buildSessionPayload().globalAudio, ...LOUD } };
    applySessionPayload(payload);
    const restored = useAudioStore.getState().globalAudio;
    expect(restored.distortion).toEqual(LOUD.distortion);
    expect(restored.chebyshev).toEqual(LOUD.chebyshev);
    expect(restored.bitCrusher).toEqual(LOUD.bitCrusher);
    expect(spies.distortion).toHaveBeenCalledWith(LOUD.distortion);
    expect(spies.chebyshev).toHaveBeenCalledWith(LOUD.chebyshev);
    expect(spies.bitCrusher).toHaveBeenCalledWith(LOUD.bitCrusher);
  });

  it('save then restore is exact for a loud colour: the next save carries the same three blocks', () => {
    setupColourWorld();
    useAudioStore.setState((s) => ({ globalAudio: { ...s.globalAudio, ...LOUD } }));
    const saved = buildSessionPayload();
    useAudioStore.setState((s) => ({ globalAudio: { ...s.globalAudio, ...DEFAULT_GLOBAL_AUDIO_SETTINGS } }));
    applySessionPayload(saved);
    const again = buildSessionPayload();
    expect(again.globalAudio.distortion).toEqual(LOUD.distortion);
    expect(again.globalAudio.chebyshev).toEqual(LOUD.chebyshev);
    expect(again.globalAudio.bitCrusher).toEqual(LOUD.bitCrusher);
  });

  it('a payload with only some colour blocks keeps those byte for byte and defaults the rest', () => {
    setupColourWorld();
    const { distortion: _d, chebyshev: _c, ...rest } = buildSessionPayload().globalAudio;
    applySessionPayload({ ...buildSessionPayload(), globalAudio: { ...rest, bitCrusher: LOUD.bitCrusher } as unknown as SessionPayload['globalAudio'] });
    const restored = useAudioStore.getState().globalAudio;
    expect(restored.bitCrusher).toEqual(LOUD.bitCrusher);
    expect(restored.distortion).toEqual(DEFAULT_GLOBAL_AUDIO_SETTINGS.distortion);
    expect(restored.chebyshev).toEqual(DEFAULT_GLOBAL_AUDIO_SETTINGS.chebyshev);
  });

  it('a null colour block is a missing one: it takes the default and nothing throws', () => {
    setupColourWorld();
    const nulled = { ...buildSessionPayload().globalAudio, distortion: null } as unknown as SessionPayload['globalAudio'];
    expect(() => applySessionPayload({ ...buildSessionPayload(), globalAudio: nulled })).not.toThrow();
    expect(useAudioStore.getState().globalAudio.distortion).toEqual(DEFAULT_GLOBAL_AUDIO_SETTINGS.distortion);
  });

  it('an empty globalAudio restores every block at its default instead of crashing on the first missing one', () => {
    setupColourWorld();
    const empty = { ...buildSessionPayload(), globalAudio: {} as SessionPayload['globalAudio'] };
    expect(() => applySessionPayload(empty)).not.toThrow();
    expect(useAudioStore.getState().globalAudio).toEqual(DEFAULT_GLOBAL_AUDIO_SETTINGS);
  });

  it('restoring never mutates the payload it was given, and the stored defaults are copies, not the shared constants', () => {
    setupColourWorld();
    const payload = preColourPayload();
    const before = JSON.stringify(payload);
    applySessionPayload(payload);
    expect(JSON.stringify(payload)).toBe(before);
    const restored = useAudioStore.getState().globalAudio;
    expect(restored.distortion).not.toBe(DEFAULT_GLOBAL_AUDIO_SETTINGS.distortion);
    expect(restored.bitCrusher).not.toBe(DEFAULT_GLOBAL_AUDIO_SETTINGS.bitCrusher);
  });

  it('skipLocaleRebuild: true (the share-link boot path) fills the defaults too', () => {
    setupColourWorld();
    applySessionPayload(preColourPayload(), { skipLocaleRebuild: true });
    expect(useAudioStore.getState().globalAudio.bitCrusher).toEqual(DEFAULT_GLOBAL_AUDIO_SETTINGS.bitCrusher);
  });
});

// ----------------------------------------
// GLOBAL MODULATION DEFAULTS ON RESTORE (docs/specs/GLOBAL_MODULATION_COLOUR.md; docs/tasks/GLOBAL_MODULATION_COLOUR.md Task 12)
// ----------------------------------------
// A session saved before the AutoWah and Phaser existed has neither block in its globalAudio. Restoring it
// fills both from the defaults (dry) and pushes them to the engine; a payload that carries them restores
// them as given, `phaser.sync` included. withGlobalAudioDefaults already does the filling (T1): this is the proof.

describe('applySessionPayload — pedal defaults (Global Modulation T12)', () => {
  let pedalLocaleCounter = 0;
  function setupPedalWorld() {
    const localeId = `apply-session-pedal-locale-${pedalLocaleCounter++}`;
    useAttenuationStyleStore.setState({
      attenuationStyles: [{ ...DEFAULT_PELAGOS, currentLocaleId: localeId }],
      currentAttenuationStyleId: DEFAULT_PELAGOS.id,
    });
    useLocaleStore.setState({ locales: { [localeId]: { ...DEFAULT_LOCALE, id: localeId, robots: [], companies: [] } } });
    spawnInitialRoster(localeId);
    return localeId;
  }

  const LOUD_PEDALS = {
    autoWah: { baseFrequency: 220, octaves: 3, sensitivity: -20, Q: 5, gain: 9, follower: 0.4, wet: 0.5 },
    phaser: { rate: 0.8, octaves: 4, baseFrequency: 420, stages: 7, Q: 6, wet: 0.3, sync: { division: '1/2', modifier: 'dotted' } },
  } as const;

  /** A payload as the build before the pedals wrote it: neither block at all. */
  function prePedalPayload(): SessionPayload {
    const payload = buildSessionPayload();
    const { autoWah: _w, phaser: _p, ...old } = payload.globalAudio;
    return { ...payload, globalAudio: old as unknown as SessionPayload['globalAudio'] };
  }

  function spyPedalSetters() {
    return {
      autoWah: vi.spyOn(AudioEngine, 'setGlobalAutoWah').mockImplementation(() => {}),
      phaser: vi.spyOn(AudioEngine, 'setGlobalPhaser').mockImplementation(() => {}),
    };
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('a payload without the pedals restores both at the defaults, dry, with no sync, and leaves every other block as saved', () => {
    setupPedalWorld();
    const payload = prePedalPayload();
    applySessionPayload(payload);
    const restored = useAudioStore.getState().globalAudio;
    expect(restored.autoWah).toEqual(DEFAULT_GLOBAL_AUDIO_SETTINGS.autoWah);
    expect(restored.phaser).toEqual(DEFAULT_GLOBAL_AUDIO_SETTINGS.phaser);
    expect([restored.autoWah.wet, restored.phaser.wet]).toEqual([0, 0]);
    expect('sync' in restored.phaser).toBe(false);
    expect(restored.bitCrusher).toEqual(payload.globalAudio.bitCrusher);
    expect(restored.delay).toEqual(payload.globalAudio.delay);
    expect(restored.limiter).toEqual(payload.globalAudio.limiter);
  });

  it('the engine is pushed both full default blocks, the Phaser resolved to its Hz and carrying no sync', () => {
    setupPedalWorld();
    const spies = spyPedalSetters();
    applySessionPayload(prePedalPayload());
    expect(spies.autoWah).toHaveBeenCalledWith(DEFAULT_GLOBAL_AUDIO_SETTINGS.autoWah);
    expect(spies.phaser).toHaveBeenCalledWith(DEFAULT_GLOBAL_AUDIO_SETTINGS.phaser);
    expect(spies.phaser.mock.calls.every((c) => !('sync' in c[0]))).toBe(true);
  });

  it('a payload that carries both pedals restores them as given, a synced Phaser included, in the store and at the engine', () => {
    setupPedalWorld();
    const spies = spyPedalSetters();
    const payload = { ...buildSessionPayload(), bpm: 120, globalAudio: { ...buildSessionPayload().globalAudio, ...LOUD_PEDALS } };
    applySessionPayload(payload);
    const restored = useAudioStore.getState().globalAudio;
    expect(restored.autoWah).toEqual(LOUD_PEDALS.autoWah);
    expect(restored.phaser).toEqual(LOUD_PEDALS.phaser);
    expect(spies.autoWah).toHaveBeenCalledWith(LOUD_PEDALS.autoWah);
    const { sync, ...phaserNoSync } = LOUD_PEDALS.phaser;
    expect(spies.phaser).toHaveBeenCalledWith({ ...phaserNoSync, rate: noteValueHz(sync, 120) });
  });

  it('save then restore is exact for lit pedals: the next save carries the same two blocks', () => {
    setupPedalWorld();
    useAudioStore.setState((s) => ({ globalAudio: { ...s.globalAudio, ...LOUD_PEDALS } }));
    const saved = buildSessionPayload();
    useAudioStore.setState((s) => ({ globalAudio: { ...s.globalAudio, ...DEFAULT_GLOBAL_AUDIO_SETTINGS } }));
    applySessionPayload(saved);
    const again = buildSessionPayload();
    expect(again.globalAudio.autoWah).toEqual(LOUD_PEDALS.autoWah);
    expect(again.globalAudio.phaser).toEqual(LOUD_PEDALS.phaser);
  });

  it('a payload with only the Phaser keeps it byte for byte (sync included) and defaults the AutoWah', () => {
    setupPedalWorld();
    const { autoWah: _w, ...rest } = buildSessionPayload().globalAudio;
    applySessionPayload({ ...buildSessionPayload(), globalAudio: { ...rest, phaser: LOUD_PEDALS.phaser } as unknown as SessionPayload['globalAudio'] });
    const restored = useAudioStore.getState().globalAudio;
    expect(restored.phaser).toEqual(LOUD_PEDALS.phaser);
    expect(restored.autoWah).toEqual(DEFAULT_GLOBAL_AUDIO_SETTINGS.autoWah);
  });

  it('a payload with only the AutoWah defaults the Phaser', () => {
    setupPedalWorld();
    const { phaser: _p, ...rest } = buildSessionPayload().globalAudio;
    applySessionPayload({ ...buildSessionPayload(), globalAudio: { ...rest, autoWah: LOUD_PEDALS.autoWah } as unknown as SessionPayload['globalAudio'] });
    const restored = useAudioStore.getState().globalAudio;
    expect(restored.autoWah).toEqual(LOUD_PEDALS.autoWah);
    expect(restored.phaser).toEqual(DEFAULT_GLOBAL_AUDIO_SETTINGS.phaser);
  });

  it('a null pedal block is a missing one: it takes the default and nothing throws', () => {
    setupPedalWorld();
    const nulled = { ...buildSessionPayload().globalAudio, phaser: null, autoWah: null } as unknown as SessionPayload['globalAudio'];
    expect(() => applySessionPayload({ ...buildSessionPayload(), globalAudio: nulled })).not.toThrow();
    expect(useAudioStore.getState().globalAudio.phaser).toEqual(DEFAULT_GLOBAL_AUDIO_SETTINGS.phaser);
    expect(useAudioStore.getState().globalAudio.autoWah).toEqual(DEFAULT_GLOBAL_AUDIO_SETTINGS.autoWah);
  });

  it('restoring never mutates the payload, and the stored defaults are copies, not the shared constants', () => {
    setupPedalWorld();
    const payload = prePedalPayload();
    const before = JSON.stringify(payload);
    applySessionPayload(payload);
    expect(JSON.stringify(payload)).toBe(before);
    const restored = useAudioStore.getState().globalAudio;
    expect(restored.autoWah).not.toBe(DEFAULT_GLOBAL_AUDIO_SETTINGS.autoWah);
    expect(restored.phaser).not.toBe(DEFAULT_GLOBAL_AUDIO_SETTINGS.phaser);
  });

  it('skipLocaleRebuild: true (the share-link boot path) fills the pedal defaults too', () => {
    setupPedalWorld();
    applySessionPayload(prePedalPayload(), { skipLocaleRebuild: true });
    expect(useAudioStore.getState().globalAudio.autoWah).toEqual(DEFAULT_GLOBAL_AUDIO_SETTINGS.autoWah);
    expect(useAudioStore.getState().globalAudio.phaser).toEqual(DEFAULT_GLOBAL_AUDIO_SETTINGS.phaser);
  });
});

// ----------------------------------------
// GLOBAL PEDALS DEFAULTS ON RESTORE (docs/specs/GLOBAL_PEDALS.md; docs/tasks/GLOBAL_PEDALS.md Task 12)
// ----------------------------------------
// A version-2 session saved before the Chorus, Tremolo, Vibrato, Frequency Shifter and Width existed has none of
// the five blocks. Restoring it fills all five from the defaults (four dry, Width at its 0.5 unity) and pushes them
// to the engine; a payload that carries them restores them as given, a synced Chorus included.

describe('applySessionPayload — Global Pedals defaults (T12)', () => {
  const NEW_KEYS = ['chorus', 'tremolo', 'vibrato', 'frequencyShifter', 'stereoWidener'] as const;
  let newPedalLocaleCounter = 0;
  function setupNewPedalWorld() {
    const localeId = `apply-session-new-pedal-locale-${newPedalLocaleCounter++}`;
    useAttenuationStyleStore.setState({
      attenuationStyles: [{ ...DEFAULT_PELAGOS, currentLocaleId: localeId }],
      currentAttenuationStyleId: DEFAULT_PELAGOS.id,
    });
    useLocaleStore.setState({ locales: { [localeId]: { ...DEFAULT_LOCALE, id: localeId, robots: [], companies: [] } } });
    spawnInitialRoster(localeId);
  }

  // Non-default on every field, so a defaulted block can never pass for a restored one.
  const LIT = {
    chorus: { rate: 2.2, delayTime: 4, depth: 0.6, spread: 90, feedback: 0.2, wet: 0.35, sync: { division: '1/4', modifier: 'dotted' } },
    tremolo: { rate: 6, depth: 0.4, spread: 120, wet: 0.25 },
    vibrato: { rate: 3.5, depth: 0.3, wet: 0.15 },
    frequencyShifter: { shift: -7, wet: 0.2 },
    stereoWidener: { width: 0.2 },
  } as const;

  /** A version-2 payload as the build before the five blocks wrote it: none of them at all. */
  function preNewPedalPayload(): SessionPayload {
    const payload = buildSessionPayload();
    const { chorus: _c, tremolo: _t, vibrato: _v, frequencyShifter: _f, stereoWidener: _w, ...old } = payload.globalAudio;
    return { ...payload, version: 2, globalAudio: old as unknown as SessionPayload['globalAudio'] };
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('the fixture really lacks the five blocks and is version 2 (the fixture proves what it claims)', () => {
    setupNewPedalWorld();
    const payload = preNewPedalPayload();
    expect(payload.version).toBe(2);
    for (const key of NEW_KEYS) expect(key in payload.globalAudio, key).toBe(false);
  });

  it('a payload without the five blocks restores them at the defaults without throwing, and leaves every other block as saved', () => {
    setupNewPedalWorld();
    const payload = preNewPedalPayload();
    expect(() => applySessionPayload(payload)).not.toThrow();
    const restored = useAudioStore.getState().globalAudio;
    for (const key of NEW_KEYS) expect(restored[key], key).toEqual(DEFAULT_GLOBAL_AUDIO_SETTINGS[key]);
    expect([restored.chorus.wet, restored.tremolo.wet, restored.vibrato.wet, restored.frequencyShifter.wet]).toEqual([0, 0, 0, 0]);
    expect(restored.stereoWidener.width).toBe(0.5);
    for (const key of ['chorus', 'tremolo', 'vibrato'] as const) expect('sync' in restored[key], key).toBe(false);
    for (const [key, value] of Object.entries(payload.globalAudio)) {
      expect(restored[key as keyof typeof restored], key).toEqual(value);
    }
  });

  it('the engine is pushed all five full default blocks, never undefined', () => {
    setupNewPedalWorld();
    const spies = {
      chorus: vi.spyOn(AudioEngine, 'setGlobalChorus').mockImplementation(() => {}),
      tremolo: vi.spyOn(AudioEngine, 'setGlobalTremolo').mockImplementation(() => {}),
      vibrato: vi.spyOn(AudioEngine, 'setGlobalVibrato').mockImplementation(() => {}),
      frequencyShifter: vi.spyOn(AudioEngine, 'setGlobalFrequencyShifter').mockImplementation(() => {}),
      stereoWidener: vi.spyOn(AudioEngine, 'setGlobalStereoWidener').mockImplementation(() => {}),
    };
    applySessionPayload(preNewPedalPayload());
    for (const key of NEW_KEYS) {
      expect(spies[key], key).toHaveBeenCalledWith(DEFAULT_GLOBAL_AUDIO_SETTINGS[key]);
      expect(spies[key].mock.calls.every((c) => c[0] !== undefined), key).toBe(true);
    }
  });

  it('a payload that carries the five blocks restores them as given, the synced Chorus at the engine as its note\'s Hz', () => {
    setupNewPedalWorld();
    const chorusSpy = vi.spyOn(AudioEngine, 'setGlobalChorus').mockImplementation(() => {});
    const widthSpy = vi.spyOn(AudioEngine, 'setGlobalStereoWidener').mockImplementation(() => {});
    const payload = { ...buildSessionPayload(), bpm: 120, globalAudio: { ...buildSessionPayload().globalAudio, ...LIT } };
    applySessionPayload(payload);
    const restored = useAudioStore.getState().globalAudio;
    for (const key of NEW_KEYS) expect(restored[key], key).toEqual(LIT[key]);
    const { sync, ...chorusNoSync } = LIT.chorus;
    expect(chorusSpy).toHaveBeenCalledWith({ ...chorusNoSync, rate: noteValueHz(sync, 120) });
    expect(widthSpy).toHaveBeenCalledWith({ width: 0.2 });
  });

  it('save then restore is exact for a synced Chorus and Width 0.2: the next save carries the same five blocks', () => {
    setupNewPedalWorld();
    useAudioStore.setState((s) => ({ globalAudio: { ...s.globalAudio, ...LIT } }));
    const saved = buildSessionPayload();
    useAudioStore.setState((s) => ({ globalAudio: { ...s.globalAudio, ...DEFAULT_GLOBAL_AUDIO_SETTINGS } }));
    applySessionPayload(saved);
    const again = buildSessionPayload();
    for (const key of NEW_KEYS) expect(again.globalAudio[key], key).toEqual(LIT[key]);
  });

  it('a present block is kept whole, never deep-merged: a Chorus with only a wet stays without its other fields', () => {
    setupNewPedalWorld();
    const globalAudio = { ...buildSessionPayload().globalAudio, chorus: { wet: 0.5 } } as unknown as SessionPayload['globalAudio'];
    applySessionPayload({ ...buildSessionPayload(), globalAudio });
    expect(useAudioStore.getState().globalAudio.chorus).toStrictEqual({ wet: 0.5 });
  });

  it('a payload with only some of the five keeps those byte for byte and defaults the rest', () => {
    setupNewPedalWorld();
    const { chorus: _c, vibrato: _v, stereoWidener: _w, ...rest } = buildSessionPayload().globalAudio;
    const globalAudio = { ...rest, tremolo: LIT.tremolo, frequencyShifter: LIT.frequencyShifter } as unknown as SessionPayload['globalAudio'];
    applySessionPayload({ ...buildSessionPayload(), globalAudio });
    const restored = useAudioStore.getState().globalAudio;
    expect(restored.tremolo).toEqual(LIT.tremolo);
    expect(restored.frequencyShifter).toEqual(LIT.frequencyShifter);
    for (const key of ['chorus', 'vibrato', 'stereoWidener'] as const) expect(restored[key], key).toEqual(DEFAULT_GLOBAL_AUDIO_SETTINGS[key]);
  });

  it('a null block is a missing one: it takes the default and nothing throws', () => {
    setupNewPedalWorld();
    const nulled = { ...buildSessionPayload().globalAudio, chorus: null, stereoWidener: null } as unknown as SessionPayload['globalAudio'];
    expect(() => applySessionPayload({ ...buildSessionPayload(), globalAudio: nulled })).not.toThrow();
    expect(useAudioStore.getState().globalAudio.chorus).toEqual(DEFAULT_GLOBAL_AUDIO_SETTINGS.chorus);
    expect(useAudioStore.getState().globalAudio.stereoWidener).toEqual(DEFAULT_GLOBAL_AUDIO_SETTINGS.stereoWidener);
  });

  it('restoring never mutates the payload, and the stored defaults are copies, not the shared constants', () => {
    setupNewPedalWorld();
    const payload = preNewPedalPayload();
    const before = JSON.stringify(payload);
    applySessionPayload(payload);
    expect(JSON.stringify(payload)).toBe(before);
    const restored = useAudioStore.getState().globalAudio;
    for (const key of NEW_KEYS) expect(restored[key], key).not.toBe(DEFAULT_GLOBAL_AUDIO_SETTINGS[key]);
  });
});
