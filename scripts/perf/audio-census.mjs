#!/usr/bin/env node
/**
 * The census by call site (backlog 67 T2, docs/specs/DESKTOP_FULL_TIER_STANDING_COST.md §1.2): which code made the
 * live audio graph's nodes, so the census line's 1 800 nodes can be read as "reserveVoice made 540, the bank 120…".
 *
 * Opens one pinned world exactly as `npm run perf:audio` does (`withPoweredWorld` in powered-world.mjs: WebAudio
 * before navigation, power on, the warm-up, the pin check), after installing before navigation, through
 * `Page.addScriptToEvaluateOnNewDocument`, a hook over `BaseAudioContext.prototype`'s `create*` methods and the
 * AudioNode constructors: every node the page makes is recorded with its class, its context and its creation stack
 * (`Error.stackTraceLimit` lifted so the app frames under Tone's are kept), held only by a `WeakRef`. After the warm-up
 * it forces a GC, keeps the nodes still alive in the realtime context, resolves their stacks against the served
 * build's source maps (fetched from the same --url, read with Node's built-in `SourceMap`) and prints the tally by
 * maker (audio-census-lib.mjs), with perf:audio's census line and the hook's own by-class count for the same moment.
 *
 *   npx vite build --sourcemap --outDir <scratch>/build-map              # a throwaway build with source maps
 *   npx vite preview --outDir <scratch>/build-map --port 4174            # terminal 1 — serve it
 *   npm run perf:audio-census -- --world "ez84fjmr:93:-146?theme=wreck&load=full" --url http://localhost:4174/trace-atlas/
 *
 * Without source maps it still runs: the frames stay minified and the run says so. The tally is pure and unit-tested
 * (audio-census-lib.mjs); the hook, the GC and the map lookup are verified by real runs.
 * Measurement hygiene (foreground, one call at a time, orphaned-Chrome check): docs/PERFORMANCE.md.
 */
import { writeFileSync } from 'node:fs';
import { SourceMap } from 'node:module';
import { parseArgs } from 'node:util';

import { formatCensusByMaker, parseStack, pickMaker, tallyByMaker } from './audio-census-lib.mjs';
import { createNodeTally, formatCensus, parseWorldSpec } from './audio-load-lib.mjs';
import { sleep } from './cdp-lib.mjs';
import { withPoweredWorld } from './powered-world.mjs';

/** The hook's script name: its own frames carry it, so they are cut from every recorded stack. */
const HOOK_MARK = '__audioCensusHook__';

/** The context factories the hook wraps (each on `BaseAudioContext.prototype`; one the browser lacks is skipped). */
const CREATE_METHODS = [
  'createAnalyser', 'createBiquadFilter', 'createBufferSource', 'createChannelMerger', 'createChannelSplitter',
  'createConstantSource', 'createConvolver', 'createDelay', 'createDynamicsCompressor', 'createGain',
  'createIIRFilter', 'createOscillator', 'createPanner', 'createScriptProcessor', 'createStereoPanner',
  'createWaveShaper',
];

/** The node constructors the hook wraps: standardized-audio-context builds worklets (and may build others) with `new`. */
const CONSTRUCTORS = [
  'AnalyserNode', 'AudioBufferSourceNode', 'AudioWorkletNode', 'BiquadFilterNode', 'ChannelMergerNode',
  'ChannelSplitterNode', 'ConstantSourceNode', 'ConvolverNode', 'DelayNode', 'DynamicsCompressorNode', 'GainNode',
  'IIRFilterNode', 'OscillatorNode', 'PannerNode', 'StereoPannerNode', 'WaveShaperNode',
];

/** Seconds between the forced GC and the read, so Chrome's node-destroyed events for the collected nodes arrive. */
const GC_SETTLE_SEC = 1;

const HELP = `Usage: npm run perf:audio-census -- --world <spec> [flags]

  --world <spec>     one world, name:x:y with an optional ?query (e.g. "ez84fjmr:93:-146?theme=wreck&load=full"), as
                     perf:audio's --world. The run aborts if the overlay lands anywhere else (the pin check). Required.
  --warmup <n>       seconds after powering on before the census (default 8, as perf:audio)
  --url <url>        base URL of the served build (default http://localhost:4173/trace-atlas/). Serve a
                     \`vite build --sourcemap\` copy for readable makers; without maps the frames stay minified.
  --json <path>      also write the run (both censuses, the tally, every live stack with its maker) to this file
  --chrome <path>    Chrome/Edge executable (else $CHROME_PATH, else a platform default)
  --port <n>         remote-debugging port (default 9336)
  --help

Counts the nodes alive after a forced GC in the realtime context, by the first app frame of each creation stack.
One fresh Chrome per run, closed afterwards. Run in the FOREGROUND, ONE CALL AT A TIME, and check for orphaned Chrome
before and after — see docs/PERFORMANCE.md.
`;

const { values: opts } = parseArgs({
  options: {
    world: { type: 'string' },
    warmup: { type: 'string', default: '8' },
    url: { type: 'string', default: 'http://localhost:4173/trace-atlas/' },
    json: { type: 'string' },
    chrome: { type: 'string' },
    port: { type: 'string', default: '9336' },
    help: { type: 'boolean', default: false },
  },
});

if (opts.help) {
  console.log(HELP);
  process.exit(0);
}

/**
 * Runs in the page, before any of its scripts (it is sent as source text, so it may use only what it is handed).
 * Records every node made through a wrapped factory or constructor as `{ ref, type, context, stack }` and exposes
 * `__audioCensus.contexts()` and `__audioCensus.live(context)`, the latter grouping the still-alive nodes of one
 * context by class and stack.
 */
function installCensusHook({ methods, constructors, mark }) {
  const records = [];
  const contexts = [];
  Error.stackTraceLimit = Infinity;
  const contextIndex = (context) => {
    const known = contexts.indexOf(context);
    return known >= 0 ? known : contexts.push(context) - 1;
  };
  // The stack is formatted at once: a kept Error would hold its frames' receivers and keep dead nodes alive.
  const record = (node, type, context) => {
    const stack = String(new Error().stack).split('\n').filter((line) => !line.includes(mark)).join('\n');
    records.push({ ref: new WeakRef(node), type, context: contextIndex(context), stack });
    return node;
  };

  const proto = globalThis.BaseAudioContext?.prototype;
  for (const name of methods) {
    const original = proto?.[name];
    if (typeof original !== 'function') continue;
    proto[name] = function census(...args) {
      const node = original.apply(this, args);
      return record(node, Object.getPrototypeOf(node).constructor.name.replace(/Node$/, ''), this);
    };
  }
  for (const name of constructors) {
    const Original = globalThis[name];
    if (typeof Original !== 'function') continue;
    globalThis[name] = new Proxy(Original, {
      construct: (target, args, newTarget) => record(Reflect.construct(target, args, newTarget), name.replace(/Node$/, ''), args[0]),
    });
  }

  const Offline = globalThis.OfflineAudioContext;
  globalThis.__audioCensus = {
    made: () => records.length,
    contexts: () => contexts.map((context, index) => ({
      index,
      offline: typeof Offline === 'function' && context instanceof Offline,
      state: context?.state ?? 'unknown',
    })),
    live: (context) => {
      const groups = new Map();
      for (const r of records) {
        if (r.context !== context || r.ref.deref() === undefined) continue;
        const key = `${r.type}\n${r.stack}`;
        const group = groups.get(key);
        if (group) group.count++;
        else groups.set(key, { type: r.type, stack: r.stack, count: 1 });
      }
      return [...groups.values()];
    },
  };
}

const hookSource = () =>
  `(${installCensusHook.toString()})(${JSON.stringify({ methods: CREATE_METHODS, constructors: CONSTRUCTORS, mark: HOOK_MARK })});\n` +
  `//# sourceURL=${HOOK_MARK}.js`;

/**
 * Source maps for the scripts the stacks name: each script is fetched for its `sourceMappingURL`, then the map.
 * Returns `Map(scriptUrl → { map, lines })` (the script's own lines kept for the call-site check), holding only the
 * scripts that have a map.
 */
async function loadSourceMaps(scriptUrls) {
  const scripts = new Map();
  for (const url of scriptUrls) {
    if (!/^https?:/.test(url)) continue;
    try {
      const text = await (await fetch(url)).text();
      const ref = /\/\/# sourceMappingURL=(\S+)\s*$/.exec(text)?.[1];
      if (!ref || ref.startsWith('data:')) continue;
      const response = await fetch(new URL(ref, url));
      if (response.ok) scripts.set(url, { map: new SourceMap(await response.json()), lines: text.split('\n') });
    } catch { /* no map for this script: its frames keep their raw location */ }
  }
  return scripts;
}

/**
 * A frame's original function name, read at its caller's call: a minified bundle maps the renamed identifier there
 * (`Xe(…)` → `buildCell`), not inside the function. Trusted only on an exact entry (`findEntry` otherwise answers
 * with the segment before) whose generated text is the frame's own minified name, so a callback called through a
 * parameter (`valueOf(spec)` in `recordByEngineKey`) or an anonymous frame gets none.
 */
function callSiteName(frame, caller, scripts) {
  const own = frame.fn?.replace(/ \[as [^\]]+\]$/, '').replace(/^(new|async) /, '').split('.').pop();
  const script = caller ? scripts.get(caller.url) : undefined;
  if (!own || !script) return undefined;
  const line = caller.line - 1;
  const column = caller.column - 1;
  const entry = script.map.findEntry(line, column);
  if (entry?.generatedLine !== line || entry.generatedColumn !== column) return undefined;
  const text = script.lines[line] ?? '';
  const named = text.startsWith(own, column) && !/[\w$]/.test(text[column + own.length] ?? '');
  return named ? entry.name : undefined;
}

/** The lib's resolver over the loaded maps: the original place of a frame and, where its caller says it, its name. */
function sourceMapResolver(scripts) {
  return (frame, caller) => {
    const entry = scripts.get(frame.url)?.map.findEntry(frame.line - 1, frame.column - 1);
    if (!entry?.originalSource) return null;
    return {
      source: entry.originalSource,
      line: entry.originalLine + 1,
      column: entry.originalColumn + 1,
      name: callSiteName(frame, caller, scripts),
    };
  };
}

/** `[class, count]` pairs as one line, largest first, ties by name. */
function byClassLine(label, pairs) {
  const sorted = [...pairs].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const total = sorted.reduce((sum, [, n]) => sum + n, 0);
  return `${label} (${total}): ${sorted.length ? sorted.map(([type, n]) => `${type} ${n}`).join(' · ') : 'none'}`;
}

async function censusWorld(world, warmupSec) {
  const nodes = createNodeTally();
  const listen = (msg) => {
    if (msg.method === 'WebAudio.audioNodeCreated') nodes.created(msg.params.node.contextId, msg.params.node.nodeId, msg.params.node.nodeType);
    if (msg.method === 'WebAudio.audioNodeWillBeDestroyed') nodes.destroyed(msg.params.contextId, msg.params.nodeId);
  };
  const open = {
    chromePath: opts.chrome,
    port: opts.port,
    baseUrl: opts.url,
    world,
    warmupSec,
    domains: ['HeapProfiler'],
    listen,
    beforeNavigate: ({ send }) => send('Page.addScriptToEvaluateOnNewDocument', { source: hookSource() }),
  };
  return withPoweredWorld(open, async ({ send, evaluate, url, contextId, carried }) => {
    await send('HeapProfiler.collectGarbage');
    await sleep(GC_SETTLE_SEC * 1000);
    const cdpCensus = nodes.liveByType(contextId);

    if (!(await evaluate('typeof globalThis.__audioCensus === "object"'))) throw new Error('The census hook did not install in the page.');
    const contexts = await evaluate('__audioCensus.contexts()');
    const realtime = contexts.filter((c) => !c.offline && c.state !== 'closed').pop();
    if (!realtime) throw new Error(`No open realtime context among the hooked ones: ${JSON.stringify(contexts)}`);
    const groups = await evaluate(`__audioCensus.live(${realtime.index})`);
    const made = await evaluate('__audioCensus.made()');

    const scripts = new Set(groups.flatMap((g) => parseStack(g.stack).map((frame) => frame.url)));
    const maps = await loadSourceMaps(scripts);
    const resolve = maps.size ? sourceMapResolver(maps) : undefined;
    const records = groups.flatMap((g) => Array.from({ length: g.count }, () => g));
    const hookByClass = new Map();
    for (const g of groups) hookByClass.set(g.type, (hookByClass.get(g.type) ?? 0) + g.count);

    return {
      world: world.label,
      url,
      warmupSec,
      carried,
      made,
      contexts,
      sourceMaps: { scripts: [...scripts].filter((s) => /^https?:/.test(s)), mapped: [...maps.keys()] },
      cdpCensus,
      hookCensus: [...hookByClass],
      tally: tallyByMaker(records, resolve),
      live: groups.map((g) => ({ ...g, maker: pickMaker(g.stack, resolve) })),
    };
  });
}

function report(run) {
  console.log(`\n=== ${run.world} — census by call site ${run.warmupSec}s after power-on, after a forced GC`);
  console.log(run.url);
  if (run.carried.length) {
    console.log('carried after warm-up:');
    for (const line of run.carried) console.log(`  ${line}`);
  }
  console.log(formatCensus(run.cdpCensus));
  console.log(byClassLine('hooked nodes alive', run.hookCensus));
  console.log(`hooked nodes made since load: ${run.made} in ${run.contexts.length} context(s); counted: the open realtime one`);
  if (run.sourceMaps.mapped.length === 0) {
    console.log(
      `no source maps for ${run.sourceMaps.scripts.join(', ') || 'any script'}: makers are minified frames and the share ` +
      'outside node_modules cannot be told (serve a `vite build --sourcemap` copy)',
    );
  }
  console.log(formatCensusByMaker(run.tally));
}

async function main() {
  if (!opts.world) throw new Error('Give --world <name:x:y> (see --help).');
  const warmupSec = Number(opts.warmup);
  if (!Number.isFinite(warmupSec) || warmupSec < 0) throw new Error(`--warmup must be 0 or more (got "${opts.warmup}")`);
  const run = await censusWorld(parseWorldSpec(opts.world), warmupSec);
  report(run);
  if (opts.json) writeFileSync(opts.json, `${JSON.stringify(run, null, 2)}\n`);
}

await main().catch((error) => {
  console.error(`perf:audio-census: ${error.message}`);
  process.exitCode = 1;
});
