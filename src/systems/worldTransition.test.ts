// ========================================
// MOCKS
// ========================================
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../engine/beatClock', () => ({
  subscribeToMeasure: vi.fn(() => vi.fn()), // robotSystems.ts's own lifecycle tick
  getCurrentMeasure: vi.fn(() => 0),
  scheduleRepeat: vi.fn(() => 'schedule-id'), // audioSwells.ts's own 16n lifecycle tick
  cancelSchedule: vi.fn(),
  getCurrentMeasurePrecise: vi.fn(() => 0),
}));

// Spy on recolorActorsForAttenuationStyle while keeping every other export
// (createFactory, ...) real — initializeLocale/placeDistrict must keep
// spawning real factories for the other describe blocks below.
vi.mock('./factoryPlacementSystem', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./factoryPlacementSystem')>();
  return { ...actual, recolorActorsForAttenuationStyle: vi.fn(actual.recolorActorsForAttenuationStyle) };
});

// band-table T25 (docs/specs/OFF_SCREEN.md assumption 10): a theme or aspects change regenerates the global half under
// the new bands and rebuilds the robots at the same identity. The direction is proved on injected columns, whatever the
// real placeholders hold (plan Task 34 filled them, Task 35 tunes them): Calm moves the tempo, the LPF cutoff and the
// density band here, and Wandering is an EMPTY option, so a Calm world with that pick is drawn under Calm's density
// alone; the other options keep their real columns. Over the spread originals.
vi.mock('../data/bands/themes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../data/bands/themes')>();
  return {
    ...actual,
    THEMES: {
      ...actual.THEMES,
      float: {
        bpm: { min: 150, max: 160 },
        'filterLPF.frequency': { min: 500, max: 600 },
        'robot.rhythmicDensity': { min: 90, max: 100 },
        // Attacks the attack rail never narrows the 90-100 under, even at this tempo (audibleDensityBand).
        'robot.attack': { min: 0.015, max: 0.015 },
        'robot.shapedAttack': { min: 0.015, max: 0.015, lit: 0.155 },
      },
    },
  };
});
vi.mock('../data/bands/aspects', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../data/bands/aspects')>();
  const melody = actual.ASPECT_FAMILIES.melody;
  return {
    ...actual,
    ASPECT_FAMILIES: { ...actual.ASPECT_FAMILIES, melody: { ...melody, options: { ...melody.options, wandering: {} } } },
  };
});

// ========================================
// IMPORTS
// ========================================
import { useLocaleStore, DEFAULT_LOCALE, DEFAULT_LOCALE_ID } from '../stores/localeStore';
import { useAttenuationStyleStore, selectCurrentAttenuationStyle, DEFAULT_PELAGOS } from '../stores/attenuationStyleStore';
import { useUIStore } from '../stores/uiStore';
import { useAudioStore } from '../stores/audioStore';
import { DEFAULT_LOADING, useLoadingStore } from '../stores/loadingStore';
import type { AspectIdOf } from '../data/bands/aspects';
import { getWorldState, setWorldState } from './worldState';
import { AudioEngine } from '../engine/AudioEngine';
import { getLocaleNoiseMap, tryGetLocaleNoiseMap } from '../utils/noiseMaps';
import { getSeededVal } from '../utils/getSeededVal';
import { generateAttenuationStyleBpm } from '../utils/bpmSeed';
import { buildSessionPayload } from '../utils/sessionDiff';
import { initializeLocale, retransmitWorld, startLocaleSystems } from './worldTransition';
import { getCurrentMeasure } from '../engine/beatClock';
import { lfoEngine } from '../engine/lfoEngine';
import * as lfoShared from '../engine/lfoShared';
import { allowedLaneNoteValues, resolveLaneForEngine, resolveLaneRateHz } from '../utils/tempoSync';
import { withLoading } from '../data/bands/loadingContext';
import { NOTE_VALUES } from '../data/noteValues';
import { deepEqual } from '../utils/math';
import { generateGlobalAudioSettings, generateLfoBankSettings, generateGlobalLfoLinks } from '../utils/globalAudioSeed';
import { GLOBAL_LFO_TARGET_IDS, LFO_LANE_IDS } from '../types/lfo';
import { recolorActorsForAttenuationStyle } from './factoryPlacementSystem';
import { stopRobotLifecycle } from './robotSystems';
import { stopAudioSwells } from './audioSwells';
import * as audioSwellsModule from './audioSwells';
import * as workLoopModule from './workLoop';
import * as robotSystemsModule from './robotSystems';
import { MAX_ROBOTS } from '../constants';
import { computeLocaleHour, DAY_DURATION_MS } from '../constants/time';
import { DockingState, JobType } from '../types/Robot';
import type { Robot } from '../types/Robot';

// ========================================
// HELPERS
// ========================================

function resetStores() {
  useAttenuationStyleStore.setState({ attenuationStyles: [{ ...DEFAULT_PELAGOS }], currentAttenuationStyleId: DEFAULT_PELAGOS.id });
  useLocaleStore.setState({ locales: { [DEFAULT_LOCALE_ID]: { ...DEFAULT_LOCALE, robots: [], actors: [] } } });
  useUIStore.setState({ selectedRobotId: null, activeHubTile: null, isPoweredOn: false });
}

const makeRobot = (id: string): Robot => ({
  id,
  compositionSeed: 0.5,
  identityColor: '#428d95',
  gemSeed: 1,
  position: { x: 0, y: 0 },
  melody: [],
  audioAttributes: { waveform: 'sine', adsr: { attack: 0, decay: 0, sustain: 0, release: 0 }, filterFreq: 0 },
  octaveRange: [3, 4],
  masterVolume: 0.7,
  pan: 0,
  panAuto: true,
  reverbSend: 0,
  delaySend: 0,
  gritSend: 0,
  shimmerSend: 0,
  doubleSend: 0,
  docking: DockingState.Active,
  activity: 'exiting',
  batteryLevel: 100,
});

// ========================================
// TESTS
// ========================================

describe('worldTransition', () => {
  beforeEach(() => {
    resetStores();
    vi.clearAllMocks();
  });

  afterEach(() => {
    stopRobotLifecycle();
    stopAudioSwells();
    workLoopModule.stopWorkLoop();
    useLoadingStore.getState().setLoading(DEFAULT_LOADING);
  });

  describe('initializeLocale', () => {
    it(`places factories and spawns exactly ${MAX_ROBOTS} robots for an empty locale`, () => {
      initializeLocale(DEFAULT_LOCALE_ID);
      const locale = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)!;
      expect(locale.actors.length).toBeGreaterThan(0);
      expect(locale.robots).toHaveLength(MAX_ROBOTS);
    });

    it('assigns no job at load — the work loop picks each robot\'s first job at its first site (Phase 43 Task 23)', () => {
      initializeLocale(DEFAULT_LOCALE_ID);
      const locale = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)!;
      expect(locale.robots.some((r) => r.docking === DockingState.Active)).toBe(true);
      for (const r of locale.robots) expect(r.job).toBeUndefined();
    });

    it('calls stopWorkLoop then startWorkLoop(localeId), after the world and roster exist (Phase 43 Task 23)', () => {
      const stopSpy = vi.spyOn(workLoopModule, 'stopWorkLoop');
      const startSpy = vi.spyOn(workLoopModule, 'startWorkLoop').mockImplementation((id) => {
        const locale = useLocaleStore.getState().getLocaleById(id)!;
        seenAtStart = { actors: locale.actors.length, robots: locale.robots.length };
      });
      let seenAtStart = { actors: 0, robots: 0 };
      try {
        initializeLocale(DEFAULT_LOCALE_ID);

        expect(stopSpy).toHaveBeenCalledTimes(1);
        expect(startSpy).toHaveBeenCalledTimes(1);
        expect(startSpy).toHaveBeenCalledWith(DEFAULT_LOCALE_ID);
        expect(stopSpy.mock.invocationCallOrder[0]).toBeLessThan(startSpy.mock.invocationCallOrder[0]);
        expect(seenAtStart.actors).toBeGreaterThan(0);
        expect(seenAtStart.robots).toBe(MAX_ROBOTS);
      } finally {
        startSpy.mockRestore();
        stopSpy.mockRestore();
      }
    });

    it('restarts the work loop on a second call too (a power-on or a retransmit at the same locale)', () => {
      const startSpy = vi.spyOn(workLoopModule, 'startWorkLoop');
      initializeLocale(DEFAULT_LOCALE_ID);
      initializeLocale(DEFAULT_LOCALE_ID);
      expect(startSpy).toHaveBeenCalledTimes(2);
    });

    it('is a no-op for factories/robots when called again on an already-populated locale', () => {
      initializeLocale(DEFAULT_LOCALE_ID);
      const afterFirst = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)!;
      const actorsAfterFirst = afterFirst.actors;
      const robotsAfterFirst = afterFirst.robots;

      initializeLocale(DEFAULT_LOCALE_ID);
      const afterSecond = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)!;

      expect(afterSecond.actors).toBe(actorsAfterFirst);
      expect(afterSecond.robots).toBe(robotsAfterFirst);
    });

    it('still restarts the robot lifecycle tick on a second call, even when idempotent on factories/robots', async () => {
      const { subscribeToMeasure } = await import('../engine/beatClock');
      initializeLocale(DEFAULT_LOCALE_ID);
      initializeLocale(DEFAULT_LOCALE_ID);
      expect(subscribeToMeasure).toHaveBeenCalledTimes(2);
    });

    it('also restarts the audio swells tick (its own 16n schedule, not subscribeToMeasure) on a second call', async () => {
      const { scheduleRepeat } = await import('../engine/beatClock');
      initializeLocale(DEFAULT_LOCALE_ID);
      initializeLocale(DEFAULT_LOCALE_ID);
      expect(scheduleRepeat).toHaveBeenCalledTimes(2);
    });

    it('calls stopAudioSwells then startAudioSwells(localeId), alongside the existing robot-lifecycle restart', () => {
      const stopSpy = vi.spyOn(audioSwellsModule, 'stopAudioSwells');
      const startSpy = vi.spyOn(audioSwellsModule, 'startAudioSwells');

      initializeLocale(DEFAULT_LOCALE_ID);

      expect(stopSpy).toHaveBeenCalledTimes(1);
      expect(startSpy).toHaveBeenCalledWith(DEFAULT_LOCALE_ID);
      expect(stopSpy.mock.invocationCallOrder[0]).toBeLessThan(startSpy.mock.invocationCallOrder[0]);
    });

    it('does nothing for an unknown locale id', () => {
      expect(() => initializeLocale('nonexistent')).not.toThrow();
    });

    it('populates companies for an empty locale, immediately after spawning the roster', () => {
      initializeLocale(DEFAULT_LOCALE_ID);
      const locale = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)!;
      expect(locale.companies.length).toBeGreaterThan(0);
    });

    it('is a no-op for companies when called again on an already-populated locale', () => {
      initializeLocale(DEFAULT_LOCALE_ID);
      const companiesAfterFirst = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)!.companies;

      initializeLocale(DEFAULT_LOCALE_ID);
      const companiesAfterSecond = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)!.companies;

      expect(companiesAfterSecond).toBe(companiesAfterFirst);
    });
  });

  // Power is a pause (docs/specs/OFF_SCREEN.md assumption 5, docs/tasks/OFF_SCREEN.md Task 8): the world's run state
  // follows the one place that builds it — systems held means a cold world (the next flip starts), systems started
  // means a running one — so a world replaced while the tablet was paused is cold, and a live Retransmit stays running.
  describe('the world state the power rocker reads', () => {
    beforeEach(() => setWorldState('paused'));

    it('initializeLocale with the systems held leaves a cold world', () => {
      initializeLocale(DEFAULT_LOCALE_ID, { startSystems: false });
      expect(getWorldState()).toBe('cold');
    });

    it('initializeLocale that starts the systems leaves a running world', () => {
      initializeLocale(DEFAULT_LOCALE_ID);
      expect(getWorldState()).toBe('running');
    });

    it('a coordinates retransmit while the tablet is off (a pick on the off screen during a pause) leaves a cold world', () => {
      useUIStore.setState({ isPoweredOn: false });
      retransmitWorld({ coordinates: { x: 1000, y: 2000 } });
      expect(getWorldState()).toBe('cold');
    });

    it('a coordinates retransmit while the tablet is on (Foundry\'s Retransmit) leaves a running world', () => {
      useUIStore.setState({ isPoweredOn: true });
      retransmitWorld({ coordinates: { x: 1000, y: 2000 } });
      expect(getWorldState()).toBe('running');
    });

    it('an Attenuation-Style-only retransmit rebuilds nothing and leaves the state as it was', () => {
      useUIStore.setState({ isPoweredOn: false });
      retransmitWorld({ attenuationStyleName: 'another-style' });
      expect(getWorldState()).toBe('paused');
    });
  });

  describe('retransmitWorld — no-op', () => {
    it('makes zero store mutations and zero AudioEngine/selectRobot calls when neither field is set', () => {
      const releaseVoiceSpy = vi.spyOn(AudioEngine, 'releaseVoice');
      const selectRobotSpy = vi.spyOn(useUIStore.getState(), 'selectRobot');
      const attenuationStylesBefore = useAttenuationStyleStore.getState().attenuationStyles;
      const localesBefore = useLocaleStore.getState().locales;

      retransmitWorld({});

      expect(useAttenuationStyleStore.getState().attenuationStyles).toBe(attenuationStylesBefore);
      expect(useLocaleStore.getState().locales).toBe(localesBefore);
      expect(releaseVoiceSpy).not.toHaveBeenCalled();
      expect(selectRobotSpy).not.toHaveBeenCalled();

      releaseVoiceSpy.mockRestore();
      selectRobotSpy.mockRestore();
    });
  });

  describe('retransmitWorld — coordinates changed, Attenuation Style preserved', () => {
    it('never touches currentAttenuationStyleId, leaving Audio Rig/LFO state untouched', () => {
      const globalAudioBefore = useAudioStore.getState().globalAudio;
      const attenuationStyleIdBefore = useAttenuationStyleStore.getState().currentAttenuationStyleId;

      retransmitWorld({ coordinates: { x: 1000, y: 2000 } });

      expect(useAttenuationStyleStore.getState().currentAttenuationStyleId).toBe(attenuationStyleIdBefore);
      expect(useAudioStore.getState().globalAudio).toBe(globalAudioBefore);
    });

    it('creates a new locale at the new coordinates and releases the old locale\'s robots', () => {
      // Give the old (default) locale a robot to verify cleanup.
      useLocaleStore.getState().addRobot(DEFAULT_LOCALE_ID, makeRobot('old-robot'));
      const releaseVoiceSpy = vi.spyOn(AudioEngine, 'releaseVoice');

      retransmitWorld({ coordinates: { x: 1000, y: 2000 } });

      const attenuationStyle = selectCurrentAttenuationStyle(useAttenuationStyleStore.getState())!;
      expect(attenuationStyle.currentLocaleId).not.toBe(DEFAULT_LOCALE_ID);
      const newLocale = useLocaleStore.getState().getLocaleById(attenuationStyle.currentLocaleId!)!;
      expect(newLocale.coordinates).toEqual({ x: 1000, y: 2000 });
      expect(newLocale.robots).toHaveLength(MAX_ROBOTS);
      expect(useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)).toBeUndefined();
      expect(releaseVoiceSpy).toHaveBeenCalledWith('old-robot');

      releaseVoiceSpy.mockRestore();
    });

    it('the decoupling guarantee: the new locale\'s noise map matches what those coordinates produce independent of Attenuation Style', () => {
      retransmitWorld({ coordinates: { x: 1000, y: 2000 } });
      const attenuationStyle = selectCurrentAttenuationStyle(useAttenuationStyleStore.getState())!;
      const newLocale = useLocaleStore.getState().getLocaleById(attenuationStyle.currentLocaleId!)!;

      const independentMap = getLocaleNoiseMap('independent-check-locale', 1000, 2000);
      const actualMap = getLocaleNoiseMap(newLocale.id, 1000, 2000); // already cached — returns the same map

      expect(getSeededVal(actualMap, 'robot.audio.attack')).toBe(getSeededVal(independentMap, 'robot.audio.attack'));
    });

    it('clears selectedRobotId but leaves activeHubTile untouched', () => {
      useUIStore.setState({ selectedRobotId: 'some-robot', activeHubTile: 'audioRig' });
      retransmitWorld({ coordinates: { x: 1000, y: 2000 } });
      expect(useUIStore.getState().selectedRobotId).toBeNull();
      expect(useUIStore.getState().activeHubTile).toBe('audioRig');
    });

    // Companies are regenerated with fresh ids on a reseed, so a previously selected company id
    // would dangle (empty robot list, no button checked) — selection falls back to "All".
    it('resets a selected company back to All, since the new locale gets fresh company ids', () => {
      useUIStore.getState().selectCompany('company-from-the-old-locale');
      retransmitWorld({ coordinates: { x: 1000, y: 2000 } });
      expect(useUIStore.getState().allRobotsSelected).toBe(true);
      expect(useUIStore.getState().selectedCompanyId).toBeNull();
    });

    it('leaves the selection alone on a no-op retransmit', () => {
      useUIStore.getState().selectCompany('company-x');
      retransmitWorld({});
      expect(useUIStore.getState().selectedCompanyId).toBe('company-x');
    });

    it("stamps the new locale's dayStartTimestamp reading abs(x % 24) immediately (buildLocale, positive x)", () => {
      retransmitWorld({ coordinates: { x: 1000, y: 2000 } });
      const attenuationStyle = selectCurrentAttenuationStyle(useAttenuationStyleStore.getState())!;
      const newLocale = useLocaleStore.getState().getLocaleById(attenuationStyle.currentLocaleId!)!;
      expect(computeLocaleHour(newLocale.dayStartTimestamp)).toBeCloseTo(Math.abs(1000 % 24), 0);
    });

    it("stamps the new locale's dayStartTimestamp correctly for a negative x too (buildLocale)", () => {
      retransmitWorld({ coordinates: { x: -37, y: 5 } });
      const attenuationStyle = selectCurrentAttenuationStyle(useAttenuationStyleStore.getState())!;
      const newLocale = useLocaleStore.getState().getLocaleById(attenuationStyle.currentLocaleId!)!;
      expect(computeLocaleHour(newLocale.dayStartTimestamp)).toBeCloseTo(Math.abs(-37 % 24), 0);
    });

    it('builds a locale with no per-measure field — the day is wall-clock, nothing mirrors a measure into the Locale (roadmap 48)', () => {
      retransmitWorld({ coordinates: { x: 1000, y: 2000 } });
      const attenuationStyle = selectCurrentAttenuationStyle(useAttenuationStyleStore.getState())!;
      const newLocale = useLocaleStore.getState().getLocaleById(attenuationStyle.currentLocaleId!)!;
      expect(newLocale).not.toHaveProperty('currentMeasure');
    });

    it("stamps the new locale's createdAtMeasure from getCurrentMeasure() at construction time (World Clock, docs/specs/WORLD_CLOCK_DETERMINISTIC_LIFECYCLE_REPLAY.md)", () => {
      vi.mocked(getCurrentMeasure).mockReturnValue(137);
      retransmitWorld({ coordinates: { x: 1000, y: 2000 } });
      const attenuationStyle = selectCurrentAttenuationStyle(useAttenuationStyleStore.getState())!;
      const newLocale = useLocaleStore.getState().getLocaleById(attenuationStyle.currentLocaleId!)!;
      expect(newLocale.createdAtMeasure).toBe(137);
    });

    it('never calls recolorActorsForAttenuationStyle — this branch never changes the AS', () => {
      retransmitWorld({ coordinates: { x: 1000, y: 2000 } });
      expect(recolorActorsForAttenuationStyle).not.toHaveBeenCalled();
    });

    it('does NOT reseed audioStore.bpm — BPM follows the Attenuation Style, which a coordinates move never changes (docs/specs/FREE_SYNC_TOGGLE.md §1.7)', () => {
      useAudioStore.getState().setBPM(190); // outside the [40, 100] seed range, so any drift is unambiguous
      retransmitWorld({ coordinates: { x: 1000, y: 2000 } });
      expect(useAudioStore.getState().bpm).toBe(190);
    });

    it('keeps a hand-dragged bpm across repeated coordinate moves', () => {
      useAudioStore.getState().setBPM(45);
      retransmitWorld({ coordinates: { x: 1000, y: 2000 } });
      retransmitWorld({ coordinates: { x: -37, y: 5 } });
      expect(useAudioStore.getState().bpm).toBe(45);
    });
  });

  describe('retransmitWorld — reload at unchanged coordinates (regression: same-id voice collision)', () => {
    it('every robot in the reloaded roster has a composite voice reserved -- old-locale cleanup must not delete the new one\'s voices, since deterministic ids make old and new robots share ids at unchanged coordinates', () => {
      initializeLocale(DEFAULT_LOCALE_ID);
      const coordinates = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)!.coordinates;

      retransmitWorld({ coordinates });

      const attenuationStyle = selectCurrentAttenuationStyle(useAttenuationStyleStore.getState())!;
      const newLocale = useLocaleStore.getState().getLocaleById(attenuationStyle.currentLocaleId!)!;
      expect(newLocale.robots).toHaveLength(MAX_ROBOTS);
      for (const robot of newLocale.robots) {
        expect(AudioEngine.getVoiceForRobot(robot.id)).not.toBeNull();
      }
    });

    it('releases the old locale\'s voices before reserving the new locale\'s voices, not after', () => {
      initializeLocale(DEFAULT_LOCALE_ID);
      const coordinates = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)!.coordinates;
      const releaseSpy = vi.spyOn(AudioEngine, 'releaseVoice');
      const reserveSpy = vi.spyOn(AudioEngine, 'reserveVoice');

      retransmitWorld({ coordinates });

      const firstReleaseOrder = releaseSpy.mock.invocationCallOrder[0];
      const firstReserveOrder = reserveSpy.mock.invocationCallOrder[0];
      expect(firstReleaseOrder).toBeDefined();
      expect(firstReserveOrder).toBeDefined();
      expect(firstReleaseOrder!).toBeLessThan(firstReserveOrder!);

      releaseSpy.mockRestore();
      reserveSpy.mockRestore();
    });
  });

  // docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R4: a rebuild builds its locale under a fresh id and makes it current only
  // afterwards, so a lookup in the active locale misses every new robot while the deal runs. The deal hands its robot to
  // reReserveVoice, so each Voice-dealt robot's voice is rebuilt from the dealt layers the store now holds.
  describe('retransmitWorld — the deal rebuilds every Voice-dealt voice during the rebuild (review R4)', () => {
    afterEach(() => {
      vi.restoreAllMocks();
      window.history.replaceState({}, '', '/');
    });

    it.each([
      ['a coordinates retransmit', { coordinates: { x: 500, y: 500 } }],
      ['a name change carrying a theme, which rebuilds the plot in place', { attenuationStyleName: 'Brinemouth', theme: 'float' as const }],
    ])('%s: reserveVoice runs a second time for each robot, with the dealt layers the store holds', (_label, input) => {
      useLoadingStore.getState().setLoading({ theme: 'classic', aspects: { voice: ['glassy'] } });
      initializeLocale(DEFAULT_LOCALE_ID, { startSystems: false });
      const reserve = vi.spyOn(AudioEngine, 'reserveVoice').mockImplementation(() => true);

      retransmitWorld(input);

      const style = selectCurrentAttenuationStyle(useAttenuationStyleStore.getState())!;
      expect(style.currentLocaleId).not.toBe(DEFAULT_LOCALE_ID);
      const robots = useLocaleStore.getState().getLocaleById(style.currentLocaleId!)!.robots;
      expect(robots).toHaveLength(MAX_ROBOTS);
      const layersPassed = (id: string) => reserve.mock.calls.filter(([robotId]) => robotId === id).map((call) => call[1]);
      for (const robot of robots) {
        expect(robot.loadedUnder, robot.id).toEqual({ voice: 'glassy' });
        const passed = layersPassed(robot.id);
        expect(passed, robot.id).toHaveLength(2);
        expect(passed[1], robot.id).toEqual(robot.audioAttributes.layers);
      }
      // The parity rule: Glassy moves some robot off its spawn layers, so the second call cannot match by coincidence.
      expect(robots.some((robot) => JSON.stringify(layersPassed(robot.id)[0]) !== JSON.stringify(robot.audioAttributes.layers))).toBe(true);
    });

    // docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R5: the same lookup used to strip every melody registered during a rebuild
    // of its motif accents. A window's opening note, with no mark or rest of its own, schedules the group accent alone.
    it('after a live retransmit, every motif-active robot\'s window opening carries the group accent', () => {
      useUIStore.setState({ isPoweredOn: true });
      initializeLocale(DEFAULT_LOCALE_ID);
      retransmitWorld({ coordinates: { x: 500, y: 500 } });
      const style = selectCurrentAttenuationStyle(useAttenuationStyleStore.getState())!;
      const robots = useLocaleStore.getState().getLocaleById(style.currentLocaleId!)!.robots;
      const openings = robots.flatMap((robot) => {
        const motif = robot.rhythmicMotifLength;
        if (!motif?.active || robot.clickTrackActive) return [];
        const opening = robot.melody.filter((e) => e.startStep <= motif.value).sort((a, b) => a.startStep - b.startStep)[0];
        return opening && opening.mark === undefined && opening.rest === undefined ? [{ robot, step: opening.startStep }] : [];
      });
      expect(openings.length, 'a motif-active robot whose first window opens on a plain note').toBeGreaterThan(0);
      const schedule = vi.spyOn(AudioEngine, 'scheduleNote').mockImplementation(() => {});
      for (const { robot, step } of openings) {
        schedule.mockClear();
        AudioEngine.processMelodyStep({ sixteenth: step - 1, measure: 0, step }, 0);
        const note = schedule.mock.calls.map(([params]) => params).find((params) => params.robotId === robot.id);
        expect(note?.accentMultiplier, robot.id).toBe(1.25);
      }
    });
  });

  describe('retransmitWorld — Attenuation Style changed, coordinates preserved', () => {
    it('re-parents the SAME locale record onto the new Attenuation Style, unchanged', () => {
      useLocaleStore.getState().addRobot(DEFAULT_LOCALE_ID, makeRobot('kept-robot'));
      const robotsBefore = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)!.robots;
      const releaseVoiceSpy = vi.spyOn(AudioEngine, 'releaseVoice');

      retransmitWorld({ attenuationStyleName: 'Kryndara Prime' });

      const attenuationStyle = selectCurrentAttenuationStyle(useAttenuationStyleStore.getState())!;
      expect(attenuationStyle.id).not.toBe(DEFAULT_PELAGOS.id);
      expect(attenuationStyle.name).toBe('Kryndara Prime');
      expect(attenuationStyle.currentLocaleId).toBe(DEFAULT_LOCALE_ID);

      const locale = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)!;
      expect(locale.robots).toBe(robotsBefore); // same array reference — not regenerated
      expect(locale.attenuationStyleId).toBe(attenuationStyle.id);
      expect(releaseVoiceSpy).not.toHaveBeenCalled(); // preserved locale's robots are NOT released

      releaseVoiceSpy.mockRestore();
    });

    it('reseeds Audio Rig/global LFO state for the new Attenuation Style', () => {
      const globalAudioBefore = useAudioStore.getState().globalAudio;
      retransmitWorld({ attenuationStyleName: 'Halcyon Drift' });
      expect(useAudioStore.getState().globalAudio).not.toBe(globalAudioBefore);
    });

    it('discards the old Attenuation Style record', () => {
      retransmitWorld({ attenuationStyleName: 'The Rusting' });
      expect(useAttenuationStyleStore.getState().attenuationStyles.find((p) => p.id === DEFAULT_PELAGOS.id)).toBeUndefined();
    });

    it('re-warms the preserved locale\'s noise map — removeAttenuationStyle\'s eviction cascade would otherwise leave it uncached', () => {
      // DEFAULT_PELAGOS.locales lists DEFAULT_LOCALE_ID, so removeAttenuationStyle's
      // cascade evicts it even though this branch is keeping the locale —
      // without a re-warm, AudioEngine's non-throwing tryGetLocaleNoiseMap
      // lookup would see a gap until the next scheduled spawn tick.
      retransmitWorld({ attenuationStyleName: 'Kryndara' });
      expect(tryGetLocaleNoiseMap(DEFAULT_LOCALE_ID)).not.toBeNull();
    });

    it('the re-warmed noise map matches the decoupling guarantee (same as any fresh lookup at the same coordinates)', () => {
      retransmitWorld({ attenuationStyleName: 'Kryndara' });
      const rewarmed = tryGetLocaleNoiseMap(DEFAULT_LOCALE_ID)!;
      const independent = getLocaleNoiseMap('independent-check-locale-2', DEFAULT_LOCALE.coordinates.x, DEFAULT_LOCALE.coordinates.y);
      expect(getSeededVal(rewarmed, 'robot.audio.attack')).toBe(getSeededVal(independent, 'robot.audio.attack'));
    });

    it("does NOT change the preserved locale's dayStartTimestamp — the inversion this phase's spec flags as easiest to get backwards", () => {
      const before = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)!.dayStartTimestamp;
      retransmitWorld({ attenuationStyleName: 'Kryndara' });
      const after = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)!.dayStartTimestamp;
      expect(after).toBe(before); // byte-identical, not just "close enough"
    });

    it('calls recolorActorsForAttenuationStyle exactly once, with the preserved locale id and the NEW attenuationStyle id/name', () => {
      retransmitWorld({ attenuationStyleName: 'Kryndara' });
      const attenuationStyle = selectCurrentAttenuationStyle(useAttenuationStyleStore.getState())!;
      expect(recolorActorsForAttenuationStyle).toHaveBeenCalledTimes(1);
      expect(recolorActorsForAttenuationStyle).toHaveBeenCalledWith(DEFAULT_LOCALE_ID, attenuationStyle.id, attenuationStyle.name);
    });

    it("reseeds audioStore.bpm from the NEW Attenuation Style's own id/name, discarding a hand-dragged value (docs/specs/FREE_SYNC_TOGGLE.md §1.7)", () => {
      useAudioStore.getState().setBPM(190); // outside the seed range, so any drift is unambiguous
      retransmitWorld({ attenuationStyleName: 'Kryndara' });
      const attenuationStyle = selectCurrentAttenuationStyle(useAttenuationStyleStore.getState())!;
      expect(attenuationStyle.name).toBe('Kryndara');
      expect(useAudioStore.getState().bpm).toBe(generateAttenuationStyleBpm(attenuationStyle.id, attenuationStyle.name));
    });

    it("preserves every factory's id/position/scale — only hueShift/satShift may change, per recolorActorsForAttenuationStyle", () => {
      initializeLocale(DEFAULT_LOCALE_ID); // real placeDistrict — populates real actors
      const before = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)!.actors;
      expect(before.length).toBeGreaterThan(0);

      retransmitWorld({ attenuationStyleName: 'Halcyon Drift' });

      const after = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)!.actors;
      expect(after.length).toBe(before.length);
      before.forEach((b, i) => {
        const a = after[i];
        expect(a.id).toBe(b.id);
        expect(a.position).toEqual(b.position);
        expect(a.scaleX).toBe(b.scaleX);
        expect(a.scaleY).toBe(b.scaleY);
        expect(a.config?.row).toBe(b.config?.row);
      });
    });
  });

  describe('retransmitWorld — Attenuation Style name collision (backlog.md #16)', () => {
    // Simulates "multiple named worlds open in the same session" (backlog.md #16's own
    // not-covered case): a second Attenuation Style, not the currently active one, already holds
    // the name the retransmit is about to submit. addAttenuationStyle refuses silently (returns
    // false) on a name collision — the old createNewAttenuationStyle ignored that return value
    // entirely and proceeded as if a phantom, never-added AttenuationStyle had been created:
    // setCurrentAttenuationStyleId pointed at an id matching nothing in `attenuationStyles`, and
    // finalizeAttenuationStyleTransition's removeAttenuationStyle(oldAttenuationStyle) deleted the
    // one real entry that still mattered — attenuationStyles ends up NEITHER containing the
    // phantom NOR the old entry, and selectCurrentAttenuationStyle dangles to undefined from then
    // on. The fix reuses the real, already-in-the-store existing entry instead.
    it('reuses the existing Attenuation Style instead of corrupting the store', () => {
      const existing = { id: 'existing-collider-id', name: 'Collider', locales: [] };
      useAttenuationStyleStore.setState((s) => ({ attenuationStyles: [...s.attenuationStyles, existing] }));

      retransmitWorld({ attenuationStyleName: 'Collider' });

      const current = selectCurrentAttenuationStyle(useAttenuationStyleStore.getState());
      expect(current).toBeDefined(); // not dangling/corrupted
      expect(current!.id).toBe('existing-collider-id');
      expect(current!.name).toBe('Collider');
      // The real pre-existing entry survives; the old (default) one is gone; no phantom appears.
      expect(useAttenuationStyleStore.getState().attenuationStyles.map((p) => p.id)).toEqual(['existing-collider-id']);
    });

    it('matches case-insensitively, same as addAttenuationStyle\'s own collision check', () => {
      const existing = { id: 'existing-id', name: 'collider', locales: [] };
      useAttenuationStyleStore.setState((s) => ({ attenuationStyles: [...s.attenuationStyles, existing] }));

      retransmitWorld({ attenuationStyleName: 'COLLIDER' });

      expect(selectCurrentAttenuationStyle(useAttenuationStyleStore.getState())?.id).toBe('existing-id');
    });

    it('re-parents the preserved locale onto the existing (reused) Attenuation Style, not a phantom one', () => {
      const existing = { id: 'existing-id', name: 'Collider', locales: [] };
      useAttenuationStyleStore.setState((s) => ({ attenuationStyles: [...s.attenuationStyles, existing] }));

      retransmitWorld({ attenuationStyleName: 'Collider' });

      const locale = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)!;
      expect(locale.attenuationStyleId).toBe('existing-id');
    });

    it('does not collide with itself when the submitted name matches the CURRENTLY active style (the already-worked-around same-name-resubmission case) — still a true no-corruption pass-through', () => {
      retransmitWorld({ attenuationStyleName: DEFAULT_PELAGOS.name });

      const current = selectCurrentAttenuationStyle(useAttenuationStyleStore.getState());
      expect(current).toBeDefined();
    });
  });

  describe('retransmitWorld — both changed (full reset)', () => {
    it('creates a new Attenuation Style and a new locale, releasing the old locale\'s robots first', () => {
      useLocaleStore.getState().addRobot(DEFAULT_LOCALE_ID, makeRobot('discarded-robot'));
      const releaseVoiceSpy = vi.spyOn(AudioEngine, 'releaseVoice');

      retransmitWorld({ attenuationStyleName: 'Vessport Null', coordinates: { x: 42, y: 42 } });

      const attenuationStyle = selectCurrentAttenuationStyle(useAttenuationStyleStore.getState())!;
      expect(attenuationStyle.id).not.toBe(DEFAULT_PELAGOS.id);
      expect(attenuationStyle.name).toBe('Vessport Null');
      const locale = useLocaleStore.getState().getLocaleById(attenuationStyle.currentLocaleId!)!;
      expect(locale.coordinates).toEqual({ x: 42, y: 42 });
      expect(locale.robots).toHaveLength(MAX_ROBOTS);
      expect(releaseVoiceSpy).toHaveBeenCalledWith('discarded-robot');
      expect(useAttenuationStyleStore.getState().attenuationStyles.find((p) => p.id === DEFAULT_PELAGOS.id)).toBeUndefined();

      releaseVoiceSpy.mockRestore();
    });

    it("stamps the new locale's dayStartTimestamp reading abs(x % 24) immediately (buildLocale)", () => {
      retransmitWorld({ attenuationStyleName: 'Vessport Null', coordinates: { x: 42, y: 42 } });
      const attenuationStyle = selectCurrentAttenuationStyle(useAttenuationStyleStore.getState())!;
      const locale = useLocaleStore.getState().getLocaleById(attenuationStyle.currentLocaleId!)!;
      expect(computeLocaleHour(locale.dayStartTimestamp)).toBeCloseTo(Math.abs(42 % 24), 0);
    });

    it('never calls recolorActorsForAttenuationStyle — the old locale is discarded, not recolored', () => {
      retransmitWorld({ attenuationStyleName: 'Vessport Null', coordinates: { x: 42, y: 42 } });
      expect(recolorActorsForAttenuationStyle).not.toHaveBeenCalled();
    });

    it("reseeds audioStore.bpm from the new Attenuation Style's own id/name, discarding a hand-dragged value (docs/specs/FREE_SYNC_TOGGLE.md §1.7)", () => {
      useAudioStore.getState().setBPM(190); // outside the seed range, so any drift is unambiguous
      retransmitWorld({ attenuationStyleName: 'Vessport Null', coordinates: { x: 42, y: 42 } });
      const attenuationStyle = selectCurrentAttenuationStyle(useAttenuationStyleStore.getState())!;
      expect(useAudioStore.getState().bpm).toBe(generateAttenuationStyleBpm(attenuationStyle.id, attenuationStyle.name));
    });
  });

  describe('robot lifecycle tick ordering', () => {
    it('stops the previous tick before starting the new locale\'s', async () => {
      const { subscribeToMeasure } = await import('../engine/beatClock');
      useUIStore.setState({ isPoweredOn: true }); // a powered-on retransmit restarts the systems (Task 26)
      initializeLocale(DEFAULT_LOCALE_ID); // first tick running
      const firstUnsubscribe = vi.mocked(subscribeToMeasure).mock.results[0].value;

      retransmitWorld({ coordinates: { x: 500, y: 500 } }); // must stop-then-start for the new locale

      expect(firstUnsubscribe).toHaveBeenCalled();
      expect(subscribeToMeasure).toHaveBeenCalledTimes(2);
      const unsubOrder = firstUnsubscribe.mock.invocationCallOrder[0];
      const secondSubscribeOrder = vi.mocked(subscribeToMeasure).mock.invocationCallOrder[1];
      expect(unsubOrder).toBeLessThan(secondSubscribeOrder);
    });
  });

  // Roadmap Phase 45, docs/tasks/LAYOUT_REWORK.md Task 26: the world builds before power-on and its
  // systems start on the rocker. initializeLocale is split into the build half (always) and the start
  // half (only when startSystems is true), so a world built while off is a still frame.
  describe('the world before power-on (startSystems: false)', () => {
    function spyOnStartHalf() {
      return {
        lifecycleStart: vi.spyOn(robotSystemsModule, 'startRobotLifecycle'),
        lifecycleStop: vi.spyOn(robotSystemsModule, 'stopRobotLifecycle'),
        workStart: vi.spyOn(workLoopModule, 'startWorkLoop'),
        workStop: vi.spyOn(workLoopModule, 'stopWorkLoop'),
        swellsStart: vi.spyOn(audioSwellsModule, 'startAudioSwells'),
        swellsStop: vi.spyOn(audioSwellsModule, 'stopAudioSwells'),
      };
    }

    it('builds the world and the twelve-robot roster with companies, with no audio context started', () => {
      const startSpy = vi.spyOn(AudioEngine, 'start');
      initializeLocale(DEFAULT_LOCALE_ID, { startSystems: false });
      const locale = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)!;
      expect(locale.actors.length).toBeGreaterThan(0);
      expect(locale.robots).toHaveLength(MAX_ROBOTS);
      expect(locale.companies.length).toBeGreaterThan(0);
      expect(startSpy).not.toHaveBeenCalled();
    });

    it('starts none of the three systems, and does not touch their stop halves either', async () => {
      const spies = spyOnStartHalf();
      const { subscribeToMeasure, scheduleRepeat } = await import('../engine/beatClock');
      initializeLocale(DEFAULT_LOCALE_ID, { startSystems: false });
      for (const spy of Object.values(spies)) expect(spy).not.toHaveBeenCalled();
      expect(subscribeToMeasure).not.toHaveBeenCalled();
      expect(scheduleRepeat).not.toHaveBeenCalled();
    });

    it('is idempotent on a populated locale: a second off-build keeps the same actors, robots and companies', () => {
      initializeLocale(DEFAULT_LOCALE_ID, { startSystems: false });
      const first = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)!;
      initializeLocale(DEFAULT_LOCALE_ID, { startSystems: false });
      const second = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)!;
      expect(second.actors).toBe(first.actors);
      expect(second.robots).toBe(first.robots);
      expect(second.companies).toBe(first.companies);
    });

    it('does nothing, and does not throw, for an unknown locale id', () => {
      const spies = spyOnStartHalf();
      expect(() => initializeLocale('nonexistent', { startSystems: false })).not.toThrow();
      expect(spies.lifecycleStart).not.toHaveBeenCalled();
    });

    it('treats an options object without startSystems as the default (start)', () => {
      const workStart = vi.spyOn(workLoopModule, 'startWorkLoop');
      initializeLocale(DEFAULT_LOCALE_ID, {});
      expect(workStart).toHaveBeenCalledTimes(1);
    });
  });

  describe('startLocaleSystems — the start half on its own', () => {
    it('stops then starts the robot lifecycle, work loop and audio swells for the locale, once each, after a pre-power build', () => {
      initializeLocale(DEFAULT_LOCALE_ID, { startSystems: false });
      const lifecycleStart = vi.spyOn(robotSystemsModule, 'startRobotLifecycle');
      const lifecycleStop = vi.spyOn(robotSystemsModule, 'stopRobotLifecycle');
      const workStart = vi.spyOn(workLoopModule, 'startWorkLoop');
      const workStop = vi.spyOn(workLoopModule, 'stopWorkLoop');
      const swellsStart = vi.spyOn(audioSwellsModule, 'startAudioSwells');
      const swellsStop = vi.spyOn(audioSwellsModule, 'stopAudioSwells');

      startLocaleSystems(DEFAULT_LOCALE_ID);

      expect(lifecycleStart).toHaveBeenCalledTimes(1);
      expect(lifecycleStart).toHaveBeenCalledWith(DEFAULT_LOCALE_ID);
      expect(workStart).toHaveBeenCalledTimes(1);
      expect(workStart).toHaveBeenCalledWith(DEFAULT_LOCALE_ID);
      expect(swellsStart).toHaveBeenCalledTimes(1);
      expect(swellsStart).toHaveBeenCalledWith(DEFAULT_LOCALE_ID);
      expect(lifecycleStop.mock.invocationCallOrder[0]).toBeLessThan(lifecycleStart.mock.invocationCallOrder[0]);
      expect(workStop.mock.invocationCallOrder[0]).toBeLessThan(workStart.mock.invocationCallOrder[0]);
      expect(swellsStop.mock.invocationCallOrder[0]).toBeLessThan(swellsStart.mock.invocationCallOrder[0]);
    });

    it('builds nothing: it never places a district or spawns a roster', () => {
      startLocaleSystems(DEFAULT_LOCALE_ID);
      const locale = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)!;
      expect(locale.actors).toHaveLength(0);
      expect(locale.robots).toHaveLength(0);
    });

    it('does not double-start on a second call: exactly one lifecycle subscription stays live (the stop-then-start pairs hold)', async () => {
      const { subscribeToMeasure } = await import('../engine/beatClock');
      const unsubscribes: ReturnType<typeof vi.fn>[] = [];
      vi.mocked(subscribeToMeasure).mockImplementation(() => {
        const unsubscribe = vi.fn();
        unsubscribes.push(unsubscribe);
        return unsubscribe;
      });
      try {
        initializeLocale(DEFAULT_LOCALE_ID, { startSystems: false });

        startLocaleSystems(DEFAULT_LOCALE_ID);
        startLocaleSystems(DEFAULT_LOCALE_ID);

        expect(unsubscribes).toHaveLength(2);
        expect(unsubscribes[0]).toHaveBeenCalledTimes(1);
        expect(unsubscribes[1]).not.toHaveBeenCalled();
      } finally {
        vi.mocked(subscribeToMeasure).mockImplementation(() => vi.fn());
      }
    });

    it('does not throw for an unknown locale id', () => {
      expect(() => startLocaleSystems('nonexistent')).not.toThrow();
    });
  });

  describe('retransmitWorld follows the power state', () => {
    const MOVES = [
      ['coordinates only', { coordinates: { x: 500, y: 500 } }],
      ['Attenuation Style and coordinates', { attenuationStyleName: 'Brinemouth', coordinates: { x: 500, y: 500 } }],
    ] as const;

    it.each(MOVES)('powered off (%s): builds the new world and starts no system', async (_label, input) => {
      const { subscribeToMeasure, scheduleRepeat } = await import('../engine/beatClock');
      initializeLocale(DEFAULT_LOCALE_ID, { startSystems: false });
      const workStart = vi.spyOn(workLoopModule, 'startWorkLoop');

      retransmitWorld(input);

      const style = selectCurrentAttenuationStyle(useAttenuationStyleStore.getState())!;
      const locale = useLocaleStore.getState().getLocaleById(style.currentLocaleId!)!;
      expect(locale.robots).toHaveLength(MAX_ROBOTS);
      expect(locale.actors.length).toBeGreaterThan(0);
      expect(workStart).not.toHaveBeenCalled();
      expect(subscribeToMeasure).not.toHaveBeenCalled();
      expect(scheduleRepeat).not.toHaveBeenCalled();
    });

    it.each(MOVES)('powered on (%s): builds the new world and starts the systems for it', (_label, input) => {
      useUIStore.setState({ isPoweredOn: true });
      initializeLocale(DEFAULT_LOCALE_ID);
      const workStart = vi.spyOn(workLoopModule, 'startWorkLoop');
      const swellsStart = vi.spyOn(audioSwellsModule, 'startAudioSwells');

      retransmitWorld(input);

      const style = selectCurrentAttenuationStyle(useAttenuationStyleStore.getState())!;
      expect(workStart).toHaveBeenCalledTimes(1);
      expect(workStart).toHaveBeenCalledWith(style.currentLocaleId);
      expect(swellsStart).toHaveBeenCalledTimes(1);
      expect(swellsStart).toHaveBeenCalledWith(style.currentLocaleId);
    });

    it('reads the power state at the moment of the retransmit, not at import time', () => {
      initializeLocale(DEFAULT_LOCALE_ID, { startSystems: false });
      const workStart = vi.spyOn(workLoopModule, 'startWorkLoop');
      retransmitWorld({ coordinates: { x: 10, y: 10 } });
      expect(workStart).not.toHaveBeenCalled();

      useUIStore.setState({ isPoweredOn: true });
      retransmitWorld({ coordinates: { x: 20, y: 20 } });
      expect(workStart).toHaveBeenCalledTimes(1);
    });

    it('an Attenuation-Style-only retransmit keeps the preserved locale and starts nothing new, powered or not', () => {
      initializeLocale(DEFAULT_LOCALE_ID, { startSystems: false });
      const workStart = vi.spyOn(workLoopModule, 'startWorkLoop');
      retransmitWorld({ attenuationStyleName: 'Saltwhistle' });
      expect(workStart).not.toHaveBeenCalled();
    });
  });

  // The address bar follows the loaded world (docs/tasks/OFF_SCREEN.md Task 15, spec assumption 12): every retransmit
  // that changes the world mirrors its identity — seed, x, y — and drops the tweak blob; a no-op touches nothing.
  describe('retransmitWorld mirrors the loaded world into the address bar', () => {
    const params = () => new URLSearchParams(window.location.search);

    afterEach(() => {
      window.history.replaceState({}, '', '/');
    });

    it('a coordinates-only retransmit writes the preserved name with the new coordinates and drops the blob', () => {
      window.history.replaceState({}, '', '/?seed=stale&x=1&y=1&s=friend');
      initializeLocale(DEFAULT_LOCALE_ID, { startSystems: false });
      retransmitWorld({ coordinates: { x: 500, y: 500 } });
      expect(params().get('seed')).toBe(DEFAULT_PELAGOS.name);
      expect(params().get('x')).toBe('500');
      expect(params().get('y')).toBe('500');
      expect(params().has('s')).toBe(false);
    });

    it('an Attenuation-Style-only retransmit writes the new name with the preserved coordinates', () => {
      initializeLocale(DEFAULT_LOCALE_ID, { startSystems: false });
      const { coordinates } = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)!;
      retransmitWorld({ attenuationStyleName: 'Saltwhistle' });
      expect(params().get('seed')).toBe('Saltwhistle');
      expect(params().get('x')).toBe(String(coordinates.x));
      expect(params().get('y')).toBe(String(coordinates.y));
    });

    it('a both-changed retransmit writes the whole new identity', () => {
      initializeLocale(DEFAULT_LOCALE_ID, { startSystems: false });
      retransmitWorld({ attenuationStyleName: 'Brinemouth', coordinates: { x: -7, y: 300 } });
      expect(window.location.search).toBe('?seed=Brinemouth&x=-7&y=300');
    });

    it('keeps every unrelated param where it stood', () => {
      window.history.replaceState({}, '', '/?debug&load=light');
      initializeLocale(DEFAULT_LOCALE_ID, { startSystems: false });
      retransmitWorld({ coordinates: { x: 500, y: 500 } });
      expect(window.location.search).toBe(`?debug&load=light&seed=${encodeURIComponent(DEFAULT_PELAGOS.name)}&x=500&y=500`);
    });

    it('a no-op retransmit leaves the address bar alone', () => {
      window.history.replaceState({}, '', '/?debug');
      initializeLocale(DEFAULT_LOCALE_ID, { startSystems: false });
      retransmitWorld({});
      expect(window.location.search).toBe('?debug');
    });
  });

  // band-table T25 (docs/specs/OFF_SCREEN.md assumption 10): the loadingOnly mode, and the loading fields on every mode.
  describe('retransmitWorld — the loading changed', () => {
    const params = () => new URLSearchParams(window.location.search);
    const currentWorld = () => {
      const style = selectCurrentAttenuationStyle(useAttenuationStyleStore.getState())!;
      return { style, locale: useLocaleStore.getState().getLocaleById(style.currentLocaleId!)! };
    };
    /** The four seed regenerators the style-sync subscription runs, spied with their real behaviour kept. */
    /** A fixed Attenuation Style for a case whose expectation depends on the seed's Sync picks: the default style's name
     *  is drawn at random per run, and Calm (as mocked above) moves lane a's pick for this one and leaves b to d. Its own
     *  id, since the style noise map is cached by id. */
    const pinStyle = () =>
      useAttenuationStyleStore.setState({
        attenuationStyles: [{ ...DEFAULT_PELAGOS, id: 'final-f17-pinned', name: 'siw50qfe' }],
        currentAttenuationStyleId: 'final-f17-pinned',
      });
    const spyRegenerators = () => {
      const audio = useAudioStore.getState();
      return {
        bpm: vi.spyOn(audio, 'regenerateBpmFromSeed'),
        globalAudio: vi.spyOn(audio, 'regenerateGlobalAudioFromSeed'),
        lfoBank: vi.spyOn(audio, 'regenerateLfoBankFromSeed'),
        globalLfoLinks: vi.spyOn(audio, 'regenerateGlobalLfoLinksFromSeed'),
      };
    };

    afterEach(() => {
      vi.restoreAllMocks();
      window.history.replaceState({}, '', '/');
    });

    // docs/tasks/OFF_SCREEN_FINAL_FIXES.md F7 (Crawford, answer 2b): nothing about the physical world changes on a theme
    // change, so the locale stands and the live roster is re-derived in place, where it used to be rebuilt at the plot.
    // Since final fixes F17 the global half is not regenerated whole: only the fields the theme moves are written.
    it('a theme alone keeps the Attenuation Style, the plot and the locale, sets the store, moves the global half into the new bands, and re-derives the roster in place', () => {
      initializeLocale(DEFAULT_LOCALE_ID, { startSystems: false });
      // A fresh locale first, as every retransmit makes: robot ids carry a per-locale spawn count kept at module scope,
      // and the default locale's count has been advanced by the tests above, so only a fresh plot's ids repeat.
      retransmitWorld({ coordinates: { x: 500, y: 500 } });
      const before = currentWorld();
      const robotIdsBefore = before.locale.robots.map((r) => r.id);
      expect(robotIdsBefore.length).toBeGreaterThan(0);
      const spies = spyRegenerators();

      retransmitWorld({ theme: 'float' });

      const after = currentWorld();
      expect(after.style.id).toBe(before.style.id);
      expect(after.style.name).toBe(before.style.name);
      expect(after.locale.coordinates).toEqual(before.locale.coordinates);
      expect(after.locale.id).toBe(before.locale.id);
      expect(after.locale.robots.map((r) => r.id)).toEqual(robotIdsBefore);
      expect(useLoadingStore.getState().theme).toBe('float');
      for (const spy of Object.values(spies)) expect(spy).not.toHaveBeenCalled();
      expect(useAudioStore.getState().bpm).toBeGreaterThanOrEqual(150);
      expect(useAudioStore.getState().bpm).toBeLessThanOrEqual(160);
      expect(useAudioStore.getState().globalAudio.filterLPF.frequency).toBeGreaterThanOrEqual(500);
      expect(useAudioStore.getState().globalAudio.filterLPF.frequency).toBeLessThanOrEqual(600);
      for (const robot of after.locale.robots) expect(robot.rhythmicDensity).toBeGreaterThanOrEqual(90);
      expect(getWorldState()).toBe('cold');
      expect(params().get('theme')).toBe('float');
      expect(params().get('seed')).toBe(before.style.name);
    });

    // docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R22 (Crawford: keep it, Open Question 4): the rebuild a theme change makes
    // stands at the same plot, so it keeps the plot's hour - the day is still DAY_DURATION_MS from the one
    // dayStartTimestamp - where it used to snap the sky back to the plot's arrival hour. A move to another plot stamps
    // that plot's own.
    describe('the hour across a rebuild (review R22)', () => {
      const later = (locale: { dayStartTimestamp: number }) => locale.dayStartTimestamp + 90_000_000;

      it("a theme retransmit keeps the locale's dayStartTimestamp, though time has moved on", () => {
        initializeLocale(DEFAULT_LOCALE_ID, { startSystems: false });
        retransmitWorld({ coordinates: { x: 500, y: 500 } });
        const before = currentWorld().locale;
        vi.spyOn(Date, 'now').mockReturnValue(later(before));
        retransmitWorld({ theme: 'float' });
        const after = currentWorld().locale;
        expect(after.dayStartTimestamp).toBe(before.dayStartTimestamp);
      });

      it('a name change carrying a theme keeps it too: the plot is rebuilt in place under the new name', () => {
        initializeLocale(DEFAULT_LOCALE_ID, { startSystems: false });
        retransmitWorld({ coordinates: { x: 501, y: 500 } });
        const before = currentWorld().locale;
        vi.spyOn(Date, 'now').mockReturnValue(later(before));
        retransmitWorld({ attenuationStyleName: 'Brinemouth', theme: 'anchor' });
        const after = currentWorld();
        expect(after.style.name).toBe('Brinemouth');
        expect(after.locale.coordinates).toEqual(before.coordinates);
        expect(after.locale.dayStartTimestamp).toBe(before.dayStartTimestamp);
      });

      it("a coordinates retransmit stamps the new plot's own, from now", () => {
        initializeLocale(DEFAULT_LOCALE_ID, { startSystems: false });
        const before = currentWorld().locale;
        const now = later(before);
        vi.spyOn(Date, 'now').mockReturnValue(now);
        retransmitWorld({ coordinates: { x: 7, y: 8 } });
        expect(currentWorld().locale.dayStartTimestamp).toBe(now - (7 / 24) * DAY_DURATION_MS);
      });

      it("a theme riding on a plot move stamps the new plot's own too", () => {
        initializeLocale(DEFAULT_LOCALE_ID, { startSystems: false });
        const before = currentWorld().locale;
        const now = later(before);
        vi.spyOn(Date, 'now').mockReturnValue(now);
        retransmitWorld({ coordinates: { x: 9, y: 9 }, theme: 'anchor' });
        expect(currentWorld().locale.dayStartTimestamp).toBe(now - (9 / 24) * DAY_DURATION_MS);
      });
    });

    // docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R33: aspects are robot-side, so picks alone re-deal the live roster in
    // place - no rebuild, no global regeneration - where they used to rebuild the plot.
    it('aspects alone re-deal the live roster in place: the locale and every robot\'s place, battery, activity and job stand, nothing global regenerates, and the store and the bar carry the picks', () => {
      initializeLocale(DEFAULT_LOCALE_ID, { startSystems: false });
      const before = currentWorld();
      // The robots moved off their spawn state, so "stand" cannot pass by a rebuild drawing the same values again.
      const moved = before.locale.robots.map((robot, i) => ({
        ...robot,
        position: { x: 100 + i, y: 200 + i },
        batteryLevel: 37 + i,
        activity: 'working' as const,
        job: JobType.Salvage,
      }));
      useLocaleStore.getState().setLocaleData(before.locale.id, { robots: moved });
      const spies = spyRegenerators();
      retransmitWorld({ aspects: { melody: ['mechanical', 'hypnotic'] } });
      const after = currentWorld();
      expect(after.style.id).toBe(before.style.id);
      expect(after.locale.id).toBe(before.locale.id);
      expect(after.locale.robots.map((r) => r.id)).toEqual(moved.map((r) => r.id));
      after.locale.robots.forEach((robot, i) => {
        expect(robot.position, robot.id).toEqual(moved[i].position);
        expect(robot.batteryLevel, robot.id).toBe(moved[i].batteryLevel);
        expect(robot.activity, robot.id).toBe('working');
        expect(robot.job, robot.id).toBe(JobType.Salvage);
        expect(['hypnotic', 'mechanical'], robot.id).toContain(robot.loadedUnder?.melody);
      });
      expect(useLoadingStore.getState()).toMatchObject({ theme: 'classic', aspects: { melody: ['hypnotic', 'mechanical'] } });
      for (const spy of Object.values(spies)) expect(spy).not.toHaveBeenCalled();
      expect(params().get('melody')).toBe('hypnotic,mechanical');
      expect(params().has('theme')).toBe(false);
    });

    // Since docs/tasks/OFF_SCREEN_FINAL_FIXES.md F16, field by field: on an untweaked world a moved seeded value is a
    // changed value, so the swells dropped are exactly those on the sends that changed.
    it('aspects alone drop the swells riding the fields they re-derive, through the swell system\'s own cancel', () => {
      initializeLocale(DEFAULT_LOCALE_ID, { startSystems: false });
      // A fresh plot, so its robots are its own spawn order (the spawn count note above).
      retransmitWorld({ coordinates: { x: 540, y: 460 } });
      const before = currentWorld().locale.robots;
      const cancel = vi.spyOn(audioSwellsModule, 'cancelSwellForRobotAttribute');
      retransmitWorld({ aspects: { distance: ['echoing'] } });
      const robots = currentWorld().locale.robots;
      const SENDS = ['reverbSend', 'delaySend', 'gritSend', 'shimmerSend', 'doubleSend'] as const;
      const changed = robots.flatMap((robot, i) => SENDS.filter((f) => robot[f] !== before[i][f]).map((f) => `${robot.id}:${f}`));
      expect(changed.length).toBeGreaterThan(0); // precondition
      expect(cancel.mock.calls.map(([id, attribute]) => `${id}:${attribute}`).sort()).toEqual(changed.sort());
    });

    // docs/tasks/OFF_SCREEN_FINAL_FIXES.md F16 (Crawford's rule): an aspect resets only the attributes it moves. Swelling
    // moves the attack and the sustain bands and leaves the decay's, so a tweaked decay stands and a tweaked attack
    // takes the new draw.
    it('an Envelope aspect toggled on keeps a tweak on an adsr key its bands leave alone, and resets one it moves', () => {
      initializeLocale(DEFAULT_LOCALE_ID, { startSystems: false });
      // A fresh plot, so a rebuild at it repeats the robot ids (the spawn count note above).
      retransmitWorld({ coordinates: { x: 530, y: 470 } });
      const untweaked = currentWorld().locale.robots;
      retransmitWorld({ aspects: { envelope: ['swelling'] } });
      const fresh = currentWorld().locale.robots;
      retransmitWorld({ coordinates: { x: 530, y: 470 }, aspects: {} });
      const { locale } = currentWorld();
      const robot = locale.robots[0];
      expect(fresh[0].audioAttributes.adsr.decay).toBe(untweaked[0].audioAttributes.adsr.decay); // precondition: decay stays
      expect(fresh[0].audioAttributes.adsr.attack).not.toBe(untweaked[0].audioAttributes.adsr.attack); // ...attack moves
      useLocaleStore.getState().updateRobot(locale.id, robot.id, {
        audioAttributes: { ...robot.audioAttributes, adsr: { ...robot.audioAttributes.adsr, attack: 1.987, decay: 1.654 } },
      });

      retransmitWorld({ aspects: { envelope: ['swelling'] } });

      const after = currentWorld().locale.robots[0];
      expect(after.audioAttributes.adsr.decay).toBe(1.654);
      expect(after.audioAttributes.adsr.attack).toBe(fresh[0].audioAttributes.adsr.attack);
      expect(after.loadedUnder).toEqual({ envelope: 'swelling' });
    });

    // docs/tasks/OFF_SCREEN_FINAL_FIXES.md F11 (second review, finding 1): a theme re-derives in place, so no
    // stopAudioSwells runs. A global swell on a field the theme moves would end by writing its old base over the new
    // seeded value; it is dropped. A swell on a field the theme leaves standing rides on.
    describe('the global swells across a theme (final fixes F11)', () => {
      const swellOn = (target: string) => audioSwellsModule.getActiveSwellSnapshot('global').find((s) => s.globalTarget === target);
      /** Tick the real swell system, every tick a trigger, until both targets ride a swell; then no new swell starts. */
      const startSwellsOn = (targets: string[]): number => {
        // The global half as Classic seeds it: an earlier case's theme leaves its own in the store.
        const { style } = currentWorld();
        useAudioStore.getState().regenerateGlobalAudioFromSeed(style.id, style.name);
        useAudioStore.setState({ swellFrequency: 16, swellDuration: 64 });
        let measure = 0;
        while (!targets.every(swellOn) && measure < 400) {
          audioSwellsModule.tickAudioSwells(currentWorld().style.currentLocaleId!, measure);
          measure += 1 / 16;
        }
        expect(targets.every(swellOn), 'the swells never started').toBe(true);
        useAudioStore.setState({ swellFrequency: 0 });
        return measure;
      };
      const tickPastEveryEnd = (from: number) => {
        const localeId = currentWorld().style.currentLocaleId!;
        for (let m = from; m < from + 200; m += 1) audioSwellsModule.tickAudioSwells(localeId, m);
        expect(audioSwellsModule.getActiveSwellSnapshot('global')).toEqual([]);
      };

      it('drops a swell on the LPF cutoff the theme moves: the new seeded value stands past the swell\'s would-be end', () => {
        pinStyle();
        initializeLocale(DEFAULT_LOCALE_ID, { startSystems: false });
        const measure = startSwellsOn(['lpf.frequency']);
        const oldBase = swellOn('lpf.frequency')!.baseValue!;
        retransmitWorld({ theme: 'float' });
        expect(swellOn('lpf.frequency')).toBeUndefined();
        const seeded = useAudioStore.getState().globalAudio.filterLPF.frequency;
        expect(seeded).not.toBe(oldBase);
        expect(seeded).toBeGreaterThanOrEqual(500);
        expect(seeded).toBeLessThanOrEqual(600);
        tickPastEveryEnd(measure);
        expect(useAudioStore.getState().globalAudio.filterLPF.frequency).toBe(seeded);
      });

      it('keeps a swell on a field the theme leaves standing (eq3.low): it rides on and ends on its own base', () => {
        pinStyle();
        initializeLocale(DEFAULT_LOCALE_ID, { startSystems: false });
        const measure = startSwellsOn(['eq3.low', 'lpf.frequency']);
        const before = swellOn('eq3.low')!;
        retransmitWorld({ theme: 'float' });
        expect(swellOn('eq3.low')).toEqual(before);
        expect(swellOn('lpf.frequency')).toBeUndefined();
        tickPastEveryEnd(measure);
        expect(useAudioStore.getState().globalAudio.eq3.low).toBe(before.baseValue);
      });

      it('paused before the theme, Keep saves the new LPF value, not the dropped swell\'s old base', () => {
        pinStyle();
        initializeLocale(DEFAULT_LOCALE_ID, { startSystems: false });
        startSwellsOn(['lpf.frequency']);
        const oldBase = swellOn('lpf.frequency')!.baseValue!;
        setWorldState('paused');
        retransmitWorld({ theme: 'float' });
        // The payload rounds its numbers, so the reads compare to the whole hertz.
        const saved = buildSessionPayload().globalAudio!.filterLPF!.frequency!;
        expect(saved).not.toBeCloseTo(oldBase, 0);
        expect(saved).toBeCloseTo(useAudioStore.getState().globalAudio.filterLPF.frequency, 0);
      });
    });

    // docs/tasks/OFF_SCREEN_FINAL_FIXES.md F17 (Crawford's rule, the global side): a theme change writes only the global
    // attributes whose seeded value it moves - the tempo, the LPF cutoff and the Sync picks the new tempo changes, under
    // the real columns (the verify-first dump) - and every other attribute keeps what it holds, a tweak included.
    describe('the global half moves only what the theme moves (final fixes F17)', () => {
      /** The global half as a fresh draw under `theme` gives it, the store's non-seeded switch carried. */
      const freshDraw = (theme: 'classic' | 'float') => {
        const { style } = currentWorld();
        return withLoading({ theme, aspects: {} }, () => ({
          bpm: generateAttenuationStyleBpm(style.id, style.name),
          globalAudio: {
            ...generateGlobalAudioSettings(style.id, style.name),
            compressorBeforeDelay: useAudioStore.getState().globalAudio.compressorBeforeDelay,
          },
          lfoBank: generateLfoBankSettings(style.id, style.name),
          globalLfoLinks: generateGlobalLfoLinks(style.id, style.name),
        }));
      };
      const globalHalf = () => {
        const { bpm, globalAudio, lfoBank, globalLfoLinks } = useAudioStore.getState();
        return { bpm, globalAudio, lfoBank, globalLfoLinks };
      };
      /** The world as Classic seeds it: an earlier case's theme leaves its own global half in the store. */
      const classicWorld = () => {
        initializeLocale(DEFAULT_LOCALE_ID, { startSystems: false });
        useAudioStore.setState(freshDraw('classic'));
      };

      it('a tweaked Reverb wet survives a theme change, and a tweaked LPF cutoff takes the new seed', () => {
        classicWorld();
        useAudioStore.getState().setGlobalAudio('reverb', { wet: 0.777 });
        useAudioStore.getState().setGlobalAudio('filterLPF', { frequency: 12345 });
        retransmitWorld({ theme: 'float' });
        expect(useAudioStore.getState().globalAudio.reverb.wet).toBe(0.777);
        expect(useAudioStore.getState().globalAudio.filterLPF.frequency).toBe(freshDraw('float').globalAudio.filterLPF.frequency);
      });

      it("an untweaked world's global half equals a fresh draw under the new theme, field for field", () => {
        classicWorld();
        expect(globalHalf()).not.toEqual(freshDraw('float')); // precondition: the theme moves it
        retransmitWorld({ theme: 'float' });
        expect(globalHalf()).toEqual(freshDraw('float'));
      });

      it('a theme regenerates nothing whole: none of the four seed regenerators runs', () => {
        classicWorld();
        const spies = spyRegenerators();
        retransmitWorld({ theme: 'float' });
        for (const spy of Object.values(spies)) expect(spy).not.toHaveBeenCalled();
      });

      // The tempo moves under a Sync pick the theme leaves standing: the pick stays, and the engine hears it at the new
      // tempo, clamped into its range as a hand Tempo edit's re-push clamps it (FREE_SYNC_TOGGLE.md §1.6). A lane whose
      // `sync` both draws agree on is one the theme does not move, so a hand-set note on it is a tweak that stands.
      /** A lane whose Sync pick the theme leaves, set by hand to a note the new tempo allows (`allowed: true`) or
       *  disallows (`false`). */
      const handSetLane = (allowed: boolean) => {
        const lane = LFO_LANE_IDS.find((l) => deepEqual(freshDraw('classic').lfoBank[l].sync, freshDraw('float').lfoBank[l].sync));
        expect(lane, 'a lane whose Sync pick the theme leaves').toBeDefined();
        const calmAllows = allowedLaneNoteValues(freshDraw('float').bpm);
        const note = NOTE_VALUES.find(
          (nv) => !deepEqual(nv, useAudioStore.getState().lfoBank[lane!].sync) && calmAllows.some((a) => deepEqual(a, nv)) === allowed,
        )!;
        expect(note, 'a note for the case').toBeDefined();
        useAudioStore.getState().replaceLfoBankLane(lane!, { ...useAudioStore.getState().lfoBank[lane!], sync: note });
        return { lane: lane!, note, calmAllows };
      };

      it('a hand-set Sync note the new tempo still allows stays, and reaches the engine resolved at the new tempo', () => {
        pinStyle();
        classicWorld();
        const { lane, note } = handSetLane(true);
        const rate = vi.spyOn(lfoEngine, 'setBankRate').mockImplementation(() => {});
        retransmitWorld({ theme: 'float' });
        const after = useAudioStore.getState();
        expect(after.lfoBank[lane].sync).toEqual(note);
        expect(rate.mock.calls.filter(([l]) => l === lane).at(-1)).toEqual([lane, resolveLaneRateHz(after.lfoBank[lane], after.bpm)]);
      });

      // final fixes F21 (Crawford: "a new tempo should impact all notes").
      it('a hand-set Sync note the new tempo disallows snaps to the nearest note it allows', () => {
        pinStyle();
        classicWorld();
        const { lane, calmAllows } = handSetLane(false);
        retransmitWorld({ theme: 'float' });
        expect(calmAllows.some((a) => deepEqual(a, useAudioStore.getState().lfoBank[lane].sync))).toBe(true);
      });

      it('the engine hears the moved fields: the new tempo and the LPF cutoff, and no push to an Audio Rig block that stays', () => {
        classicWorld();
        // The Audio Rig's writes go through setGlobalAudio, the hand edit's path to each block's engine setter.
        const setBPM = vi.spyOn(AudioEngine, 'setBPM');
        const setGlobalAudio = vi.spyOn(useAudioStore.getState(), 'setGlobalAudio');
        retransmitWorld({ theme: 'float' });
        const { bpm, globalAudio } = useAudioStore.getState();
        expect(setBPM).toHaveBeenLastCalledWith(bpm);
        expect(setGlobalAudio).toHaveBeenCalledWith('filterLPF', { frequency: globalAudio.filterLPF.frequency });
        const blocks = setGlobalAudio.mock.calls.map(([effect]) => effect);
        expect(blocks).not.toContain('reverb');
        expect(blocks).not.toContain('eq3');
      });
    });

    it('aspects alone, and a theme, keep the selected robot and company: nothing they name is rebuilt', () => {
      initializeLocale(DEFAULT_LOCALE_ID, { startSystems: false });
      const { locale } = currentWorld();
      useUIStore.getState().selectRobot(locale.robots[2].id);
      useUIStore.getState().selectCompany(locale.companies[0].id);
      retransmitWorld({ aspects: { envelope: ['held'] } });
      expect(useUIStore.getState().selectedRobotId).toBe(locale.robots[2].id);
      expect(useUIStore.getState().selectedCompanyId).toBe(locale.companies[0].id);
      retransmitWorld({ theme: 'float' });
      expect(useUIStore.getState().selectedRobotId).toBe(locale.robots[2].id);
      expect(useUIStore.getState().selectedCompanyId).toBe(locale.companies[0].id);
      // A rebuild still lets go of both: the companies come back under fresh ids.
      retransmitWorld({ coordinates: { x: 500, y: 500 } });
      expect(useUIStore.getState().selectedRobotId).toBeNull();
      expect(useUIStore.getState().selectedCompanyId).toBeNull();
    });

    it('a theme with aspects re-derives in place too: the global half moves into the new bands, the locale stands, the picks are dealt', () => {
      initializeLocale(DEFAULT_LOCALE_ID, { startSystems: false });
      const before = currentWorld();
      retransmitWorld({ theme: 'float', aspects: { melody: ['hypnotic'] } });
      const after = currentWorld();
      expect(after.locale.id).toBe(before.locale.id);
      expect(useAudioStore.getState().bpm).toBeGreaterThanOrEqual(150); // Calm's tempo, as mocked above
      expect(useAudioStore.getState().globalAudio.filterLPF.frequency).toBeLessThanOrEqual(600);
      expect(useLoadingStore.getState()).toMatchObject({ theme: 'float', aspects: { melody: ['hypnotic'] } });
      for (const robot of after.locale.robots) expect(robot.loadedUnder).toEqual({ melody: 'hypnotic' });
    });

    it('a theme keeps every robot where it stands: the ids, places, batteries, activities and jobs, and the companies', () => {
      initializeLocale(DEFAULT_LOCALE_ID, { startSystems: false });
      const before = currentWorld();
      // The robots moved off their spawn state, so "stand" cannot pass by a rebuild drawing the same values again.
      const moved = before.locale.robots.map((robot, i) => ({
        ...robot,
        position: { x: 100 + i, y: 200 + i },
        batteryLevel: 37 + i,
        activity: 'working' as const,
        job: JobType.Salvage,
      }));
      useLocaleStore.getState().setLocaleData(before.locale.id, { robots: moved });
      retransmitWorld({ theme: 'float' });
      const after = currentWorld();
      expect(after.locale.id).toBe(before.locale.id);
      expect(after.locale.companies).toEqual(before.locale.companies);
      expect(after.locale.robots.map((r) => r.id)).toEqual(moved.map((r) => r.id));
      after.locale.robots.forEach((robot, i) => {
        expect(robot.position, robot.id).toEqual(moved[i].position);
        expect(robot.batteryLevel, robot.id).toBe(moved[i].batteryLevel);
        expect(robot.activity, robot.id).toBe('working');
        expect(robot.job, robot.id).toBe(JobType.Salvage);
        expect(robot.rhythmicDensity, robot.id).toBeGreaterThanOrEqual(90); // Calm's density, as mocked above
      });
    });

    it('an untweaked world re-derived under a theme saves as the same world rebuilt under it: the payloads match, no robot override', () => {
      initializeLocale(DEFAULT_LOCALE_ID, { startSystems: false });
      // A fresh plot, so a rebuild at it repeats the robot ids (the spawn count note above).
      retransmitWorld({ coordinates: { x: 512, y: 488 } });
      retransmitWorld({ theme: 'float', aspects: { melody: ['hypnotic', 'mechanical'] } });
      const inPlace = buildSessionPayload();
      // The same plot rebuilt from nothing under the loading now installed.
      retransmitWorld({ coordinates: { x: 512, y: 488 } });
      const rebuilt = buildSessionPayload();
      expect(inPlace.robotOverrides).toEqual({});
      expect(inPlace).toEqual(rebuilt);
    });

    it('a theme that moves no Voice key (Beacon) changes no voice: no robot is re-reserved', () => {
      initializeLocale(DEFAULT_LOCALE_ID, { startSystems: false });
      const reserve = vi.spyOn(AudioEngine, 'reserveVoice');
      const reReserve = vi.spyOn(AudioEngine, 'reReserveVoice');
      retransmitWorld({ theme: 'beacon' });
      expect(reserve).not.toHaveBeenCalled();
      expect(reReserve).not.toHaveBeenCalled();
    });

    it('aspects alone while paused tear nothing down and leave the world paused: the next flip resumes it', () => {
      initializeLocale(DEFAULT_LOCALE_ID, { startSystems: false });
      setWorldState('paused');
      const killAll = vi.spyOn(AudioEngine, 'killAll');
      const stopWork = vi.spyOn(workLoopModule, 'stopWorkLoop');
      const stopLifecycle = vi.spyOn(robotSystemsModule, 'stopRobotLifecycle');
      retransmitWorld({ aspects: { distance: ['echoing'] } });
      expect(killAll).not.toHaveBeenCalled();
      expect(stopWork).not.toHaveBeenCalled();
      expect(stopLifecycle).not.toHaveBeenCalled();
      expect(getWorldState()).toBe('paused');
      for (const robot of currentWorld().locale.robots) expect(robot.loadedUnder).toEqual({ distance: 'echoing' });
    });

    it('no change is a no-op: the loaded theme again, an empty pick list, or both, touch nothing', () => {
      initializeLocale(DEFAULT_LOCALE_ID, { startSystems: false });
      window.history.replaceState({}, '', '/?debug');
      const before = currentWorld();
      const spies = spyRegenerators();
      const selectRobotSpy = vi.spyOn(useUIStore.getState(), 'selectRobot');
      retransmitWorld({ theme: 'classic' });
      retransmitWorld({ aspects: { melody: [] } });
      retransmitWorld({ theme: 'classic', aspects: {} });
      expect(currentWorld().locale.id).toBe(before.locale.id);
      for (const spy of Object.values(spies)) expect(spy).not.toHaveBeenCalled();
      expect(selectRobotSpy).not.toHaveBeenCalled();
      expect(window.location.search).toBe('?debug');
    });

    it('a theme with new coordinates: the plot moves, the store is set first, and the global half regenerates under the theme too', () => {
      initializeLocale(DEFAULT_LOCALE_ID, { startSystems: false });
      const before = currentWorld();
      const spies = spyRegenerators();
      retransmitWorld({ coordinates: { x: 500, y: 500 }, theme: 'float' });
      const after = currentWorld();
      expect(after.style.id).toBe(before.style.id);
      expect(after.locale.coordinates).toEqual({ x: 500, y: 500 });
      expect(useLoadingStore.getState().theme).toBe('float');
      expect(spies.bpm).toHaveBeenCalledTimes(1);
      expect(spies.globalLfoLinks).toHaveBeenCalledTimes(1);
      expect(useAudioStore.getState().bpm).toBeGreaterThanOrEqual(150);
      for (const robot of after.locale.robots) expect(robot.rhythmicDensity).toBeGreaterThanOrEqual(90);
      expect(params().get('theme')).toBe('float');
      expect(params().get('x')).toBe('500');
    });

    it('new coordinates with the loaded theme again regenerate nothing global: a plot move stays a plot move', () => {
      initializeLocale(DEFAULT_LOCALE_ID, { startSystems: false });
      const spies = spyRegenerators();
      retransmitWorld({ coordinates: { x: 500, y: 500 }, theme: 'classic', aspects: {} });
      expect(currentWorld().locale.coordinates).toEqual({ x: 500, y: 500 });
      for (const spy of Object.values(spies)) expect(spy).not.toHaveBeenCalled();
    });

    it('a theme with a new Attenuation Style: the store is set before the switch, the style-sync reseeds under the theme, and the preserved plot is rebuilt under it', () => {
      initializeLocale(DEFAULT_LOCALE_ID, { startSystems: false });
      const { coordinates } = currentWorld().locale;
      retransmitWorld({ attenuationStyleName: 'Saltwhistle', theme: 'float' });
      const { style, locale } = currentWorld();
      expect(style.name).toBe('Saltwhistle');
      expect(locale.coordinates).toEqual(coordinates);
      expect(useLoadingStore.getState().theme).toBe('float');
      expect(useAudioStore.getState().bpm).toBeGreaterThanOrEqual(150);
      expect(useAudioStore.getState().bpm).toBeLessThanOrEqual(160);
      expect(locale.robots.length).toBeGreaterThan(0);
      for (const robot of locale.robots) expect(robot.rhythmicDensity).toBeGreaterThanOrEqual(90);
      expect(params().get('seed')).toBe('Saltwhistle');
      expect(params().get('theme')).toBe('float');
    });

    it('a theme while paused tears nothing down and leaves the world paused: the next flip resumes it (final fixes F7)', () => {
      initializeLocale(DEFAULT_LOCALE_ID, { startSystems: false });
      setWorldState('paused');
      const killAll = vi.spyOn(AudioEngine, 'killAll');
      const stopWork = vi.spyOn(workLoopModule, 'stopWorkLoop');
      const stopLifecycle = vi.spyOn(robotSystemsModule, 'stopRobotLifecycle');
      retransmitWorld({ theme: 'float' });
      expect(killAll).not.toHaveBeenCalled();
      expect(stopWork).not.toHaveBeenCalled();
      expect(stopLifecycle).not.toHaveBeenCalled();
      expect(getWorldState()).toBe('paused');
    });

    it('a paused world is cold after a loading change that rebuilds, a theme riding on a plot move, so the next flip starts (Task 8)', () => {
      initializeLocale(DEFAULT_LOCALE_ID, { startSystems: false });
      setWorldState('paused');
      retransmitWorld({ coordinates: { x: 500, y: 500 }, theme: 'float' });
      expect(getWorldState()).toBe('cold');
    });

    it('powered on, a theme keeps the world running and restarts nothing', () => {
      useUIStore.setState({ isPoweredOn: true });
      initializeLocale(DEFAULT_LOCALE_ID);
      const workStart = vi.spyOn(workLoopModule, 'startWorkLoop');
      const workStop = vi.spyOn(workLoopModule, 'stopWorkLoop');
      retransmitWorld({ theme: 'float' });
      expect(workStart).not.toHaveBeenCalled();
      expect(workStop).not.toHaveBeenCalled();
      expect(getWorldState()).toBe('running');
    });

    it('reads the picks leniently: an unknown pick is dropped and a known one stands', () => {
      initializeLocale(DEFAULT_LOCALE_ID, { startSystems: false });
      retransmitWorld({ aspects: { melody: ['hypnotic', 'zzz' as AspectIdOf<'melody'>] } });
      expect(useLoadingStore.getState().aspects).toEqual({ melody: ['hypnotic'] });
    });

    // band-table T27 (spec assumption 22): the deal pass runs after the companies spawn, on every build.
    it('initializeLocale deals the loaded picks after the companies spawn: every robot carries loadedUnder', () => {
      useLoadingStore.getState().setLoading({ theme: 'classic', aspects: { melody: ['hypnotic'] } });
      initializeLocale(DEFAULT_LOCALE_ID, { startSystems: false });
      const robots = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)!.robots;
      expect(robots.length).toBeGreaterThan(0);
      for (const robot of robots) expect(robot.loadedUnder).toEqual({ melody: 'hypnotic' });
    });

    it('a retransmit that picks an aspect deals it to the roster, and one that clears the picks leaves no loadedUnder', () => {
      initializeLocale(DEFAULT_LOCALE_ID, { startSystems: false });
      retransmitWorld({ aspects: { melody: ['mechanical'] } });
      for (const robot of currentWorld().locale.robots) expect(robot.loadedUnder).toEqual({ melody: 'mechanical' });
      retransmitWorld({ aspects: {} });
      for (const robot of currentWorld().locale.robots) expect(robot.loadedUnder).toBeUndefined();
    });

    // docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R2: an unchanged style fires no style-sync, so the loading change pushes
    // the regenerated bank and global links itself, to a primed bank only: the context running, or suspended by a pause.
    // Before the first start primes the bank from the store, nothing is pushed.
    describe('the regenerated LFO bank and global links reach a primed engine', () => {
      /** The engine's bank and link setters, stubbed: this file never builds the lanes. linkTarget answers as an
       *  unprimed engine does. */
      const stubBankEngine = () => ({
        shape: vi.spyOn(lfoEngine, 'setBankShape').mockImplementation(() => {}),
        rate: vi.spyOn(lfoEngine, 'setBankRate').mockImplementation(() => {}),
        rateDrift: vi.spyOn(lfoEngine, 'setBankRateDrift').mockImplementation(() => {}),
        depthDrift: vi.spyOn(lfoEngine, 'setBankDepthDrift').mockImplementation(() => {}),
        link: vi.spyOn(lfoEngine, 'linkTarget').mockImplementation(() => false),
      });
      /** The call orders of the global links only: a robot's link carries its id as a third argument. */
      const globalLinkOrders = (link: ReturnType<typeof stubBankEngine>['link']) =>
        link.mock.calls.flatMap((call, i) => (call.length === 2 ? [link.mock.invocationCallOrder[i]] : []));

      // Since final fixes F17 a theme writes only the lanes and links it moves, so only those are pushed; every lane's
      // last rate is still its resolved one at the new tempo (the tempo's re-push covers a synced lane that stays).
      it('a theme pick pushes each lane and global link it moves, with the context suspended, and every lane ends at its resolved rate', () => {
        pinStyle();
        initializeLocale(DEFAULT_LOCALE_ID, { startSystems: false });
        // The global half as Classic seeds it: an earlier case's theme leaves its own in the store.
        const { style } = currentWorld();
        const audio = useAudioStore.getState();
        audio.regenerateBpmFromSeed(style.id, style.name);
        audio.regenerateGlobalAudioFromSeed(style.id, style.name);
        audio.regenerateLfoBankFromSeed(style.id, style.name);
        audio.regenerateGlobalLfoLinksFromSeed(style.id, style.name);
        vi.spyOn(lfoShared, 'isAudioContextRunning').mockReturnValue(false);
        vi.spyOn(lfoEngine, 'isBankPrimed').mockReturnValue(true);
        const before = structuredClone({ lfoBank: useAudioStore.getState().lfoBank, links: useAudioStore.getState().globalLfoLinks });
        const engine = stubBankEngine();

        retransmitWorld({ theme: 'float' });

        const { lfoBank, globalLfoLinks, bpm } = useAudioStore.getState();
        const movedLanes = LFO_LANE_IDS.filter((lane) => !deepEqual(lfoBank[lane], before.lfoBank[lane]));
        // Precondition: the theme moves some lanes and leaves others, so the pushes below are proven to follow the move.
        // (Lane a alone moved on the plain draws; lane b alone since Even Seeded Draws T13.)
        expect(movedLanes.length).toBeGreaterThan(0);
        expect(movedLanes.length).toBeLessThan(LFO_LANE_IDS.length);
        expect(engine.shape.mock.calls.map(([lane]) => lane).sort()).toEqual([...movedLanes].sort());
        for (const lane of movedLanes) {
          const engineLane = resolveLaneForEngine(lfoBank[lane], bpm);
          expect(engine.shape).toHaveBeenCalledWith(lane, engineLane.shape);
          expect(engine.rateDrift).toHaveBeenCalledWith(lane, engineLane.rateDrift);
          expect(engine.depthDrift).toHaveBeenCalledWith(lane, engineLane.depthDrift);
        }
        for (const lane of LFO_LANE_IDS) {
          const last = engine.rate.mock.calls.filter(([l]) => l === lane).at(-1);
          if (last) expect(last).toEqual([lane, resolveLaneForEngine(lfoBank[lane], bpm).rate]);
        }
        const movedLinks = GLOBAL_LFO_TARGET_IDS.filter((target) => !deepEqual(globalLfoLinks[target], before.links[target]));
        expect(globalLinkOrders(engine.link)).toHaveLength(movedLinks.length);
        for (const target of movedLinks) expect(engine.link).toHaveBeenCalledWith(target, globalLfoLinks[target]);
      });

      it('pushes nothing before the bank is primed, even with the context running: the first start primes from the store', () => {
        initializeLocale(DEFAULT_LOCALE_ID, { startSystems: false });
        vi.spyOn(lfoShared, 'isAudioContextRunning').mockReturnValue(true);
        vi.spyOn(lfoEngine, 'isBankPrimed').mockReturnValue(false);
        const engine = stubBankEngine();

        retransmitWorld({ theme: 'float' });

        expect(engine.shape).not.toHaveBeenCalled();
        expect(engine.rateDrift).not.toHaveBeenCalled();
        expect(engine.depthDrift).not.toHaveBeenCalled();
        expect(globalLinkOrders(engine.link)).toEqual([]);
      });

      it('a theme riding on a plot move pushes too; a plain plot move regenerates no global half and pushes nothing', () => {
        initializeLocale(DEFAULT_LOCALE_ID, { startSystems: false });
        vi.spyOn(lfoEngine, 'isBankPrimed').mockReturnValue(true);
        const engine = stubBankEngine();

        retransmitWorld({ coordinates: { x: 500, y: 500 } });

        expect(engine.shape).not.toHaveBeenCalled();
        expect(globalLinkOrders(engine.link)).toEqual([]);

        retransmitWorld({ coordinates: { x: 600, y: 600 }, theme: 'float' });

        expect(engine.shape).toHaveBeenCalledTimes(LFO_LANE_IDS.length);
        expect(globalLinkOrders(engine.link)).toHaveLength(GLOBAL_LFO_TARGET_IDS.length);
      });
    });
  });
});
