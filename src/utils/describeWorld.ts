// ========================================
// IMPORTS
// ========================================
import { ASPECT_FAMILY_IDS, isAspectOf } from '../data/bands/aspects';
import { isThemeId } from '../data/bands/themes';
import { aspectName, themeName } from './loadingNames';
import type { WorldIdentity } from './seedBaseline';

// ========================================
// TYPES
// ========================================

/** What describeWorld reads: the seed and the plot, and the loading when the caller has it. Every caller in the app
 *  passes the loading; an identity without one reads as Classic with no picks. The key maps the names
 *  come from live in loadingNames.ts, shared with the off screen's rows and the detail screens' "loaded under" line. */
export type DescribedWorld = Pick<WorldIdentity, 'attenuationStyleName' | 'coordinates'> &
  Partial<Pick<WorldIdentity, 'theme' | 'aspects'>>;

// ========================================
// FUNCTIONS
// ========================================

/** `(x, y)`, or null for a plot that cannot be read: a hand-edited save reaches describeWorld unchecked
 *  (docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R30), and applying one with no plot keeps the loaded plot, so the world is
 *  named without one. `${-0}` is "0": a negative zero never shows a sign. */
function plotOf(coordinates: unknown): string | null {
  if (typeof coordinates !== 'object' || coordinates === null) return null;
  const { x, y } = coordinates as { x?: unknown; y?: unknown };
  return typeof x === 'number' && typeof y === 'number' ? `(${x}, ${y})` : null;
}

/**
 * One name for a world (docs/specs/OFF_SCREEN.md assumption 8): `AS · (x, y)` for a world that is nothing but its
 * seed, or `<label> · AS (x, y)` when a save or preset name fronts it; then the loading tail (assumption 17, band-table
 * T28) - ` · <Theme>` when the theme is not Classic, and ` · A + B` for each family's picks in the list's order - as in
 * `tr3nch-2 · (-30, -30) · Float · Hypnotic + Mechanical`. The off screen's Current
 * row, its readout and Foundry's status line all read this, so the three agree byte-for-byte. Pure - names and numbers
 * are data, the theme and aspect names come from content (labels), the punctuation is the only text here. An id the
 * content does not know (a stale payload), and a plot that cannot be read (plotOf), are left out rather than thrown on.
 */
export function describeWorld(identity: DescribedWorld, label?: string): string {
  const { attenuationStyleName, coordinates, theme = 'classic', aspects = {} } = identity;
  const plot = plotOf(coordinates);
  const head = label
    ? `${label} · ${attenuationStyleName}${plot === null ? '' : ` ${plot}`}`
    : `${attenuationStyleName}${plot === null ? '' : ` · ${plot}`}`;
  return withTail(head, describeLoading(theme, aspects));
}

/** `<name> · <tail>`, or the name alone for an empty tail: how describeWorld and the off screen's selected row join a
 *  loading tail on, so the punctuation lives here only. */
export function withTail(name: string, tail: string): string {
  return tail ? `${name} · ${tail}` : name;
}

/**
 * describeWorld's loading tail on its own: ` · `-joined, the theme's name when it is not Classic (or always, with
 * `nameTheme`), then each family's picks joined with ` + `, in family order; empty for Classic with no picks. The off
 * screen's selected row carries it after its own name when the live loading is not the row's, naming the theme whenever
 * it differs from the row's own, Classic included (docs/specs/OFF_SCREEN_CURRENT_AND_NEW_TRANSMISSION.md §1.3). An id
 * the content does not know is left out, as describeWorld leaves it out.
 */
export function describeLoading(
  theme: NonNullable<DescribedWorld['theme']>,
  aspects: NonNullable<DescribedWorld['aspects']>,
  { nameTheme = false }: { nameTheme?: boolean } = {}
): string {
  const tail: string[] = [];
  if ((nameTheme || theme !== 'classic') && isThemeId(theme)) tail.push(themeName(theme));
  for (const family of ASPECT_FAMILY_IDS) {
    const names = (aspects[family] ?? [])
      .filter((pick) => isAspectOf(family, pick))
      .map((pick) => aspectName(family, pick));
    if (names.length > 0) tail.push(names.join(' + '));
  }
  return tail.join(' · ');
}
