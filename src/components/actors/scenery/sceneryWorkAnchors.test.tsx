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

/** Every drawn rect/polygon/circle's extent (plumes and arc paths are decoration, skipped). */
function shapeExtents(container: HTMLElement): { el: Element; x0: number; y0: number; x1: number; y1: number }[] {
  const out: { el: Element; x0: number; y0: number; x1: number; y1: number }[] = [];
  container.querySelectorAll('rect').forEach((el) => {
    const x = num(el, 'x'); const y = num(el, 'y');
    out.push({ el, x0: x, y0: y, x1: x + num(el, 'width'), y1: y + num(el, 'height') });
  });
  container.querySelectorAll('circle').forEach((el) => {
    const cx = num(el, 'cx'); const cy = num(el, 'cy'); const r = num(el, 'r');
    out.push({ el, x0: cx - r, y0: cy - r, x1: cx + r, y1: cy + r });
  });
  container.querySelectorAll('polygon').forEach((el) => {
    const pts = (el.getAttribute('points') ?? '').trim().split(/\s+/).map((p) => p.split(',').map(Number));
    const xs = pts.map((p) => p[0]); const ys = pts.map((p) => p[1]);
    out.push({ el, x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) });
  });
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

describe('sceneryWorkAnchors â€” group A (Phase 43 Task 10, spec Â§1.5)', () => {
  it('covers tank, dome, scaffold, containers, wreck and vent', () => {
    expect([...ANCHORED_KINDS].sort()).toEqual(['containers', 'dome', 'scaffold', 'tank', 'vent', 'wreck']);
  });

  it('null for a kind without anchors yet, and for an actor with no kind', () => {
    const wall = sceneryActor('wall', 0);
    expect(sceneryWorkAnchors(wall, { foreground: true, rand: Alea('x') })).toBeNull();
    const bare: Actor = { id: 'bare', type: ActorType.SCENERY, position: { x: 0, y: 0 }, isActive: false };
    expect(sceneryWorkAnchors(bare, { foreground: true, rand: Alea('x') })).toBeNull();
  });

  for (const kind of ['tank', 'dome', 'scaffold', 'containers', 'wreck', 'vent'] as SceneryKind[]) {
    describe(kind, () => {
      const actors = Array.from({ length: SEEDS_PER_KIND }, (_, i) => sceneryActor(kind, i));

      it(`over ${SEEDS_PER_KIND} seeds and both depths: 2â€“4 points, path â‰¥ 2, everything inside the bounds (or â‰¤ ${40} above)`, () => {
        for (const actor of actors) {
          for (const foreground of [true, false]) {
            const a = anchorsOf(actor, foreground);
            expect(a.points.length, actor.id).toBeGreaterThanOrEqual(2);
            expect(a.points.length, actor.id).toBeLessThanOrEqual(4);
            expect(a.path.length, actor.id).toBeGreaterThanOrEqual(2);
            expect(a.outline.length, actor.id).toBeGreaterThanOrEqual(2);
            for (const p of [...a.points, ...a.path]) expect(within(p, a), `${actor.id} ${JSON.stringify(p)}`).toBe(true);
          }
        }
      });

      it('foreground: every point and path vertex on or above the top outline', () => {
        for (const actor of actors) {
          const a = anchorsOf(actor, true);
          for (const p of [...a.points, ...a.path]) {
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

      it('bounds hold every drawn shape (render parity; â‰¤ 40 above for mast lights, â‰¤ 3 for stroke-like overhang)', () => {
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

  describe('render parity â€” each named anchor is the element it names', () => {
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

    it('vent: points[0] is the mouth â€” the glow, and where the bubbles leave â€” points[1] the plume above it', () => {
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

    it('by default the params are deriveSceneryParams(actor)\'s', () => {
      const actor = sceneryActor('dome', 9);
      const a = sceneryWorkAnchors(actor, { foreground: false, rand: Alea('p') });
      const b = sceneryWorkAnchors(actor, { foreground: false, rand: Alea('p') }, deriveSceneryParams(actor));
      expect(a).toEqual(b);
    });
  });
});
