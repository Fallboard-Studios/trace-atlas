// ========================================
// IMPORTS
// ========================================
import { CLASSIC } from './classic';
import type { BandKey, BandTable } from './bandKeys';

// ========================================
// STUBS (Task 19 moves these into themes.ts and aspects.ts)
// ========================================

/** The theme ids. Task 19 names the five; until then only Classic exists. */
export type ThemeId = 'classic';
/** The aspect family and option ids. Task 19 names them; loose until then, so the resolver's loop types over an empty
 *  table (no family has an option yet). */
export type AspectFamilyId = string;
export type AspectId = string;

const THEMES: Record<ThemeId, Partial<BandTable>> = { classic: {} };
const ASPECT_FAMILIES: Record<AspectFamilyId, { keys: readonly BandKey[]; options: Record<AspectId, Partial<BandTable>> }> = {};

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
 * never enter the context. Plain data in, plain data out: no store is read here.
 */
export function resolveBands(theme: ThemeId, aspects: Partial<Record<AspectFamilyId, AspectId>>): BandTable {
  let table = overlayBands(CLASSIC, THEMES[theme]);
  for (const [family, aspect] of Object.entries(aspects) as [AspectFamilyId, AspectId | undefined][]) {
    if (aspect === undefined) continue;
    table = overlayBands(table, ASPECT_FAMILIES[family].options[aspect]);
  }
  return table;
}
