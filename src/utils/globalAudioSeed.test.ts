// ========================================
// IMPORTS
// ========================================
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, afterEach } from 'vitest';

import {
  generateGlobalAudioSettings,
  generateGlobalLfoSettings,
  generatePingVarianceAutomation,
  generateSwellFrequency,
  generateSwellDuration,
  scaleUnitValue,
  LFO_RATE_LOADING_MIN,
  LFO_RATE_LOADING_MAX,
  LFO_DEPTH_LOADING_MIN,
  LFO_DEPTH_LOADING_MAX,
} from './globalAudioSeed';
import { evictAttenuationStyleNoiseMap } from './noiseMaps';
import { GLOBAL_AUDIO_LOADING_RANGES } from '@/data/globalAudioLoadingRanges';
import { type GlobalAudioSeedFieldKey } from '@/data/globalAudioSeedRanges';
import { GLOBAL_LFO_TARGET_IDS, LFO_SHAPES, LFO_RATE_MIN, LFO_RATE_MAX, LFO_DEPTH_MIN, LFO_DEPTH_MAX, DRIFT_GROUP_IDS } from '@/types/lfo';
import { GLOBAL_AUDIO_SEED_RANGES } from '@/data/globalAudioSeedRanges';
import { SWELL_FREQUENCY_STEPS } from '@/data/audioRigConfig';

// ========================================
// TESTS
// ========================================

describe('scaleUnitValue', () => {
  it('maps t=0 to min and t=1 to max, for both scales', () => {
    expect(scaleUnitValue(0, { min: 20, max: 20000, scale: 'log' })).toBe(20);
    expect(scaleUnitValue(1, { min: 20, max: 20000, scale: 'log' })).toBe(20000);
    expect(scaleUnitValue(0, { min: -60, max: 0, scale: 'linear' })).toBe(-60);
    expect(scaleUnitValue(1, { min: -60, max: 0, scale: 'linear' })).toBe(0);
  });

  it('interpolates linear fields arithmetically at t=0.5', () => {
    expect(scaleUnitValue(0.5, { min: -12, max: 12, scale: 'linear' })).toBe(0);
  });

  it('interpolates log fields geometrically at t=0.5, not arithmetically', () => {
    // Geometric mean of 20 and 20000 is sqrt(20 * 20000) ≈ 632.46 — nowhere
    // near the linear midpoint of 10010. This is the concrete proof that log
    // fields are NOT sampled the same way as linear ones.
    const result = scaleUnitValue(0.5, { min: 20, max: 20000, scale: 'log' });
    expect(result).toBeCloseTo(Math.sqrt(20 * 20000), 5);
    expect(result).toBeLessThan(1000); // far below the linear midpoint (10010)
  });

  it('clamps out-of-range t instead of extrapolating', () => {
    expect(scaleUnitValue(-0.5, { min: 0, max: 1, scale: 'linear' })).toBe(0);
    expect(scaleUnitValue(1.5, { min: 0, max: 1, scale: 'linear' })).toBe(1);
  });
});

describe('generateGlobalAudioSettings', () => {
  afterEach(() => {
    evictAttenuationStyleNoiseMap('seed-test-planet');
    evictAttenuationStyleNoiseMap('seed-test-planet-b');
  });

  it('returns a fully-populated GlobalAudioSettings', () => {
    const settings = generateGlobalAudioSettings('seed-test-planet', 'Nova');
    expect(settings.compressor).toBeDefined();
    expect(settings.eq3).toBeDefined();
    expect(settings.filterLPF).toBeDefined();
    expect(settings.filterHPF).toBeDefined();
    expect(settings.delay).toBeDefined();
    expect(settings.reverb).toBeDefined();
    expect(settings.limiter).toBeDefined();
  });

  it('returns no chorus field and no reverb.dampening field', () => {
    const settings = generateGlobalAudioSettings('seed-test-planet', 'Nova');
    expect('chorus' in settings).toBe(false);
    expect('dampening' in settings.reverb).toBe(false);
  });

  it('fixes filterLPF/filterHPF type to their identity, not seeded', () => {
    const settings = generateGlobalAudioSettings('seed-test-planet', 'Nova');
    expect(settings.filterLPF.type).toBe('lowpass');
    expect(settings.filterHPF.type).toBe('highpass');
  });

  it('is deterministic — same attenuationStyleId + attenuationStyleName always produces the same settings', () => {
    const first = generateGlobalAudioSettings('seed-test-planet', 'Nova');
    const second = generateGlobalAudioSettings('seed-test-planet', 'Nova');
    expect(second).toEqual(first);
  });

  it('is deterministic across a fresh noise map too, not just a cached one', () => {
    const first = generateGlobalAudioSettings('seed-test-planet', 'Nova');
    evictAttenuationStyleNoiseMap('seed-test-planet');
    const second = generateGlobalAudioSettings('seed-test-planet', 'Nova');
    expect(second).toEqual(first);
  });

  it('produces different values for a different Attenuation Style name (non-degenerate)', () => {
    const a = generateGlobalAudioSettings('seed-test-planet', 'Nova');
    const b = generateGlobalAudioSettings('seed-test-planet-b', 'Zenith');
    expect(b).not.toEqual(a);
  });

  it('keeps every sampled field within its narrower LOADING range, not just the wider full range', () => {
    const settings = generateGlobalAudioSettings('seed-test-planet', 'Nova');
    const valueByKey: Record<GlobalAudioSeedFieldKey, number> = {
      'compressor.threshold': settings.compressor.threshold,
      'compressor.ratio': settings.compressor.ratio,
      'compressor.attack': settings.compressor.attack,
      'compressor.release': settings.compressor.release,
      'compressor.knee': settings.compressor.knee,
      'eq3.low': settings.eq3.low,
      'eq3.mid': settings.eq3.mid,
      'eq3.high': settings.eq3.high,
      'filterLPF.frequency': settings.filterLPF.frequency,
      'filterLPF.Q': settings.filterLPF.Q,
      'filterHPF.frequency': settings.filterHPF.frequency,
      'filterHPF.Q': settings.filterHPF.Q,
      'delay.delayTime': settings.delay.delayTime,
      'delay.feedback': settings.delay.feedback,
      'delay.wet': settings.delay.wet,
      'reverb.decay': settings.reverb.decay,
      'reverb.preDelay': settings.reverb.preDelay,
      'reverb.wet': settings.reverb.wet,
      'limiter.threshold': settings.limiter.threshold,
      'lfoDrift.globalFx.rateDrift': settings.lfoDrift.globalFx.rateDrift,
      'lfoDrift.globalFx.depthDrift': settings.lfoDrift.globalFx.depthDrift,
      'lfoDrift.robots.rateDrift': settings.lfoDrift.robots.rateDrift,
      'lfoDrift.robots.depthDrift': settings.lfoDrift.robots.depthDrift,
    };
    for (const key of Object.keys(GLOBAL_AUDIO_LOADING_RANGES) as GlobalAudioSeedFieldKey[]) {
      const { min, max } = GLOBAL_AUDIO_LOADING_RANGES[key];
      expect(valueByKey[key], `${key} should be >= ${min}`).toBeGreaterThanOrEqual(min);
      expect(valueByKey[key], `${key} should be <= ${max}`).toBeLessThanOrEqual(max);
    }
  });

  it('no longer carries an enabled field on any effect, or a globalBypass flag — removed, off states are expressed via the params themselves', () => {
    const settings = generateGlobalAudioSettings('seed-test-planet', 'Nova');
    expect('globalBypass' in settings).toBe(false);
    expect('enabled' in settings.compressor).toBe(false);
    expect('enabled' in settings.eq3).toBe(false);
    expect('enabled' in settings.filterLPF).toBe(false);
    expect('enabled' in settings.filterHPF).toBe(false);
    expect('enabled' in settings.reverb).toBe(false);
    expect('enabled' in settings.limiter).toBe(false);
    expect('enabled' in settings.delay).toBe(false);
  });

  it('seeds delay.wet quiet (0) for roughly 1-in-4 Attenuation Styles, not roughly all or none (< 0.25 threshold) — replaces the old separate enabled:false roll', () => {
    const SAMPLE_ATTENUATION_STYLES = 40;
    let quietCount = 0;
    for (let i = 0; i < SAMPLE_ATTENUATION_STYLES; i++) {
      const settings = generateGlobalAudioSettings(`seed-delay-sample-${i}`, `DelaySample${i}`);
      if (settings.delay.wet === 0) quietCount++;
      evictAttenuationStyleNoiseMap(`seed-delay-sample-${i}`);
    }
    const quietRate = quietCount / SAMPLE_ATTENUATION_STYLES;
    // ~25% expected; a wide tolerance band avoids flakiness while still
    // clearly distinguishing this from "always quiet" or "never quiet".
    expect(quietRate).toBeGreaterThan(0.05);
    expect(quietRate).toBeLessThan(0.5);
  });

  it('is deterministic for delay\'s quiet roll too — same attenuationStyleId + attenuationStyleName always agrees', () => {
    const first = generateGlobalAudioSettings('seed-test-planet', 'Nova');
    const second = generateGlobalAudioSettings('seed-test-planet', 'Nova');
    expect(second.delay.wet === 0).toBe(first.delay.wet === 0);
  });

  describe('quantization (SEEDED_SLIDER_VALUE_QUANTIZATION Task 5)', () => {
    afterEach(() => {
      for (let i = 0; i < 20; i++) evictAttenuationStyleNoiseMap(`seed-quantize-sample-${i}`);
    });

    it('quantizes every field with a declared step (eq3.low, delay.delayTime, compressor.ratio) onto its own min + n*step grid, across many seeds', () => {
      const fieldsWithStep: Array<[GlobalAudioSeedFieldKey, string]> = [
        ['eq3.low', 'eq3'],
        ['delay.delayTime', 'delay'],
        ['compressor.ratio', 'compressor'],
      ];
      for (let i = 0; i < 20; i++) {
        const settings = generateGlobalAudioSettings(`seed-quantize-sample-${i}`, `QuantizeSample${i}`);
        for (const [key, block] of fieldsWithStep) {
          const field = key.split('.')[1] as keyof typeof settings.eq3;
          const value = (settings as unknown as Record<string, Record<string, number>>)[block][field];
          const { min, step } = GLOBAL_AUDIO_SEED_RANGES[key];
          const stepsFromMin = (value - min) / (step as number);
          expect(Math.abs(stepsFromMin - Math.round(stepsFromMin)), `${key} attenuationStyle ${i}`).toBeLessThan(1e-9);
        }
      }
    });

    it('leaves a field with no declared step (filterLPF.frequency) byte-for-byte unaffected — regression, not just "still works"', () => {
      const settings = generateGlobalAudioSettings('regression-probe-seed', 'ProbePlanet');
      expect(settings.filterLPF.frequency).toBe(4730.514641816347);
    });

    it('quantizes compressor.threshold and compressor.knee to a whole dB, across many seeds', () => {
      for (let i = 0; i < 20; i++) {
        const settings = generateGlobalAudioSettings(`seed-quantize-sample-${i}`, `QuantizeSample${i}`);
        expect(Number.isInteger(settings.compressor.threshold), `threshold attenuationStyle ${i}`).toBe(true);
        expect(Number.isInteger(settings.compressor.knee), `knee attenuationStyle ${i}`).toBe(true);
      }
    });

    it('quantizes limiter.threshold to a whole dB, across many seeds', () => {
      for (let i = 0; i < 20; i++) {
        const settings = generateGlobalAudioSettings(`seed-quantize-sample-${i}`, `QuantizeSample${i}`);
        expect(Number.isInteger(settings.limiter.threshold), `attenuationStyle ${i}`).toBe(true);
      }
    });

    it('quantizes every lfoDrift field (rateDrift/depthDrift, both groups) to a whole percent, across many seeds', () => {
      for (let i = 0; i < 20; i++) {
        const settings = generateGlobalAudioSettings(`seed-quantize-sample-${i}`, `QuantizeSample${i}`);
        for (const group of DRIFT_GROUP_IDS) {
          const { rateDrift, depthDrift } = settings.lfoDrift[group];
          expect(Math.abs(rateDrift * 100 - Math.round(rateDrift * 100)), `${group}.rateDrift attenuationStyle ${i}`).toBeLessThan(1e-9);
          expect(Math.abs(depthDrift * 100 - Math.round(depthDrift * 100)), `${group}.depthDrift attenuationStyle ${i}`).toBeLessThan(1e-9);
        }
      }
    });
  });

  describe('lfoDrift', () => {
    it('returns a fully-populated lfoDrift for both DriftGroupId groups', () => {
      const settings = generateGlobalAudioSettings('seed-test-planet', 'Nova');
      expect(Object.keys(settings.lfoDrift).sort()).toEqual([...DRIFT_GROUP_IDS].sort());
    });

    it('is deterministic — same attenuationStyleId + attenuationStyleName always produces the same lfoDrift for every group', () => {
      const first = generateGlobalAudioSettings('seed-test-planet', 'Nova');
      const second = generateGlobalAudioSettings('seed-test-planet', 'Nova');
      expect(second.lfoDrift).toEqual(first.lfoDrift);
    });

    it('produces different lfoDrift values for a different Attenuation Style name (non-degenerate)', () => {
      const a = generateGlobalAudioSettings('seed-test-planet', 'Nova');
      const b = generateGlobalAudioSettings('seed-test-planet-b', 'Zenith');
      expect(b.lfoDrift).not.toEqual(a.lfoDrift);
    });

    it('samples rateDrift and depthDrift independently within each group, not the same draw for both', () => {
      // A shared draw fed into both fields would be an easy copy/paste bug —
      // this catches it directly rather than relying on the non-degenerate
      // check above, which would still pass if both fields moved in lockstep.
      const settings = generateGlobalAudioSettings('seed-test-planet', 'Nova');
      for (const group of DRIFT_GROUP_IDS) {
        expect(settings.lfoDrift[group].rateDrift, group).not.toBe(settings.lfoDrift[group].depthDrift);
      }
    });

    it('samples each group independently — no two groups share the same rateDrift draw', () => {
      const settings = generateGlobalAudioSettings('seed-test-planet', 'Nova');
      const rateDrifts = DRIFT_GROUP_IDS.map((group) => settings.lfoDrift[group].rateDrift);
      expect(new Set(rateDrifts).size).toBe(DRIFT_GROUP_IDS.length);
    });

    it('samples each group independently — no two groups share the same depthDrift draw', () => {
      const settings = generateGlobalAudioSettings('seed-test-planet', 'Nova');
      const depthDrifts = DRIFT_GROUP_IDS.map((group) => settings.lfoDrift[group].depthDrift);
      expect(new Set(depthDrifts).size).toBe(DRIFT_GROUP_IDS.length);
    });

    it('keeps every group\'s fields within the -0.7..0.7 loading range on every call, across many Attenuation Styles', () => {
      const SAMPLE_ATTENUATION_STYLES = 20;
      for (let i = 0; i < SAMPLE_ATTENUATION_STYLES; i++) {
        const settings = generateGlobalAudioSettings(`seed-drift-sample-${i}`, `DriftSample${i}`);
        for (const group of DRIFT_GROUP_IDS) {
          const { rateDrift, depthDrift } = settings.lfoDrift[group];
          expect(rateDrift, `attenuationStyle ${i} ${group} rateDrift`).toBeGreaterThanOrEqual(-0.7);
          expect(rateDrift, `attenuationStyle ${i} ${group} rateDrift`).toBeLessThanOrEqual(0.7);
          expect(depthDrift, `attenuationStyle ${i} ${group} depthDrift`).toBeGreaterThanOrEqual(-0.7);
          expect(depthDrift, `attenuationStyle ${i} ${group} depthDrift`).toBeLessThanOrEqual(0.7);
        }
        evictAttenuationStyleNoiseMap(`seed-drift-sample-${i}`);
      }
    });

    it('actually produces both negative and positive rateDrift values across many Attenuation Styles, for every group (non-degenerate)', () => {
      const SAMPLE_ATTENUATION_STYLES = 20;
      const sawNegative: Record<string, boolean> = {};
      const sawPositive: Record<string, boolean> = {};
      for (const group of DRIFT_GROUP_IDS) {
        sawNegative[group] = false;
        sawPositive[group] = false;
      }
      for (let i = 0; i < SAMPLE_ATTENUATION_STYLES; i++) {
        const settings = generateGlobalAudioSettings(`seed-drift-sign-${i}`, `DriftSign${i}`);
        for (const group of DRIFT_GROUP_IDS) {
          if (settings.lfoDrift[group].rateDrift < 0) sawNegative[group] = true;
          if (settings.lfoDrift[group].rateDrift > 0) sawPositive[group] = true;
        }
        evictAttenuationStyleNoiseMap(`seed-drift-sign-${i}`);
      }
      for (const group of DRIFT_GROUP_IDS) {
        expect(sawNegative[group], `expected group ${group} to see rateDrift < 0 at least once`).toBe(true);
        expect(sawPositive[group], `expected group ${group} to see rateDrift > 0 at least once`).toBe(true);
      }
    });
  });
});

describe('generateGlobalLfoSettings', () => {
  afterEach(() => {
    evictAttenuationStyleNoiseMap('seed-test-planet');
    evictAttenuationStyleNoiseMap('seed-test-planet-b');
    for (let i = 0; i < 40; i++) evictAttenuationStyleNoiseMap(`seed-lfo-sample-${i}`);
    for (let i = 0; i < 40; i++) evictAttenuationStyleNoiseMap(`seed-lfo-shape-${i}`);
  });

  it('returns a fully-populated record for all 8 GlobalLfoTargetIds', () => {
    const settings = generateGlobalLfoSettings('seed-test-planet', 'Nova');
    expect(Object.keys(settings).sort()).toEqual([...GLOBAL_LFO_TARGET_IDS].sort());
  });

  it('is deterministic — same attenuationStyleId + attenuationStyleName always produces the same settings', () => {
    const first = generateGlobalLfoSettings('seed-test-planet', 'Nova');
    const second = generateGlobalLfoSettings('seed-test-planet', 'Nova');
    expect(second).toEqual(first);
  });

  it('is deterministic across a fresh noise map too, not just a cached one', () => {
    const first = generateGlobalLfoSettings('seed-test-planet', 'Nova');
    evictAttenuationStyleNoiseMap('seed-test-planet');
    const second = generateGlobalLfoSettings('seed-test-planet', 'Nova');
    expect(second).toEqual(first);
  });

  it('produces different values for a different Attenuation Style name (non-degenerate)', () => {
    const a = generateGlobalLfoSettings('seed-test-planet', 'Nova');
    const b = generateGlobalLfoSettings('seed-test-planet-b', 'Zenith');
    expect(b).not.toEqual(a);
  });

  it('samples rate/depth from their narrower loading range (1-4Hz, 20-50%), not the full LFO_RATE/DEPTH_MIN/MAX range — except a quietly-seeded target\'s rate, which is forced to exactly 0', () => {
    const settings = generateGlobalLfoSettings('seed-test-planet', 'Nova');
    for (const target of GLOBAL_LFO_TARGET_IDS) {
      const { rate, depth, shape } = settings[target];
      if (rate !== 0) {
        expect(rate, `${target}.rate`).toBeGreaterThanOrEqual(LFO_RATE_LOADING_MIN);
        expect(rate, `${target}.rate`).toBeLessThanOrEqual(LFO_RATE_LOADING_MAX);
      }
      expect(depth, `${target}.depth`).toBeGreaterThanOrEqual(LFO_DEPTH_LOADING_MIN);
      expect(depth, `${target}.depth`).toBeLessThanOrEqual(LFO_DEPTH_LOADING_MAX);
      expect(LFO_SHAPES, `${target}.shape`).toContain(shape);
    }
  });

  it('the LFO rate/depth loading range is a genuine subset of the full LFO_RATE/DEPTH_MIN/MAX range', () => {
    expect(LFO_RATE_LOADING_MIN).toBeGreaterThanOrEqual(LFO_RATE_MIN);
    expect(LFO_RATE_LOADING_MAX).toBeLessThanOrEqual(LFO_RATE_MAX);
    expect(LFO_DEPTH_LOADING_MIN).toBeGreaterThanOrEqual(LFO_DEPTH_MIN);
    expect(LFO_DEPTH_LOADING_MAX).toBeLessThanOrEqual(LFO_DEPTH_MAX);
  });

  it('only ever seeds triangle or sine for shape, never square or sawtooth', () => {
    const SAMPLE_ATTENUATION_STYLES = 40;
    for (let i = 0; i < SAMPLE_ATTENUATION_STYLES; i++) {
      const settings = generateGlobalLfoSettings(`seed-lfo-shape-${i}`, `ShapeSample${i}`);
      for (const target of GLOBAL_LFO_TARGET_IDS) {
        expect(['triangle', 'sine'], `${target}.shape (attenuationStyle ${i})`).toContain(settings[target].shape);
      }
    }
  });

  it('actually produces both triangle and sine across many Attenuation Styles, not always just one (non-degenerate)', () => {
    const SAMPLE_ATTENUATION_STYLES = 40;
    const seenShapes = new Set<string>();
    for (let i = 0; i < SAMPLE_ATTENUATION_STYLES; i++) {
      const settings = generateGlobalLfoSettings(`seed-lfo-shape-${i}`, `ShapeSample${i}`);
      for (const target of GLOBAL_LFO_TARGET_IDS) {
        seenShapes.add(settings[target].shape);
      }
    }
    expect(seenShapes).toEqual(new Set(['triangle', 'sine']));
  });

  it('no longer carries an active field on any target — removed, off is now expressed via rate: 0', () => {
    const settings = generateGlobalLfoSettings('seed-test-planet', 'Nova');
    for (const target of GLOBAL_LFO_TARGET_IDS) {
      expect('active' in settings[target]).toBe(false);
    }
  });

  it('quantizes rate to a 0.05 grid across many seeds and targets, excluding the quiet -> 0 case', () => {
    const SAMPLE_ATTENUATION_STYLES = 20;
    for (let i = 0; i < SAMPLE_ATTENUATION_STYLES; i++) {
      const settings = generateGlobalLfoSettings(`seed-lfo-sample-${i}`, `Sample${i}`);
      for (const target of GLOBAL_LFO_TARGET_IDS) {
        const { rate } = settings[target];
        if (rate === 0) continue;
        const stepsFromMin = rate / 0.05;
        expect(Math.abs(stepsFromMin - Math.round(stepsFromMin)), `${target}.rate (attenuationStyle ${i})`).toBeLessThan(1e-9);
      }
    }
  });

  it('quantizes depth to a whole percent across many seeds and targets', () => {
    const SAMPLE_ATTENUATION_STYLES = 20;
    for (let i = 0; i < SAMPLE_ATTENUATION_STYLES; i++) {
      const settings = generateGlobalLfoSettings(`seed-lfo-sample-${i}`, `Sample${i}`);
      for (const target of GLOBAL_LFO_TARGET_IDS) {
        const { depth } = settings[target];
        expect(Number.isInteger(depth), `${target}.depth (attenuationStyle ${i}): ${depth}`).toBe(true);
      }
    }
  });

  it('seeds a nonzero (real, oscillating) rate for roughly 2-in-3 targets across many Attenuation Styles, not roughly half (>= 0.34 threshold, not a flat 50/50)', () => {
    const SAMPLE_ATTENUATION_STYLES = 40;
    let nonzeroCount = 0;
    let totalCount = 0;
    for (let i = 0; i < SAMPLE_ATTENUATION_STYLES; i++) {
      const settings = generateGlobalLfoSettings(`seed-lfo-sample-${i}`, `Sample${i}`);
      for (const target of GLOBAL_LFO_TARGET_IDS) {
        totalCount++;
        if (settings[target].rate > 0) nonzeroCount++;
      }
    }
    const nonzeroRate = nonzeroCount / totalCount;
    // ~66% expected; a wide tolerance band avoids flakiness while still
    // clearly distinguishing this from both a ~50% flat coin-flip and ~100%.
    expect(nonzeroRate).toBeGreaterThan(0.5);
    expect(nonzeroRate).toBeLessThan(0.8);
  });
});

describe('generatePingVarianceAutomation', () => {
  afterEach(() => {
    evictAttenuationStyleNoiseMap('seed-test-planet');
    evictAttenuationStyleNoiseMap('seed-test-planet-b');
    for (let i = 0; i < 30; i++) evictAttenuationStyleNoiseMap(`seed-pva-sample-${i}`);
  });

  it('always returns a value in [0.10, 0.60], across many Attenuation Styles (docs/specs/AUTOMATION_FREQUENCY_DURATION_SPLIT.md §1.2 — narrowed from [0.33, 0.66])', () => {
    const SAMPLE_ATTENUATION_STYLES = 30;
    for (let i = 0; i < SAMPLE_ATTENUATION_STYLES; i++) {
      const value = generatePingVarianceAutomation(`seed-pva-sample-${i}`, `PvaSample${i}`);
      expect(value, `attenuationStyle ${i}`).toBeGreaterThanOrEqual(0.10);
      expect(value, `attenuationStyle ${i}`).toBeLessThanOrEqual(0.60);
    }
  });

  it('is deterministic — same attenuationStyleId + attenuationStyleName always produces the same value', () => {
    const first = generatePingVarianceAutomation('seed-test-planet', 'Nova');
    const second = generatePingVarianceAutomation('seed-test-planet', 'Nova');
    expect(second).toBe(first);
  });

  it('is deterministic across a fresh noise map too, not just a cached one', () => {
    const first = generatePingVarianceAutomation('seed-test-planet', 'Nova');
    evictAttenuationStyleNoiseMap('seed-test-planet');
    const second = generatePingVarianceAutomation('seed-test-planet', 'Nova');
    expect(second).toBe(first);
  });

  it('produces different values for a different Attenuation Style name (non-degenerate)', () => {
    const a = generatePingVarianceAutomation('seed-test-planet', 'Nova');
    const b = generatePingVarianceAutomation('seed-test-planet-b', 'Zenith');
    expect(b).not.toBe(a);
  });

  it('always returns a value whose percent (x100) is an integer, across many Attenuation Styles', () => {
    const SAMPLE_ATTENUATION_STYLES = 30;
    for (let i = 0; i < SAMPLE_ATTENUATION_STYLES; i++) {
      const value = generatePingVarianceAutomation(`seed-pva-sample-${i}`, `PvaSample${i}`);
      expect(Number.isInteger(value * 100), `attenuationStyle ${i}: ${value}`).toBe(true);
    }
  });

  it('is not a Math.random()-driven value anywhere in this module (source-scan regression guard)', () => {
    const thisFile = fileURLToPath(import.meta.url);
    const source = readFileSync(join(dirname(thisFile), 'globalAudioSeed.ts'), 'utf-8');
    expect(source).not.toMatch(/Math\.random/);
  });
});

describe('generateSwellFrequency (docs/specs/AUTOMATION_FREQUENCY_DURATION_SPLIT.md §1.5)', () => {
  afterEach(() => {
    evictAttenuationStyleNoiseMap('seed-test-planet');
    evictAttenuationStyleNoiseMap('seed-test-planet-b');
    for (let i = 0; i < 30; i++) evictAttenuationStyleNoiseMap(`seed-freq-sample-${i}`);
  });

  it('always returns a value in [2, 8], across many Attenuation Styles', () => {
    const SAMPLE_ATTENUATION_STYLES = 30;
    for (let i = 0; i < SAMPLE_ATTENUATION_STYLES; i++) {
      const value = generateSwellFrequency(`seed-freq-sample-${i}`, `FreqSample${i}`);
      expect(value, `attenuationStyle ${i}`).toBeGreaterThanOrEqual(2);
      expect(value, `attenuationStyle ${i}`).toBeLessThanOrEqual(8);
    }
  });

  it('always lands exactly on one of SWELL_FREQUENCY_STEPS, never an off-grid raw value', () => {
    const SAMPLE_ATTENUATION_STYLES = 30;
    for (let i = 0; i < SAMPLE_ATTENUATION_STYLES; i++) {
      const value = generateSwellFrequency(`seed-freq-sample-${i}`, `FreqSample${i}`);
      expect(SWELL_FREQUENCY_STEPS, `attenuationStyle ${i}`).toContain(value);
    }
  });

  it('is deterministic — same attenuationStyleId + attenuationStyleName always produces the same value', () => {
    const first = generateSwellFrequency('seed-test-planet', 'Nova');
    const second = generateSwellFrequency('seed-test-planet', 'Nova');
    expect(second).toBe(first);
  });

  it('is deterministic across a fresh noise map too, not just a cached one', () => {
    const first = generateSwellFrequency('seed-test-planet', 'Nova');
    evictAttenuationStyleNoiseMap('seed-test-planet');
    const second = generateSwellFrequency('seed-test-planet', 'Nova');
    expect(second).toBe(first);
  });

  // Snapped onto SWELL_FREQUENCY_STEPS (audioRigConfig.ts), only 4 of which (2, 3, 4, 8) fall
  // inside this function's own [2, 8] seed range -- a fixed pair of seeds can land on the same
  // step by pure chance (found live: 'Nova'/'Zenith' both snapped to 8), so "non-degenerate" is
  // checked the same way generateGlobalLfoSettings'/lfoDrift's own coarse-output tests above check
  // it: sample many seeds and look for genuine variety, not a single pairwise inequality.
  it('produces more than one distinct (post-snap) value across many Attenuation Styles (non-degenerate)', () => {
    const SAMPLE_ATTENUATION_STYLES = 30;
    const values = new Set<number>();
    for (let i = 0; i < SAMPLE_ATTENUATION_STYLES; i++) {
      values.add(generateSwellFrequency(`seed-freq-sample-${i}`, `FreqSample${i}`));
    }
    expect(values.size).toBeGreaterThan(1);
  });
});

describe('generateSwellDuration (docs/specs/AUTOMATION_FREQUENCY_DURATION_SPLIT.md §1.5)', () => {
  afterEach(() => {
    evictAttenuationStyleNoiseMap('seed-test-planet');
    evictAttenuationStyleNoiseMap('seed-test-planet-b');
    for (let i = 0; i < 30; i++) evictAttenuationStyleNoiseMap(`seed-dur-sample-${i}`);
  });

  it('always returns a value in [2, 8], across many Attenuation Styles', () => {
    const SAMPLE_ATTENUATION_STYLES = 30;
    for (let i = 0; i < SAMPLE_ATTENUATION_STYLES; i++) {
      const value = generateSwellDuration(`seed-dur-sample-${i}`, `DurSample${i}`);
      expect(value, `attenuationStyle ${i}`).toBeGreaterThanOrEqual(2);
      expect(value, `attenuationStyle ${i}`).toBeLessThanOrEqual(8);
    }
  });

  it('is deterministic — same attenuationStyleId + attenuationStyleName always produces the same value', () => {
    const first = generateSwellDuration('seed-test-planet', 'Nova');
    const second = generateSwellDuration('seed-test-planet', 'Nova');
    expect(second).toBe(first);
  });

  it('is deterministic across a fresh noise map too, not just a cached one', () => {
    const first = generateSwellDuration('seed-test-planet', 'Nova');
    evictAttenuationStyleNoiseMap('seed-test-planet');
    const second = generateSwellDuration('seed-test-planet', 'Nova');
    expect(second).toBe(first);
  });

  it('produces different values for a different Attenuation Style name (non-degenerate)', () => {
    const a = generateSwellDuration('seed-test-planet', 'Nova');
    const b = generateSwellDuration('seed-test-planet-b', 'Zenith');
    expect(b).not.toBe(a);
  });
});
