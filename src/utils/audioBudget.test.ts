// ========================================
// IMPORTS
// ========================================
import { afterEach, describe, expect, it, vi } from 'vitest';

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
import { GLOBAL_LFO_TARGET_IDS, ROBOT_LFO_TARGET_IDS } from '../types/lfo';
import {
  clampAudioLoad,
  describeLimits,
  detectCoarsePointer,
  detectDefaultAudioLoad,
  lfoAllowed,
  latencyForLoad,
  loadToLimits,
  loadToSearchParam,
  orderByArrival,
  parseLoadParam,
  presetForLoad,
  reconcileSounding,
  resolveInitialAudioLoad,
  withLoadParam,
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
// clampAudioLoad
// ========================================

describe('clampAudioLoad', () => {
  it('leaves a value already on the dial alone', () => {
    for (const t of dial) expect(clampAudioLoad(t)).toBe(t);
  });

  it('clamps to [0, 1], including infinities', () => {
    expect(clampAudioLoad(-0.5)).toBe(0);
    expect(clampAudioLoad(-Infinity)).toBe(0);
    expect(clampAudioLoad(1.5)).toBe(1);
    expect(clampAudioLoad(Infinity)).toBe(1);
  });

  it('treats NaN as Full, matching loadToLimits', () => {
    expect(clampAudioLoad(NaN)).toBe(1);
  });
});

// ========================================
// withLoadParam
// ========================================

describe('withLoadParam', () => {
  it('adds ?load= to an empty query', () => {
    expect(withLoadParam('', 'light')).toBe('?load=light');
  });

  it('appends after the other params and leaves them byte-for-byte alone (a bare ?debug stays bare)', () => {
    expect(withLoadParam('?debug&seed=bravo&x=-150&y=90', 'light')).toBe('?debug&seed=bravo&x=-150&y=90&load=light');
    expect(withLoadParam('?seed=a%20b&latency=playback', '45')).toBe('?seed=a%20b&latency=playback&load=45');
  });

  it('replaces an existing load in place, keeping its position', () => {
    expect(withLoadParam('?load=full&debug', 'light')).toBe('?load=light&debug');
    expect(withLoadParam('?debug&load=full&seed=x', 'standard')).toBe('?debug&load=standard&seed=x');
  });

  it('collapses a repeated load to one', () => {
    expect(withLoadParam('?load=a&x=1&load=b', 'light')).toBe('?load=light&x=1');
  });

  it('removes load when given null, and the whole query when nothing else is left', () => {
    expect(withLoadParam('?debug&load=light', null)).toBe('?debug');
    expect(withLoadParam('?load=light', null)).toBe('');
    expect(withLoadParam('', null)).toBe('');
    expect(withLoadParam('?debug', null)).toBe('?debug');
  });

  it('accepts a query without the leading ?', () => {
    expect(withLoadParam('debug&load=full', 'light')).toBe('?debug&load=light');
  });

  it('does not touch a param that merely starts with "load" or another key ending in load', () => {
    expect(withLoadParam('?loader=1&preload=2', 'light')).toBe('?loader=1&preload=2&load=light');
    expect(withLoadParam('?loader=1&load=full', null)).toBe('?loader=1');
  });

  it('round-trips through resolveInitialAudioLoad for every whole percent', () => {
    for (let percent = 0; percent <= 100; percent++) {
      const load = percent / 100;
      const search = withLoadParam('?debug', loadToSearchParam(load));
      expect(resolveInitialAudioLoad({ search, coarsePointer: false }), `${percent}%`).toBe(load);
    }
  });
});

// ========================================
// detectCoarsePointer
// ========================================

describe('detectCoarsePointer', () => {
  const original = window.matchMedia;
  afterEach(() => {
    window.matchMedia = original;
  });

  it('reads (pointer: coarse)', () => {
    window.matchMedia = vi.fn((q: string) => ({ matches: q === '(pointer: coarse)' })) as unknown as typeof window.matchMedia;
    expect(detectCoarsePointer()).toBe(true);
    window.matchMedia = vi.fn(() => ({ matches: false })) as unknown as typeof window.matchMedia;
    expect(detectCoarsePointer()).toBe(false);
  });

  it('is false, without throwing, when matchMedia is missing or throws', () => {
    // @ts-expect-error — simulating an environment without matchMedia
    window.matchMedia = undefined;
    expect(detectCoarsePointer()).toBe(false);
    window.matchMedia = (() => {
      throw new Error('boom');
    }) as unknown as typeof window.matchMedia;
    expect(detectCoarsePointer()).toBe(false);
  });
});

// ========================================
// presetForLoad
// ========================================

describe('presetForLoad', () => {
  it('names the preset a dial position sits on', () => {
    expect(presetForLoad(0.2)).toBe('light');
    expect(presetForLoad(0.6)).toBe('standard');
    expect(presetForLoad(1)).toBe('full');
  });

  it('is null between presets, so a slider dragged off a preset leaves the radio with nothing selected', () => {
    for (const t of [0, 0.19, 0.21, 0.45, 0.59, 0.61, 0.99]) expect(presetForLoad(t), String(t)).toBeNull();
  });

  it('agrees with loadToSearchParam about which positions are presets (same whole-percent rounding)', () => {
    for (const t of dial) {
      const named = ['light', 'standard', 'full'].includes(loadToSearchParam(t));
      expect(presetForLoad(t) !== null, String(t)).toBe(named);
    }
    expect(presetForLoad(0.2004)).toBe('light');
  });

  it('treats out-of-range values by clamping and NaN as Full', () => {
    expect(presetForLoad(7)).toBe('full');
    expect(presetForLoad(NaN)).toBe('full');
    expect(presetForLoad(-1)).toBeNull();
  });
});

// ========================================
// describeLimits
// ========================================

describe('describeLimits', () => {
  it('at Light reads what is capped, what is off, and that latency changes on the next load', () => {
    expect(describeLimits(loadToLimits(AUDIO_LOAD_PRESETS.light))).toBe(
      'Up to 4 robots · 8 notes · no drift or filter LFOs · 4 robot LFOs · latency: Playback (applies on next load)',
    );
  });

  it('at Standard drops the filter-LFO and latency clauses (only drift is off, latency is unchanged)', () => {
    expect(describeLimits(loadToLimits(AUDIO_LOAD_PRESETS.standard))).toBe(
      'Up to 8 robots · 12 notes · no drift · 12 robot LFOs',
    );
  });

  it('at Full says everything is on and never mentions a robot-LFO limit or latency', () => {
    expect(describeLimits(loadToLimits(AUDIO_LOAD_PRESETS.full))).toBe('Up to 12 robots · 16 notes · all LFOs and drift');
  });

  it('mentions the load-time latency caveat only when the hint differs from interactive', () => {
    for (const t of dial) {
      const limits = loadToLimits(t);
      const text = describeLimits(limits);
      expect(text.includes('latency:'), `${t}`).toBe(limits.latencyHint !== 'interactive');
      expect(text.includes('applies on next load'), `${t}`).toBe(limits.latencyHint !== 'interactive');
    }
  });

  it('names each LFO tier correctly on both sides of the thresholds', () => {
    expect(describeLimits(loadToLimits(LOAD_FILTER_LFOS_MIN - 0.01))).toContain('no drift or filter LFOs');
    expect(describeLimits(loadToLimits(LOAD_FILTER_LFOS_MIN))).toMatch(/no drift(?! or)/);
    expect(describeLimits(loadToLimits(LOAD_DRIFT_MIN - 0.01))).toContain('no drift');
    expect(describeLimits(loadToLimits(LOAD_DRIFT_MIN))).toContain('all LFOs and drift');
  });

  it('shows the robot-LFO limit only while it is tight (at most Standard’s), never Infinity', () => {
    expect(describeLimits(loadToLimits(0.4))).toContain('8 robot LFOs');
    expect(describeLimits(loadToLimits(0.8))).not.toMatch(/robot LFOs/);
    expect(describeLimits(loadToLimits(0.99))).not.toMatch(/robot LFOs/);
  });

  it('is well-formed across the whole dial: starts "Up to n robots", never Infinity, NaN or undefined', () => {
    for (const t of dial) {
      const text = describeLimits(loadToLimits(t));
      expect(text, `${t}`).toMatch(/^Up to \d+ robots · \d+ notes · /);
      expect(text, `${t}`).not.toMatch(/Infinity|NaN|undefined|null/);
    }
  });

  it('uses the right counts for the limits it is given', () => {
    const text = describeLimits({ ...loadToLimits(1), maxAudibleRobots: 7, maxPolyphony: 11 });
    expect(text).toContain('Up to 7 robots');
    expect(text).toContain('11 notes');
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

// ========================================
// orderByArrival
// ========================================

describe('orderByArrival', () => {
  it('keeps still-eligible robots in the order they arrived and appends newly eligible ones in roster order', () => {
    expect(orderByArrival(['c', 'a'], ['a', 'b', 'c', 'd'])).toEqual(['c', 'a', 'b', 'd']);
  });

  it('drops robots that are no longer eligible', () => {
    expect(orderByArrival(['a', 'b', 'c'], ['a', 'c'])).toEqual(['a', 'c']);
  });

  it('re-queues a robot that left and came back at the back of the line', () => {
    const afterLeaving = orderByArrival(['a', 'b', 'c'], ['b', 'c']);
    expect(orderByArrival(afterLeaving, ['a', 'b', 'c'])).toEqual(['b', 'c', 'a']);
  });

  it('returns the same array when nothing changed, so callers can skip work', () => {
    const previous = ['b', 'a'];
    expect(orderByArrival(previous, ['a', 'b'])).toBe(previous);
  });

  it('handles empty inputs and repeated ids in the eligible list', () => {
    expect(orderByArrival([], [])).toEqual([]);
    expect(orderByArrival([], ['a', 'b'])).toEqual(['a', 'b']);
    expect(orderByArrival(['a'], [])).toEqual([]);
    expect(orderByArrival([], ['a', 'a', 'b'])).toEqual(['a', 'b']);
  });
});

// ========================================
// reconcileSounding
// ========================================

describe('reconcileSounding', () => {
  // `eligible` is in ARRIVAL order (see orderByArrival) — that order is what makes admission first-come-first-served.
  const none: string[] = [];

  describe('first come, first served', () => {
    it('admits eligible robots in order up to the cap and leaves the rest waiting', () => {
      expect(reconcileSounding(none, ['a', 'b', 'c', 'd', 'e'], none, 3)).toEqual(['a', 'b', 'c']);
    });

    it('admits everyone when the cap is not reached', () => {
      expect(reconcileSounding(none, ['a', 'b'], none, 4)).toEqual(['a', 'b']);
    });

    it('lets incumbents keep their slot even when earlier-arrived robots are waiting', () => {
      // c is sounding; a and b arrived (waited) earlier in the list but c holds a slot.
      expect(reconcileSounding(['c'], ['a', 'b', 'c', 'd'], none, 2)).toEqual(['c', 'a']);
    });

    it('gives a freed slot to the earliest waiter, not to roster (alphabetical) order', () => {
      // a, b sounding at cap 2; q then p arrived and wait. a leaves — q (earliest waiter) gets the slot, not p.
      const afterDeparture = reconcileSounding(['a', 'b'], ['b', 'q', 'p'], none, 2);
      expect(afterDeparture).toEqual(['b', 'q']);
    });

    it('does not let an explicit unmute jump the queue: a robot that just became eligible waits behind earlier waiters', () => {
      const arrival = orderByArrival(['a', 'b', 'c'], ['a', 'b', 'c', 'z']); // z just un-docked
      expect(reconcileSounding(['a', 'b'], arrival, none, 2)).toEqual(['a', 'b']);
    });

    it('drops robots that are no longer eligible and hands their slots to waiters', () => {
      expect(reconcileSounding(['a', 'b', 'c'], ['a', 'c', 'd', 'e'], none, 3)).toEqual(['a', 'c', 'd']);
    });

    it('drops everyone when nobody is eligible', () => {
      expect(reconcileSounding(['a', 'b'], none, none, 4)).toEqual([]);
    });
  });

  describe('changing the cap', () => {
    it('evicts last-in, first-out when the cap is lowered', () => {
      expect(reconcileSounding(['a', 'b', 'c', 'd'], ['a', 'b', 'c', 'd'], none, 2)).toEqual(['a', 'b']);
    });

    it('admits waiters, in order, when the cap is raised', () => {
      expect(reconcileSounding(['a', 'b'], ['a', 'b', 'c', 'd', 'e'], none, 4)).toEqual(['a', 'b', 'c', 'd']);
    });

    it('a cap of 0 silences everyone', () => {
      expect(reconcileSounding(['a', 'b'], ['a', 'b', 'c'], none, 0)).toEqual([]);
    });

    it('treats a fractional cap as its floor and a NaN cap as no cap', () => {
      expect(reconcileSounding(none, ['a', 'b', 'c'], none, 2.9)).toEqual(['a', 'b']);
      expect(reconcileSounding(none, ['a', 'b', 'c'], none, NaN)).toEqual(['a', 'b', 'c']);
      expect(reconcileSounding(none, ['a', 'b', 'c'], none, Infinity)).toEqual(['a', 'b', 'c']);
    });
  });

  describe('solo always sounds', () => {
    it('admits a soloed robot immediately and evicts the newest non-solo robot when full', () => {
      expect(reconcileSounding(['a', 'b', 'c', 'd'], ['a', 'b', 'c', 'd', 's'], ['s'], 4)).toEqual(['a', 'b', 'c', 's']);
    });

    it('admits a solo into a free slot without evicting anyone', () => {
      expect(reconcileSounding(['a'], ['a', 's'], ['s'], 4)).toEqual(['a', 's']);
    });

    it('never lets a later solo evict an earlier solo', () => {
      // s1 and s2 are soloed; the newest NON-solo (b) goes, not s2.
      expect(reconcileSounding(['s1', 'a', 's2', 'b'], ['s1', 'a', 's2', 'b', 's3'], ['s1', 's2', 's3'], 4))
        .toEqual(['s1', 'a', 's2', 's3']);
    });

    it('makes a later solo wait when every slot already holds a solo (first-come among solos)', () => {
      expect(reconcileSounding(['s1', 's2'], ['s1', 's2', 's3'], ['s1', 's2', 's3'], 2)).toEqual(['s1', 's2']);
    });

    it('caps more solos than slots at the limit, first-come', () => {
      expect(reconcileSounding(none, ['s1', 's2', 's3', 's4', 's5'], ['s1', 's2', 's3', 's4', 's5'], 3))
        .toEqual(['s1', 's2', 's3']);
    });

    it('never lets a later non-solo arrival evict a solo', () => {
      expect(reconcileSounding(['s'], ['s', 'a'], ['s'], 1)).toEqual(['s']);
    });

    it('when the cap is lowered, evicts non-solo robots newest-first before touching any solo', () => {
      expect(reconcileSounding(['a', 's', 'b', 'c'], ['a', 's', 'b', 'c'], ['s'], 2)).toEqual(['a', 's']);
      expect(reconcileSounding(['a', 's'], ['a', 's'], ['s'], 1)).toEqual(['s']);
    });

    it('when only solos remain and the cap is still lower, evicts the newest solo', () => {
      expect(reconcileSounding(['s1', 's2', 's3'], ['s1', 's2', 's3'], ['s1', 's2', 's3'], 2)).toEqual(['s1', 's2']);
    });

    it('ignores a soloId that is not eligible', () => {
      expect(reconcileSounding(none, ['a'], ['ghost'], 2)).toEqual(['a']);
    });
  });

  describe('reference stability and purity', () => {
    it('returns the very same array when nothing changed (so the caller can skip the store write)', () => {
      const previous = ['a', 'b'];
      expect(reconcileSounding(previous, ['a', 'b', 'c'], none, 2)).toBe(previous); // full, c still waiting
      expect(reconcileSounding(previous, ['a', 'b'], none, 5)).toBe(previous); // room to spare, nobody waiting
    });

    it('returns the same empty array reference for empty-to-empty', () => {
      const previous: string[] = [];
      expect(reconcileSounding(previous, none, none, 3)).toBe(previous);
      expect(reconcileSounding(previous, ['a'], none, 0)).toBe(previous);
    });

    it('returns a new array (not the previous one) when the set changed, and never mutates its inputs', () => {
      const previous = ['a', 'b'];
      const eligible = ['a', 'b', 'c'];
      const solo: string[] = [];
      const result = reconcileSounding(previous, eligible, solo, 3);
      expect(result).not.toBe(previous);
      expect(result).toEqual(['a', 'b', 'c']);
      expect(previous).toEqual(['a', 'b']);
      expect(eligible).toEqual(['a', 'b', 'c']);
    });

    it('never puts an id in twice, even if the eligible list repeats it', () => {
      expect(reconcileSounding(none, ['a', 'a', 'b', 'b'], none, 4)).toEqual(['a', 'b']);
      expect(reconcileSounding(['a'], ['a', 'a'], ['a', 'a'], 4)).toEqual(['a']);
    });
  });

  describe('invariants over random sequences (property check)', () => {
    /** Small deterministic PRNG so a failure is reproducible. */
    const makeRandom = (seed: number) => () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l'];

    it('holds for every step of many random eligibility / solo / cap changes', () => {
      for (let seed = 1; seed <= 60; seed++) {
        const random = makeRandom(seed);
        let sounding: readonly string[] = [];
        let arrival: readonly string[] = [];
        for (let step = 0; step < 80; step++) {
          const eligibleNow = ids.filter(() => random() < 0.55);
          const soloIds = eligibleNow.filter(() => random() < 0.12);
          const cap = Math.floor(random() * 14);
          arrival = orderByArrival(arrival, eligibleNow);

          const next = reconcileSounding(sounding, arrival, soloIds, cap);
          const label = `seed ${seed} step ${step} cap ${cap}`;

          // Never exceeds the cap, only sounds eligible robots, no duplicates.
          expect(next.length, label).toBeLessThanOrEqual(cap);
          expect(next.every((id) => eligibleNow.includes(id)), label).toBe(true);
          expect(new Set(next).size, label).toBe(next.length);

          // Work-conserving: an empty slot never coexists with a waiting robot.
          if (next.length < cap) expect(next.length, label).toBe(eligibleNow.length);

          // Solo priority: a waiting solo implies no non-solo holds a slot (a non-solo would have been evicted).
          const waitingSolo = soloIds.some((id) => !next.includes(id));
          if (waitingSolo && cap > 0) expect(next.every((id) => soloIds.includes(id)), label).toBe(true);

          // Incumbents that survive keep their relative order.
          const survivors = sounding.filter((id) => next.includes(id));
          expect(next.filter((id) => survivors.includes(id)), label).toEqual(survivors);

          // A fixed point: feeding the result back in with the same inputs changes nothing.
          expect(reconcileSounding(next, arrival, soloIds, cap), label).toBe(next);

          sounding = next;
        }
      }
    });
  });
});

// ========================================
// lfoAllowed
// ========================================

describe('lfoAllowed', () => {
  const light = loadToLimits(AUDIO_LOAD_PRESETS.light);
  const standard = loadToLimits(AUDIO_LOAD_PRESETS.standard);
  const full = loadToLimits(AUDIO_LOAD_PRESETS.full);

  describe('global targets', () => {
    it('always allows the nearly-free EQ-gain LFOs, even on Light', () => {
      for (const target of ['eq3.low', 'eq3.mid', 'eq3.high'] as const) {
        expect(lfoAllowed(target, 'global', light, 0), target).toBe(true);
      }
    });

    it('allows filter-frequency and Q LFOs only when the dial enables filter LFOs', () => {
      for (const target of ['lpf.frequency', 'lpf.Q', 'hpf.frequency', 'hpf.Q'] as const) {
        expect(lfoAllowed(target, 'global', light, 0), `${target} on Light`).toBe(false);
        expect(lfoAllowed(target, 'global', standard, 0), `${target} on Standard`).toBe(true);
        expect(lfoAllowed(target, 'global', full, 0), `${target} on Full`).toBe(true);
      }
    });

    it('classifies every global target, and only the four filter ones are suspended on Light', () => {
      const blocked = GLOBAL_LFO_TARGET_IDS.filter((t) => !lfoAllowed(t, 'global', light, 0));
      expect(blocked).toEqual(['lpf.frequency', 'lpf.Q', 'hpf.frequency', 'hpf.Q']);
    });

    it('is not affected by how many robot LFOs are connected', () => {
      expect(lfoAllowed('lpf.Q', 'global', standard, 999)).toBe(true);
      expect(lfoAllowed('eq3.low', 'global', light, 999)).toBe(true);
    });
  });

  describe('robot targets', () => {
    const audioRateTargets = ROBOT_LFO_TARGET_IDS.filter((t) => !t.endsWith('.phase'));

    it('allows a connection only while fewer than maxRobotLfos are connected', () => {
      for (const target of audioRateTargets) {
        expect(lfoAllowed(target, 'robot', light, 0), `${target} at 0`).toBe(true);
        expect(lfoAllowed(target, 'robot', light, light.maxRobotLfos - 1), `${target} just under`).toBe(true);
        expect(lfoAllowed(target, 'robot', light, light.maxRobotLfos), `${target} at the cap`).toBe(false);
        expect(lfoAllowed(target, 'robot', light, light.maxRobotLfos + 5), `${target} over the cap`).toBe(false);
      }
    });

    it('uses each tier’s own cap: Light 4, Standard 12', () => {
      expect(lfoAllowed('volume', 'robot', light, ROBOT_LFO_CAP_LIGHT - 1)).toBe(true);
      expect(lfoAllowed('volume', 'robot', light, ROBOT_LFO_CAP_LIGHT)).toBe(false);
      expect(lfoAllowed('volume', 'robot', standard, ROBOT_LFO_CAP_STANDARD - 1)).toBe(true);
      expect(lfoAllowed('volume', 'robot', standard, ROBOT_LFO_CAP_STANDARD)).toBe(false);
    });

    it('never refuses at Full (unlimited), however many are connected', () => {
      expect(lfoAllowed('layer0.gain', 'robot', full, 0)).toBe(true);
      expect(lfoAllowed('layer0.gain', 'robot', full, 10_000)).toBe(true);
    });

    it('never counts or refuses layerN.phase LFOs — they poll at control rate, not audio rate', () => {
      for (const target of ['layer0.phase', 'layer1.phase', 'layer2.phase'] as const) {
        expect(lfoAllowed(target, 'robot', light, 0), target).toBe(true);
        expect(lfoAllowed(target, 'robot', light, 999), `${target} over any cap`).toBe(true);
      }
    });

    it('a cap of zero refuses every audio-rate robot LFO but still allows phase LFOs', () => {
      const zero = { ...light, maxRobotLfos: 0 };
      expect(lfoAllowed('volume', 'robot', zero, 0)).toBe(false);
      expect(lfoAllowed('layer1.phase', 'robot', zero, 0)).toBe(true);
    });

    it('is not affected by the filter-LFO switch', () => {
      expect(lfoAllowed('volume', 'robot', { ...standard, filterLfosEnabled: false }, 0)).toBe(true);
    });
  });
});
