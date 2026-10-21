import { describe, it, expect, vi } from 'vitest';

// The cell model is pure arithmetic here; its Tone and helper imports are only reached by the cell protocol, which
// globalFx.test.ts drives through the chain.
vi.mock('tone', () => ({}));
vi.mock('@/utils/helpers', () => ({ devWarn: vi.fn() }));

describe('bypassCell', () => {
  // Mix is tapered (docs/specs/GLOBAL_COLOUR.md, as built after the Pixel listen, 2026-10-15): the three
  // saturators were far too strong across most of the slider, so the stored 0-1 Mix reaches the node squared.
  describe('Mix taper (colourWetGain)', () => {
    it('is exported and maps the slider ends to the node ends: 0 stays dry, 1 stays fully wet', async () => {
      const { colourWetGain } = await import('./bypassCell');
      expect(colourWetGain(0)).toBe(0);
      expect(colourWetGain(1)).toBe(1);
    });

    it('is squared: half the slider is a quarter of the wet, and a low Mix is much lower', async () => {
      const { colourWetGain } = await import('./bypassCell');
      expect(colourWetGain(0.5)).toBeCloseTo(0.25, 9);
      expect(colourWetGain(0.2)).toBeCloseTo(0.04, 9);
    });

    it('never exceeds the slider position and rises strictly with it (a taper, not a cap)', async () => {
      const { colourWetGain } = await import('./bypassCell');
      let previous = -1;
      for (let i = 0; i <= 100; i++) {
        const v = i / 100;
        const gain = colourWetGain(v);
        expect(gain).toBeLessThanOrEqual(v + 1e-12);
        expect(gain).toBeGreaterThan(previous);
        previous = gain;
      }
    });
  });

  // Dark-Effect Bypass T1 (docs/specs/DARK_EFFECT_BYPASS.md section 1.1): the two laws a bypass cell's dry and wet
  // gains follow. A Mix effect's cell takes Tone's own CrossFade law (equal power), so an effect pinned at wet 1 inside
  // a cell at cellGains(g) sounds as the bare effect at wet g. Width's cell crossfades two identical signals at 0.5, so
  // it fades linearly.
  describe('bypass cell laws (Dark-Effect Bypass T1)', () => {
    describe('cellGains (Tone CrossFade law)', () => {
      it('is fully dry at 0', async () => {
        const { cellGains } = await import('./bypassCell');
        const { dry, wet } = cellGains(0);
        expect(dry).toBeCloseTo(1, 12);
        expect(wet).toBeCloseTo(0, 12);
      });

      it('is fully wet at 1', async () => {
        const { cellGains } = await import('./bypassCell');
        const { dry, wet } = cellGains(1);
        expect(dry).toBeCloseTo(0, 12);
        expect(wet).toBeCloseTo(1, 12);
      });

      it('gives both paths the square root of one half at the midpoint', async () => {
        const { cellGains } = await import('./bypassCell');
        const { dry, wet } = cellGains(0.5);
        expect(dry).toBeCloseTo(Math.SQRT1_2, 12);
        expect(wet).toBeCloseTo(Math.SQRT1_2, 12);
      });

      it('is equal power: dry squared plus wet squared is 1 at every tenth from 0 to 1', async () => {
        const { cellGains } = await import('./bypassCell');
        for (let i = 0; i <= 10; i++) {
          const { dry, wet } = cellGains(i / 10);
          expect(dry * dry + wet * wet).toBeCloseTo(1, 12);
        }
      });

      it('matches the cos / sin of Tone CrossFade at a quarter and three quarters (a StereoPanner at pan 2f - 1)', async () => {
        const { cellGains } = await import('./bypassCell');
        expect(cellGains(0.25).dry).toBeCloseTo(Math.cos(Math.PI / 8), 12);
        expect(cellGains(0.25).wet).toBeCloseTo(Math.sin(Math.PI / 8), 12);
        expect(cellGains(0.75).dry).toBeCloseTo(Math.cos((3 * Math.PI) / 8), 12);
        expect(cellGains(0.75).wet).toBeCloseTo(Math.sin((3 * Math.PI) / 8), 12);
      });

      it('falls on the dry side and rises on the wet side strictly as the input rises', async () => {
        const { cellGains } = await import('./bypassCell');
        let previous = cellGains(0);
        for (let i = 1; i <= 100; i++) {
          const next = cellGains(i / 100);
          expect(next.dry).toBeLessThan(previous.dry);
          expect(next.wet).toBeGreaterThan(previous.wet);
          previous = next;
        }
      });

      it('gives the smallest lit Mix a wet gain above zero, so a lit cell always has a wet path', async () => {
        const { cellGains, colourWetGain } = await import('./bypassCell');
        const { dry, wet } = cellGains(colourWetGain(0.001));
        expect(wet).toBeGreaterThan(0);
        expect(dry).toBeLessThanOrEqual(1);
        expect(dry).toBeGreaterThan(0.999999);
      });

      it('keeps both gains inside 0 to 1 for every input in range', async () => {
        const { cellGains } = await import('./bypassCell');
        for (let i = 0; i <= 100; i++) {
          const { dry, wet } = cellGains(i / 100);
          expect(dry).toBeGreaterThanOrEqual(-1e-12);
          expect(dry).toBeLessThanOrEqual(1);
          expect(wet).toBeGreaterThanOrEqual(0);
          expect(wet).toBeLessThanOrEqual(1);
        }
      });
    });

    describe('widthCellGains (linear)', () => {
      it('is fully dry at 0 and fully wet at 1', async () => {
        const { widthCellGains } = await import('./bypassCell');
        expect(widthCellGains(0)).toEqual({ dry: 1, wet: 0 });
        expect(widthCellGains(1)).toEqual({ dry: 0, wet: 1 });
      });

      it('sums to exactly 1 at 0, a quarter, a half, three quarters and 1', async () => {
        const { widthCellGains } = await import('./bypassCell');
        for (const f of [0, 0.25, 0.5, 0.75, 1]) {
          const { dry, wet } = widthCellGains(f);
          expect(dry + wet).toBe(1);
        }
      });

      it('is linear, not equal power: a half each at the midpoint', async () => {
        const { widthCellGains } = await import('./bypassCell');
        expect(widthCellGains(0.5)).toEqual({ dry: 0.5, wet: 0.5 });
        expect(widthCellGains(0.25)).toEqual({ dry: 0.75, wet: 0.25 });
      });
    });

    it('exports the disconnect margin, 10 ms past lookAhead plus the ramp', async () => {
      const { BYPASS_DISCONNECT_MARGIN_SECONDS } = await import('./bypassCell');
      expect(BYPASS_DISCONNECT_MARGIN_SECONDS).toBe(0.01);
    });
  });
});
