// ========================================
// IMPORTS
// ========================================
import { CLASSIC } from './classic';
import { THEMES, type ThemeId } from './themes';
import { ASPECT_FAMILIES, type AspectFamilyId, type AspectId, type FamilyAspects } from './aspects';
import type { BandTable } from './bandKeys';

// ========================================
// FUNCTIONS
// ========================================

/**
 * One column over a table: the column's bands replace the base's for the keys it names, whole band for whole band, and
 * every other key is the base's - replace, never widen (docs/specs/OFF_SCREEN.md §1.5). A column cannot name a key
 * outside the table or part of a band (it is a Partial<BandTable>), so there is no merge rule to get wrong. Pure: a new
 * table, the base untouched.
 */
export function overlayBands(base: BandTable, column: Partial<BandTable>): BandTable {
  return { ...base, ...column };
}

/**
 * Classic's bands, the theme's over them, each chosen aspect's over those - replace, never widen (spec §1.5, assumption
 * 15). PER ROBOT: at most one aspect per family, the one the deal gave this robot (assumptions 21-22). The loading
 * context installs resolveBands(theme, {}) for the world and the deal pass passes its own result explicitly, so aspects
 * never enter the context. An id the family does not have (another family's, a stale one) moves nothing (columnOf).
 * Plain data in, plain data out: no store is read here.
 */
export function resolveBands(theme: ThemeId, aspects: FamilyAspects): BandTable {
  let table = overlayBands(CLASSIC, THEMES[theme]);
  for (const [family, aspect] of Object.entries(aspects) as [AspectFamilyId, AspectId | undefined][]) {
    if (aspect === undefined) continue;
    const column = columnOf(family, aspect);
    if (column) table = overlayBands(table, column);
  }
  return table;
}

/** The column `aspect` moves in `family`, or undefined when the family has no such option: an aspect never reaches
 *  outside its family. The options are typed per family and the id arrives as every family's union
 *  (docs/tasks/OFF_SCREEN_REVISIONS.md Task 7), so the read widens the options rather than trusting the id. */
function columnOf(family: AspectFamilyId, aspect: AspectId): Partial<BandTable> | undefined {
  const options: Readonly<Record<string, Partial<BandTable> | undefined>> = ASPECT_FAMILIES[family].options;
  return options[aspect];
}
