#!/usr/bin/env node
/**
 * Output level series (roadmap 54, docs/specs/OUTPUT_HEADROOM.md §5.2, docs/PERFORMANCE.md).
 *
 * Drives an installed Chrome/Edge over the DevTools Protocol using Node's built-in WebSocket (Node 22+/24) — no new
 * dependency. For each page URL (a served build, with `?debug` and a `?session=` link that pins the world) it loads the
 * page in a fresh Chrome, powers it on, waits out a warm-up, then reads the `?debug` overlay's output line every 500 ms:
 * the master `out` peak and RMS and the pre-chain `pre` peak, in dBFS, plus the `fin` non-finite flag. Per tap it prints
 * the peak max and mean, the RMS mean (master only), and how many readings were at or above 0 dBFS (clipping).
 *
 *   npm run build && npx vite preview --port 4173      # terminal 1 — serve a production build
 *   npm run perf:level -- --url "http://localhost:4173/trace-atlas/?debug&session=…" --seconds 120
 *
 * The pure parts (reading the HUD line, the summary) live in output-level-lib.mjs and are unit-tested; the Chrome
 * plumbing below mirrors audio-load.mjs and is verified by a real run. Run with --help for flags.
 * Measurement hygiene (foreground, one call at a time, orphaned-Chrome check, same-session A/B): docs/PERFORMANCE.md.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { parseOutputFromHud, summarizeLevels } from './output-level-lib.mjs';

/** How often the overlay is read: its own sampler ticks every 500 ms over a 0.68 s window, so no peak falls between. */
const POLL_MS = 500;

const HELP = `Usage: npm run perf:level -- --url <page url>[,<page url>…] [flags]

  --url <list>       one or more full page URLs, comma-separated, run one after another in fresh browsers. Each must
                     carry ?debug (the overlay is what is read) and should carry ?session=… to pin the world, e.g.
                     http://localhost:4173/trace-atlas/?debug&session=eyJ…  (required)
  --seconds <n>      length of each measured series, after the warm-up (default 120, i.e. 240 readings)
  --warmup <n>       seconds to wait after powering on before measuring (default 8)
  --json <path>      also write each run's readings and summary to this file (a .json array, one entry per URL)
  --chrome <path>    Chrome/Edge executable (else $CHROME_PATH, else a platform default)
  --port <n>         remote-debugging port (default 9335)
  --help

Exits non-zero when a page has no ?debug overlay or output line, or when any reading's fin flag reads NaN!.
Each run is a fresh Chrome with its own temp profile, closed afterwards. Run them in the FOREGROUND, ONE CALL AT
A TIME, and check for orphaned Chrome before and after — see docs/PERFORMANCE.md ("Output level series").
`;

const { values: opts } = parseArgs({
  options: {
    url: { type: 'string' },
    seconds: { type: 'string', default: '120' },
    warmup: { type: 'string', default: '8' },
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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function positiveNumber(name, raw) {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`--${name} must be a positive number (got "${raw}")`);
  return value;
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
    } catch { /* browser not listening yet */ }
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
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id !== undefined && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message)); else resolve(msg.result);
    }
  });

  return {
    send: (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    }),
    close: () => ws.close(),
  };
}

/** Closes Chrome and every child process it spawned, so nothing is left behind (verify with the orphan check). */
async function shutdown(chrome, cdp) {
  try { await Promise.race([cdp?.send('Browser.close'), sleep(2000)]); } catch { /* the socket drops as Chrome exits */ }
  try { cdp?.close(); } catch { /* already closed */ }
  for (let i = 0; i < 25 && chrome.exitCode === null && chrome.signalCode === null; i++) await sleep(200);
  if (chrome.exitCode === null && chrome.signalCode === null) {
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(chrome.pid), '/T', '/F'], { stdio: 'ignore' });
    else chrome.kill('SIGKILL');
    await sleep(500);
  }
}

/** The overlay's rows joined by newlines, or null when the page has no overlay. */
const READ_HUD = `(() => {
  const hud = document.querySelector('.audio-debug-hud');
  return hud ? Array.from(hud.children, (row) => row.textContent).join('\\n') : null;
})()`;

/** One fresh Chrome, one page, one measured series. Returns the run's readings and summary. */
async function measurePage(url, { seconds, warmupSec }) {
  const profileDir = mkdtempSync(join(tmpdir(), 'trace-atlas-perf-'));
  const chrome = spawn(findChrome(), [
    '--headless=new',
    `--remote-debugging-port=${opts.port}`,
    `--user-data-dir=${profileDir}`,
    '--autoplay-policy=no-user-gesture-required',
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank',
  ], { stdio: 'ignore' });

  const onInterrupt = () => { shutdown(chrome, cdp).finally(() => process.exit(130)); };
  let cdp;
  process.once('SIGINT', onInterrupt);
  try {
    cdp = await connect(opts.port);
    const { send } = cdp;
    const evaluate = async (expression) => {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'evaluate failed');
      return r.result.value;
    };

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Page.navigate', { url });
    for (let i = 0; i < 75; i++) {
      if (await evaluate(`!!document.querySelector('button[aria-label="Power on"]')`)) break;
      if (i === 74) throw new Error(`Power button never appeared at ${url} — is the server running and is the base path right?`);
      await sleep(200);
    }
    await sleep(1500);
    await evaluate(`document.querySelector('button[aria-label="Power on"]').click()`);
    await sleep(warmupSec * 1000);

    const firstRead = await evaluate(READ_HUD);
    if (firstRead === null) throw new Error(`No ?debug overlay at ${url} — does the URL carry ?debug?`);
    const world = firstRead.split('\n')[0].replace(/\s+up \S+$/, ''); // `random @ -116,-2`: where the link landed

    const samples = [];
    let unparsed = 0;
    const start = performance.now();
    for (let k = 1; performance.now() - start < seconds * 1000; k++) {
      await sleep(Math.max(0, start + k * POLL_MS - performance.now()));
      const t = (performance.now() - start) / 1000;
      if (t >= seconds) break;
      const level = parseOutputFromHud(await evaluate(READ_HUD));
      if (!level) unparsed++;
      samples.push({ t, ...(level ?? { outPeakDb: null, outRmsDb: null, prePeakDb: null, fin: null }) });
    }
    if (unparsed === samples.length) {
      throw new Error(`The overlay at ${url} never showed an output line (out … pre … fin …) — an older build?`);
    }

    return { url, world, seconds, warmupSec, readings: samples.length, unparsed, summary: summarizeLevels(samples), samples };
  } finally {
    process.removeListener('SIGINT', onInterrupt);
    await shutdown(chrome, cdp);
    try { rmSync(profileDir, { recursive: true, force: true }); } catch { /* Chrome may still hold the profile briefly on Windows — harmless in tmp */ }
  }
}

const db = (value) => (value === null ? '-' : value === -Infinity ? '-inf' : value.toFixed(1));

function report(run) {
  const { out, pre, fin } = run.summary;
  console.log(`\n=== ${run.world} — ${run.seconds}s after a ${run.warmupSec}s warm-up, ${run.readings} readings`);
  console.log(run.url);
  const row = (tap) => ({
    'peak max (dB)': db(tap.peakMax),
    'peak mean (dB)': db(tap.peakMean),
    'rms mean (dB)': tap.rmsMean === undefined ? '' : db(tap.rmsMean),
    '>= 0 dB': `${tap.atOrAboveZero} of ${tap.n}`,
    missing: tap.missing,
    silent: tap.silent,
  });
  console.table({ out: row(out), pre: row(pre) });
  console.log(`fin ok ${fin.ok}   NaN! ${fin.nonFinite}   none ${fin.none}   unparsed ${run.unparsed}`);
}

async function main() {
  const urls = String(opts.url ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (urls.length === 0) throw new Error('Give --url <page url with ?debug&session=…> (see --help).');
  const settings = { seconds: positiveNumber('seconds', opts.seconds), warmupSec: Number(opts.warmup) };
  if (!Number.isFinite(settings.warmupSec) || settings.warmupSec < 0) throw new Error(`--warmup must be 0 or more (got "${opts.warmup}")`);

  const runs = [];
  for (const url of urls) {
    const run = await measurePage(url, settings);
    report(run);
    runs.push(run);
  }
  if (opts.json) writeFileSync(opts.json, `${JSON.stringify(runs, null, 2)}\n`);

  const nonFinite = runs.filter((run) => run.summary.fin.nonFinite > 0);
  if (nonFinite.length > 0) {
    for (const run of nonFinite) console.error(`perf:level: fin NaN! in ${run.summary.fin.nonFinite} readings at ${run.url}`);
    process.exitCode = 1;
  }
}

await main().catch((error) => {
  console.error(`perf:level: ${error.message}`);
  process.exitCode = 1;
});
