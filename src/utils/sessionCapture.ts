// ========================================
// IMPORTS
// ========================================
// No store import: seedBaseline.ts reads this, and it sits under the boot seam (docs/specs/SHORT_WORLD_LINK.md risk 2).
import { quantizeToStep, roundToDecimals } from './math';
import { GLOBAL_AUDIO_SEED_RANGES } from '../data/globalAudioSeedRanges';
import type { GlobalAudioSettings } from '../types/globalAudio';
import { LFO_LANE_IDS, type BankLfoSettings, type LfoLaneId } from '../types/lfo';

// ========================================
// FUNCTIONS
// ========================================
// What a session payload does to the world-level values it captures. buildSessionPayload applies it to the live world;
// generateWorldSeedBaseline applies it to the seed, so an untouched world diffs to nothing against its own seed and its
// link is the bare triple.

/** The Audio Rig with every slider-stepped field snapped to its step, which also clears floating-point artifacts. */
export function quantizeGlobalAudioForCapture(
  globalAudio: GlobalAudioSettings
): GlobalAudioSettings {
  const toCapture = { ...globalAudio };
  toCapture.compressor = {
    threshold: roundToDecimals(
      quantizeToStep(
        toCapture.compressor.threshold,
        GLOBAL_AUDIO_SEED_RANGES['compressor.threshold'].min,
        1
      ),
      0
    ),
    ratio: roundToDecimals(
      quantizeToStep(
        toCapture.compressor.ratio,
        GLOBAL_AUDIO_SEED_RANGES['compressor.ratio'].min,
        1
      ),
      0
    ),
    attack: roundToDecimals(
      quantizeToStep(
        toCapture.compressor.attack,
        GLOBAL_AUDIO_SEED_RANGES['compressor.attack'].min,
        0.001
      ),
      3
    ),
    release: roundToDecimals(
      quantizeToStep(
        toCapture.compressor.release,
        GLOBAL_AUDIO_SEED_RANGES['compressor.release'].min,
        0.001
      ),
      3
    ),
    knee: roundToDecimals(
      quantizeToStep(toCapture.compressor.knee, GLOBAL_AUDIO_SEED_RANGES['compressor.knee'].min, 1),
      0
    ),
  };
  toCapture.eq3 = {
    low: roundToDecimals(
      quantizeToStep(toCapture.eq3.low, GLOBAL_AUDIO_SEED_RANGES['eq3.low'].min, 0.5),
      1
    ),
    mid: roundToDecimals(
      quantizeToStep(toCapture.eq3.mid, GLOBAL_AUDIO_SEED_RANGES['eq3.mid'].min, 0.5),
      1
    ),
    high: roundToDecimals(
      quantizeToStep(toCapture.eq3.high, GLOBAL_AUDIO_SEED_RANGES['eq3.high'].min, 0.5),
      1
    ),
  };
  toCapture.filterLPF = {
    ...toCapture.filterLPF,
    frequency: roundToDecimals(
      quantizeToStep(
        toCapture.filterLPF.frequency,
        GLOBAL_AUDIO_SEED_RANGES['filterLPF.frequency'].min,
        1
      ),
      0
    ),
    Q: roundToDecimals(
      quantizeToStep(toCapture.filterLPF.Q, GLOBAL_AUDIO_SEED_RANGES['filterLPF.Q'].min, 0.01),
      2
    ),
  };
  toCapture.filterHPF = {
    ...toCapture.filterHPF,
    frequency: roundToDecimals(
      quantizeToStep(
        toCapture.filterHPF.frequency,
        GLOBAL_AUDIO_SEED_RANGES['filterHPF.frequency'].min,
        1
      ),
      0
    ),
    Q: roundToDecimals(
      quantizeToStep(toCapture.filterHPF.Q, GLOBAL_AUDIO_SEED_RANGES['filterHPF.Q'].min, 0.01),
      2
    ),
  };
  toCapture.delay = {
    ...toCapture.delay,
    delayTime: roundToDecimals(
      quantizeToStep(
        toCapture.delay.delayTime,
        GLOBAL_AUDIO_SEED_RANGES['delay.delayTime'].min,
        0.001
      ),
      3
    ),
    feedback: roundToDecimals(
      quantizeToStep(
        toCapture.delay.feedback,
        GLOBAL_AUDIO_SEED_RANGES['delay.feedback'].min,
        0.01
      ),
      2
    ),
    wet: roundToDecimals(
      quantizeToStep(toCapture.delay.wet, GLOBAL_AUDIO_SEED_RANGES['delay.wet'].min, 0.01),
      2
    ),
  };
  toCapture.reverb = {
    ...toCapture.reverb,
    decay: roundToDecimals(
      quantizeToStep(toCapture.reverb.decay, GLOBAL_AUDIO_SEED_RANGES['reverb.decay'].min, 0.01),
      2
    ),
    preDelay: roundToDecimals(
      quantizeToStep(
        toCapture.reverb.preDelay,
        GLOBAL_AUDIO_SEED_RANGES['reverb.preDelay'].min,
        0.01
      ),
      2
    ),
    wet: roundToDecimals(
      quantizeToStep(toCapture.reverb.wet, GLOBAL_AUDIO_SEED_RANGES['reverb.wet'].min, 0.01),
      2
    ),
  };
  toCapture.limiter = {
    threshold: roundToDecimals(
      quantizeToStep(
        toCapture.limiter.threshold,
        GLOBAL_AUDIO_SEED_RANGES['limiter.threshold'].min,
        1
      ),
      0
    ),
  };
  return toCapture;
}

/** The LFO Bank with each lane's drifts rounded to 2 decimal places, the same cleanup every other seeded-then-hand-dragged
 *  field on a payload gets. A lane's other fields, its `sync` included, are kept as they are. */
export function roundLfoBankForCapture(
  lfoBank: Record<LfoLaneId, BankLfoSettings>
): Record<LfoLaneId, BankLfoSettings> {
  return Object.fromEntries(
    LFO_LANE_IDS.map((lane) => {
      const settings = lfoBank[lane];
      return [
        lane,
        {
          ...settings,
          rateDrift: roundToDecimals(settings.rateDrift, 2),
          depthDrift: roundToDecimals(settings.depthDrift, 2),
        },
      ];
    })
  ) as Record<LfoLaneId, BankLfoSettings>;
}
