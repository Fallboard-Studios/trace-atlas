// ========================================
// IMPORTS
// ========================================
import alea from 'alea';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import { robotCentre, positionForCentre, sceneToOrbiterLocal, type OrbiterCorner } from './sceneToOrbiterLocal';
import { RobotGem, type RobotGemOrbiters, type RobotGemBodyLines, type RobotGemHalo } from '../../components/robot/gem/RobotGem';
import { getRobotGem, gemWidth, GEM_CANVAS_H, type RobotGem as RobotGemGeometry } from '../../components/robot/gem/polygon';
import { gemPalette } from '../../components/robot/gem/gemPalette';
import type { Vec2 } from '../../types/Vec2';

// ========================================
// FIXTURES
// ========================================
/** World context: all four corners rendered, `.gem__orbiter-local` left bare for GSAP. */
const WORLD_ORBITERS: RobotGemOrbiters = { lineWidth: 0.8, stripOpacity: 0, size: 1, count: 4, cornerOrder: [0, 1, 2, 3], motion: true };
const BODY_LINES: RobotGemBodyLines = { top: 0.8, midLeft: 0.8, midRight: 0.8, stripOpacity: 0 };
const HALO: RobotGemHalo = {
  color: '#41ad9f',
  rx: 30,
  ry: 30,
  stops: [0, 0.33, 0.5, 0.66, 0.83, 1].map((offset) => ({ offset, opacity: 0 })),
  opacity: 1,
  gradientId: 'halo-test-r1',
};
const CORNER_CLASSES = ['tl', 'tr', 'bl', 'br'] as const;
const CORNERS: OrbiterCorner[] = [0, 1, 2, 3];

/** Body × layer scale pairs: rest, the body-scale ceiling (1.69), J4's back row (0.75), both. */
const SCALES: Array<{ bodyScale: number; layerScale: number }> = [
  { bodyScale: 1, layerScale: 1 },
  { bodyScale: 1.69, layerScale: 1 },
  { bodyScale: 1, layerScale: 0.75 },
  { bodyScale: 1.69, layerScale: 0.75 },
];

const GEM_SEEDS = Array.from({ length: 50 }, (_, i) => 1000 + i * 7919);

// ========================================
// HELPERS — the real transform chain
// ========================================
type Affine = (p: Vec2) => Vec2;

/** An SVG `transform` attribute as a function: `A B C` maps p → A(B(C(p))). Only the two
 *  functions the gem chain writes (`translate`, `scale`) are understood; anything else throws. */
function parseTransform(attr: string | null): Affine {
  const fns: Affine[] = [];
  for (const [, name, args] of (attr ?? '').matchAll(/(\w+)\(([^)]*)\)/g)) {
    const n = args.trim().split(/[\s,]+/).map(Number);
    if (name === 'translate') fns.push((p) => ({ x: p.x + n[0], y: p.y + (n[1] ?? 0) }));
    else if (name === 'scale') fns.push((p) => ({ x: p.x * n[0], y: p.y * (n[1] ?? n[0]) }));
    else throw new Error(`unexpected transform ${name}`);
  }
  return (p) => fns.reduceRight((q, f) => f(q), p);
}

/** Renders the world-context gem at `bodyScale × layerScale` inside a `<g>` translated to
 *  `robotPos` (what GSAP's x/y on the `.robot` group produce) and returns, per corner, the map
 *  from a `.gem__orbiter-local` offset to where that orbiter's centre lands in the scene — built
 *  by walking every rendered `transform` from the orbiter's part up to the `<svg>`. */
function renderChain(gem: RobotGemGeometry, robotPos: Vec2, s: number): (corner: OrbiterCorner, offset: Vec2) => Vec2 {
  const { container } = render(
    <svg>
      <g transform={`translate(${robotPos.x} ${robotPos.y})`}>
        <RobotGem gem={gem} palette={gemPalette(gem, '#41ad9f', 1, [1, 0.15], 20)} lightOpacity={0.7} scale={s} orbiters={WORLD_ORBITERS} bodyLines={BODY_LINES} halo={HALO} />
      </g>
    </svg>,
  );
  return (corner, offset) => {
    const local = container.querySelector(`.gem__orbiter--${CORNER_CLASSES[corner]} > .gem__orbiter-local`)!;
    expect(local.getAttribute('transform')).toBeNull(); // world context: GSAP is the only writer
    const partEl = local.querySelector(':scope > .gem__part')!;
    const part = gem.orbiters[corner];
    // GSAP's x/y on the local group (scale is about the orbiter's own centre, so it never moves it).
    let p = parseTransform(partEl.getAttribute('transform'))({ x: part.w / 2, y: part.h / 2 });
    p = { x: p.x + offset.x, y: p.y + offset.y };
    for (let el: Element | null = local.parentElement; el && el.tagName !== 'svg'; el = el.parentElement) {
      p = parseTransform(el.getAttribute('transform'))(p);
    }
    return p;
  };
}

// ========================================
// TESTS
// ========================================
describe('sceneToOrbiterLocal (docs/specs/ROBOT_JOBS_AND_STATIONS.md §1.9, Task 18)', () => {
  it('round-trips through the real transform chain within 0.01 u — 50 gems × 4 scale pairs × 4 corners', () => {
    const R = alea('task18-roundtrip');
    let checked = 0;
    for (const gemSeed of GEM_SEEDS) {
      const gem = getRobotGem(gemSeed);
      for (const { bodyScale, layerScale } of SCALES) {
        const robotPos = { x: R() * 1900 - 50, y: R() * 900 - 50 };
        const forward = renderChain(gem, robotPos, bodyScale * layerScale);
        for (const corner of CORNERS) {
          const point = { x: robotPos.x + R() * 400 - 150, y: robotPos.y + R() * 300 - 120 };
          const offset = sceneToOrbiterLocal(point, { robotPos, gem, bodyScale, layerScale, corner });
          const landed = forward(corner, offset);
          expect(Math.abs(landed.x - point.x)).toBeLessThan(0.01);
          expect(Math.abs(landed.y - point.y)).toBeLessThan(0.01);
          checked++;
        }
      }
    }
    expect(checked).toBe(50 * 4 * 4);
  });

  it('maps the corner\'s own docked centre to { x: 0, y: 0 } at every scale', () => {
    const gem = getRobotGem(GEM_SEEDS[3]);
    const robotPos = { x: 412.5, y: 233.25 };
    for (const { bodyScale, layerScale } of SCALES) {
      const forward = renderChain(gem, robotPos, bodyScale * layerScale);
      for (const corner of CORNERS) {
        const dock = forward(corner, { x: 0, y: 0 });
        const offset = sceneToOrbiterLocal(dock, { robotPos, gem, bodyScale, layerScale, corner });
        expect(offset.x).toBeCloseTo(0, 9);
        expect(offset.y).toBeCloseTo(0, 9);
      }
    }
  });

  it('divides a scene distance by bodyScale × layerScale (GSAP x/y are canvas units, inside g.gem\'s scale)', () => {
    const gem = getRobotGem(GEM_SEEDS[7]);
    const robotPos = { x: 100, y: 200 };
    const opts = { robotPos, gem, corner: 1 as const };
    const a = sceneToOrbiterLocal({ x: 300, y: 260 }, { ...opts, bodyScale: 1.69, layerScale: 0.75 });
    const b = sceneToOrbiterLocal({ x: 300 + 25.35, y: 260 - 12.675 }, { ...opts, bodyScale: 1.69, layerScale: 0.75 });
    expect(b.x - a.x).toBeCloseTo(25.35 / (1.69 * 0.75), 9);
    expect(b.y - a.y).toBeCloseTo(-12.675 / (1.69 * 0.75), 9);
  });

  it('gives each corner a different offset for the same scene point', () => {
    const gem = getRobotGem(GEM_SEEDS[0]);
    const opts = { robotPos: { x: 0, y: 0 }, gem, bodyScale: 1, layerScale: 1 };
    const offsets = CORNERS.map((corner) => sceneToOrbiterLocal({ x: 50, y: 50 }, { ...opts, corner }));
    expect(new Set(offsets.map((o) => `${o.x},${o.y}`)).size).toBe(4);
  });

  it('throws on a non-positive or NaN combined scale (the inverse does not exist)', () => {
    const gem = getRobotGem(GEM_SEEDS[0]);
    const opts = { robotPos: { x: 0, y: 0 }, gem, corner: 0 as const };
    expect(() => sceneToOrbiterLocal({ x: 1, y: 1 }, { ...opts, bodyScale: 0, layerScale: 1 })).toThrow(RangeError);
    expect(() => sceneToOrbiterLocal({ x: 1, y: 1 }, { ...opts, bodyScale: 1, layerScale: -0.75 })).toThrow(RangeError);
    expect(() => sceneToOrbiterLocal({ x: 1, y: 1 }, { ...opts, bodyScale: Number.NaN, layerScale: 1 })).toThrow(RangeError);
  });
});

describe('robotCentre / positionForCentre (correction 5)', () => {
  it('positionForCentre(robotCentre(r)) === r.position for integer and quarter-unit positions, every width factor', () => {
    for (const gemSeed of GEM_SEEDS) {
      const gem = getRobotGem(gemSeed);
      for (const position of [{ x: 0, y: 0 }, { x: 640, y: 360 }, { x: -120, y: 875.25 }, { x: 1919.5, y: -0.75 }]) {
        expect(positionForCentre(robotCentre({ position }, gem), gem)).toEqual(position);
      }
    }
  });

  it('round-trips arbitrary fractional positions to within float error', () => {
    const R = alea('task18-centre');
    for (const gemSeed of GEM_SEEDS) {
      const gem = getRobotGem(gemSeed);
      const position = { x: R() * 1920, y: R() * 1080 };
      const back = positionForCentre(robotCentre({ position }, gem), gem);
      expect(back.x).toBeCloseTo(position.x, 9);
      expect(back.y).toBeCloseTo(position.y, 9);
    }
  });

  it('the centre is the gem canvas centre (position + width/2, GEM_CANVAS_H/2) — robot.position is the top-left', () => {
    const gem = getRobotGem(GEM_SEEDS[11]);
    expect(robotCentre({ position: { x: 10, y: 20 } }, gem)).toEqual({ x: 10 + gemWidth(gem) / 2, y: 20 + GEM_CANVAS_H / 2 });
  });

  it('is the one point g.gem\'s scale leaves fixed, so it holds at every body and layer scale', () => {
    const gem = getRobotGem(GEM_SEEDS[5]);
    const position = { x: 333, y: 444 };
    const centre = robotCentre({ position }, gem);
    for (const { bodyScale, layerScale } of SCALES) {
      const { container } = render(
        <svg>
          <RobotGem gem={gem} palette={gemPalette(gem, '#41ad9f', 1, [1, 0.15], 20)} lightOpacity={0.7} scale={bodyScale * layerScale} orbiters={WORLD_ORBITERS} bodyLines={BODY_LINES} halo={HALO} />
        </svg>,
      );
      const gemTransform = parseTransform(container.querySelector('g.gem')!.getAttribute('transform'));
      const canvasCentre = { x: centre.x - position.x, y: centre.y - position.y };
      const drawn = gemTransform(canvasCentre);
      expect(drawn.x).toBeCloseTo(canvasCentre.x, 9);
      expect(drawn.y).toBeCloseTo(canvasCentre.y, 9);
    }
  });

  it('returns fresh objects (never aliases the robot\'s stored position)', () => {
    const gem = getRobotGem(GEM_SEEDS[2]);
    const position = { x: 5, y: 6 };
    const back = positionForCentre(robotCentre({ position }, gem), gem);
    expect(back).not.toBe(position);
  });
});
