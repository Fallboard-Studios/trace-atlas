import { describe, it, expect } from 'vitest';
import { type HSL, hslToString, clamp, applyColorShift, hexToHsl, type ColorShift } from './colorUtils';
import { ACCENT_COLORS } from '../constants/accentColors';

describe('colorUtils', () => {
  describe('hslToString', () => {
    it('formats values correctly', () => {
      const hsl: HSL = { h: 180, s: 50, l: 25 };
      expect(hslToString(hsl)).toBe('hsl(180, 50%, 25%)');
    });

    it('handles edge values', () => {
      expect(hslToString({ h: 0, s: 0, l: 0 })).toBe('hsl(0, 0%, 0%)');
      expect(hslToString({ h: 360, s: 100, l: 100 })).toBe('hsl(360, 100%, 100%)');
    });

    it('formats as hsla() when an alpha is supplied', () => {
      const hsl: HSL = { h: 180, s: 50, l: 25 };
      expect(hslToString(hsl, 0.6)).toBe('hsla(180, 50%, 25%, 0.6)');
    });

    it('handles alpha edge values 0 and 1', () => {
      const hsl: HSL = { h: 180, s: 50, l: 25 };
      expect(hslToString(hsl, 0)).toBe('hsla(180, 50%, 25%, 0)');
      expect(hslToString(hsl, 1)).toBe('hsla(180, 50%, 25%, 1)');
    });

    it('omits alpha entirely (stays hsl(), not hsla()) when alpha is not passed', () => {
      const hsl: HSL = { h: 180, s: 50, l: 25 };
      // Regression guard: existing callers (realWorldGradient.ts, etc.) must keep getting
      // byte-identical output when they don't opt into alpha.
      expect(hslToString(hsl)).toBe('hsl(180, 50%, 25%)');
      expect(hslToString(hsl)).not.toContain('hsla');
    });
  });

  describe('clamp', () => {
    it('returns input when within bounds', () => {
      expect(clamp(5, 0, 10)).toBe(5);
    });

    it('clamps to min', () => {
      expect(clamp(-1, 0, 10)).toBe(0);
    });

    it('clamps to max', () => {
      expect(clamp(11, 0, 10)).toBe(10);
    });

    it('handles swapped bounds by swapping them internally', () => {
      // clamp(5,10,0) should behave like clamp(5,0,10)
      expect(clamp(5, 10, 0)).toBe(5);
      expect(clamp(-1, 10, 0)).toBe(0);
      expect(clamp(11, 10, 0)).toBe(10);
    });
  });

  describe('applyColorShift', () => {
    const baseColor: HSL = { h: 180, s: 50, l: 50 };
    const noShift: ColorShift = { hueShift: 0, satShift: 0 };

    it('applies no shift with neutral values', () => {
      const result = applyColorShift(baseColor, noShift, 1.0);
      expect(result).toBe('hsl(180, 50%, 50%)');
    });

    it('applies hue shift correctly', () => {
      const shift: ColorShift = { hueShift: 30, satShift: 0 };
      const result = applyColorShift(baseColor, shift, 1.0);
      expect(result).toBe('hsl(210, 50%, 50%)');
    });

    it('applies negative hue shift correctly', () => {
      const shift: ColorShift = { hueShift: -30, satShift: 0 };
      const result = applyColorShift(baseColor, shift, 1.0);
      expect(result).toBe('hsl(150, 50%, 50%)');
    });

    it('wraps hue around at 360 (positive overflow)', () => {
      const base: HSL = { h: 350, s: 50, l: 50 };
      const shift: ColorShift = { hueShift: 30, satShift: 0 };
      const result = applyColorShift(base, shift, 1.0);
      expect(result).toBe('hsl(20, 50%, 50%)');
    });

    it('wraps hue around at 0 (negative overflow)', () => {
      const base: HSL = { h: 10, s: 50, l: 50 };
      const shift: ColorShift = { hueShift: -30, satShift: 0 };
      const result = applyColorShift(base, shift, 1.0);
      expect(result).toBe('hsl(340, 50%, 50%)');
    });

    it('applies saturation shift correctly', () => {
      const shift: ColorShift = { hueShift: 0, satShift: 20 };
      const result = applyColorShift(baseColor, shift, 1.0);
      expect(result).toBe('hsl(180, 70%, 50%)');
    });

    it('clamps saturation at 0 (negative overflow)', () => {
      const base: HSL = { h: 180, s: 10, l: 50 };
      const shift: ColorShift = { hueShift: 0, satShift: -20 };
      const result = applyColorShift(base, shift, 1.0);
      expect(result).toBe('hsl(180, 0%, 50%)');
    });

    it('clamps saturation at 100 (positive overflow)', () => {
      const base: HSL = { h: 180, s: 90, l: 50 };
      const shift: ColorShift = { hueShift: 0, satShift: 20 };
      const result = applyColorShift(base, shift, 1.0);
      expect(result).toBe('hsl(180, 100%, 50%)');
    });

    it('applies lightness multiplier correctly', () => {
      const result = applyColorShift(baseColor, noShift, 0.8);
      expect(result).toBe('hsl(180, 50%, 40%)');
    });

    it('brightens with multiplier > 1', () => {
      const result = applyColorShift(baseColor, noShift, 1.2);
      expect(result).toBe('hsl(180, 50%, 60%)');
    });

    it('darkens with multiplier < 1', () => {
      const base: HSL = { h: 180, s: 50, l: 60 };
      const result = applyColorShift(base, noShift, 0.5);
      expect(result).toBe('hsl(180, 50%, 30%)');
    });

    it('applies all shifts simultaneously', () => {
      const base: HSL = { h: 200, s: 40, l: 30 };
      const shift: ColorShift = { hueShift: 15, satShift: 10 };
      const result = applyColorShift(base, shift, 1.5);
      expect(result).toBe('hsl(215, 50%, 45%)');
    });

    it('handles edge case: zero lightness multiplier', () => {
      const result = applyColorShift(baseColor, noShift, 0);
      expect(result).toBe('hsl(180, 50%, 0%)');
    });

    it('handles extreme hue shifts with multiple wraps', () => {
      const base: HSL = { h: 10, s: 50, l: 50 };
      const shift: ColorShift = { hueShift: 720, satShift: 0 };
      const result = applyColorShift(base, shift, 1.0);
      expect(result).toBe('hsl(10, 50%, 50%)');
    });

    // Found live-verifying items 21-23's fixes (2026-09-15): eastLMultiplier/westLMultiplier
    // are continuous, never-repeating floats sampled from a sine curve every tick. Without
    // rounding, `l = base.l * lMultiplier` produces a genuinely different string on every
    // single call, forcing React to write the `fill` attribute to the real DOM every tick even
    // when the visual difference is imperceptible — real, measured cost in the React DevTools
    // Profiler (5-9ms/factory) that items 21-23's JS-computation fixes couldn't touch, because
    // the values were never actually equal to begin with.
    it('rounds lightness to a whole number — not the raw floating-point product', () => {
      const result = applyColorShift(baseColor, noShift, 0.8234567);
      expect(result).toBe('hsl(180, 50%, 41%)'); // 50 * 0.8234567 = 41.172835 -> 41
    });

    it('two lMultiplier values differing by less than 0.5% of lightness produce the identical string', () => {
      // This is the actual mechanism the fix relies on: React's own prop diffing skips a DOM
      // write when Object.is(prevValue, nextValue) is true — a plain string/number equality
      // check, not something React.memo governs. Rounding is what makes that check succeed
      // across two ticks whose real-world lighting barely moved.
      const tickA = applyColorShift(baseColor, noShift, 0.80001);
      const tickB = applyColorShift(baseColor, noShift, 0.80003);
      expect(tickA).toBe(tickB);
    });
  });

  // docs/specs/WORLD_PALETTE_PULL.md §1.1 / docs/tasks/WORLD_PALETTE_PULL.md Task 1: the one
  // shared hex→HSL conversion. traitColors.ts's private hexToRgb/rgbToHsl pair delegates to it.
  describe('hexToHsl', () => {
    it('converts the three pure primaries to their canonical hues at full saturation, half lightness', () => {
      expect(hexToHsl('#ff0000')).toEqual({ h: 0, s: 100, l: 50 });
      expect(hexToHsl('#00ff00')).toEqual({ h: 120, s: 100, l: 50 });
      expect(hexToHsl('#0000ff')).toEqual({ h: 240, s: 100, l: 50 });
    });

    it('treats black and white as achromatic: zero saturation, hue 0, lightness at the ends', () => {
      expect(hexToHsl('#000000')).toEqual({ h: 0, s: 0, l: 0 });
      expect(hexToHsl('#ffffff')).toEqual({ h: 0, s: 0, l: 100 });
    });

    it('returns raw (unrounded) values with h in [0, 360) and s/l in [0, 100] for every accent hue', () => {
      // Callers round if they need to (accentLean.ts stores raw hues) — rounding here would
      // silently change traitColors.ts's desaturateHex output.
      for (const hex of Object.values(ACCENT_COLORS)) {
        if (!/^#[0-9a-fA-F]{6}$/.test(hex)) continue; // ACCENT_COLORS.white is '#fff' — out of scope (6-digit only)
        const { h, s, l } = hexToHsl(hex);
        expect(h).toBeGreaterThanOrEqual(0);
        expect(h).toBeLessThan(360);
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThanOrEqual(100);
        expect(l).toBeGreaterThanOrEqual(0);
        expect(l).toBeLessThanOrEqual(100);
      }
    });

    it('reproduces the exact pre-refactor output of traitColors.ts\'s private hexToRgb + rgbToHsl (parity oracle)', () => {
      // Pinned 2026-10-02 by running a verbatim copy of those two private functions on the
      // commit BEFORE this task (their s/l were 0..1 fractions; scaled ×100 here to match the
      // HSL interface). If this ever fails, the delegation changed a UI colour — fix the
      // conversion, never these numbers.
      expect(hexToHsl(ACCENT_COLORS.teal)).toEqual({ h: 172.22222222222223, s: 45.378151260504204, l: 46.666666666666664 });
      expect(hexToHsl(ACCENT_COLORS.burntOrange)).toEqual({ h: 20.168067226890756, s: 65.02732240437159, l: 35.88235294117647 });
    });
  });

});

