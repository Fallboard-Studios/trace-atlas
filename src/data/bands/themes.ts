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
 * The theme columns. Every number here is a PLACEHOLDER (plan Task 34) until the listen (Task 35) sets it with Crawford:
 * the table's shape is fixed by the spec, the numbers are not (assumption 16). Each column names only keys it moves, on
 * the v1 key list, and reads as the theme's sentence does (home.off.themeDescription.<id>): Calm slower, sparser and
 * softer; Bold denser and sharper in a drier, brighter room; Adventurous wider in every band it touches; Perilous the
 * densest - fast, crowded and bright, hardly a rest. Classic's column is `{}` by definition - Classic IS the lifted table
 * (classic.ts, assumption 20). resolveBands.test.ts pins the key list, the bounds and the intent; the grids
 * (docs/reference/GLOBAL_CHAIN_GRID.md, ROBOT_DATA_GRID.md) gain the agreed numbers at Task 35.
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
