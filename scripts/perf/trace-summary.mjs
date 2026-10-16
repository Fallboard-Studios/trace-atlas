#!/usr/bin/env node
/**
 * Chrome trace summary (docs/PERFORMANCE.md, "Desktop full-screen underruns are raster-bound", 2026-10-16).
 *
 * Reads a DevTools Performance recording saved as JSON and reports, for the page's renderer process:
 *   1. self time per thread with the top event names (GPU process, renderer main, raster workers, the realtime audio thread);
 *   2. the renderer main thread's long top-level tasks (> 50 ms), with their offset into the recording;
 *   3. per-second busy fractions for main, raster, compositor and GPU, so a burst window stands out;
 *   4. the sampled JS profile's top self-time functions (minified names — map them against the matching build's bundle;
 *      a profile `lineNumber` is zero-based).
 *
 * Record: DevTools → Performance → record from about 0:20 to 0:40 after power-on → the download arrow saves JSON.
 * A 30 s recording is ~140 MB and needs the heap flag, which `npm run perf:trace` sets:
 *
 *   npm run perf:trace -- path/to/Trace-….json
 *
 * Caveats: the realtime audio thread's RunTask spans include its wait for the next quantum, so its "busy %" is NOT CPU —
 * read render capacity from `npm run perf:audio` instead. Per-second buckets attribute a top-level task to every second it
 * spans. Keep the recordings out of the repo (.gitignore covers docs/reference/Trace-*.json and perf-traces/).
 *
 * Node 22+ (built-ins only; no dependencies).
 */
import { readFileSync } from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('Usage: npm run perf:trace -- <trace.json>');
  process.exit(1);
}
const raw = JSON.parse(readFileSync(file, 'utf8'));
const events = Array.isArray(raw) ? raw : raw.traceEvents;
console.log(`events: ${events.length}`);

// ---- thread / process names
const procName = new Map();
const threadName = new Map();
for (const e of events) {
  if (e.ph !== 'M') continue;
  if (e.name === 'process_name') procName.set(e.pid, e.args?.name);
  if (e.name === 'thread_name') threadName.set(`${e.pid}:${e.tid}`, e.args?.name);
}
const tlabel = (e) => `${procName.get(e.pid) ?? 'pid' + e.pid}/${threadName.get(`${e.pid}:${e.tid}`) ?? 'tid' + e.tid}`;

// ---- the page's renderer: from TracingStartedInBrowser's frame list
let pagePid = null;
for (const e of events) {
  if (e.name !== 'TracingStartedInBrowser') continue;
  const frames = e.args?.data?.frames ?? [];
  const f = frames.find((fr) => /trace-atlas|localhost/.test(fr.url ?? '')) ?? frames[0];
  if (f) {
    pagePid = f.processId;
    console.log(`page frame: ${(f.url ?? '').slice(0, 80)}${(f.url ?? '').length > 80 ? '…' : ''}  pid ${pagePid}`);
  }
}

const X = events.filter((e) => e.ph === 'X' && typeof e.dur === 'number');
let t0 = Infinity;
let t1 = -Infinity;
for (const e of X) {
  if (e.ts < t0) t0 = e.ts;
  if (e.ts + e.dur > t1) t1 = e.ts + e.dur;
}
const spanS = (t1 - t0) / 1e6;
console.log(`span: ${spanS.toFixed(1)} s`);

// ---- per-thread self time by event name (a stack per thread; self = dur minus children)
const byThread = new Map(); // label -> { total, top, byName }
const groups = new Map();
for (const e of X) {
  const k = `${e.pid}:${e.tid}`;
  (groups.get(k) ?? groups.set(k, []).get(k)).push(e);
}
const perSecond = new Map(); // label -> Float64Array of top-level busy seconds
const longTasks = [];
for (const list of groups.values()) {
  list.sort((a, b) => a.ts - b.ts || b.dur - a.dur);
  const label = tlabel(list[0]);
  const rec = byThread.get(label) ?? { total: 0, top: 0, byName: new Map() };
  byThread.set(label, rec);
  const sec = perSecond.get(label) ?? new Float64Array(Math.ceil(spanS) + 1);
  perSecond.set(label, sec);
  const stack = [];
  for (const e of list) {
    while (stack.length && stack[stack.length - 1].ts + stack[stack.length - 1].dur <= e.ts) stack.pop();
    if (stack.length) {
      stack[stack.length - 1].child = (stack[stack.length - 1].child ?? 0) + e.dur;
    } else {
      rec.top += e.dur;
      let s = e.ts;
      const end = e.ts + e.dur;
      while (s < end) {
        const idx = Math.floor((s - t0) / 1e6);
        const next = t0 + (idx + 1) * 1e6;
        sec[idx] += (Math.min(end, next) - s) / 1e6;
        s = next;
      }
      if (e.dur > 50_000 && e.pid === pagePid) {
        longTasks.push({ t: ((e.ts - t0) / 1e6).toFixed(2), ms: Math.round(e.dur / 1000), name: e.name, thread: label });
      }
    }
    stack.push(e);
  }
  for (const e of list) {
    const self = e.dur - (e.child ?? 0);
    rec.total += self;
    rec.byName.set(e.name, (rec.byName.get(e.name) ?? 0) + self);
  }
}

const fmt = (us) => (us / 1e6).toFixed(2) + 's';
console.log('\n== threads by self time (top-level busy / span) ==');
for (const [label, rec] of [...byThread].sort((a, b) => b[1].total - a[1].total).slice(0, 14)) {
  console.log(`${fmt(rec.total).padStart(9)}  busy ${(100 * rec.top / 1e6 / spanS).toFixed(0).padStart(3)}%  ${label}`);
  const top = [...rec.byName].sort((a, b) => b[1] - a[1]).slice(0, 8);
  console.log('           ' + top.map(([n, v]) => `${n} ${fmt(v)}`).join(' | '));
}

console.log('\n== long top-level tasks (>50 ms) in the page renderer ==');
for (const t of longTasks.sort((a, b) => b.ms - a.ms).slice(0, 15)) console.log(`t=${t.t}s  ${t.ms}ms  ${t.name}  ${t.thread}`);

// ---- per-second busy for the page renderer's main thread, raster workers, compositor and the GPU process
console.log('\n== per-second busy (fraction of the second) ==');
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const pick = (re) => [...perSecond].filter(([l]) => re.test(l));
const main = pick(new RegExp(`^${escape(procName.get(pagePid) ?? 'Renderer')}/CrRendererMain`));
const raster = pick(/CompositorTileWorker/);
const comp = pick(/\/Compositor$/);
const gpu = pick(/GPU Process\/CrGpuMain|VizCompositorThread/);
const sum = (arr, i) => arr.reduce((a, [, s]) => a + (s[i] ?? 0), 0);
console.log('sec   main  raster(sum)  compositor  gpu');
for (let i = 0; i < Math.ceil(spanS); i++) {
  console.log(`${String(i).padStart(3)}   ${sum(main, i).toFixed(2)}   ${sum(raster, i).toFixed(2).padStart(6)}       ${sum(comp, i).toFixed(2)}      ${sum(gpu, i).toFixed(2)}`);
}

// ---- the sampled JS profile (ProfileChunk) for the page renderer
const nodes = new Map();
const selfSamples = new Map();
let totalSamples = 0;
for (const e of events) {
  if (e.name !== 'ProfileChunk' || e.pid !== pagePid) continue;
  const cp = e.args?.data?.cpuProfile;
  if (!cp) continue;
  for (const n of cp.nodes ?? []) nodes.set(n.id, n);
  for (const id of cp.samples ?? []) {
    selfSamples.set(id, (selfSamples.get(id) ?? 0) + 1);
    totalSamples++;
  }
}
if (totalSamples) {
  const byFn = new Map();
  for (const [id, c] of selfSamples) {
    const cf = nodes.get(id)?.callFrame ?? {};
    const key = `${cf.functionName || '(anonymous)'}  ${(cf.url || '').replace(/^.*\//, '')}:${cf.lineNumber ?? ''}`;
    byFn.set(key, (byFn.get(key) ?? 0) + c);
  }
  console.log(`\n== top JS self-samples (${totalSamples} samples, page renderer) ==`);
  for (const [k, c] of [...byFn].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`${(100 * c / totalSamples).toFixed(1).padStart(5)}%  ${k}`);
}
