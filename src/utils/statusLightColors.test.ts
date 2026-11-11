import { describe, it, expect } from 'vitest';
import { getStatusLightColor } from './statusLightColors';
import colorTheme from '@/constants/colorTheme.json';
import { hslToString } from '@/utils/colorUtils';

describe('statusLightColors', () => {
  describe('getStatusLightColor', () => {
    it('sources purple from colorTheme.json\'s vent family', () => {
      const result = getStatusLightColor('purple');
      expect(result.color).toBe(hslToString(colorTheme.vent.base));
    });

    it('sources red from colorTheme.json\'s alert.powered', () => {
      const result = getStatusLightColor('red');
      expect(result.color).toBe(hslToString(colorTheme.alert.powered));
    });

    it('sources green from colorTheme.json\'s indicator.powered', () => {
      const result = getStatusLightColor('green');
      expect(result.color).toBe(hslToString(colorTheme.indicator.powered));
    });

    it('sources amber from colorTheme.json\'s strut.base', () => {
      const result = getStatusLightColor('amber');
      expect(result.color).toBe(hslToString(colorTheme.strut.base));
    });

    it('sources yellow from colorTheme.json wire.base (the Solo light, monitor mode spec 7.1 B1)', () => {
      const result = getStatusLightColor('yellow');
      expect(result.color).toBe(hslToString(colorTheme.wire.base));
      expect(result.glow).toBe(hslToString(colorTheme.wire.base, 0.6));
    });

    it('sources blue from colorTheme.json glass.base (the Highlight light, monitor mode spec 7.1 B1)', () => {
      const result = getStatusLightColor('blue', 0.3);
      expect(result.color).toBe(hslToString(colorTheme.glass.base));
      expect(result.glow).toBe(hslToString(colorTheme.glass.base, 0.3));
    });

    it('defaults the glow alpha to 0.6', () => {
      const result = getStatusLightColor('red');
      expect(result.glow).toBe(hslToString(colorTheme.alert.powered, 0.6));
    });

    it('uses a caller-supplied glow alpha instead of the default', () => {
      const result = getStatusLightColor('green', 0.9);
      expect(result.glow).toBe(hslToString(colorTheme.indicator.powered, 0.9));
    });

    it('color and glow share the same hue/saturation/lightness, differing only in alpha', () => {
      const result = getStatusLightColor('amber', 0.25);
      expect(result.color).toBe('hsl(33, 100%, 50%)');
      expect(result.glow).toBe('hsla(33, 100%, 50%, 0.25)');
    });
  });
});
