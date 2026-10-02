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
import type { RobotAudioBaseline } from '../systems/spawnSystem';
import { useAttenuationStyleStore, selectCurrentAttenuationStyle, DEFAULT_PELAGOS } from '../stores/attenuationStyleStore';
import { generateAttenuationStyleBpm } from './bpmSeed';
import { useLocaleStore, DEFAULT_LOCALE } from '../stores/localeStore';
import { useAudioStore } from '../stores/audioStore';
import { spawnInitialRoster, spawnInitialCompanies } from '../systems/spawnSystem';
import * as worldTransition from '../systems/worldTransition';
import { stopRobotLifecycle } from '../systems/robotSystems';
import { stopAudioSwells } from '../systems/audioSwells';
import { buildSeededComposition, generateMelodyForRobot, DEFAULT_RHYTHMIC_MOTIF_LENGTH, DEFAULT_NOTE_VARIANCE, DEFAULT_PITCH_REPEAT } from '../engine/melodyGenerator';
import { RHYTHMIC_DENSITY_MAX } from '../constants';
import { ROBOT_LFO_TARGET_IDS, GLOBAL_LFO_TARGET_IDS, LFO_LANE_IDS, type RobotLfoTargetId, type LfoLink } from '../types/lfo';
import { DEFAULT_BANK_LFO, DEFAULT_LFO_LINK } from '../data/lfoConfig';
import { noteValueHz } from '../data/noteValues';
import { lfoEngine } from '../engine/lfoEngine';

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
