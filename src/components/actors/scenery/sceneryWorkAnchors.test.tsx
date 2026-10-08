// ========================================
// IMPORTS
// ========================================
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import Alea from 'alea';

import {
  sceneryWorkAnchors,
  outlineYAt,
  ANCHOR_RISE_MAX,
  ANCHORED_KINDS,
  type SceneryAnchors,
} from './sceneryWorkAnchors';
import { deriveSceneryParams, ventTotalHeight } from './sceneryParams';
import { SCENERY_RENDERERS } from './Scenery';
import type { SceneryContext } from './sceneryTypes';
import { getActorBubbleProps } from '../factoryBubbleProps';
import { SCENERY_HOST_JOBS } from '../../../systems/jobHosts';
import { ActorType, type Actor, type SceneryKind } from '../../../types/Actor';
import type { Vec2 } from '../../../types/Vec2';

// ========================================
// HELPERS
// ========================================

const SEEDS_PER_KIND = 50;
const EPS = 1e-6;

function sceneryActor(kind: SceneryKind, i: number): Actor {
  const prng = Alea(`anchors-${kind}-${i}`);
  return {
    id: `anchors-${kind}-${i}`,
    type: ActorType.SCENERY,
    position: { x: Math.round(300 + prng() * 1300), y: Math.round(880 + prng() * 160) },
    isActive: false,
    config: { kind, district: 'dense', row: 0 },
  };
}

function anchorsOf(actor: Actor, foreground: boolean): SceneryAnchors {
  const a = sceneryWorkAnchors(actor, { foreground, rand: Alea(`${actor.id}:work`) });
  if (!a) throw new Error(`no anchors for ${actor.id}`);
  return a;
}

function renderKind(actor: Actor): HTMLElement {
  const kind = actor.config!.kind!;
  const ctx: SceneryContext = {
    actor,
    params: deriveSceneryParams(actor),
    cap: 1,
    eastL: 0.9,
    westL: 0.6,
    nightDepth: 0,
    accent: { primary: 0, secondary: 30 },
    gems: true,
  };
  return render(SCENERY_RENDERERS[kind]!(ctx)).container;
}

const num = (el: Element, attr: string) => Number(el.getAttribute(attr));

/** Translucent light and water, not silhouette: plumes, the floodlight's beam and ground pool. */
const DECORATION = '[data-vent="plume"], [data-floodlight="beam"], [data-floodlight="pool"]';

/** The `rotate(deg cx cy)` on the element's nearest transformed ancestor, as a point mapper. */
function rotationOf(el: Element): (p: Vec2) => Vec2 {
  const g = el.closest('g[transform]');
  const m = g?.getAttribute('transform')?.match(/rotate\(\s*([-\d.e]+)\s+([-\d.e]+)\s+([-\d.e]+)\s*\)/);
  if (!m) return (p) => p;
  const [deg, cx, cy] = m.slice(1).map(Number);
  const c = Math.cos((deg * Math.PI) / 180);
  const s = Math.sin((deg * Math.PI) / 180);
  return ({ x, y }) => ({ x: cx + (x - cx) * c - (y - cy) * s, y: cy + (x - cx) * s + (y - cy) * c });
}

function extentOf(el: Element, pts: Vec2[]) {
  const xs = pts.map((p) => p.x); const ys = pts.map((p) => p.y);
  return { el, x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

/**
 * Every drawn rect/polygon/circle/ellipse's extent, through any `rotate` on its group (turbine
 * blades, the dish). Decoration and arc paths are skipped.
 */
function shapeExtents(container: HTMLElement): { el: Element; x0: number; y0: number; x1: number; y1: number }[] {
  const out: { el: Element; x0: number; y0: number; x1: number; y1: number }[] = [];
  const drawn = (sel: string) => [...container.querySelectorAll(sel)].filter((el) => !el.matches(DECORATION));
  for (const el of drawn('rect')) {
    const x = num(el, 'x'); const y = num(el, 'y'); const w = num(el, 'width'); const h = num(el, 'height');
    const rot = rotationOf(el);
    out.push(extentOf(el, [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }].map(rot)));
  }
  for (const el of drawn('circle')) {
    const cx = num(el, 'cx'); const cy = num(el, 'cy'); const r = num(el, 'r');
    const c = rotationOf(el)({ x: cx, y: cy });
    out.push({ el, x0: c.x - r, y0: c.y - r, x1: c.x + r, y1: c.y + r });
  }
  for (const el of drawn('ellipse')) {
    // A rotated ellipse's exact box: half-sizes √(rx²cos² + ry²sin²) and √(rx²sin² + ry²cos²).
    const rx = num(el, 'rx'); const ry = num(el, 'ry');
    const m = el.closest('g[transform]')?.getAttribute('transform')?.match(/rotate\(\s*([-\d.e]+)/);
    const phi = ((m ? Number(m[1]) : 0) * Math.PI) / 180;
    const c = rotationOf(el)({ x: num(el, 'cx'), y: num(el, 'cy') });
    const hx = Math.hypot(rx * Math.cos(phi), ry * Math.sin(phi));
    const hy = Math.hypot(rx * Math.sin(phi), ry * Math.cos(phi));
    out.push({ el, x0: c.x - hx, y0: c.y - hy, x1: c.x + hx, y1: c.y + hy });
  }
  for (const el of drawn('polygon')) {
    const pts = (el.getAttribute('points') ?? '').trim().split(/\s+/).map((p) => p.split(',').map(Number));
    out.push(extentOf(el, pts.map(([x, y]) => rotationOf(el)({ x, y }))));
  }
  return out;
}

function within(p: Vec2, a: SceneryAnchors): boolean {
  const { x0, y0, x1, y1 } = a.bounds;
  return p.x >= x0 - EPS && p.x <= x1 + EPS && p.y <= y1 + EPS && p.y >= y0 - ANCHOR_RISE_MAX - EPS;
}

/** On or above the outline — a point on a vertical step's edge is on it, at either end. */
function onOrAboveOutline(p: Vec2, a: SceneryAnchors): boolean {
  const y = outlineYAt(a.outline, p.x);
  if (y === null) return false;
  if (p.y <= y + EPS) return true;
  return a.outline.some((q, i) => {
    const r = a.outline[i + 1];
    return r !== undefined && Math.abs(q.x - p.x) < EPS && Math.abs(r.x - p.x) < EPS && p.y <= Math.max(q.y, r.y) + EPS;
  });
}

const close = (a: Vec2, b: Vec2) => {
  expect(a.x).toBeCloseTo(b.x, 6);
  expect(a.y).toBeCloseTo(b.y, 6);
};

/** Every vertex of both paths (spec §1.5: outline always, pipe where the kind has one). */
const pathVertices = (a: SceneryAnchors) => [...a.paths.outline, ...(a.paths.pipe ?? [])];

// ========================================
// TESTS
// ========================================

describe('outlineYAt', () => {
  it('interpolates a sloped segment and takes the higher (smaller y) side of a vertical step', () => {
    const outline = [{ x: 0, y: 10 }, { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 30 }, { x: 40, y: 30 }];
    expect(outlineYAt(outline, 5)).toBeCloseTo(5, 9);
    expect(outlineYAt(outline, 15)).toBe(0);
    expect(outlineYAt(outline, 20)).toBe(0);
    expect(outlineYAt(outline, 30)).toBe(30);
  });

  it('is null outside the outline\'s x range', () => {
    const outline = [{ x: 0, y: 0 }, { x: 10, y: 0 }];
    expect(outlineYAt(outline, -1)).toBeNull();
    expect(outlineYAt(outline, 11)).toBeNull();
  });
});

/** Every scenery kind that hosts a job (spec §1.3) — group A (Task 10) and group B (Task 11). */
const HOST_KINDS = (Object.keys(SCENERY_HOST_JOBS) as SceneryKind[]).filter((k) => SCENERY_HOST_JOBS[k].length > 0);

describe('sceneryWorkAnchors (Phase 43 Tasks 10–11, spec §1.5)', () => {
  it('covers every host kind, and only those', () => {
    expect([...ANCHORED_KINDS].sort()).toEqual([...HOST_KINDS].sort());
    expect(HOST_KINDS).toHaveLength(13);
  });

  it('null for a non-host kind (wall, boulder, tether), and for an actor with no kind', () => {
    for (const kind of ['wall', 'boulder', 'tether'] as SceneryKind[]) {
      expect(sceneryWorkAnchors(sceneryActor(kind, 0), { foreground: true, rand: Alea('x') }), kind).toBeNull();
    }
    const bare: Actor = { id: 'bare', type: ActorType.SCENERY, position: { x: 0, y: 0 }, isActive: false };
    expect(sceneryWorkAnchors(bare, { foreground: true, rand: Alea('x') })).toBeNull();
  });

  it('null when the params lack the actor\'s kind', () => {
    for (const kind of HOST_KINDS) {
      expect(sceneryWorkAnchors(sceneryActor(kind, 0), { foreground: false, rand: Alea('x') }, {}), kind).toBeNull();
    }
  });

  for (const kind of HOST_KINDS) {
    describe(kind, () => {
      const actors = Array.from({ length: SEEDS_PER_KIND }, (_, i) => sceneryActor(kind, i));

      it(`over ${SEEDS_PER_KIND} seeds and both depths: 2–4 points, path ≥ 2, everything inside the bounds (or ≤ ${40} above)`, () => {
        for (const actor of actors) {
          for (const foreground of [true, false]) {
            const a = anchorsOf(actor, foreground);
            expect(a.points.length, actor.id).toBeGreaterThanOrEqual(2);
            expect(a.points.length, actor.id).toBeLessThanOrEqual(4);
            expect(a.paths.outline.length, actor.id).toBeGreaterThanOrEqual(2);
            if (a.paths.pipe) expect(a.paths.pipe.length, actor.id).toBeGreaterThanOrEqual(2);
            expect(a.outline.length, actor.id).toBeGreaterThanOrEqual(2);
            for (const p of [...a.points, ...pathVertices(a)]) expect(within(p, a), `${actor.id} ${JSON.stringify(p)}`).toBe(true);
          }
        }
      });

      it('foreground: every point and path vertex on or above the top outline', () => {
        for (const actor of actors) {
          const a = anchorsOf(actor, true);
          for (const p of [...a.points, ...pathVertices(a)]) {
            expect(onOrAboveOutline(p, a), `${actor.id} ${JSON.stringify(p)}`).toBe(true);
          }
        }
      });

      it('the outline is x-monotonic and spans the bounds\' top: its highest vertex is bounds.y0', () => {
        for (const actor of actors) {
          const a = anchorsOf(actor, false);
          for (let i = 1; i < a.outline.length; i++) expect(a.outline[i].x).toBeGreaterThanOrEqual(a.outline[i - 1].x);
          expect(Math.min(...a.outline.map((p) => p.y))).toBeCloseTo(a.bounds.y0, 6);
        }
      });

      it('bounds hold every drawn shape (render parity; ≤ 40 above for mast lights, ≤ 3 for stroke-like overhang)', () => {
        for (const actor of actors.slice(0, 15)) {
          const a = anchorsOf(actor, false);
          const shapes = shapeExtents(renderKind(actor));
          expect(shapes.length).toBeGreaterThan(0);
          for (const s of shapes) {
            expect(s.x0, actor.id).toBeGreaterThanOrEqual(a.bounds.x0 - 3);
            expect(s.x1, actor.id).toBeLessThanOrEqual(a.bounds.x1 + 3);
            expect(s.y1, actor.id).toBeLessThanOrEqual(a.bounds.y1 + 3);
            expect(s.y0, actor.id).toBeGreaterThanOrEqual(a.bounds.y0 - ANCHOR_RISE_MAX);
          }
          // The body itself reaches the bounds' top (no slack above the silhouette).
          expect(Math.min(...shapes.map((s) => s.y0))).toBeLessThanOrEqual(a.bounds.y0 + EPS);
        }
      });

      it('deterministic: same actor, same anchors; another seed, different points', () => {
        const [first, second] = actors;
        expect(anchorsOf(first, true)).toEqual(anchorsOf(structuredClone(first), true));
        expect(anchorsOf(first, false).points).not.toEqual(anchorsOf(second, false).points);
      });
    });
  }

  describe('render parity — each named anchor is the element it names', () => {
    it('tank: midground points[0] is the gauge; foreground keeps to the flat top between the shoulders', () => {
      const actor = sceneryActor('tank', 3);
      const gauge = renderKind(actor).querySelector('circle')!;
      close(anchorsOf(actor, false).points[0], { x: num(gauge, 'cx'), y: num(gauge, 'cy') });
      const fg = anchorsOf(actor, true);
      const p = deriveSceneryParams(actor).tank!;
      const top = actor.position.y - p.h;
      for (const pt of fg.points) expect(pt.y).toBeCloseTo(top, 6);
    });

    it('dome: points[0] is the mast head, points[1] a porthole; midground adds the hatch', () => {
      for (const actor of [0, 1, 2, 3].map((i) => sceneryActor('dome', i))) {
        const c = renderKind(actor);
        const portholes = [...c.querySelectorAll('[data-dome="porthole"]')].map((el) => ({ x: num(el, 'cx'), y: num(el, 'cy') }));
        const light = c.querySelector('[data-dome="mast-light"]')!;
        const mid = anchorsOf(actor, false);
        close(mid.points[0], { x: num(light, 'cx'), y: num(light, 'cy') });
        expect(portholes.some((p) => Math.abs(p.x - mid.points[1].x) < 1e-6 && Math.abs(p.y - mid.points[1].y) < 1e-6)).toBe(true);
        const hatch = [...c.querySelectorAll('rect')].find((r) => num(r, 'width') === 28)!;
        close(mid.points[2], { x: num(hatch, 'x') + 14, y: num(hatch, 'y') + num(hatch, 'height') / 2 });
        const fg = anchorsOf(actor, true);
        for (const pt of fg.points.slice(1)) {
          expect(portholes.some((p) => Math.abs(p.x - pt.x) < 1e-6 && Math.abs(p.y - pt.y) < 1e-6)).toBe(true);
        }
        expect(fg.points[1]).not.toEqual(fg.points[2]);
      }
    });

    it('scaffold: points[0] is the top-corner light; midground points[1] is a brace\'s centre', () => {
      const actor = sceneryActor('scaffold', 5);
      const c = renderKind(actor);
      const light = c.querySelector('[data-scaffold="light"]')!;
      const mid = anchorsOf(actor, false);
      close(mid.points[0], { x: num(light, 'cx'), y: num(light, 'cy') });
      const braceCentres = [...c.querySelectorAll('[data-scaffold="brace"]')].map((el) => {
        const pts = el.getAttribute('points')!.split(' ').map((p) => p.split(',').map(Number));
        return { x: (pts[0][0] + pts[2][0]) / 2, y: (pts[0][1] + pts[2][1]) / 2 };
      });
      expect(braceCentres.some((b) => Math.abs(b.x - mid.points[1].x) < 1e-6 && Math.abs(b.y - mid.points[1].y) < 1e-6)).toBe(true);
    });

    it('containers: midground points are two bottom-row labels, a left of b, then the stack top', () => {
      for (const actor of [0, 1, 2, 3, 4].map((i) => sceneryActor('containers', i))) {
        const c = renderKind(actor);
        const labels = [...c.querySelectorAll('[data-container-row="0"] [data-container="label"]')].map((el) => ({
          x: num(el, 'x') + num(el, 'width') / 2,
          y: num(el, 'y') + num(el, 'height') / 2,
        }));
        const mid = anchorsOf(actor, false);
        const has = (p: Vec2) => labels.some((l) => Math.abs(l.x - p.x) < 1e-6 && Math.abs(l.y - p.y) < 1e-6);
        expect(has(mid.points[0])).toBe(true);
        expect(has(mid.points[1])).toBe(true);
        expect(mid.points[0].x).toBeLessThan(mid.points[1].x);
        const rowsEls = c.querySelectorAll('[data-container-row]');
        const topRow = rowsEls[rowsEls.length - 1];
        const boxes = [...topRow.querySelectorAll('[data-container="box"]')];
        const x0 = num(boxes[0], 'x');
        const x1 = num(boxes[boxes.length - 1], 'x') + num(boxes[0], 'width');
        close(mid.points[2], { x: (x0 + x1) / 2, y: num(boxes[0], 'y') });
        const fg = anchorsOf(actor, true);
        expect(fg.points[0].x).toBeLessThan(fg.points[1].x);
      }
    });

    it('wreck: points are a stern deck point, the funnel top and a bow point, left to right', () => {
      const actor = sceneryActor('wreck', 2);
      const funnel = renderKind(actor).querySelector('[data-wreck="funnel"]')!;
      const a = anchorsOf(actor, true);
      close(a.points[1], { x: num(funnel, 'x') + num(funnel, 'width') / 2, y: num(funnel, 'y') });
      expect(a.points[0].x).toBeLessThan(a.points[1].x);
      expect(a.points[1].x).toBeLessThan(a.points[2].x);
    });

    it('vent: points[0] is the mouth — the glow, and where the bubbles leave — points[1] the plume above it', () => {
      for (const actor of [0, 1, 2].map((i) => sceneryActor('vent', i))) {
        const c = renderKind(actor);
        const glow = c.querySelector('[data-vent="mouth-glow"]')!;
        const a = anchorsOf(actor, true);
        close(a.points[0], { x: num(glow, 'cx'), y: num(glow, 'cy') });
        const bubbles = getActorBubbleProps(actor)!;
        close(a.points[0], { x: bubbles.ventX, y: bubbles.ventY });
        expect(a.points[0].y).toBeCloseTo(actor.position.y - ventTotalHeight(deriveSceneryParams(actor).vent!), 6);
        const plume = c.querySelector('[data-vent="plume"]')!;
        close(a.points[1], { x: num(plume, 'cx'), y: num(plume, 'cy') });
      }
    });

    /** The centre of the gem head's outline polygon. */
    const gemExtent = (c: HTMLElement) => shapeExtents(c.querySelector('[data-shape="gem"]') as HTMLElement)[0];
    const gemCentre = (c: HTMLElement): Vec2 => {
      const { x0, y0, x1, y1 } = gemExtent(c);
      return { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
    };
    const gemTop = (c: HTMLElement): number => gemExtent(c).y0;

    it('crane: beam ends left and right; foreground the hanger\'s top on the beam, midground the load', () => {
      for (const actor of [0, 1, 2].map((i) => sceneryActor('crane', i))) {
        const c = renderKind(actor);
        const beam = c.querySelector('[data-crane="beam"]')!;
        const hanger = c.querySelector('[data-crane="hanger"]')!;
        const load = c.querySelector('[data-crane="load"]')!;
        const light = c.querySelector('[data-crane="beam-end-light"]')!;
        const beamLeft = { x: num(beam, 'x'), y: num(beam, 'y') };
        const beamRight = { x: num(beam, 'x') + num(beam, 'width'), y: num(beam, 'y') };
        const fg = anchorsOf(actor, true);
        close(fg.points[0], beamLeft);
        close(fg.points[1], { x: num(hanger, 'x1'), y: num(beam, 'y') });
        close(fg.points[2], beamRight);
        const mid = anchorsOf(actor, false);
        close(mid.points[0], beamLeft);
        close(mid.points[1], { x: num(load, 'x') + num(load, 'width') / 2, y: num(load, 'y') + num(load, 'height') / 2 });
        close(mid.points[2], { x: num(light, 'cx'), y: num(light, 'cy') });
        expect(fg.paths.outline).toHaveLength(2);
        close(fg.paths.outline[0], beamLeft);
        close(fg.paths.outline[1], beamRight);
      }
    });

    it('pylon: points[0] is the head; foreground the tower\'s top corners, midground both ends of one cross-arm', () => {
      for (const actor of [0, 1, 2, 3].map((i) => sceneryActor('pylon', i))) {
        const c = renderKind(actor);
        const head = gemCentre(c);
        const tower = shapeExtents(c).find((s) => s.el.matches('polygon') &&!s.el.closest('[data-shape="gem"]'))!;
        const fg = anchorsOf(actor, true);
        close(fg.points[0], head);
        expect(fg.points[1].y).toBeCloseTo(tower.y0, 6);
        expect(fg.points[2].y).toBeCloseTo(tower.y0, 6);
        const mid = anchorsOf(actor, false);
        close(mid.points[0], head);
        const arms = [...c.querySelectorAll('[data-scenery="pylon"] > rect')].map((r) => ({
          x0: num(r, 'x'), x1: num(r, 'x') + num(r, 'width'), y: num(r, 'y'),
        }));
        expect(arms).toHaveLength(3);
        const arm = arms.find((a) => Math.abs(a.y - mid.points[1].y) < 1e-6)!;
        expect(arm).toBeDefined();
        close(mid.points[1], { x: arm.x0, y: arm.y });
        close(mid.points[2], { x: arm.x1, y: arm.y });
      }
    });

    it('pylon: over the seeds, the midground arm is chosen by the seed (more than one arm used)', () => {
      const ys = new Set(Array.from({ length: 20 }, (_, i) => {
        const actor = sceneryActor('pylon', i);
        const p = deriveSceneryParams(actor).pylon!;
        return Math.round(((actor.position.y - anchorsOf(actor, false).points[1].y) / p.h) * 4);
      }));
      expect(ys.size).toBeGreaterThan(1);
    });

    it('beacon: every point is on the gem; foreground keeps to its top edge, midground adds its centre', () => {
      for (const actor of [0, 1, 2].map((i) => sceneryActor('beacon', i))) {
        const c = renderKind(actor);
        const top = gemTop(c);
        const fg = anchorsOf(actor, true);
        for (const p of fg.points) expect(p.y).toBeCloseTo(top, 6);
        const mid = anchorsOf(actor, false);
        close(mid.points[0], gemCentre(c));
        expect(mid.points[1].y).toBeCloseTo(top, 6);
        expect(fg.bounds.y0).toBeCloseTo(top, 6);
      }
    });

    it('pipeline: the valve, the riser\'s top, then a point on the run; paths.pipe is the pipe run beside the riser, paths.outline the top outline', () => {
      for (const actor of [0, 1, 2, 3].map((i) => sceneryActor('pipeline', i))) {
        const c = renderKind(actor);
        const valve = c.querySelector('[data-pipeline="valve"]')!;
        const flange = c.querySelector('[data-pipeline="flange"]')!;
        const pipe = c.querySelector('[data-pipeline="pipe"]')!;
        for (const foreground of [true, false]) {
          const a = anchorsOf(actor, foreground);
          close(a.points[0], { x: num(valve, 'cx'), y: num(valve, 'cy') });
          close(a.points[1], { x: num(flange, 'x') + num(flange, 'width') / 2, y: num(flange, 'y') });
          expect(a.points[2].y).toBeCloseTo(num(pipe, 'y'), 6);
          const run = a.paths.pipe!;
          expect(run).toHaveLength(2);
          for (const v of run) expect(v.y).toBeCloseTo(num(pipe, 'y'), 6);
          // The run never passes under the flange.
          const fx0 = num(flange, 'x'); const fx1 = fx0 + num(flange, 'width');
          for (const p of [a.points[2], ...run]) expect(p.x <= fx0 + 1e-6 || p.x >= fx1 - 1e-6).toBe(true);
          expect(run[1].x - run[0].x).toBeGreaterThan(0);
          expect(a.paths.outline).toEqual(a.outline);
        }
      }
    });

    it('only the pipeline has a pipe; every other kind\'s paths are the outline alone (spec §1.5)', () => {
      for (const kind of HOST_KINDS.filter((k) => k !== 'pipeline')) {
        for (const foreground of [true, false]) {
          const a = anchorsOf(sceneryActor(kind, 0), foreground);
          expect(Object.keys(a.paths), kind).toEqual(['outline']);
        }
      }
    });

    it('turbine: midground points[0] is the hub; foreground keeps to the upper blade edge', () => {
      for (const actor of [0, 1, 2].map((i) => sceneryActor('turbine', i))) {
        const c = renderKind(actor);
        const hub = c.querySelector('[data-turbine="hub"]')!;
        close(anchorsOf(actor, false).points[0], { x: num(hub, 'cx'), y: num(hub, 'cy') });
        const blades = shapeExtents(c).filter((s) => s.el.getAttribute('data-turbine') === 'blade');
        const fg = anchorsOf(actor, true);
        // The topmost blade corner is the bounds' top and one of the foreground points.
        const tipY = Math.min(...blades.map((b) => b.y0));
        expect(fg.bounds.y0).toBeCloseTo(tipY, 6);
        expect(fg.points.some((p) => Math.abs(p.y - tipY) < 1e-6)).toBe(true);
      }
    });

    it('floodlight: foreground keeps to the head\'s top; midground points[0] is the lit bar', () => {
      for (const actor of [0, 1, 2].map((i) => sceneryActor('floodlight', i))) {
        const c = renderKind(actor);
        const head = c.querySelector('[data-floodlight="head"]')!;
        const bar = c.querySelector('[data-floodlight="lit-bar"]')!;
        const fg = anchorsOf(actor, true);
        for (const p of fg.points) {
          expect(p.y).toBeCloseTo(num(head, 'y'), 6);
          expect(p.x).toBeGreaterThanOrEqual(num(head, 'x'));
          expect(p.x).toBeLessThanOrEqual(num(head, 'x') + num(head, 'width'));
        }
        close(anchorsOf(actor, false).points[0], { x: num(bar, 'x') + num(bar, 'width') / 2, y: num(bar, 'y') + num(bar, 'height') / 2 });
      }
    });

    it('dish: midground points are the centre light and the feed\'s tip; the bounds hold the tilted reflector', () => {
      for (const actor of [0, 1, 2, 3].map((i) => sceneryActor('dish', i))) {
        const c = renderKind(actor);
        const light = c.querySelector('[data-dish="centre-light"]')!;
        const feed = c.querySelector('[data-dish="feed"]')!;
        const rot = rotationOf(feed);
        const tip = rot({ x: num(feed, 'x') + num(feed, 'width') / 2, y: num(feed, 'y') });
        const mid = anchorsOf(actor, false);
        close(mid.points[0], { x: num(light, 'cx'), y: num(light, 'cy') });
        close(mid.points[1], tip);
        const reflector = shapeExtents(c).find((s) => s.el.getAttribute('data-dish') === 'reflector')!;
        expect(mid.bounds.y0).toBeCloseTo(reflector.y0, 6);
      }
    });
  });

  describe('anchors read the scenery params, nothing else', () => {
    it('a param change moves the anchors (tank: taller tank, higher top and gauge)', () => {
      const actor = sceneryActor('tank', 7);
      const base = deriveSceneryParams(actor).tank!;
      const taller = { ...base, h: base.h + 40 };
      const a = sceneryWorkAnchors(actor, { foreground: false, rand: Alea('p') }, { tank: base })!;
      const b = sceneryWorkAnchors(actor, { foreground: false, rand: Alea('p') }, { tank: taller })!;
      expect(b.bounds.y0).toBeCloseTo(a.bounds.y0 - 40, 6);
      expect(b.points[0].y).toBeLessThan(a.points[0].y);
    });

    it('a group-B param change moves the anchors (crane: hanger slid right, hanger point follows)', () => {
      const actor = sceneryActor('crane', 4);
      const base = deriveSceneryParams(actor).crane!;
      const slid = { ...base, hangerFrac: base.hangerFrac + 0.1 };
      const a = sceneryWorkAnchors(actor, { foreground: true, rand: Alea('p') }, { crane: base })!;
      const b = sceneryWorkAnchors(actor, { foreground: true, rand: Alea('p') }, { crane: slid })!;
      expect(b.points[1].x).toBeCloseTo(a.points[1].x + 0.1 * base.w, 6);
    });

    it('by default the params are deriveSceneryParams(actor)\'s', () => {
      const actor = sceneryActor('dome', 9);
      const a = sceneryWorkAnchors(actor, { foreground: false, rand: Alea('p') });
      const b = sceneryWorkAnchors(actor, { foreground: false, rand: Alea('p') }, deriveSceneryParams(actor));
      expect(a).toEqual(b);
    });
  });
});
