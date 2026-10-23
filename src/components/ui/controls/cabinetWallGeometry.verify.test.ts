import { describe, it, expect, vi } from 'vitest';

// The empirical skew-direction verification flagged as the highest-risk
// item in docs/specs/archive/OBLIQUE_CABINETRY_WALL_RENDERING.md §5/§7 — the
// algebra in §1.2 is only trustworthy once confirmed against what GSAP
// actually writes to the DOM, not assumed. Uses the REAL gsap library
// (overriding vitest.setup.ts's global noop mock for this file only, same
// `importOriginal` technique cabinetGeometry.test.ts already uses for a
// different module) rather than a mock, since the whole point is to
// observe gsap's own transform-composition behavior, not a stand-in for it.
vi.mock('gsap', async (importOriginal) => await importOriginal<typeof import('gsap')>());

import gsap from 'gsap';
import { CABINET_TOP_FACE_SKEW_DEG, CABINET_LEFT_FACE_SKEW_DEG, CABINET_POP_DISTANCE } from '@/utils/cabinetGeometry';

/**
 * jsdom has no real layout/rendering engine, so `getComputedStyle(el).transform`
 * does NOT normalize to a single `matrix(...)` the way a real browser would —
 * it just echoes back the literal transform-function list GSAP wrote (found
 * live running this test: e.g. `"skew(63.43...deg, 0deg) scale(1, 0.4)"`,
 * not a computed matrix). That raw string is still exactly what's needed:
 * it directly reveals the ORDER GSAP writes the functions in (skew, then
 * scale) — this parser composes them itself, per the CSS Transforms spec's
 * own rule that the LAST-listed function applies FIRST to a point (i.e. the
 * rightmost/innermost function is closest to the content).
 */
interface Matrix2D { a: number; b: number; c: number; d: number; e: number; f: number }
const IDENTITY: Matrix2D = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

function multiply(outer: Matrix2D, inner: Matrix2D): Matrix2D {
  return {
    a: outer.a * inner.a + outer.c * inner.b,
    b: outer.b * inner.a + outer.d * inner.b,
    c: outer.a * inner.c + outer.c * inner.d,
    d: outer.b * inner.c + outer.d * inner.d,
    e: outer.a * inner.e + outer.c * inner.f + outer.e,
    f: outer.b * inner.e + outer.d * inner.f + outer.f,
  };
}

function toMatrix(name: string, args: number[]): Matrix2D {
  switch (name) {
    case 'skew': {
      const [xDeg, yDeg] = args;
      return { a: 1, b: Math.tan((yDeg * Math.PI) / 180), c: Math.tan((xDeg * Math.PI) / 180), d: 1, e: 0, f: 0 };
    }
    case 'scale': {
      const [sx, sy] = args;
      return { a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 };
    }
    case 'translate': {
      const [tx, ty] = args;
      return { a: 1, b: 0, c: 0, d: 1, e: tx, f: ty };
    }
    default:
      throw new Error(`Unhandled transform function encountered in test: "${name}"`);
  }
}

/** Composes a full `transform` string (e.g. "skew(63.4deg, 0deg) scale(1, 0.4)")
 *  into one net matrix, applying the CSS spec's own left-to-right composition
 *  rule directly — not relying on jsdom to normalize it. */
function parseTransformList(transform: string): Matrix2D {
  if (transform === 'none' || transform.trim() === '') return IDENTITY;
  const functionCalls = [...transform.matchAll(/(\w+)\(([^)]*)\)/g)];
  let net = IDENTITY;
  for (const [, name, rawArgs] of functionCalls) {
    const args = rawArgs.split(',').map((s) => parseFloat(s.trim()));
    net = multiply(net, toMatrix(name, args));
  }
  return net;
}

function applyMatrix(m: Matrix2D, x: number, y: number): { x: number; y: number } {
  return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f };
}

describe('wall transform geometry — empirical verification against the real gsap library, not just algebra (spec §1.2/§5/§7 item 1)', () => {
  it("a top-face div (skewX set once, scaleY tweened to t=1) maps its local bottom-right corner (W, popDistance) to (W + 2*popDistance, popDistance) — matching the front face's own translate offset exactly", () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const W = 100;
    const D = CABINET_POP_DISTANCE;

    gsap.set(el, { skewX: CABINET_TOP_FACE_SKEW_DEG });
    gsap.set(el, { scaleY: 1 });

    const matrix = parseTransformList(getComputedStyle(el).transform);
    // Local (0, D): the flat rectangle's bottom-left corner.
    const bottomLeft = applyMatrix(matrix, 0, D);
    expect(bottomLeft.x).toBeCloseTo(2 * D, 10);
    expect(bottomLeft.y).toBeCloseTo(D, 10);
    // Local (W, D): the flat rectangle's bottom-right corner — same y-shift,
    // x-shift adds on top of the rectangle's own width, exactly like
    // computeCabinetFrontFaceOffset's old topFacePoints 3rd point did.
    const bottomRight = applyMatrix(matrix, W, D);
    expect(bottomRight.x).toBeCloseTo(W + 2 * D, 10);
    expect(bottomRight.y).toBeCloseTo(D, 10);

    document.body.removeChild(el);
  });

  it("a left-face div (skewY set once, scaleX tweened to t=1) maps its local bottom-right corner (2*popDistance, H) to (2*popDistance, H + popDistance)", () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const H = 48;
    const D = CABINET_POP_DISTANCE;

    gsap.set(el, { skewY: CABINET_LEFT_FACE_SKEW_DEG });
    gsap.set(el, { scaleX: 1 });

    const matrix = parseTransformList(getComputedStyle(el).transform);
    // Local (2D, 0): the flat rectangle's top-right corner.
    const topRight = applyMatrix(matrix, 2 * D, 0);
    expect(topRight.x).toBeCloseTo(2 * D, 10);
    expect(topRight.y).toBeCloseTo(D, 10);
    // Local (2D, H): the flat rectangle's bottom-right corner.
    const bottomRight = applyMatrix(matrix, 2 * D, H);
    expect(bottomRight.x).toBeCloseTo(2 * D, 10);
    expect(bottomRight.y).toBeCloseTo(H + D, 10);

    document.body.removeChild(el);
  });

  it('at a fractional t (0.4), the top face\'s x-shift scales proportionally with t — proving scaleY applies BEFORE skewX in GSAP\'s composition (the order this whole design depends on)', () => {
    // If GSAP applied skewX before scaleY instead, the x-shift computed by
    // the skew would be based on the UNSCALED height and would stay fixed
    // regardless of t — only the y-extent would shrink, producing a wall
    // whose horizontal reach never shrinks below the full popDistance. This
    // test fails loudly if that's actually what happens, rather than
    // silently shipping wrong geometry.
    const el = document.createElement('div');
    document.body.appendChild(el);
    const D = CABINET_POP_DISTANCE;
    const t = 0.4;

    gsap.set(el, { skewX: CABINET_TOP_FACE_SKEW_DEG });
    gsap.set(el, { scaleY: t });

    const matrix = parseTransformList(getComputedStyle(el).transform);
    const bottomLeft = applyMatrix(matrix, 0, D);
    expect(bottomLeft.x).toBeCloseTo(2 * D * t, 10);
    expect(bottomLeft.y).toBeCloseTo(D * t, 10);

    document.body.removeChild(el);
  });

  it('at t=0, the top-face wall collapses to a zero-area line at the origin — matching the old polygon math\'s t=0 collapse exactly', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);

    gsap.set(el, { skewX: CABINET_TOP_FACE_SKEW_DEG });
    gsap.set(el, { scaleY: 0 });

    const matrix = parseTransformList(getComputedStyle(el).transform);
    const bottomLeft = applyMatrix(matrix, 0, CABINET_POP_DISTANCE);
    expect(bottomLeft.x).toBeCloseTo(0, 10);
    expect(bottomLeft.y).toBeCloseTo(0, 10);

    document.body.removeChild(el);
  });
});
