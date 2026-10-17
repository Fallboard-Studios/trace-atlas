// Tests for the pure paint-area helper behind `npm run perf:idle` (scripts/perf/idle-paint.mjs): the
// "redrawn px²/frame" column roadmap Phase 53 is gated on (docs/specs/PER_MOVER_COMPOSITOR_LAYERS.md §1.11).
// The Chrome/CDP plumbing is not unit-tested; the metric is proved on a real `main` build (docs/tasks/PER_MOVER_COMPOSITOR_LAYERS.md Task 3).
import { describe, expect, it } from 'vitest';

import { clipArea, redrawnArea, scaledLayerArea } from './paint-area-lib.mjs';

// ========================================
// FIXTURES
// ========================================

const VIEWPORT = { width: 1280, height: 900 };

/** An axis-aligned clip quad the way a `Paint` trace event reports it: x1,y1 .. x4,y4, clockwise from the top left. */
const rect = (x, y, w, h) => [x, y, x + w, y, x + w, y + h, x, y + h];

/** A `Paint` trace event, as `Tracing.dataCollected` delivers it. */
const paint = (clip, extra = {}) => ({ name: 'Paint', ph: 'X', dur: 100, args: { data: { clip } }, ...extra });

// ========================================
// clipArea
// ========================================

describe('clipArea', () => {
  it('reads an axis-aligned quad as width × height', () => {
    expect(clipArea(rect(10, 20, 300, 200))).toBe(60_000);
  });

  it('reads a rotated quad by its true area, not its bounding box', () => {
    // A diamond with diagonals 100 and 100: area 5000, bounding box 10 000.
    expect(clipArea([50, 0, 100, 50, 50, 100, 0, 50])).toBe(5000);
  });

  it('reads a quad wound either way round as a positive area', () => {
    expect(clipArea([0, 0, 0, 100, 100, 100, 100, 0])).toBe(10_000);
  });

  it('reads a missing, short or non-numeric clip as 0', () => {
    expect(clipArea(undefined)).toBe(0);
    expect(clipArea([])).toBe(0);
    expect(clipArea([0, 0, 10, 0])).toBe(0);
    expect(clipArea([0, 0, 10, 0, 10, 10, 0, 'x'])).toBe(0);
  });
});

// ========================================
// redrawnArea
// ========================================

describe('redrawnArea', () => {
  it('sums each Paint clip area and divides by the frame count', () => {
    const events = [paint(rect(0, 0, 100, 100)), paint(rect(0, 0, 200, 100))];
    const { pxPerFrame } = redrawnArea(events, { dpr: 1, frames: 2, viewport: VIEWPORT });
    expect(pxPerFrame).toBe(15_000);
  });

  it('scales by the device pixel ratio squared', () => {
    const events = [paint(rect(0, 0, 100, 100))];
    const { pxPerFrame } = redrawnArea(events, { dpr: 2, frames: 1, viewport: VIEWPORT });
    expect(pxPerFrame).toBe(40_000);
  });

  it('reports screens/frame against the viewport in device pixels', () => {
    // One full-viewport paint per frame is exactly one screen per frame, at any DPR.
    const full = rect(0, 0, VIEWPORT.width, VIEWPORT.height);
    expect(redrawnArea([paint(full)], { dpr: 1, frames: 1, viewport: VIEWPORT }).screensPerFrame).toBe(1);
    expect(redrawnArea([paint(full)], { dpr: 2, frames: 1, viewport: VIEWPORT }).screensPerFrame).toBe(1);
    // Four per frame over two frames is two screens per frame.
    expect(redrawnArea(Array(4).fill(paint(full)), { dpr: 1, frames: 2, viewport: VIEWPORT }).screensPerFrame).toBe(2);
  });

  it('reads a window with no Paint events as 0, not NaN', () => {
    expect(redrawnArea([], { dpr: 1, frames: 360, viewport: VIEWPORT })).toEqual({ pxPerFrame: 0, screensPerFrame: 0, unresolvedPaints: 0 });
  });

  it('reads a window with no frames as 0, not Infinity', () => {
    const events = [paint(rect(0, 0, 100, 100))];
    expect(redrawnArea(events, { dpr: 1, frames: 0, viewport: VIEWPORT })).toEqual({ pxPerFrame: 0, screensPerFrame: 0, unresolvedPaints: 0 });
  });

  it('ignores events that are not Paint and Paint events with no clip', () => {
    const events = [
      { name: 'Layerize', ph: 'X', dur: 100, args: { data: { clip: rect(0, 0, 999, 999) } } },
      { name: 'Paint', ph: 'X', dur: 100, args: {} },
      { name: 'Paint', ph: 'X', dur: 100 },
      paint(rect(0, 0, 10, 10)),
    ];
    expect(redrawnArea(events, { dpr: 1, frames: 1, viewport: VIEWPORT }).pxPerFrame).toBe(100);
  });

  it('ignores begin/end halves and zero-duration marks of a Paint', () => {
    const events = [paint(rect(0, 0, 10, 10), { ph: 'B' }), paint(rect(0, 0, 10, 10), { ph: 'E' }), paint(rect(0, 0, 10, 10), { dur: 0 })];
    expect(redrawnArea(events, { dpr: 1, frames: 1, viewport: VIEWPORT }).pxPerFrame).toBe(0);
  });

  it('counts only the events it is given, so the caller scopes them to one thread', () => {
    const mine = paint(rect(0, 0, 10, 10), { pid: 1, tid: 1 });
    const other = paint(rect(0, 0, 1000, 1000), { pid: 2, tid: 2 });
    expect(redrawnArea([mine], { dpr: 1, frames: 1, viewport: VIEWPORT }).pxPerFrame).toBe(100);
    expect(redrawnArea([mine, other], { dpr: 1, frames: 1, viewport: VIEWPORT }).pxPerFrame).toBe(1_000_100);
  });
});

// ========================================
// redrawnArea — clamped to the painted node's layer
// ========================================

/** The clip a promoted mover's Paint reports (Task 16: unbounded, a cull rect and not the repainted area). */
const UNBOUNDED = rect(-8_388_608, -8_388_608, 16_777_215, 16_777_215);

/** A Paint on a given backend node, as the trace reports it. */
const paintOn = (nodeId, clip) => ({ name: 'Paint', ph: 'X', dur: 100, args: { data: { nodeId, clip } } });

describe('redrawnArea with layer bounds', () => {
  it('clamps an unbounded clip to the layer area of the painted node', () => {
    const layerAreas = new Map([[7, 145 * 114]]);
    const { pxPerFrame } = redrawnArea([paintOn(7, UNBOUNDED)], { dpr: 1, frames: 1, viewport: VIEWPORT, layerAreas });
    expect(pxPerFrame).toBe(145 * 114);
  });

  it('keeps a clip that is already smaller than its layer', () => {
    const layerAreas = new Map([[7, 1_000_000]]);
    const { pxPerFrame } = redrawnArea([paintOn(7, rect(0, 0, 10, 10))], { dpr: 1, frames: 1, viewport: VIEWPORT, layerAreas });
    expect(pxPerFrame).toBe(100);
  });

  it('clamps a sheet read in scene units to its device-sized layer', () => {
    // main: a 1920 x 1080 viewBox clip on a 1465 x 824 layer. The layer's pixels are the ones drawn.
    const layerAreas = new Map([[3, 1465 * 824]]);
    const { pxPerFrame } = redrawnArea([paintOn(3, rect(0, 0, 1920, 1080))], { dpr: 1, frames: 1, viewport: VIEWPORT, layerAreas });
    expect(pxPerFrame).toBe(1465 * 824);
  });

  it('clamps each node by its own layer, not by a neighbour', () => {
    const layerAreas = new Map([[1, 100], [2, 400]]);
    const events = [paintOn(1, UNBOUNDED), paintOn(2, UNBOUNDED), paintOn(1, UNBOUNDED)];
    expect(redrawnArea(events, { dpr: 1, frames: 1, viewport: VIEWPORT, layerAreas }).pxPerFrame).toBe(600);
  });

  it('caps an unbounded clip on a node with no known layer at one viewport and counts it', () => {
    const layerAreas = new Map([[1, 100]]);
    const r = redrawnArea([paintOn(99, UNBOUNDED), paintOn(1, rect(0, 0, 5, 5))], { dpr: 1, frames: 1, viewport: VIEWPORT, layerAreas });
    expect(r.pxPerFrame).toBe(VIEWPORT.width * VIEWPORT.height + 25);
    expect(r.unresolvedPaints).toBe(1);
  });

  it('caps an unbounded clip at one viewport when no layer map is given at all', () => {
    const r = redrawnArea([paintOn(5, UNBOUNDED)], { dpr: 1, frames: 1, viewport: VIEWPORT });
    expect(r.pxPerFrame).toBe(VIEWPORT.width * VIEWPORT.height);
    expect(r.unresolvedPaints).toBe(1);
  });

  it('does not count a node with a known layer as unresolved', () => {
    const layerAreas = new Map([[7, 50]]);
    expect(redrawnArea([paintOn(7, UNBOUNDED)], { dpr: 1, frames: 1, viewport: VIEWPORT, layerAreas }).unresolvedPaints).toBe(0);
  });

  it('treats a layer area that is not a finite, non-negative number as unknown', () => {
    const layerAreas = new Map([[1, NaN], [2, -5], [3, Infinity]]);
    const events = [paintOn(1, UNBOUNDED), paintOn(2, UNBOUNDED), paintOn(3, UNBOUNDED)];
    const r = redrawnArea(events, { dpr: 1, frames: 1, viewport: VIEWPORT, layerAreas });
    expect(r.unresolvedPaints).toBe(3);
    expect(r.pxPerFrame).toBe(3 * VIEWPORT.width * VIEWPORT.height);
  });

  it('lets a zero-area layer contribute nothing', () => {
    const layerAreas = new Map([[7, 0]]);
    expect(redrawnArea([paintOn(7, UNBOUNDED)], { dpr: 1, frames: 1, viewport: VIEWPORT, layerAreas }).pxPerFrame).toBe(0);
  });

  it('applies the device pixel ratio squared after the clamp', () => {
    const layerAreas = new Map([[7, 100]]);
    expect(redrawnArea([paintOn(7, UNBOUNDED)], { dpr: 2, frames: 1, viewport: VIEWPORT, layerAreas }).pxPerFrame).toBe(400);
  });

  it('reports no unresolved paints for a window with no Paint events', () => {
    expect(redrawnArea([], { dpr: 1, frames: 10, viewport: VIEWPORT }).unresolvedPaints).toBe(0);
    expect(redrawnArea([], { dpr: 1, frames: 0, viewport: VIEWPORT }).unresolvedPaints).toBe(0);
  });
});

// ========================================
// scaledLayerArea
// ========================================

describe('scaledLayerArea', () => {
  it('is width × height at scale 1', () => {
    expect(scaledLayerArea({ width: 145, height: 114 }, 1)).toBe(145 * 114);
  });

  it('applies the scale to both sides, so the area goes with its square', () => {
    expect(scaledLayerArea({ width: 1920, height: 1080 }, 0.5)).toBe(1920 * 1080 * 0.25);
  });

  it('reads a missing size, a non-finite scale or a negative scale as 0', () => {
    expect(scaledLayerArea({ width: 100 }, 1)).toBe(0);
    expect(scaledLayerArea({ width: 100, height: 100 }, NaN)).toBe(0);
    expect(scaledLayerArea({ width: 100, height: 100 }, -1)).toBe(0);
    expect(scaledLayerArea(undefined, 1)).toBe(0);
  });
});
