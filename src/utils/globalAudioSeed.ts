// ========================================
// IMPORTS
// ========================================
import type { NoiseFunction2D } from 'simplex-noise';

import { getAttenuationStyleNoiseMap } from './noiseMaps';
import { getSeededVal } from './getSeededVal';
import { quantizeToStep } from './math';
import { stepsValueToT, stepsTToValue } from '@/components/ui/controls/sliderLogMath';
import { SWELL_FREQUENCY_STEPS, SWELL_DURATION_SCHEMA } from '@/data/audioRigConfig';

import type { GlobalAudioSettings } from '@/types/globalAudio';
import { DEFAULT_GLOBAL_AUDIO_SETTINGS } from '@/types/globalAudio';
import { GLOBAL_AUDIO_LOADING_RANGES } from '@/data/globalAudioLoadingRanges';
import { GLOBAL_AUDIO_SEED_RANGES, type GlobalAudioSeedFieldKey, type SeedRange } from '@/data/globalAudioSeedRanges';
import {
  GLOBAL_LFO_TARGET_IDS,
  LFO_RATE_MIN,
  LFO_DEPTH_MIN,
  type GlobalLfoTargetId,
  type LfoSettings,
  type LfoShape,
} from '@/types/lfo';

// ========================================
// FUNCTIONS
// ========================================

/**
 * Map a seeded [0, 1] draw to a field's real range, honoring its scale.
 * Linear fields interpolate arithmetically; log fields interpolate
 * geometrically (min * (max/min)^t), matching how the rest of the UI
 * already treats logarithmic sliders (see GLOBAL_CHAIN_GRID.md). `t` is
 * clamped rather than extrapolated in case of floating-point overshoot.
 */
export function scaleUnitValue(t: number, range: SeedRange): number {
  const clamped = Math.min(1, Math.max(0, t));
  if (range.scale === 'log') {
    return range.min * Math.pow(range.max / range.min, clamped);
  }
  return range.min + (range.max - range.min) * clamped;
}

function sampleField(noiseMap: NoiseFunction2D, key: GlobalAudioSeedFieldKey): number {
  // Sample within the narrower LOADING range (initial-seed sub-window), but
  // honor the full range's log/linear scale — GLOBAL_AUDIO_LOADING_RANGES
  // doesn't carry its own `scale`, it's purely a narrower min/max over the
  // same field GLOBAL_AUDIO_SEED_RANGES already describes.
  const range: SeedRange = { ...GLOBAL_AUDIO_LOADING_RANGES[key], scale: GLOBAL_AUDIO_SEED_RANGES[key].scale };
  // getSeededVal handles the seeded noise → [0, 1] draw; scaleUnitValue owns
  // range + log/linear mapping, so the two concerns stay separately testable.
  const t = getSeededVal(noiseMap, `globalAudio.${key}`, 0, 0, 1);
  const value = scaleUnitValue(t, range);
  const { step } = GLOBAL_AUDIO_SEED_RANGES[key];
  // Quantized against the FULL range's own min, never the narrower loading
  // range's min — the grid a field's slider actually exposes is anchored to
  // its full min, so quantizing against the loading min would land values on
  // a different, incompatible grid.
  return step === undefined ? value : quantizeToStep(value, GLOBAL_AUDIO_SEED_RANGES[key].min, step);
}

/**
 * Probability threshold Delay's own "start quiet" seed draw ([0, 1]) must
 * clear to force wet to 0 — spec §5's original ~25% chance, now expressed
 * directly on wet since there's no separate enabled flag left to carry it.
 * The sole global effect a fresh Attenuation Style can load silent; every
 * other effect's wet/level always seeds a real, audible value. Mirrors the
 * shipped LFO_QUIET_THRESHOLD pattern below, just a different field/odds.
 */
const DELAY_QUIET_THRESHOLD = 0.25;

/**
 * Generate deterministic GlobalAudioSettings for an Attenuation Style, sampled from the
 * Attenuation Style noise map — a new direct sample; previously that map was only
 * used to derive locale maps (see PROCEDURAL_GENERATION.md).
 *
 * `type`/`compressorBeforeDelay` are NOT seeded — carried over from
 * DEFAULT_GLOBAL_AUDIO_SETTINGS unchanged. Every effect's params always seed
 * a real, audible value except Delay's `wet`, which has a real ~25% chance
 * (DELAY_QUIET_THRESHOLD) of forcing to 0 instead of its otherwise-sampled
 * value — the sole global effect a fresh Attenuation Style can load
 * effectively silent. This replaces the old per-effect `enabled` boolean
 * (removed entirely, along with `globalBypass` — off states are expressed
 * purely through the params themselves now).
 */
export function generateGlobalAudioSettings(attenuationStyleId: string, attenuationStyleName: string): GlobalAudioSettings {
  const noiseMap = getAttenuationStyleNoiseMap(attenuationStyleId, attenuationStyleName);
  const defaults = DEFAULT_GLOBAL_AUDIO_SETTINGS;
  const delayQuietT = getSeededVal(noiseMap, 'globalAudio.delay.quiet', 0, 0, 1);

  return {
    compressorBeforeDelay: defaults.compressorBeforeDelay,
    lfoDrift: {
      globalFx: { rateDrift: sampleField(noiseMap, 'lfoDrift.globalFx.rateDrift'), depthDrift: sampleField(noiseMap, 'lfoDrift.globalFx.depthDrift') },
      robots: { rateDrift: sampleField(noiseMap, 'lfoDrift.robots.rateDrift'), depthDrift: sampleField(noiseMap, 'lfoDrift.robots.depthDrift') },
    },
    compressor: {
      threshold: sampleField(noiseMap, 'compressor.threshold'),
      ratio: sampleField(noiseMap, 'compressor.ratio'),
      attack: sampleField(noiseMap, 'compressor.attack'),
      release: sampleField(noiseMap, 'compressor.release'),
      knee: sampleField(noiseMap, 'compressor.knee'),
    },
    eq3: {
      low: sampleField(noiseMap, 'eq3.low'),
      mid: sampleField(noiseMap, 'eq3.mid'),
      high: sampleField(noiseMap, 'eq3.high'),
    },
    filterLPF: {
      type: 'lowpass',
      frequency: sampleField(noiseMap, 'filterLPF.frequency'),
      Q: sampleField(noiseMap, 'filterLPF.Q'),
    },
    filterHPF: {
      type: 'highpass',
      frequency: sampleField(noiseMap, 'filterHPF.frequency'),
      Q: sampleField(noiseMap, 'filterHPF.Q'),
    },
    delay: {
      delayTime: sampleField(noiseMap, 'delay.delayTime'),
      feedback: sampleField(noiseMap, 'delay.feedback'),
      // Quiet ~25% of the time (DELAY_QUIET_THRESHOLD) — wet forces to 0
      // instead of its own sampled value, replacing the old enabled:false roll.
      wet: delayQuietT < DELAY_QUIET_THRESHOLD ? 0 : sampleField(noiseMap, 'delay.wet'),
    },
    reverb: {
      decay: sampleField(noiseMap, 'reverb.decay'),
      preDelay: sampleField(noiseMap, 'reverb.preDelay'),
      wet: sampleField(noiseMap, 'reverb.wet'),
    },
    limiter: {
      threshold: sampleField(noiseMap, 'limiter.threshold'),
    },
  };
}

/**
 * Probability threshold a target's own "start quiet" seed draw ([0, 1]) must
 * clear to force rate to 0 — ~34% chance per target (not a flat 50/50), so a
 * typical Attenuation Style seeds roughly 5 already-oscillating LFOs out of 7.
 * Replaces the old separate `active` boolean — see LFO_RATE_MIN's own doc
 * comment (src/types/lfo.ts) for why rate=0 is now the "off" state.
 */
const LFO_QUIET_THRESHOLD = 0.34;

/**
 * Ping Variance Automation's own seeded-default range — [10%, 60%] as a
 * fraction — same "bounded/legible default, freely draggable afterward"
 * convention every other seeded Rig field follows (e.g. DELAY_QUIET_THRESHOLD
 * above). Narrowed from [33%, 66%] once Intensity's on/off role moved to the
 * new Frequency field (docs/specs/AUTOMATION_FREQUENCY_DURATION_SPLIT.md §1.2).
 */
const PING_VARIANCE_AUTOMATION_SEED_RANGE = { min: 0.10, max: 0.60 };

/**
 * Seeded starting value for audioStore's pingVarianceAutomation, [0.10, 0.60]
 * as a fraction. Sampled once per session, not once per Attenuation Style
 * switch — audioStore.ts's regenerateGlobalAudioFromSeed is responsible for
 * only calling this on the very first seed and carrying the value forward on
 * every later call (docs/specs/PING-VARIANCE-AUTOMATION.md §1.2); this
 * function itself is a plain, stateless seeded draw, same shape as every
 * other function in this file.
 */
export function generatePingVarianceAutomation(attenuationStyleId: string, attenuationStyleName: string): number {
  const noiseMap = getAttenuationStyleNoiseMap(attenuationStyleId, attenuationStyleName);
  const raw = getSeededVal(
    noiseMap, 'globalAudio.pingVarianceAutomation', 0,
    PING_VARIANCE_AUTOMATION_SEED_RANGE.min, PING_VARIANCE_AUTOMATION_SEED_RANGE.max
  );
  // Quantized in percent-space, not against the stored fraction directly —
  // quantizing the fraction itself would round to hundredths of a fraction
  // (a much finer grid than a whole percent), silently reintroducing a
  // subtler version of the off-grid bug this quantization pass exists to fix.
  return quantizeToStep(raw * 100, 0, 1) / 100;
}

/**
 * Frequency's own seeded-default range — [2, 8] swells/measure, same domain
 * the slider itself uses directly (no fraction/percent split, unlike
 * pingVarianceAutomation). docs/specs/AUTOMATION_FREQUENCY_DURATION_SPLIT.md §1.5.
 */
const SWELL_FREQUENCY_SEED_RANGE = { min: 2, max: 8 };

/**
 * Duration's own seeded-default range — [2, 8] measures, same domain the
 * slider itself uses directly. docs/specs/AUTOMATION_FREQUENCY_DURATION_SPLIT.md §1.5.
 */
const SWELL_DURATION_SEED_RANGE = { min: 2, max: 8 };

/**
 * Seeded starting value for audioStore's swellFrequency — a continuous roll within [2, 8], then
 * snapped onto SWELL_FREQUENCY_SCHEMA's own fixed step grid (audioRigConfig.ts) so a freshly-seeded
 * world always starts on one of the slider's actual allowed values (2, 3, 4, or 8 — the only steps
 * inside this range), the same "no off-grid value" guarantee pingVarianceAutomation's own
 * quantization gives it below. Sampled once per session, carried forward across later Attenuation
 * Style switches, same sentinel-gated mechanism pingVarianceAutomation already uses
 * (docs/specs/AUTOMATION_FREQUENCY_DURATION_SPLIT.md §1.5).
 */
export function generateSwellFrequency(attenuationStyleId: string, attenuationStyleName: string): number {
  const noiseMap = getAttenuationStyleNoiseMap(attenuationStyleId, attenuationStyleName);
  const raw = getSeededVal(
    noiseMap, 'globalAudio.swellFrequency', 0,
    SWELL_FREQUENCY_SEED_RANGE.min, SWELL_FREQUENCY_SEED_RANGE.max
  );
  return stepsTToValue(stepsValueToT(raw, SWELL_FREQUENCY_STEPS), SWELL_FREQUENCY_STEPS);
}

/**
 * Seeded starting value for audioStore's swellDuration, [2, 8] measures. Same
 * seed-once/carry-forward treatment as generateSwellFrequency above. Snapped onto
 * SWELL_DURATION_SCHEMA's own step=1 grid (audioRigConfig.ts) the same way generateSwellFrequency
 * snaps onto SWELL_FREQUENCY_STEPS — a fresh seed's raw continuous roll otherwise lands on a
 * fractional number of measures (e.g. 6.88), off-grid from what the "Automation Length" slider
 * itself can ever produce by hand (found live, 2026-09-30).
 */
export function generateSwellDuration(attenuationStyleId: string, attenuationStyleName: string): number {
  const noiseMap = getAttenuationStyleNoiseMap(attenuationStyleId, attenuationStyleName);
  const raw = getSeededVal(
    noiseMap, 'globalAudio.swellDuration', 0,
    SWELL_DURATION_SEED_RANGE.min, SWELL_DURATION_SEED_RANGE.max
  );
  return quantizeToStep(raw, SWELL_DURATION_SCHEMA.min, SWELL_DURATION_SCHEMA.step ?? 1);
}

/**
 * Loading-range sub-window for global-chain LFO rate/depth — narrower than
 * LFO_RATE_MIN/MAX and LFO_DEPTH_MIN/MAX (the full/UI-facing range every
 * other LFO consumer still uses unchanged: the Rate/Depth sliders in
 * Lfo.tsx, and lfoEngine.ts's setLfoRate/setLfoDepth clamp bounds). Mirrors
 * globalAudioLoadingRanges.ts's pattern for effect params — bounds what a
 * FRESH SEED can roll, never what the UI exposes or what the app can do.
 * Robot-level LFO seeding (spawnSystem.ts) has no equivalent split and keeps
 * sampling the full range; this only narrows the global-chain seed.
 */
export const LFO_RATE_LOADING_MIN = 1;
export const LFO_RATE_LOADING_MAX = 4;
export const LFO_DEPTH_LOADING_MIN = 20;
export const LFO_DEPTH_LOADING_MAX = 50;

/**
 * Mirrors Lfo.tsx's own RATE_STEP — kept as a separate local constant, same
 * "mirrored, not shared" pattern spawnSystem.ts's own LFO_RATE_STEP uses,
 * since the two files quantize independently sampled rates and have no
 * other reason to share an import.
 */
const LFO_RATE_STEP = 0.05;

/** Rounds depth to a whole percent — depth is already stored in percent units (0-100), so no
 *  unit conversion is needed the way Rate/Volume/Ping Variance Automation's percent-space
 *  conversions require. */
const LFO_DEPTH_STEP = 1;

/**
 * Loading-set restriction for global-chain LFO shape — narrower than
 * LFO_SHAPES (all 4: triangle/sine/square/sawtooth, still the full set the
 * Shape radio in Lfo.tsx offers). A fresh seed only ever rolls the two
 * smoothest shapes; square/sawtooth stay reachable, just not as a starting
 * state. Same loading-vs-full split as rate/depth above, applied to a
 * discrete set instead of a numeric range.
 */
const LFO_LOADING_SHAPES: readonly LfoShape[] = ['triangle', 'sine'];

/**
 * Generate deterministic global-chain LFO settings for an Attenuation Style, sampled
 * from the same Attenuation Style noise map generateGlobalAudioSettings uses.
 * Unlike the per-field GLOBAL_AUDIO_SEED_RANGES table, every target shares
 * the same single global rate/depth loading bounds (LFO_RATE_LOADING_MIN/MAX,
 * LFO_DEPTH_LOADING_MIN/MAX) — GLOBAL_CHAIN_GRID.md's LFO? column is a flat
 * flag, not per-field bounds. Each target has a real ~34% chance
 * (LFO_QUIET_THRESHOLD) of forcing rate to 0 instead of its own sampled
 * value — a freshly loaded Attenuation Style can already have real, audible
 * modulation running on most targets.
 */
export function generateGlobalLfoSettings(
  attenuationStyleId: string,
  attenuationStyleName: string,
): Record<GlobalLfoTargetId, LfoSettings> {
  const noiseMap = getAttenuationStyleNoiseMap(attenuationStyleId, attenuationStyleName);
  const result = {} as Record<GlobalLfoTargetId, LfoSettings>;

  for (const target of GLOBAL_LFO_TARGET_IDS) {
    const rateT = getSeededVal(noiseMap, `globalLfo.${target}.rate`, 0, 0, 1);
    const depthT = getSeededVal(noiseMap, `globalLfo.${target}.depth`, 0, 0, 1);
    const shapeT = getSeededVal(noiseMap, `globalLfo.${target}.shape`, 0, 0, 1);
    const quietT = getSeededVal(noiseMap, `globalLfo.${target}.quiet`, 0, 0, 1);
    const quiet = quietT < LFO_QUIET_THRESHOLD;

    result[target] = {
      rate: quiet ? 0 : quantizeToStep(
        scaleUnitValue(rateT, { min: LFO_RATE_LOADING_MIN, max: LFO_RATE_LOADING_MAX, scale: 'linear' }),
        LFO_RATE_MIN,
        LFO_RATE_STEP,
      ),
      depth: quantizeToStep(
        scaleUnitValue(depthT, { min: LFO_DEPTH_LOADING_MIN, max: LFO_DEPTH_LOADING_MAX, scale: 'linear' }),
        LFO_DEPTH_MIN,
        LFO_DEPTH_STEP,
      ),
      shape: LFO_LOADING_SHAPES[Math.min(LFO_LOADING_SHAPES.length - 1, Math.floor(shapeT * LFO_LOADING_SHAPES.length))],
    };
  }
  return result;
}
