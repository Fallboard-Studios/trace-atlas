// Tests for the pure paint-area helper behind `npm run perf:idle` (scripts/perf/idle-paint.mjs): the
// "redrawn px²/frame" column roadmap Phase 53 is gated on (docs/specs/PER_MOVER_COMPOSITOR_LAYERS.md §1.11).
// The Chrome/CDP plumbing is not unit-tested; the metric is proved on a real `main` build (docs/tasks/PER_MOVER_COMPOSITOR_LAYERS.md Task 3).
import { describe, expect, it } from 'vitest';

import { clipArea, framePaintWrappers, paintEventArea, rasteredArea, redrawnArea, scaledLayerArea } from './paint-area-lib.mjs';

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
// paintEventArea — the one rule redrawnArea and the per-node table share
// ========================================

describe('paintEventArea', () => {
  const layerAreas = new Map([[7, 145 * 114]]);
  const of = (ev, over = {}) => paintEventArea(ev, { viewport: VIEWPORT, layerAreas, ...over });

  it('clamps an unbounded clip to the layer area of the painted node', () => {
    expect(of(paintOn(7, UNBOUNDED))).toEqual({ area: 145 * 114, unresolved: false });
  });

  it('keeps a clip that is already smaller than its layer', () => {
    expect(of(paintOn(7, rect(0, 0, 10, 10)))).toEqual({ area: 100, unresolved: false });
  });

  it('caps an unbounded clip on a node with no known layer at one viewport, and says it was unresolved', () => {
    expect(of(paintOn(99, UNBOUNDED))).toEqual({ area: VIEWPORT.width * VIEWPORT.height, unresolved: true });
  });

  it('keeps a small clip on a node with no known layer, and does not call it unresolved', () => {
    expect(of(paintOn(99, rect(0, 0, 5, 5)))).toEqual({ area: 25, unresolved: false });
  });

  it('keeps a clip of exactly one viewport on an unknown node: only a larger one is capped and counted', () => {
    expect(of(paintOn(99, rect(0, 0, VIEWPORT.width, VIEWPORT.height)))).toEqual({ area: VIEWPORT.width * VIEWPORT.height, unresolved: false });
  });

  it('caps at one viewport when no layer map is given at all', () => {
    expect(of(paintOn(5, UNBOUNDED), { layerAreas: undefined })).toEqual({ area: VIEWPORT.width * VIEWPORT.height, unresolved: true });
  });

  it('treats a node with no id (-1 in the harness table, or missing) as unknown', () => {
    expect(of({ name: 'Paint', ph: 'X', dur: 100, args: { data: { clip: UNBOUNDED } } }).unresolved).toBe(true);
  });

  it('treats a layer area that is not a finite, non-negative number as unknown', () => {
    const odd = new Map([[1, NaN], [2, -5], [3, Infinity]]);
    for (const id of [1, 2, 3]) {
      expect(of(paintOn(id, UNBOUNDED), { layerAreas: odd })).toEqual({ area: VIEWPORT.width * VIEWPORT.height, unresolved: true });
    }
  });

  it('lets a zero-area layer contribute nothing, resolved', () => {
    expect(of(paintOn(7, UNBOUNDED), { layerAreas: new Map([[7, 0]]) })).toEqual({ area: 0, unresolved: false });
  });

  it('is 0 and resolved for what is not a complete Paint: another event, a begin/end half, a zero-duration mark, a missing clip', () => {
    const none = { area: 0, unresolved: false };
    expect(of({ name: 'Layerize', ph: 'X', dur: 100, args: { data: { nodeId: 7, clip: UNBOUNDED } } })).toEqual(none);
    expect(of({ ...paintOn(7, UNBOUNDED), ph: 'B' })).toEqual(none);
    expect(of({ ...paintOn(7, UNBOUNDED), dur: 0 })).toEqual(none);
    expect(of({ name: 'Paint', ph: 'X', dur: 100, args: {} })).toEqual(none);
    expect(of({ name: 'Paint', ph: 'X', dur: 100 })).toEqual(none);
  });

  it('reads a rotated quad by its true area, as redrawnArea does, not by its bounding box', () => {
    expect(of(paintOn(99, [50, 0, 100, 50, 50, 100, 0, 50])).area).toBe(5000);
  });

  it('agrees with redrawnArea: the window total is the events\' areas summed, over the frames', () => {
    const events = [paintOn(7, UNBOUNDED), paintOn(7, rect(0, 0, 10, 10)), paintOn(99, UNBOUNDED), paintOn(99, rect(0, 0, 5, 5))];
    const opts = { viewport: VIEWPORT, layerAreas };
    const summed = events.reduce((sum, ev) => sum + paintEventArea(ev, opts).area, 0);
    const unresolved = events.filter((ev) => paintEventArea(ev, opts).unresolved).length;
    const r = redrawnArea(events, { dpr: 1, frames: 4, ...opts });
    expect(r.pxPerFrame).toBe(summed / 4);
    expect(r.unresolvedPaints).toBe(unresolved);
  });
});

// ========================================
// framePaintWrappers — Chrome's whole-frame `#document` Paint is a wrapper, not a repaint
// ========================================

// Chrome opens one `Paint` on `#document` (layerId 0, clip = the viewport) per frame that paints anything, and the
// per-layer Paints sit inside it by timestamp. Its compositor layer does not raster (docs/tasks/DOCUMENT_REPAINT.md,
// Phase 1: one raster frame in 179 on both builds). Charging it a viewport per frame was the whole of the Task 20 miss.

/** A `#document` Paint as the trace reports it: the frame's wrapper when other Paints sit inside its span. */
const documentPaint = (ts, dur, extra = {}) => ({
  name: 'Paint', ph: 'X', ts, dur, args: { data: { nodeId: 2, nodeName: '#document', layerId: 0, clip: rect(0, 0, VIEWPORT.width, VIEWPORT.height) } }, ...extra,
});

/** A mover's Paint inside a frame, at a timestamp and duration. */
const moverPaintAt = (ts, dur, nodeId = 7) => ({ name: 'Paint', ph: 'X', ts, dur, args: { data: { nodeId, nodeName: 'DIV', clip: UNBOUNDED } } });

describe('framePaintWrappers', () => {
  it('returns the #document Paint that wraps another complete Paint', () => {
    const doc = documentPaint(1000, 500);
    const mover = moverPaintAt(1100, 100);
    expect(framePaintWrappers([doc, mover])).toEqual(new Set([doc]));
  });

  it('does not return a #document Paint that stands alone: that is a root-layer repaint and still counts', () => {
    const doc = documentPaint(1000, 500);
    expect(framePaintWrappers([doc])).toEqual(new Set());
    expect(framePaintWrappers([doc, moverPaintAt(2000, 100)])).toEqual(new Set());
  });

  it('does not return a Paint on any other node, even one that wraps another', () => {
    const sheet = { name: 'Paint', ph: 'X', ts: 1000, dur: 500, args: { data: { nodeId: 19, nodeName: 'svg', clip: rect(0, 0, 1920, 1080) } } };
    expect(framePaintWrappers([sheet, moverPaintAt(1100, 100)])).toEqual(new Set());
  });

  it('needs a complete Paint inside: a begin/end half, a zero-duration mark or another event does not make it a wrapper', () => {
    const doc = documentPaint(1000, 500);
    const half = { ...moverPaintAt(1100, 100), ph: 'B' };
    const mark = moverPaintAt(1100, 0);
    const other = { name: 'Layerize', ph: 'X', ts: 1100, dur: 100, args: { data: { nodeId: 7, clip: UNBOUNDED } } };
    expect(framePaintWrappers([doc, half, mark, other])).toEqual(new Set());
  });

  it('wraps by span: a Paint that starts inside but ends after the #document Paint is not inside it', () => {
    const doc = documentPaint(1000, 500);
    expect(framePaintWrappers([doc, moverPaintAt(1400, 200)])).toEqual(new Set());
    expect(framePaintWrappers([doc, moverPaintAt(1400, 100)])).toEqual(new Set([doc]));
  });

  it('finds every frame\'s wrapper in a window, in any order', () => {
    const doc1 = documentPaint(1000, 500);
    const doc2 = documentPaint(17_000, 500);
    const alone = documentPaint(33_000, 500);
    const events = [moverPaintAt(17_100, 100), doc2, alone, moverPaintAt(1100, 100), doc1];
    expect(framePaintWrappers(events)).toEqual(new Set([doc1, doc2]));
  });

  it('ignores a #document Paint with no timestamp or duration', () => {
    const doc = { ...documentPaint(undefined, 500) };
    expect(framePaintWrappers([doc, moverPaintAt(1100, 100)])).toEqual(new Set());
  });

  it('is empty for an empty window', () => {
    expect(framePaintWrappers([])).toEqual(new Set());
  });
});

describe('redrawnArea without the frame wrappers', () => {
  const layerAreas = new Map([[7, 145 * 114]]);

  it('charges the mover, not the viewport, for a frame whose #document Paint wraps a mover Paint', () => {
    // The Task 20 shape: one small mover repainting under the frame's #document wrapper.
    const events = [documentPaint(1000, 500), moverPaintAt(1100, 100)];
    const r = redrawnArea(events, { dpr: 1, frames: 1, viewport: VIEWPORT, layerAreas });
    expect(r).toEqual({ pxPerFrame: 145 * 114, screensPerFrame: (145 * 114) / (VIEWPORT.width * VIEWPORT.height), unresolvedPaints: 0 });
  });

  it('still charges a #document Paint that stands alone', () => {
    const r = redrawnArea([documentPaint(1000, 500)], { dpr: 1, frames: 1, viewport: VIEWPORT, layerAreas });
    expect(r.pxPerFrame).toBe(VIEWPORT.width * VIEWPORT.height);
    expect(r.screensPerFrame).toBe(1);
  });

  it('main\'s shape: a wrapper round two moving sheets is the two sheets, not three screens', () => {
    const sheets = new Map([[19, 1465 * 824], [22, 1465 * 824]]);
    const sheet = (ts, nodeId) => ({ name: 'Paint', ph: 'X', ts, dur: 100, args: { data: { nodeId, nodeName: 'svg', clip: rect(0, 0, 1921, 1080) } } });
    const events = [documentPaint(1000, 1000), sheet(1100, 19), sheet(1300, 22)];
    const r = redrawnArea(events, { dpr: 1, frames: 1, viewport: VIEWPORT, layerAreas: sheets });
    expect(r.pxPerFrame).toBe(2 * 1465 * 824);
    expect(r.unresolvedPaints).toBe(0);
  });

  it('agrees with framePaintWrappers: the total is the areas of the events that are not wrappers', () => {
    const events = [documentPaint(1000, 500), moverPaintAt(1100, 100), documentPaint(17_000, 500), moverPaintAt(20_000, 100, 99)];
    const opts = { viewport: VIEWPORT, layerAreas };
    const wrappers = framePaintWrappers(events);
    const summed = events.filter((ev) => !wrappers.has(ev)).reduce((sum, ev) => sum + paintEventArea(ev, opts).area, 0);
    expect(redrawnArea(events, { dpr: 1, frames: 2, ...opts }).pxPerFrame).toBe(summed / 2);
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

// ========================================
// rasteredArea (docs/tasks/DOCUMENT_REPAINT.md Phase 5, option b)
// ========================================

/** A `RasterTask` trace event the way a raster worker thread emits it: the layer and the frame live under `tileData`. */
const raster = (layerId, sourceFrameNumber, extra = {}) => ({
  name: 'RasterTask',
  ph: 'X',
  dur: 25,
  args: { tileData: { layerId, sourceFrameNumber, tileResolution: 'HIGH_RESOLUTION' } },
  ...extra,
});

const SHEET = 1465 * 824; // one of main's moving sheets, in CSS px²
const BOUNDS = { frames: 2, dpr: 1, viewport: VIEWPORT };

describe('rasteredArea', () => {
  it('charges a layer its area for each frame it rastered, over the frame count', () => {
    const events = [raster(12, 500), raster(12, 501)];
    const { pxPerFrame } = rasteredArea(events, { ...BOUNDS, layerAreasById: new Map([[12, SHEET]]) });
    expect(pxPerFrame).toBe(SHEET);
  });

  it('counts a frame once for a layer however many tiles it rastered in it', () => {
    const events = [raster(12, 500), raster(12, 500), raster(12, 500), raster(12, 501)];
    const { pxPerFrame, perLayer } = rasteredArea(events, { ...BOUNDS, layerAreasById: new Map([[12, SHEET]]) });
    expect(pxPerFrame).toBe(SHEET);
    expect(perLayer.get(12)).toEqual({ frames: 2, tasks: 4, area: SHEET });
  });

  it('sums the layers: two sheets that each raster every frame are two sheets per frame', () => {
    const events = [raster(12, 500), raster(15, 500), raster(12, 501), raster(15, 501)];
    const { pxPerFrame } = rasteredArea(events, { ...BOUNDS, layerAreasById: new Map([[12, SHEET], [15, SHEET]]) });
    expect(pxPerFrame).toBe(2 * SHEET);
  });

  it('charges a layer that rastered on some frames only for those frames', () => {
    // The dissolve layer's shape: a full sheet that rasters one frame in four.
    const events = [raster(106, 500)];
    const { pxPerFrame } = rasteredArea(events, { frames: 4, dpr: 1, viewport: VIEWPORT, layerAreasById: new Map([[106, SHEET]]) });
    expect(pxPerFrame).toBe(SHEET / 4);
  });

  it('reports screens/frame against the viewport in device pixels', () => {
    const full = VIEWPORT.width * VIEWPORT.height;
    const events = [raster(9, 500), raster(9, 501)];
    expect(rasteredArea(events, { ...BOUNDS, layerAreasById: new Map([[9, full]]) }).screensPerFrame).toBe(1);
    expect(rasteredArea(events, { ...BOUNDS, dpr: 2, layerAreasById: new Map([[9, full]]) }).screensPerFrame).toBe(1);
  });

  it('scales px²/frame by the device pixel ratio squared', () => {
    const events = [raster(12, 500), raster(12, 501)];
    expect(rasteredArea(events, { ...BOUNDS, dpr: 2, layerAreasById: new Map([[12, 100]]) }).pxPerFrame).toBe(400);
  });

  it('charges a layer with no known area nothing, and counts it as unresolved once', () => {
    // The branch's unnamed layers (112-118) appear after the LayerTree snapshot; a tile is small, a viewport charge would swamp the column.
    const events = [raster(116, 500), raster(116, 501), raster(118, 500), raster(12, 500)];
    const r = rasteredArea(events, { ...BOUNDS, layerAreasById: new Map([[12, SHEET]]) });
    expect(r.pxPerFrame).toBe(SHEET / 2);
    expect(r.unresolvedLayers).toBe(2);
    expect(r.perLayer.get(116)).toEqual({ frames: 2, tasks: 2, area: undefined });
  });

  it('treats a layer area that is not a finite, non-negative number as unknown', () => {
    const events = [raster(12, 500)];
    for (const bad of [NaN, Infinity, -1, 'big']) {
      const r = rasteredArea(events, { ...BOUNDS, layerAreasById: new Map([[12, bad]]) });
      expect(r.pxPerFrame, String(bad)).toBe(0);
      expect(r.unresolvedLayers, String(bad)).toBe(1);
    }
  });

  it('matches a layer whether the trace and the snapshot key it as a number or a string', () => {
    const events = [raster(12, 500), raster('15', 500)];
    const { pxPerFrame } = rasteredArea(events, { frames: 1, dpr: 1, viewport: VIEWPORT, layerAreasById: new Map([['12', SHEET], [15, SHEET]]) });
    expect(pxPerFrame).toBe(2 * SHEET);
  });

  it('ignores what is not a complete RasterTask: another event, a begin/end half, one with no layer or no frame', () => {
    const events = [
      raster(12, 500, { name: 'Paint' }),
      raster(12, 500, { ph: 'B' }),
      raster(12, 500, { ph: 'E' }),
      raster(undefined, 500),
      raster(12, undefined),
      { name: 'RasterTask', ph: 'X', dur: 25, args: {} },
    ];
    const r = rasteredArea(events, { ...BOUNDS, layerAreasById: new Map([[12, SHEET]]) });
    expect(r).toMatchObject({ pxPerFrame: 0, screensPerFrame: 0, unresolvedLayers: 0 });
    expect(r.perLayer.size).toBe(0);
  });

  it('reads a window with no RasterTask events as 0, not NaN', () => {
    const r = rasteredArea([], { frames: 360, dpr: 1, viewport: VIEWPORT, layerAreasById: new Map() });
    expect(r).toMatchObject({ pxPerFrame: 0, screensPerFrame: 0, unresolvedLayers: 0 });
  });

  it('reads a window with no frames as 0, not Infinity', () => {
    const r = rasteredArea([raster(12, 500)], { frames: 0, dpr: 1, viewport: VIEWPORT, layerAreasById: new Map([[12, SHEET]]) });
    expect(r).toMatchObject({ pxPerFrame: 0, screensPerFrame: 0, unresolvedLayers: 0 });
  });

  it('works without a layer map at all: every layer is unresolved', () => {
    const r = rasteredArea([raster(12, 500)], { frames: 1, dpr: 1, viewport: VIEWPORT });
    expect(r.pxPerFrame).toBe(0);
    expect(r.unresolvedLayers).toBe(1);
  });

  it('main\'s shape: three sheets that raster every frame of a 3 s probe read about three screens per frame', () => {
    const events = [];
    for (let f = 0; f < 179; f++) for (const id of [12, 15, 17]) events.push(raster(id, 500 + f));
    const r = rasteredArea(events, { frames: 179, dpr: 1, viewport: VIEWPORT, layerAreasById: new Map([[12, SHEET], [15, SHEET], [17, SHEET]]) });
    expect(r.screensPerFrame).toBeCloseTo((3 * SHEET) / (VIEWPORT.width * VIEWPORT.height), 6);
    expect(r.unresolvedLayers).toBe(0);
  });
});
