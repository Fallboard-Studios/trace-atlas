// ========================================
// IMPORTS
// ========================================
import type { NoiseFunction2D } from 'simplex-noise';

import { getAttenuationStyleNoiseMap } from './noiseMaps';
import { getSeededVal } from './getSeededVal';
import { quantizeToStep } from './math';
import { pickLane } from './lfoLaneDraw';
import { stepsValueToT, stepsTToValue } from '@/components/ui/controls/sliderLogMath';
import { SWELL_FREQUENCY_STEPS, SWELL_DURATION_SCHEMA } from '@/data/audioRigConfig';

import type { GlobalAudioSettings } from '@/types/globalAudio';
import { DEFAULT_GLOBAL_AUDIO_SETTINGS } from '@/types/globalAudio';
import { GLOBAL_AUDIO_LOADING_RANGES } from '@/data/globalAudioLoadingRanges';
import { GLOBAL_AUDIO_SEED_RANGES, type GlobalAudioSeedFieldKey, type SeedRange } from '@/data/globalAudioSeedRanges';
import {
  GLOBAL_LFO_TARGET_IDS,
  LFO_LANE_IDS,
  LFO_RATE_MIN,
  LFO_DEPTH_MIN,
  type GlobalLfoTargetId,
  type LfoShape,
  type LfoLaneId,
  type LfoLink,
  type BankLfoSettings,
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
 * Loading-range sub-window for global-chain LFO link depth — narrower than LFO_DEPTH_MIN/MAX
 * (the full/UI-facing range the LfoLink primitive's Depth slider still uses unchanged). Mirrors
 * globalAudioLoadingRanges.ts's pattern for effect params — bounds what a FRESH SEED can roll,
 * never what the UI exposes or what the app can do. Robot-level LFO-link seeding
 * (spawnSystem.ts) has its own separate ROBOT_LFO_DEPTH_SEED_MIN floor, not this window.
 */
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

// ========================================
// LFO BANK (docs/specs/LFO_BANK.md §1.3)
// ========================================

/**
 * Four fixed, adjacent, log-spaced bands a fresh bank lane's rate seeds within — one slow, one
 * fast, two between (spec §1.3/assumption 8). Boundaries are all exact multiples of LFO_RATE_STEP
 * (0.05), so quantizing a sample drawn from a band can never round it out of that band. A first
 * tuning for the listening pass (Checkpoint C), not sacred.
 */
export const LFO_BANK_RATE_BANDS: Record<LfoLaneId, { min: number; max: number }> = {
  a: { min: 0.1, max: 0.4 },
  b: { min: 0.4, max: 1.5 },
  c: { min: 1.5, max: 4 },
  d: { min: 4, max: 8 },
};

/** The bank's own per-lane drift loading window (±0.7, spec assumption 8). */
export const LFO_BANK_DRIFT_SEED_RANGE = { min: -0.7, max: 0.7 };

/** Rounds a bank lane's rateDrift/depthDrift to a whole hundredth. */
const LFO_BANK_DRIFT_STEP = 0.01;

/**
 * Generate deterministic LFO Bank lane settings for an Attenuation Style, sampled from the same
 * Attenuation Style noise map generateGlobalAudioSettings uses — the four lanes are a property of
 * the Attenuation Style (spec assumption 2), same seed source and re-seed trigger as the old
 * per-target global-chain LFO settings this supersedes.
 */
export function generateLfoBankSettings(
  attenuationStyleId: string,
  attenuationStyleName: string,
): Record<LfoLaneId, BankLfoSettings> {
  const noiseMap = getAttenuationStyleNoiseMap(attenuationStyleId, attenuationStyleName);
  const result = {} as Record<LfoLaneId, BankLfoSettings>;

  for (const lane of LFO_LANE_IDS) {
    const rateT = getSeededVal(noiseMap, `lfoBank.${lane}.rate`, 0, 0, 1);
    const shapeT = getSeededVal(noiseMap, `lfoBank.${lane}.shape`, 0, 0, 1);
    const rateDriftT = getSeededVal(noiseMap, `lfoBank.${lane}.rateDrift`, 0, 0, 1);
    const depthDriftT = getSeededVal(noiseMap, `lfoBank.${lane}.depthDrift`, 0, 0, 1);

    result[lane] = {
      shape: LFO_LOADING_SHAPES[Math.min(LFO_LOADING_SHAPES.length - 1, Math.floor(shapeT * LFO_LOADING_SHAPES.length))],
      rate: quantizeToStep(
        scaleUnitValue(rateT, { ...LFO_BANK_RATE_BANDS[lane], scale: 'log' }),
        LFO_RATE_MIN,
        LFO_RATE_STEP,
      ),
      rateDrift: quantizeToStep(
        scaleUnitValue(rateDriftT, { ...LFO_BANK_DRIFT_SEED_RANGE, scale: 'linear' }),
        0,
        LFO_BANK_DRIFT_STEP,
      ),
      depthDrift: quantizeToStep(
        scaleUnitValue(depthDriftT, { ...LFO_BANK_DRIFT_SEED_RANGE, scale: 'linear' }),
        0,
        LFO_BANK_DRIFT_STEP,
      ),
    };
  }
  return result;
}

/**
 * Generate deterministic global-chain LFO links for an Attenuation Style — replaces
 * generateGlobalLfoSettings's per-target shape/rate with a lane pick (spec §1.3). Reuses
 * LFO_QUIET_THRESHOLD (0.34) and the existing depth loading window (LFO_DEPTH_LOADING_MIN/MAX,
 * 20-50%) unchanged. The lane draw is weighted by a running tally across only the 7 global
 * targets — they seed before any robot exists, so there is no roster to tally against
 * (spec assumption 7).
 */
export function generateGlobalLfoLinks(
  attenuationStyleId: string,
  attenuationStyleName: string,
): Record<GlobalLfoTargetId, LfoLink> {
  const noiseMap = getAttenuationStyleNoiseMap(attenuationStyleId, attenuationStyleName);
  const result = {} as Record<GlobalLfoTargetId, LfoLink>;
  const counts: Record<LfoLaneId, number> = { a: 0, b: 0, c: 0, d: 0 };

  for (const target of GLOBAL_LFO_TARGET_IDS) {
    const quietT = getSeededVal(noiseMap, `globalLfo.${target}.quiet`, 0, 0, 1);
    if (quietT < LFO_QUIET_THRESHOLD) {
      result[target] = { lane: null, depth: 0 };
      continue;
    }

    const laneT = getSeededVal(noiseMap, `globalLfo.${target}.lane`, 0, 0, 1);
    const lane = pickLane(laneT, counts);
    counts[lane]++;

    const depthT = getSeededVal(noiseMap, `globalLfo.${target}.depth`, 0, 0, 1);
    const depth = quantizeToStep(
      scaleUnitValue(depthT, { min: LFO_DEPTH_LOADING_MIN, max: LFO_DEPTH_LOADING_MAX, scale: 'linear' }),
      LFO_DEPTH_MIN,
      LFO_DEPTH_STEP,
    );
    result[target] = { lane, depth };
  }
  return result;
}
