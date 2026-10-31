// ========================================
// IMPORTS
// ========================================
import { ASPECT_FAMILY_IDS, THEME_PICK, type AspectFamilyId, type AspectId } from '../data/bands/aspects';
import type { ThemeId } from '../data/bands/themes';
import type { WorldIdentity } from './seedBaseline';
import { labels, type ContentKey } from '@/content';

// ========================================
// CONSTANTS
// ========================================

/** The one entry per theme id (docs/specs/OFF_SCREEN.md assumption 17), named here as literals so the content guard
 *  sees each read and the type sees every id. */
const THEME_NAME_KEY: Record<ThemeId, ContentKey> = {
  classic: 'home.off.theme.classic',
  calm: 'home.off.theme.calm',
  bold: 'home.off.theme.bold',
  adventurous: 'home.off.theme.adventurous',
  perilous: 'home.off.theme.perilous',
};

/** The one entry per aspect option, per family (the family is a key segment: the content grammar allows four). */
const ASPECT_NAME_KEY: Record<AspectFamilyId, Record<AspectId, ContentKey>> = {
  melody: {
    hypnotic: 'home.off.melody.hypnotic',
    mechanical: 'home.off.melody.mechanical',
    wandering: 'home.off.melody.wandering',
  },
};

// ========================================
// TYPES
// ========================================

/** What describeWorld reads: the seed and the plot, and the loading when the caller has it. A pick built from a bare
 *  name and plot (OffScreen's presets and saves until Task 30) carries none and reads as Classic with no picks. */
export type DescribedWorld = Pick<WorldIdentity, 'attenuationStyleName' | 'coordinates'> &
  Partial<Pick<WorldIdentity, 'theme' | 'aspects'>>;

// ========================================
// FUNCTIONS
// ========================================

/**
 * One name for a world (docs/specs/OFF_SCREEN.md assumption 8): `AS · (x, y)` for a world that is nothing but its
 * seed, or `<label> · AS (x, y)` when a save or preset name fronts it; then the loading tail (assumption 17, band-table
 * T28) - ` · <Theme>` when the theme is not Classic, and ` · A + B` for each family's picks in the list's order with
 * the as-theme member omitted - as in `tr3nch-2 · (-30, -30) · Calm · Hypnotic + Mechanical`. The off screen's Current
 * row, its readout and Foundry's status line all read this, so the three agree byte-for-byte. Pure - names and numbers
 * are data, the theme and aspect names come from content (labels), the punctuation is the only text here. An id the
 * content does not know (a stale payload) is left out rather than thrown on.
 */
export function describeWorld(identity: DescribedWorld, label?: string): string {
  const { attenuationStyleName, coordinates, theme = 'classic', aspects = {} } = identity;
  // `${-0}` is "0": a negative zero never shows a sign.
  const plot = `(${coordinates.x}, ${coordinates.y})`;
  const head = label ? `${label} · ${attenuationStyleName} ${plot}` : `${attenuationStyleName} · ${plot}`;
  const tail: string[] = [];
  if (theme !== 'classic' && theme in THEME_NAME_KEY) tail.push(labels(THEME_NAME_KEY[theme]).humanLabel);
  for (const family of ASPECT_FAMILY_IDS) {
    const names = (aspects[family] ?? [])
      .filter((pick): pick is AspectId => pick !== THEME_PICK && pick in ASPECT_NAME_KEY[family])
      .map((pick) => labels(ASPECT_NAME_KEY[family][pick]).humanLabel);
    if (names.length > 0) tail.push(names.join(' + '));
  }
  return [head, ...tail].join(' · ');
}
