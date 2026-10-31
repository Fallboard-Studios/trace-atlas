// ========================================
// IMPORTS
// ========================================
import { ASPECT_FAMILY_IDS, isAspectOf } from '../data/bands/aspects';
import { THEME_NAME_KEY, aspectName, themeName } from './loadingNames';
import type { WorldIdentity } from './seedBaseline';

// ========================================
// TYPES
// ========================================

/** What describeWorld reads: the seed and the plot, and the loading when the caller has it. A caller with a bare name
 *  and plot (Foundry's status line until Task 33) carries none and reads as Classic with no picks. The key maps the names
 *  come from live in loadingNames.ts, shared with the off screen's rows and the detail screens' "loaded under" line. */
export type DescribedWorld = Pick<WorldIdentity, 'attenuationStyleName' | 'coordinates'> &
  Partial<Pick<WorldIdentity, 'theme' | 'aspects'>>;

// ========================================
// FUNCTIONS
// ========================================

/**
 * One name for a world (docs/specs/OFF_SCREEN.md assumption 8): `AS · (x, y)` for a world that is nothing but its
 * seed, or `<label> · AS (x, y)` when a save or preset name fronts it; then the loading tail (assumption 17, band-table
 * T28) - ` · <Theme>` when the theme is not Classic, and ` · A + B` for each family's picks in the list's order - as in
 * `tr3nch-2 · (-30, -30) · Calm · Hypnotic + Mechanical`. The off screen's Current
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
  if (theme !== 'classic' && theme in THEME_NAME_KEY) tail.push(themeName(theme));
  for (const family of ASPECT_FAMILY_IDS) {
    const names = (aspects[family] ?? [])
      .filter((pick) => isAspectOf(family, pick))
      .map((pick) => aspectName(family, pick));
    if (names.length > 0) tail.push(names.join(' + '));
  }
  return [head, ...tail].join(' · ');
}
