// ========================================
// IMPORTS
// ========================================
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { useLocaleStore, DEFAULT_LOCALE, DEFAULT_LOCALE_ID } from './localeStore';
import { AudioEngine } from '../engine/AudioEngine';
import { lfoEngine } from '../engine/lfoEngine';
import { computeLocaleHour } from '../constants/time';
import type { Locale } from '../types/locale';
import type { Company } from '../types/Company';
import type { Robot } from '../types/Robot';
import { RobotState, DockingState } from '../types/Robot';

// ========================================
// HELPERS
// ========================================

const makeRobot = (id: string): Robot => ({
  id,
  identityColor: '#428d95',
  state: RobotState.Idle,
  direction: 'right',
  position: { x: 0, y: 0 },
  destination: null,
  melody: [],
  audioAttributes: {
    waveform: 'sine',
    adsr: { attack: 0, decay: 0, sustain: 0, release: 0 },
    filterFreq: 0,
  },
  octaveRange: [3, 4],
  createdAt: Date.now(),
  masterVolume: 0.7,
  docking: DockingState.Active,
  batteryLevel: 100,
});

const makeCompany = (id: string, robotIds: string[] = []): Company => ({
  id,
  name: `Company ${id}`,
  color: '#4f6d7a',
  robotIds,
});

// ========================================
// TESTS
// ========================================

describe('localeStore', () => {
  beforeEach(() => {
    useLocaleStore.setState({ locales: { [DEFAULT_LOCALE_ID]: { ...DEFAULT_LOCALE } } });
  });

  describe('initial state', () => {
    it('has the default locale on init', () => {
      expect(useLocaleStore.getState().locales[DEFAULT_LOCALE_ID]).toBeDefined();
    });

    it('default locale attenuationStyleId is pelagos', () => {
      expect(useLocaleStore.getState().locales[DEFAULT_LOCALE_ID].attenuationStyleId).toBe('pelagos');
    });

    it('robots starts as empty array', () => {
      expect(useLocaleStore.getState().locales[DEFAULT_LOCALE_ID].robots).toEqual([]);
    });

    it('actors starts as empty array', () => {
      expect(useLocaleStore.getState().locales[DEFAULT_LOCALE_ID].actors).toEqual([]);
    });

    it('maintains serializable state', () => {
      expect(() => JSON.stringify(useLocaleStore.getState())).not.toThrow();
    });

    it('default locale coordinates still avoid the old (0, 0) default — kept for continuity, though no coordinate is unsafe anymore now that getLocaleNoiseMap hashes (x, y) directly instead of sampling simplex noise at the point (see docs/specs/LOCALE_SEED_DECOUPLING.md)', () => {
      expect(DEFAULT_LOCALE.coordinates).not.toEqual({ x: 0, y: 0 });
    });

    it('default locale coordinates are integers — CoordsInput.tsx and SectorSettingsDrawer.tsx both assume coordinates are integers system-wide (docs/specs/SECTOR_SETTINGS.md); a decimal default renders as a multi-decimal value on first load, before any user edit rounds it', () => {
      expect(Number.isInteger(DEFAULT_LOCALE.coordinates.x)).toBe(true);
      expect(Number.isInteger(DEFAULT_LOCALE.coordinates.y)).toBe(true);
    });

    describe('?x= / ?y= coordinate override (docs/PROCEDURAL_GENERATION.md)', () => {
      // The default locale's coordinates are computed once at module load, so
      // each case loads a fresh copy of both modules with the override already set.
      async function loadFreshWithOverride(override: { x: number | null; y: number | null }) {
        vi.resetModules();
        const seed = await import('../utils/seedUtils');
        seed.setLocaleCoordinateOverride(override);
        return import('./localeStore');
      }

      afterEach(() => {
        vi.resetModules();
      });

      it('uses both overridden axes for the default locale, and derives dayStartTimestamp from the overridden x', async () => {
        const fresh = await loadFreshWithOverride({ x: -5, y: 777 });
        expect(fresh.DEFAULT_LOCALE.coordinates).toEqual({ x: -5, y: 777 });
        // abs(-5 % 24) === 5 hours into the day
        expect(computeLocaleHour(fresh.DEFAULT_LOCALE.dayStartTimestamp)).toBeCloseTo(5, 0);
      });

      it('pins only the overridden axis and leaves the other on its random default', async () => {
        const fresh = await loadFreshWithOverride({ x: 30, y: null });
        expect(fresh.DEFAULT_LOCALE.coordinates.x).toBe(30);
        expect(Number.isInteger(fresh.DEFAULT_LOCALE.coordinates.y)).toBe(true);
      });

      it('registers the locale noise map from the overridden coordinates (same map as an explicit locale at those coordinates)', async () => {
        const fresh = await loadFreshWithOverride({ x: 41, y: 42 });
        const { tryGetLocaleNoiseMap, getLocaleNoiseMap } = await import('../utils/noiseMaps');
        const registered = tryGetLocaleNoiseMap(fresh.DEFAULT_LOCALE_ID);
        const reference = getLocaleNoiseMap('reference-locale', 41, 42);
        expect(registered).not.toBeNull();
        expect(registered!(0.3, 0.7)).toBe(reference(0.3, 0.7));
      });
    });

    it('has a dayStartTimestamp computed from its own x coordinate, per docs/specs/ATTENUATION_STYLE.md §1.1', () => {
      expect(typeof DEFAULT_LOCALE.dayStartTimestamp).toBe('number');
      expect(Number.isFinite(DEFAULT_LOCALE.dayStartTimestamp)).toBe(true);
    });

    it("computeLocaleHour(dayStartTimestamp) reads abs(x % 24) — 12 for x=12 — immediately after module load", () => {
      // DEFAULT_LOCALE.coordinates.x is 12; abs(12 % 24) === 12. True in tests
      // because vitest.setup.ts mocks randomCoordinate() back to a fixed
      // (12, 68)-equivalent sequence — see seedUtils.test.ts for coverage of
      // the real (unmocked) random behavior.
      expect(computeLocaleHour(DEFAULT_LOCALE.dayStartTimestamp)).toBeCloseTo(12, 0);
    });

    // Note: this tests getAttenuationStyleNoiseMap directly, not locale
    // generation — getLocaleNoiseMap no longer derives from the Attenuation
    // Style map at all (see docs/specs/LOCALE_SEED_DECOUPLING.md), so this
    // assertion is unaffected by that change; it's still true and still
    // worth asserting on its own.
    it('sampling the Attenuation Style noise map at the default locale\'s coordinates varies by AS seed', async () => {
      const { getAttenuationStyleNoiseMap } = await import('../utils/noiseMaps');
      const mapA = getAttenuationStyleNoiseMap('locale-dead-zone-check-a', 'seed-alpha');
      const mapB = getAttenuationStyleNoiseMap('locale-dead-zone-check-b', 'seed-beta');
      const { x, y } = DEFAULT_LOCALE.coordinates;
      expect(mapA(x, y)).not.toBe(mapB(x, y));
    });
  });

  describe('addRobot', () => {
    it('adds a robot to the locale', () => {
      useLocaleStore.getState().addRobot(DEFAULT_LOCALE_ID, makeRobot('r1'));
      expect(useLocaleStore.getState().locales[DEFAULT_LOCALE_ID].robots).toHaveLength(1);
      expect(useLocaleStore.getState().locales[DEFAULT_LOCALE_ID].robots[0].id).toBe('r1');
    });

    it('appends without overwriting existing robots', () => {
      useLocaleStore.getState().addRobot(DEFAULT_LOCALE_ID, makeRobot('r1'));
      useLocaleStore.getState().addRobot(DEFAULT_LOCALE_ID, makeRobot('r2'));
      expect(useLocaleStore.getState().locales[DEFAULT_LOCALE_ID].robots).toHaveLength(2);
    });
  });

  describe('removeRobot', () => {
    it('removes a robot by id', () => {
      useLocaleStore.getState().addRobot(DEFAULT_LOCALE_ID, makeRobot('r1'));
      useLocaleStore.getState().removeRobot(DEFAULT_LOCALE_ID, 'r1');
      expect(useLocaleStore.getState().locales[DEFAULT_LOCALE_ID].robots).toHaveLength(0);
    });

    it('does not affect other robots', () => {
      useLocaleStore.getState().addRobot(DEFAULT_LOCALE_ID, makeRobot('r1'));
      useLocaleStore.getState().addRobot(DEFAULT_LOCALE_ID, makeRobot('r2'));
      useLocaleStore.getState().removeRobot(DEFAULT_LOCALE_ID, 'r1');
      expect(useLocaleStore.getState().locales[DEFAULT_LOCALE_ID].robots[0].id).toBe('r2');
    });

    it('releases the robot\'s AudioEngine voice, melody, and LFO state (docs/tasks/AUDIO_ENGINE_CLEANUP.md Task 3)', () => {
      useLocaleStore.getState().addRobot(DEFAULT_LOCALE_ID, makeRobot('r1'));
      const releaseVoiceSpy = vi.spyOn(AudioEngine, 'releaseVoice');
      const unregisterMelodySpy = vi.spyOn(AudioEngine, 'unregisterRobotMelody');
      const disposeLfosSpy = vi.spyOn(lfoEngine, 'disposeRobotLfos');

      useLocaleStore.getState().removeRobot(DEFAULT_LOCALE_ID, 'r1');

      expect(releaseVoiceSpy).toHaveBeenCalledWith('r1');
      expect(unregisterMelodySpy).toHaveBeenCalledWith('r1');
      expect(disposeLfosSpy).toHaveBeenCalledWith('r1');

      releaseVoiceSpy.mockRestore();
      unregisterMelodySpy.mockRestore();
      disposeLfosSpy.mockRestore();
    });

    it('disposeRobotLfos throwing does not block AudioEngine cleanup or the removal itself', () => {
      useLocaleStore.getState().addRobot(DEFAULT_LOCALE_ID, makeRobot('r1'));
      const releaseVoiceSpy = vi.spyOn(AudioEngine, 'releaseVoice');
      const disposeLfosSpy = vi.spyOn(lfoEngine, 'disposeRobotLfos').mockImplementation(() => {
        throw new Error('simulated failure');
      });

      expect(() => useLocaleStore.getState().removeRobot(DEFAULT_LOCALE_ID, 'r1')).not.toThrow();
      expect(releaseVoiceSpy).toHaveBeenCalledWith('r1');
      expect(useLocaleStore.getState().locales[DEFAULT_LOCALE_ID].robots).toHaveLength(0);

      releaseVoiceSpy.mockRestore();
      disposeLfosSpy.mockRestore();
    });
  });

  describe('updateRobot', () => {
    it('updates a field on the robot', () => {
      useLocaleStore.getState().addRobot(DEFAULT_LOCALE_ID, makeRobot('r1'));
      useLocaleStore.getState().updateRobot(DEFAULT_LOCALE_ID, 'r1', { masterVolume: 0.5 });
      expect(useLocaleStore.getState().locales[DEFAULT_LOCALE_ID].robots[0].masterVolume).toBe(0.5);
    });

    it('leaves other robot fields unchanged', () => {
      useLocaleStore.getState().addRobot(DEFAULT_LOCALE_ID, makeRobot('r1'));
      useLocaleStore.getState().updateRobot(DEFAULT_LOCALE_ID, 'r1', { masterVolume: 0.1 });
      expect(useLocaleStore.getState().locales[DEFAULT_LOCALE_ID].robots[0].id).toBe('r1');
      expect(useLocaleStore.getState().locales[DEFAULT_LOCALE_ID].robots[0].state).toBe(RobotState.Idle);
    });

    describe('rhythmicDensity clamping (0-100% fill rate)', () => {
      it('clamps a value above 100 down to 100', () => {
        useLocaleStore.getState().addRobot(DEFAULT_LOCALE_ID, makeRobot('r1'));
        useLocaleStore.getState().updateRobot(DEFAULT_LOCALE_ID, 'r1', { rhythmicDensity: 150 });
        expect(useLocaleStore.getState().locales[DEFAULT_LOCALE_ID].robots[0].rhythmicDensity).toBe(100);
      });

      it('clamps a negative value up to 0', () => {
        useLocaleStore.getState().addRobot(DEFAULT_LOCALE_ID, makeRobot('r1'));
        useLocaleStore.getState().updateRobot(DEFAULT_LOCALE_ID, 'r1', { rhythmicDensity: -10 });
        expect(useLocaleStore.getState().locales[DEFAULT_LOCALE_ID].robots[0].rhythmicDensity).toBe(0);
      });

      it('passes an in-range value through untouched', () => {
        useLocaleStore.getState().addRobot(DEFAULT_LOCALE_ID, makeRobot('r1'));
        useLocaleStore.getState().updateRobot(DEFAULT_LOCALE_ID, 'r1', { rhythmicDensity: 42 });
        expect(useLocaleStore.getState().locales[DEFAULT_LOCALE_ID].robots[0].rhythmicDensity).toBe(42);
      });
    });

    describe('pitchRepeat clamping (0-100% lock strength)', () => {
      it('clamps a value above 100 down to 100', () => {
        useLocaleStore.getState().addRobot(DEFAULT_LOCALE_ID, makeRobot('r1'));
        useLocaleStore.getState().updateRobot(DEFAULT_LOCALE_ID, 'r1', { pitchRepeat: 150 });
        expect(useLocaleStore.getState().locales[DEFAULT_LOCALE_ID].robots[0].pitchRepeat).toBe(100);
      });

      it('clamps a negative value up to 0', () => {
        useLocaleStore.getState().addRobot(DEFAULT_LOCALE_ID, makeRobot('r1'));
        useLocaleStore.getState().updateRobot(DEFAULT_LOCALE_ID, 'r1', { pitchRepeat: -10 });
        expect(useLocaleStore.getState().locales[DEFAULT_LOCALE_ID].robots[0].pitchRepeat).toBe(0);
      });

      it('passes an in-range value through untouched', () => {
        useLocaleStore.getState().addRobot(DEFAULT_LOCALE_ID, makeRobot('r1'));
        useLocaleStore.getState().updateRobot(DEFAULT_LOCALE_ID, 'r1', { pitchRepeat: 42 });
        expect(useLocaleStore.getState().locales[DEFAULT_LOCALE_ID].robots[0].pitchRepeat).toBe(42);
      });
    });

    describe('rhythmicMotifLength / noteVariance clamping ({ active, value } toggles, value 0-8, active derived from value > 0)', () => {
      it('clamps rhythmicMotifLength.value above 8 down to 8, active stays true', () => {
        useLocaleStore.getState().addRobot(DEFAULT_LOCALE_ID, makeRobot('r1'));
        useLocaleStore.getState().updateRobot(DEFAULT_LOCALE_ID, 'r1', { rhythmicMotifLength: { active: true, value: 20 } });
        expect(useLocaleStore.getState().locales[DEFAULT_LOCALE_ID].robots[0].rhythmicMotifLength).toEqual({ active: true, value: 8 });
      });

      it('clamps rhythmicMotifLength.value below 0 up to 0, deriving active: false', () => {
        useLocaleStore.getState().addRobot(DEFAULT_LOCALE_ID, makeRobot('r1'));
        useLocaleStore.getState().updateRobot(DEFAULT_LOCALE_ID, 'r1', { rhythmicMotifLength: { active: false, value: -3 } });
        expect(useLocaleStore.getState().locales[DEFAULT_LOCALE_ID].robots[0].rhythmicMotifLength).toEqual({ active: false, value: 0 });
      });

      it('clamps noteVariance.value above 8 down to 8', () => {
        useLocaleStore.getState().addRobot(DEFAULT_LOCALE_ID, makeRobot('r1'));
        useLocaleStore.getState().updateRobot(DEFAULT_LOCALE_ID, 'r1', { noteVariance: { active: true, value: 99 } });
        expect(useLocaleStore.getState().locales[DEFAULT_LOCALE_ID].robots[0].noteVariance).toEqual({ active: true, value: 8 });
      });

      it('ignores a caller-supplied active: false when value > 0, deriving active: true instead', () => {
        useLocaleStore.getState().addRobot(DEFAULT_LOCALE_ID, makeRobot('r1'));
        useLocaleStore.getState().updateRobot(DEFAULT_LOCALE_ID, 'r1', {
          // active lies — the store must not trust it, and must derive from value instead
          noteVariance: { active: false, value: 5 },
        });
        expect(useLocaleStore.getState().locales[DEFAULT_LOCALE_ID].robots[0].noteVariance).toEqual({ active: true, value: 5 });
      });

      it('ignores a caller-supplied active: true when value === 0, deriving active: false instead', () => {
        useLocaleStore.getState().addRobot(DEFAULT_LOCALE_ID, makeRobot('r1'));
        useLocaleStore.getState().updateRobot(DEFAULT_LOCALE_ID, 'r1', {
          // active lies the other direction — still must not be trusted
          rhythmicMotifLength: { active: true, value: 0 },
        });
        expect(useLocaleStore.getState().locales[DEFAULT_LOCALE_ID].robots[0].rhythmicMotifLength).toEqual({ active: false, value: 0 });
      });

      it('derives active: false when value clamps down to exactly 0 after truncation', () => {
        useLocaleStore.getState().addRobot(DEFAULT_LOCALE_ID, makeRobot('r1'));
        useLocaleStore.getState().updateRobot(DEFAULT_LOCALE_ID, 'r1', {
          noteVariance: { active: true, value: 0.4 }, // truncates to 0
        });
        expect(useLocaleStore.getState().locales[DEFAULT_LOCALE_ID].robots[0].noteVariance).toEqual({ active: false, value: 0 });
      });

      it('rejects a bare-number payload (the old shape) instead of silently mis-clamping it', () => {
        useLocaleStore.getState().addRobot(DEFAULT_LOCALE_ID, makeRobot('r1'));
        useLocaleStore.getState().updateRobot(DEFAULT_LOCALE_ID, 'r1', {
          // @ts-expect-error — intentionally the old (pre-refactor) shape
          rhythmicMotifLength: 12,
        });
        // Neither silently clamped as if 12 were a `.value` under some implicit
        // shape, nor stored verbatim as a bare number — dropped entirely.
        expect(useLocaleStore.getState().locales[DEFAULT_LOCALE_ID].robots[0].rhythmicMotifLength).toBeUndefined();
      });

      it('passes an in-range { active, value } payload through untouched', () => {
        useLocaleStore.getState().addRobot(DEFAULT_LOCALE_ID, makeRobot('r1'));
        useLocaleStore.getState().updateRobot(DEFAULT_LOCALE_ID, 'r1', { rhythmicMotifLength: { active: true, value: 5 } });
        expect(useLocaleStore.getState().locales[DEFAULT_LOCALE_ID].robots[0].rhythmicMotifLength).toEqual({ active: true, value: 5 });
      });
    });

    describe('batteryLevel clamping (0-100)', () => {
      it('clamps a value above 100 down to 100', () => {
        useLocaleStore.getState().addRobot(DEFAULT_LOCALE_ID, makeRobot('r1'));
        useLocaleStore.getState().updateRobot(DEFAULT_LOCALE_ID, 'r1', { batteryLevel: 150 });
        expect(useLocaleStore.getState().locales[DEFAULT_LOCALE_ID].robots[0].batteryLevel).toBe(100);
      });

      it('clamps a negative value up to 0', () => {
        useLocaleStore.getState().addRobot(DEFAULT_LOCALE_ID, makeRobot('r1'));
        useLocaleStore.getState().updateRobot(DEFAULT_LOCALE_ID, 'r1', { batteryLevel: -10 });
        expect(useLocaleStore.getState().locales[DEFAULT_LOCALE_ID].robots[0].batteryLevel).toBe(0);
      });

      it('passes an in-range value through untouched', () => {
        useLocaleStore.getState().addRobot(DEFAULT_LOCALE_ID, makeRobot('r1'));
        useLocaleStore.getState().updateRobot(DEFAULT_LOCALE_ID, 'r1', { batteryLevel: 42 });
        expect(useLocaleStore.getState().locales[DEFAULT_LOCALE_ID].robots[0].batteryLevel).toBe(42);
      });

      it('truncates a fractional value', () => {
        useLocaleStore.getState().addRobot(DEFAULT_LOCALE_ID, makeRobot('r1'));
        useLocaleStore.getState().updateRobot(DEFAULT_LOCALE_ID, 'r1', { batteryLevel: 42.9 });
        expect(useLocaleStore.getState().locales[DEFAULT_LOCALE_ID].robots[0].batteryLevel).toBe(42);
      });
    });
  });

  describe('setLocaleData', () => {
    it('updates currentMeasure', () => {
      useLocaleStore.getState().setLocaleData(DEFAULT_LOCALE_ID, { currentMeasure: 42 });
      expect(useLocaleStore.getState().locales[DEFAULT_LOCALE_ID].currentMeasure).toBe(42);
    });

    it('merges partial data without overwriting unrelated fields', () => {
      useLocaleStore.getState().addRobot(DEFAULT_LOCALE_ID, makeRobot('r1'));
      useLocaleStore.getState().setLocaleData(DEFAULT_LOCALE_ID, { currentMeasure: 10 });
      expect(useLocaleStore.getState().locales[DEFAULT_LOCALE_ID].robots).toHaveLength(1);
    });
  });

  describe('addLocale / removeLocale', () => {
    const newLocale: Locale = { ...DEFAULT_LOCALE, id: 'locale-2', name: 'Locale Two' };

    it('adds a locale to the map', () => {
      useLocaleStore.getState().addLocale('pelagos', newLocale);
      expect(useLocaleStore.getState().locales['locale-2']).toBeDefined();
    });

    it('removes a locale from the map', () => {
      useLocaleStore.getState().addLocale('pelagos', newLocale);
      useLocaleStore.getState().removeLocale('locale-2');
      expect(useLocaleStore.getState().locales['locale-2']).toBeUndefined();
    });

    it('removing default locale leaves map empty', () => {
      useLocaleStore.getState().removeLocale(DEFAULT_LOCALE_ID);
      expect(Object.keys(useLocaleStore.getState().locales)).toHaveLength(0);
    });

    it('releases every robot\'s AudioEngine voice and melody before removing the locale', () => {
      useLocaleStore.getState().addRobot(DEFAULT_LOCALE_ID, makeRobot('r1'));
      useLocaleStore.getState().addRobot(DEFAULT_LOCALE_ID, makeRobot('r2'));
      const releaseVoiceSpy = vi.spyOn(AudioEngine, 'releaseVoice');
      const unregisterMelodySpy = vi.spyOn(AudioEngine, 'unregisterRobotMelody');

      useLocaleStore.getState().removeLocale(DEFAULT_LOCALE_ID);

      expect(releaseVoiceSpy).toHaveBeenCalledWith('r1');
      expect(releaseVoiceSpy).toHaveBeenCalledWith('r2');
      expect(unregisterMelodySpy).toHaveBeenCalledWith('r1');
      expect(unregisterMelodySpy).toHaveBeenCalledWith('r2');

      releaseVoiceSpy.mockRestore();
      unregisterMelodySpy.mockRestore();
    });

    it('disposes every robot\'s LFO state too, before removing the locale (docs/tasks/AUDIO_ENGINE_CLEANUP.md Task 3)', () => {
      useLocaleStore.getState().addRobot(DEFAULT_LOCALE_ID, makeRobot('r1'));
      useLocaleStore.getState().addRobot(DEFAULT_LOCALE_ID, makeRobot('r2'));
      const disposeLfosSpy = vi.spyOn(lfoEngine, 'disposeRobotLfos');

      useLocaleStore.getState().removeLocale(DEFAULT_LOCALE_ID);

      expect(disposeLfosSpy).toHaveBeenCalledWith('r1');
      expect(disposeLfosSpy).toHaveBeenCalledWith('r2');

      disposeLfosSpy.mockRestore();
    });

    it('removing a locale with zero robots calls no AudioEngine or LFO cleanup and does not throw', () => {
      const releaseVoiceSpy = vi.spyOn(AudioEngine, 'releaseVoice');
      const disposeLfosSpy = vi.spyOn(lfoEngine, 'disposeRobotLfos');

      expect(() => useLocaleStore.getState().removeLocale(DEFAULT_LOCALE_ID)).not.toThrow();
      expect(releaseVoiceSpy).not.toHaveBeenCalled();
      expect(disposeLfosSpy).not.toHaveBeenCalled();

      releaseVoiceSpy.mockRestore();
      disposeLfosSpy.mockRestore();
    });

    it('one robot\'s cleanup throwing does not block cleanup of the rest or the removal itself', () => {
      useLocaleStore.getState().addRobot(DEFAULT_LOCALE_ID, makeRobot('r1'));
      useLocaleStore.getState().addRobot(DEFAULT_LOCALE_ID, makeRobot('r2'));
      const releaseVoiceSpy = vi.spyOn(AudioEngine, 'releaseVoice').mockImplementation((id) => {
        if (id === 'r1') throw new Error('simulated failure');
      });
      const unregisterMelodySpy = vi.spyOn(AudioEngine, 'unregisterRobotMelody');

      expect(() => useLocaleStore.getState().removeLocale(DEFAULT_LOCALE_ID)).not.toThrow();
      expect(unregisterMelodySpy).toHaveBeenCalledWith('r1');
      expect(unregisterMelodySpy).toHaveBeenCalledWith('r2');
      expect(useLocaleStore.getState().locales[DEFAULT_LOCALE_ID]).toBeUndefined();

      releaseVoiceSpy.mockRestore();
      unregisterMelodySpy.mockRestore();
    });

    it('one robot\'s disposeRobotLfos throwing does not block disposal of the rest or the removal itself', () => {
      useLocaleStore.getState().addRobot(DEFAULT_LOCALE_ID, makeRobot('r1'));
      useLocaleStore.getState().addRobot(DEFAULT_LOCALE_ID, makeRobot('r2'));
      const disposeLfosSpy = vi.spyOn(lfoEngine, 'disposeRobotLfos').mockImplementation((id) => {
        if (id === 'r1') throw new Error('simulated failure');
      });

      expect(() => useLocaleStore.getState().removeLocale(DEFAULT_LOCALE_ID)).not.toThrow();
      expect(disposeLfosSpy).toHaveBeenCalledWith('r1');
      expect(disposeLfosSpy).toHaveBeenCalledWith('r2');
      expect(useLocaleStore.getState().locales[DEFAULT_LOCALE_ID]).toBeUndefined();

      disposeLfosSpy.mockRestore();
    });
  });

  describe('getLocaleById', () => {
    it('returns the locale for a known id', () => {
      expect(useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)?.id).toBe(DEFAULT_LOCALE_ID);
    });

    it('returns undefined for an unknown id', () => {
      expect(useLocaleStore.getState().getLocaleById('nonexistent')).toBeUndefined();
    });
  });

  describe('addCompany / updateCompany / getCompanyById', () => {
    it('adds a company to the locale', () => {
      useLocaleStore.getState().addCompany(DEFAULT_LOCALE_ID, makeCompany('c1'));
      expect(useLocaleStore.getState().locales[DEFAULT_LOCALE_ID].companies).toHaveLength(1);
      expect(useLocaleStore.getState().getCompanyById(DEFAULT_LOCALE_ID, 'c1')?.name).toBe('Company c1');
    });

    it('appends without overwriting existing companies', () => {
      useLocaleStore.getState().addCompany(DEFAULT_LOCALE_ID, makeCompany('c1'));
      useLocaleStore.getState().addCompany(DEFAULT_LOCALE_ID, makeCompany('c2'));
      expect(useLocaleStore.getState().locales[DEFAULT_LOCALE_ID].companies).toHaveLength(2);
    });

    it('updateCompany merges a partial update without touching other fields', () => {
      useLocaleStore.getState().addCompany(DEFAULT_LOCALE_ID, makeCompany('c1', ['r1']));
      useLocaleStore.getState().updateCompany(DEFAULT_LOCALE_ID, 'c1', { name: 'Renamed' });
      const company = useLocaleStore.getState().getCompanyById(DEFAULT_LOCALE_ID, 'c1');
      expect(company?.name).toBe('Renamed');
      expect(company?.robotIds).toEqual(['r1']);
    });

    it('updateCompany can set lastEditedOptions incrementally, field by field', () => {
      useLocaleStore.getState().addCompany(DEFAULT_LOCALE_ID, makeCompany('c1'));
      useLocaleStore.getState().updateCompany(DEFAULT_LOCALE_ID, 'c1', { lastEditedOptions: { masterVolume: 0.5 } });
      useLocaleStore.getState().updateCompany(DEFAULT_LOCALE_ID, 'c1', {
        lastEditedOptions: {
          ...useLocaleStore.getState().getCompanyById(DEFAULT_LOCALE_ID, 'c1')?.lastEditedOptions,
          rhythmicDensity: 80,
        },
      });
      const company = useLocaleStore.getState().getCompanyById(DEFAULT_LOCALE_ID, 'c1');
      expect(company?.lastEditedOptions).toEqual({ masterVolume: 0.5, rhythmicDensity: 80 });
    });

    it('getCompanyById returns undefined for an unknown id', () => {
      expect(useLocaleStore.getState().getCompanyById(DEFAULT_LOCALE_ID, 'nonexistent')).toBeUndefined();
    });
  });

  describe('removeCompany', () => {
    it('removes a company by id', () => {
      useLocaleStore.getState().addCompany(DEFAULT_LOCALE_ID, makeCompany('c1'));
      useLocaleStore.getState().removeCompany(DEFAULT_LOCALE_ID, 'c1');
      expect(useLocaleStore.getState().locales[DEFAULT_LOCALE_ID].companies).toHaveLength(0);
    });

    it('does not affect other companies', () => {
      useLocaleStore.getState().addCompany(DEFAULT_LOCALE_ID, makeCompany('c1'));
      useLocaleStore.getState().addCompany(DEFAULT_LOCALE_ID, makeCompany('c2'));
      useLocaleStore.getState().removeCompany(DEFAULT_LOCALE_ID, 'c1');
      expect(useLocaleStore.getState().locales[DEFAULT_LOCALE_ID].companies[0].id).toBe('c2');
    });

    it('clears companyId on every former member — they become Freelance', () => {
      useLocaleStore.getState().addRobot(DEFAULT_LOCALE_ID, { ...makeRobot('r1'), companyId: 'c1' });
      useLocaleStore.getState().addRobot(DEFAULT_LOCALE_ID, { ...makeRobot('r2'), companyId: 'c1' });
      useLocaleStore.getState().addCompany(DEFAULT_LOCALE_ID, makeCompany('c1', ['r1', 'r2']));

      useLocaleStore.getState().removeCompany(DEFAULT_LOCALE_ID, 'c1');

      const robots = useLocaleStore.getState().locales[DEFAULT_LOCALE_ID].robots;
      expect(robots.find((r) => r.id === 'r1')?.companyId).toBeUndefined();
      expect(robots.find((r) => r.id === 'r2')?.companyId).toBeUndefined();
    });

    it('does not touch a robot belonging to a different company', () => {
      useLocaleStore.getState().addRobot(DEFAULT_LOCALE_ID, { ...makeRobot('r1'), companyId: 'c1' });
      useLocaleStore.getState().addRobot(DEFAULT_LOCALE_ID, { ...makeRobot('r2'), companyId: 'c2' });
      useLocaleStore.getState().addCompany(DEFAULT_LOCALE_ID, makeCompany('c1', ['r1']));
      useLocaleStore.getState().addCompany(DEFAULT_LOCALE_ID, makeCompany('c2', ['r2']));

      useLocaleStore.getState().removeCompany(DEFAULT_LOCALE_ID, 'c1');

      expect(useLocaleStore.getState().locales[DEFAULT_LOCALE_ID].robots.find((r) => r.id === 'r2')?.companyId).toBe('c2');
    });
  });

  describe('getCompanyMembers', () => {
    it('returns exactly the robots whose companyId matches', () => {
      useLocaleStore.getState().addRobot(DEFAULT_LOCALE_ID, { ...makeRobot('r1'), companyId: 'c1' });
      useLocaleStore.getState().addRobot(DEFAULT_LOCALE_ID, { ...makeRobot('r2'), companyId: 'c2' });
      useLocaleStore.getState().addRobot(DEFAULT_LOCALE_ID, { ...makeRobot('r3'), companyId: 'c1' });

      const members = useLocaleStore.getState().getCompanyMembers(DEFAULT_LOCALE_ID, 'c1');

      expect(members.map((r) => r.id).sort()).toEqual(['r1', 'r3']);
    });

    it('returns an empty array when no robot belongs to the company', () => {
      useLocaleStore.getState().addRobot(DEFAULT_LOCALE_ID, makeRobot('r1'));
      expect(useLocaleStore.getState().getCompanyMembers(DEFAULT_LOCALE_ID, 'c1')).toEqual([]);
    });
  });

  describe('assignRobotToCompany', () => {
    it('moves a robot from company A to company B in one atomic transition', () => {
      useLocaleStore.getState().addRobot(DEFAULT_LOCALE_ID, { ...makeRobot('r1'), companyId: 'a' });
      useLocaleStore.getState().addCompany(DEFAULT_LOCALE_ID, makeCompany('a', ['r1']));
      useLocaleStore.getState().addCompany(DEFAULT_LOCALE_ID, makeCompany('b', []));

      useLocaleStore.getState().assignRobotToCompany(DEFAULT_LOCALE_ID, 'r1', 'b');

      const state = useLocaleStore.getState().locales[DEFAULT_LOCALE_ID];
      expect(state.robots.find((r) => r.id === 'r1')?.companyId).toBe('b');
      expect(state.companies.find((c) => c.id === 'a')?.robotIds).not.toContain('r1');
      expect(state.companies.find((c) => c.id === 'b')?.robotIds).toContain('r1');
    });

    it('assigns a Freelance robot (no prior company) into a company', () => {
      useLocaleStore.getState().addRobot(DEFAULT_LOCALE_ID, makeRobot('r1'));
      useLocaleStore.getState().addCompany(DEFAULT_LOCALE_ID, makeCompany('a', []));

      useLocaleStore.getState().assignRobotToCompany(DEFAULT_LOCALE_ID, 'r1', 'a');

      const state = useLocaleStore.getState().locales[DEFAULT_LOCALE_ID];
      expect(state.robots.find((r) => r.id === 'r1')?.companyId).toBe('a');
      expect(state.companies.find((c) => c.id === 'a')?.robotIds).toContain('r1');
    });

    it('moving a robot to null (Freelance) clears companyId and removes it from its old company', () => {
      useLocaleStore.getState().addRobot(DEFAULT_LOCALE_ID, { ...makeRobot('r1'), companyId: 'a' });
      useLocaleStore.getState().addCompany(DEFAULT_LOCALE_ID, makeCompany('a', ['r1']));

      useLocaleStore.getState().assignRobotToCompany(DEFAULT_LOCALE_ID, 'r1', null);

      const state = useLocaleStore.getState().locales[DEFAULT_LOCALE_ID];
      expect(state.robots.find((r) => r.id === 'r1')?.companyId).toBeUndefined();
      expect(state.companies.find((c) => c.id === 'a')?.robotIds).not.toContain('r1');
    });

    it('does not affect other robots or other companies\' membership', () => {
      useLocaleStore.getState().addRobot(DEFAULT_LOCALE_ID, { ...makeRobot('r1'), companyId: 'a' });
      useLocaleStore.getState().addRobot(DEFAULT_LOCALE_ID, { ...makeRobot('r2'), companyId: 'a' });
      useLocaleStore.getState().addCompany(DEFAULT_LOCALE_ID, makeCompany('a', ['r1', 'r2']));
      useLocaleStore.getState().addCompany(DEFAULT_LOCALE_ID, makeCompany('b', []));

      useLocaleStore.getState().assignRobotToCompany(DEFAULT_LOCALE_ID, 'r1', 'b');

      const state = useLocaleStore.getState().locales[DEFAULT_LOCALE_ID];
      expect(state.robots.find((r) => r.id === 'r2')?.companyId).toBe('a');
      expect(state.companies.find((c) => c.id === 'a')?.robotIds).toEqual(['r2']);
    });

    it('is a no-op for an unknown robotId', () => {
      useLocaleStore.getState().addCompany(DEFAULT_LOCALE_ID, makeCompany('a', []));
      expect(() => useLocaleStore.getState().assignRobotToCompany(DEFAULT_LOCALE_ID, 'nonexistent', 'a')).not.toThrow();
      expect(useLocaleStore.getState().locales[DEFAULT_LOCALE_ID].companies.find((c) => c.id === 'a')?.robotIds).toEqual([]);
    });

    it('re-assigning a robot to the company it is already in leaves it in robotIds — not removed', () => {
      // Regression test for a real bug found in code review: the old implementation used two
      // sequential `if`s that each `return`ed immediately inside the .map() callback, so when
      // oldCompanyId === companyId (re-selecting the currently-assigned company — reachable from
      // both RobotSelectionCard's and RobotDisplaySection's company Select, e.g. a user opening
      // the dropdown and clicking the already-checked option), the "remove from old company"
      // branch matched and returned before the "add to new company" branch ever ran, silently
      // dropping the robot from its own company's robotIds while robot.companyId stayed
      // unchanged — a real data-integrity split between the two, confirmed via an isolated repro
      // before this test was written.
      useLocaleStore.getState().addRobot(DEFAULT_LOCALE_ID, { ...makeRobot('r1'), companyId: 'a' });
      useLocaleStore.getState().addCompany(DEFAULT_LOCALE_ID, makeCompany('a', ['r1']));

      useLocaleStore.getState().assignRobotToCompany(DEFAULT_LOCALE_ID, 'r1', 'a');

      const state = useLocaleStore.getState().locales[DEFAULT_LOCALE_ID];
      expect(state.robots.find((r) => r.id === 'r1')?.companyId).toBe('a');
      expect(state.companies.find((c) => c.id === 'a')?.robotIds).toEqual(['r1']);
    });

    it('re-assigning to the same company does not disturb other members\' robotIds', () => {
      useLocaleStore.getState().addRobot(DEFAULT_LOCALE_ID, { ...makeRobot('r1'), companyId: 'a' });
      useLocaleStore.getState().addRobot(DEFAULT_LOCALE_ID, { ...makeRobot('r2'), companyId: 'a' });
      useLocaleStore.getState().addCompany(DEFAULT_LOCALE_ID, makeCompany('a', ['r1', 'r2']));

      useLocaleStore.getState().assignRobotToCompany(DEFAULT_LOCALE_ID, 'r1', 'a');

      const robotIds = useLocaleStore.getState().locales[DEFAULT_LOCALE_ID].companies.find((c) => c.id === 'a')?.robotIds;
      expect(robotIds?.sort()).toEqual(['r1', 'r2']);
    });

    it('re-selecting Freelance for an already-Freelance robot stays a no-op', () => {
      useLocaleStore.getState().addRobot(DEFAULT_LOCALE_ID, makeRobot('r1'));
      useLocaleStore.getState().addCompany(DEFAULT_LOCALE_ID, makeCompany('a', []));

      useLocaleStore.getState().assignRobotToCompany(DEFAULT_LOCALE_ID, 'r1', null);

      const state = useLocaleStore.getState().locales[DEFAULT_LOCALE_ID];
      expect(state.robots.find((r) => r.id === 'r1')?.companyId).toBeUndefined();
      expect(state.companies.find((c) => c.id === 'a')?.robotIds).toEqual([]);
    });
  });

  describe('removeLocale with companies', () => {
    it('does not throw for a locale with populated companies — no AudioEngine state on a company itself', () => {
      useLocaleStore.getState().addCompany(DEFAULT_LOCALE_ID, makeCompany('c1'));
      expect(() => useLocaleStore.getState().removeLocale(DEFAULT_LOCALE_ID)).not.toThrow();
      expect(useLocaleStore.getState().locales[DEFAULT_LOCALE_ID]).toBeUndefined();
    });
  });
});
