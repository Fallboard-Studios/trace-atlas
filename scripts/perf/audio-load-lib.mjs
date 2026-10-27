/**
 * Pure helpers for `npm run perf:audio` (scripts/perf/audio-load.mjs) — everything that can be
 * decided without a browser: world-spec parsing, URL building, bucketing render-capacity samples,
 * summary numbers, and the audible-robots-vs-capacity correlation. Node built-ins only; no I/O.
 * Unit-tested in audio-load-lib.test.mjs; the Chrome/CDP plumbing lives in audio-load.mjs.
 */

// ========================================
// WORLD SPECS AND URLS
// ========================================

const WORLD_SPEC = /^([^:?@\s]+):(-?\d+):(-?\d+)(?:@([^?\s]+))?(?:\?(.*))?$/;

/**
 * Parse `name:x:y` (optionally `name:x:y?extra=query`) into a pinned world. `name` becomes `?seed=`,
 * x/y are the integer locale coordinates, and the optional query rides along so variants of one
 * world (e.g. `?load=light`) can be A/B-ed in a single session.
 */
export function parseWorldSpec(spec) {
  const trimmed = String(spec ?? '').trim();
  const match = WORLD_SPEC.exec(trimmed);
  if (!match) {
    throw new Error(`Invalid world "${trimmed}" — expected name:x:y with integer coordinates, e.g. charlie:200:-30`);
  }
  const [, seed, x, y, page, query] = match;
  return { label: trimmed, seed, x: Number(x), y: Number(y), ...(page ? { page } : {}), query: query ?? '' };
}

/** Parse a comma-separated list of world specs; empty entries are skipped, an empty list is an error. */
export function parseWorldList(list) {
  const worlds = String(list ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map(parseWorldSpec);
  if (worlds.length === 0) throw new Error('No worlds given — expected e.g. --worlds charlie:200:-30,bravo:-150:90');
  return worlds;
}

/** A copy of `list` rotated left by `n` (wraps; negatives rotate right; non-numeric n = no rotation). */
export function rotateList(list, n) {
  if (list.length === 0) return [];
  const steps = Number.isFinite(n) ? Math.trunc(n) : 0;
  const shift = ((steps % list.length) + list.length) % list.length;
  return [...list.slice(shift), ...list.slice(0, shift)];
}

/**
 * The page URL for one world. Any query or hash already on `baseUrl` is replaced. `debug` (default on)
 * turns the `?debug` overlay on so the audible-robot count can be read off the page.
 */
export function buildPageUrl(baseUrl, world, { debug = true } = {}) {
  const parts = [];
  if (debug) parts.push('debug');
  parts.push(`seed=${encodeURIComponent(world.seed)}`, `x=${world.x}`, `y=${world.y}`);
  if (world.query) parts.push(world.query);
  const url = world.page ? new URL(world.page, baseUrl) : new URL(baseUrl);
  url.hash = '';
  url.search = `?${parts.join('&')}`;
  return url.toString();
}

// ========================================
// THE PIN CHECK
// ========================================

/**
 * Where the page is expected to land: the spec's own `x:y`. `buildPageUrl` puts the spec's name and coordinates in the
 * world link's `?seed=&x=&y=` (docs/specs/SHORT_WORLD_LINK.md), and a tweaked world's `s=` blob in the world query
 * carries no coordinates, so the spec is the pin for every world.
 */
export function expectedCoordinates(world) {
  return { x: world.x, y: world.y };
}

/** Where the page landed, off the overlay's world row (`random @ -116,-2   up 0:06`); null when absent or a dash. */
export function parseCoordinatesFromHud(text) {
  const match = /\S+ @ (-?\d+),(-?\d+)/.exec(text ?? '');
  return match ? { x: Number(match[1]), y: Number(match[2]) } : null;
}

// ========================================
// BUCKETING AND SUMMARY
// ========================================

const mean = (values) => values.reduce((sum, v) => sum + v, 0) / values.length;
const usable = (value) => typeof value === 'number' && Number.isFinite(value);

/**
 * Group samples (`{ t, capacity, intervalMs, audible }`, `t` in seconds since the series began) into
 * fixed-width buckets. A sample on a boundary belongs to the later bucket. Samples without a usable
 * capacity are dropped; buckets that received none (a polling gap) are omitted. `audible` is the mean of
 * the readings the overlay supplied in the bucket, or null when there were none; `sounding` and `maxSounding`
 * are the mean and the maximum of the budget line's sounding-robot count (the maximum is what shows a cap held).
 * The long-run columns (backlog 27) are means likewise: `nodes` (live AudioNodes of the polled context), `heapMb`
 * (the renderer's used JS heap) and `events` (pending Transport events); `maxLagMs` is the largest main-thread lag the
 * overlay's sampler reported in the bucket (a stall is a maximum, not a mean). A column no sample carried is null.
 */
const meanOrNull = (group, key) => {
  const values = group.map((s) => s[key]).filter(usable);
  return values.length ? mean(values) : null;
};

export function bucketSamples(samples, bucketSec) {
  if (!Number.isFinite(bucketSec) || bucketSec <= 0) {
    throw new Error(`Invalid bucket width ${bucketSec} — must be a positive number of seconds`);
  }
  const byIndex = new Map();
  for (const sample of samples) {
    if (!usable(sample.capacity)) continue;
    const index = Math.floor(sample.t / bucketSec);
    if (!byIndex.has(index)) byIndex.set(index, []);
    byIndex.get(index).push(sample);
  }
  return [...byIndex.keys()]
    .sort((a, b) => a - b)
    .map((index) => {
      const group = byIndex.get(index);
      const capacities = group.map((s) => s.capacity);
      const intervals = group.map((s) => s.intervalMs).filter(usable);
      const audible = group.map((s) => s.audible).filter(usable);
      const sounding = group.map((s) => s.sounding).filter(usable);
      return {
        startSec: index * bucketSec,
        samples: group.length,
        meanCapacity: mean(capacities),
        maxCapacity: Math.max(...capacities),
        meanIntervalMs: intervals.length ? mean(intervals) : null,
        audible: audible.length ? mean(audible) : null,
        sounding: sounding.length ? mean(sounding) : null,
        maxSounding: sounding.length ? Math.max(...sounding) : null,
        nodes: meanOrNull(group, 'nodes'),
        heapMb: meanOrNull(group, 'heapMb'),
        events: meanOrNull(group, 'events'),
        maxLagMs: (() => { const lags = group.map((s) => s.lagMs).filter(usable); return lags.length ? Math.max(...lags) : null; })(),
      };
    });
}

/**
 * How one bucket column moved over a run: the first and last bucket means that carry it, with their start times,
 * and the change between them. Null when fewer than two buckets carry the column. The long run reads this for
 * `nodes`, `heapMb` and `events`: a positive delta on a steady world is load that grew during the run.
 */
export function trend(buckets, key) {
  const carrying = buckets.filter((b) => usable(b[key]));
  if (carrying.length < 2) return null;
  const first = carrying[0];
  const last = carrying[carrying.length - 1];
  return { first: first[key], last: last[key], delta: last[key] - first[key], firstSec: first.startSec, lastSec: last.startSec };
}

/**
 * The headline numbers for a series: the overall (sample-weighted) mean and max capacity, and the
 * peak window — the highest bucket mean, which the Audio Load spec's gates compare (§5.3 criterion 4).
 */
export function summarizeBuckets(buckets) {
  if (buckets.length === 0) {
    return { overallMean: null, overallMax: null, peakWindow: null, peakWindowStartSec: null };
  }
  const total = buckets.reduce((sum, b) => sum + b.samples, 0);
  const peak = buckets.reduce((best, b) => (b.meanCapacity > best.meanCapacity ? b : best));
  return {
    overallMean: buckets.reduce((sum, b) => sum + b.meanCapacity * b.samples, 0) / total,
    overallMax: Math.max(...buckets.map((b) => b.maxCapacity)),
    peakWindow: peak.meanCapacity,
    peakWindowStartSec: peak.startSec,
  };
}

// ========================================
// CORRELATION
// ========================================

/** Pearson's r, or null when it is undefined (fewer than two points, or either series is constant). */
export function pearson(xs, ys) {
  if (xs.length !== ys.length) throw new Error(`pearson: length mismatch (${xs.length} vs ${ys.length})`);
  const n = xs.length;
  if (n < 2) return null;
  const mx = mean(xs);
  const my = mean(ys);
  let covariance = 0;
  let varianceX = 0;
  let varianceY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    covariance += dx * dy;
    varianceX += dx * dx;
    varianceY += dy * dy;
  }
  if (varianceX === 0 || varianceY === 0) return null;
  return covariance / Math.sqrt(varianceX * varianceY);
}

/** Pearson r between per-bucket audible robots and per-bucket mean capacity, over the buckets that have a reading. Pass buckets from several runs to pool them. */
export function audibleCapacityCorrelation(buckets) {
  const withReading = buckets.filter((b) => usable(b.audible));
  return pearson(
    withReading.map((b) => b.audible),
    withReading.map((b) => b.meanCapacity),
  );
}

// ========================================
// OVERLAY TEXT AND CONTEXT SELECTION
// ========================================

/** Read `audible n/total` off the `?debug` overlay's text, or null when the overlay/line is absent (an older build). */
export function parseAudibleFromHud(text) {
  const match = /audible (\d+)\/(\d+)/.exec(text ?? '');
  return match ? { audible: Number(match[1]), total: Number(match[2]) } : null;
}

/**
 * Read the Audio Load caps line off the `?debug` overlay (`load 20%·fx 20% · sounding 4/4 · standing by 2 · poly 3/8`;
 * the `·fx e%` dial arrived 2026-09-22 and is optional here so the one-dial line of an older build still reads), or null
 * when the line is absent or shows dashes.
 */
export function parseBudgetFromHud(text) {
  const match = /load (\d+)%(?:·fx \d+%)? · sounding (\d+)\/(\d+) · standing by (\d+) · poly (\d+)\/(\d+)/.exec(text ?? '');
  if (!match) return null;
  const [loadPct, sounding, cap, standingBy, poly, polyCap] = match.slice(1).map(Number);
  return { loadPct, sounding, cap, standingBy, poly, polyCap };
}

/** Read the pending Transport event count (`events 37`) off the overlay's transport line, or null when absent or a dash. */
export function parseTransportEventsFromHud(text) {
  const match = /transport \S+\s+events (\d+)/.exec(text ?? '');
  return match ? Number(match[1]) : null;
}

/** Read the main-thread lag meter off the overlay's fps line (`fps 60   lag 2ms (max 363ms)`), or null when absent or dashes. */
export function parseLagFromHud(text) {
  const match = /lag (\d+)ms \(max (\d+)ms\)/.exec(text ?? '');
  return match ? { lagMs: Number(match[1]), maxLagMs: Number(match[2]) } : null;
}

/** The renderer's used JS heap in megabytes from a `Performance.getMetrics` result, or null when it is not there. */
export function parseHeapMb(result) {
  const metric = result?.metrics?.find?.((m) => m?.name === 'JSHeapUsedSize');
  return usable(metric?.value) ? metric.value / (1024 * 1024) : null;
}

/**
 * Live AudioNodes per context, tallied from the DevTools `WebAudio.audioNodeCreated` and
 * `WebAudio.audioNodeWillBeDestroyed` events (counted from `WebAudio.enable`, before the page loads, so nothing is
 * missed). Per context, because `?latency=` disposes Tone's first context for a second one. Never negative.
 */
export function createNodeTally() {
  const live = new Map(); // contextId -> count
  const byType = new Map(); // contextId -> Map(nodeType -> count)
  const typeOf = new Map(); // nodeId -> nodeType, so a destroy (id only) is credited to the right type
  const bump = (contextId, type, by) => {
    live.set(contextId, Math.max(0, (live.get(contextId) ?? 0) + by));
    if (!byType.has(contextId)) byType.set(contextId, new Map());
    const types = byType.get(contextId);
    const next = Math.max(0, (types.get(type) ?? 0) + by);
    if (next === 0) types.delete(type); else types.set(type, next);
  };
  return {
    created: (contextId, nodeId, nodeType) => {
      const type = nodeType ?? 'unknown';
      if (nodeId !== undefined) typeOf.set(nodeId, type);
      bump(contextId, type, 1);
    },
    destroyed: (contextId, nodeId) => {
      const type = typeOf.get(nodeId) ?? 'unknown';
      typeOf.delete(nodeId);
      bump(contextId, type, -1);
    },
    live: (contextId) => live.get(contextId) ?? 0,
    /** `[nodeType, count]` pairs, largest first, then by name — a snapshot, safe to keep and diff later. */
    liveByType: (contextId) => [...(byType.get(contextId) ?? new Map())].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
  };
}

/** The change from one `liveByType` snapshot to another, as `[nodeType, delta]` pairs, largest change first; types that did not move are left out. */
export function diffByType(before, after) {
  const counts = new Map(before.map(([type, n]) => [type, -n]));
  for (const [type, n] of after) counts.set(type, (counts.get(type) ?? 0) + n);
  return [...counts].filter(([, delta]) => delta !== 0).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]) || a[0].localeCompare(b[0]));
}

/**
 * Which AudioContext to poll: the most recently created realtime one that has not been destroyed.
 * (`?latency=` replaces Tone's default context with a second one, so "the first" would be wrong.)
 * `created` is `WebAudio.contextCreated` payloads in arrival order; `destroyedIds` the destroyed ids.
 */
export function chooseRealtimeContext(created, destroyedIds) {
  const gone = new Set(destroyedIds);
  const live = created.filter((c) => c.contextType === 'realtime' && !gone.has(c.contextId));
  return live.length ? live[live.length - 1].contextId : null;
}

// ========================================
// THE CONSOLE TALLY
// ========================================

/** The types a run's report lists line by line; every other type is only counted. */
const LISTED_CONSOLE_TYPES = ['warning', 'error'];

/** The first line of an event's first argument: its string value, else its string description (an Error), else `(non-string)`. */
function consoleKey(params) {
  const first = params?.args?.[0];
  const text = typeof first?.value === 'string' ? first.value : typeof first?.description === 'string' ? first.description : '(non-string)';
  return text.split(/\r?\n/, 1)[0];
}

/**
 * Tally the `params` of `Runtime.consoleAPICalled` events (backlog 35's proof run, docs/specs/BEATCLOCK_TRANSPORT_TIME.md
 * §5.2): `byType` counts every event by its type, with `warning` and `error` always present; `lines` lists the distinct
 * warnings and errors by type and first line, most frequent first (first-seen order on a tie), so one message (Tone's
 * scheduling warning) can be told apart from another's flood.
 */
export function tallyConsole(events) {
  const byType = Object.fromEntries(LISTED_CONSOLE_TYPES.map((type) => [type, 0]));
  const lines = new Map(); // `${type}\n${text}` -> { type, text, count }, insertion order = first seen
  for (const params of events) {
    const type = params?.type ?? 'unknown';
    byType[type] = (byType[type] ?? 0) + 1;
    if (!LISTED_CONSOLE_TYPES.includes(type)) continue;
    const text = consoleKey(params);
    const key = `${type}\n${text}`;
    if (!lines.has(key)) lines.set(key, { type, text, count: 0 });
    lines.get(key).count += 1;
  }
  return { byType, lines: [...lines.values()].sort((a, b) => b.count - a.count) };
}
