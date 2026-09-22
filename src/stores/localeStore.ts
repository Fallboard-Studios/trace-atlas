import { create } from 'zustand';

import type { Locale, LocaleState } from '../types/locale';
import { DEFAULT_LOCALE_ID } from './attenuationStyleStore';
import { DAY_DURATION_MS } from '../constants/time';
import { getLocaleNoiseMap, evictLocaleNoiseMap } from '../utils/noiseMaps';
import { randomCoordinate, getLocaleCoordinateOverride } from '../utils/seedUtils';
import { AudioEngine } from '../engine/AudioEngine';
import { lfoEngine } from '../engine/lfoEngine';
import {
  DEV_TUNING,
  RHYTHMIC_DENSITY_MIN,
  RHYTHMIC_DENSITY_MAX,
  RHYTHMIC_MOTIF_LENGTH_MIN,
  RHYTHMIC_MOTIF_LENGTH_MAX,
  NOTE_VARIANCE_MIN,
  NOTE_VARIANCE_MAX,
  OCTAVE_RANGE_MIN,
  OCTAVE_RANGE_MAX,
  PITCH_REPEAT_MIN,
  PITCH_REPEAT_MAX,
} from '../constants';
import { swallow } from '../utils/helpers';

/**
 * Clamp a { active, value } toggle payload (rhythmicMotifLength/noteVariance) to
 * [min, max], deriving `active` from the clamped `value` (`value > 0`) rather than
 * trusting whatever the caller supplied for `active` — the single central enforcement
 * point for the value > 0 <=> active invariant (docs/specs/STEPPER_TO_SLIDER.md); every
 * store-mediated write funnels through here via updateRobot. Returns undefined for
 * anything that isn't a well-formed object with a finite `value` — notably the old
 * pre-refactor bare-number shape — so the caller can reject it instead of
 * silently mis-clamping a number that was never meant to be read as `.value`.
 */
function clampToggleValue(v: unknown, min: number, max: number): { active: boolean; value: number } | undefined {
  if (typeof v !== 'object' || v === null) return undefined;
  const { value } = v as { value?: unknown };
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const clamped = Math.max(min, Math.min(max, Math.trunc(value)));
  return { active: clamped > 0, value: clamped };
}

// Randomized once per module load (page load), via the same randomCoordinate()
// Sector Settings' own "Random" coordinate button uses — otherwise every fresh
// session dropped into the exact same plot. No seed/reproducibility contract
// applies here the way resolveDefaultAttenuationStyleName's override does for
// the Attenuation Style name: coordinates are already a freely user-driven
// axis (Sector Settings lets anyone retransmit to new ones at will), so there
// is nothing to keep stable across reloads. In tests, vitest.setup.ts mocks
// randomCoordinate back to a fixed (12, 68)-equivalent sequence — the whole
// suite (this file's own tests included) was written assuming a fixed,
// reproducible default locale for seeded/noise-map-derived determinism
// checks, so the mock restores that instead of requiring every dependent
// test file to pin coordinates itself.
//
// Was originally a fixed, non-integer value ({ x: 12.3456, y: 67.891 }) to
// dodge a dead zone in the OLD Attenuation-Style-sampled locale derivation
// (integer/half-integer-aligned coordinates like (0,0)/(0.5,0.5)/(1,1) used
// to collapse to a low- or zero-entropy result). getLocaleNoiseMap
// (src/utils/noiseMaps.ts) now hashes (x, y) directly instead of sampling
// simplex noise at the point, which structurally eliminates that class of
// bug — no coordinate is unsafe anymore (see docs/specs/LOCALE_SEED_DECOUPLING.md).
// Still rounded to an integer because CoordsInput.tsx/SectorSettingsDrawer.tsx
// both assume coordinates are integers system-wide (docs/specs/SECTOR_SETTINGS.md)
// — randomCoordinate() already rounds, so this stays true without extra work.
//
// `?x=` / `?y=` (seedUtils.ts) pin either axis for reproducible bug repros/
// profiling: `?seed=` alone only pins the Attenuation Style, and the locale
// noise map (robots, BPM, idle/interaction) is seeded from the coordinates
// too. An unset axis stays random. This is a boot-time override only —
// Sector Settings' own "Random" button still calls randomCoordinate() ungated.
const coordinateOverride = getLocaleCoordinateOverride();
const DEFAULT_LOCALE_COORDINATES = {
  x: coordinateOverride.x ?? randomCoordinate(),
  y: coordinateOverride.y ?? randomCoordinate(),
};

const DEFAULT_LOCALE: Locale = {
  id: DEFAULT_LOCALE_ID,
  attenuationStyleId: 'pelagos',
  name: 'Pelagos Ocean',
  coordinates: DEFAULT_LOCALE_COORDINATES,
  // Computed once at module load via the same x-derived formula buildLocale
  // uses (worldTransition.ts) — see docs/specs/ATTENUATION_STYLE.md §1.1.
  dayStartTimestamp: Date.now() - (Math.abs(DEFAULT_LOCALE_COORDINATES.x % 24) / 24) * DAY_DURATION_MS,
  robots: [],
  actors: [],
  companies: [],
  currentMeasure: 0,
};

// Reuse DEFAULT_LOCALE.coordinates rather than a second hardcoded x/y pair
// that could silently drift from it. getLocaleNoiseMap no longer takes an
// Attenuation Style argument at all (see docs/specs/LOCALE_SEED_DECOUPLING.md) — the
// locale noise map is purely a function of these coordinates.
getLocaleNoiseMap(DEFAULT_LOCALE_ID, DEFAULT_LOCALE.coordinates.x, DEFAULT_LOCALE.coordinates.y);

export const useLocaleStore = create<LocaleState>((set, get) => ({
  locales: { [DEFAULT_LOCALE_ID]: DEFAULT_LOCALE },

  addLocale: (attenuationStyleId, locale) => {
    const toAdd: Locale = { ...locale, attenuationStyleId };

    set((state) => ({ locales: { ...state.locales, [toAdd.id]: toAdd } }));
    getLocaleNoiseMap(toAdd.id, toAdd.coordinates.x, toAdd.coordinates.y);
  },

  setLocaleData: (localeId, partial) => {
    const cloned = { ...partial } as Partial<Locale>;

    set((state) => {
      const existing = state.locales[localeId];
      if (!existing) return state;
      return {
        locales: {
          ...state.locales,
          [localeId]: { ...existing, ...cloned },
        },
      };
    });
  },

  removeLocale: (localeId) => {
    // Release every robot's AudioEngine state first — mirrors removeRobot's
    // own cleanup exactly, since removeLocale is discarding these robots the
    // same way removeRobot discards a single one. Independently try/caught
    // per call so one robot's failure doesn't block cleanup of the rest.
    const existing = get().locales[localeId];
    if (existing) {
      for (const robot of existing.robots) {
        try {
          AudioEngine.releaseVoice(robot.id);
        } catch (err) {
          if (DEV_TUNING) swallow(err, 'AudioEngine.releaseVoice');
        }
        try {
          AudioEngine.unregisterRobotMelody(robot.id);
        } catch (err) {
          if (DEV_TUNING) swallow(err, 'AudioEngine.unregisterRobotMelody');
        }
        try {
          lfoEngine.disposeRobotLfos(robot.id);
        } catch (err) {
          if (DEV_TUNING) swallow(err, 'lfoEngine.disposeRobotLfos');
        }
      }
    }

    set((state) => {
      const next = { ...state.locales };
      delete next[localeId];
      return { locales: next };
    });
    evictLocaleNoiseMap(localeId);
  },

  getLocaleById: (localeId) => get().locales[localeId],
  // Robot helpers
  addRobot: (localeId, robot) => {
    set((state) => {
      const existing = state.locales[localeId];
      if (!existing) return state;
      const updated: Locale = { ...existing, robots: [...(existing.robots || []), robot] };
      return { locales: { ...state.locales, [localeId]: updated } };
    });
  },

  updateRobot: (localeId, robotId, updates) => {
    set((state) => {
      const existing = state.locales[localeId];
      if (!existing) return state;

      // Validate and clamp well-known numeric robot fields at store entry point.
      const normalized = { ...updates } as Partial<import('../types/Robot').Robot>;
      if (typeof normalized.rhythmicDensity === 'number') {
        normalized.rhythmicDensity = Math.max(RHYTHMIC_DENSITY_MIN, Math.min(RHYTHMIC_DENSITY_MAX, Math.trunc(normalized.rhythmicDensity)));
      }
      if (typeof normalized.pitchRepeat === 'number') {
        normalized.pitchRepeat = Math.max(PITCH_REPEAT_MIN, Math.min(PITCH_REPEAT_MAX, Math.trunc(normalized.pitchRepeat)));
      }
      if (typeof normalized.batteryLevel === 'number') {
        normalized.batteryLevel = Math.max(0, Math.min(100, Math.trunc(normalized.batteryLevel)));
      }
      if (normalized.rhythmicMotifLength !== undefined) {
        const clamped = clampToggleValue(normalized.rhythmicMotifLength, RHYTHMIC_MOTIF_LENGTH_MIN, RHYTHMIC_MOTIF_LENGTH_MAX);
        if (clamped) {
          normalized.rhythmicMotifLength = clamped;
        } else {
          // Malformed payload (e.g. the old pre-refactor bare-number shape) —
          // reject rather than silently mis-clamp it as if it were the new shape.
          delete normalized.rhythmicMotifLength;
        }
      }
      if (normalized.noteVariance !== undefined) {
        const clamped = clampToggleValue(normalized.noteVariance, NOTE_VARIANCE_MIN, NOTE_VARIANCE_MAX);
        if (clamped) {
          normalized.noteVariance = clamped;
        } else {
          delete normalized.noteVariance;
        }
      }
      if (Array.isArray(normalized.octaveRange) && normalized.octaveRange.length === 2) {
        let [minO, maxO] = (normalized.octaveRange as unknown[]).map((v: unknown) => Number(v));
        if (!Number.isFinite(minO) || !Number.isFinite(maxO)) {
          delete normalized.octaveRange;
        } else {
          minO = Math.max(OCTAVE_RANGE_MIN, Math.min(OCTAVE_RANGE_MAX, Math.trunc(minO)));
          maxO = Math.max(OCTAVE_RANGE_MIN, Math.min(OCTAVE_RANGE_MAX, Math.trunc(maxO)));
          if (maxO < minO) {
            const tmp = minO; minO = maxO; maxO = tmp;
          }
          normalized.octaveRange = [minO, maxO];
        }
      }

      const nextRobots = (existing.robots || []).map((r) => (r.id === robotId ? { ...r, ...normalized } : r));
      return { locales: { ...state.locales, [localeId]: { ...existing, robots: nextRobots } } };
    });
  },

  removeRobot: (localeId, robotId) => {
    // Centralized audio cleanup: release reserved voice and unregister any
    // registered melody for this robot before removing it from the store.
    try {
      AudioEngine.releaseVoice(robotId);
    } catch (err) {
      if (DEV_TUNING) swallow(err, 'AudioEngine.releaseVoice');
    }
    try {
      AudioEngine.unregisterRobotMelody(robotId);
    } catch (err) {
      if (DEV_TUNING) swallow(err, 'AudioEngine.unregisterRobotMelody');
    }
    try {
      lfoEngine.disposeRobotLfos(robotId);
    } catch (err) {
      if (DEV_TUNING) swallow(err, 'lfoEngine.disposeRobotLfos');
    }

    set((state) => {
      const existing = state.locales[localeId];
      if (!existing) return state;
      const nextRobots = (existing.robots || []).filter((r) => r.id !== robotId);
      return { locales: { ...state.locales, [localeId]: { ...existing, robots: nextRobots } } };
    });
  },

  getRobotById: (localeId, robotId) => get().locales[localeId]?.robots?.find((r) => r.id === robotId),

  // Company helpers (Roadmap Phase 10) — mirror the robot-helper pattern above exactly.
  addCompany: (localeId, company) => {
    set((state) => {
      const existing = state.locales[localeId];
      if (!existing) return state;
      const updated: Locale = { ...existing, companies: [...(existing.companies || []), company] };
      return { locales: { ...state.locales, [localeId]: updated } };
    });
  },

  updateCompany: (localeId, companyId, updates) => {
    set((state) => {
      const existing = state.locales[localeId];
      if (!existing) return state;
      const nextCompanies = (existing.companies || []).map((c) => (c.id === companyId ? { ...c, ...updates } : c));
      return { locales: { ...state.locales, [localeId]: { ...existing, companies: nextCompanies } } };
    });
  },

  removeCompany: (localeId, companyId) => {
    // Clears companyId on every former member first (they become Freelance), mirroring
    // removeLocale's per-robot-cleanup-before-removal shape — no AudioEngine state to
    // release here, since a company itself owns no audio state, only its member robots do.
    set((state) => {
      const existing = state.locales[localeId];
      if (!existing) return state;
      const nextRobots = (existing.robots || []).map((r) =>
        r.companyId === companyId ? { ...r, companyId: undefined } : r
      );
      const nextCompanies = (existing.companies || []).filter((c) => c.id !== companyId);
      return { locales: { ...state.locales, [localeId]: { ...existing, robots: nextRobots, companies: nextCompanies } } };
    });
  },

  getCompanyById: (localeId, companyId) => get().locales[localeId]?.companies?.find((c) => c.id === companyId),

  getCompanyMembers: (localeId, companyId) =>
    (get().locales[localeId]?.robots || []).filter((r) => r.companyId === companyId),

  assignRobotToCompany: (localeId, robotId, companyId) => {
    // One atomic transition — not composed from separate updateRobot/updateCompany calls at
    // the call site. Updates the robot's own companyId and both the old and new company's
    // robotIds together, the same "one action, one cross-entity transition" shape
    // removeCompany/removeLocale already use for their own cleanup.
    set((state) => {
      const existing = state.locales[localeId];
      if (!existing) return state;
      const robot = existing.robots.find((r) => r.id === robotId);
      if (!robot) return state;
      const oldCompanyId = robot.companyId;

      const nextRobots = existing.robots.map((r) =>
        r.id === robotId ? { ...r, companyId: companyId ?? undefined } : r
      );
      // Two independent `if`s, neither an early `return` — when oldCompanyId === companyId
      // (re-selecting the currently-assigned company), both must run in sequence: remove, then
      // re-add. An early-return version only ever hits the first matching branch and silently
      // drops the robot from its own company's robotIds in that case (see localeStore.test.ts's
      // regression coverage).
      const nextCompanies = existing.companies.map((c) => {
        let robotIds = c.robotIds;
        if (c.id === oldCompanyId) robotIds = robotIds.filter((id) => id !== robotId);
        if (c.id === companyId) robotIds = [...robotIds, robotId];
        return robotIds === c.robotIds ? c : { ...c, robotIds };
      });
      return { locales: { ...state.locales, [localeId]: { ...existing, robots: nextRobots, companies: nextCompanies } } };
    });
  },
}));

export default useLocaleStore;
export { DEFAULT_LOCALE };
export { DEFAULT_LOCALE_ID };
