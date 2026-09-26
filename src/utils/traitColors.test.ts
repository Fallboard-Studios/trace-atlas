import { describe, it, expect } from 'vitest';
import { TRAIT_COLORS, getTraitColorStyle, getRobotColorStyle, getDisabledTraitColorStyle, relativeLuminance, desaturateHex } from './traitColors';
import { ACCENT_COLORS } from '@/constants/accentColors';
import { TRAIT_IDS } from '@/types/traits';

describe('TRAIT_COLORS', () => {
  it('has exactly one entry per TRAIT_IDS member', () => {
    expect(Object.keys(TRAIT_COLORS).sort()).toEqual([...TRAIT_IDS].sort());
  });

  it('matches the confirmed pairs exactly', () => {
    expect(TRAIT_COLORS.spectral).toEqual([ACCENT_COLORS.cyan, ACCENT_COLORS.indigo]);
    expect(TRAIT_COLORS.timeSpace).toEqual([ACCENT_COLORS.purple, ACCENT_COLORS.pink]);
    expect(TRAIT_COLORS.output).toEqual([ACCENT_COLORS.burntOrange, ACCENT_COLORS.orange]);
    expect(TRAIT_COLORS.composition).toEqual([ACCENT_COLORS.emerald, ACCENT_COLORS.lime]);
    expect(TRAIT_COLORS.company).toEqual([ACCENT_COLORS.blue, ACCENT_COLORS.plum]);
    expect(TRAIT_COLORS.seed).toEqual([ACCENT_COLORS.rosewood, ACCENT_COLORS.dustyRose]);
    expect(TRAIT_COLORS.header).toEqual([ACCENT_COLORS.teal, ACCENT_COLORS.green]);
  });

  it('every pair is 2 distinct colors, never a trait paired with itself', () => {
    for (const trait of TRAIT_IDS) {
      const [a, b] = TRAIT_COLORS[trait];
      expect(a).not.toBe(b);
    }
  });

  it('never uses the reserved beige swatch in any pair', () => {
    for (const trait of TRAIT_IDS) {
      expect(TRAIT_COLORS[trait]).not.toContain(ACCENT_COLORS.beige);
    }
  });
});

// Bug fix, found live via browser DevTools (not caught by jsdom, which never resolves real CSS
// cascade/color-mix()): --color-accent/--color-accent-gradient must NOT be declared as a nested
// var()-derivation of --color-accent-a/-b (e.g. `linear-gradient(var(--color-accent-a), ...)`).
// Confirmed empirically: overriding --color-accent-a/-b on a descendant DOES cascade correctly to
// that subtree (verified directly in DevTools' own "Inherited from" breakdown), but a DIFFERENT
// custom property whose OWN specified value nests var() references to them does NOT get
// re-substituted using the local override — it stays pinned to whatever --color-accent-a/-b
// resolved to whenever that outer property was first read. All 4 properties must therefore be
// computed with LITERAL color values baked directly into the color-mix()/linear-gradient() calls,
// at the exact point --color-accent-a/-b are being scoped — never through a second layer of
// custom-property indirection. See docs/specs/COLOR_SCHEME_TRAIT_THEMING.md §1.2's amendment.
describe('getTraitColorStyle', () => {
  it('returns all 4 accent properties, matching the trait\'s own pair', () => {
    expect(getTraitColorStyle('output')).toEqual({
      '--color-accent-a': ACCENT_COLORS.burntOrange,
      '--color-accent-b': ACCENT_COLORS.orange,
      '--color-accent': `color-mix(in srgb, ${ACCENT_COLORS.burntOrange} 50%, ${ACCENT_COLORS.orange} 50%)`,
      '--color-accent-gradient': `linear-gradient(135deg, ${ACCENT_COLORS.burntOrange}, ${ACCENT_COLORS.orange})`,
    });
  });

  it('returns a correct, distinct style object for every trait', () => {
    for (const trait of TRAIT_IDS) {
      const [a, b] = TRAIT_COLORS[trait];
      expect(getTraitColorStyle(trait)).toEqual({
        '--color-accent-a': a,
        '--color-accent-b': b,
        '--color-accent': `color-mix(in srgb, ${a} 50%, ${b} 50%)`,
        '--color-accent-gradient': `linear-gradient(135deg, ${a}, ${b})`,
      });
    }
  });

  it('never leaves a var() reference inside --color-accent or --color-accent-gradient\'s own value — both must be fully literal', () => {
    for (const trait of TRAIT_IDS) {
      const style = getTraitColorStyle(trait) as Record<string, string>;
      expect(style['--color-accent']).not.toContain('var(');
      expect(style['--color-accent-gradient']).not.toContain('var(');
    }
  });
});

describe('relativeLuminance', () => {
  it('white is more luminant than black', () => {
    expect(relativeLuminance('#ffffff')).toBeGreaterThan(relativeLuminance('#000000'));
  });

  it('a color is exactly as luminant as itself', () => {
    expect(relativeLuminance(ACCENT_COLORS.cyan)).toBe(relativeLuminance(ACCENT_COLORS.cyan));
  });

  it('indigo is darker than cyan, even though cyan has the lower raw HSL lightness — WCAG luminance weights green heavily, and cyan\'s green channel outweighs its lower lightness (found while building getDisabledTraitColorStyle)', () => {
    expect(relativeLuminance(ACCENT_COLORS.indigo)).toBeLessThan(relativeLuminance(ACCENT_COLORS.cyan));
  });
});

describe('desaturateHex', () => {
  it('cuts saturation by the given fraction, hue and lightness unchanged (reduction 0.8 — getDisabledTraitColorStyle\'s own lighter-tone cut)', () => {
    // Hand-computed via the same HSL round-trip this function implements —
    // ACCENT_COLORS.orange (#da7e1b) at 0.8 reduction.
    expect(desaturateHex(ACCENT_COLORS.orange, 0.8)).toBe('#8e7b67');
  });

  it('a smaller reduction (0.6) desaturates less than a larger one (0.8), for the same input', () => {
    const smaller = desaturateHex(ACCENT_COLORS.orange, 0.6);
    const larger = desaturateHex(ACCENT_COLORS.orange, 0.8);
    expect(smaller).not.toBe(larger);
    // Both move toward gray from the same starting hue — neither should equal the original.
    expect(smaller).not.toBe(ACCENT_COLORS.orange);
    expect(larger).not.toBe(ACCENT_COLORS.orange);
  });

  it('a reduction of 0 returns the color unchanged', () => {
    expect(desaturateHex(ACCENT_COLORS.orange, 0)).toBe(ACCENT_COLORS.orange);
  });
});

describe('getDisabledTraitColorStyle', () => {
  it('desaturates the lighter of the trait\'s own two tones by 80% and the darker by 60% — never introduces a 3rd color', () => {
    for (const trait of TRAIT_IDS) {
      const [a, b] = TRAIT_COLORS[trait];
      const [lighter, darker] = relativeLuminance(a) >= relativeLuminance(b) ? [a, b] : [b, a];
      const expectedA = desaturateHex(lighter, 0.8);
      const expectedB = desaturateHex(darker, 0.6);
      expect(getDisabledTraitColorStyle(trait)).toEqual({
        '--color-accent-a': expectedA,
        '--color-accent-b': expectedB,
        '--color-accent': `color-mix(in srgb, ${expectedA} 50%, ${expectedB} 50%)`,
        '--color-accent-gradient': `linear-gradient(135deg, ${expectedA}, ${expectedB})`,
      });
    }
  });

  it("desaturates orange (Output's lighter tone), not burntOrange, into slot -a", () => {
    const style = getDisabledTraitColorStyle('output') as Record<string, string>;
    expect(style['--color-accent-a']).toBe(desaturateHex(ACCENT_COLORS.orange, 0.8));
    expect(style['--color-accent-b']).toBe(desaturateHex(ACCENT_COLORS.burntOrange, 0.6));
  });

  it("puts cyan (not indigo) in the lighter slot for Spectral — the non-obvious WCAG-luminance case (indigo is darker despite cyan's lower raw HSL lightness)", () => {
    const style = getDisabledTraitColorStyle('spectral') as Record<string, string>;
    expect(style['--color-accent-a']).toBe(desaturateHex(ACCENT_COLORS.cyan, 0.8));
    expect(style['--color-accent-b']).toBe(desaturateHex(ACCENT_COLORS.indigo, 0.6));
  });

  it('never leaves a var() reference inside --color-accent or --color-accent-gradient — both fully literal, same as getTraitColorStyle', () => {
    for (const trait of TRAIT_IDS) {
      const style = getDisabledTraitColorStyle(trait) as Record<string, string>;
      expect(style['--color-accent']).not.toContain('var(');
      expect(style['--color-accent-gradient']).not.toContain('var(');
    }
  });
});

describe('getRobotColorStyle', () => {
  it('sets all 4 accent properties to the same given color (a degenerate solid "gradient")', () => {
    expect(getRobotColorStyle('#abc123')).toEqual({
      '--color-accent-a': '#abc123',
      '--color-accent-b': '#abc123',
      '--color-accent': 'color-mix(in srgb, #abc123 50%, #abc123 50%)',
      '--color-accent-gradient': 'linear-gradient(135deg, #abc123, #abc123)',
      '--color-text-primary': 'rgba(255, 255, 255, 0.87)',
    });
  });

  it('works for any hex string, not just a known ACCENT_COLORS value', () => {
    // getRobotColorStyle takes a robot's already-resolved identityColor — it has no reason to
    // validate against ACCENT_COLORS itself (that validation, if any, belongs to whatever produced
    // the color in the first place).
    expect(getRobotColorStyle('#ffffff')).toEqual({
      '--color-accent-a': '#ffffff',
      '--color-accent-b': '#ffffff',
      '--color-accent': 'color-mix(in srgb, #ffffff 50%, #ffffff 50%)',
      '--color-accent-gradient': 'linear-gradient(135deg, #ffffff, #ffffff)',
      '--color-text-primary': '#12161a',
    });
  });

  // Bugfix (docs/reference/layout-updates.md — Probes section: "colors are wrong internally...
  // text on buttons needs to be visible"): CabinetBox's front face always reads
  // --color-text-primary for its label text (CabinetBox.css), and a robot's identityColor can be
  // any hue — including light ones a fixed white-ish text color disappears against once that
  // color becomes the front face's own background (RadioButton.css's [data-state='on'] tint,
  // CabinetBox.css's own rest-state hint). getRobotColorStyle now picks a readable
  // --color-text-primary override per identityColor via WCAG relative luminance, the same helper
  // getDisabledTraitColorStyle already uses for its own lighter/darker resolution.
  it('overrides --color-text-primary to a dark color when identityColor is light (luminance > 0.5)', () => {
    expect((getRobotColorStyle('#ffffff') as Record<string, string>)['--color-text-primary']).toBe('#12161a');
    expect((getRobotColorStyle('#fef08a') as Record<string, string>)['--color-text-primary']).toBe('#12161a'); // pale yellow
  });

  it('keeps the default light --color-text-primary when identityColor is dark (luminance <= 0.5)', () => {
    expect((getRobotColorStyle('#12161a') as Record<string, string>)['--color-text-primary']).toBe('rgba(255, 255, 255, 0.87)');
    expect((getRobotColorStyle('#1a237e') as Record<string, string>)['--color-text-primary']).toBe('rgba(255, 255, 255, 0.87)'); // deep indigo
  });

  // Regression: many existing test fixtures build a Robot via `as unknown as Robot` and omit
  // identityColor (a required field in practice, but not enforced at test-fixture time) — this
  // must not throw the way a raw relativeLuminance(undefined) call would.
  it('does not throw and falls back to the default light text for an undefined/malformed identityColor', () => {
    expect(() => getRobotColorStyle(undefined as unknown as string)).not.toThrow();
    expect((getRobotColorStyle(undefined as unknown as string) as Record<string, string>)['--color-text-primary']).toBe('rgba(255, 255, 255, 0.87)');
    expect((getRobotColorStyle('not-a-color') as Record<string, string>)['--color-text-primary']).toBe('rgba(255, 255, 255, 0.87)');
  });
});
