#!/usr/bin/env node
/**
 * Audio render-capacity time series (roadmap 17.2.6, docs/PERFORMANCE.md).
 *
 * Drives an installed Chrome/Edge over the DevTools Protocol using Node's built-in WebSocket (Node 22+/24) —
 * no new dependency. For each pinned world it loads a built copy of the app in a fresh Chrome, powers it on,
 * waits out a warm-up, then polls the DevTools "Web Audio" panel's `WebAudio.getRealtimeData` every 500 ms
 * and reports the audio render capacity (0–1; near 1.0 the audio thread misses its deadline) per time bucket:
 * mean, max, callback interval, and — when the `?debug` overlay is present — the audible-robot count, plus the
 * peak window, the overall mean, and the correlation between audible robots and capacity.
 *
 *   npm run build && npx vite preview --port 4173      # terminal 1 — serve a production build
 *   npm run perf:audio -- --world charlie:200:-30 --seconds 240 --bucket 15
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
  parseAudibleFromHud,
  parseBudgetFromHud,
  parseWorldList,
  parseWorldSpec,
  rotateList,
  summarizeBuckets,
} from './audio-load-lib.mjs';
import { sleep, withChrome } from './cdp-lib.mjs';

/** How often the DevTools realtime data is polled. `contextRealtimeDataChanged` events do not arrive on their own. */
const POLL_MS = 500;

const HELP = `Usage: npm run perf:audio -- [flags]

  --world <spec>     one pinned world, name:x:y (e.g. charlie:200:-30). An optional @page names another page under --url
                     (two builds served side by side: charlie:200:-30@pre.html). Appending a query string carries it
                     into the page URL, so variants of one world can be A/B-ed: charlie:200:-30?load=light
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
    onEvent((msg) => {
      if (msg.method === 'WebAudio.contextCreated') created.push(msg.params.context);
      if (msg.method === 'WebAudio.contextWillBeDestroyed') destroyed.push(msg.params.contextId);
    });
    await send('Page.enable');
    await send('Runtime.enable');
    await send('WebAudio.enable');

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

    const samples = [];
    const start = performance.now();
    for (let k = 1; performance.now() - start < seconds * 1000; k++) {
      await sleep(Math.max(0, start + k * POLL_MS - performance.now()));
      const t = (performance.now() - start) / 1000;
      if (t >= seconds) break; // a final sample past the end would form a one-sample bucket that could win "peak window"
      const { realtimeData } = await send('WebAudio.getRealtimeData', { contextId });
      const hudText = await evaluate(`document.querySelector('.audio-debug-hud')?.textContent ?? ''`);
      const hud = parseAudibleFromHud(hudText);
      const budget = parseBudgetFromHud(hudText);
      samples.push({
        t,
        capacity: realtimeData?.renderCapacity,
        intervalMs: typeof realtimeData?.callbackIntervalMean === 'number' ? realtimeData.callbackIntervalMean * 1000 : null,
        audible: hud ? hud.audible : null,
        sounding: budget ? budget.sounding : null,
      });
    }

    const buckets = bucketSamples(samples, bucketSec);
    return {
      world: world.label,
      url,
      seconds,
      bucketSec,
      samples: samples.length,
      buckets,
      summary: summarizeBuckets(buckets),
      audibleCorrelation: audibleCapacityCorrelation(buckets),
    };
  });
}

const fixed = (value, digits) => (value === null || value === undefined ? '-' : value.toFixed(digits));

function report(run) {
  console.log(`\n=== ${run.world} — ${run.seconds}s, ${run.bucketSec}s buckets, ${run.samples} samples`);
  console.log(run.url);
  console.table(run.buckets.map((b) => ({
    't (s)': b.startSec,
    'mean cap': Number(fixed(b.meanCapacity, 3)),
    'max cap': Number(fixed(b.maxCapacity, 3)),
    'interval (ms)': fixed(b.meanIntervalMs, 2),
    audible: fixed(b.audible, 1),
    sounding: fixed(b.sounding, 1),
    'max snd': b.maxSounding ?? '-',
  })));
  const { summary } = run;
  console.log(
    `peak window ${fixed(summary.peakWindow, 3)} (at ${summary.peakWindowStartSec ?? '-'}s)   ` +
    `overall mean ${fixed(summary.overallMean, 3)}   overall max ${fixed(summary.overallMax, 3)}   ` +
    `r(audible, capacity) ${run.audibleCorrelation === null ? '-' : run.audibleCorrelation.toFixed(2)}`,
  );
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
