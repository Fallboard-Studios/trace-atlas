#!/usr/bin/env node
/**
 * Idle paint & composite localizer (roadmap 17.2.5).
 *
 * Where `profile.mjs` measures tile switches, this measures the *idle* blank hub — powered on, nothing open — and
 * answers "what repaints every frame?" two ways, in one Chrome session on one world so the variants are comparable:
 *
 *   1. Attribution: every `Paint` trace event carries the DOM node it painted; totals per node, resolved to a selector.
 *   2. Ablation: the same idle window is re-traced with one suspect switched off at a time (a `<style>` injected into the
 *      page — no rebuild, no product change), and the paint/composite totals compared against the stock window.
 *
 * Two area columns per window (paint-area-lib.mjs): `screens/frame`, from the paint phase's `Paint` clips clamped to their
 * layers, and `rastered screens/frame`, from the raster workers' `RasterTask` events, each compositor layer charged its
 * area once per frame it rastered in (docs/tasks/DOCUMENT_REPAINT.md Phase 5); the stock window's raster-by-layer table
 * names the layers.
 *
 * Needs Node 22+ (built-in WebSocket) and Chrome/Edge. Serve a production build first (`npm run build && npx vite preview --port 4173`).
 *
 *   node scripts/perf/idle-paint.mjs [--throttle 4] [--window 6000] [--url http://localhost:4173/trace-atlas/] [--only a,b,c]
 *                                    [--stay-off] [--steps "Fleet Params,Spectral"] [--expect-dimmed yes|no|any] [--bubbles n]
 *
 * `--stay-off` measures the powered-off screen (layout rework, roadmap Phase 45): no power-on click, so the window is the still
 * world behind the off screen. `--steps` clicks each named button in turn after power-on (first button whose aria-label or text
 * contains the name, case-insensitive) to measure a content screen instead of the Deck.
 *
 * Every run prints `World: dimmed|undimmed|no world view` (a hub tile open puts `data-dimmed` on `.world-view`, which filters
 * every sheet and mover). `--expect-dimmed yes|no` rejects, by throwing, a run whose world is not that state, before and after
 * the windows, so a run that silently measured the wrong state is never recorded. `--bubbles n` waits (up to 3 minutes) until at
 * least n bubble circles are in flight before the layers are read, so the bubble layers are read while they draw; a window
 * longer than a burst interval (`--window 30000`) covers several bursts either way; a window over 6 s is traced without invalidation tracking (world-state-lib.mjs `traceCategories`), so it prints no invalidation table and is compared only with windows of its own length.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { framePaintWrappers, paintEventArea, rasteredArea, redrawnArea, scaledLayerArea } from './paint-area-lib.mjs';
import {
  BACK_ROBOT_ELEMENTS,
  BACK_ROBOT_GROUPS,
  BUBBLE_CIRCLES,
  FRONT_ROBOT_ELEMENTS,
  ROBOT_CONTAINERS,
  ROBOT_DETACH,
  ROBOT_GROUPS,
  SCENE_SLOT_NAMES,
  SHEET_SELECTOR,
  isMoverNode,
  sceneSlotSelector,
  slotNameOf,
} from './scene-markup-lib.mjs';
import {
  BUBBLES_IN_FLIGHT,
  DIMMED_PROBE,
  bubbleLayerStats,
  checkDimmed,
  dimmedReading,
  paintTotalsFor,
  parseExpectDimmed,
  traceCategories,
  truncationWarning,
} from './world-state-lib.mjs';

const { values: opts } = parseArgs({
  options: {
    'expect-dimmed': { type: 'string' },
    bubbles: { type: 'string' },
    url: { type: 'string', default: 'http://localhost:4173/trace-atlas/' },
    throttle: { type: 'string', default: '4' },
    window: { type: 'string', default: '6000' },
    width: { type: 'string', default: '1280' },
    only: { type: 'string' },
    chrome: { type: 'string' },
    port: { type: 'string', default: '9223' },
    attribution: { type: 'boolean', default: true },
    'stay-off': { type: 'boolean', default: false },
    steps: { type: 'string' },
    'raster-top': { type: 'string', default: '12' },
    help: { type: 'boolean', default: false },
  },
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const WINDOW_MS = Number(opts.window);

/** The bubble circles — scene-markup-lib.mjs reads both the stage markup and the layers before it, so one name ablates a branch build and a `main` build. */
const BUBBLES = BUBBLE_CIRCLES;

/** Both robot rows, on either markup (scene-markup-lib.mjs): the rows' groups before Phase 53, the robots' movers since. */
const ROBOTS = ROBOT_CONTAINERS;

/** The full-screen depth overlays: J4's four tints, and the two gradient rects they replaced, so one name ablates both builds. */
const TINTS = 'rect[data-depth-tint], #gradient-back-mid, #gradient-mid-front';

/** Each slot of the scene's stack, back to front, with the selector that finds its nodes in either markup (a slot the build lacks reads absent). */
const SLOT_SELECTORS = Object.fromEntries(SCENE_SLOT_NAMES.map((name) => [name, sceneSlotSelector(name)]));

/** Each ablation is a CSS snippet injected into the page. `stock` is traced first and last so drift is visible. */
const ABLATIONS = [
  { name: 'stock', css: '' },
  { name: 'no-fill-transitions', css: '.ocean-scene * { transition: none !important; }' },
  { name: 'no-bridge-flicker', css: '.screen-viewport::before { animation: none !important; }' },
  { name: 'no-rocker-pulse', css: '.rocker-light { animation: none !important; }' },
  { name: 'no-bubbles', css: `${BUBBLES} { display: none !important; }` },
  { name: 'no-robots', css: `${ROBOTS} { display: none !important; }` },
  // Phase 43 J2: the charging stations' three fragments, interleaved with the robots (L4 · L3 · robots · front).
  { name: 'no-stations', css: '#station-l4-layer, #station-l3-layer, #station-front-layer { display: none !important; }' },
  { name: 'no-factories', css: '#factory-background-layer, #factory-midground-layer, #factory-foreground-layer { display: none !important; }' },
  { name: 'no-scene', css: '.ocean-scene { display: none !important; }' },
  // Combined: nothing moves inside the scene (robots and bubbles hidden) but the per-second lighting fills still transition.
  { name: 'no-robots+no-bubbles', css: `${ROBOTS}, ${BUBBLES} { display: none !important; }` },
  // Combined: nothing moves AND the fill transitions are off — if the scene still repaints every frame, something else invalidates it.
  { name: 'static-scene', css: `${ROBOTS}, ${BUBBLES} { display: none !important; } .ocean-scene * { transition: none !important; }` },
  { name: 'no-gradient-rects', css: `${TINTS} { display: none !important; }` },
  // Everything animated that this script knows about, off at once.
  { name: 'all-anim-off', css: `${ROBOTS}, ${BUBBLES} { display: none !important; } .ocean-scene * { transition: none !important; } .screen-viewport::before, .rocker-light { animation: none !important; }` },
  { name: 'all-anim-off+no-header', css: `${ROBOTS}, ${BUBBLES} { display: none !important; } .ocean-scene * { transition: none !important; } .screen-viewport::before, .rocker-light { animation: none !important; } header, .header { display: none !important; }` },
  { name: 'stock (again)', css: '' },
  // Irreversible (sticky) steps, last: moving nodes are REMOVED from the DOM, not hidden — GSAP keeps writing transforms
  // to a display:none element and Blink still invalidates style/layout for it, so display:none is not "nothing moves".
  { name: 'detach-bubbles', sticky: true, js: `document.querySelectorAll(${JSON.stringify(BUBBLES)}).forEach((e) => e.remove())` },
  { name: 'detach-bubbles+robots', sticky: true, js: `document.querySelectorAll(${JSON.stringify(ROBOT_DETACH)}).forEach((e) => e.remove())` },
  // How much of a robot's per-frame cost is the body moving vs. the propeller spinning (docs/PERFORMANCE.md, 17.2.5:
  // the propellers turned out to be a small share, and HTML-positioned robots were measured neutral and reverted).
  { name: 'detach-propellers', sticky: true, js: `document.querySelectorAll('.propeller').forEach((e) => e.remove())` },
  { name: 'detached+no-transitions', css: '.ocean-scene * { transition: none !important; }' },
  { name: 'detached+all-anim-off', css: '.ocean-scene * { transition: none !important; } .screen-viewport::before, .rocker-light { animation: none !important; }' },
];

if (opts.help) {
  console.log(`Usage: node scripts/perf/idle-paint.mjs [--throttle n] [--window ms] [--width px] [--url u] [--only names] [--steps names]
  [--expect-dimmed yes|no|any]  reject a run whose world is not (or is) dimmed by an open hub tile
  [--bubbles n]                 wait until n bubble circles are in flight before reading the layers
  [--raster-top n]              rows in the stock window's raster-by-layer table (default 12; a 30 s window rasters 100+ layers)
Ablations (comma-separate for --only): ${ABLATIONS.map((a) => a.name).join(', ')}`);
  process.exit(0);
}

function findChrome() {
  const platformDefaults = process.platform === 'win32'
    ? [
      'C:/Program Files/Google/Chrome/Application/chrome.exe',
      'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
      'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    ]
    : process.platform === 'darwin'
      ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
      : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  const found = [opts.chrome, process.env.CHROME_PATH, ...platformDefaults].filter(Boolean).find((p) => existsSync(p));
  if (!found) throw new Error('No Chrome/Edge found — pass --chrome <path> or set CHROME_PATH.');
  return found;
}

async function connect(port) {
  let wsUrl;
  for (let i = 0; i < 50 && !wsUrl; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      wsUrl = targets.find((t) => t.type === 'page')?.webSocketDebuggerUrl;
    } catch { /* not listening yet */ }
    if (!wsUrl) await sleep(200);
  }
  if (!wsUrl) throw new Error(`Chrome did not expose a debugging target on port ${port}.`);
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  let nextId = 0;
  const pending = new Map();
  const listeners = new Set();
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id !== undefined && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message)); else resolve(msg.result);
    } else if (msg.method) {
      for (const listener of listeners) listener(msg);
    }
  });
  return {
    send: (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    }),
    onEvent: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    close: () => ws.close(),
  };
}

/**
 * Trace one window. Returns per-name totals, the main-thread busy time, frame count, per-node paint totals and the
 * redrawn area per frame (roadmap Phase 53's gate: `redrawn px²/frame` and `screens/frame`, paint-area-lib.mjs).
 * `view` is the emulated viewport and device scale the area is measured against.
 */
async function traceWindow({ send, onEvent }, ms, view) {
  const events = [];
  const stopCollecting = onEvent((m) => { if (m.method === 'Tracing.dataCollected') events.push(...m.params.value); });
  const complete = new Promise((resolve) => {
    const stop = onEvent((m) => { if (m.method === 'Tracing.tracingComplete') { stop(); resolve(); } });
  });
  await send('Tracing.start', {
    transferMode: 'ReportEvents',
    traceConfig: { includedCategories: traceCategories(ms) },
  });
  await sleep(ms);
  await send('Tracing.end');
  await complete;
  stopCollecting();

  // Main thread = the renderer main thread (`CrRendererMain` in the trace's thread_name metadata) that painted the
  // most — there can be several renderers (about:blank, extensions), and the busiest thread overall is not it.
  const rendererMains = new Set();
  for (const ev of events) {
    if (ev.ph === 'M' && ev.name === 'thread_name' && ev.args?.name === 'CrRendererMain') rendererMains.add(`${ev.pid}:${ev.tid}`);
  }
  const paintBy = new Map();
  const runTaskBy = new Map();
  const longTaskBy = new Map(); // RunTask slices over 50 ms, the long-task threshold
  for (const ev of events) {
    const k = `${ev.pid}:${ev.tid}`;
    if (!rendererMains.has(k) || ev.ph !== 'X' || !ev.dur) continue;
    if (ev.name === 'Paint') paintBy.set(k, (paintBy.get(k) ?? 0) + 1);
    if (ev.name === 'RunTask') {
      runTaskBy.set(k, (runTaskBy.get(k) ?? 0) + ev.dur / 1000);
      if (ev.dur > 50_000) longTaskBy.set(k, (longTaskBy.get(k) ?? 0) + 1);
    }
  }
  const mainKey = [...rendererMains].sort((a, b) => (paintBy.get(b) ?? 0) - (paintBy.get(a) ?? 0) || (runTaskBy.get(b) ?? 0) - (runTaskBy.get(a) ?? 0))[0] ?? '';
  const mainBusy = runTaskBy.get(mainKey) ?? 0;

  const byName = new Map();
  const paintByNode = new Map();
  const invalidations = new Map(); // `${event} ${reason}` -> { count, nodes: Map<nodeId, count> }
  const mainPaints = [];
  let frames = 0;
  for (const ev of events) {
    if (`${ev.pid}:${ev.tid}` !== mainKey) continue;
    if (ev.name === 'Paint') mainPaints.push(ev);
    if (/InvalidationTracking$/.test(ev.name)) {
      const d = ev.args?.data ?? {};
      const key = `${ev.name.replace('InvalidationTracking', '')} ${d.reason ?? d.invalidationSet ?? d.changedClass ?? d.changedAttribute ?? ''}`.trim();
      const cur = invalidations.get(key) ?? { count: 0, nodes: new Map() };
      cur.count++;
      const nodeId = d.nodeId ?? -1;
      cur.nodes.set(nodeId, (cur.nodes.get(nodeId) ?? 0) + 1);
      invalidations.set(key, cur);
      continue;
    }
    if (ev.name === 'DrawFrame' || ev.name === 'BeginMainThreadFrame') { if (ev.name === 'BeginMainThreadFrame') frames++; continue; }
    if (ev.ph !== 'X' || !ev.dur) continue;
    const cur = byName.get(ev.name) ?? { count: 0, ms: 0 };
    cur.count++;
    cur.ms += ev.dur / 1000;
    byName.set(ev.name, cur);
  }
  // Per-node attribution, by the headline's rule: the frame's `#document` wrapper (paint-area-lib.mjs
  // `framePaintWrappers`) is not a painter, so it is left out here as it is in `redrawnArea`.
  const wrappers = framePaintWrappers(mainPaints);
  for (const ev of mainPaints) {
    if (ev.ph !== 'X' || !ev.dur || wrappers.has(ev)) continue;
    const nodeId = ev.args?.data?.nodeId ?? -1;
    const p = paintByNode.get(nodeId) ?? { count: 0, ms: 0, area: 0 };
    p.count++;
    p.ms += ev.dur / 1000;
    p.area += paintEventArea(ev, { viewport: view.viewport, layerAreas: view.layerAreas }).area;
    paintByNode.set(nodeId, p);
  }
  const warning = truncationWarning(frames, ms);
  if (warning) console.log(warning);
  const get = (n) => byName.get(n) ?? { count: 0, ms: 0 };
  const redrawn = redrawnArea(mainPaints, { dpr: view.dpr, frames, viewport: view.viewport, layerAreas: view.layerAreas });
  // Option (b) of docs/tasks/DOCUMENT_REPAINT.md: what the compositor re-drew, from the RasterTask events on every
  // thread (the raster workers, not the main thread), each layer charged its area once per frame it rastered in.
  // A layer that appeared after the pre-window snapshot is read from a second snapshot taken now (layer ids are stable
  // for a layer's life); one gone again by now stays unresolved. The paint clamp keeps the pre-window map, unchanged.
  const layersById = new Map(view.layersById);
  const layerAreasById = new Map(view.layerAreasById);
  let lateLayers = 0;
  for (const l of (await readLayerTree({ send, onEvent })) ?? []) {
    if (layersById.has(l.layerId)) continue;
    layersById.set(l.layerId, l);
    layerAreasById.set(l.layerId, scaledLayerArea(l, (await insideStage(send, l)) ? view.stageScale : 1));
    lateLayers++;
  }
  const rastered = rasteredArea(events, { frames, dpr: view.dpr, viewport: view.viewport, layerAreasById });
  return {
    'main busy (ms)': Math.round(mainBusy),
    'long tasks': longTaskBy.get(mainKey) ?? 0,
    frames,
    'redrawn px²/frame': Math.round(redrawn.pxPerFrame),
    'screens/frame': Number(redrawn.screensPerFrame.toFixed(2)),
    'unresolved Paints': redrawn.unresolvedPaints,
    'frame wrappers': wrappers.size,
    'rastered px²/frame': Math.round(rastered.pxPerFrame),
    'rastered screens/frame': Number(rastered.screensPerFrame.toFixed(2)),
    'unresolved raster layers': rastered.unresolvedLayers,
    'late layers': lateLayers,
    'Paint n': get('Paint').count,
    'Paint ms': Math.round(get('Paint').ms),
    'PaintLifecycle ms': Math.round(get('LocalFrameView::RunPaintLifecyclePhase').ms),
    'Compositor::Update ms': Math.round(get('PaintArtifactCompositor::Update').ms),
    'Layerize ms': Math.round(get('Layerize').ms),
    'UpdateLayoutTree ms': Math.round(get('UpdateLayoutTree').ms),
    'Layout ms': Math.round(get('Layout').ms),
    'FunctionCall ms': Math.round(get('FunctionCall').ms),
    'Animation frame ms': Math.round(get('FireAnimationFrame').ms),
    'TimerFire ms': Math.round(get('TimerFire').ms),
    paintByNode,
    invalidations,
    rasterByLayer: rastered.perLayer,
    rasterLayersById: layersById,
  };
}

/** Resolve a backend DOM node id to a short selector-ish description. */
async function describeNode(send, backendNodeId) {
  try {
    const { nodeIds } = await send('DOM.pushNodesByBackendIdsToFrontend', { backendNodeIds: [backendNodeId] });
    const { node } = await send('DOM.describeNode', { nodeId: nodeIds[0] });
    const attrs = {};
    for (let i = 0; i < (node.attributes?.length ?? 0); i += 2) attrs[node.attributes[i]] = node.attributes[i + 1];
    const id = attrs.id ? `#${attrs.id}` : '';
    const cls = attrs.class ? `.${attrs.class.trim().split(/\s+/).slice(0, 3).join('.')}` : '';
    return `${node.localName}${id}${cls}`;
  } catch {
    return `node ${backendNodeId}`;
  }
}

/**
 * Phase 43 J4 (Task 35): the compositor layers, once, before any traced window. Memory is estimated the way
 * DevTools' Layers panel does — width × height × 4 bytes for each layer that draws content — so it is a
 * comparison figure, not the GPU's real allocation. LayerTree reports CSS pixels, so the estimate is scaled
 * by the emulated device scale factor squared. The scene's own layers are named by their slot (scene-markup-lib.mjs).
 */
async function printCompositorLayers(cdp, dpr, stageScale) {
  const { send } = cdp;
  const layers = await readLayerTree(cdp);
  if (!layers) { console.log('Compositor layers: no layer tree reported'); return { layerAreas: new Map(), layerAreasById: new Map(), layersById: new Map(), bubbleNodes: new Set() }; }
  const drawing = layers.filter((l) => l.drawsContent);
  // LayerTree reports a layer's bounds before the scale of the stage it sits in (Phase 53, memory finding 3), so a layer inside the stage is scaled
  // here; a build with no stage (main) has none to apply. The scaled area is the layer's true size in CSS px, for the memory line and the paint clamp.
  const scaled = new Map();
  for (const l of layers) scaled.set(l, scaledLayerArea(l, (await insideStage(send, l)) ? stageScale : 1));
  const mb = (ls) => (ls.reduce((s, l) => s + scaled.get(l) * 4 * dpr * dpr, 0) / (1024 * 1024)).toFixed(1);
  const owned = drawing.filter((l) => l.backendNodeId !== undefined);
  const scene = [];
  const moverLayers = [];
  for (const l of owned) {
    const found = await describeSceneLayer(send, l.backendNodeId);
    if (!found) continue;
    scene.push(`${found.name}${found.mover ? ' (mover)' : ''} ${Math.round(l.width)}×${Math.round(l.height)}`);
    if (found.mover) moverLayers.push(l);
  }
  // Review follow-up R5: the bubble layers, drawing or not (a strip with nothing visible has a layer but no backing store yet).
  const bubbleLayers = [];
  for (const l of layers) {
    if (l.backendNodeId === undefined) continue;
    if ((await describeSceneLayer(send, l.backendNodeId))?.name === 'bubbles') bubbleLayers.push(l);
  }
  const bubbleStats = bubbleLayerStats(bubbleLayers.map((l) => ({ drawsContent: l.drawsContent, area: scaled.get(l) })), dpr);
  console.log(`Compositor layers: ${layers.length} (${drawing.length} drawing content, ≈ ${mb(drawing)} MB at 4 B per device px, DPR ${dpr}, stage scale ${stageScale.toFixed(3)}; ${owned.length} with an owning node); scene (CSS px, pre-scale): ${scene.join(', ') || 'none named'}`);
  // Phase 53: the movers' layers, separately from the sheets' (a build without movers reads 0).
  console.log(`Mover layers: ${moverLayers.length}, ≈ ${mb(moverLayers)} MB at 4 B per device px`);
  console.log(`Bubble layers: ${bubbleStats.count} (${bubbleStats.drawing} drawing now, ≈ ${bubbleStats.mbDrawing.toFixed(2)} MB; ≈ ${bubbleStats.mbAll.toFixed(2)} MB if every one drew at once)`);
  // Backend node id → layer area in CSS px², the bound each Paint is clamped to (paint-area-lib.mjs `redrawnArea`);
  // layer id → the same area, for the RasterTask events (`rasteredArea`), with the layers themselves for the raster-by-layer
  // table; and the bubble layers' nodes, whose paints the stock window reports apart.
  return {
    layerAreas: new Map(layers.filter((l) => l.backendNodeId !== undefined).map((l) => [l.backendNodeId, scaled.get(l)])),
    layerAreasById: new Map(layers.map((l) => [l.layerId, scaled.get(l)])),
    layersById: new Map(layers.map((l) => [l.layerId, l])),
    bubbleNodes: new Set(bubbleLayers.map((l) => l.backendNodeId)),
  };
}

/** One LayerTree snapshot (the first `layerTreeDidChange` after enabling it, up to 3 s), or null if none was reported. */
async function readLayerTree({ send, onEvent }) {
  let layers = null;
  const stop = onEvent((m) => { if (m.method === 'LayerTree.layerTreeDidChange' && m.params.layers) layers = m.params.layers; });
  await send('LayerTree.enable');
  for (let i = 0; i < 30 && !layers; i++) await sleep(100);
  await send('LayerTree.disable');
  stop();
  return layers;
}

/** Whether a layer's owning node sits inside the scaled stage (`.ocean-scene__stage`), so LayerTree's bounds for it are pre-scale. */
async function insideStage(send, layer) {
  if (layer.backendNodeId === undefined) return false;
  try {
    const { object } = await send('DOM.resolveNode', { backendNodeId: layer.backendNodeId });
    const r = await send('Runtime.callFunctionOn', { objectId: object.objectId, functionDeclaration: `function () { return !!(this.closest && this.closest('.ocean-scene__stage')); }`, returnByValue: true });
    return r.result?.value === true;
  } catch { /* not resolvable: treat as outside */ }
  return false;
}

/** A layer's slot name and whether it is a mover, if its owning node is one of the scene's sheets or movers. */
async function describeSceneLayer(send, backendNodeId) {
  try {
    const { node } = await send('DOM.describeNode', { backendNodeId });
    const attrs = node.attributes ?? [];
    const name = slotNameOf(attrs);
    return name ? { name, mover: isMoverNode(attrs) } : null;
  } catch { /* not resolvable */ }
  return null;
}

async function run(cdp) {
  const { send } = cdp;
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'evaluate failed');
    return r.result.value;
  };
  const width = Number(opts.width);
  const isPhone = width <= 480;
  const view = { dpr: isPhone ? 2 : 1, viewport: { width, height: isPhone ? 844 : 900 } };
  await send('Page.enable');
  await send('Runtime.enable');
  await send('DOM.enable');
  await send('Emulation.setDeviceMetricsOverride', isPhone
    ? { width, height: 844, deviceScaleFactor: 2, mobile: true }
    : { width, height: 900, deviceScaleFactor: 1, mobile: false });

  await send('Page.navigate', { url: opts.url });
  for (let i = 0; i < 75; i++) {
    if (await evaluate(`!!document.querySelector('button[aria-label="Power on"]')`)) break;
    if (i === 74) throw new Error(`Power button never appeared at ${opts.url} — is the server running?`);
    await sleep(200);
  }
  await sleep(1500);
  await send('Emulation.setCPUThrottlingRate', { rate: Number(opts.throttle) });

  // A real mouse click: the layout-rework rocker ignores a scripted `.click()`; the older power button took either.
  const clickAt = async (selector) => {
    const { x, y } = await evaluate(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
      await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: type === 'mouseMoved' ? 0 : 1 });
    }
  };
  if (!opts['stay-off']) await clickAt('button[aria-label="Power on"]');
  await sleep(8000); // power-on + spawn settle (or, with --stay-off, the still world settling)
  for (const step of (opts.steps ?? '').split(',').map((t) => t.trim()).filter(Boolean)) {
    const marked = await evaluate(`(() => {
      const wanted = ${JSON.stringify(step.toLowerCase())};
      const el = [...document.querySelectorAll('button')].find((b) => (b.getAttribute('aria-label') || b.textContent || '').trim().toLowerCase().includes(wanted));
      if (!el) return false;
      el.setAttribute('data-perf-step', '1');
      return true;
    })()`);
    if (!marked) throw new Error(`--steps: no button matching "${step}".`);
    await clickAt('[data-perf-step="1"]');
    await evaluate(`document.querySelector('[data-perf-step="1"]')?.removeAttribute('data-perf-step')`);
    await sleep(1500);
  }
  if (opts.steps) {
    // Which screen did the steps land on? Counts of what it mounted, so two builds can be checked for like-for-like content.
    const screen = await evaluate(`({ tabs: document.querySelectorAll('[role="tab"]').length, sliders: document.querySelectorAll('[role="slider"]').length,
      cabinetBoxes: document.querySelectorAll('.sc-cabinet-box').length, heading: (document.querySelector('h1, h2, [role="heading"]')?.textContent ?? '').trim().slice(0, 60) })`);
    console.log(`Screen after steps: ${JSON.stringify(screen)}`);
  }
  const robots = await evaluate(`document.querySelectorAll(${JSON.stringify(ROBOT_GROUPS)}).length`);
  const factories = await evaluate(`document.querySelectorAll('[data-factory-type]').length`);
  const bubbles = await evaluate(`document.querySelectorAll(${JSON.stringify(BUBBLES)}).length`);
  const layers = await evaluate(`document.querySelectorAll(${JSON.stringify(SHEET_SELECTOR)}).length`);
  console.log(`Idle paint localizer — ${opts.url}, ${opts.throttle}x throttle, ${width}px, ${WINDOW_MS} ms windows${opts['stay-off'] ? ', powered off' : ''}${opts.steps ? `, after: ${opts.steps}` : ''}`);
  console.log(`Scene: ${robots} robots, ${factories} factories, ${bubbles} bubble circles,${layers} scene layers (0 = the pre-17.2.5 single svg)`);
  // Phase 43 J4: element count per scene layer, by name (a layer the build doesn't have reads "absent").
  const perLayer = await evaluate(`(() => Object.fromEntries(Object.entries(${JSON.stringify(SLOT_SELECTORS)}).map(([name, selector]) => {
    const nodes = document.querySelectorAll(selector);
    return [name, nodes.length ? [...nodes].reduce((n, el) => n + el.querySelectorAll('*').length, 0) : 'absent'];
  })))()`);
  console.log(`Scene layers (elements): ${SCENE_SLOT_NAMES.map((name) => `${name} ${perLayer[name]}`).join(', ')}`);
  // Phase 43 J2 gate: element counts in the robots' stack (stations included). The robot rows are read through scene-markup-lib.mjs:
  // before J4 only the front row exists (the back row reads 0), and since Phase 53 Task 13 a row is its robots' movers, not a group.
  // Since Task 11 the three station groups are static: L4 closes the back sheet, L3 is the stations sheet, the front fragment opens the front sheet.
  const stack = await evaluate(`(() => {
    const n = (s) => document.querySelectorAll(s).length;
    const shown = [...document.querySelectorAll(${JSON.stringify(ROBOT_GROUPS)})].filter((e) => getComputedStyle(e).visibility !== 'hidden' && getComputedStyle(e).display !== 'none').length;
    return { stations: new Set([...document.querySelectorAll('[data-station-id]')].map((e) => e.dataset.stationId)).size,
      l4: n('#station-l4-layer *'), l3: n('#station-l3-layer *'), frontRow: n(${JSON.stringify(FRONT_ROBOT_ELEMENTS)}), backRow: n(${JSON.stringify(BACK_ROBOT_ELEMENTS)}),
      backRobots: n(${JSON.stringify(BACK_ROBOT_GROUPS)}), front: n('#station-front-layer *'), shown };
  })()`);
  console.log(`Robots stack: ${stack.stations} stations; elements L4 ${stack.l4}, L3 ${stack.l3}, front row ${stack.frontRow}, front ${stack.front}; back row ${stack.backRow} (${stack.backRobots} robots); ${stack.shown} robots visible`);
  const stageScale = await evaluate(`(() => { const s = document.querySelector('.ocean-scene__stage'); return s ? new DOMMatrix(getComputedStyle(s).transform).a : 1; })()`);
  const expectDimmed = parseExpectDimmed(opts['expect-dimmed']);
  const worldBefore = dimmedReading(await evaluate(DIMMED_PROBE));
  console.log(`World: ${worldBefore}`);
  const rejectedBefore = checkDimmed(worldBefore, expectDimmed);
  if (rejectedBefore) throw new Error(rejectedBefore);
  if (opts.bubbles !== undefined) {
    const wanted = Number(opts.bubbles);
    let inFlight = await evaluate(BUBBLES_IN_FLIGHT);
    for (let i = 0; i < 360 && inFlight < wanted; i++) {
      await sleep(500);
      inFlight = await evaluate(BUBBLES_IN_FLIGHT);
    }
    if (inFlight < wanted) throw new Error(`--bubbles ${wanted}: only ${inFlight} bubble circles in flight after 3 minutes.`);
  }
  console.log(`Bubbles in flight at the layer read: ${await evaluate(BUBBLES_IN_FLIGHT)}`);
  const layerInfo = await printCompositorLayers(cdp, view.dpr, stageScale);
  view.layerAreas = layerInfo.layerAreas;
  view.layerAreasById = layerInfo.layerAreasById;
  view.layersById = layerInfo.layersById;
  view.stageScale = stageScale;
  console.log('');

  const wanted = opts.only ? new Set(opts.only.split(',').map((s) => s.trim())) : null;
  const rows = [];
  let stockPaint = null;
  let stockRaster = null;
  for (const ab of ABLATIONS) {
    if (wanted && !wanted.has(ab.name) && ab.name !== 'stock') continue;
    await evaluate(`(() => {
      let s = document.getElementById('__ablate');
      if (!s) { s = document.createElement('style'); s.id = '__ablate'; document.head.appendChild(s); }
      s.textContent = ${JSON.stringify(ab.css ?? '')};
      ${ab.js ?? ''};
      return true;
    })()`);
    await sleep(2000);
    const r = await traceWindow(cdp, WINDOW_MS, view);
    const { paintByNode, invalidations, rasterByLayer, rasterLayersById, ...metrics } = r;
    if (ab.name === 'stock' && !stockPaint) { stockPaint = paintByNode; stockRaster = { byLayer: rasterByLayer, layersById: rasterLayersById }; }
    if (opts.attribution && invalidations.size) {
      await send('DOM.getDocument', { depth: 0 });
      const top = [...invalidations].sort((a, b) => b[1].count - a[1].count).slice(0, 8);
      console.log(`  ${ab.name} — invalidations (top 8):`);
      for (const [key, v] of top) {
        const topNodes = [...v.nodes].sort((a, b) => b[1] - a[1]).slice(0, 3);
        const named = [];
        for (const [nodeId, n] of topNodes) named.push(`${nodeId === -1 ? '(no node)' : await describeNode(send, nodeId)} ×${n}`);
        console.log(`    ${String(v.count).padStart(6)}  ${key}  [${named.join(', ')}]`);
      }
    }
    if (opts.attribution && rasterByLayer.size) await printRasterByLayer(send, { byLayer: rasterByLayer, layersById: rasterLayersById }, `  ${ab.name} — raster by layer`, 8);
    rows.push({ ablation: ab.name, ...metrics });
    process.stdout.write(`  ${ab.name}: main busy ${metrics['main busy (ms)']} ms, paint ${metrics['Paint ms']} ms, compositor ${metrics['Compositor::Update ms']} ms, Paint n ${metrics['Paint n']}, redrawn ${metrics['screens/frame']} screens/frame, long tasks ${metrics['long tasks']}\n`);
    if (ab.undo) await evaluate(`(() => { ${ab.undo}; return true; })()`);
  }
  await evaluate(`(() => { document.getElementById('__ablate')?.remove(); return true; })()`);
  // The world must still be the state the run began in: a tile that closed (or opened) mid-run voids every window.
  const worldAfter = dimmedReading(await evaluate(DIMMED_PROBE));
  console.log(`World after the windows: ${worldAfter}`);
  const rejectedAfter = checkDimmed(worldAfter, expectDimmed);
  if (rejectedAfter) throw new Error(rejectedAfter);
  console.log('');
  console.table(rows);

  if (stockPaint && rows[0]) {
    const b = paintTotalsFor(stockPaint, layerInfo.bubbleNodes);
    const frames = rows[0].frames;
    console.log(`Bubble paints (stock window): ${b.paints} paints, ${Math.round(b.ms)} ms, ${frames ? Math.round((b.area * view.dpr * view.dpr) / frames) : 0} redrawn px²/frame, over ${layerInfo.bubbleNodes.size} bubble layers`);
  }

  if (opts.attribution && stockPaint) {
    await send('DOM.getDocument', { depth: 0 }); // DOM.pushNodesByBackendIdsToFrontend needs a document first
    const top = [...stockPaint].sort((a, b) => b[1].ms - a[1].ms).slice(0, 12);
    const out = [];
    for (const [nodeId, p] of top) {
      out.push({ node: nodeId === -1 ? '(no node)' : await describeNode(send, nodeId), paints: p.count, 'ms': Math.round(p.ms), 'avg clip px²': Math.round(p.area / Math.max(1, p.count)) });
    }
    console.log('Stock window — paint time by painted node (top 12):');
    console.table(out);
  }

  if (opts.attribution && stockRaster) await printRasterByLayer(send, stockRaster, 'Stock window — raster by layer', Number(opts['raster-top']));
}

/**
 * Option (b) of docs/tasks/DOCUMENT_REPAINT.md: which compositor layers the raster workers re-drew in a window, and how
 * often. A layer neither LayerTree snapshot had (it came and went inside the window) shows its id and no size; the
 * column charged it 0. Printed in full for the stock window and as a short list for each ablation, like the invalidations.
 */
async function printRasterByLayer(send, { byLayer, layersById }, label, top) {
  await send('DOM.getDocument', { depth: 0 });
  const rows = [...byLayer].sort((a, b) => b[1].frames - a[1].frames || b[1].tasks - a[1].tasks).slice(0, top);
  const out = [];
  for (const [layerId, r] of rows) {
    const layer = layersById.get(layerId) ?? layersById.get(String(layerId));
    const node = layer === undefined ? '(in no layer snapshot)' : layer.backendNodeId === undefined ? '(no node)' : await describeNode(send, layer.backendNodeId);
    out.push({ layer: layerId, node, 'size (CSS px, pre-scale)': layer ? `${Math.round(layer.width)}×${Math.round(layer.height)}` : '', 'frames rastered': r.frames, tasks: r.tasks, 'area px²': r.area === undefined ? '' : Math.round(r.area) });
  }
  console.log(`${label} (top ${top} of ${byLayer.size}, by frames rastered):`);
  console.table(out);
}

async function main() {
  const profileDir = mkdtempSync(join(tmpdir(), 'trace-atlas-perf-'));
  const chrome = spawn(findChrome(), [
    '--headless=new',
    `--remote-debugging-port=${opts.port}`,
    `--user-data-dir=${profileDir}`,
    '--autoplay-policy=no-user-gesture-required',
    '--mute-audio',
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank',
  ], { stdio: 'ignore' });
  let cdp;
  try {
    cdp = await connect(opts.port);
    await run(cdp);
  } finally {
    try { await cdp?.send('Browser.close'); } catch { /* already gone */ }
    cdp?.close();
    chrome.kill();
    await sleep(300);
    try { rmSync(profileDir, { recursive: true, force: true }); } catch { /* harmless in tmp */ }
  }
}

await main();
