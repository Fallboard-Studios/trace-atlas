// ========================================
// IMPORTS
// ========================================
// No store import, here or in anything below it: sessionShareUtils.ts (imported by two stores at module init) reaches
// this module through worldLink.ts, so a store import would cycle at boot (docs/specs/SHORT_WORLD_LINK.md risk 2).
import {
  generateGlobalAudioSettings,
  generateGlobalLfoLinks,
  generateHumanize,
  generateLfoBankSettings,
  generatePingVarianceAutomation,
  generateSwellDuration,
  generateSwellFrequency,
} from './globalAudioSeed';
import { generateAttenuationStyleBpm } from './bpmSeed';
import { evictAttenuationStyleNoiseMap } from './noiseMaps';
import type { GlobalAudioSettings } from '../types/globalAudio';
import type { BankLfoSettings, GlobalLfoTargetId, LfoLaneId, LfoLink } from '../types/lfo';

// ========================================
// TYPES
// ========================================

/** The world-level fields an Attenuation Style name regenerates on its own (docs/specs/SHORT_WORLD_LINK.md §1.2). */
export interface WorldSeedBaseline {
  /** generateGlobalAudioSettings; `compressorBeforeDelay` is the generator's default `false`. */
  globalAudio: GlobalAudioSettings;
  lfoBank: Record<LfoLaneId, BankLfoSettings>;
  globalLfoLinks: Record<GlobalLfoTargetId, LfoLink>;
  bpm: number;
  swellFrequency: number;
  swellDuration: number;
  humanize: number;
  pingVarianceAutomation: number;
}

// ========================================
// CONSTANTS
// ========================================

/** The noise-map cache key the baseline borrows. The id is only a cache key, the seed is the name alone, so the result
 *  equals what boot seeds for that name; the entry is evicted after every call (spec assumption 5, risk 6). */
const SCRATCH_ATTENUATION_STYLE_ID = '__world-link__';

// ========================================
// FUNCTIONS
// ========================================

/** Regenerate what a name seeds for the world: the Audio Rig, the LFO Bank, the global links and the pacing scalars,
 *  through the same pure generators boot uses. Reads no store. */
export function generateWorldSeedBaseline(attenuationStyleName: string): WorldSeedBaseline {
  const id = SCRATCH_ATTENUATION_STYLE_ID;
  try {
    return {
      globalAudio: generateGlobalAudioSettings(id, attenuationStyleName),
      lfoBank: generateLfoBankSettings(id, attenuationStyleName),
      globalLfoLinks: generateGlobalLfoLinks(id, attenuationStyleName),
      bpm: generateAttenuationStyleBpm(id, attenuationStyleName),
      swellFrequency: generateSwellFrequency(id, attenuationStyleName),
      swellDuration: generateSwellDuration(id, attenuationStyleName),
      humanize: generateHumanize(id, attenuationStyleName),
      pingVarianceAutomation: generatePingVarianceAutomation(id, attenuationStyleName),
    };
  } finally {
    // Even on a throw: a surviving scratch map would be handed to the next name that borrows the id.
    evictAttenuationStyleNoiseMap(id);
  }
}
