// ========================================
// IMPORTS
// ========================================
import type { BandKey, BandTable } from './bandKeys';

// ========================================
// IDS
// ========================================

/** The aspect families (docs/specs/OFF_SCREEN.md assumption 15): v1 has Melody alone; 'voice' | 'envelope' | 'space'
 *  are later families. A family is a key set and its options' columns; the deal (dealAspects.ts) seats one option per
 *  family per robot. Aspects are robot-side (spec §3): a family's keys are robot bands, never `bpm` or a global row. */
export const ASPECT_FAMILY_IDS = ['melody'] as const;
export type AspectFamilyId = (typeof ASPECT_FAMILY_IDS)[number];

/** The aspect option ids in canonical option order (assumption 17): the Melody row lists them so, and every pick list
 *  and link param is sorted so (canonicalPicks). The ids are code; names and descriptions are content
 *  (`home.off.aspect.melody.<id>`, `home.off.aspectDescription.melody.<id>`). */
export const ASPECT_IDS = ['hypnotic', 'mechanical', 'wandering'] as const;
export type AspectId = (typeof ASPECT_IDS)[number];

/** The selectable "as theme" member of a deal (assumption 21): a pick that leaves its groups plain, which is how a mixed
 *  fleet keeps robots loaded under the theme alone. Sorted first in a family's list (`melody=theme,wandering`). */
export const THEME_PICK = 'theme' as const;
/** What the Melody row's set holds: an aspect, or the as-theme member. */
export type AspectPick = AspectId | typeof THEME_PICK;

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

/** A family: its key set, and per option a column over those keys only. The option type is
 *  `Partial<Pick<BandTable, K>>`, so an aspect cannot reach outside its family (spec §1.5) and no conflict rule is
 *  needed. */
export interface AspectFamily<K extends BandKey> {
  readonly keys: readonly K[];
  readonly options: Readonly<Record<AspectId, Partial<Pick<BandTable, K>>>>;
}

/**
 * The families and their options' columns. Every number is a PLACEHOLDER (plan Task 34) until the listen (Task 35) sets
 * it with Crawford, on assumption 16's sketch: Hypnotic is low variance (the toggle always on, 1-2) at medium density
 * (40-60), circling a note or two (a high pitch repeat); Mechanical is low variance (1-3) at high density (70-95) with a
 * long motif always on (6-8); Wandering is high variance (6-8) at low-medium density (20-50) with the motif mostly off
 * and little repeat. Each column names only keys it moves, inside the family. resolveBands.test.ts pins the key set,
 * the bounds and the intent.
 */
export const ASPECT_FAMILIES: { readonly melody: AspectFamily<MelodyBandKey> } = {
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
};

// ========================================
// FUNCTIONS
// ========================================

/** A family's picks in canonical order: the as-theme member first, then its options in ASPECT_IDS order
 *  (assumption 9). */
export function pickOrderOf(family: AspectFamilyId): AspectPick[] {
  const options = ASPECT_FAMILIES[family].options;
  return [THEME_PICK, ...ASPECT_IDS.filter((id) => id in options)];
}

/** A pick list as the store, the payload and the link carry it (assumptions 9, 11): sorted into the family's canonical
 *  option order, deduped, unknown ids dropped - so the same set always reads and encodes one way. A new array. */
export function canonicalPicks(family: AspectFamilyId, picks: readonly AspectPick[]): AspectPick[] {
  const wanted = new Set<AspectPick>(picks);
  return pickOrderOf(family).filter((pick) => wanted.has(pick));
}

/** Every family's list canonical, with empty and unknown families dropped: one JSON shape for one set of picks, so a
 *  payload built from the store compares equal for equal worlds (Keep's dirty check, assumption 14) and an all-as-theme
 *  world is always `{}`. */
export function canonicalAspects(
  aspects: Partial<Record<AspectFamilyId, readonly AspectPick[]>>,
): Partial<Record<AspectFamilyId, AspectPick[]>> {
  const out: Partial<Record<AspectFamilyId, AspectPick[]>> = {};
  for (const family of ASPECT_FAMILY_IDS) {
    const picks = aspects[family];
    if (!picks) continue;
    const canonical = canonicalPicks(family, picks);
    if (canonical.length > 0) out[family] = canonical;
  }
  return out;
}
