// ========================================
// IMPORTS
// ========================================
import type { BandKey, BandTable } from './bandKeys';

// ========================================
// IDS
// ========================================

/** The aspect families (docs/specs/OFF_SCREEN.md assumption 15), in family order: Melody, then Envelope and Distance
 *  (docs/tasks/OFF_SCREEN_REVISIONS.md Task 7, Crawford's note 3; the wireframe's Space became Distance in his answer 6),
 *  then Voice (revisions Task 10, through the waveform pick).
 *  A family is a key set and its options' columns; the deal (dealAspects.ts) seats one option per family per robot.
 *  Aspects are robot-side (spec §3): a family's keys are robot bands or sends, never `bpm` or a global row. */
export const ASPECT_FAMILY_IDS = ['melody', 'envelope', 'distance', 'voice'] as const;
export type AspectFamilyId = (typeof ASPECT_FAMILY_IDS)[number];

/** Each family's option ids in canonical option order (assumption 17): a family's row lists them so, and every pick list
 *  and link param is sorted so (canonicalPicks). The ids are code, unique across families; names and descriptions are
 *  content (`home.off.<family>.<id>`, `home.off.<family>Description.<id>`). A pick list holds its family's ids and
 *  nothing else: the "as theme" member is gone (revisions Task 6, Crawford's note 4) — an empty list is every robot as
 *  theme, and a stale `theme`, or another family's id, is dropped as any unknown id is. */
export const ASPECT_IDS_BY_FAMILY = {
  melody: ['hypnotic', 'mechanical', 'wandering'],
  envelope: ['plucked', 'swelling', 'held'],
  distance: ['near', 'far', 'remote'],
  voice: ['glassy', 'woody', 'hollow'],
} as const satisfies Record<AspectFamilyId, readonly string[]>;

/** One family's option ids. */
export type AspectIdOf<F extends AspectFamilyId> = (typeof ASPECT_IDS_BY_FAMILY)[F][number];
/** Any family's option id. A record keyed by family (a pick list, Robot.loadedUnder) holds only that family's ids, in
 *  its type too (FamilyAspects, FamilyPicks); the readers below still check membership, since a payload or a link is
 *  untrusted input. */
export type AspectId = AspectIdOf<AspectFamilyId>;
/** At most one aspect per family, each one of its own family's ids: what the deal seats on one robot (dealAspects.ts's
 *  RobotAspects, Robot.loadedUnder) and what that robot's bands resolve under (resolveBands). A family absent means as
 *  theme for that family (docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R15: `{ melody: 'plucked' }` does not compile). */
export type FamilyAspects = { [F in AspectFamilyId]?: AspectIdOf<F> };
/** A pick list per family, each list of its own family's ids: a world's loading (LoadingIdentity.aspects) and every copy
 *  of it - the payload, the link, a retransmit's input, the off screen's intent. */
export type FamilyPicks = { [F in AspectFamilyId]?: AspectIdOf<F>[] };

// ========================================
// FAMILIES
// ========================================

/** The four Melody keys an aspect may move (assumption 16). */
export const MELODY_BAND_KEYS = [
  'robot.rhythmicDensity',
  'robot.noteVariance',
  'robot.rhythmicMotifLength',
  'robot.pitchRepeat',
] as const;
export type MelodyBandKey = (typeof MELODY_BAND_KEYS)[number];

/** The six Envelope keys (revisions Task 7): the four stages and the two shaped stages. A shaped stage is drawn from its
 *  own band instead of the plain one (generateAudioAttributes), so an option that moves a stage moves its shaped band
 *  with it, or a curved robot would undo the option; the shaped stages' `lit` rides along. */
export const ENVELOPE_BAND_KEYS = [
  'robot.attack',
  'robot.decay',
  'robot.sustain',
  'robot.release',
  'robot.shapedAttack',
  'robot.shapedRelease',
] as const;
export type EnvelopeBandKey = (typeof ENVELOPE_BAND_KEYS)[number];

/** The two Distance keys (revisions Task 7): a robot's depth into the Reverb and the Delay - how far off it sounds. A
 *  room's own size (`reverb.decay`, `delay.delayTime`) is a global band, a theme's and never an aspect's (spec §3), so
 *  Distance sinks robots into the rooms but cannot lengthen them. Grit, Shimmer and Double stay the theme's. */
export const DISTANCE_BAND_KEYS = ['reverbSend', 'delaySend'] as const;
export type DistanceBandKey = (typeof DISTANCE_BAND_KEYS)[number];

/** The five Voice keys (revisions Task 10): the waveform pick (the base and the three layers draw it), the open and the
 *  accent bus filter with the accent's resonance, and the Coaxial / Harmonic layer gain. */
export const VOICE_BAND_KEYS = [
  'robot.waveform',
  'robot.filterFreq',
  'robot.accentFilterFreq',
  'robot.accentFilterQ',
  'robot.layerGain',
] as const;
export type VoiceBandKey = (typeof VOICE_BAND_KEYS)[number];

/** A family: its key set, and per option a column over those keys only. The option type is
 *  `Partial<Pick<BandTable, K>>`, so an aspect cannot reach outside its family (spec §1.5) and no conflict rule is
 *  needed; the option ids are the family's own. */
export interface AspectFamily<F extends AspectFamilyId, K extends BandKey> {
  readonly keys: readonly K[];
  readonly options: Readonly<Record<AspectIdOf<F>, Partial<Pick<BandTable, K>>>>;
}

/**
 * The families and their options' columns. Every number is a PLACEHOLDER until a listen sets it with Crawford.
 *
 * Melody (plan Task 34; Task 35's listen kept them) on assumption 16's sketch: Hypnotic is low variance (the toggle
 * always on, 1-2) at medium density (40-60), circling a note or two (a high pitch repeat); Mechanical is low variance
 * (1-3) at high density (70-95) with a long motif always on (6-8); Wandering is high variance (6-8) at low-medium density
 * (20-50) with the motif mostly off and little repeat.
 *
 * Envelope and Distance (docs/tasks/OFF_SCREEN_REVISIONS.md Task 7, for Task 11's listen): Plucked strikes at once (an
 * attack under 30 ms, its shaped band as short), decays fast to a low sustain and lets go quickly, the shaped shares up;
 * Swelling rises over 0.3-1.2 s, shaped or not, into a high sustain; Held starts promptly, sustains in full and rings
 * 0.8-2 s after, shaped or not. Near keeps both sends low and mostly unlit; Far sinks deep into the Reverb with little
 * Delay; Remote sinks deep into both.
 *
 * Voice (revisions Task 10, for the same listen): Glassy leans sine and triangle under an open cutoff, few dark accent
 * robots and quiet partials; Woody leans triangle and square under a lower cutoff with warm, mostly sounding layers;
 * Hollow leans square and pulse under a lower cutoff, with more robots on the resonant accent filter and a higher Q.
 *
 * Each column names only keys it moves, inside its family. resolveBands.test.ts pins the key sets, the bounds and the
 * intent.
 */
export const ASPECT_FAMILIES: {
  readonly melody: AspectFamily<'melody', MelodyBandKey>;
  readonly envelope: AspectFamily<'envelope', EnvelopeBandKey>;
  readonly distance: AspectFamily<'distance', DistanceBandKey>;
  readonly voice: AspectFamily<'voice', VoiceBandKey>;
} = {
  melody: {
    keys: MELODY_BAND_KEYS,
    options: {
      hypnotic: {
        'robot.rhythmicDensity': { min: 40, max: 60 },
        'robot.noteVariance': { offShare: 0, min: 1, max: 2 },
        'robot.pitchRepeat': { min: 50, max: 100 },
      },
      mechanical: {
        'robot.rhythmicDensity': { min: 70, max: 95 },
        'robot.noteVariance': { offShare: 0, min: 1, max: 3 },
        'robot.rhythmicMotifLength': { offShare: 0, min: 6, max: 8 },
        'robot.pitchRepeat': { min: 30, max: 70 },
      },
      wandering: {
        'robot.rhythmicDensity': { min: 20, max: 50 },
        'robot.noteVariance': { offShare: 0, min: 6, max: 8 },
        'robot.rhythmicMotifLength': { offShare: 0.85, min: 1, max: 8 },
        'robot.pitchRepeat': { min: 0, max: 30 },
      },
    },
  },
  envelope: {
    keys: ENVELOPE_BAND_KEYS,
    options: {
      plucked: {
        'robot.attack': { min: 0, max: 0.03 },
        'robot.decay': { min: 0.1, max: 0.6 },
        'robot.sustain': { min: 0, max: 0.25 },
        'robot.release': { min: 0.05, max: 0.4 },
        'robot.shapedAttack': { min: 0.005, max: 0.04, lit: 0.5 },
        'robot.shapedRelease': { min: 0.1, max: 0.4, lit: 0.6 },
      },
      swelling: {
        'robot.attack': { min: 0.3, max: 1.2 },
        'robot.sustain': { min: 0.7, max: 1 },
        'robot.shapedAttack': { min: 0.3, max: 1.2, lit: 0.4 },
      },
      held: {
        'robot.attack': { min: 0.02, max: 0.15 },
        'robot.sustain': { min: 0.9, max: 1 },
        'robot.release': { min: 0.8, max: 2 },
        'robot.shapedRelease': { min: 0.8, max: 2, lit: 0.275 },
      },
    },
  },
  distance: {
    keys: DISTANCE_BAND_KEYS,
    options: {
      near: {
        reverbSend: { min: 0, max: 0.1, lit: 0.3 },
        delaySend: { min: 0, max: 0.05, lit: 0.1 },
      },
      far: {
        reverbSend: { min: 0.45, max: 0.8, lit: 1 },
        delaySend: { min: 0, max: 0.1, lit: 0.3 },
      },
      remote: {
        reverbSend: { min: 0.65, max: 0.95, lit: 1 },
        delaySend: { min: 0.35, max: 0.6, lit: 1 },
      },
    },
  },
  voice: {
    keys: VOICE_BAND_KEYS,
    options: {
      glassy: {
        'robot.waveform': { weights: { sine: 4, square: 0.5, triangle: 4, sawtooth: 0.5, pulse: 1 } },
        'robot.filterFreq': { min: 5000, max: 9000 },
        'robot.accentFilterFreq': { min: 400, max: 2500, lit: 0.1 },
        'robot.layerGain': { min: 0.2, max: 0.5, lit: 0.3 },
      },
      woody: {
        'robot.waveform': { weights: { sine: 1, square: 3, triangle: 4, sawtooth: 1, pulse: 1 } },
        'robot.filterFreq': { min: 1200, max: 3500 },
        'robot.layerGain': { min: 0.6, max: 1, lit: 0.7 },
      },
      hollow: {
        'robot.waveform': { weights: { sine: 0.5, square: 4, triangle: 0.5, sawtooth: 1, pulse: 4 } },
        'robot.filterFreq': { min: 1500, max: 5000 },
        'robot.accentFilterFreq': { min: 600, max: 2000, lit: 0.45 },
        'robot.accentFilterQ': { min: 6, max: 12 },
      },
    },
  },
};

// ========================================
// FUNCTIONS
// ========================================

/** A family's picks in canonical order: its own option ids, in ASPECT_IDS_BY_FAMILY order (assumption 9). */
export function pickOrderOf<F extends AspectFamilyId>(family: F): AspectIdOf<F>[] {
  return [...ASPECT_IDS_BY_FAMILY[family]];
}

/** Whether `id` is one of `family`'s options - the membership a family-keyed record's readers check on untrusted input,
 *  where the type cannot vouch for the id. */
export function isAspectOf<F extends AspectFamilyId>(family: F, id: string): id is AspectIdOf<F> {
  return (ASPECT_IDS_BY_FAMILY[family] as readonly string[]).includes(id);
}

/** A pick list as the store, the payload and the link carry it (assumptions 9, 11): sorted into the family's canonical
 *  option order, deduped, unknown ids dropped - so the same set always reads and encodes one way. Takes any strings, so
 *  it is also where an untrusted list becomes the family's ids. A new array. */
export function canonicalPicks<F extends AspectFamilyId>(family: F, picks: readonly string[]): AspectIdOf<F>[] {
  const wanted = new Set<string>(picks);
  return pickOrderOf(family).filter((pick) => wanted.has(pick));
}

/** Every family's list canonical, with empty and unknown families dropped: one JSON shape for one set of picks, so a
 *  payload built from the store compares equal for equal worlds (Keep's dirty check, assumption 14) and a world with
 *  nothing picked — every robot as theme — is always `{}`. Each family's list is written by canonicalInto, typed by
 *  that family. */
export function canonicalAspects(aspects: Partial<Record<AspectFamilyId, readonly string[]>>): FamilyPicks {
  const out: FamilyPicks = {};
  for (const family of ASPECT_FAMILY_IDS) canonicalInto(out, family, aspects[family]);
  return out;
}

/** One family's list into `out`, canonical, when any pick survives. Generic in the family, with `out` mapped over that
 *  same key, so TypeScript sees the list written is that family's ids: the write a per-family type takes without a cast
 *  (a plain FamilyPicks would make `out[family]` every family's ids at once). */
function canonicalInto<F extends AspectFamilyId>(
  out: { [K in F]?: AspectIdOf<K>[] },
  family: F,
  picks: readonly string[] | undefined,
): void {
  if (!picks) return;
  const canonical = canonicalPicks(family, picks);
  if (canonical.length > 0) out[family] = canonical;
}
