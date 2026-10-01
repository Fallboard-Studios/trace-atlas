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
import type { RobotAudioBaseline } from '../systems/spawnSystem';
import { ROBOT_LFO_TARGET_IDS, type RobotLfoTargetId, type LfoSettings } from '../types/lfo';
import { useAttenuationStyleStore, DEFAULT_PELAGOS } from '../stores/attenuationStyleStore';
import { useLocaleStore, DEFAULT_LOCALE } from '../stores/localeStore';
import { useAudioStore } from '../stores/audioStore';
import { spawnInitialRoster, spawnInitialCompanies } from '../systems/spawnSystem';
import * as worldTransition from '../systems/worldTransition';
import { stopRobotLifecycle } from '../systems/robotSystems';
import { stopAudioSwells } from '../systems/audioSwells';
import { buildSeededComposition, generateMelodyForRobot, DEFAULT_RHYTHMIC_MOTIF_LENGTH, DEFAULT_NOTE_VARIANCE, DEFAULT_PITCH_REPEAT } from '../engine/melodyGenerator';
import { RHYTHMIC_DENSITY_MAX } from '../constants';

afterEach(() => {
  stopRobotLifecycle();
  stopAudioSwells();
});

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

  it('stamps version: 1 and captures the current Attenuation Style name/coordinates/globalAudio', () => {
    const localeId = setupWorld();
    spawnInitialRoster(localeId);
    const payload = buildSessionPayload();
    expect(payload.version).toBe(1);
    expect(payload.attenuationStyleName).toBe(DEFAULT_PELAGOS.name);
    expect(payload.coordinates).toEqual(DEFAULT_LOCALE.coordinates);
    // globalAudio is normalized/quantized at save time, so it may differ from raw store state
    // Verify structure and key fields are present, not exact equality
    expect(Object.keys(payload.globalAudio)).toContain('compressor');
    expect(Object.keys(payload.globalAudio)).toContain('eq3');
    expect(Object.keys(payload.globalAudio)).toContain('lfoDrift');
  });

  it('quantizes globalFx and robots lfoDrift to a whole percent each, both groups independently (docs/specs/FLEET_DRIFT_CONSOLIDATION.md Task 5)', () => {
    const localeId = setupWorld();
    spawnInitialRoster(localeId);
    // Distinguishing, non-default values for both groups (not left at 0) — a
    // parity test that leaves a field at its default can pass by coincidence
    // even with a broken quantize/cleanup path (memory: parity-test fixtures
    // need real, non-default values).
    useAudioStore.getState().setGlobalLfoDrift('globalFx', { rateDrift: 0.4371, depthDrift: -0.2809 });
    useAudioStore.getState().setGlobalLfoDrift('robots', { rateDrift: -0.1234, depthDrift: 0.5678 });

    const payload = buildSessionPayload();

    expect(payload.globalAudio.lfoDrift.globalFx).toEqual({ rateDrift: 0.44, depthDrift: -0.28 });
    expect(payload.globalAudio.lfoDrift.robots).toEqual({ rateDrift: -0.12, depthDrift: 0.57 });
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

  it('captures globalLfo from audioStore, not just globalAudio', () => {
    const localeId = setupWorld();
    spawnInitialRoster(localeId);
    const edited: LfoSettings = { shape: 'square', rate: 4, depth: 60 };
    // A plain state write, not the real setGlobalLfo action -- that constructs a live Tone.LFO
    // node, which needs a real AudioContext this test environment doesn't have.
    useAudioStore.setState((s) => ({ globalLfo: { ...s.globalLfo, 'eq3.low': edited } }));

    const payload = buildSessionPayload();

    expect(payload.globalLfo?.['eq3.low']).toEqual(edited);
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

  it('migrates an old-shape lfoDrift (pre Fleet Drift Consolidation: eq3/filterLPF/filterHPF/robots, no globalFx) instead of crashing applyGlobalAudioToEngine (bug found live: power-on with a stale ?session=/saved session blanked the screen)', () => {
    const localeId = setupWorld();
    spawnInitialRoster(localeId);
    const payload = buildSessionPayload();
    // Simulate a payload persisted (localStorage named session, or a ?session= share link) before
    // this migration shipped — its own globalAudio.lfoDrift still has the old 4-group shape, cast
    // through unknown since SessionPayload's own type no longer describes this shape (the same
    // "untyped JSON from outside the app" trust boundary decodeSessionPayload's own doc comment
    // already documents for this exact field).
    const staleLfoDrift = {
      eq3: { rateDrift: 0.1, depthDrift: 0.2 },
      filterLPF: { rateDrift: 0.3, depthDrift: 0.4 },
      filterHPF: { rateDrift: 0.5, depthDrift: 0.6 },
      robots: { rateDrift: 0.7, depthDrift: 0.8 },
    };
    const stalePayload = {
      ...payload,
      globalAudio: { ...payload.globalAudio, lfoDrift: staleLfoDrift },
    } as unknown as typeof payload;

    expect(() => applySessionPayload(stalePayload)).not.toThrow();

    // robots survives untouched (it was already present); globalFx (missing from the stale
    // payload) falls back to a safe default rather than staying undefined.
    expect(useAudioStore.getState().globalAudio.lfoDrift.robots).toEqual({ rateDrift: 0.7, depthDrift: 0.8 });
    expect(useAudioStore.getState().globalAudio.lfoDrift.globalFx).toEqual({ rateDrift: 0, depthDrift: 0 });
  });

  it('drops legacy lfoSettings keys (volume, layerN.pulseWidth — removed targets) from a robot override on load, keeping the known ones', () => {
    const localeId = setupWorld();
    spawnInitialRoster(localeId);
    const robot = useLocaleStore.getState().getLocaleById(localeId)!.robots[0];
    const payload = buildSessionPayload();
    // docs/specs/LFO_LOAD_FIX.md §1.4 "Backward compatibility": a payload saved before the two
    // targets were removed can still carry them under lfoSettings — cast through unknown, same
    // trust-boundary reasoning as the stale lfoDrift case above.
    const legacyOverrides = {
      ...payload.robotOverrides,
      [robot.id]: {
        ...payload.robotOverrides[robot.id],
        lfoSettings: {
          volume: { shape: 'sine', rate: 3, depth: 50 },
          'layer1.pulseWidth': { shape: 'square', rate: 2, depth: 40 },
          'layer1.gain': { shape: 'triangle', rate: 1.5, depth: 30 },
        },
      },
    } as unknown as typeof payload.robotOverrides;

    expect(() => applySessionPayload({ ...payload, robotOverrides: legacyOverrides })).not.toThrow();

    const restored = currentLocale()!.robots.find((r) => r.id === robot.id)!;
    expect(restored.lfoSettings?.['layer1.gain']).toEqual({ shape: 'triangle', rate: 1.5, depth: 30 });
    expect('volume' in (restored.lfoSettings ?? {})).toBe(false);
    expect('layer1.pulseWidth' in (restored.lfoSettings ?? {})).toBe(false);
  });

  describe('priming on load (LFO Load Fix Task 9)', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('primes exactly the targets present in a robot override\'s lfoSettings, not the whole robot', async () => {
      const robotLfoPriming = await import('../systems/robotLfoPriming');
      const primeSpy = vi.spyOn(robotLfoPriming, 'primeRobotLfos').mockImplementation(() => {});
      const localeId = setupWorld();
      spawnInitialRoster(localeId);
      const robot = useLocaleStore.getState().getLocaleById(localeId)!.robots[0];
      const payload = buildSessionPayload();
      const overriddenPayload = {
        ...payload,
        robotOverrides: {
          ...payload.robotOverrides,
          [robot.id]: {
            ...payload.robotOverrides[robot.id],
            lfoSettings: { 'layer1.gain': { shape: 'triangle', rate: 1.5, depth: 30 } } as Partial<Record<RobotLfoTargetId, LfoSettings>>,
          },
        },
      };

      applySessionPayload(overriddenPayload);

      expect(primeSpy).toHaveBeenCalledTimes(1);
      expect(primeSpy).toHaveBeenCalledWith(expect.objectContaining({ id: robot.id }), ['layer1.gain']);
    });

    it('filters out legacy (removed) target keys before priming — never primes volume or pulseWidth', async () => {
      const robotLfoPriming = await import('../systems/robotLfoPriming');
      const primeSpy = vi.spyOn(robotLfoPriming, 'primeRobotLfos').mockImplementation(() => {});
      const localeId = setupWorld();
      spawnInitialRoster(localeId);
      const robot = useLocaleStore.getState().getLocaleById(localeId)!.robots[0];
      const payload = buildSessionPayload();
      const legacyOverrides = {
        ...payload.robotOverrides,
        [robot.id]: {
          ...payload.robotOverrides[robot.id],
          lfoSettings: {
            volume: { shape: 'sine', rate: 3, depth: 50 },
            'layer1.gain': { shape: 'triangle', rate: 1.5, depth: 30 },
          },
        },
      } as unknown as typeof payload.robotOverrides;

      applySessionPayload({ ...payload, robotOverrides: legacyOverrides });

      expect(primeSpy).toHaveBeenCalledWith(expect.objectContaining({ id: robot.id }), ['layer1.gain']);
    });

    it('does not prime a robot whose override carries no lfoSettings', async () => {
      const robotLfoPriming = await import('../systems/robotLfoPriming');
      const primeSpy = vi.spyOn(robotLfoPriming, 'primeRobotLfos').mockImplementation(() => {});
      const localeId = setupWorld();
      spawnInitialRoster(localeId);
      const robot = useLocaleStore.getState().getLocaleById(localeId)!.robots[0];
      const payload = buildSessionPayload();
      const overriddenPayload = {
        ...payload,
        robotOverrides: {
          ...payload.robotOverrides,
          [robot.id]: { ...payload.robotOverrides[robot.id], rhythmicDensity: 70 },
        },
      };

      applySessionPayload(overriddenPayload);

      expect(primeSpy).not.toHaveBeenCalled();
    });
  });

  it('applies a user-created company whose stored lastEditedOptions still carries a legacy volumeLfo (saved before the Volume LFO target was removed) without error, keeping the company and its other options', () => {
    const localeId = setupWorld();
    spawnInitialRoster(localeId);
    const payload = buildSessionPayload();
    // docs/specs/LFO_LOAD_FIX.md assumption 9: the field is gone from CompanyOptionsSnapshot, so an
    // old payload is the only way it can appear — cast through unknown, same trust-boundary
    // reasoning as the stale lfoDrift case above. The stale key is inert: never read, never thrown on.
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
    const expectedMelody = generateMelodyForRobot({
      octaveMin: restoredRobot.octaveRange[0],
      octaveMax: restoredRobot.octaveRange[1],
      rhythmicDensity: RHYTHMIC_DENSITY_MAX,
      rhythmicMotifLength: restoredRobot.rhythmicMotifLength ?? DEFAULT_RHYTHMIC_MOTIF_LENGTH,
      noteVariance: restoredRobot.noteVariance ?? DEFAULT_NOTE_VARIANCE,
      pitchRepeat: restoredRobot.pitchRepeat ?? DEFAULT_PITCH_REPEAT,
      rand: expectedRand,
    });
    const stripIds = (melody: typeof expectedMelody) => melody.map(({ id: _id, ...rest }) => rest);
    expect(stripIds(restoredRobot.melody)).toEqual(stripIds(expectedMelody));
  });

  it('restores bpm/swellFrequency/swellDuration/pingVarianceAutomation after a full save/wipe/load round trip, overriding retransmitWorld\'s own reseed', () => {
    const localeId = setupWorld();
    spawnInitialRoster(localeId);
    useAudioStore.setState({ bpm: 77, swellFrequency: 9, swellDuration: 5, pingVarianceAutomation: 0.42 });
    const payload = buildSessionPayload();

    // Wipe to different coordinates first -- retransmitWorld reseeds bpm via regenerateBpmFromSeed
    // for the new locale (a real, different noise map), so restoring afterward must override
    // whatever that reseed produced, not just coincidentally match an untouched value.
    applySessionPayload({ ...payload, coordinates: { x: payload.coordinates.x + 500, y: payload.coordinates.y + 500 } });

    applySessionPayload(payload);

    expect(useAudioStore.getState().bpm).toBe(77);
    expect(useAudioStore.getState().swellFrequency).toBe(9);
    expect(useAudioStore.getState().swellDuration).toBe(5);
    expect(useAudioStore.getState().pingVarianceAutomation).toBe(0.42);
  });

  it('leaves the freshly-seeded bpm/swellFrequency/swellDuration/pingVarianceAutomation untouched when an older payload lacks those fields', () => {
    const localeId = setupWorld();
    spawnInitialRoster(localeId);
    const payload = buildSessionPayload();
    const { bpm: _bpm, swellFrequency: _sf, swellDuration: _sd, pingVarianceAutomation: _pva, ...oldShapePayload } = payload;

    useAudioStore.setState({ bpm: 123, swellFrequency: 11, swellDuration: 8, pingVarianceAutomation: 0.9 });
    expect(() => applySessionPayload(oldShapePayload as typeof payload)).not.toThrow();

    // retransmitWorld's own reseed ran (not this field's restore code, which had nothing to
    // apply) -- just asserting it's no longer the pre-apply sentinel value proves the absent
    // fields didn't crash or silently zero anything out.
    expect(useAudioStore.getState().bpm).not.toBe(123);
  });

  it('restores globalLfo after a full save/wipe/load round trip, overriding whatever\'s currently live', () => {
    const localeId = setupWorld();
    spawnInitialRoster(localeId);
    const edited: LfoSettings = { shape: 'square', rate: 4, depth: 60 };
    // Plain state writes, not the real setGlobalLfo action -- see the capture test's own comment.
    useAudioStore.setState((s) => ({ globalLfo: { ...s.globalLfo, 'eq3.low': edited } }));
    const payload = buildSessionPayload();

    // Simulate drift since the save (a later edit, or a reseed from switching Attenuation Style
    // — regenerateGlobalLfoFromSeed has no "carry forward once edited" branch, unlike
    // bpm/swellFrequency/swellDuration, so this can happen without any user action at all).
    useAudioStore.setState((s) => ({ globalLfo: { ...s.globalLfo, 'eq3.low': { shape: 'sine' as const, rate: 0, depth: 0 } } }));

    applySessionPayload(payload, { skipLocaleRebuild: true });

    expect(useAudioStore.getState().globalLfo['eq3.low']).toEqual(edited);
  });

  it('leaves globalLfo untouched when an older payload lacks that field', () => {
    const localeId = setupWorld();
    spawnInitialRoster(localeId);
    const payload = buildSessionPayload();
    const { globalLfo: _globalLfo, ...oldShapePayload } = payload;
    const current = useAudioStore.getState().globalLfo;

    expect(() => applySessionPayload(oldShapePayload as typeof payload, { skipLocaleRebuild: true })).not.toThrow();

    expect(useAudioStore.getState().globalLfo).toEqual(current);
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
