// ========================================
// IMPORTS
// ========================================
import type { BandTable } from './bandKeys';

// ========================================
// THEMES
// ========================================

/** The five theme ids (docs/specs/OFF_SCREEN.md assumption 17), Classic first - the order the Loading axis's theme row
 *  lists them. The ids are code; the names and one-line descriptions are content (`home.off.theme.<id>`,
 *  `home.off.themeDescription.<id>`), which the Guide will read too (§1.6). */
export const THEME_IDS = ['classic', 'calm', 'bold', 'adventurous', 'perilous'] as const;
export type ThemeId = (typeof THEME_IDS)[number];

/** Whether a value from outside the app - a payload, a link param - names a theme. */
export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && (THEME_IDS as readonly string[]).includes(value);
}

/** The bands a v1 theme column may move (spec assumption 16): the narrow first cut is this key list, not a rewrite.
 *  Widening it is an "ask first" (spec §3), so the type holds the line: a column naming any other key does not compile. */
export const THEME_BAND_KEYS = [
  'bpm',
  'robot.rhythmicDensity',
  'robot.rests',
  'robot.attack',
  'robot.release',
  'robot.shapedAttack',
  'robot.shapedRelease',
  'reverbSend',
  'delaySend',
  'filterLPF.frequency',
] as const;
export type ThemeBandKey = (typeof THEME_BAND_KEYS)[number];

/** A theme's column: a whole band for each key it moves and nothing for the rest; resolveBands overlays it on Classic,
 *  replacing never widening (spec §1.5). Themes are world-wide (spec §3): a column may name `bpm` and the global rows. */
export type ThemeColumn = Partial<Pick<BandTable, ThemeBandKey>>;

/**
 * The theme columns. Every value here is a placeholder until the listen (plan Task 34) sets it, so until then every
 * column is empty and every theme sounds Classic; the table's shape is fixed by the spec, the numbers are not
 * (assumption 16). Classic's column is `{}` by definition - Classic IS the lifted table (classic.ts, assumption 20).
 */
export const THEMES: Record<ThemeId, ThemeColumn> = {
  classic: {},
  calm: {},
  bold: {},
  adventurous: {},
  perilous: {},
};
