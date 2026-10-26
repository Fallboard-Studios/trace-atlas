// Tests for the pure helpers behind `npm run perf:audio` (scripts/perf/audio-load.mjs).
// The Chrome/CDP plumbing is not unit-tested; it is verified by a real run (see docs/PERFORMANCE.md).
import { describe, expect, it } from 'vitest';

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
  pearson,
  rotateList,
  summarizeBuckets,
  trend,
} from './audio-load-lib.mjs';

// ========================================
// HELPERS
// ========================================

/** A sample every 0.5 s for `seconds`, capacity from `capacityAt(t)`, optional audible from `audibleAt(t)`. */
function series(seconds, capacityAt, audibleAt) {
  const samples = [];
  for (let t = 0; t < seconds; t += 0.5) {
    samples.push({
      t,
      capacity: capacityAt(t),
      intervalMs: 10,
      audible: audibleAt ? audibleAt(t) : null,
    });
  }
  return samples;
}

// ========================================
// WORLD SPECS
// ========================================

describe('parseWorldSpec', () => {
  it('parses name:x:y into the seed and pinned coordinates', () => {
    expect(parseWorldSpec('charlie:200:-30')).toEqual({
      label: 'charlie:200:-30',
      seed: 'charlie',
      x: 200,
      y: -30,
      query: '',
    });
  });

  it('handles negative and zero coordinates', () => {
    expect(parseWorldSpec('bravo:-150:90')).toMatchObject({ x: -150, y: 90 });
    expect(parseWorldSpec('zero:0:0')).toMatchObject({ x: 0, y: 0 });
  });

  it('carries an extra query string so variants can be A/B-ed in one session', () => {
    const world = parseWorldSpec('charlie:200:-30?load=light');
    expect(world).toMatchObject({ seed: 'charlie', x: 200, y: -30, query: 'load=light' });
    expect(world.label).toBe('charlie:200:-30?load=light');
    expect(parseWorldSpec('charlie:200:-30?load=light&latency=playback').query).toBe('load=light&latency=playback');
  });

  it('carries an optional page after @, so two builds served side by side can be A/B-ed in one invocation', () => {
    expect(parseWorldSpec('charlie:200:-30@pre.html')).toMatchObject({ seed: 'charlie', x: 200, y: -30, page: 'pre.html', query: '' });
    const both = parseWorldSpec('bravo:-150:90@builds/pre.html?load=full');
    expect(both).toMatchObject({ x: -150, y: 90, page: 'builds/pre.html', query: 'load=full' });
    expect(both.label).toBe('bravo:-150:90@builds/pre.html?load=full');
    expect(parseWorldSpec('charlie:200:-30').page).toBeUndefined();
  });

  it('ignores surrounding whitespace', () => {
    expect(parseWorldSpec('  charlie:200:-30  ')).toMatchObject({ seed: 'charlie', x: 200, y: -30 });
  });

  it('rejects specs that are not name:x:y with integer coordinates', () => {
    for (const bad of ['charlie:200:-30@', 'charlie:200:-30@ x', '', 'charlie', 'charlie:200', ':200:-30', 'charlie:a:b', 'charlie:1.5:2', 'charlie:200:-30:9', 'charlie:200:']) {
      expect(() => parseWorldSpec(bad), bad).toThrow(/world/i);
    }
  });
});

describe('parseWorldList', () => {
  it('splits a comma-separated list, trimming and skipping empty entries', () => {
    expect(parseWorldList('a:1:2, b:3:4 ,,').map((w) => w.label)).toEqual(['a:1:2', 'b:3:4']);
  });

  it('keeps each entry’s own query string', () => {
    const [a, b] = parseWorldList('a:1:2?load=light,a:1:2?load=full');
    expect(a.query).toBe('load=light');
    expect(b.query).toBe('load=full');
  });

  it('rejects an empty list', () => {
    expect(() => parseWorldList('')).toThrow(/world/i);
    expect(() => parseWorldList(' , ')).toThrow(/world/i);
  });
});

describe('rotateList', () => {
  it('rotates the start order left by n', () => {
    expect(rotateList(['a', 'b', 'c'], 1)).toEqual(['b', 'c', 'a']);
    expect(rotateList(['a', 'b', 'c'], 2)).toEqual(['c', 'a', 'b']);
  });

  it('wraps past the length and accepts negatives', () => {
    expect(rotateList(['a', 'b', 'c'], 3)).toEqual(['a', 'b', 'c']);
    expect(rotateList(['a', 'b', 'c'], 4)).toEqual(['b', 'c', 'a']);
    expect(rotateList(['a', 'b', 'c'], -1)).toEqual(['c', 'a', 'b']);
  });

  it('handles empty and single-item lists and does not mutate its input', () => {
    expect(rotateList([], 5)).toEqual([]);
    expect(rotateList(['a'], 7)).toEqual(['a']);
    const input = ['a', 'b', 'c'];
    rotateList(input, 1);
    expect(input).toEqual(['a', 'b', 'c']);
  });

  it('treats a missing or non-numeric n as no rotation', () => {
    expect(rotateList(['a', 'b'], undefined)).toEqual(['a', 'b']);
    expect(rotateList(['a', 'b'], NaN)).toEqual(['a', 'b']);
  });
});

// ========================================
// PAGE URL
// ========================================

describe('buildPageUrl', () => {
  const base = 'http://localhost:4173/trace-atlas/';
  const world = parseWorldSpec('charlie:200:-30');

  it('pins the world and turns the overlay on by default', () => {
    expect(buildPageUrl(base, world)).toBe('http://localhost:4173/trace-atlas/?debug&seed=charlie&x=200&y=-30');
  });

  it('appends the world’s extra query after the pinned params', () => {
    const url = buildPageUrl(base, parseWorldSpec('charlie:200:-30?load=light'));
    expect(url).toBe('http://localhost:4173/trace-atlas/?debug&seed=charlie&x=200&y=-30&load=light');
  });

  it('resolves the world page against the base URL, keeping the pinned params', () => {
    const url = buildPageUrl(base, parseWorldSpec('charlie:200:-30@pre.html?load=full'));
    expect(url).toBe('http://localhost:4173/trace-atlas/pre.html?debug&seed=charlie&x=200&y=-30&load=full');
  });

  it('keeps the base URL page when the world names none', () => {
    expect(buildPageUrl('http://localhost:4173/trace-atlas/index.html', world)).toBe('http://localhost:4173/trace-atlas/index.html?debug&seed=charlie&x=200&y=-30');
  });

  it('can leave the overlay off', () => {
    expect(buildPageUrl(base, world, { debug: false })).toBe('http://localhost:4173/trace-atlas/?seed=charlie&x=200&y=-30');
  });

  it('works against a LAN address (the insecure-context case), not just localhost', () => {
    const url = buildPageUrl('http://192.168.1.20:4173/trace-atlas/', world);
    expect(url.startsWith('http://192.168.1.20:4173/trace-atlas/?')).toBe(true);
  });

  it('replaces any query or hash already on the base URL', () => {
    const url = buildPageUrl('http://localhost:4173/trace-atlas/?seed=other#x', world);
    expect(url).toBe('http://localhost:4173/trace-atlas/?debug&seed=charlie&x=200&y=-30');
  });

  it('encodes a seed with characters that are not URL-safe', () => {
    const url = buildPageUrl(base, { ...world, seed: 'a b&c' });
    expect(new URL(url).searchParams.get('seed')).toBe('a b&c');
  });
});

// ========================================
// BUCKETING AND SUMMARY
// ========================================

describe('bucketSamples', () => {
  it('groups samples into fixed-width buckets with mean and max capacity', () => {
    const buckets = bucketSamples(series(30, (t) => (t < 15 ? 0.3 : 0.5)), 15);
    expect(buckets).toHaveLength(2);
    expect(buckets[0]).toMatchObject({ startSec: 0, samples: 30, meanCapacity: 0.3, maxCapacity: 0.3 });
    expect(buckets[1]).toMatchObject({ startSec: 15, samples: 30, meanCapacity: 0.5, maxCapacity: 0.5 });
  });

  it('reports the max separately from the mean', () => {
    const samples = [
      { t: 0, capacity: 0.2, intervalMs: 10, audible: null },
      { t: 5, capacity: 0.8, intervalMs: 10, audible: null },
      { t: 10, capacity: 0.5, intervalMs: 10, audible: null },
    ];
    const [bucket] = bucketSamples(samples, 15);
    expect(bucket.meanCapacity).toBeCloseTo(0.5, 10);
    expect(bucket.maxCapacity).toBe(0.8);
  });

  it('puts a sample exactly on a boundary in the later bucket', () => {
    const samples = [
      { t: 14.5, capacity: 0.1, intervalMs: 10, audible: null },
      { t: 15, capacity: 0.9, intervalMs: 10, audible: null },
    ];
    const buckets = bucketSamples(samples, 15);
    expect(buckets.map((b) => b.startSec)).toEqual([0, 15]);
    expect(buckets[1].meanCapacity).toBe(0.9);
  });

  it('averages the callback interval, and the audible-robot count when the overlay supplied it', () => {
    const samples = [
      { t: 0, capacity: 0.3, intervalMs: 10, audible: 2 },
      { t: 1, capacity: 0.3, intervalMs: 12, audible: 4 },
    ];
    const [bucket] = bucketSamples(samples, 15);
    expect(bucket.meanIntervalMs).toBe(11);
    expect(bucket.audible).toBe(3);
  });

  it('reports audible as null when no sample in the bucket had a reading (overlay absent)', () => {
    const [bucket] = bucketSamples(series(15, () => 0.3), 15);
    expect(bucket.audible).toBeNull();
  });

  it('averages audible over only the samples that had a reading', () => {
    const samples = [
      { t: 0, capacity: 0.3, intervalMs: 10, audible: null },
      { t: 1, capacity: 0.3, intervalMs: 10, audible: 6 },
    ];
    expect(bucketSamples(samples, 15)[0].audible).toBe(6);
  });

  it('skips samples with no usable capacity instead of poisoning the mean', () => {
    const samples = [
      { t: 0, capacity: NaN, intervalMs: 10, audible: null },
      { t: 1, capacity: undefined, intervalMs: 10, audible: null },
      { t: 2, capacity: 0.4, intervalMs: 10, audible: null },
    ];
    const [bucket] = bucketSamples(samples, 15);
    expect(bucket.samples).toBe(1);
    expect(bucket.meanCapacity).toBe(0.4);
  });

  it('omits buckets that received no samples (a polling gap) rather than reporting NaN', () => {
    const samples = [
      { t: 1, capacity: 0.3, intervalMs: 10, audible: null },
      { t: 31, capacity: 0.4, intervalMs: 10, audible: null },
    ];
    expect(bucketSamples(samples, 15).map((b) => b.startSec)).toEqual([0, 30]);
  });

  it('is order-independent and returns [] for no samples', () => {
    const samples = series(30, (t) => t / 100);
    expect(bucketSamples([...samples].reverse(), 15)).toEqual(bucketSamples(samples, 15));
    expect(bucketSamples([], 15)).toEqual([]);
  });

  it('rejects a non-positive or non-finite bucket width', () => {
    for (const bad of [0, -5, NaN, Infinity]) {
      expect(() => bucketSamples(series(5, () => 0.3), bad), String(bad)).toThrow(/bucket/i);
    }
  });
});

describe('summarizeBuckets', () => {
  it('reports the peak window (highest bucket mean), its start, and the overall mean', () => {
    const buckets = bucketSamples(series(45, (t) => (t < 15 ? 0.3 : t < 30 ? 0.6 : 0.3)), 15);
    const summary = summarizeBuckets(buckets);
    expect(summary.peakWindow).toBeCloseTo(0.6, 10);
    expect(summary.peakWindowStartSec).toBe(15);
    expect(summary.overallMean).toBeCloseTo(0.4, 10);
  });

  it('weights the overall mean by sample count, not by bucket count', () => {
    const samples = [
      { t: 0, capacity: 0.2, intervalMs: 10, audible: null },
      { t: 1, capacity: 0.2, intervalMs: 10, audible: null },
      { t: 2, capacity: 0.2, intervalMs: 10, audible: null },
      { t: 15, capacity: 0.8, intervalMs: 10, audible: null },
    ];
    expect(summarizeBuckets(bucketSamples(samples, 15)).overallMean).toBeCloseTo(0.35, 10);
  });

  it('reports the highest single sample as the overall max', () => {
    const samples = [
      { t: 0, capacity: 0.2, intervalMs: 10, audible: null },
      { t: 20, capacity: 0.97, intervalMs: 10, audible: null },
    ];
    expect(summarizeBuckets(bucketSamples(samples, 15)).overallMax).toBe(0.97);
  });

  it('returns nulls for no buckets', () => {
    expect(summarizeBuckets([])).toEqual({ overallMean: null, overallMax: null, peakWindow: null, peakWindowStartSec: null });
  });
});

// ========================================
// CORRELATION
// ========================================

describe('pearson', () => {
  it('is +1 for a perfect increasing line and -1 for a perfect decreasing one', () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1, 10);
    expect(pearson([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1, 10);
  });

  it('matches a hand-computed value', () => {
    // x = [1,2,3], y = [1,3,2]: cov = 0.5, sd = 1 each → r = 0.5
    expect(pearson([1, 2, 3], [1, 3, 2])).toBeCloseTo(0.5, 10);
  });

  it('is near 0 for uncorrelated data', () => {
    expect(pearson([1, 2, 3, 4], [1, -1, -1, 1])).toBeCloseTo(0, 10);
  });

  it('is null when either series is constant (undefined, not 0)', () => {
    expect(pearson([1, 2, 3], [5, 5, 5])).toBeNull();
    expect(pearson([5, 5, 5], [1, 2, 3])).toBeNull();
  });

  it('is null with fewer than two points', () => {
    expect(pearson([], [])).toBeNull();
    expect(pearson([1], [2])).toBeNull();
  });

  it('throws on mismatched lengths', () => {
    expect(() => pearson([1, 2], [1])).toThrow(/length/i);
  });
});

describe('audibleCapacityCorrelation', () => {
  it('correlates per-bucket audible robots with per-bucket mean capacity', () => {
    // Capacity rises with the audible count → strongly positive.
    const buckets = bucketSamples(
      series(60, (t) => 0.2 + 0.05 * Math.floor(t / 15), (t) => 2 + Math.floor(t / 15)),
      15,
    );
    expect(audibleCapacityCorrelation(buckets)).toBeCloseTo(1, 6);
  });

  it('is null when the overlay never reported a count', () => {
    expect(audibleCapacityCorrelation(bucketSamples(series(60, (t) => t / 100), 15))).toBeNull();
  });

  it('uses only buckets that have an audible reading, and pools across runs when given both', () => {
    const runA = bucketSamples(series(30, (t) => (t < 15 ? 0.3 : 0.5), (t) => (t < 15 ? 2 : 6)), 15);
    const runB = bucketSamples(series(30, () => 0.4), 15); // no overlay reading
    expect(audibleCapacityCorrelation([...runA, ...runB])).toBeCloseTo(1, 6);
  });

  it('is null when the audible count never changes', () => {
    expect(audibleCapacityCorrelation(bucketSamples(series(60, (t) => t / 100, () => 4), 15))).toBeNull();
  });
});

// ========================================
// OVERLAY TEXT
// ========================================

describe('parseAudibleFromHud', () => {
  it('reads the audible count and roster size off the voices line', () => {
    const text = 'bravo @ -150,90   up 1:32\nvoices 3/16   audible 5/12   LFOs 5/7\nfps 58';
    expect(parseAudibleFromHud(text)).toEqual({ audible: 5, total: 12 });
  });

  it('reads 0/0 before any robot exists', () => {
    expect(parseAudibleFromHud('voices 0/16   audible 0/0   LFOs 0/0')).toEqual({ audible: 0, total: 0 });
  });

  it('returns null when the overlay is absent or the line is missing (an older build)', () => {
    expect(parseAudibleFromHud('')).toBeNull();
    expect(parseAudibleFromHud(null)).toBeNull();
    expect(parseAudibleFromHud(undefined)).toBeNull();
    expect(parseAudibleFromHud('voices 3/16   LFOs 5/7')).toBeNull();
  });
});

describe('parseBudgetFromHud', () => {
  const line = 'load 20% · sounding 4/4 · standing by 2 · poly 3/8';

  it('reads the dial, sounding/cap, standing by and poly/ceiling off the caps line', () => {
    expect(parseBudgetFromHud(`voices 3/8   audible 6/12   LFOs 0/7
${line}
fps 58`)).toEqual({
      loadPct: 20, sounding: 4, cap: 4, standingBy: 2, poly: 3, polyCap: 8,
    });
  });

  it('reads the live two-dial line (`load r%·fx e%`, since 2026-09-22) — found reading a dash in the 2026-10-23 smoke run', () => {
    expect(parseBudgetFromHud('load 20%·fx 20% · sounding 3/4 · standing by 0 · poly 2/8 · fx in 3/10')).toEqual({
      loadPct: 20, sounding: 3, cap: 4, standingBy: 0, poly: 2, polyCap: 8,
    });
  });

  it('reads Full', () => {
    expect(parseBudgetFromHud('load 100% · sounding 7/12 · standing by 0 · poly 3/16')).toEqual({
      loadPct: 100, sounding: 7, cap: 12, standingBy: 0, poly: 3, polyCap: 16,
    });
  });

  it('still finds the line when the overlay text has no newlines (textContent joins the divs)', () => {
    expect(parseBudgetFromHud(`ctx running${line}fps 58`)?.sounding).toBe(4);
  });

  it('returns null when the line is absent (an older build), unparseable, or shows dashes', () => {
    expect(parseBudgetFromHud('')).toBeNull();
    expect(parseBudgetFromHud(null)).toBeNull();
    expect(parseBudgetFromHud(undefined)).toBeNull();
    expect(parseBudgetFromHud('voices 3/16   audible 5/12')).toBeNull();
    expect(parseBudgetFromHud('load - · sounding -/- · standing by - · poly -/-')).toBeNull();
  });
});

// ========================================
// THE PIN CHECK (the spec's name:x:y is the link's seed/x/y; the overlay says where the page landed)
// ========================================

describe('expectedCoordinates', () => {
  it('expects the spec coordinates, which the page URL pins through ?seed=&x=&y=', () => {
    expect(expectedCoordinates(parseWorldSpec('bravo:-150:90'))).toStrictEqual({ x: -150, y: 90 });
  });

  it('ignores a retired ?session= value in the world query (its coordinates are not the pin)', () => {
    // base64 of {"c":{"x":1,"y":2}}: the old reader returned { x: 1, y: 2, from: 'session' }.
    expect(expectedCoordinates({ x: 200, y: -30, query: 'session=eyJjIjp7IngiOjEsInkiOjJ9fQ' })).toStrictEqual({ x: 200, y: -30 });
  });

  it('expects the spec coordinates when a tweaked world rides along in an s= blob among other params', () => {
    const world = parseWorldSpec('bravo:-150:90?load=light&s=1.q1YqU7JSMjQwUNJRKkpNzs8rUbIyNDDQUcrJTEotSs7PTgUA&latency=playback');
    expect(expectedCoordinates(world)).toStrictEqual({ x: -150, y: 90 });
  });

  it('expects the spec coordinates when the world has no query at all', () => {
    expect(expectedCoordinates({ x: 0, y: -7 })).toStrictEqual({ x: 0, y: -7 });
  });

  it('pairs with buildPageUrl: the expected coordinates are the ones the URL carries, ahead of the blob', () => {
    const world = parseWorldSpec('bravo:-150:90?s=1.abc');
    const url = new URL(buildPageUrl('http://localhost:4173/trace-atlas/', world));
    expect(url.search).toBe('?debug&seed=bravo&x=-150&y=90&s=1.abc');
    const { x, y } = expectedCoordinates(world);
    expect({ x: Number(url.searchParams.get('x')), y: Number(url.searchParams.get('y')) }).toEqual({ x, y });
  });
});

describe('parseCoordinatesFromHud', () => {
  it('reads where the page landed off the overlay’s world row', () => {
    expect(parseCoordinatesFromHud('random @ -116,-2   up 0:06ctx running')).toEqual({ x: -116, y: -2 });
    expect(parseCoordinatesFromHud('bravo @ -150,90   up 1:32')).toEqual({ x: -150, y: 90 });
  });

  it('returns null when the row is absent or shows a dash', () => {
    expect(parseCoordinatesFromHud('random @ -   up 0:06')).toBeNull();
    expect(parseCoordinatesFromHud('')).toBeNull();
    expect(parseCoordinatesFromHud(null)).toBeNull();
  });
});

// ========================================
// LONG-RUN COLUMNS (backlog 27: load that grows during a run)
// ========================================

describe('parseTransportEventsFromHud', () => {
  it('reads the pending Transport event count off the transport line', () => {
    expect(parseTransportEventsFromHud('ctx running   clock x1.00   transport started   events 37')).toBe(37);
  });

  it('still finds it when the overlay text has no newlines (textContent joins the divs)', () => {
    expect(parseTransportEventsFromHud('transport started   events 1204latency playback')).toBe(1204);
  });

  it('returns null when the token is absent (an older build) or shows a dash', () => {
    expect(parseTransportEventsFromHud('ctx running   clock x1.00   transport started')).toBeNull();
    expect(parseTransportEventsFromHud('transport started   events -')).toBeNull();
    expect(parseTransportEventsFromHud('')).toBeNull();
    expect(parseTransportEventsFromHud(null)).toBeNull();
  });
});

describe('parseLagFromHud', () => {
  it('reads the main-thread lag and its running maximum off the fps line', () => {
    expect(parseLagFromHud('fps 60   lag 2ms (max 363ms)')).toEqual({ lagMs: 2, maxLagMs: 363 });
  });

  it('still finds it when the overlay text has no newlines', () => {
    expect(parseLagFromHud('lfo drift offfps 61   lag 0ms (max 167ms)out -10.4dB')).toEqual({ lagMs: 0, maxLagMs: 167 });
  });

  it('returns null when the line is absent or shows dashes', () => {
    expect(parseLagFromHud('fps -   lag - (max -)')).toBeNull();
    expect(parseLagFromHud('')).toBeNull();
    expect(parseLagFromHud(null)).toBeNull();
  });
});

describe('bucketSamples — main-thread lag column', () => {
  it('keeps the largest lag seen in the bucket (a stall is a maximum, not a mean)', () => {
    const samples = [
      { t: 0, capacity: 0.3, intervalMs: 10, audible: null, lagMs: 2 },
      { t: 1, capacity: 0.3, intervalMs: 10, audible: null, lagMs: 140 },
      { t: 2, capacity: 0.3, intervalMs: 10, audible: null, lagMs: 5 },
    ];
    expect(bucketSamples(samples, 15)[0].maxLagMs).toBe(140);
  });

  it('is null when no sample in the bucket carried a reading', () => {
    expect(bucketSamples(series(15, () => 0.3), 15)[0].maxLagMs).toBeNull();
  });
});

describe('parseHeapMb', () => {
  it('reads JSHeapUsedSize from a Performance.getMetrics result, in megabytes', () => {
    const result = { metrics: [{ name: 'Timestamp', value: 12.5 }, { name: 'JSHeapUsedSize', value: 48 * 1024 * 1024 }] };
    expect(parseHeapMb(result)).toBe(48);
  });

  it('returns null when the metric is missing or the result is malformed', () => {
    expect(parseHeapMb({ metrics: [{ name: 'Timestamp', value: 1 }] })).toBeNull();
    expect(parseHeapMb({})).toBeNull();
    expect(parseHeapMb(null)).toBeNull();
    expect(parseHeapMb(undefined)).toBeNull();
  });
});

describe('createNodeTally', () => {
  it('counts the live AudioNodes of one context from the DevTools created/destroyed events', () => {
    const tally = createNodeTally();
    tally.created('ctx-1');
    tally.created('ctx-1');
    tally.created('ctx-1');
    tally.destroyed('ctx-1');
    expect(tally.live('ctx-1')).toBe(2);
  });

  it('keeps contexts apart, so a disposed first context (the ?latency= swap) does not count against the polled one', () => {
    const tally = createNodeTally();
    tally.created('ctx-0');
    tally.created('ctx-0');
    tally.created('ctx-1');
    expect(tally.live('ctx-1')).toBe(1);
    expect(tally.live('ctx-0')).toBe(2);
  });

  it('reads 0 for a context that has had no events, and never goes negative', () => {
    const tally = createNodeTally();
    expect(tally.live('ctx-9')).toBe(0);
    tally.destroyed('ctx-9');
    expect(tally.live('ctx-9')).toBe(0);
  });

  describe('by node type (what is accumulating, not just how much)', () => {
    it('breaks the live count down by nodeType, largest first', () => {
      const tally = createNodeTally();
      tally.created('ctx-1', 'n1', 'GainNode');
      tally.created('ctx-1', 'n2', 'OscillatorNode');
      tally.created('ctx-1', 'n3', 'OscillatorNode');
      tally.created('ctx-1', 'n4', 'BiquadFilterNode');
      expect(tally.liveByType('ctx-1')).toEqual([
        ['OscillatorNode', 2],
        ['BiquadFilterNode', 1],
        ['GainNode', 1],
      ]);
    });

    it('credits a destroy to the type the node was created as (the destroy event carries only the id)', () => {
      const tally = createNodeTally();
      tally.created('ctx-1', 'n1', 'GainNode');
      tally.created('ctx-1', 'n2', 'OscillatorNode');
      tally.destroyed('ctx-1', 'n2');
      expect(tally.liveByType('ctx-1')).toEqual([['GainNode', 1]]);
      expect(tally.live('ctx-1')).toBe(1);
    });

    it('still counts a node whose type or id is unknown (an older Chrome), under "unknown"', () => {
      const tally = createNodeTally();
      tally.created('ctx-1');
      tally.created('ctx-1', 'n2');
      expect(tally.liveByType('ctx-1')).toEqual([['unknown', 2]]);
      tally.destroyed('ctx-1', 'never-seen');
      expect(tally.live('ctx-1')).toBe(1);
    });

    it('reports a snapshot the caller can diff: the breakdown at one moment against another', () => {
      const tally = createNodeTally();
      tally.created('ctx-1', 'n1', 'GainNode');
      const before = tally.liveByType('ctx-1');
      tally.created('ctx-1', 'n2', 'OscillatorNode');
      tally.created('ctx-1', 'n3', 'OscillatorNode');
      expect(diffByType(before, tally.liveByType('ctx-1'))).toEqual([['OscillatorNode', 2]]);
      expect(diffByType(tally.liveByType('ctx-1'), before)).toEqual([['OscillatorNode', -2]]);
      expect(diffByType(before, before)).toEqual([]);
    });
  });
});

describe('bucketSamples — long-run columns', () => {
  it('averages the live node count, heap and pending Transport events over the bucket', () => {
    const samples = [
      { t: 0, capacity: 0.3, intervalMs: 10, audible: null, nodes: 400, heapMb: 60, events: 30 },
      { t: 1, capacity: 0.3, intervalMs: 10, audible: null, nodes: 420, heapMb: 64, events: 34 },
    ];
    const [bucket] = bucketSamples(samples, 15);
    expect(bucket.nodes).toBe(410);
    expect(bucket.heapMb).toBe(62);
    expect(bucket.events).toBe(32);
  });

  it('reports null for each when no sample in the bucket carried that reading', () => {
    const [bucket] = bucketSamples(series(15, () => 0.3), 15);
    expect(bucket.nodes).toBeNull();
    expect(bucket.heapMb).toBeNull();
    expect(bucket.events).toBeNull();
  });

  it('averages each column over only the samples that had a reading', () => {
    const samples = [
      { t: 0, capacity: 0.3, intervalMs: 10, audible: null, nodes: null, heapMb: null, events: null },
      { t: 1, capacity: 0.3, intervalMs: 10, audible: null, nodes: 500, heapMb: 70, events: 9 },
    ];
    const [bucket] = bucketSamples(samples, 15);
    expect(bucket).toMatchObject({ nodes: 500, heapMb: 70, events: 9 });
  });
});

describe('trend', () => {
  const buckets = [
    { startSec: 0, nodes: 400, heapMb: null },
    { startSec: 15, nodes: 410, heapMb: 60 },
    { startSec: 30, nodes: 450, heapMb: 66 },
  ];

  it('reports the first and last bucket means of a column and the change between them', () => {
    expect(trend(buckets, 'nodes')).toEqual({ first: 400, last: 450, delta: 50, firstSec: 0, lastSec: 30 });
  });

  it('skips buckets without a reading at either end', () => {
    expect(trend(buckets, 'heapMb')).toEqual({ first: 60, last: 66, delta: 6, firstSec: 15, lastSec: 30 });
  });

  it('returns null when fewer than two buckets carry the column', () => {
    expect(trend([{ startSec: 0, nodes: 400 }], 'nodes')).toBeNull();
    expect(trend(buckets, 'events')).toBeNull();
    expect(trend([], 'nodes')).toBeNull();
  });
});

describe('bucketSamples — budget columns', () => {
  it('averages the sounding count and keeps the maximum, which is what shows a cap being honored', () => {
    const samples = [
      { t: 0, capacity: 0.3, intervalMs: 10, audible: 6, sounding: 2 },
      { t: 1, capacity: 0.3, intervalMs: 10, audible: 6, sounding: 4 },
      { t: 2, capacity: 0.3, intervalMs: 10, audible: 6, sounding: 3 },
    ];
    const [bucket] = bucketSamples(samples, 15);
    expect(bucket.sounding).toBeCloseTo(3, 10);
    expect(bucket.maxSounding).toBe(4);
  });

  it('reports null for both when no sample carried a reading (an older build, or no overlay)', () => {
    const [bucket] = bucketSamples(series(15, () => 0.3), 15);
    expect(bucket.sounding).toBeNull();
    expect(bucket.maxSounding).toBeNull();
  });

  it('uses only the samples that had a reading, and counts 0 as a reading', () => {
    const samples = [
      { t: 0, capacity: 0.3, intervalMs: 10, audible: null, sounding: null },
      { t: 1, capacity: 0.3, intervalMs: 10, audible: null, sounding: 0 },
    ];
    const [bucket] = bucketSamples(samples, 15);
    expect(bucket.sounding).toBe(0);
    expect(bucket.maxSounding).toBe(0);
  });
});

// ========================================
// WHICH AUDIO CONTEXT TO POLL
// ========================================

describe('chooseRealtimeContext', () => {
  const created = (contextId, contextType = 'realtime') => ({ contextId, contextType });

  it('picks the only realtime context', () => {
    expect(chooseRealtimeContext([created('a')], [])).toBe('a');
  });

  it('ignores offline contexts', () => {
    expect(chooseRealtimeContext([created('off', 'offline')], [])).toBeNull();
    expect(chooseRealtimeContext([created('off', 'offline'), created('a')], [])).toBe('a');
  });

  it('picks the most recently created realtime context (?latency= replaces Tone’s default one)', () => {
    expect(chooseRealtimeContext([created('default'), created('playback')], [])).toBe('playback');
  });

  it('skips contexts that have been destroyed', () => {
    expect(chooseRealtimeContext([created('default'), created('playback')], ['playback'])).toBe('default');
  });

  it('is null when nothing has been created yet, or everything is gone', () => {
    expect(chooseRealtimeContext([], [])).toBeNull();
    expect(chooseRealtimeContext([created('a')], ['a'])).toBeNull();
  });
});
