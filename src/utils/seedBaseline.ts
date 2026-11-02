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
import { deepEqual } from './math';
import { quantizeGlobalAudioForCapture, roundLfoBankForCapture } from './sessionCapture';
import { withLoading } from '../data/bands/loadingContext';
import type { LoadingIdentity } from '../data/bands/loadingIdentity';
import type { GlobalAudioSettings } from '../types/globalAudio';
import {
  GLOBAL_LFO_TARGET_IDS,
  LFO_LANE_IDS,
  type BankLfoSettings,
  type GlobalLfoTargetId,
  type LfoLaneId,
  type LfoLink,
} from '../types/lfo';
import type { SessionPayload } from '../types/session';

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

/** What defines a world before anything is edited: the seed (the exact name), the plot, and its loading - the theme
 *  every band resolved under and each family's picks the deal seated (docs/specs/OFF_SCREEN.md assumption 10). */
export interface WorldIdentity extends LoadingIdentity {
  attenuationStyleName: string;
  coordinates: { x: number; y: number };
}

/** What the world baseline needs of an identity: the seed and the loading (the plot seeds nothing world-level). */
export type WorldSeedIdentity = Pick<WorldIdentity, 'attenuationStyleName' | 'theme' | 'aspects'>;

/** Only what differs from the seed (spec assumption 4): whole Audio Rig blocks, whole lanes, whole links, single pacing
 *  scalars, and the robot and company diffs as buildSessionPayload already wrote them. A key is absent when its value
 *  equals the seed's, never present with `undefined`. */
export interface WorldDiff {
  globalAudio?: Partial<GlobalAudioSettings>;
  lfoBank?: Partial<Record<LfoLaneId, BankLfoSettings>>;
  globalLfoLinks?: Partial<Record<GlobalLfoTargetId, LfoLink>>;
  bpm?: number;
  swellFrequency?: number;
  swellDuration?: number;
  humanize?: number;
  pingVarianceAutomation?: number;
  robotOverrides?: SessionPayload['robotOverrides'];
  companyDiffs?: SessionPayload['companyDiffs'];
  userCreatedCompanies?: SessionPayload['userCreatedCompanies'];
}

// ========================================
// CONSTANTS
// ========================================

/** The pacing scalars, each compared and filled on its own. */
const PACING_KEYS = [
  'bpm',
  'swellFrequency',
  'swellDuration',
  'humanize',
  'pingVarianceAutomation',
] as const;

/** The noise-map cache key the baseline borrows. The id is only a cache key, the seed is the name alone, so the result
 *  equals what boot seeds for that name; the entry is evicted after every call (spec assumption 5, risk 6). */
const SCRATCH_ATTENUATION_STYLE_ID = '__world-link__';

// ========================================
// FUNCTIONS
// ========================================

/** Regenerate what a name seeds for the world, as a save would capture it untouched: the Audio Rig, the LFO Bank, the
 *  global links and the pacing scalars, through the same pure generators boot uses, then the rig and the lanes through
 *  the capture step buildSessionPayload applies (sessionCapture.ts). Without that step every seeded value off a slider
 *  step would read as an edit, and no untouched world would copy its bare triple. Generated inside the identity's own
 *  theme bands (withLoading, docs/specs/OFF_SCREEN.md assumption 15), so a Calm world is never read against Classic's
 *  baseline - which would make every seeded value an override - and the loaded world's bands are back in place after;
 *  the aspects seed nothing world-level. Reads no store. */
export function generateWorldSeedBaseline(identity: WorldSeedIdentity): WorldSeedBaseline {
  const id = SCRATCH_ATTENUATION_STYLE_ID;
  const { attenuationStyleName } = identity;
  try {
    return withLoading(identity, () => ({
      globalAudio: quantizeGlobalAudioForCapture(
        generateGlobalAudioSettings(id, attenuationStyleName)
      ),
      lfoBank: roundLfoBankForCapture(generateLfoBankSettings(id, attenuationStyleName)),
      globalLfoLinks: generateGlobalLfoLinks(id, attenuationStyleName),
      bpm: generateAttenuationStyleBpm(id, attenuationStyleName),
      swellFrequency: generateSwellFrequency(id, attenuationStyleName),
      swellDuration: generateSwellDuration(id, attenuationStyleName),
      humanize: generateHumanize(id, attenuationStyleName),
      pingVarianceAutomation: generatePingVarianceAutomation(id, attenuationStyleName),
    }));
  } finally {
    // Even on a throw: a surviving scratch map would be handed to the next name that borrows the id.
    evictAttenuationStyleNoiseMap(id);
  }
}

/** The entries of `live` that differ from `seed`, each kept whole; undefined when none does. */
function differingEntries<K extends string, V>(
  keys: readonly K[],
  live: Partial<Record<K, V>> | undefined,
  seed: Record<K, V>
): Partial<Record<K, V>> | undefined {
  if (live === undefined) return undefined;
  const changed: Partial<Record<K, V>> = {};
  for (const key of keys) {
    const value = live[key];
    if (value !== undefined && !deepEqual(value, seed[key])) changed[key] = value;
  }
  return Object.keys(changed).length > 0 ? changed : undefined;
}

/**
 * Only what a payload changed against its seed (spec assumption 4). `globalAudio` per top-level key, a whole effect
 * block whenever any leaf differs (so a block that lost its `sync` travels whole; `compressorBeforeDelay` is one such key,
 * against the generator's `false`); `lfoBank` per lane; `globalLfoLinks` per target; each pacing scalar on its own. The
 * robot and company diffs are already differences against the roster (buildSessionPayload) and are copied when non-empty.
 * An empty object when nothing differs.
 */
export function diffWorldAgainstSeed(
  payload: SessionPayload,
  baseline: WorldSeedBaseline
): WorldDiff {
  const diff: WorldDiff = {};
  const blockKeys = Object.keys(payload.globalAudio) as (keyof GlobalAudioSettings)[];
  // The helper sees GlobalAudioSettings as a record of a union; each entry is copied under its own key, so the cast holds.
  const globalAudio = differingEntries(blockKeys, payload.globalAudio, baseline.globalAudio) as
    | Partial<GlobalAudioSettings>
    | undefined;
  if (globalAudio) diff.globalAudio = globalAudio;
  const lfoBank = differingEntries(LFO_LANE_IDS, payload.lfoBank, baseline.lfoBank);
  if (lfoBank) diff.lfoBank = lfoBank;
  const links = differingEntries(
    GLOBAL_LFO_TARGET_IDS,
    payload.globalLfoLinks,
    baseline.globalLfoLinks
  );
  if (links) diff.globalLfoLinks = links;
  for (const key of PACING_KEYS) {
    const value = payload[key];
    if (value !== undefined && value !== baseline[key]) diff[key] = value;
  }
  if (Object.keys(payload.robotOverrides).length > 0) diff.robotOverrides = payload.robotOverrides;
  if (Object.keys(payload.companyDiffs).length > 0) diff.companyDiffs = payload.companyDiffs;
  if (payload.userCreatedCompanies.length > 0)
    diff.userCreatedCompanies = payload.userCreatedCompanies;
  return diff;
}

/**
 * A whole payload: the identity - the seed, the plot and the loading (version 3, OFF_SCREEN.md assumption 10) - then
 * every world-level field from the diff where it carries one, else the seed's (spec assumption 6 — applySessionPayload
 * never sees a partial lfoBank, so it never backfills from DEFAULT_BANK_LFO). Shallow spreads only: a block, a lane or
 * a link in the diff replaces the seed's whole, never deep-merged inside (withGlobalAudioDefaults' "blocks are whole"
 * rule, spec assumption 4), so one that lost its `sync` stays without it.
 */
export function fillWorldFromSeed(
  identity: WorldIdentity,
  diff: WorldDiff,
  baseline: WorldSeedBaseline
): SessionPayload {
  return {
    version: 3,
    attenuationStyleName: identity.attenuationStyleName,
    coordinates: { x: identity.coordinates.x, y: identity.coordinates.y },
    theme: identity.theme,
    aspects: identity.aspects,
    globalAudio: { ...baseline.globalAudio, ...diff.globalAudio },
    lfoBank: { ...baseline.lfoBank, ...diff.lfoBank },
    globalLfoLinks: { ...baseline.globalLfoLinks, ...diff.globalLfoLinks },
    bpm: diff.bpm ?? baseline.bpm,
    swellFrequency: diff.swellFrequency ?? baseline.swellFrequency,
    swellDuration: diff.swellDuration ?? baseline.swellDuration,
    humanize: diff.humanize ?? baseline.humanize,
    pingVarianceAutomation: diff.pingVarianceAutomation ?? baseline.pingVarianceAutomation,
    robotOverrides: diff.robotOverrides ?? {},
    companyDiffs: diff.companyDiffs ?? {},
    userCreatedCompanies: diff.userCreatedCompanies ?? [],
  };
}
