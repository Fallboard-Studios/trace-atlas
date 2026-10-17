// ========================================
// IMPORTS
// ========================================
import { describe, it, expect } from 'vitest';

import {
  WAVE_AMPLITUDES,
  WAVE_BREAK_RADIUS,
  WAVE_COUNT,
  WAVE_COUNTER_AMPLITUDE,
  WAVE_COUNTER_INDEX,
  WAVE_DRIFT,
  WAVE_PATH_COUNT,
  WAVE_SPACING,
  WAVE_SPEED,
  WAVE_TRAIL,
  WAVE_TRAIL_SIDES,
  WAVE_STAGGER_SECONDS,
  WAVE_TOTAL_SECONDS,
  WAVE_TRAVEL,
  mapPoint,
  matrixWithin,
  trailGradient,
  unmapPoint,
  waveState,
  wavePath,
  waveTrails,
} from './haloWaves';

// ========================================
// HELPERS
// ========================================
/** The numbers in a path's `d`, in order. */
const numbers = (d: string) => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);

/** The run progress `u` at which wave `index` has travelled `distance` scene units. */
const at = (index: number, distance: number) => (index * WAVE_STAGGER_SECONDS + distance / WAVE_SPEED) / WAVE_TOTAL_SECONDS;

// ========================================
// TESTS
// ========================================
describe('haloWaves — constants', () => {
  it('four waves, each fainter than the last', () => {
    expect(WAVE_COUNT).toBe(4);
    expect(WAVE_AMPLITUDES).toHaveLength(WAVE_COUNT);
    for (let i = 1; i < WAVE_COUNT; i += 1) expect(WAVE_AMPLITUDES[i]).toBeLessThan(WAVE_AMPLITUDES[i - 1]);
  });

  it('the edges break apart at a radius of 40, and reach 50 past it', () => {
    expect(WAVE_BREAK_RADIUS).toBe(40);
    expect(WAVE_DRIFT).toBe(50);
    expect(WAVE_TRAVEL).toBe(90);
  });

  it('travel at 56.25 units a second, the waves 30 units apart', () => {
    expect(WAVE_SPEED).toBe(56.25);
    expect(WAVE_SPACING).toBe(30);
    expect(WAVE_STAGGER_SECONDS * WAVE_SPEED).toBeCloseTo(30, 10);
  });

  it('the whole run is the last wave\'s start plus its travel time', () => {
    expect(WAVE_TOTAL_SECONDS).toBeCloseTo((WAVE_COUNT - 1) * WAVE_STAGGER_SECONDS + WAVE_TRAVEL / WAVE_SPEED, 10);
  });
});

describe('waveState — one wave over the run', () => {
  it('grows from nothing, edge length growing with the triangle, until the break radius', () => {
    const start = waveState('spawn', 0, 0);
    expect(start.r).toBe(0);
    expect(start.alpha).toBe(0);

    const half = waveState('spawn', at(0, 20), 0);
    expect(half.r).toBeCloseTo(20, 8);
    expect(half.halfLength).toBeCloseTo(Math.sqrt(3) * 20, 8); // a closed equilateral triangle still
    expect(half.alpha).toBeCloseTo(WAVE_AMPLITUDES[0], 10); // past the short fade-in, full strength
  });

  it('moves outward at WAVE_SPEED scene units a second', () => {
    const seconds = (u: number) => u * WAVE_TOTAL_SECONDS;
    const a = waveState('spawn', at(0, 10), 0);
    const b = waveState('spawn', at(0, 60), 0);
    expect((b.r - a.r) / (seconds(at(0, 60)) - seconds(at(0, 10)))).toBeCloseTo(WAVE_SPEED, 8);
  });

  it('past the break, the edges stop growing and shrink toward their middles to nothing over the drift, at full strength', () => {
    const atBreak = waveState('spawn', at(0, WAVE_BREAK_RADIUS), 0);
    expect(atBreak.r).toBeCloseTo(WAVE_BREAK_RADIUS, 8);
    expect(atBreak.halfLength).toBeCloseTo(Math.sqrt(3) * WAVE_BREAK_RADIUS, 8);

    const out = waveState('spawn', at(0, WAVE_BREAK_RADIUS + 0.9 * WAVE_DRIFT), 0);
    expect(out.halfLength).toBeCloseTo(Math.sqrt(3) * WAVE_BREAK_RADIUS * 0.1, 8); // 10 % of the drift left
    expect(out.alpha).toBeCloseTo(WAVE_AMPLITUDES[0], 10); // no fade: the bar is used up, not dimmed

    const gone = waveState('spawn', at(0, WAVE_TRAVEL), 0);
    expect(gone.halfLength).toBeCloseTo(0, 8);
    expect(gone.alpha).toBe(0);

    let last = Infinity;
    for (let d = WAVE_BREAK_RADIUS; d < WAVE_TRAVEL; d += 2) {
      const { halfLength } = waveState('spawn', at(0, d), 0);
      expect(halfLength).toBeLessThanOrEqual(last);
      last = halfLength;
    }
  });

  it('never travels further than the break plus the drift', () => {
    for (let u = 0; u <= 1; u += 0.01) {
      for (let i = 0; i < WAVE_COUNT; i += 1) {
        expect(waveState('spawn', u, i).r).toBeLessThanOrEqual(WAVE_TRAVEL + 1e-9);
      }
    }
  });

  it('later waves start later and are fainter at the same point of their own run', () => {
    expect(waveState('spawn', at(1, 0) - 0.01, 1).alpha).toBe(0); // not yet launched
    const states = Array.from({ length: WAVE_COUNT }, (_, i) => waveState('spawn', at(i, 25), i));
    for (let i = 1; i < WAVE_COUNT; i += 1) {
      expect(states[i].r).toBeCloseTo(states[0].r, 8);
      expect(states[i].alpha).toBeLessThan(states[i - 1].alpha);
    }
  });

  it('a wave fades in over its first units rather than popping on', () => {
    const justLaunched = waveState('spawn', at(0, 1), 0);
    expect(justLaunched.alpha).toBeGreaterThan(0);
    expect(justLaunched.alpha).toBeLessThan(WAVE_AMPLITUDES[0] * 0.5);
  });

  it('despawn is the spawn played backwards', () => {
    for (const u of [0, 0.13, 0.5, 0.77, 1]) {
      for (let i = 0; i < WAVE_PATH_COUNT; i += 1) {
        expect(waveState('despawn', u, i)).toEqual(waveState('spawn', 1 - u, i));
      }
    }
  });

  it('nothing is drawn at either end of the run', () => {
    for (const kind of ['spawn', 'despawn'] as const) {
      for (let i = 0; i < WAVE_PATH_COUNT; i += 1) {
        expect(waveState(kind, 0, i).alpha).toBe(0);
        expect(waveState(kind, 1, i).alpha).toBe(0);
      }
    }
  });
});

describe('waveState — the counter wave (one triangle going the other way)', () => {
  const counter = (distanceFromStart: number) => waveState('spawn', (distanceFromStart / WAVE_SPEED) / WAVE_TOTAL_SECONDS, WAVE_COUNTER_INDEX);

  it('is one extra path, after the outward waves', () => {
    expect(WAVE_COUNTER_INDEX).toBe(WAVE_COUNT);
    expect(WAVE_PATH_COUNT).toBe(WAVE_COUNT + 1);
  });

  it('starts at the far end with the first wave, and closes in on the centre at the same speed', () => {
    const early = counter(10);
    expect(early.r).toBeCloseTo(WAVE_TRAVEL - 10, 8);
    const later = counter(60);
    expect(later.r).toBeCloseTo(WAVE_TRAVEL - 60, 8);
    // it passes the first outward wave half way along: both 45 out
    const outward = waveState('spawn', (WAVE_TRAVEL / 2 / WAVE_SPEED) / WAVE_TOTAL_SECONDS, 0);
    expect(counter(WAVE_TRAVEL / 2).r).toBeCloseTo(outward.r, 8);
  });

  it('is the outward wave read backwards: bars lengthen as they come in to the break, then it is a triangle that shrinks to a point', () => {
    const far = counter(10); // 80 out, past the break: short bars
    const atBreak = counter(WAVE_TRAVEL - WAVE_BREAK_RADIUS); // exactly at the break radius
    const near = counter(WAVE_TRAVEL - 10); // 10 from the centre
    expect(atBreak.r).toBeCloseTo(WAVE_BREAK_RADIUS, 8);
    expect(far.halfLength).toBeLessThan(atBreak.halfLength);
    expect(atBreak.halfLength).toBeCloseTo(Math.sqrt(3) * WAVE_BREAK_RADIUS, 8);
    expect(near.halfLength).toBeCloseTo(Math.sqrt(3) * 10, 8);
  });

  it('draws at its own strength, tapering only into the centre, and is gone once it arrives', () => {
    expect(counter(30).alpha).toBeCloseTo(WAVE_COUNTER_AMPLITUDE, 10);
    expect(counter(WAVE_TRAVEL - 2).alpha).toBeLessThan(WAVE_COUNTER_AMPLITUDE * 0.5);
    expect(counter(WAVE_TRAVEL).alpha).toBe(0);
    expect(counter(0).alpha).toBe(0);
  });

  it('despawn plays it the other way: out from the centre', () => {
    expect(waveState('despawn', 1 - (10 / WAVE_SPEED) / WAVE_TOTAL_SECONDS, WAVE_COUNTER_INDEX).r).toBeCloseTo(WAVE_TRAVEL - 10, 8);
    expect(waveState('despawn', 1 - (60 / WAVE_SPEED) / WAVE_TOTAL_SECONDS, WAVE_COUNTER_INDEX).r).toBeCloseTo(WAVE_TRAVEL - 60, 8);
  });
});

describe('wavePath', () => {
  it('draws nothing while the wave is not drawn', () => {
    expect(wavePath({ r: 0, halfLength: 0, alpha: 0 }, 0, 0, 1)).toBe('');
    expect(wavePath({ r: 30, halfLength: 52, alpha: 0 }, 0, 0, 1)).toBe('');
  });

  it('before the break it is one closed point-up triangle whose inscribed radius is r', () => {
    const d = wavePath({ r: 30, halfLength: Math.sqrt(3) * 30, alpha: 1 }, 0, 0, 1);
    expect(d.endsWith('Z')).toBe(true);
    expect((d.match(/M/g) ?? []).length).toBe(1);
    // bottom-left, bottom-right, apex of an inradius-30 triangle
    const [blx, bly, brx, bry, ax, ay] = numbers(d);
    expect([blx, bly]).toEqual([-51.96, 30]);
    expect([brx, bry]).toEqual([51.96, 30]);
    expect(ax).toBeCloseTo(0, 1);
    expect(ay).toBe(-60);
  });

  it('after the break it is three separate bars, each the length it has by then', () => {
    const half = 70;
    const d = wavePath({ r: WAVE_BREAK_RADIUS + 20, halfLength: half, alpha: 0.5 }, 0, 0, 1);
    expect((d.match(/M/g) ?? []).length).toBe(3);
    expect(d.includes('Z')).toBe(false);
    const n = numbers(d);
    for (let i = 0; i < 3; i += 1) {
      const [x1, y1, x2, y2] = n.slice(i * 4, i * 4 + 4);
      expect(Math.hypot(x2 - x1, y2 - y1)).toBeCloseTo(2 * half, 0);
    }
  });

  it('is centred on (cx, cy)', () => {
    const shifted = numbers(wavePath({ r: 30, halfLength: 52, alpha: 1 }, 10, 20, 1));
    const origin = numbers(wavePath({ r: 30, halfLength: 52, alpha: 1 }, 0, 0, 1));
    expect(shifted[0]).toBeCloseTo(origin[0] + 10, 1);
    expect(shifted[1]).toBeCloseTo(origin[1] + 20, 1);
  });

  it('divides scene distances by the group scale, so the waves stay the size they should be on screen', () => {
    const full = numbers(wavePath({ r: 30, halfLength: 52, alpha: 1 }, 0, 0, 1));
    const small = numbers(wavePath({ r: 30, halfLength: 52, alpha: 1 }, 0, 0, 0.25));
    small.forEach((v, i) => expect(v).toBeCloseTo(full[i] * 4, 0));
  });
});

describe('waveTrails — one fading tail behind every line, nothing ahead of it', () => {
  const closed = { r: 30, halfLength: Math.sqrt(3) * 30, alpha: 1 };
  const bars = { r: 60, halfLength: 40, alpha: 1 };
  const nums = (d: string) => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);

  it('1 deep at the ends of a bar, 12 deep at its middle', () => {
    expect(WAVE_TRAIL).toEqual({ ends: 1, middle: 12 });
  });

  it('draws nothing while the wave is not drawn', () => {
    expect(waveTrails({ r: 0, halfLength: 0, alpha: 0 }, true, 0, 0, 1)).toEqual([]);
    expect(waveTrails({ r: 30, halfLength: 52, alpha: 0 }, true, 0, 0, 1)).toEqual([]);
  });

  it('two halves per edge, six in all, right then left', () => {
    const trails = waveTrails(bars, true, 0, 0, 1);
    expect(trails).toHaveLength(3 * WAVE_TRAIL_SIDES.length);
    expect(WAVE_TRAIL_SIDES).toEqual(['right', 'left']);
    expect(trails.map((t) => t.side)).toEqual(['right', 'left', 'right', 'left', 'right', 'left']);
  });

  it('each half runs from the middle of the line out to the bar end, 1 down there, and back to 12 down at the middle', () => {
    const [right, left] = waveTrails(bars, true, 0, 0, 1);
    expect(nums(right.d)).toEqual([0, 0, 40, 0, 40, 1, 0, 12]);
    expect(nums(left.d)).toEqual([0, 0, -40, 0, -40, 1, 0, 12]);
  });

  it('there is nothing ahead of the line: every piece lies wholly behind it (y >= 0 in its own frame, which points back)', () => {
    for (const t of waveTrails(bars, true, 0, 0, 1)) nums(t.d).filter((_, n) => n % 2 === 1).forEach((y) => expect(y).toBeGreaterThanOrEqual(0));
  });

  it('both halves of an edge stand on that edge, whose middle is r from the centre', () => {
    const trails = waveTrails(bars, true, 0, 0, 1);
    for (let edge = 0; edge < 3; edge += 1) {
      expect(trails[2 * edge + 1].transform).toBe(trails[2 * edge].transform);
      const [, , , , e, f] = nums(trails[2 * edge].transform);
      expect(Math.hypot(e, f)).toBeCloseTo(60, 1);
    }
  });

  it('the tail is on the side the wave has come from: inside an outward wave, outside an inward one', () => {
    for (const outward of [true, false]) {
      const trails = waveTrails(bars, outward, 0, 0, 1);
      for (let edge = 0; edge < 3; edge += 1) {
        const [, , cx, cy, ex, ey] = nums(trails[2 * edge].transform); // (cx, cy): the y axis, back from the line
        const alongNormal = cx * ex + cy * ey; // against the outward normal at this edge
        expect(outward ? alongNormal : -alongNormal).toBeLessThan(0);
      }
    }
  });

  it('the strip runs along the edge: its x axis is the direction wavePath draws the edge in', () => {
    const d = nums(wavePath(bars, 0, 0, 1)); // M x1 y1 L x2 y2 for each edge
    for (let edge = 0; edge < 3; edge += 1) {
      const [ax, ay] = nums(waveTrails(bars, true, 0, 0, 1)[2 * edge].transform);
      const dx = d[edge * 4 + 2] - d[edge * 4];
      const dy = d[edge * 4 + 3] - d[edge * 4 + 1];
      expect(ax * dx + ay * dy).toBeGreaterThan(0);
      expect(Math.abs(ax * dy - ay * dx) / Math.hypot(dx, dy)).toBeLessThan(0.01);
    }
  });

  it('the same shapes while the edges are still one closed triangle', () => {
    expect(nums(waveTrails(closed, true, 0, 0, 1)[0].d)).toEqual([0, 0, 51.96, 0, 51.96, 1, 0, 12]);
  });

  it('is in the group own units: divided by its scale, so the trail stays the same size on screen', () => {
    const full = nums(waveTrails(bars, true, 0, 0, 1)[0].d);
    const small = nums(waveTrails(bars, true, 0, 0, 0.25)[0].d);
    small.forEach((v, i) => expect(v).toBeCloseTo(full[i] * 4, 0));
  });
});

describe('trailGradient — full strength at the middle of the line where the tail is deepest, to nothing on its slanted edge', () => {
  /** A half trail's slanted edge in objectBoundingBox units: from the end of the bar to its middle. */
  function slantedEdge(side: 'right' | 'left') {
    const depth = WAVE_TRAIL.middle;
    return { from: { x: side === 'right' ? 1 : 0, y: WAVE_TRAIL.ends / depth }, to: { x: side === 'right' ? 0 : 1, y: WAVE_TRAIL.middle / depth } };
  }

  it('the right half starts at the middle of the line (x = 0), the left half at the other end of its box (x = 1), mirrored', () => {
    const r = trailGradient('right');
    const l = trailGradient('left');
    expect([r.x1, r.y1]).toEqual([0, 0]);
    expect([l.x1, l.y1]).toEqual([1, 0]);
    expect(l.x2).toBeCloseTo(1 - r.x2, 10);
    expect(l.y2).toBeCloseTo(r.y2, 10);
  });

  it('every gradient ends on its slanted edge and runs square to it', () => {
    for (const side of WAVE_TRAIL_SIDES) {
      const g = trailGradient(side);
      const { from, to } = slantedEdge(side);
      const dir = { x: to.x - from.x, y: to.y - from.y };
      const len = Math.hypot(dir.x, dir.y);
      expect(Math.abs((g.x2 - from.x) * dir.y - (g.y2 - from.y) * dir.x) / len, side + ' on the edge').toBeLessThan(0.01);
      expect(Math.abs(((g.x2 - g.x1) * dir.x + (g.y2 - g.y1) * dir.y) / len), side + ' square').toBeLessThan(0.01);
    }
  });
});

describe('mapPoint / unmapPoint — pinning the waves\' centre in the scene while the robot swims away', () => {
  const m = { a: 0.5, b: 0, c: 0, d: 0.5, e: 300, f: 200 }; // a gem group at half scale, 300 / 200 into the scene

  it('maps a point in the group\'s units to the scene and back', () => {
    const scene = mapPoint(m, 40, 40);
    expect(scene).toEqual({ x: 320, y: 220 });
    expect(unmapPoint(m, scene.x, scene.y)).toEqual({ x: 40, y: 40 });
  });

  it('once the group has moved on, the same scene point sits at a different local point', () => {
    const scene = mapPoint(m, 40, 40);
    const moved = { ...m, e: 500 }; // the robot swam 200 scene units right
    expect(unmapPoint(moved, scene.x, scene.y)).toEqual({ x: -360, y: 40 });
  });
});

describe('matrixWithin — a group\'s screen matrix read in the scene\'s own units', () => {
  // The stage scales the scene to the screen (half size, scrolled 10 / 20 px); a robot's wrapper then moves it
  // 100 scene units right and doubles it. The screen matrix of the group carries both; the frame takes the stage off.
  const stage = { a: 0.5, b: 0, c: 0, d: 0.5, e: 10, f: 20 };
  const inScene = { a: 2, b: 0, c: 0, d: 2, e: 100, f: 0 };
  const onScreen = { a: 1, b: 0, c: 0, d: 1, e: 60, f: 20 }; // stage · inScene

  it('takes the stage out of a screen matrix, leaving the group\'s place in the scene', () => {
    const m = matrixWithin(stage, onScreen);
    expect(m.a).toBeCloseTo(inScene.a, 10);
    expect(m.d).toBeCloseTo(inScene.d, 10);
    expect(m.e).toBeCloseTo(inScene.e, 10);
    expect(m.f).toBeCloseTo(inScene.f, 10);
    expect(m.b).toBeCloseTo(0, 10);
    expect(m.c).toBeCloseTo(0, 10);
  });

  it('is unchanged by where the stage sits on the screen (a scrolled deck camera moves both matrices alike)', () => {
    const scrolled = { ...stage, e: stage.e - 300 };
    const onScreenScrolled = { ...onScreen, e: onScreen.e - 300 };
    expect(matrixWithin(scrolled, onScreenScrolled)).toEqual(matrixWithin(stage, onScreen));
  });

  it('keeps a rotation (a swim tilts the wrapper)', () => {
    const quarter = { a: 0, b: 1, c: -1, d: 0, e: 0, f: 0 };
    const m = matrixWithin({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }, quarter);
    expect(m).toEqual(quarter);
    expect(mapPoint(m, 1, 0)).toEqual({ x: 0, y: 1 });
  });
});
