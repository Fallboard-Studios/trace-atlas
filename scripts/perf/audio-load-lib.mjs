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
 */
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
      };
    });
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
 * Read the Audio Load caps line off the `?debug` overlay (`load 20% · sounding 4/4 · standing by 2 · poly 3/8`), or null
 * when it is absent (an older build) or shows dashes.
 */
export function parseBudgetFromHud(text) {
  const match = /load (\d+)% · sounding (\d+)\/(\d+) · standing by (\d+) · poly (\d+)\/(\d+)/.exec(text ?? '');
  if (!match) return null;
  const [loadPct, sounding, cap, standingBy, poly, polyCap] = match.slice(1).map(Number);
  return { loadPct, sounding, cap, standingBy, poly, polyCap };
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
