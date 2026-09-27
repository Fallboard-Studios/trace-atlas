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

// Spy on recolorFactoriesForAttenuationStyle while keeping every other export
// (placeFactories, createFactory, ...) real — initializeLocale/placeFactories
// must keep spawning real factories for the other describe blocks below.
vi.mock('./factoryPlacementSystem', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./factoryPlacementSystem')>();
  return { ...actual, recolorFactoriesForAttenuationStyle: vi.fn(actual.recolorFactoriesForAttenuationStyle) };
});

// ========================================
// IMPORTS
// ========================================
import { useLocaleStore, DEFAULT_LOCALE, DEFAULT_LOCALE_ID } from '../stores/localeStore';
import { useAttenuationStyleStore, selectCurrentAttenuationStyle, DEFAULT_PELAGOS } from '../stores/attenuationStyleStore';
import { useUIStore } from '../stores/uiStore';
import { useAudioStore } from '../stores/audioStore';
import { AudioEngine } from '../engine/AudioEngine';
import { getLocaleNoiseMap, tryGetLocaleNoiseMap } from '../utils/noiseMaps';
import { getSeededVal } from '../utils/getSeededVal';
import { generateLocaleBpm } from '../utils/localeBpmSeed';
import { initializeLocale, retransmitWorld } from './worldTransition';
import { recolorFactoriesForAttenuationStyle } from './factoryPlacementSystem';
import { stopRobotLifecycle } from './robotSystems';
import { stopAudioSwells, getActiveSwellSnapshot, tickAudioSwells } from './audioSwells';
import * as audioSwellsModule from './audioSwells';
import { MAX_ROBOTS } from '../constants';
import { computeLocaleHour } from '../constants/time';
import { RobotState, DockingState } from '../types/Robot';
import type { Robot } from '../types/Robot';

// ========================================
// HELPERS
// ========================================

function resetStores() {
  useAttenuationStyleStore.setState({ attenuationStyles: [{ ...DEFAULT_PELAGOS }], currentAttenuationStyleId: DEFAULT_PELAGOS.id });
  useLocaleStore.setState({ locales: { [DEFAULT_LOCALE_ID]: { ...DEFAULT_LOCALE, robots: [], actors: [] } } });
  useUIStore.setState({ selectedRobotId: null, activeHubTile: null });
}

const makeRobot = (id: string): Robot => ({
  id,
  identityColor: '#428d95',
  state: RobotState.Idle,
  direction: 'right',
  position: { x: 0, y: 0 },
  destination: null,
  melody: [],
  audioAttributes: { waveform: 'sine', adsr: { attack: 0, decay: 0, sustain: 0, release: 0 }, filterFreq: 0 },
  octaveRange: [3, 4],
  createdAt: Date.now(),
  masterVolume: 0.7,
  docking: DockingState.Active,
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
  });

  describe('initializeLocale', () => {
    it(`places factories and spawns exactly ${MAX_ROBOTS} robots for an empty locale`, () => {
      initializeLocale(DEFAULT_LOCALE_ID);
      const locale = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)!;
      expect(locale.actors.length).toBeGreaterThan(0);
      expect(locale.robots).toHaveLength(MAX_ROBOTS);
    });

    it('assigns a job to every initially-Active robot', () => {
      initializeLocale(DEFAULT_LOCALE_ID);
      const locale = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)!;
      locale.robots.filter((r) => r.docking === DockingState.Active).forEach((r) => {
        expect(r.job).toBeDefined();
      });
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

    // KNOWN FLAKY (2026-09-27): relies on real seeded noise actually triggering a swell within 50
    // measures rather than a mocked/forced trigger — see the comment below on the exact odds. Rare
    // but real failures reproduce under `expect(seededSomething).toBe(true)`, not the clearing
    // assertions below it, i.e. it's the precondition rolling badly, not the code under test being
    // broken. If this fails, re-run once to confirm before treating it as a regression — don't
    // auto-retry it repeatedly on failure, and don't "fix" the assertion values if it fails.
    it('fully clears in-flight swells on a second initializeLocale call — no swell survives a restart', () => {
      initializeLocale(DEFAULT_LOCALE_ID);
      // Real seeded noise on the fixed default seed — 50 measures makes it
      // astronomically unlikely neither pool ever triggers (~0.28 chance per
      // pool per measure), so this reliably seeds at least one active swell
      // without needing to mock the noise map.
      for (let measure = 0; measure < 50; measure++) tickAudioSwells(DEFAULT_LOCALE_ID, measure);
      const seededSomething =
        getActiveSwellSnapshot('global').length > 0 || getActiveSwellSnapshot('robot').length > 0;
      expect(seededSomething).toBe(true);

      initializeLocale(DEFAULT_LOCALE_ID);

      expect(getActiveSwellSnapshot('global')).toEqual([]);
      expect(getActiveSwellSnapshot('robot')).toEqual([]);
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

    it('never calls recolorFactoriesForAttenuationStyle — this branch never changes the AS', () => {
      retransmitWorld({ coordinates: { x: 1000, y: 2000 } });
      expect(recolorFactoriesForAttenuationStyle).not.toHaveBeenCalled();
    });

    it("reseeds audioStore.bpm from the new locale's own id/coordinates (docs/specs/BPM_CONTROL.md §1.3)", () => {
      retransmitWorld({ coordinates: { x: 1000, y: 2000 } });
      const attenuationStyle = selectCurrentAttenuationStyle(useAttenuationStyleStore.getState())!;
      const newLocale = useLocaleStore.getState().getLocaleById(attenuationStyle.currentLocaleId!)!;
      expect(useAudioStore.getState().bpm).toBe(generateLocaleBpm(newLocale.id, 1000, 2000));
    });

    it('discards a manually-dialed bpm in favor of the freshly seeded value', () => {
      useAudioStore.getState().setBPM(190); // outside the [40, 100] seed range, so it's unambiguous
      retransmitWorld({ coordinates: { x: 1000, y: 2000 } });
      expect(useAudioStore.getState().bpm).not.toBe(190);
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

    it('calls recolorFactoriesForAttenuationStyle exactly once, with the preserved locale id and the NEW attenuationStyle id/name', () => {
      retransmitWorld({ attenuationStyleName: 'Kryndara' });
      const attenuationStyle = selectCurrentAttenuationStyle(useAttenuationStyleStore.getState())!;
      expect(recolorFactoriesForAttenuationStyle).toHaveBeenCalledTimes(1);
      expect(recolorFactoriesForAttenuationStyle).toHaveBeenCalledWith(DEFAULT_LOCALE_ID, attenuationStyle.id, attenuationStyle.name);
    });

    it("does NOT reseed audioStore.bpm — the preserved locale's coordinates never changed (docs/specs/BPM_CONTROL.md §1.3)", () => {
      useAudioStore.getState().setBPM(190); // outside the seed range, so any drift is unambiguous
      retransmitWorld({ attenuationStyleName: 'Kryndara' });
      expect(useAudioStore.getState().bpm).toBe(190);
    });

    it("preserves every factory's id/position/scale — only hueShift/satShift may change, per recolorFactoriesForAttenuationStyle", () => {
      initializeLocale(DEFAULT_LOCALE_ID); // real placeFactories — populates real actors
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

    it('never calls recolorFactoriesForAttenuationStyle — the old locale is discarded, not recolored', () => {
      retransmitWorld({ attenuationStyleName: 'Vessport Null', coordinates: { x: 42, y: 42 } });
      expect(recolorFactoriesForAttenuationStyle).not.toHaveBeenCalled();
    });

    it("reseeds audioStore.bpm from the new locale's own id/coordinates (docs/specs/BPM_CONTROL.md §1.3)", () => {
      retransmitWorld({ attenuationStyleName: 'Vessport Null', coordinates: { x: 42, y: 42 } });
      const attenuationStyle = selectCurrentAttenuationStyle(useAttenuationStyleStore.getState())!;
      const locale = useLocaleStore.getState().getLocaleById(attenuationStyle.currentLocaleId!)!;
      expect(useAudioStore.getState().bpm).toBe(generateLocaleBpm(locale.id, 42, 42));
    });
  });

  describe('robot lifecycle tick ordering', () => {
    it('stops the previous tick before starting the new locale\'s', async () => {
      const { subscribeToMeasure } = await import('../engine/beatClock');
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
});
