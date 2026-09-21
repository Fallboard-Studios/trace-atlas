// ========================================
// IMPORTS
// ========================================
import { describe, expect, it } from 'vitest';

import {
  AUDIO_LOAD_PRESETS,
  LOAD_DRIFT_MIN,
  LOAD_FILTER_LFOS_MIN,
  LOAD_PLAYBACK_BELOW,
  MAX_POLYPHONY,
  MAX_ROBOTS,
  ROBOT_LFO_CAP_CEILING,
  ROBOT_LFO_CAP_LIGHT,
  ROBOT_LFO_CAP_STANDARD,
} from '../constants';
import {
  detectDefaultAudioLoad,
  latencyForLoad,
  loadToLimits,
  loadToSearchParam,
  parseLoadParam,
  resolveInitialAudioLoad,
} from './audioBudget';

// ========================================
// HELPERS
// ========================================

/** 0, 0.01, … 1 — the whole dial. */
const dial = Array.from({ length: 101 }, (_, i) => i / 100);

// ========================================
// loadToLimits
// ========================================

describe('loadToLimits', () => {
  it('at Full (1) equals today’s behavior exactly: 12 robots, 16 notes, drift and filter LFOs on, unlimited robot LFOs, interactive', () => {
    // Literal numbers as well as the constants, so a constant that drifts away from today is caught here.
    expect(loadToLimits(1)).toEqual({
      maxAudibleRobots: 12,
      maxPolyphony: 16,
      driftEnabled: true,
      filterLfosEnabled: true,
      maxRobotLfos: Infinity,
      latencyHint: 'interactive',
    });
    expect(MAX_ROBOTS).toBe(12);
    expect(MAX_POLYPHONY).toBe(16);
  });

  it('at Light (0.2) is 4 robots, 8 notes, no drift, no filter LFOs, Light’s robot-LFO cap, playback latency', () => {
    expect(loadToLimits(AUDIO_LOAD_PRESETS.light)).toEqual({
      maxAudibleRobots: 4,
      maxPolyphony: 8,
      driftEnabled: false,
      filterLfosEnabled: false,
      maxRobotLfos: ROBOT_LFO_CAP_LIGHT,
      latencyHint: 'playback',
    });
  });

  it('at Standard (0.6) is 8 robots, 12 notes, no drift, filter LFOs on, Standard’s robot-LFO cap, interactive latency (decision J)', () => {
    expect(loadToLimits(AUDIO_LOAD_PRESETS.standard)).toEqual({
      maxAudibleRobots: 8,
      maxPolyphony: 12,
      driftEnabled: false,
      filterLfosEnabled: true,
      maxRobotLfos: ROBOT_LFO_CAP_STANDARD,
      latencyHint: 'interactive',
    });
  });

  it('at the bottom of the dial (0) is the floor: 2 robots, 6 notes, everything suspended', () => {
    expect(loadToLimits(0)).toEqual({
      maxAudibleRobots: 2,
      maxPolyphony: 6,
      driftEnabled: false,
      filterLfosEnabled: false,
      maxRobotLfos: ROBOT_LFO_CAP_LIGHT,
      latencyHint: 'playback',
    });
  });

  it('has the preset anchors it documents: Light 0.2, Standard 0.6, Full 1, robot-LFO caps 4 / 12', () => {
    expect(AUDIO_LOAD_PRESETS).toEqual({ light: 0.2, standard: 0.6, full: 1 });
    expect(ROBOT_LFO_CAP_LIGHT).toBe(4);
    expect(ROBOT_LFO_CAP_STANDARD).toBe(12);
  });

  describe('counts interpolate linearly', () => {
    it('robots = round(2 + 10·t) and polyphony = round(6 + 10·t)', () => {
      for (const t of [0.05, 0.15, 0.33, 0.5, 0.75, 0.9, 0.99]) {
        const limits = loadToLimits(t);
        expect(limits.maxAudibleRobots).toBe(Math.round(2 + 10 * t));
        expect(limits.maxPolyphony).toBe(Math.round(6 + 10 * t));
      }
    });

    it('never decrease as the dial rises, and stay inside their floor and ceiling', () => {
      let previous = loadToLimits(0);
      for (const t of dial) {
        const limits = loadToLimits(t);
        expect(limits.maxAudibleRobots).toBeGreaterThanOrEqual(previous.maxAudibleRobots);
        expect(limits.maxPolyphony).toBeGreaterThanOrEqual(previous.maxPolyphony);
        expect(limits.maxRobotLfos).toBeGreaterThanOrEqual(previous.maxRobotLfos);
        expect(limits.maxAudibleRobots).toBeGreaterThanOrEqual(2);
        expect(limits.maxAudibleRobots).toBeLessThanOrEqual(MAX_ROBOTS);
        expect(limits.maxPolyphony).toBeGreaterThanOrEqual(6);
        expect(limits.maxPolyphony).toBeLessThanOrEqual(MAX_POLYPHONY);
        previous = limits;
      }
    });

    it('are whole numbers everywhere except an unlimited robot-LFO cap', () => {
      for (const t of dial) {
        const limits = loadToLimits(t);
        expect(Number.isInteger(limits.maxAudibleRobots)).toBe(true);
        expect(Number.isInteger(limits.maxPolyphony)).toBe(true);
        if (limits.maxRobotLfos !== Infinity) expect(Number.isInteger(limits.maxRobotLfos)).toBe(true);
      }
    });
  });

  describe('robot-LFO cap', () => {
    it('holds Light’s cap below Light, interpolates 4 → 12 up to Standard, then grows towards a finite ceiling', () => {
      expect(loadToLimits(0.1).maxRobotLfos).toBe(ROBOT_LFO_CAP_LIGHT);
      expect(loadToLimits(0.4).maxRobotLfos).toBe((ROBOT_LFO_CAP_LIGHT + ROBOT_LFO_CAP_STANDARD) / 2);
      expect(loadToLimits(0.8).maxRobotLfos).toBeGreaterThan(ROBOT_LFO_CAP_STANDARD);
      expect(loadToLimits(0.99).maxRobotLfos).toBeGreaterThan(loadToLimits(0.8).maxRobotLfos);
      expect(loadToLimits(0.99).maxRobotLfos).toBeLessThanOrEqual(ROBOT_LFO_CAP_CEILING);
      expect(Number.isFinite(loadToLimits(0.99).maxRobotLfos)).toBe(true);
    });

    it('is unlimited (Infinity) only at exactly Full, so anything short of Full is still bounded', () => {
      expect(loadToLimits(1).maxRobotLfos).toBe(Infinity);
      expect(Number.isFinite(loadToLimits(0.999).maxRobotLfos)).toBe(true);
    });

    it('has a finite ceiling of every audio-rate robot LFO that could ever connect (12 robots × 10 targets)', () => {
      expect(ROBOT_LFO_CAP_CEILING).toBe(MAX_ROBOTS * 10);
    });
  });

  describe('thresholds are honored on both sides', () => {
    it('switches filter-frequency/Q LFOs on at exactly LOAD_FILTER_LFOS_MIN (0.4)', () => {
      expect(LOAD_FILTER_LFOS_MIN).toBe(0.4);
      expect(loadToLimits(LOAD_FILTER_LFOS_MIN - 1e-9).filterLfosEnabled).toBe(false);
      expect(loadToLimits(LOAD_FILTER_LFOS_MIN).filterLfosEnabled).toBe(true);
      expect(loadToLimits(LOAD_FILTER_LFOS_MIN + 1e-9).filterLfosEnabled).toBe(true);
    });

    it('switches drift on at exactly LOAD_DRIFT_MIN (0.8)', () => {
      expect(LOAD_DRIFT_MIN).toBe(0.8);
      expect(loadToLimits(LOAD_DRIFT_MIN - 1e-9).driftEnabled).toBe(false);
      expect(loadToLimits(LOAD_DRIFT_MIN).driftEnabled).toBe(true);
      expect(loadToLimits(LOAD_DRIFT_MIN + 1e-9).driftEnabled).toBe(true);
    });

    it('drops the latency hint to playback strictly below LOAD_PLAYBACK_BELOW (0.4)', () => {
      expect(LOAD_PLAYBACK_BELOW).toBe(0.4);
      expect(loadToLimits(LOAD_PLAYBACK_BELOW - 1e-9).latencyHint).toBe('playback');
      expect(loadToLimits(LOAD_PLAYBACK_BELOW).latencyHint).toBe('interactive');
    });

    it('turns features on in the order drift last: filter LFOs before drift', () => {
      const filterOn = dial.find((t) => loadToLimits(t).filterLfosEnabled)!;
      const driftOn = dial.find((t) => loadToLimits(t).driftEnabled)!;
      expect(filterOn).toBeLessThan(driftOn);
    });
  });

  describe('out-of-range and non-finite input', () => {
    it('clamps below 0 to the floor and above 1 to Full', () => {
      expect(loadToLimits(-3)).toEqual(loadToLimits(0));
      expect(loadToLimits(-Infinity)).toEqual(loadToLimits(0));
      expect(loadToLimits(7)).toEqual(loadToLimits(1));
      expect(loadToLimits(Infinity)).toEqual(loadToLimits(1));
    });

    it('treats NaN as Full (the safe, today’s-behavior default)', () => {
      expect(loadToLimits(NaN)).toEqual(loadToLimits(1));
    });
  });
});

// ========================================
// latencyForLoad
// ========================================

describe('latencyForLoad', () => {
  it('is playback for Light and interactive for Standard and Full', () => {
    expect(latencyForLoad(AUDIO_LOAD_PRESETS.light)).toBe('playback');
    expect(latencyForLoad(AUDIO_LOAD_PRESETS.standard)).toBe('interactive');
    expect(latencyForLoad(AUDIO_LOAD_PRESETS.full)).toBe('interactive');
  });

  it('agrees with loadToLimits across the whole dial, and treats NaN as Full (interactive)', () => {
    for (const t of dial) expect(latencyForLoad(t)).toBe(loadToLimits(t).latencyHint);
    expect(latencyForLoad(NaN)).toBe('interactive');
  });
});

// ========================================
// parseLoadParam / loadToSearchParam
// ========================================

describe('parseLoadParam', () => {
  it('accepts the three preset names, case-insensitively', () => {
    expect(parseLoadParam('light')).toBe(0.2);
    expect(parseLoadParam('Standard')).toBe(0.6);
    expect(parseLoadParam('FULL')).toBe(1);
  });

  it('accepts a percent from 0 to 100 and returns it as a 0–1 dial value', () => {
    expect(parseLoadParam('0')).toBe(0);
    expect(parseLoadParam('45')).toBe(0.45);
    expect(parseLoadParam('100')).toBe(1);
    expect(parseLoadParam('7.5')).toBe(0.075);
  });

  it('ignores surrounding whitespace', () => {
    expect(parseLoadParam('  light ')).toBe(0.2);
    expect(parseLoadParam(' 45 ')).toBe(0.45);
  });

  it('rejects everything else with null', () => {
    for (const bad of ['', ' ', 'abc', 'lite', '-1', '101', '100.1', 'NaN', 'Infinity', '1e2', '45%', '4 5', '.5', '5.', '--5']) {
      expect(parseLoadParam(bad), JSON.stringify(bad)).toBeNull();
    }
    expect(parseLoadParam(null)).toBeNull();
    expect(parseLoadParam(undefined)).toBeNull();
  });
});

describe('loadToSearchParam', () => {
  it('serializes a preset value to its name and any other value to a whole percent', () => {
    expect(loadToSearchParam(0.2)).toBe('light');
    expect(loadToSearchParam(0.6)).toBe('standard');
    expect(loadToSearchParam(1)).toBe('full');
    expect(loadToSearchParam(0.45)).toBe('45');
    expect(loadToSearchParam(0)).toBe('0');
  });

  it('names a value that rounds to a preset’s percent, so a nudged slider still reads as the preset', () => {
    expect(loadToSearchParam(0.2004)).toBe('light');
    expect(loadToSearchParam(0.5996)).toBe('standard');
  });

  it('round-trips every whole percent through parseLoadParam exactly', () => {
    for (let percent = 0; percent <= 100; percent++) {
      const load = percent / 100;
      expect(parseLoadParam(loadToSearchParam(load)), `${percent}%`).toBe(load);
    }
  });

  it('clamps out-of-range input and treats NaN as Full', () => {
    expect(loadToSearchParam(-1)).toBe('0');
    expect(loadToSearchParam(5)).toBe('full');
    expect(loadToSearchParam(NaN)).toBe('full');
  });
});

// ========================================
// detection and the boot-time resolver
// ========================================

describe('detectDefaultAudioLoad', () => {
  it('is Light on a coarse-pointer (phone-like) device and Full otherwise (decision D)', () => {
    expect(detectDefaultAudioLoad({ coarsePointer: true })).toBe(AUDIO_LOAD_PRESETS.light);
    expect(detectDefaultAudioLoad({ coarsePointer: false })).toBe(AUDIO_LOAD_PRESETS.full);
  });
});

describe('resolveInitialAudioLoad', () => {
  const desktop = { coarsePointer: false };
  const phone = { coarsePointer: true };

  it('uses detection when there is no ?load=', () => {
    expect(resolveInitialAudioLoad({ search: '', ...desktop })).toBe(1);
    expect(resolveInitialAudioLoad({ search: '', ...phone })).toBe(0.2);
    expect(resolveInitialAudioLoad({ search: '?debug&seed=bravo', ...phone })).toBe(0.2);
  });

  it('lets a valid ?load= beat detection, in either direction', () => {
    expect(resolveInitialAudioLoad({ search: '?load=full', ...phone })).toBe(1);
    expect(resolveInitialAudioLoad({ search: '?load=light', ...desktop })).toBe(0.2);
    expect(resolveInitialAudioLoad({ search: '?load=45', ...desktop })).toBe(0.45);
    expect(resolveInitialAudioLoad({ search: '?load=0', ...phone })).toBe(0);
  });

  it('falls back to detection for an invalid or empty ?load=', () => {
    expect(resolveInitialAudioLoad({ search: '?load=bogus', ...phone })).toBe(0.2);
    expect(resolveInitialAudioLoad({ search: '?load=bogus', ...desktop })).toBe(1);
    expect(resolveInitialAudioLoad({ search: '?load=', ...phone })).toBe(0.2);
    expect(resolveInitialAudioLoad({ search: '?load=150', ...desktop })).toBe(1);
  });

  it('finds ?load= among other params, with or without the leading ?', () => {
    expect(resolveInitialAudioLoad({ search: '?debug&load=standard&seed=x', ...desktop })).toBe(0.6);
    expect(resolveInitialAudioLoad({ search: 'load=standard', ...desktop })).toBe(0.6);
  });

  it('uses the first ?load= if it is repeated', () => {
    expect(resolveInitialAudioLoad({ search: '?load=light&load=full', ...desktop })).toBe(0.2);
  });
});
