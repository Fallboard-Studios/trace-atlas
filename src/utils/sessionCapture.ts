// ========================================
// IMPORTS
// ========================================
// No store import: seedBaseline.ts reads this, and it sits under the boot seam (docs/specs/SHORT_WORLD_LINK.md risk 2).
import { quantizeToStep, roundToDecimals } from './math';
import {
  GLOBAL_AUDIO_SEED_RANGES,
  type GlobalAudioSeedFieldKey,
} from '../data/globalAudioSeedRanges';
import type { GlobalAudioSettings } from '../types/globalAudio';
import { LFO_LANE_IDS, type BankLfoSettings, type LfoLaneId } from '../types/lfo';

// ========================================
// FUNCTIONS
// ========================================
// What a session payload does to the world-level values it captures. buildSessionPayload applies it to the live world;
// generateWorldSeedBaseline applies it to the seed, so an untouched world diffs to nothing against its own seed and its
// link is the bare triple.

/** One field onto its grid, anchored at its full range's min. quantizeToStep's result is exact (backlog 33). */
function snap(value: number, key: GlobalAudioSeedFieldKey, step: number): number {
  return quantizeToStep(value, GLOBAL_AUDIO_SEED_RANGES[key].min, step);
}

/** The Audio Rig with every slider-stepped field snapped to its step. The log-scale fields here (attack, release, both
 *  filters, the reverb's decay) have no step anywhere else, so this is where theirs is applied (backlog 33). */
export function quantizeGlobalAudioForCapture(
  globalAudio: GlobalAudioSettings
): GlobalAudioSettings {
  const { compressor, eq3, filterLPF, filterHPF, delay, reverb, limiter } = globalAudio;
  return {
    ...globalAudio,
    compressor: {
      threshold: snap(compressor.threshold, 'compressor.threshold', 1),
      ratio: snap(compressor.ratio, 'compressor.ratio', 1),
      attack: snap(compressor.attack, 'compressor.attack', 0.001),
      release: snap(compressor.release, 'compressor.release', 0.001),
      knee: snap(compressor.knee, 'compressor.knee', 1),
    },
    eq3: {
      low: snap(eq3.low, 'eq3.low', 0.5),
      mid: snap(eq3.mid, 'eq3.mid', 0.5),
      high: snap(eq3.high, 'eq3.high', 0.5),
    },
    filterLPF: {
      ...filterLPF,
      frequency: snap(filterLPF.frequency, 'filterLPF.frequency', 1),
      Q: snap(filterLPF.Q, 'filterLPF.Q', 0.01),
    },
    filterHPF: {
      ...filterHPF,
      frequency: snap(filterHPF.frequency, 'filterHPF.frequency', 1),
      Q: snap(filterHPF.Q, 'filterHPF.Q', 0.01),
    },
    delay: {
      ...delay,
      delayTime: snap(delay.delayTime, 'delay.delayTime', 0.001),
      feedback: snap(delay.feedback, 'delay.feedback', 0.01),
      wet: snap(delay.wet, 'delay.wet', 0.01),
    },
    reverb: {
      ...reverb,
      decay: snap(reverb.decay, 'reverb.decay', 0.01),
      preDelay: snap(reverb.preDelay, 'reverb.preDelay', 0.01),
      wet: snap(reverb.wet, 'reverb.wet', 0.01),
    },
    limiter: {
      threshold: snap(limiter.threshold, 'limiter.threshold', 1),
    },
  };
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
