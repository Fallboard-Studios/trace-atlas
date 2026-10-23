#!/usr/bin/env node
/**
 * View-switch profiling harness (roadmap 17.2.1, docs/PERFORMANCE.md).
 *
 * Drives an installed Chrome/Edge over the DevTools Protocol using Node's built-in WebSocket (Node 22+/24) —
 * no new dependency. Loads a built copy of the app, powers it on, applies a CPU-throttle rate, then clicks
 * through the header's nav tiles and reports, per step, how many main-thread long tasks exceeded Tone's
 * 100 ms scheduling lookahead (the audible-pause threshold), the longest one, and how many cabinet boxes
 * are on the page. Optionally adds a CPU profile and a layout/paint trace summary.
 *
 *   npm run build && npx vite preview --port 4173      # terminal 1 — serve a production build
 *   npm run perf -- --throttle 4                        # terminal 2 — run this script
 *
 * Run with --help for flags. See docs/PERFORMANCE.md for method, caveats, and the baseline table.
 */
import { parseArgs } from 'node:util';

import { sleep, withChrome } from './cdp-lib.mjs';

/** Tone's default `lookAhead` (Tone.Context, `interactive` latency hint), in ms — a main-thread task longer than this can starve the scheduler. */
const LOOKAHEAD_MS = 100;

/** Header nav labels (src/data/headerNavConfig.ts HEADER_NAV_SCHEMA) — clicked by visible text, so a label rename there needs the same rename here. */
const TILE_FLEET = 'Fleet Params';
const TILE_PROBES = 'Probes';
const TILE_SETTINGS = 'Nav & Comms';

const HELP = `Usage: npm run perf -- [flags]

  --url <url>        page to profile (default http://localhost:4173/trace-atlas/, i.e. \`vite preview\`)
  --throttle <n>     CPU slowdown multiplier, 1 = none (default 4, Chrome DevTools' "recommended" mobile setting)
  --mobile           emulate a 390x844 phone viewport instead of 1280x900 desktop
  --width <px>       viewport width (overrides --mobile/desktop; <= 480 is treated as a phone)
  --smoothness       instead of the step table, sample each accordion's first open frame by frame (empty-open flash, height snap, slow frames)
  --profile          also capture a CPU profile (top self/inclusive functions) — most readable against a \`--minify false\` build
  --trace            also capture a layout/paint trace summary (forced layouts, paint, compositing)
  --chrome <path>    Chrome/Edge executable (else $CHROME_PATH, else a platform default)
  --port <n>         remote-debugging port (default 9333)
  --help
`;

const { values: opts } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://localhost:4173/trace-atlas/' },
    throttle: { type: 'string', default: '4' },
    mobile: { type: 'boolean', default: false },
    width: { type: 'string' },
    smoothness: { type: 'boolean', default: false },
    profile: { type: 'boolean', default: false },
    trace: { type: 'boolean', default: false },
    chrome: { type: 'string' },
    port: { type: 'string', default: '9333' },
    help: { type: 'boolean', default: false },
  },
});

if (opts.help) {
  console.log(HELP);
  process.exit(0);
}

/** In-page frame sampler (injected once in --smoothness mode; verification tooling only, never app code). While running it
 *  records, on every animation frame, the observed accordion's wrapper height and inline `style.height`, how many children
 *  its content-inner holds, and its trigger's aria-expanded — enough to see an open-but-empty frame and the moment GSAP
 *  hands the height over to `auto`. */
const SAMPLER_JS = `
  window.__smooth = {
    _running: false,
    _gen: 0,
    _samples: [],
    _oldStyles: [],
    _observer: null,
    _content: null,
    start(trigger) {
      const content = trigger.closest('.sc-accordion').querySelector('.sc-accordion__content');
      const inner = content.querySelector('.sc-accordion__content-inner');
      this._samples = [];
      // Every inline-style write to the wrapper, as the value it REPLACED. GSAP writes the tween's final px height and then
      // 'auto' back-to-back within one tick, so frame sampling can miss the px value entirely; the mutation records can't.
      this._oldStyles = [];
      this._observer?.disconnect();
      this._content = content;
      this._observer = new MutationObserver((records) => { for (const r of records) this._oldStyles.push(r.oldValue ?? ''); });
      this._observer.observe(content, { attributes: true, attributeFilter: ['style'], attributeOldValue: true });
      this._running = true;
      // A generation token, not just the running flag: start() flips the flag back to true, so without it the previous
      // toggle's still-scheduled frame loop would keep pushing its own (different) element into the new sample array.
      const gen = ++this._gen;
      let last = performance.now();
      const tick = (now) => {
        if (!this._running || gen !== this._gen) return;
        this._samples.push({
          dt: Math.round(now - last),
          h: content.getBoundingClientRect().height,
          sh: content.style.height,
          kids: inner.childElementCount,
          exp: trigger.getAttribute('aria-expanded'),
        });
        last = now;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    },
    stop() {
      this._running = false;
      this._gen++;
      for (const r of this._observer?.takeRecords() ?? []) this._oldStyles.push(r.oldValue ?? '');
      this._observer?.disconnect();
      return { samples: this._samples, oldStyles: this._oldStyles, finalStyle: this._content?.getAttribute('style') ?? '' };
    },
  };
`;

/** Turns one toggle's samples into the numbers roadmap 17.2.2's smoothness pass cares about:
 *  - emptyOpenFrames: frames where the section reports expanded but has no children yet (an open-but-empty flash);
 *  - jumpPx: the height snap when GSAP hands the wrapper from its final px height to `auto` — the gap between the height the
 *    tween targeted and the height `auto` resolved to. Read from the wrapper's inline-style writes (a MutationObserver), not
 *    from frames, so it means the same thing at any frame rate: comparing sampled frames instead reports "the tween finished
 *    between two frames" as a huge jump whenever frames are slow (e.g. under 4x throttle);
 *  - frames slower than 50 ms, and the slowest gap (the mount shows up here at high throttle). */
function analyzeSamples({ samples, oldStyles, finalStyle }) {
  const isPx = (st) => /px$/.test(st.sh);
  const heightPx = (style) => {
    const m = /height:\s*([\d.]+)px/.exec(style);
    return m ? Number(m[1]) : null;
  };
  const emptyOpenFrames = samples.filter((st) => st.exp === 'true' && st.kids === 0).length;
  // The value each write produced is the next write's replaced value (the last write's is the current inline style).
  const newStyles = [...oldStyles.slice(1), finalStyle];
  const autoWrite = newStyles.findIndex((st) => /height:\s*auto/.test(st));
  const target = autoWrite >= 0 ? heightPx(oldStyles[autoWrite]) : null;
  const settled = samples.at(-1)?.h;
  const jumpPx = target !== null && settled !== undefined ? Math.round(Math.abs(settled - target) * 10) / 10 : null;
  const gaps = samples.slice(1).map((st) => st.dt);
  return {
    frames: samples.length,
    'empty-open frames': emptyOpenFrames,
    'height jump at auto (px)': jumpPx,
    'frames >50ms': gaps.filter((g) => g > 50).length,
    'max frame gap (ms)': Math.max(0, ...gaps),
    'tween frames': samples.filter(isPx).length,
    'final height (px)': Math.round(settled ?? 0),
  };
}

async function run({ send, evaluate, onEvent }) {
  const viewportWidth = opts.width ? Number(opts.width) : (opts.mobile ? 390 : 1280);
  const isPhone = opts.mobile || viewportWidth <= 480;

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', isPhone
    ? { width: viewportWidth, height: 844, deviceScaleFactor: 2, mobile: true }
    : { width: viewportWidth, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      window.__longTasks = [];
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) window.__longTasks.push({ start: Math.round(e.startTime), ms: Math.round(e.duration) });
      }).observe({ type: 'longtask', buffered: true });
    `,
  });

  // Page load (and the app's own startup work) is measured unthrottled — only what happens after is being profiled.
  await send('Page.navigate', { url: opts.url });
  for (let i = 0; i < 75; i++) {
    if (await evaluate(`!!document.querySelector('button[aria-label="Power on"]')`)) break;
    if (i === 74) throw new Error(`Power button never appeared at ${opts.url} — is the server running and is the base path right?`);
    await sleep(200);
  }
  await sleep(1500);
  await send('Emulation.setCPUThrottlingRate', { rate: Number(opts.throttle) });

  /** Clicks the first button whose aria-label or visible text contains `text` (case-insensitive). */
  const click = async (text) => {
    const result = await evaluate(`(() => {
      const wanted = ${JSON.stringify(text.toLowerCase())};
      const el = [...document.querySelectorAll('button')].find(
        (b) => (b.getAttribute('aria-label') || b.textContent || '').trim().toLowerCase().includes(wanted));
      if (!el) return false;
      el.click();
      return true;
    })()`);
    if (!result) throw new Error(`No button matching "${text}" — did a nav label change (see the TILE_* constants)?`);
  };

  /** Clicks the first element matching a CSS selector (for controls that aren't a native <button>, e.g. a role="button" div). */
  const clickSelector = async (selector) => {
    const result = await evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return false;
      el.click();
      return true;
    })()`);
    if (!result) throw new Error(`No element matching "${selector}".`);
  };

  async function measureStep(step, action, settleMs = 4000) {
    await evaluate('window.__longTasks.length = 0');
    await action();
    await sleep(settleMs);
    const tasks = await evaluate('window.__longTasks.slice()');
    const cabinetBoxes = await evaluate(`document.querySelectorAll('.sc-cabinet-box').length`);
    const boxesInClosedAccordions = await evaluate(`document.querySelectorAll('.sc-accordion__content[data-state="closed"] .sc-cabinet-box').length`);
    const over = tasks.filter((t) => t.ms >= LOOKAHEAD_MS);
    return {
      step,
      [`tasks >=${LOOKAHEAD_MS}ms`]: over.length,
      'longest (ms)': Math.max(0, ...tasks.map((t) => t.ms)),
      [`total in >=${LOOKAHEAD_MS}ms tasks (ms)`]: over.reduce((sum, t) => sum + t.ms, 0),
      'tasks >=50ms': tasks.length,
      cabinetBoxes,
      'boxes in closed accordions': boxesInClosedAccordions,
    };
  }

  console.log(`Profiling ${opts.url} — ${opts.throttle}x CPU throttle, ${isPhone ? 'phone' : 'desktop'} ${viewportWidth}px wide`);
  console.log(`Long-task counts use Tone's ${LOOKAHEAD_MS} ms lookahead as the audible-pause threshold.\n`);

  if (opts.smoothness) {
    await runSmoothness();
    return;
  }

  const rows = [];
  /** Opens every currently-collapsed accordion on the page once, in DOM order, one measured row each — the per-section
   *  first-open cost (roadmap 17.2.2). Each click opens the *first* still-collapsed trigger, so the pre-read label list
   *  and the click order line up. Pre-lazy-mount these rows are near zero (content is already mounted; only the height
   *  tween runs); post-lazy-mount they carry the mount cost that moved here. */
  async function measureEachAccordion(prefix) {
    const labels = await evaluate(`[...document.querySelectorAll('.sc-accordion__trigger[aria-expanded="false"]')].map((t) => {
      const human = t.querySelector('.sc-dual-label__human');
      return ((human ?? t).textContent || '').replace(/\\s+/g, ' ').trim();
    })`);
    console.log(`${prefix}: ${labels.length} collapsed accordion(s) found`);
    const sectionRows = [];
    for (const label of labels) {
      sectionRows.push(await measureStep(`${prefix} › ${label}`, () => evaluate(`document.querySelector('.sc-accordion__trigger[aria-expanded="false"]').click()`), 1500));
    }
    return sectionRows;
  }

  /** One toggle of one accordion, sampled frame by frame. `pick` is a JS expression yielding the trigger element. */
  async function sampleToggle(label, pick) {
    await evaluate(`(() => { const t = ${pick}; window.__smooth.start(t); t.click(); })()`);
    await sleep(1500 + 500 * Number(opts.throttle));
    return { section: label, ...analyzeSamples(await evaluate('window.__smooth.stop()')) };
  }

  /** Smoothness pass (roadmap 17.2.2, task 8): first-open every collapsed accordion on the current screen, then close and
   *  reopen the first one to confirm the already-mounted path. */
  async function smoothEachAccordion(prefix) {
    const firstCollapsed = `document.querySelector('.sc-accordion__trigger[aria-expanded="false"]')`;
    const labels = await evaluate(`[...document.querySelectorAll('.sc-accordion__trigger[aria-expanded="false"]')].map((t) => {
      const human = t.querySelector('.sc-dual-label__human');
      return ((human ?? t).textContent || '').replace(/\\s+/g, ' ').trim();
    })`);
    const out = [];
    for (const label of labels) out.push(await sampleToggle(`${prefix} › ${label} (first open)`, firstCollapsed));
    if (labels.length) {
      const firstTrigger = `document.querySelectorAll('.sc-accordion__trigger')[0]`;
      out.push(await sampleToggle(`${prefix} › ${labels[0]} (close)`, firstTrigger));
      out.push(await sampleToggle(`${prefix} › ${labels[0]} (reopen)`, firstTrigger));
    }
    return out;
  }

  async function runSmoothness() {
    await evaluate(SAMPLER_JS);
    await click('power on');
    await sleep(6000);
    const smoothRows = [];
    await click(TILE_FLEET);
    await sleep(2500);
    smoothRows.push(...await smoothEachAccordion('fleet'));
    await click(TILE_PROBES);
    await sleep(2500);
    await clickSelector('.robot-selection-card__top');
    await sleep(2500);
    smoothRows.push(...await smoothEachAccordion('detail'));
    console.table(smoothRows);
    const flashes = smoothRows.reduce((n, r) => n + r['empty-open frames'], 0);
    const jumps = smoothRows.map((r) => r['height jump at auto (px)']).filter((j) => j !== null);
    console.log(`Empty-open frames across all toggles: ${flashes}. Largest height jump at auto: ${jumps.length ? Math.max(...jumps) : 'n/a'} px.`);
  }

  rows.push(await measureStep('power on', () => click('power on'), 6000));
  rows.push(await measureStep(`open ${TILE_FLEET}`, () => click(TILE_FLEET)));
  rows.push(...await measureEachAccordion('fleet'));
  rows.push(await measureStep(`switch to ${TILE_PROBES}`, () => click(TILE_PROBES)));
  rows.push(await measureStep('open first robot (detail)', () => clickSelector('.robot-selection-card__top')));
  rows.push(...await measureEachAccordion('detail'));
  rows.push(await measureStep('back to robot list', () => click('back')));
  rows.push(await measureStep(`switch to ${TILE_SETTINGS}`, () => click(TILE_SETTINGS)));
  rows.push(await measureStep(`back to ${TILE_FLEET}`, () => click(TILE_FLEET)));
  console.table(rows);

  if (!opts.profile && !opts.trace) return;

  // Every capture starts from the same state — blank hub, no tile open — because each window's action (opening a tile) is
  // not repeatable: re-clicking an open tile *closes* it, which would make a second capture of the same window measure a close.
  // Re-clicking the active nav item deselects it (Header's handleNavDeselect).
  const ensureBlankHub = async () => {
    await evaluate(`(() => {
      const active = document.querySelector('button[role="radio"][aria-checked="true"], button[role="radio"][data-state="on"]');
      if (active) active.click();
    })()`);
    await sleep(2000);
    if (await evaluate(`!!document.querySelector('.console')`)) throw new Error('Could not return to the blank hub before a capture window.');
  };
  const captureWindows = [
    { label: 'IDLE (blank hub)', action: async () => {}, ms: 6000 },
    { label: `OPEN ${TILE_FLEET}`, action: () => click(TILE_FLEET), ms: 9000 },
  ];
  for (const w of captureWindows) {
    if (opts.profile) { await ensureBlankHub(); await captureProfile(send, w); }
    if (opts.trace) { await ensureBlankHub(); await captureTrace({ send, onEvent }, w); }
  }
}

/** Names of one CPU profile node, as `function file:line`. */
const frameKey = (node) => `${node.callFrame.functionName || '(anonymous)'} ${node.callFrame.url.split('/').pop()}:${node.callFrame.lineNumber + 1}`;

async function captureProfile(send, { label, action, ms }) {
  await send('Profiler.enable');
  await send('Profiler.setSamplingInterval', { interval: 500 });
  await send('Profiler.start');
  await action();
  await sleep(ms);
  const { profile } = await send('Profiler.stop');
  await send('Profiler.disable');

  const nodes = new Map(profile.nodes.map((n) => [n.id, n]));
  const parent = new Map();
  for (const n of profile.nodes) for (const child of n.children ?? []) parent.set(child, n.id);

  const self = new Map();
  const inclusive = new Map();
  let idle = 0;
  let sampled = 0;
  profile.samples.forEach((nodeId, i) => {
    const dt = (profile.timeDeltas[i] ?? 0) / 1000;
    sampled += dt;
    const leaf = nodes.get(nodeId);
    if (leaf.callFrame.functionName === '(idle)') idle += dt;
    self.set(frameKey(leaf), (self.get(frameKey(leaf)) ?? 0) + dt);
    // Inclusive time counts each distinct function once per sample, so recursion doesn't multiply it.
    const seen = new Set();
    for (let id = nodeId; id !== undefined; id = parent.get(id)) {
      const key = frameKey(nodes.get(id));
      if (seen.has(key)) continue;
      seen.add(key);
      inclusive.set(key, (inclusive.get(key) ?? 0) + dt);
    }
  });

  const top = (map, n, skip = /^\((root|program|idle|garbage collector)\)/) =>
    [...map].filter(([k]) => !skip.test(k)).sort((a, b) => b[1] - a[1]).slice(0, n)
      .map(([k, v]) => `${v.toFixed(0).padStart(7)} ms  ${k}`).join('\n');

  console.log(`\n=== CPU profile: ${label} (${ms} ms window, ${sampled.toFixed(0)} ms sampled, ${idle.toFixed(0)} ms idle) ===`);
  console.log(`"(program)" is native browser work (style/layout/paint) not attributed to a JS function: ${(self.get('(program) :0') ?? 0).toFixed(0)} ms`);
  console.log('-- top self time --');
  console.log(top(self, 15));
  console.log('-- top inclusive time --');
  console.log(top(inclusive, 20));
}

/** Trace event names summarized — durations of nested events overlap (a FunctionCall contains its own layouts), so compare within a name across runs, not across names. */
const TRACE_EVENTS = [
  'Document::UpdateStyleAndLayout', 'Blink.ForcedStyleAndLayout.UpdateTime', 'Layout', 'UpdateLayoutTree',
  'LocalFrameView::RunPaintLifecyclePhase', 'Paint', 'PaintArtifactCompositor::Update', 'Layerize', 'RasterTask',
  'FunctionCall', 'FireAnimationFrame', 'TimerFire', 'EventDispatch', 'MajorGC', 'MinorGC',
];

async function captureTrace({ send, onEvent }, { label, action, ms }) {
  const events = [];
  const stopCollecting = onEvent((m) => { if (m.method === 'Tracing.dataCollected') events.push(...m.params.value); });
  const complete = new Promise((resolve) => {
    const stop = onEvent((m) => { if (m.method === 'Tracing.tracingComplete') { stop(); resolve(); } });
  });
  await send('Tracing.start', {
    transferMode: 'ReportEvents',
    traceConfig: { includedCategories: ['devtools.timeline', 'blink', 'cc'] },
  });
  await action();
  await sleep(ms);
  await send('Tracing.end');
  await complete;
  stopCollecting();

  const byName = new Map();
  for (const ev of events) {
    if (ev.ph !== 'X' || !ev.dur) continue;
    const cur = byName.get(ev.name) ?? { count: 0, ms: 0 };
    cur.count++;
    cur.ms += ev.dur / 1000;
    byName.set(ev.name, cur);
  }
  console.log(`\n=== Trace: ${label} (${ms} ms window) ===`);
  console.table(TRACE_EVENTS.filter((name) => byName.has(name)).map((name) => ({
    event: name,
    count: byName.get(name).count,
    'total (ms)': Math.round(byName.get(name).ms),
  })));
}

await withChrome({ chromePath: opts.chrome, port: opts.port, flags: ['--mute-audio'] }, run);
