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

/**
 * Redrawn area per frame over one traced window. `events` are the trace events of the thread being judged (the
 * caller scopes them to the renderer main thread); only complete `Paint` events count. `dpr` converts CSS px to
 * device px, `frames` is the window's `BeginMainThreadFrame` count, `viewport` the emulated one in CSS px.
 * `screensPerFrame` is the headline figure: `pxPerFrame` over the viewport's device-pixel area.
 */
export function redrawnArea(events, { dpr, frames, viewport }) {
  if (!frames) return { pxPerFrame: 0, screensPerFrame: 0 };
  let cssPx = 0;
  for (const ev of events) {
    if (ev.name !== 'Paint' || ev.ph !== 'X' || !ev.dur) continue;
    cssPx += clipArea(ev.args?.data?.clip);
  }
  const pxPerFrame = (cssPx * dpr * dpr) / frames;
  const screenPx = viewport.width * viewport.height * dpr * dpr;
  return { pxPerFrame, screensPerFrame: screenPx ? pxPerFrame / screenPx : 0 };
}
