import { describe, it, expect } from 'vitest';

import { assertNinetyFortyFive } from './sceneryTestHelpers';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** An <svg> root holding the given markup, parsed as SVG. */
function svgWith(markup: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.innerHTML = markup;
  return svg;
}

/** A trapezoid whose right edge runs at 67.5 degrees (dx -10, dy 24.14), the corner bisector of a ring facet. */
const SLANTED = '<polygon points="0,0 100,0 90,24.14 0,24.14" />';
const SLANTED_LINE = '<line x1="0" y1="0" x2="10" y2="24.14" />';

describe('assertNinetyFortyFive', () => {
  describe('the existing rule', () => {
    it('passes horizontal, vertical and exact 45 degree polygon edges', () => {
      expect(() => assertNinetyFortyFive(svgWith('<polygon points="0,0 80,0 100,20 100,50 0,50" />'))).not.toThrow();
    });

    it('fails a polygon edge at 67.5 degrees', () => {
      expect(() => assertNinetyFortyFive(svgWith(SLANTED))).toThrow(/not horizontal, vertical, or 45/);
    });

    it('fails a line at 67.5 degrees and passes a 45 degree one', () => {
      expect(() => assertNinetyFortyFive(svgWith(SLANTED_LINE))).toThrow(/not horizontal, vertical, or 45/);
      expect(() => assertNinetyFortyFive(svgWith('<line x1="0" y1="0" x2="10" y2="10" />'))).not.toThrow();
    });

    it('still skips anything inside a rotate(45) group', () => {
      expect(() => assertNinetyFortyFive(svgWith(`<g transform="rotate(45 5 5)">${SLANTED}</g>`))).not.toThrow();
      expect(() => assertNinetyFortyFive(svgWith(`<g transform="rotate(-45 5 5)">${SLANTED}</g>`))).not.toThrow();
    });

    it('fails a NaN attribute on any shape', () => {
      expect(() => assertNinetyFortyFive(svgWith('<rect x="NaN" y="0" width="5" height="5" />'))).toThrow(/NaN attribute/);
    });
  });

  describe('ring facets (data-gem="ring", spec assumption 5)', () => {
    it('skips the 67.5 degree polygon edges inside a ring group', () => {
      expect(() => assertNinetyFortyFive(svgWith(`<g data-gem="ring">${SLANTED}</g>`))).not.toThrow();
    });

    it('skips a slanted line inside a ring group', () => {
      expect(() => assertNinetyFortyFive(svgWith(`<g data-gem="ring">${SLANTED_LINE}</g>`))).not.toThrow();
    });

    it('skips polygons nested deeper inside the ring group', () => {
      expect(() => assertNinetyFortyFive(svgWith(`<g data-gem="ring"><g><g>${SLANTED}</g></g></g>`))).not.toThrow();
    });

    it('skips the ring when the ring group itself is the root handed to the helper', () => {
      const svg = svgWith(`<g data-gem="ring">${SLANTED}</g>`);
      expect(() => assertNinetyFortyFive(svg.querySelector('g')!)).not.toThrow();
    });

    it('does not widen: a slanted polygon beside the ring group still fails', () => {
      expect(() => assertNinetyFortyFive(svgWith(`<g data-gem="ring"></g>${SLANTED}`))).toThrow(/not horizontal/);
    });

    it('does not widen: a slanted polygon in a sibling group of the ring still fails', () => {
      const markup = `<g data-gem="ring">${SLANTED}</g><g data-scenery="tank">${SLANTED}</g>`;
      expect(() => assertNinetyFortyFive(svgWith(markup))).toThrow(/not horizontal/);
    });

    it('does not widen: other data-gem values are not exempt', () => {
      expect(() => assertNinetyFortyFive(svgWith(`<g data-gem="halo">${SLANTED}</g>`))).toThrow(/not horizontal/);
      expect(() => assertNinetyFortyFive(svgWith(`<g data-gem="rings">${SLANTED}</g>`))).toThrow(/not horizontal/);
    });

    it('still checks a bad polygon when a good ring polygon comes first', () => {
      const markup = `<g data-gem="ring">${SLANTED}</g><polygon points="0,0 10,0 4,10" />`;
      expect(() => assertNinetyFortyFive(svgWith(markup))).toThrow(/not horizontal/);
    });

    it('still sweeps NaN attributes inside the ring group', () => {
      const markup = '<g data-gem="ring"><polygon points="0,0 10,0 10,10" fill="NaN" /></g>';
      expect(() => assertNinetyFortyFive(svgWith(markup))).toThrow(/NaN attribute fill/);
      const rect = '<g data-gem="ring"><rect x="NaN" y="0" width="5" height="5" /></g>';
      expect(() => assertNinetyFortyFive(svgWith(rect))).toThrow(/NaN attribute x/);
    });

    it('passes a ring group of paths alongside on-grid polygons', () => {
      const markup = '<polygon points="0,0 50,0 50,50 0,50" /><g data-gem="ring"><path d="M0,0L10,0L8,3Z" /></g>';
      expect(() => assertNinetyFortyFive(svgWith(markup))).not.toThrow();
    });
  });
});
