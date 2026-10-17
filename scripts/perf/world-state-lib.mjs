/**
 * Pure helpers for `npm run perf:idle` (scripts/perf/idle-paint.mjs) — what state the world was in when a window was
 * traced, and what the bubble layers cost. Roadmap Phase 53 review follow-ups R5 (bubble strips drawing, spec §7 Q3)
 * and R6 (the dimmed world: a hub tile open puts `data-dimmed` on `.world-view`, which filters every sheet and mover).
 * Node built-ins only; no I/O. Unit-tested in world-state-lib.test.mjs; the Chrome/CDP plumbing lives in idle-paint.mjs.
 */

import { BUBBLE_CIRCLES } from './scene-markup-lib.mjs';

// ========================================
// DIMMED
// ========================================

/**
 * An expression for the page: true if `.world-view` carries `data-dimmed`, false if it does not, null if the page has no
 * world view at all (a run that never got past the off screen). Both `main` and the branch set the attribute the same way.
 */
export const DIMMED_PROBE = `(() => { const w = document.querySelector('.world-view'); return w === null ? null : w.hasAttribute('data-dimmed'); })()`;

/** The probe's value as a name for the log line. Only a real boolean is a reading; anything else is "no world view", never "undimmed". */
export function dimmedReading(value) {
  if (value === true) return 'dimmed';
  if (value === false) return 'undimmed';
  return 'no world view';
}

const EXPECTATIONS = ['yes', 'no', 'any'];

/** `--expect-dimmed`: `yes`, `no` or `any` (the default). Anything else is a typo that would silently measure the wrong state, so it throws. */
export function parseExpectDimmed(value) {
  if (value === undefined) return 'any';
  if (EXPECTATIONS.includes(value)) return value;
  throw new Error(`--expect-dimmed: "${value}" is not one of ${EXPECTATIONS.join(', ')}.`);
}

/** Null if a run's reading is what was expected, else the message to reject the run with. `any` accepts every reading. */
export function checkDimmed(reading, expect) {
  if (expect === 'any') return null;
  const wanted = expect === 'yes' ? 'dimmed' : 'undimmed';
  if (reading === wanted) return null;
  return `Run rejected: expected a ${wanted} world, read "${reading}"${reading === 'no world view' ? ' (the page has no .world-view; did power-on run?)' : ''}.`;
}

// ========================================
// BUBBLES
// ========================================

/** An expression for the page: how many bubble circles are visible right now (computed opacity above 0), on either markup. */
export const BUBBLES_IN_FLIGHT = `[...document.querySelectorAll(${JSON.stringify(BUBBLE_CIRCLES)})].filter((c) => Number(getComputedStyle(c).opacity) > 0).length`;

/**
 * What the bubble layers cost, from the layers the compositor reports for the `bubbles` slot (one sheet on `main`, one strip
 * per stream on the branch). `layers` are `{ drawsContent, area }`, `area` in CSS px². Memory is estimated the way the
 * harness does for all layers: 4 bytes per device px. `mbDrawing` is what the drawing layers hold now; `mbAll` is the
 * ceiling if every one of them drew at once (a layer with nothing visible has no backing store yet, so it adds to the count
 * and to `mbAll`, not to `mbDrawing`). A missing, negative or non-finite area counts the layer but adds no memory.
 * @param {Array<{ drawsContent?: boolean, area?: number }>} layers
 * @param {number} dpr
 */
export function bubbleLayerStats(layers, dpr) {
  const bytes = (area) => (Number.isFinite(area) && area > 0 ? area * 4 * dpr * dpr : 0);
  let drawing = 0;
  let drawingBytes = 0;
  let allBytes = 0;
  for (const layer of layers) {
    allBytes += bytes(layer.area);
    if (layer.drawsContent === true) {
      drawing++;
      drawingBytes += bytes(layer.area);
    }
  }
  return { count: layers.length, drawing, mbDrawing: drawingBytes / (1024 * 1024), mbAll: allBytes / (1024 * 1024) };
}

/**
 * The paint count, time and area of one set of nodes in a traced window, from the harness's per-node table
 * (`backend node id → { count, ms, area }`). An id that never painted adds nothing; an id repeated is counted once.
 * @param {Map<number, { count: number, ms: number, area: number }>} paintByNode
 * @param {Iterable<number>} nodeIds
 */
export function paintTotalsFor(paintByNode, nodeIds) {
  let paints = 0;
  let ms = 0;
  let area = 0;
  for (const id of new Set(nodeIds)) {
    const p = paintByNode.get(id);
    if (!p) continue;
    paints += p.count;
    ms += p.ms;
    area += p.area;
  }
  return { paints, ms, area };
}
