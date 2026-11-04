// ========================================
// IMPORTS
// ========================================
import { ASPECT_FAMILY_IDS, isAspectOf, type AspectFamilyId, type AspectId, type AspectIdOf, type FamilyAspects } from '../data/bands/aspects';
import type { ThemeId } from '../data/bands/themes';
import { labels, type ContentKey, type SchemaLabels } from '@/content';

// ========================================
// KEY MAPS
// ========================================

/** The one entry per theme id (docs/specs/OFF_SCREEN.md assumption 17), named here as literals so the content guard
 *  (src/content/content.test.ts) sees each read and the type sees every id. The ids are code; the words are content. */
const THEME_NAME_KEY: Record<ThemeId, ContentKey> = {
  classic: 'home.off.theme.classic',
  float: 'home.off.theme.float',
  anchor: 'home.off.theme.anchor',
  shatter: 'home.off.theme.shatter',
  undertow: 'home.off.theme.undertow',
  trench: 'home.off.theme.trench',
  tidepool: 'home.off.theme.tidepool',
  floe: 'home.off.theme.floe',
  thicket: 'home.off.theme.thicket',
  wreck: 'home.off.theme.wreck',
  openWater: 'home.off.theme.openWater',
  ventField: 'home.off.theme.ventField',
  beacon: 'home.off.theme.beacon',
  polarLow: 'home.off.theme.polarLow',
};

/** One sentence per theme (assumption 17; §1.6 the Guide's part): the line under the off screen's theme row
 *  (docs/tasks/OFF_SCREEN.md Task 30), and the entry the Guide's Themes page will read. */
const THEME_DESCRIPTION_KEY: Record<ThemeId, ContentKey> = {
  classic: 'home.off.themeDescription.classic',
  float: 'home.off.themeDescription.float',
  anchor: 'home.off.themeDescription.anchor',
  shatter: 'home.off.themeDescription.shatter',
  undertow: 'home.off.themeDescription.undertow',
  trench: 'home.off.themeDescription.trench',
  tidepool: 'home.off.themeDescription.tidepool',
  floe: 'home.off.themeDescription.floe',
  thicket: 'home.off.themeDescription.thicket',
  wreck: 'home.off.themeDescription.wreck',
  openWater: 'home.off.themeDescription.openWater',
  ventField: 'home.off.themeDescription.ventField',
  beacon: 'home.off.themeDescription.beacon',
  polarLow: 'home.off.themeDescription.polarLow',
};

/** The one entry per aspect option, per family, each family's map over its own ids. The family is a key segment (the
 *  content grammar allows four): `home.off.melody.<id>`, not the spec's `home.off.aspect.melody.<id>` (band-table T28).
 *  Envelope and Distance joined at docs/tasks/OFF_SCREEN_REVISIONS.md Task 7, Motion and Performance at
 *  docs/tasks/THEME_AND_ASPECTS_REFINEMENT.md T7b. */
const ASPECT_NAME_KEY: { readonly [F in AspectFamilyId]: Readonly<Record<AspectIdOf<F>, ContentKey>> } = {
  melody: {
    hypnotic: 'home.off.melody.hypnotic',
    mechanical: 'home.off.melody.mechanical',
    wandering: 'home.off.melody.wandering',
    chanting: 'home.off.melody.chanting',
    tumbling: 'home.off.melody.tumbling',
    telegraph: 'home.off.melody.telegraph',
  },
  envelope: {
    plucked: 'home.off.envelope.plucked',
    swelling: 'home.off.envelope.swelling',
    held: 'home.off.envelope.held',
    bowed: 'home.off.envelope.bowed',
    hammered: 'home.off.envelope.hammered',
    breathing: 'home.off.envelope.breathing',
  },
  distance: {
    near: 'home.off.distance.near',
    echoing: 'home.off.distance.echoing',
    halfHeard: 'home.off.distance.halfHeard',
  },
  voice: {
    glassy: 'home.off.voice.glassy',
    woody: 'home.off.voice.woody',
    hollow: 'home.off.voice.hollow',
    brassy: 'home.off.voice.brassy',
    muted: 'home.off.voice.muted',
    chiming: 'home.off.voice.chiming',
  },
  motion: {
    gliding: 'home.off.motion.gliding',
    trembling: 'home.off.motion.trembling',
    sweeping: 'home.off.motion.sweeping',
  },
  performance: {
    steady: 'home.off.performance.steady',
    dramatic: 'home.off.performance.dramatic',
    halting: 'home.off.performance.halting',
  },
};

/** A family's label: the heading of its row on the off screen (docs/tasks/OFF_SCREEN.md Task 31). */
const ASPECT_FAMILY_LABEL_KEY: Record<AspectFamilyId, ContentKey> = {
  melody: 'home.off.melody',
  envelope: 'home.off.envelope',
  distance: 'home.off.distance',
  voice: 'home.off.voice',
  motion: 'home.off.motion',
  performance: 'home.off.performance',
};

/** One sentence per option, per family, and the family's own for a row with nothing on (`none`) — the line under a
 *  family's row shows the described aspect's, or the `none` sentence when no aspect is on (Task 31; the as-theme member
 *  and its sentence are gone, docs/tasks/OFF_SCREEN_REVISIONS.md Task 6); the Guide's page reads the same entries
 *  (§1.6). */
const ASPECT_DESCRIPTION_KEY: {
  readonly [F in AspectFamilyId]: Readonly<Record<AspectIdOf<F> | 'none', ContentKey>>;
} = {
  melody: {
    none: 'home.off.melodyDescription.none',
    hypnotic: 'home.off.melodyDescription.hypnotic',
    mechanical: 'home.off.melodyDescription.mechanical',
    wandering: 'home.off.melodyDescription.wandering',
    chanting: 'home.off.melodyDescription.chanting',
    tumbling: 'home.off.melodyDescription.tumbling',
    telegraph: 'home.off.melodyDescription.telegraph',
  },
  envelope: {
    none: 'home.off.envelopeDescription.none',
    plucked: 'home.off.envelopeDescription.plucked',
    swelling: 'home.off.envelopeDescription.swelling',
    held: 'home.off.envelopeDescription.held',
    bowed: 'home.off.envelopeDescription.bowed',
    hammered: 'home.off.envelopeDescription.hammered',
    breathing: 'home.off.envelopeDescription.breathing',
  },
  distance: {
    none: 'home.off.distanceDescription.none',
    near: 'home.off.distanceDescription.near',
    echoing: 'home.off.distanceDescription.echoing',
    halfHeard: 'home.off.distanceDescription.halfHeard',
  },
  voice: {
    none: 'home.off.voiceDescription.none',
    glassy: 'home.off.voiceDescription.glassy',
    woody: 'home.off.voiceDescription.woody',
    hollow: 'home.off.voiceDescription.hollow',
    brassy: 'home.off.voiceDescription.brassy',
    muted: 'home.off.voiceDescription.muted',
    chiming: 'home.off.voiceDescription.chiming',
  },
  motion: {
    none: 'home.off.motionDescription.none',
    gliding: 'home.off.motionDescription.gliding',
    trembling: 'home.off.motionDescription.trembling',
    sweeping: 'home.off.motionDescription.sweeping',
  },
  performance: {
    none: 'home.off.performanceDescription.none',
    steady: 'home.off.performanceDescription.steady',
    dramatic: 'home.off.performanceDescription.dramatic',
    halting: 'home.off.performanceDescription.halting',
  },
};

/** A family's map read by any aspect id: the maps are typed per family, the ids arrive as every family's union, so the
 *  read widens the map rather than trusting the id - callers check membership first (isAspectOf). */
function keyIn(map: Readonly<Record<string, ContentKey>>, id: string): ContentKey {
  return map[id];
}

// ========================================
// FUNCTIONS
// ========================================

/** A family's label pair, spread into its row's schema. */
export function familyLabels(family: AspectFamilyId): SchemaLabels {
  return labels(ASPECT_FAMILY_LABEL_KEY[family]);
}

/** An aspect's one-line description, from content — or, for null (nothing on in the family's row), the family's own
 *  sentence: every robot takes this family from the theme. */
export function aspectDescription(family: AspectFamilyId, id: AspectId | null): string {
  return labels(keyIn(ASPECT_DESCRIPTION_KEY[family], id ?? 'none')).humanLabel;
}

/** What a robot was loaded under (Robot.loadedUnder, written by the deal pass — docs/specs/OFF_SCREEN.md assumption
 *  22), as the detail screens' readout says it (assumption 24; docs/tasks/OFF_SCREEN.md Task 32): the dealt aspects'
 *  names in family order, joined with ` + ` as describeWorld joins a family's picks; null for an absent or empty record
 *  (a robot loaded as the theme) and for an id the content does not know (a stale save), so the line is left out
 *  rather than shown blank. */
export function describeLoadedUnder(loadedUnder: FamilyAspects | undefined): string | null {
  if (!loadedUnder) return null;
  const names = ASPECT_FAMILY_IDS.flatMap((family) => {
    const id = loadedUnder[family];
    return id !== undefined && isAspectOf(family, id) ? [aspectName(family, id)] : [];
  });
  return names.length > 0 ? names.join(' + ') : null;
}

/** A theme's name, from content. */
export function themeName(id: ThemeId): string {
  return labels(THEME_NAME_KEY[id]).humanLabel;
}

/** A theme's one-line description, from content. */
export function themeDescription(id: ThemeId): string {
  return labels(THEME_DESCRIPTION_KEY[id]).humanLabel;
}

/** An aspect option's name, from content. `id` must be one of `family`'s (isAspectOf). */
export function aspectName(family: AspectFamilyId, id: AspectId): string {
  return labels(keyIn(ASPECT_NAME_KEY[family], id)).humanLabel;
}
