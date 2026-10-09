// ========================================
// IMPORTS
// ========================================
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import Alea from 'alea';
import type { ReactNode } from 'react';

import { svgElementExtent, SILHOUETTE_DECORATION } from './svgElementExtent';
import { ROOFTOP_RENDERERS } from '../components/actors/greebles/rooftopGreebles';
import type { GreebleRendererContext, RooftopGreeble } from '../components/actors/greebles/greebleTypes';
import { SCENERY_RENDERERS, SCENERY_GEM_ACCENTS } from '../components/actors/scenery/Scenery';
import { deriveSceneryParams } from '../components/actors/scenery/sceneryParams';
import type { SceneryContext } from '../components/actors/scenery/sceneryTypes';
import { shapeExtents, unionExtent } from '../testUtils/svgShapeExtents';
import { ActorType, type Actor, type SceneryKind } from '../types/Actor';

// ========================================
// HELPERS
// ========================================
/** What the DOM really draws: the union of every solid shape's extent. */
const domExtent = (node: ReactNode) => unionExtent(shapeExtents(render(<svg>{node}</svg>).container));

/** The walker matches the DOM: never smaller (1e-6), never more than `slack` larger. The DOM
 *  side samples arcs, so it can sit a hair inside the true curve. */
function expectMatches(node: ReactNode, where: string, slack = 1e-3) {
  const dom = domExtent(node);
  const e = svgElementExtent(node);
  if (!dom) {
    expect(e, where).toBeNull();
    return;
  }
  expect(e, where).not.toBeNull();
  expect(e!.x0, where).toBeLessThanOrEqual(dom.x0 + 1e-6);
  expect(e!.y0, where).toBeLessThanOrEqual(dom.y0 + 1e-6);
  expect(e!.x1, where).toBeGreaterThanOrEqual(dom.x1 - 1e-6);
  expect(e!.y1, where).toBeGreaterThanOrEqual(dom.y1 - 1e-6);
  expect(dom.x0 - e!.x0, where).toBeLessThanOrEqual(slack);
  expect(dom.y0 - e!.y0, where).toBeLessThanOrEqual(slack);
  expect(e!.x1 - dom.x1, where).toBeLessThanOrEqual(slack);
  expect(e!.y1 - dom.y1, where).toBeLessThanOrEqual(slack);
}

const COLORS = { body: { h: 0, s: 0, l: 50 }, accent: { h: 180, s: 50, l: 50 }, greeble: { h: 0, s: 0, l: 40 }, illuminated: { h: 50, s: 80, l: 70 } };

// ========================================
// TESTS — SHAPES
// ========================================
describe('svgElementExtent — shapes (Phase 43 Task 32)', () => {
  it('nothing drawn → null', () => {
    expect(svgElementExtent(null)).toBeNull();
    expect(svgElementExtent(<g />)).toBeNull();
    expect(svgElementExtent(<>{[]}</>)).toBeNull();
  });

  it('a rect, a circle and a polygon, unioned through fragments, arrays and groups', () => {
    const node = (
      <>
        <rect x={10} y={20} width={30} height={5} />
        {[<circle key="c" cx={100} cy={0} r={4} />]}
        <g><polygon points="0,50 5,60 -3,55" /></g>
      </>
    );
    expect(svgElementExtent(node)).toEqual({ x0: -3, y0: -4, x1: 104, y1: 60 });
  });

  it('a line, and half the stroke width around any stroked shape', () => {
    expect(svgElementExtent(<line x1={0} y1={0} x2={10} y2={20} stroke="#000" strokeWidth={4} />)).toEqual({ x0: -2, y0: -2, x1: 12, y1: 22 });
    expect(svgElementExtent(<polygon points="0,0 10,0 10,10" fill="none" stroke="#000" strokeWidth={2} />)).toEqual({ x0: -1, y0: -1, x1: 11, y1: 11 });
    expect(svgElementExtent(<rect x={0} y={0} width={10} height={10} stroke="none" strokeWidth={8} />)).toEqual({ x0: 0, y0: 0, x1: 10, y1: 10 });
  });

  it('an ellipse, and one under a rotate — its exact rotated box', () => {
    expect(svgElementExtent(<ellipse cx={0} cy={0} rx={10} ry={5} />)).toEqual({ x0: -10, y0: -5, x1: 10, y1: 5 });
    const e = svgElementExtent(<g transform="rotate(90 0 0)"><ellipse cx={0} cy={0} rx={10} ry={5} /></g>)!;
    expect(e.x0).toBeCloseTo(-5, 9);
    expect(e.y0).toBeCloseTo(-10, 9);
  });

  it('a rotate(deg cx cy) group turns its shapes about its centre', () => {
    const e = svgElementExtent(<g transform="rotate(90 0 0)"><rect x={0} y={0} width={10} height={2} /></g>)!;
    expect(e.x0).toBeCloseTo(-2, 9);
    expect(e.x1).toBeCloseTo(0, 9);
    expect(e.y0).toBeCloseTo(0, 9);
    expect(e.y1).toBeCloseTo(10, 9);
  });

  it('an arc path reaches the top of its curve, not just its end points', () => {
    // The cupola's upper half-ellipse: rx 20, ry 8 over a chord on y = 50.
    expect(svgElementExtent(<path d="M 30,50 A 20,8 0 0 1 70,50 Z" />)).toEqual({ x0: 30, y0: 42, x1: 70, y1: 50 });
    // A quarter arc (the dome's west half): from the left end up to the apex.
    expect(svgElementExtent(<path d="M 0,100 A 40,30 0 0 1 40,70 L 40,100 Z" />)).toEqual({ x0: 0, y0: 70, x1: 40, y1: 100 });
  });

  it('skips decoration — plumes, floodlight beams and pools — and defs', () => {
    const node = (
      <>
        <rect x={0} y={0} width={10} height={10} />
        <polygon data-vent="plume" points="0,-500 10,-500 5,0" />
        <polygon data-floodlight="beam" points="0,0 900,900 0,900" />
        <ellipse data-floodlight="pool" cx={0} cy={0} rx={300} ry={10} />
        <defs><rect x={-999} y={-999} width={1} height={1} /></defs>
      </>
    );
    expect(svgElementExtent(node)).toEqual({ x0: 0, y0: 0, x1: 10, y1: 10 });
    expect(SILHOUETTE_DECORATION).toEqual(expect.arrayContaining([['data-vent', 'plume'], ['data-floodlight', 'beam'], ['data-floodlight', 'pool']]));
  });

  it('expands plain function components', () => {
    function Box({ w }: { w: number }) {
      return <rect x={0} y={0} width={w} height={1} />;
    }
    expect(svgElementExtent(<g><Box w={7} /></g>)).toEqual({ x0: 0, y0: 0, x1: 7, y1: 1 });
  });

  it('throws on what it cannot measure, rather than under-report', () => {
    expect(() => svgElementExtent(<g transform="scale(2)"><rect x={0} y={0} width={1} height={1} /></g>)).toThrow(/transform/);
    expect(() => svgElementExtent(<path d="M 0,0 Q 5,5 10,0" />)).toThrow(/path/);
    expect(() => svgElementExtent(<polyline points="0,0 1,1" />)).toThrow(/polyline/);
    expect(() => svgElementExtent(<text x={0} y={0}>hi</text>)).toThrow(/text/);
    expect(() => svgElementExtent(<g transform="rotate(30 0 0)"><path d="M 0,0 A 5,5 0 0 1 10,0" /></g>)).toThrow(/arc/);
  });
});

// ========================================
// TESTS — RENDER PARITY
// ========================================
describe('svgElementExtent — render parity with the DOM', () => {
  const TYPES = Object.keys(ROOFTOP_RENDERERS) as RooftopGreeble[];

  it.each(TYPES)('rooftop greeble %s, over 5 building sizes × 60 seeds, shaded and not', (type) => {
    for (const [bw, bh] of [[30, 40], [60, 120], [110, 90], [160, 380], [240, 520]]) {
      for (let seed = 0; seed < 60; seed++) {
        const base: GreebleRendererContext = { buildingWidth: bw, buildingHeight: bh, roofY: 1, seed: seed * 7919 + 13, colors: COLORS, lMultiplier: 1 };
        const shaded = { ...base, frontCornerX: bw * (0.3 + (seed % 7) * 0.08), eastLMultiplier: 0.9, westLMultiplier: 0.6 };
        expectMatches(ROOFTOP_RENDERERS[type](shaded), `${type} ${bw}×${bh} seed ${seed}`);
        expectMatches(ROOFTOP_RENDERERS[type](base), `${type} ${bw}×${bh} seed ${seed} unshaded`);
      }
    }
  });

  const KINDS = Object.keys(SCENERY_RENDERERS) as SceneryKind[];

  it.each(KINDS)('scenery %s, over 40 seeds, derelict or not, day and night', (kind) => {
    for (let i = 0; i < 40; i++) {
      const prng = Alea(`extent-${kind}-${i}`);
      for (const derelict of [false, true]) {
        const actor: Actor = {
          id: `extent-${kind}-${i}`,
          type: ActorType.SCENERY,
          position: { x: Math.round(300 + prng() * 1300), y: Math.round(880 + prng() * 160) },
          isActive: false,
          config: { kind, district: 'dense', row: 0, ...(derelict ? { derelict: true as const } : {}) },
        };
        for (const [eastL, westL, nightDepth] of [[0.9, 0.6, 0], [0.4, 0.8, 1]]) {
          const ctx: SceneryContext = {
            actor, params: deriveSceneryParams(actor), cap: 1, eastL, westL, nightDepth,
            accent: { primary: 200, secondary: 30 }, gems: SCENERY_GEM_ACCENTS,
          };
          expectMatches(SCENERY_RENDERERS[kind]!(ctx), `${actor.id} derelict ${derelict} night ${nightDepth}`);
        }
      }
    }
  });
});
