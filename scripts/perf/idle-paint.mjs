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
 * Needs Node 22+ (built-in WebSocket) and Chrome/Edge. Serve a production build first (`npm run build && npx vite preview --port 4173`).
 *
 *   node scripts/perf/idle-paint.mjs [--throttle 4] [--window 6000] [--url http://localhost:4173/trace-atlas/] [--only a,b,c]
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

const { values: opts } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://localhost:4173/trace-atlas/' },
    throttle: { type: 'string', default: '4' },
    window: { type: 'string', default: '6000' },
    width: { type: 'string', default: '1280' },
    only: { type: 'string' },
    chrome: { type: 'string' },
    port: { type: 'string', default: '9223' },
    attribution: { type: 'boolean', default: true },
    help: { type: 'boolean', default: false },
  },
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const WINDOW_MS = Number(opts.window);

/** The bubble circles: in their own scene layer since the 17.2.5 layer split, inside the factory layers before it. */
const BUBBLES = 'svg[data-scene-layer="bubbles"] circle, #factory-background-layer circle, #factory-midground-layer circle, #factory-foreground-layer circle';

/** Both robot rows: the front one (`#robot-layer`) and, since Phase 43 J4, the back one behind the midground. */
const ROBOTS = '#robot-layer, #robot-back-layer';
const ROBOT_GROUPS = '#robot-layer .robot, #robot-back-layer .robot';

/** The full-screen depth overlays: J4's four tints, and the two gradient rects they replaced, so one name ablates both builds. */
const TINTS = 'rect[data-depth-tint], #gradient-back-mid, #gradient-mid-front';

/** The scene's layers, back to front, as `data-scene-layer` names them (J4 added robots-back and mid; a pre-J4 build has four). */
const SCENE_LAYERS = ['back', 'robots-back', 'mid', 'bubbles', 'robots', 'front'];

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
  { name: 'detach-bubbles+robots', sticky: true, js: `document.querySelectorAll(${JSON.stringify(ROBOT_GROUPS)}).forEach((e) => e.remove())` },
  // How much of a robot's per-frame cost is the body moving vs. the propeller spinning (docs/PERFORMANCE.md, 17.2.5:
  // the propellers turned out to be a small share, and HTML-positioned robots were measured neutral and reverted).
  { name: 'detach-propellers', sticky: true, js: `document.querySelectorAll('.propeller').forEach((e) => e.remove())` },
  { name: 'detached+no-transitions', css: '.ocean-scene * { transition: none !important; }' },
  { name: 'detached+all-anim-off', css: '.ocean-scene * { transition: none !important; } .screen-viewport::before, .rocker-light { animation: none !important; }' },
];

if (opts.help) {
  console.log(`Usage: node scripts/perf/idle-paint.mjs [--throttle n] [--window ms] [--width px] [--url u] [--only names]
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

/** Trace one window. Returns per-name totals, the main-thread busy time, frame count and per-node paint totals. */
async function traceWindow({ send, onEvent }, ms) {
  const events = [];
  const stopCollecting = onEvent((m) => { if (m.method === 'Tracing.dataCollected') events.push(...m.params.value); });
  const complete = new Promise((resolve) => {
    const stop = onEvent((m) => { if (m.method === 'Tracing.tracingComplete') { stop(); resolve(); } });
  });
  await send('Tracing.start', {
    transferMode: 'ReportEvents',
    traceConfig: { includedCategories: ['devtools.timeline', 'blink', 'cc', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.frame', 'disabled-by-default-devtools.timeline.invalidationTracking'] },
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
  for (const ev of events) {
    const k = `${ev.pid}:${ev.tid}`;
    if (!rendererMains.has(k) || ev.ph !== 'X' || !ev.dur) continue;
    if (ev.name === 'Paint') paintBy.set(k, (paintBy.get(k) ?? 0) + 1);
    if (ev.name === 'RunTask') runTaskBy.set(k, (runTaskBy.get(k) ?? 0) + ev.dur / 1000);
  }
  const mainKey = [...rendererMains].sort((a, b) => (paintBy.get(b) ?? 0) - (paintBy.get(a) ?? 0) || (runTaskBy.get(b) ?? 0) - (runTaskBy.get(a) ?? 0))[0] ?? '';
  const mainBusy = runTaskBy.get(mainKey) ?? 0;

  const byName = new Map();
  const paintByNode = new Map();
  const invalidations = new Map(); // `${event} ${reason}` -> { count, nodes: Map<nodeId, count> }
  let frames = 0;
  for (const ev of events) {
    if (`${ev.pid}:${ev.tid}` !== mainKey) continue;
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
    if (ev.name === 'Paint') {
      const nodeId = ev.args?.data?.nodeId ?? -1;
      const clip = ev.args?.data?.clip;
      let area = 0;
      if (Array.isArray(clip) && clip.length >= 8) {
        const xs = [clip[0], clip[2], clip[4], clip[6]];
        const ys = [clip[1], clip[3], clip[5], clip[7]];
        area = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
      }
      const p = paintByNode.get(nodeId) ?? { count: 0, ms: 0, area: 0 };
      p.count++;
      p.ms += ev.dur / 1000;
      p.area += area;
      paintByNode.set(nodeId, p);
    }
  }
  const get = (n) => byName.get(n) ?? { count: 0, ms: 0 };
  return {
    'main busy (ms)': Math.round(mainBusy),
    frames,
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

async function run(cdp) {
  const { send } = cdp;
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'evaluate failed');
    return r.result.value;
  };
  const width = Number(opts.width);
  const isPhone = width <= 480;
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

  await evaluate(`(() => { const b = document.querySelector('button[aria-label="Power on"]'); b.click(); return true; })()`);
  await sleep(8000); // power-on + spawn settle
  const robots = await evaluate(`document.querySelectorAll(${JSON.stringify(ROBOT_GROUPS)}).length`);
  const factories = await evaluate(`document.querySelectorAll('[data-factory-type]').length`);
  const bubbles = await evaluate(`document.querySelectorAll(${JSON.stringify(BUBBLES)}).length`);
  const layers = await evaluate(`document.querySelectorAll('.ocean-scene__layer').length`);
  console.log(`Idle paint localizer — ${opts.url}, ${opts.throttle}x throttle, ${width}px, ${WINDOW_MS} ms windows`);
  console.log(`Scene: ${robots} robots, ${factories} factories, ${bubbles} circles in the bubble/factory layers, ${layers} scene layers (0 = the pre-17.2.5 single svg)`);
  // Phase 43 J4: element count per scene layer, by name (a layer the build doesn't have reads "absent").
  const perLayer = await evaluate(`(() => Object.fromEntries(${JSON.stringify(SCENE_LAYERS)}.map((name) => {
    const layer = document.querySelector('svg[data-scene-layer="' + name + '"]');
    return [name, layer ? layer.querySelectorAll('*').length : 'absent'];
  })))()`);
  console.log(`Scene layers (elements): ${SCENE_LAYERS.map((name) => `${name} ${perLayer[name]}`).join(', ')}`);
  // Phase 43 J2 gate: element counts in the robots layer's stack (stations included). Before J2 only #robot-layer exists;
  // before J4 there is no #robot-back-layer (reads 0). Since Task 34b #station-l4-layer is in robots-back, not robots.
  const stack = await evaluate(`(() => {
    const n = (s) => document.querySelectorAll(s).length;
    const shown = [...document.querySelectorAll(${JSON.stringify(ROBOT_GROUPS)})].filter((e) => getComputedStyle(e).visibility !== 'hidden' && getComputedStyle(e).display !== 'none').length;
    return { stations: new Set([...document.querySelectorAll('[data-station-id]')].map((e) => e.dataset.stationId)).size,
      l4: n('#station-l4-layer *'), l3: n('#station-l3-layer *'), robotLayer: n('#robot-layer *'), backRow: n('#robot-back-layer *'),
      backRobots: n('#robot-back-layer .robot'), front: n('#station-front-layer *'), shown };
  })()`);
  console.log(`Robots stack: ${stack.stations} stations; elements L4 ${stack.l4}, L3 ${stack.l3}, #robot-layer ${stack.robotLayer}, front ${stack.front}; back row #robot-back-layer ${stack.backRow} (${stack.backRobots} robots); ${stack.shown} robots visible\n`);

  const wanted = opts.only ? new Set(opts.only.split(',').map((s) => s.trim())) : null;
  const rows = [];
  let stockPaint = null;
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
    const r = await traceWindow(cdp, WINDOW_MS);
    const { paintByNode, invalidations, ...metrics } = r;
    if (ab.name === 'stock' && !stockPaint) stockPaint = paintByNode;
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
    rows.push({ ablation: ab.name, ...metrics });
    process.stdout.write(`  ${ab.name}: main busy ${metrics['main busy (ms)']} ms, paint ${metrics['Paint ms']} ms, compositor ${metrics['Compositor::Update ms']} ms\n`);
    if (ab.undo) await evaluate(`(() => { ${ab.undo}; return true; })()`);
  }
  await evaluate(`(() => { document.getElementById('__ablate')?.remove(); return true; })()`);
  console.log('');
  console.table(rows);

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
