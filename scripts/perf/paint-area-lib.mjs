/**
 * Pure helpers for `npm run perf:idle` (scripts/perf/idle-paint.mjs) — the "redrawn px²/frame" column that
 * roadmap Phase 53 (per-mover compositor layers) is gated on. A `Paint` trace event carries the rectangle it
 * painted as a four-corner `clip` quad; summed over a window and divided by the window's frame count it is how
 * much of the screen was repainted per frame. Node built-ins only; no I/O.
 * Unit-tested in paint-area-lib.test.mjs; the Chrome/CDP plumbing lives in idle-paint.mjs.
 */

// ========================================
// FUNCTIONS
// ========================================

/** The area of a `Paint` event's clip quad (x1,y1 .. x4,y4) by the shoelace formula, in CSS px². A missing, short or non-numeric clip is 0. */
export function clipArea(clip) {
  if (!Array.isArray(clip) || clip.length < 8) return 0;
  const pts = clip.slice(0, 8);
  if (!pts.every(Number.isFinite)) return 0;
  let twice = 0;
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    twice += pts[2 * i] * pts[2 * j + 1] - pts[2 * j] * pts[2 * i + 1];
  }
  return Math.abs(twice) / 2;
}

/** A compositor layer's on-screen CSS-px area: its reported size scaled by the ancestor scale LayerTree leaves out (the stage's). A missing size or a non-finite or negative scale is 0. */
export function scaledLayerArea(layer, scale) {
  const { width, height } = layer ?? {};
  if (!Number.isFinite(width) || !Number.isFinite(height) || !Number.isFinite(scale) || scale < 0) return 0;
  return width * height * scale * scale;
}

/**
 * One event's share of the redrawn area, in CSS px² — the single rule the headline figure (`redrawnArea`) and the
 * harness's per-node table both use, so they cannot disagree about a node.
 *
 * A `Paint` clip is a cull rect, not the repainted area: a promoted mover reports an unbounded one (Task 16), a sheet
 * reports its viewBox's scene units. `layerAreas` (backend node id → that node's layer area in CSS px²) bounds the
 * paint by the layer it drew into; a node with no known layer (missing, NaN, infinite or negative) is capped at one
 * `viewport` and reported `unresolved`, so a gap in the map shows in the result instead of inflating it silently.
 * Anything that is not a complete `Paint` (another event, a begin/end half, a zero-duration mark) is 0 and resolved.
 * @param {{ name?: string, ph?: string, dur?: number, args?: { data?: { clip?: number[], nodeId?: number } } }} ev
 * @param {{ viewport: { width: number, height: number }, layerAreas?: Map<number, number> }} bounds
 * @returns {{ area: number, unresolved: boolean }}
 */
export function paintEventArea(ev, { viewport, layerAreas }) {
  if (ev.name !== 'Paint' || ev.ph !== 'X' || !ev.dur) return { area: 0, unresolved: false };
  const area = clipArea(ev.args?.data?.clip);
  const layerArea = layerAreas?.get(ev.args?.data?.nodeId);
  if (Number.isFinite(layerArea) && layerArea >= 0) return { area: Math.min(area, layerArea), unresolved: false };
  const viewportCssPx = viewport.width * viewport.height;
  if (area > viewportCssPx) return { area: viewportCssPx, unresolved: true };
  return { area, unresolved: false };
}

/** A complete `Paint` event: the `X` phase with a duration. The begin/end halves and zero-duration marks are not. */
const isCompletePaint = (ev) => ev?.name === 'Paint' && ev.ph === 'X' && Number.isFinite(ev.ts) && Number.isFinite(ev.dur) && ev.dur > 0;

/**
 * The frame wrappers in a window: Chrome opens one `Paint` on `#document` (layerId 0, a viewport-sized clip) per
 * frame that paints anything, and the per-layer `Paint` events sit inside its span. It is the whole-frame paint pass
 * (`LocalFrameView::PaintTree`), not a repaint of the document's layer, which does not raster for it
 * (docs/tasks/DOCUMENT_REPAINT.md, Phase 1: one raster frame in 179 on both builds; charging it a viewport per frame
 * was the whole of the Task 20 miss). A `#document` Paint with **no** complete `Paint` inside its span is left out of
 * the set: that is a root-layer repaint with nothing nested, and it still counts. Returns the wrapper events
 * themselves, so a caller can skip them by identity.
 * @param {Array<{ name?: string, ph?: string, ts?: number, dur?: number, args?: { data?: { nodeName?: string } } }>} events
 * @returns {Set<object>}
 */
export function framePaintWrappers(events) {
  const paints = (events ?? []).filter(isCompletePaint);
  const wrappers = new Set();
  for (const doc of paints) {
    if (doc.args?.data?.nodeName !== '#document') continue;
    const end = doc.ts + doc.dur;
    if (paints.some((p) => p !== doc && p.ts >= doc.ts && p.ts + p.dur <= end)) wrappers.add(doc);
  }
  return wrappers;
}

/**
 * Redrawn area per frame over one traced window. `events` are the trace events of the thread being judged (the
 * caller scopes them to the renderer main thread); only complete `Paint` events count, each by `paintEventArea`,
 * and never a frame wrapper (`framePaintWrappers`).
 * `dpr` converts CSS px to device px, `frames` is the window's `BeginMainThreadFrame` count, `viewport` the emulated
 * one in CSS px, `layerAreas` the per-node layer bounds. `screensPerFrame` is the headline figure: `pxPerFrame` over
 * the viewport's device-pixel area; `unresolvedPaints` counts the events `paintEventArea` could not bound.
 */
export function redrawnArea(events, { dpr, frames, viewport, layerAreas }) {
  if (!frames) return { pxPerFrame: 0, screensPerFrame: 0, unresolvedPaints: 0 };
  const viewportCssPx = viewport.width * viewport.height;
  const wrappers = framePaintWrappers(events);
  let cssPx = 0;
  let unresolvedPaints = 0;
  for (const ev of events) {
    if (wrappers.has(ev)) continue;
    const { area, unresolved } = paintEventArea(ev, { viewport, layerAreas });
    cssPx += area;
    if (unresolved) unresolvedPaints++;
  }
  const pxPerFrame = (cssPx * dpr * dpr) / frames;
  const screenPx = viewportCssPx * dpr * dpr;
  return { pxPerFrame, screensPerFrame: screenPx ? pxPerFrame / screenPx : 0, unresolvedPaints };
}
