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
      calm: {
        bpm: { min: 150, max: 160 },
        'filterLPF.frequency': { min: 500, max: 600 },
        'robot.rhythmicDensity': { min: 90, max: 100 },
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
import type { AspectPick } from '../data/bands/aspects';
import { getWorldState, setWorldState } from './worldState';
import { AudioEngine } from '../engine/AudioEngine';
import { getLocaleNoiseMap, tryGetLocaleNoiseMap } from '../utils/noiseMaps';
import { getSeededVal } from '../utils/getSeededVal';
import { generateAttenuationStyleBpm } from '../utils/bpmSeed';
import { initializeLocale, retransmitWorld, rollWorld, startLocaleSystems } from './worldTransition';
import { getCurrentMeasure } from '../engine/beatClock';
import { recolorActorsForAttenuationStyle } from './factoryPlacementSystem';
import { stopRobotLifecycle } from './robotSystems';
import { stopAudioSwells } from './audioSwells';
import * as audioSwellsModule from './audioSwells';
import * as workLoopModule from './workLoop';
import * as robotSystemsModule from './robotSystems';
import { MAX_ROBOTS } from '../constants';
import { computeLocaleHour } from '../constants/time';
import { DockingState } from '../types/Robot';
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
      useUIStore.setState({ selectedRobotId: 'some-robot', activeHubTile: 'settings' });
      retransmitWorld({ coordinates: { x: 1000, y: 2000 } });
      expect(useUIStore.getState().selectedRobotId).toBeNull();
      expect(useUIStore.getState().activeHubTile).toBe('settings');
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

    it('a both-changed retransmit, and a roll, write the whole new identity', () => {
      initializeLocale(DEFAULT_LOCALE_ID, { startSystems: false });
      retransmitWorld({ attenuationStyleName: 'Brinemouth', coordinates: { x: -7, y: 300 } });
      expect(window.location.search).toBe('?seed=Brinemouth&x=-7&y=300');
      rollWorld();
      const style = selectCurrentAttenuationStyle(useAttenuationStyleStore.getState())!;
      const locale = useLocaleStore.getState().getLocaleById(style.currentLocaleId!)!;
      expect(params().get('seed')).toBe(style.name);
      expect(params().get('x')).toBe(String(locale.coordinates.x));
      expect(params().get('y')).toBe(String(locale.coordinates.y));
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

    it('a theme alone keeps the Attenuation Style and the plot, sets the store, regenerates the global half under the new bands, and rebuilds the roster at the same identity', () => {
      initializeLocale(DEFAULT_LOCALE_ID, { startSystems: false });
      // A fresh locale first, as every retransmit makes: robot ids carry a per-locale spawn count kept at module scope,
      // and the default locale's count has been advanced by the tests above, so only a fresh plot's ids repeat.
      retransmitWorld({ coordinates: { x: 500, y: 500 } });
      const before = currentWorld();
      const robotIdsBefore = before.locale.robots.map((r) => r.id);
      expect(robotIdsBefore.length).toBeGreaterThan(0);
      const spies = spyRegenerators();

      retransmitWorld({ theme: 'calm' });

      const after = currentWorld();
      expect(after.style.id).toBe(before.style.id);
      expect(after.style.name).toBe(before.style.name);
      expect(after.locale.coordinates).toEqual(before.locale.coordinates);
      expect(after.locale.id).not.toBe(before.locale.id);
      expect(after.locale.robots.map((r) => r.id)).toEqual(robotIdsBefore);
      expect(useLoadingStore.getState().theme).toBe('calm');
      for (const spy of Object.values(spies)) {
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy).toHaveBeenCalledWith(before.style.id, before.style.name);
      }
      expect(useAudioStore.getState().bpm).toBeGreaterThanOrEqual(150);
      expect(useAudioStore.getState().bpm).toBeLessThanOrEqual(160);
      expect(useAudioStore.getState().globalAudio.filterLPF.frequency).toBeGreaterThanOrEqual(500);
      expect(useAudioStore.getState().globalAudio.filterLPF.frequency).toBeLessThanOrEqual(600);
      for (const robot of after.locale.robots) expect(robot.rhythmicDensity).toBeGreaterThanOrEqual(90);
      expect(getWorldState()).toBe('cold');
      expect(params().get('theme')).toBe('calm');
      expect(params().get('seed')).toBe(before.style.name);
    });

    it('aspects alone do the same: the store holds the canonical picks, the global half and the roster regenerate, and the bar carries melody', () => {
      initializeLocale(DEFAULT_LOCALE_ID, { startSystems: false });
      const before = currentWorld();
      const spies = spyRegenerators();
      retransmitWorld({ aspects: { melody: ['mechanical', 'hypnotic'] } });
      const after = currentWorld();
      expect(after.style.id).toBe(before.style.id);
      expect(after.locale.id).not.toBe(before.locale.id);
      expect(useLoadingStore.getState()).toMatchObject({ theme: 'classic', aspects: { melody: ['hypnotic', 'mechanical'] } });
      for (const spy of Object.values(spies)) expect(spy).toHaveBeenCalledTimes(1);
      expect(params().get('melody')).toBe('hypnotic,mechanical');
      expect(params().has('theme')).toBe(false);
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
      retransmitWorld({ coordinates: { x: 500, y: 500 }, theme: 'calm' });
      const after = currentWorld();
      expect(after.style.id).toBe(before.style.id);
      expect(after.locale.coordinates).toEqual({ x: 500, y: 500 });
      expect(useLoadingStore.getState().theme).toBe('calm');
      expect(spies.bpm).toHaveBeenCalledTimes(1);
      expect(spies.globalLfoLinks).toHaveBeenCalledTimes(1);
      expect(useAudioStore.getState().bpm).toBeGreaterThanOrEqual(150);
      for (const robot of after.locale.robots) expect(robot.rhythmicDensity).toBeGreaterThanOrEqual(90);
      expect(params().get('theme')).toBe('calm');
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
      retransmitWorld({ attenuationStyleName: 'Saltwhistle', theme: 'calm' });
      const { style, locale } = currentWorld();
      expect(style.name).toBe('Saltwhistle');
      expect(locale.coordinates).toEqual(coordinates);
      expect(useLoadingStore.getState().theme).toBe('calm');
      expect(useAudioStore.getState().bpm).toBeGreaterThanOrEqual(150);
      expect(useAudioStore.getState().bpm).toBeLessThanOrEqual(160);
      expect(locale.robots.length).toBeGreaterThan(0);
      for (const robot of locale.robots) expect(robot.rhythmicDensity).toBeGreaterThanOrEqual(90);
      expect(params().get('seed')).toBe('Saltwhistle');
      expect(params().get('theme')).toBe('calm');
    });

    it('a paused world is cold after a loading change, so the next flip starts (Task 8)', () => {
      initializeLocale(DEFAULT_LOCALE_ID, { startSystems: false });
      setWorldState('paused');
      retransmitWorld({ theme: 'calm' });
      expect(getWorldState()).toBe('cold');
    });

    it('follows the power state: powered on, the rebuilt world restarts its systems', () => {
      useUIStore.setState({ isPoweredOn: true });
      initializeLocale(DEFAULT_LOCALE_ID);
      const workStart = vi.spyOn(workLoopModule, 'startWorkLoop');
      retransmitWorld({ theme: 'calm' });
      expect(workStart).toHaveBeenCalledTimes(1);
      expect(getWorldState()).toBe('running');
    });

    it('reads the picks leniently: an unknown pick is dropped and a known one stands', () => {
      initializeLocale(DEFAULT_LOCALE_ID, { startSystems: false });
      retransmitWorld({ aspects: { melody: ['hypnotic', 'zzz' as AspectPick] } });
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

    it('a retransmit that picks an aspect deals it to the rebuilt roster, and one that clears the picks leaves no loadedUnder', () => {
      initializeLocale(DEFAULT_LOCALE_ID, { startSystems: false });
      retransmitWorld({ aspects: { melody: ['mechanical'] } });
      for (const robot of currentWorld().locale.robots) expect(robot.loadedUnder).toEqual({ melody: 'mechanical' });
      retransmitWorld({ aspects: {} });
      for (const robot of currentWorld().locale.robots) expect(robot.loadedUnder).toBeUndefined();
    });
  });

  // Roll (docs/tasks/OFF_SCREEN.md Task 13, spec assumption 14): a fresh random Attenuation Style and coordinates,
  // through retransmitWorld's full-reset branch; the loading store rides along untouched (band-table T25).
  describe('rollWorld', () => {
    function currentWorld() {
      const style = selectCurrentAttenuationStyle(useAttenuationStyleStore.getState())!;
      return { style, locale: useLocaleStore.getState().getLocaleById(style.currentLocaleId!)! };
    }

    it('retransmits to a fresh random Attenuation Style at coordinates drawn through randomCoordinate, and rebuilds the roster', () => {
      initializeLocale(DEFAULT_LOCALE_ID, { startSystems: false });
      rollWorld();
      const { style, locale } = currentWorld();
      expect(style.name).not.toBe(DEFAULT_PELAGOS.name);
      expect(style.name).toMatch(/^[a-z0-9]{1,8}$/); // generateRandomAttenuationStyleName's shape
      // The suite pins randomCoordinate to an alternating 12 / 68 (vitest.setup.ts), so a rolled plot is drawn from it.
      expect(new Set([locale.coordinates.x, locale.coordinates.y])).toEqual(new Set([12, 68]));
      expect(locale.robots).toHaveLength(MAX_ROBOTS);
      expect(locale.actors.length).toBeGreaterThan(0);
    });

    it('produces a fresh identity on every call: two rolls, two names, two locales', () => {
      initializeLocale(DEFAULT_LOCALE_ID, { startSystems: false });
      rollWorld();
      const first = currentWorld();
      rollWorld();
      const second = currentWorld();
      expect(second.style.name).not.toBe(first.style.name);
      expect(second.locale.id).not.toBe(first.locale.id);
      expect(useAttenuationStyleStore.getState().attenuationStyles).toHaveLength(1);
    });

    it('is a world change: a paused world is cold after a roll, so the next flip starts (Task 8)', () => {
      initializeLocale(DEFAULT_LOCALE_ID, { startSystems: false });
      setWorldState('paused');
      rollWorld();
      expect(getWorldState()).toBe('cold');
    });

    it('follows the power state like any retransmit: powered on, the new world starts its systems', () => {
      useUIStore.setState({ isPoweredOn: true });
      initializeLocale(DEFAULT_LOCALE_ID);
      const workStart = vi.spyOn(workLoopModule, 'startWorkLoop');
      rollWorld();
      expect(workStart).toHaveBeenCalledTimes(1);
      expect(workStart).toHaveBeenCalledWith(currentWorld().style.currentLocaleId);
      expect(getWorldState()).toBe('running');
    });

    it('keeps the loading: a Calm world with a pick rolls to another Calm world with the same pick, drawn under its bands, and the bar says so', () => {
      initializeLocale(DEFAULT_LOCALE_ID, { startSystems: false });
      retransmitWorld({ theme: 'calm', aspects: { melody: ['wandering'] } });
      rollWorld();
      expect(useLoadingStore.getState()).toMatchObject({ theme: 'calm', aspects: { melody: ['wandering'] } });
      const search = new URLSearchParams(window.location.search);
      expect(search.get('theme')).toBe('calm');
      expect(search.get('melody')).toBe('wandering');
      for (const robot of currentWorld().locale.robots) expect(robot.rhythmicDensity).toBeGreaterThanOrEqual(90);
      window.history.replaceState({}, '', '/');
    });
  });
});
