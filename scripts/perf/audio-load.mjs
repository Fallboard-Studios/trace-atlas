#!/usr/bin/env node
/**
 * Audio render-capacity time series (roadmap 17.2.6, docs/PERFORMANCE.md).
 *
 * Drives an installed Chrome/Edge over the DevTools Protocol using Node's built-in WebSocket (Node 22+/24) —
 * no new dependency. For each pinned world it loads a built copy of the app in a fresh Chrome, powers it on,
 * waits out a warm-up, then polls the DevTools "Web Audio" panel's `WebAudio.getRealtimeData` every 500 ms
 * and reports the audio render capacity (0–1; near 1.0 the audio thread misses its deadline) per time bucket:
 * mean, max, callback interval, and — when the `?debug` overlay is present — the audible-robot count, plus the
 * peak window, the overall mean, and the correlation between audible robots and capacity. For a long run
 * (backlog 27) each bucket also carries the live AudioNode count, the renderer's JS heap and the pending Transport
 * events, and the summary says how each moved from the first bucket to the last; the overlay's text is printed
 * once after the warm-up, so the record says what the world carried. The page's console warnings and errors, from
 * navigation on, are tallied by first line (backlog 35's proof that Tone's scheduling warning is gone).
 *
 *   npm run build && npx vite preview --port 4173      # terminal 1 — serve a production build
 *   npm run perf:audio -- --world charlie:200:-30 --seconds 240 --bucket 15
 *   npm run perf:audio -- --world bravo:-150:90?load=light --seconds 900 --bucket 60   # the long run
 *
 * The pure parts (world specs, URLs, bucketing, correlation) live in audio-load-lib.mjs and are unit-tested;
 * the Chrome plumbing lives in cdp-lib.mjs and is verified by real runs. Run with --help for flags.
 * Measurement hygiene (foreground, one call at a time, orphaned-Chrome check, same-session A/B): docs/PERFORMANCE.md.
 */
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import {
  audibleCapacityCorrelation,
  bucketSamples,
  buildPageUrl,
  chooseRealtimeContext,
  createNodeTally,
  diffByType,
  expectedCoordinates,
  parseAudibleFromHud,
  parseBudgetFromHud,
  parseCoordinatesFromHud,
  parseHeapMb,
  parseLagFromHud,
  parseTransportEventsFromHud,
  parseWorldList,
  parseWorldSpec,
  rotateList,
  summarizeBuckets,
  tallyConsole,
  trend,
} from './audio-load-lib.mjs';
import { sleep, withChrome } from './cdp-lib.mjs';

/** How often the DevTools realtime data is polled. `contextRealtimeDataChanged` events do not arrive on their own. */
const POLL_MS = 500;

const HELP = `Usage: npm run perf:audio -- [flags]

  --world <spec>     one world, name:x:y (e.g. charlie:200:-30), pinned through the page's ?seed=&x=&y=. A tweaked
                     world adds its link's s= blob after ?: bravo:-150:90?s=1.<blob> (docs/PERFORMANCE.md, "The seven
                     links"). The run aborts if the overlay lands anywhere else. An optional
                     @page names another page under --url (two builds served side by side: charlie:200:-30@pre.html).
                     Anything after ? rides into the page URL, so variants A/B in one session: ...?load=light&s=1.…
  --worlds <list>    comma-separated worlds, run one after another in fresh browsers
                     (e.g. charlie:200:-30,bravo:-150:90). One of --world / --worlds is required.
  --rot <n>          rotate the start order of --worlds left by n (for interleaved rounds; default 0)
  --seconds <n>      length of each measured series, after the warm-up (default 240)
  --bucket <n>       bucket width in seconds (default 15)
  --warmup <n>       seconds to wait after powering on before measuring (default 8)
  --url <url>        base URL of the served build (default http://localhost:4173/trace-atlas/, i.e. \`vite preview\`;
                     a LAN address such as http://192.168.1.20:4173/trace-atlas/ works too). Any query on it is replaced.
  --no-debug         do not add ?debug to the URL (no overlay, so no audible-robot column)
  --json <path>      also write each run's buckets and summary to this file (a .json array, one entry per world)
  --chrome <path>    Chrome/Edge executable (else $CHROME_PATH, else a platform default)
  --port <n>         remote-debugging port (default 9334)
  --help

Each run is a fresh Chrome with its own temp profile, closed afterwards. Run them in the FOREGROUND, ONE CALL AT
A TIME, and check for orphaned Chrome before and after — see docs/PERFORMANCE.md ("Audio render-capacity series").
`;

const { values: opts } = parseArgs({
  options: {
    world: { type: 'string' },
    worlds: { type: 'string' },
    rot: { type: 'string', default: '0' },
    seconds: { type: 'string', default: '240' },
    bucket: { type: 'string', default: '15' },
    warmup: { type: 'string', default: '8' },
    url: { type: 'string', default: 'http://localhost:4173/trace-atlas/' },
    'no-debug': { type: 'boolean', default: false },
    json: { type: 'string' },
    chrome: { type: 'string' },
    port: { type: 'string', default: '9334' },
    help: { type: 'boolean', default: false },
  },
});

if (opts.help) {
  console.log(HELP);
  process.exit(0);
}

function positiveNumber(name, raw) {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`--${name} must be a positive number (got "${raw}")`);
  return value;
}

/** One fresh Chrome, one world, one measured series. Returns the run's buckets and summary. */
async function measureWorld(world, { seconds, bucketSec, warmupSec }) {
  return withChrome({ chromePath: opts.chrome, port: opts.port }, async ({ send, evaluate, onEvent }) => {
    const created = [];
    const destroyed = [];
    const nodes = createNodeTally();
    const consoleEvents = []; // every console call from navigation on: Tone's scheduling warning fires once, often in the warm-up
    onEvent((msg) => {
      if (msg.method === 'WebAudio.contextCreated') created.push(msg.params.context);
      if (msg.method === 'WebAudio.contextWillBeDestroyed') destroyed.push(msg.params.contextId);
      if (msg.method === 'WebAudio.audioNodeCreated') nodes.created(msg.params.node.contextId, msg.params.node.nodeId, msg.params.node.nodeType);
      if (msg.method === 'WebAudio.audioNodeWillBeDestroyed') nodes.destroyed(msg.params.contextId, msg.params.nodeId);
      if (msg.method === 'Runtime.consoleAPICalled') consoleEvents.push(msg.params);
    });
    await send('Page.enable');
    await send('Runtime.enable');
    await send('WebAudio.enable');
    await send('Performance.enable');

    const url = buildPageUrl(opts.url, world, { debug: !opts['no-debug'] });
    await send('Page.navigate', { url });
    for (let i = 0; i < 75; i++) {
      if (await evaluate(`!!document.querySelector('button[aria-label="Power on"]')`)) break;
      if (i === 74) throw new Error(`Power button never appeared at ${url} — is the server running and is the base path right?`);
      await sleep(200);
    }
    await sleep(1500);
    await evaluate(`document.querySelector('button[aria-label="Power on"]').click()`);
    await sleep(warmupSec * 1000);

    const contextId = chooseRealtimeContext(created, destroyed);
    if (contextId === null) throw new Error('No realtime AudioContext was created — did the page power on?');

    // What the world carries, as the overlay states it after the warm-up (one line per overlay row).
    const carried = await evaluate(`[...document.querySelectorAll('.audio-debug-hud > div')].map((d) => d.textContent)`);

    // The pin check: a world measured somewhere other than its label has misled this harness before
    // (docs/PERFORMANCE.md, "Pre-change baseline for roadmap 17.2.6", the retraction).
    const landed = parseCoordinatesFromHud(carried.join('\n'));
    const expected = expectedCoordinates(world);
    if (landed && (landed.x !== expected.x || landed.y !== expected.y)) {
      const hint = 'the page did not honour ?seed=&x=&y= (a build older than the world link, roadmap 56?)';
      throw new Error(`World not pinned: the page landed at (${landed.x}, ${landed.y}), expected (${expected.x}, ${expected.y}) — ${hint}.`);
    }

    const nodesAtStart = nodes.liveByType(contextId);
    const samples = [];
    const start = performance.now();
    for (let k = 1; performance.now() - start < seconds * 1000; k++) {
      await sleep(Math.max(0, start + k * POLL_MS - performance.now()));
      const t = (performance.now() - start) / 1000;
      if (t >= seconds) break; // a final sample past the end would form a one-sample bucket that could win "peak window"
      const { realtimeData } = await send('WebAudio.getRealtimeData', { contextId });
      const hudText = await evaluate(`document.querySelector('.audio-debug-hud')?.textContent ?? ''`);
      const metrics = await send('Performance.getMetrics');
      const hud = parseAudibleFromHud(hudText);
      const budget = parseBudgetFromHud(hudText);
      samples.push({
        t,
        capacity: realtimeData?.renderCapacity,
        intervalMs: typeof realtimeData?.callbackIntervalMean === 'number' ? realtimeData.callbackIntervalMean * 1000 : null,
        audible: hud ? hud.audible : null,
        sounding: budget ? budget.sounding : null,
        nodes: nodes.live(contextId),
        heapMb: parseHeapMb(metrics),
        events: parseTransportEventsFromHud(hudText),
        lagMs: parseLagFromHud(hudText)?.lagMs ?? null,
      });
    }

    const buckets = bucketSamples(samples, bucketSec);
    return {
      world: world.label,
      url,
      seconds,
      bucketSec,
      samples: samples.length,
      carried,
      consoleTally: tallyConsole(consoleEvents),
      buckets,
      summary: summarizeBuckets(buckets),
      audibleCorrelation: audibleCapacityCorrelation(buckets),
      trends: { nodes: trend(buckets, 'nodes'), heapMb: trend(buckets, 'heapMb'), events: trend(buckets, 'events') },
      nodesByType: { atStart: nodesAtStart, atEnd: nodes.liveByType(contextId), change: diffByType(nodesAtStart, nodes.liveByType(contextId)) },
    };
  });
}

const fixed = (value, digits) => (value === null || value === undefined ? '-' : value.toFixed(digits));

/** One trend as `first → last (+delta)`, or a dash when fewer than two buckets carried the column. */
const movement = (t, digits) => (t ? `${fixed(t.first, digits)} → ${fixed(t.last, digits)} (${t.delta >= 0 ? '+' : ''}${fixed(t.delta, digits)})` : '-');

function report(run) {
  console.log(`\n=== ${run.world} — ${run.seconds}s, ${run.bucketSec}s buckets, ${run.samples} samples`);
  console.log(run.url);
  if (run.carried.length) {
    console.log('carried after warm-up:');
    for (const line of run.carried) console.log(`  ${line}`);
  }
  const { byType, lines } = run.consoleTally;
  console.log(`console: ${byType.warning} warnings, ${byType.error} errors`);
  for (const { type, text, count } of lines) console.log(`  ${count}× ${type}: ${text}`);
  console.table(run.buckets.map((b) => ({
    't (s)': b.startSec,
    'mean cap': Number(fixed(b.meanCapacity, 3)),
    'max cap': Number(fixed(b.maxCapacity, 3)),
    'interval (ms)': fixed(b.meanIntervalMs, 2),
    audible: fixed(b.audible, 1),
    sounding: fixed(b.sounding, 1),
    'max snd': b.maxSounding ?? '-',
    nodes: fixed(b.nodes, 0),
    'heap (MB)': fixed(b.heapMb, 1),
    events: fixed(b.events, 0),
    'max lag': b.maxLagMs === null ? '-' : `${b.maxLagMs}ms`,
  })));
  const { summary, trends } = run;
  console.log(
    `peak window ${fixed(summary.peakWindow, 3)} (at ${summary.peakWindowStartSec ?? '-'}s)   ` +
    `overall mean ${fixed(summary.overallMean, 3)}   overall max ${fixed(summary.overallMax, 3)}   ` +
    `r(audible, capacity) ${run.audibleCorrelation === null ? '-' : run.audibleCorrelation.toFixed(2)}`,
  );
  console.log(`first → last bucket:   nodes ${movement(trends.nodes, 0)}   heap MB ${movement(trends.heapMb, 1)}   events ${movement(trends.events, 0)}`);
  const { change, atEnd } = run.nodesByType;
  if (change.length) {
    const total = atEnd.reduce((sum, [, n]) => sum + n, 0);
    console.log(`live nodes by type, start → end of series (${total} at end):   ${change.map(([type, d]) => `${type} ${d >= 0 ? '+' : ''}${d}`).join('   ')}`);
  }
}

async function main() {
  if (!opts.world && !opts.worlds) throw new Error('Give --world <name:x:y> or --worlds <a,b,c> (see --help).');
  const worlds = opts.worlds ? rotateList(parseWorldList(opts.worlds), Number(opts.rot)) : [parseWorldSpec(opts.world)];
  const settings = {
    seconds: positiveNumber('seconds', opts.seconds),
    bucketSec: positiveNumber('bucket', opts.bucket),
    warmupSec: Number(opts.warmup),
  };
  if (!Number.isFinite(settings.warmupSec) || settings.warmupSec < 0) throw new Error(`--warmup must be 0 or more (got "${opts.warmup}")`);

  const runs = [];
  for (const world of worlds) {
    const run = await measureWorld(world, settings);
    report(run);
    runs.push(run);
  }
  if (opts.json) writeFileSync(opts.json, `${JSON.stringify(runs, null, 2)}\n`);
}

await main().catch((error) => {
  console.error(`perf:audio: ${error.message}`);
  process.exitCode = 1;
});
