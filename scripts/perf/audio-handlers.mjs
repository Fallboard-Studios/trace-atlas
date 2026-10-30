#!/usr/bin/env node
/**
 * Per-handler breakdown of the audio thread (backlog 27 T2, docs/specs/LIGHT_TIER_STANDING_COST.md §1.2).
 *
 * Opens one pinned world in a fresh headless Chrome exactly as `npm run perf:audio` does (`withPoweredWorld` in
 * powered-world.mjs: WebAudio before navigation, power on, the warm-up, the pin check), then records a Chrome trace
 * of the `webaudio` and `disabled-by-default-webaudio.audionode` categories for `--seconds`, and prints which Web
 * Audio handler classes carry the audio thread: each class's self time as a share of the same trace's
 * `RealtimeAudioDestinationHandler::Render` total, its instance count, and the share per instance.
 *
 * Tracing inflates the audio thread's load (~3x seen), so read proportions only: the shares are of Render in the
 * same trace, where the inflation cancels. If the per-handler category is not live on this Chrome, the run says so
 * (plan Q1's fallback) and the breakdown is unavailable.
 *
 *   npm run build && npx vite preview --port 4173      # terminal 1 — serve a production build
 *   npm run perf:audio-handlers -- --world "56c2t2t8:-116:-2?load=light&s=<blob>" --seconds 8
 *
 * The tally is pure and unit-tested (audio-handlers-lib.mjs); the Chrome plumbing is verified by real runs.
 * Measurement hygiene (foreground, one call at a time, orphaned-Chrome check): docs/PERFORMANCE.md.
 */
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import { RENDER, formatHandlerTable, tallyHandlers } from './audio-handlers-lib.mjs';
import { parseWorldSpec } from './audio-load-lib.mjs';
import { sleep } from './cdp-lib.mjs';
import { withPoweredWorld } from './powered-world.mjs';

const CATEGORIES = ['webaudio', 'disabled-by-default-webaudio.audionode'];

/** The warm-up after powering on, as `perf:audio`'s default, so both tools read the same moment of a world. */
const WARMUP_SEC = 8;

const HELP = `Usage: npm run perf:audio-handlers -- --world <spec> [flags]

  --world <spec>     one world, name:x:y with an optional ?query (e.g. "56c2t2t8:-116:-2?load=light&s=1.<blob>"),
                     as perf:audio's --world, the @page form included. The run aborts if the overlay lands anywhere
                     else (the pin check). Required.
  --seconds <n>      length of the traced window, after an ${WARMUP_SEC} s warm-up (default 8). Chrome's trace buffer
                     holds about 9 s of D1 at Light (~4 million events); a longer window loses data, and the run
                     says so ("DATA LOST", and Render spans less than the window).
  --url <url>        base URL of the served build (default http://localhost:4173/trace-atlas/, i.e. \`vite preview\`)
  --json <path>      also write the run (overlay rows, tally, trace coverage) to this file
  --chrome <path>    Chrome/Edge executable (else $CHROME_PATH, else a platform default)
  --port <n>         remote-debugging port (default 9335)
  --help

Prints shares of Render, never absolute cost: tracing inflates the audio thread's load ~3x, so read proportions only.
One fresh Chrome per run, closed afterwards. Run in the FOREGROUND, ONE CALL AT A TIME, and check for orphaned Chrome
before and after — see docs/PERFORMANCE.md.
`;

const { values: opts } = parseArgs({
  options: {
    world: { type: 'string' },
    seconds: { type: 'string', default: '8' },
    url: { type: 'string', default: 'http://localhost:4173/trace-atlas/' },
    json: { type: 'string' },
    chrome: { type: 'string' },
    port: { type: 'string', default: '9335' },
    help: { type: 'boolean', default: false },
  },
});

if (opts.help) {
  console.log(HELP);
  process.exit(0);
}

/** Keeps only what the tally reads, so a long trace's millions of events stay small in memory. */
function compact(ev) {
  const args = ev.args && ('this' in ev.args || 'node type' in ev.args)
    ? { this: ev.args.this, 'node type': ev.args['node type'] }
    : undefined;
  return { pid: ev.pid, tid: ev.tid, ph: ev.ph, name: ev.name, ts: ev.ts, dur: ev.dur, args };
}

/** The span the trace's Render events cover, in seconds: less than the window means the buffer ran out. */
function renderSpanSec(events) {
  let first = Infinity;
  let last = -Infinity;
  for (const ev of events) {
    if (ev.name !== RENDER) continue;
    first = Math.min(first, ev.ts);
    last = Math.max(last, ev.ts + (ev.dur ?? 0));
  }
  return last > first ? (last - first) / 1e6 : 0;
}

async function traceWorld(world, seconds) {
  const open = { chromePath: opts.chrome, port: opts.port, baseUrl: opts.url, world, warmupSec: WARMUP_SEC };
  return withPoweredWorld(open, async ({ send, onEvent, url, carried }) => {
    const events = [];
    let bufferPercentMax = 0;
    const stopCollecting = onEvent((m) => {
      if (m.method === 'Tracing.dataCollected') for (const ev of m.params.value) if (ev.ph === 'X') events.push(compact(ev));
      if (m.method === 'Tracing.bufferUsage') bufferPercentMax = Math.max(bufferPercentMax, m.params.percentFull ?? 0);
    });
    let dataLoss = false;
    const complete = new Promise((resolve) => {
      const stop = onEvent((m) => {
        if (m.method !== 'Tracing.tracingComplete') return;
        dataLoss = Boolean(m.params.dataLossOccurred);
        stop();
        resolve();
      });
    });
    await send('Tracing.start', {
      transferMode: 'ReportEvents',
      bufferUsageReportingInterval: 1000,
      traceConfig: { recordMode: 'recordAsMuchAsPossible', includedCategories: CATEGORIES, excludedCategories: ['*'] },
    });
    await sleep(seconds * 1000);
    await send('Tracing.end');
    await complete;
    stopCollecting();

    return {
      world: world.label,
      url,
      seconds,
      carried,
      eventCount: events.length,
      renderSpanSec: renderSpanSec(events),
      bufferPercentMax,
      dataLoss,
      tally: tallyHandlers(events),
    };
  });
}

function report(run) {
  console.log(`\n=== ${run.world} — ${run.seconds}s traced after a ${WARMUP_SEC}s warm-up`);
  console.log(run.url);
  console.log('Shares of Render; tracing inflates load ~3x, read proportions only.');
  if (run.carried.length) {
    console.log('carried after warm-up:');
    for (const line of run.carried) console.log(`  ${line}`);
  }
  const buffer = `${(run.bufferPercentMax * 100).toFixed(0)}%`;
  console.log(
    `trace: ${run.eventCount} complete events, Render spans ${run.renderSpanSec.toFixed(1)} s of the ${run.seconds} s window, ` +
    `buffer peak ${buffer}${run.dataLoss ? ', DATA LOST (the tally covers only what was kept)' : ''}`,
  );
  console.log(formatHandlerTable(run.tally));
}

async function main() {
  if (!opts.world) throw new Error('Give --world <name:x:y> (see --help).');
  const seconds = Number(opts.seconds);
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error(`--seconds must be a positive number (got "${opts.seconds}")`);
  const run = await traceWorld(parseWorldSpec(opts.world), seconds);
  report(run);
  if (opts.json) writeFileSync(opts.json, `${JSON.stringify(run, null, 2)}\n`);
}

await main().catch((error) => {
  console.error(`perf:audio-handlers: ${error.message}`);
  process.exitCode = 1;
});
