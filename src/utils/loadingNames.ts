// ========================================
// IMPORTS
// ========================================
import type { AspectFamilyId, AspectId, AspectPick } from '../data/bands/aspects';
import type { ThemeId } from '../data/bands/themes';
import { labels, type ContentKey, type SchemaLabels } from '@/content';

// ========================================
// KEY MAPS
// ========================================

/** The one entry per theme id (docs/specs/OFF_SCREEN.md assumption 17), named here as literals so the content guard
 *  (src/content/content.test.ts) sees each read and the type sees every id. The ids are code; the words are content. */
export const THEME_NAME_KEY: Record<ThemeId, ContentKey> = {
  classic: 'home.off.theme.classic',
  calm: 'home.off.theme.calm',
  bold: 'home.off.theme.bold',
  adventurous: 'home.off.theme.adventurous',
  perilous: 'home.off.theme.perilous',
};

/** One sentence per theme (assumption 17; §1.6 the Guide's part): the line under the off screen's theme row
 *  (docs/tasks/OFF_SCREEN.md Task 30), and the entry the Guide's Themes page will read. */
export const THEME_DESCRIPTION_KEY: Record<ThemeId, ContentKey> = {
  classic: 'home.off.themeDescription.classic',
  calm: 'home.off.themeDescription.calm',
  bold: 'home.off.themeDescription.bold',
  adventurous: 'home.off.themeDescription.adventurous',
  perilous: 'home.off.themeDescription.perilous',
};

/** The one entry per aspect option, per family. The family is a key segment (the content grammar allows four):
 *  `home.off.melody.<id>`, not the spec's `home.off.aspect.melody.<id>` (band-table T28). */
export const ASPECT_NAME_KEY: Record<AspectFamilyId, Record<AspectId, ContentKey>> = {
  melody: {
    hypnotic: 'home.off.melody.hypnotic',
    mechanical: 'home.off.melody.mechanical',
    wandering: 'home.off.melody.wandering',
  },
};

/** A family's label: the heading of its row on the off screen (docs/tasks/OFF_SCREEN.md Task 31). */
export const ASPECT_FAMILY_LABEL_KEY: Record<AspectFamilyId, ContentKey> = {
  melody: 'home.off.melody',
};

/** The as-theme member's label (assumption 21): the same words at the head of every family's row. */
export const AS_THEME_LABEL_KEY: ContentKey = 'home.off.asTheme';

/** One sentence per pick, per family, the as-theme member's included — the line under a family's row shows the
 *  described aspect's, or the as-theme sentence when no aspect is on (Task 31); the Guide's page reads the same
 *  entries (§1.6). */
export const ASPECT_DESCRIPTION_KEY: Record<AspectFamilyId, Record<AspectPick, ContentKey>> = {
  melody: {
    theme: 'home.off.melodyDescription.theme',
    hypnotic: 'home.off.melodyDescription.hypnotic',
    mechanical: 'home.off.melodyDescription.mechanical',
    wandering: 'home.off.melodyDescription.wandering',
  },
};

// ========================================
// FUNCTIONS
// ========================================

/** A family's label pair, spread into its row's schema. */
export function familyLabels(family: AspectFamilyId): SchemaLabels {
  return labels(ASPECT_FAMILY_LABEL_KEY[family]);
}

/** The as-theme member's name, from content. */
export function asThemeLabel(): string {
  return labels(AS_THEME_LABEL_KEY).humanLabel;
}

/** A pick's one-line description, from content — the as-theme sentence for the as-theme member. */
export function aspectDescription(family: AspectFamilyId, pick: AspectPick): string {
  return labels(ASPECT_DESCRIPTION_KEY[family][pick]).humanLabel;
}

/** A theme's name, from content. */
export function themeName(id: ThemeId): string {
  return labels(THEME_NAME_KEY[id]).humanLabel;
}

/** A theme's one-line description, from content. */
export function themeDescription(id: ThemeId): string {
  return labels(THEME_DESCRIPTION_KEY[id]).humanLabel;
}

/** An aspect option's name, from content. */
export function aspectName(family: AspectFamilyId, id: AspectId): string {
  return labels(ASPECT_NAME_KEY[family][id]).humanLabel;
}
