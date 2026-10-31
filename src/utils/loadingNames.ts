// ========================================
// IMPORTS
// ========================================
import type { AspectFamilyId, AspectId } from '../data/bands/aspects';
import type { ThemeId } from '../data/bands/themes';
import { labels, type ContentKey } from '@/content';

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

// ========================================
// FUNCTIONS
// ========================================

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
