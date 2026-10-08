// ========================================
// IMPORTS
// ========================================
import { describe, it, expect, beforeAll } from 'vitest';
import { render } from '@testing-library/react';

import { actorSilhouettes, midgroundSilhouettes, getMidgroundSilhouettes, groundSilhouettes } from './midgroundSilhouettes';
import { placeDistrict } from './districts';
import { getRecipeRow } from './factoryPlacementSystem';
import { SIM_SEED_COORDS } from './lifecycleSim';
import { getTerrainProfile, groundYAt } from './terrainProfile';
import type { Box } from './stations';
import { Factory } from '../components/actors/Factory';
import { factoryGeometry } from '../components/actors/factoryGeometry';
import { Scenery } from '../components/actors/scenery/Scenery';
import { PipeBridges } from '../components/actors/scenery/pipeBridges';
import { pipeBridgeLayout } from '../components/actors/scenery/pipeBridgeLayout';
import { useAttenuationStyleStore } from '../stores/attenuationStyleStore';
import { useLocaleStore } from '../stores/localeStore';
import { useUIStore } from '../stores/uiStore';
import { getLocaleNoiseMap } from '../utils/noiseMaps';
import { shapeExtents, unionExtent, type ShapeExtent } from '../testUtils/svgShapeExtents';
import { WORLD_BOUNDS } from '../constants/sceneDepth';
import { ActorType, type Actor, type DistrictName } from '../types/Actor';

// ========================================
// FIXTURES
// ========================================
const depthOf = (a: Actor) => getRecipeRow(a.config?.district ?? 'dense', a.config?.row ?? -1)?.depth;

interface World {
  id: string;
  actors: Actor[];
}

/** Every world on the 121-seed grid, placed by the real district placer. */
let WORLDS: World[] = [];
let MIDGROUND: Actor[] = [];

function registerLocale(id: string, x: number, y: number): void {
  useLocaleStore.getState().addLocale('pelagos', {
    id, attenuationStyleId: 'pelagos', name: id, coordinates: { x, y },
    dayStartTimestamp: 0, createdAtMeasure: 0, robots: [], actors: [], companies: [], currentMeasure: 0,
  });
}

beforeAll(() => {
  useAttenuationStyleStore.setState({
    attenuationStyles: [{ id: 'pelagos', name: 'Pelagos', locales: [], currentLocaleId: null }],
    currentAttenuationStyleId: 'pelagos',
  } as never);
  useUIStore.setState({ activeLocaleLocalTime: 3 }); // night: every lamp lit
  WORLDS = SIM_SEED_COORDS.map(({ x, y }) => {
    const id = `silhouettes-${x}-${y}`;
    registerLocale(id, x, y);
    return { id, actors: placeDistrict(id) };
  });
  MIDGROUND = WORLDS.flatMap((w) => w.actors.filter((a) => depthOf(a) === 'midground'));
});

/** Up to `n` midground actors of `type` per district. */
function sample(type: ActorType, n: number): [DistrictName, Actor[]][] {
  const byDistrict = new Map<DistrictName, Actor[]>();
  for (const a of MIDGROUND) {
    if (a.type !== type) continue;
    const d = a.config!.district as DistrictName;
    const list = byDistrict.get(d) ?? [];
    if (list.length < n) list.push(a);
    byDistrict.set(d, list);
  }
  return [...byDistrict];
}

const inside = (s: { x0: number; y0: number; x1: number; y1: number }, b: Box, eps = 1e-6) =>
  s.x0 >= b.x0 - eps && s.y0 >= b.y0 - eps && s.x1 <= b.x1 + eps && s.y1 <= b.y1 + eps;

function expectCovered(shapes: ShapeExtent[], boxes: Box[], where: string) {
  for (const s of shapes) {
    expect(boxes.some((b) => inside(s, b)), `${where}: ${s.el.outerHTML.slice(0, 160)} not inside ${JSON.stringify(boxes)}`).toBe(true);
  }
}

/** Tight, not just covering: the box is what's drawn, within `tol` (the DOM side samples arcs). */
function expectTight(box: Box | undefined, drawn: Box | null, where: string, tol = 1e-3) {
  expect(box, where).toBeDefined();
  expect(drawn, where).not.toBeNull();
  for (const k of ['x0', 'y0', 'x1', 'y1'] as const) expect(Math.abs(box![k] - drawn![k]), `${where} ${k}`).toBeLessThanOrEqual(tol);
}

/** A rendered factory's drawn shapes in scene units: the body box (its scaled 100×100 rect) and
 *  every rooftop shape, which sits in the outer translate only. */
function factoryShapes(actor: Actor): ShapeExtent[] {
  const { container } = render(<svg><Factory actor={actor} /></svg>);
  const outer = container.querySelector('g[data-factory-type]')!;
  const m = outer.getAttribute('transform')!.match(/translate\(\s*([-\d.e]+)[\s,]+([-\d.e]+)\s*\)/)!;
  const [tx, ty] = [Number(m[1]), Number(m[2])];
  const roof = outer.cloneNode(true) as Element;
  for (const child of [...roof.children]) {
    if (child.tagName === 'defs' || child.getAttribute('transform')?.startsWith('scale')) child.remove();
  }
  const body = factoryGeometry(actor).box;
  return [
    { el: outer, ...body },
    ...shapeExtents(roof).map((s) => ({ ...s, x0: s.x0 + tx, x1: s.x1 + tx, y0: s.y0 + ty, y1: s.y1 + ty })),
  ];
}

// ========================================
// TESTS
// ========================================
describe('midground silhouettes (Phase 43 Task 32, spec §1.10) — what a layer switch must clear', () => {
  it('every midground actor on the grid has at least one silhouette — boulders included', () => {
    expect(MIDGROUND.length).toBeGreaterThan(500);
    const kinds = new Set<string>();
    for (const a of MIDGROUND) {
      expect(actorSilhouettes(a).length, a.id).toBeGreaterThan(0);
      kinds.add(a.type === ActorType.FACTORY ? factoryGeometry(a).variant : a.config!.kind!);
    }
    expect(kinds).toContain('boulder');
  });

  it('a factory: its body box, and its rooftop greeble box when it has one', () => {
    // Machinery can draw no stacks at all; every other greeble always draws.
    const withGreeble = MIDGROUND.find((a) => a.type === ActorType.FACTORY && a.config?.rooftopGreeble && a.config.rooftopGreeble !== 'machinery')!;
    const boxes = actorSilhouettes(withGreeble);
    expect(boxes[0]).toEqual(factoryGeometry(withGreeble).box);
    expect(boxes).toHaveLength(2);
    expect(boxes[1].y1).toBeGreaterThan(boxes[0].y0); // it sits on the roof
    expect(actorSilhouettes({ ...withGreeble, config: { ...withGreeble.config, rooftopGreeble: undefined } })).toEqual([boxes[0]]);
  });

  describe('factories: the body box and the rooftop box are exactly what <Factory> draws', () => {
    it.each(['dense', 'outskirts', 'towers', 'yard', 'derelict', 'habitat', 'wreckfield', 'ventfield', 'construction'] as const)('%s', (district) => {
      const actors = sample(ActorType.FACTORY, 25).find(([d]) => d === district)?.[1] ?? [];
      for (const a of actors) {
        const shapes = factoryShapes(a);
        const boxes = actorSilhouettes(a);
        expectCovered(shapes, boxes, a.id);
        expect(boxes[0], a.id).toEqual(factoryGeometry(a).box);
        const roof = unionExtent(shapes.slice(1));
        if (roof) expectTight(boxes[1], roof, `${a.id} ${a.config?.rooftopGreeble}`);
        else expect(boxes, `${a.id} draws no rooftop greeble`).toHaveLength(1);
      }
    });
  });

  it('any depth: pitched roofs and crown spires (their shape reads frontCornerX) are exact too', () => {
    for (const greeble of ['pitchedRoof', 'crownSpire'] as const) {
      const actors = WORLDS.flatMap((w) => w.actors)
        .filter((a) => a.type === ActorType.FACTORY && a.config?.rooftopGreeble === greeble).slice(0, 20);
      expect(actors.length, greeble).toBeGreaterThan(0);
      for (const a of actors) {
        const shapes = factoryShapes(a);
        expectTight(actorSilhouettes(a)[1], unionExtent(shapes.slice(1)), `${a.id} ${greeble}`);
      }
    }
  });

  it('a derelict factory\'s antenna goes dark and isn\'t drawn, so it isn\'t a silhouette', () => {
    const tower = MIDGROUND.find((a) => a.type === ActorType.FACTORY && a.config?.rooftopGreeble === 'antennae')
      ?? WORLDS.flatMap((w) => w.actors).find((a) => a.type === ActorType.FACTORY && a.config?.rooftopGreeble === 'antennae')!;
    expect(actorSilhouettes(tower)).toHaveLength(2);
    expect(actorSilhouettes({ ...tower, config: { ...tower.config, derelict: true } })).toEqual([factoryGeometry(tower).box]);
  });

  describe('scenery: one box, exactly what <Scenery> draws (solid shapes), night and noon alike', () => {
    it.each(['dense', 'outskirts', 'towers', 'yard', 'derelict', 'habitat', 'wreckfield', 'ventfield', 'construction'] as const)('%s', (district) => {
      const actors = sample(ActorType.SCENERY, 30).find(([d]) => d === district)?.[1] ?? [];
      try {
        for (const hour of [3, 12]) {
          useUIStore.setState({ activeLocaleLocalTime: hour });
          for (const a of actors) {
            const shapes = shapeExtents(render(<svg><Scenery actor={a} /></svg>).container);
            const boxes = actorSilhouettes(a);
            expect(boxes, a.id).toHaveLength(1);
            expectTight(boxes[0], unionExtent(shapes), `${a.id} hour ${hour}`);
          }
        }
      } finally {
        useUIStore.setState({ activeLocaleLocalTime: 3 });
      }
    });
  });

  it('every district has midground factories and scenery to check', () => {
    expect(sample(ActorType.FACTORY, 1).length + sample(ActorType.SCENERY, 1).length).toBeGreaterThanOrEqual(9);
  });

  it('pipe bridges: PipeBridges draws pipeBridgeLayout, and every bar and post is a silhouette', () => {
    let bridges = 0;
    for (const w of WORLDS) {
      const factories = w.actors.filter((a) => a.type === ActorType.FACTORY && depthOf(a) === 'midground');
      const layout = pipeBridgeLayout(factories);
      bridges += layout.length;
      const rects = [...render(<svg><PipeBridges factories={factories} /></svg>).container.querySelectorAll('rect')];
      expect(rects.map((r) => ['x', 'y', 'width', 'height'].map((k) => Number(r.getAttribute(k)))))
        .toEqual(layout.flatMap((b) => [b.bar, b.post].map((p) => [p.x, p.y, p.width, p.height])));
      const boxes = midgroundSilhouettes(w.actors, []);
      expectCovered(shapeExtents(render(<svg><PipeBridges factories={factories} /></svg>).container), boxes, w.id);
    }
    expect(bridges).toBeGreaterThan(0);
  });

  it('the ground: one box per step, from its higher end down to the scene bottom', () => {
    const ground = [{ x0: 0, y0: 1050, x1: 200, y1: 1050 }, { x0: 200, y0: 1050, x1: 220, y1: 1030 }, { x0: 220, y0: 1030, x1: 1920, y1: 1030 }];
    expect(groundSilhouettes(ground)).toEqual([
      { x0: 0, y0: 1050, x1: 200, y1: WORLD_BOUNDS.height },
      { x0: 200, y0: 1030, x1: 220, y1: WORLD_BOUNDS.height },
      { x0: 220, y0: 1030, x1: 1920, y1: WORLD_BOUNDS.height },
    ]);
  });

  it("a real world's ground silhouettes cover the ground polygon at every x", () => {
    for (const w of WORLDS.slice(0, 20)) {
      const locale = useLocaleStore.getState().getLocaleById(w.id)!;
      const { ground } = getTerrainProfile(w.id, getLocaleNoiseMap(w.id, locale.coordinates.x, locale.coordinates.y));
      const boxes = groundSilhouettes(ground);
      for (let x = 0; x <= WORLD_BOUNDS.width; x += 5) {
        const y = groundYAt(ground, x);
        expect(boxes.some((b) => b.x0 <= x && x <= b.x1 && b.y0 <= y + 1e-6 && b.y1 === WORLD_BOUNDS.height), `${w.id} x ${x}`).toBe(true);
      }
    }
  });

  it('only the midground counts: background and foreground actors add nothing', () => {
    for (const w of WORLDS.slice(0, 30)) {
      const mid = w.actors.filter((a) => depthOf(a) === 'midground');
      expect(midgroundSilhouettes(w.actors, []), w.id).toEqual(midgroundSilhouettes(mid, []));
      expect(w.actors.length).toBeGreaterThan(mid.length);
    }
  });

  it('midgroundSilhouettes = every midground actor\'s, then the bridges, then the ground', () => {
    const w = WORLDS[0];
    const mid = w.actors.filter((a) => depthOf(a) === 'midground');
    const ground = [{ x0: 0, y0: 1050, x1: 1920, y1: 1050 }];
    const bridges = pipeBridgeLayout(mid.filter((a) => a.type === ActorType.FACTORY))
      .flatMap((b) => [b.bar, b.post].map((r) => ({ x0: r.x, y0: r.y, x1: r.x + r.width, y1: r.y + r.height })));
    expect(midgroundSilhouettes(w.actors, ground)).toEqual([...mid.flatMap(actorSilhouettes), ...bridges, ...groundSilhouettes(ground)]);
  });

  it("getMidgroundSilhouettes reads the locale's actors and ground", () => {
    const w = WORLDS[5];
    const locale = useLocaleStore.getState().getLocaleById(w.id)!;
    useLocaleStore.getState().setLocaleData(w.id, { actors: w.actors });
    const actors = useLocaleStore.getState().getLocaleById(w.id)!.actors;
    const { ground } = getTerrainProfile(w.id, getLocaleNoiseMap(w.id, locale.coordinates.x, locale.coordinates.y));
    expect(getMidgroundSilhouettes(w.id)).toEqual(midgroundSilhouettes(actors, ground));
    expect(getMidgroundSilhouettes('no-such-locale')).toEqual([]);
  });
});
