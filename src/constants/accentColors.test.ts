import { describe, it, expect } from 'vitest';
import { ACCENT_COLORS, ROBOT_IDENTITY_COLOR_NAMES, type AccentColorName } from './accentColors';

// The 21 hex values here are transcribed once from docs/reference/accent-colors.css (spec
// docs/specs/archive/COLOR_SCHEME_TRAIT_THEMING.md §1.1) — this test asserts the transcription is exact,
// byte-for-byte, against that same source, so the two never silently drift apart. emerald/indigo
// added later (Crawford's own request) to fill the 2 biggest hue-wheel gaps in the original 13
// hues — lime→green (~51°) and blue→plum (~50°) — and reused as the new Header trait pair.
// rosewood/dustyRose/burntOrange added later still, replacing tangerine/yellow's own too-intense
// Seed pairing and giving orange a second, deeper shade.
const EXPECTED_FROM_REFERENCE_CSS: Record<string, string> = {
  orange: '#da7e1b',
  red: '#cd5e57',
  pink: '#ae5378',
  purple: '#7a5484',
  plum: '#65617f',
  blue: '#4f6d7a',
  cyan: '#428d95',
  teal: '#41ad9f',
  green: '#68cb97',
  lime: '#a9e583',
  yellow: '#e9e377',
  tangerine: '#e2b149',
  beige: '#f7f5d3',
  emerald: '#4fc27a',
  indigo: '#5a5c9e',
  rosewood: '#914652',
  dustyRose: '#b67288',
  burntOrange: '#974820',
  black: '#120a03',
  white: '#fff',
  darkGray: '#211e1b',
};

describe('ACCENT_COLORS', () => {
  it('has exactly 21 keys', () => {
    expect(Object.keys(ACCENT_COLORS)).toHaveLength(21);
  });

  it('matches docs/reference/accent-colors.css byte-for-byte', () => {
    expect(ACCENT_COLORS).toEqual(EXPECTED_FROM_REFERENCE_CSS);
  });
});

describe('ROBOT_IDENTITY_COLOR_NAMES', () => {
  it('has exactly 18 entries', () => {
    expect(ROBOT_IDENTITY_COLOR_NAMES).toHaveLength(18);
  });

  it('includes emerald and indigo alongside the original 13 hues', () => {
    expect(ROBOT_IDENTITY_COLOR_NAMES).toContain('emerald');
    expect(ROBOT_IDENTITY_COLOR_NAMES).toContain('indigo');
  });

  it('includes rosewood, dustyRose, and burntOrange', () => {
    expect(ROBOT_IDENTITY_COLOR_NAMES).toContain('rosewood');
    expect(ROBOT_IDENTITY_COLOR_NAMES).toContain('dustyRose');
    expect(ROBOT_IDENTITY_COLOR_NAMES).toContain('burntOrange');
  });

  it('excludes black, white, and darkGray', () => {
    expect(ROBOT_IDENTITY_COLOR_NAMES).not.toContain('black');
    expect(ROBOT_IDENTITY_COLOR_NAMES).not.toContain('white');
    expect(ROBOT_IDENTITY_COLOR_NAMES).not.toContain('darkGray');
  });

  it('contains no duplicates', () => {
    expect(new Set(ROBOT_IDENTITY_COLOR_NAMES).size).toBe(18);
  });

  it('every entry is a real key of ACCENT_COLORS', () => {
    for (const name of ROBOT_IDENTITY_COLOR_NAMES) {
      expect(ACCENT_COLORS).toHaveProperty(name as AccentColorName);
    }
  });
});
