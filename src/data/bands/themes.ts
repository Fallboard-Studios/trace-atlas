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

/**
 * A theme's column: a whole band for each key it moves and nothing for the rest; resolveBands overlays it on Classic,
 * replacing never widening (docs/specs/OFF_SCREEN.md §1.5). Any key of the band table, each of its own kind
 * (docs/specs/THEME_AND_ASPECTS_REFINEMENT.md §1.5, widening): the v1 ten-key list (OFF_SCREEN.md assumption 16) went
 * with the interview, since a theme is the world and the default probe guardrails alike. The type still holds two
 * lines - a key outside the table, or a band of the wrong kind, does not compile - and resolveBands.test.ts holds the
 * third, every band inside its field. A robot key a column names must also be compared and pushed when a theme
 * changes on a live world (aspectDeal.ts's movedFields, plan T6) before a column may name it.
 */
export type ThemeColumn = Partial<BandTable>;

/**
 * The theme columns. The numbers are the plan's Task 34 first cut, which Crawford's listen (docs/tasks/OFF_SCREEN.md
 * Task 35, 2026-10-31) kept as built: the table's shape is fixed by the spec, the numbers are tuning (assumption 16).
 * Each column names only keys it moves, still inside the old ten-key list until plan T8
 * (docs/tasks/THEME_AND_ASPECTS_REFINEMENT.md) replaces the five with the survivor columns, and reads as the theme's
 * sentence does (home.off.themeDescription.<id>): Calm slower, sparser and softer; Bold denser and sharper in a drier,
 * brighter room; Adventurous wider in every band it touches; Perilous the densest - fast, crowded and bright, hardly a
 * rest. Classic's column is `{}` by definition - Classic IS the lifted table (classic.ts, assumption 20).
 * resolveBands.test.ts pins each band's kind and bounds and the intent; the grids (docs/reference/GLOBAL_CHAIN_GRID.md,
 * ROBOT_DATA_GRID.md) carry the same numbers.
 */
export const THEMES: Record<ThemeId, ThemeColumn> = {
  classic: {},
  calm: {
    bpm: { min: 40, max: 70 },
    'robot.rhythmicDensity': { min: 0, max: 55 },
    'robot.rests': { min: 30, max: 70 },
    'robot.attack': { min: 0.15, max: 2 },
    'robot.release': { min: 0.4, max: 2 },
    reverbSend: { min: 0.3, max: 0.6, lit: 1 },
    delaySend: { min: 0.1, max: 0.3, lit: 0.75 },
    'filterLPF.frequency': { min: 2000, max: 9000 },
  },
  bold: {
    bpm: { min: 70, max: 110 },
    'robot.rhythmicDensity': { min: 40, max: 90 },
    'robot.rests': { min: 5, max: 35 },
    'robot.attack': { min: 0, max: 0.4 },
    'robot.release': { min: 0, max: 1 },
    'robot.shapedAttack': { min: 0.03, max: 0.12, lit: 0.4 },
    reverbSend: { min: 0.1, max: 0.35, lit: 1 },
    delaySend: { min: 0, max: 0.2, lit: 0.6 },
    'filterLPF.frequency': { min: 6000, max: 20000 },
  },
  adventurous: {
    bpm: { min: 40, max: 130 },
    'robot.rests': { min: 0, max: 80 },
    'robot.shapedAttack': { min: 0.03, max: 0.25, lit: 0.35 },
    'robot.shapedRelease': { min: 0.15, max: 0.8, lit: 0.4 },
    reverbSend: { min: 0.05, max: 0.8, lit: 1 },
    delaySend: { min: 0, max: 0.5, lit: 0.75 },
    'filterLPF.frequency': { min: 1000, max: 20000 },
  },
  perilous: {
    bpm: { min: 90, max: 140 },
    'robot.rhythmicDensity': { min: 70, max: 100 },
    'robot.rests': { min: 0, max: 20 },
    'robot.attack': { min: 0, max: 0.15 },
    'robot.release': { min: 0, max: 0.6 },
    'robot.shapedAttack': { min: 0.03, max: 0.1, lit: 0.5 },
    'robot.shapedRelease': { min: 0.15, max: 0.4, lit: 0.4 },
    reverbSend: { min: 0.05, max: 0.3, lit: 1 },
    delaySend: { min: 0, max: 0.15, lit: 0.5 },
    'filterLPF.frequency': { min: 8000, max: 20000 },
  },
};
