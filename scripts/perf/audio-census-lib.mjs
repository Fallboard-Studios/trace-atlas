/**
 * The pure tally behind `npm run perf:audio-census` (scripts/perf/audio-census.mjs, backlog 67 T1): which code made
 * the live audio graph's nodes. Node built-ins only; no I/O. Unit-tested in audio-census-lib.test.mjs; the Chrome/CDP
 * plumbing and the source-map lookup live in the runner.
 *
 * The runner records every node the page creates as `{ type, stack }` (the node class and `new Error().stack`, V8's
 * text, innermost frame first). Each record's **maker** is the first frame outside `node_modules`: the app function
 * that called into Tone (or made the node itself), so Tone's plumbing under it is counted as that function's. A stack
 * that is all library code goes to its outermost Tone frame, the Tone class nearest whatever called into Tone (an
 * Effect's CrossFade to the Effect), named by its file as Tone keeps one class a file.
 *
 * `resolve`, when given, maps a raw frame `{ fn, url, line, column }` (line and column 1-based, as V8 prints them) to
 * its original `{ source, line, column, name? }` through the served build's source maps, or returns null when it
 * cannot; `name` is the original function name when the map knows it. A frame it cannot map keeps its raw location.
 */

/** A V8 frame: `at fn (url:line:col)` or `at url:line:col`. Frames with no location (`at Array.forEach (<anonymous>)`) do not match. */
const FRAME = /^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/;

const LIBRARY = /(^|\/)node_modules\//;
const TONE = /(^|\/)node_modules\/tone\//;

/** The frames of a V8 stack, innermost first: `[{ fn, url, line, column }]`, `fn` null for an anonymous frame. */
export function parseStack(stackText) {
  if (typeof stackText !== 'string') return [];
  const frames = [];
  for (const text of stackText.split('\n')) {
    const match = FRAME.exec(text);
    if (match) frames.push({ fn: match[1] ?? null, url: match[2], line: Number(match[3]), column: Number(match[4]) });
  }
  return frames;
}

const slashes = (path) => path.replace(/\\/g, '/');

/** The last path segment, with any `?query` dropped. */
const fileOf = (path) => slashes(path).split('?')[0].split('/').pop();

/** `new Kn` → `Kn`, `Object.reserveVoice [as reserve]` → `reserveVoice`, `async run` → `run`; null for no name. */
function cleanName(fn) {
  if (!fn) return null;
  const name = fn.replace(/ \[as [^\]]+\]$/, '').replace(/^(new|async) /, '').split('.').pop();
  return name && name !== '<anonymous>' ? name : null;
}

/** A frame as the tally reads it: where it is (resolved when it can be), whether it is library code, and its label. */
function locate(frame, resolve) {
  const resolved = resolve ? resolve(frame) : null;
  if (resolved) {
    const source = slashes(resolved.source);
    const name = resolved.name ?? cleanName(frame.fn);
    return {
      source,
      library: LIBRARY.test(source),
      label: name ? `${name} (${fileOf(source)})` : `${fileOf(source)}:${resolved.line}`,
    };
  }
  const where = `${fileOf(frame.url)}:${frame.line}:${frame.column}`;
  const name = cleanName(frame.fn);
  return { source: slashes(frame.url), library: LIBRARY.test(slashes(frame.url)), label: name ? `${name} (${where})` : where };
}

/** The maker of one stack and whether it is a frame outside `node_modules` (`attributed`). */
function makerOf(stackText, resolve) {
  const located = parseStack(stackText).map((frame) => locate(frame, resolve));
  const app = located.find((frame) => !frame.library);
  if (app) return { maker: app.label, attributed: true };
  const tone = located.filter((frame) => TONE.test(frame.source)).pop();
  if (tone) return { maker: `${fileOf(tone.source).replace(/\.[^.]+$/, '')} (tone)`, attributed: false };
  return { maker: 'unknown', attributed: false };
}

/**
 * Who made the node this stack was taken at: the first frame outside `node_modules` (`reserveVoice (AudioEngine.ts)`,
 * resolved when a resolver is given, else its raw `fn (file:line:col)`), else the outermost Tone frame's class
 * (`Phaser (tone)`), else `'unknown'`.
 */
export function pickMaker(stackText, resolve) {
  return makerOf(stackText, resolve).maker;
}

/** `[key, count]` pairs, largest first, ties by name. */
const byCount = (map) => [...map].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

/**
 * Tally `{ type, stack }` records by maker. Returns `{ total, attributedShare, makers }`: `makers` is
 * `[{ maker, count, attributed, byType }]`, largest first (ties by name), `byType` its `[class, count]` pairs largest
 * first (ties by name); `attributedShare` the fraction of records made outside `node_modules` (0 for none, not NaN).
 */
export function tallyByMaker(records, resolve) {
  const list = Array.isArray(records) ? records : [];
  const makers = new Map();
  let attributedCount = 0;
  for (const record of list) {
    const { maker, attributed } = makerOf(record?.stack, resolve);
    if (attributed) attributedCount++;
    const entry = makers.get(maker) ?? { attributed, types: new Map() };
    const type = record?.type ?? 'unknown';
    entry.types.set(type, (entry.types.get(type) ?? 0) + 1);
    makers.set(maker, entry);
  }
  const rows = [...makers].map(([maker, { attributed, types }]) => ({
    maker,
    count: [...types.values()].reduce((sum, n) => sum + n, 0),
    attributed,
    byType: byCount(types),
  }));
  rows.sort((a, b) => b.count - a.count || a.maker.localeCompare(b.maker));
  return { total: list.length, attributedShare: list.length ? attributedCount / list.length : 0, makers: rows };
}

/** The table the runner prints: a header with the total and the attributed share, then one line per maker. */
export function formatCensusByMaker(tally) {
  const header = `census by maker (${tally.total} nodes; ${(tally.attributedShare * 100).toFixed(1)}% made outside node_modules)`;
  if (tally.makers.length === 0) return `${header}\n  (no records)`;
  const makerWidth = Math.max(...tally.makers.map((m) => m.maker.length));
  const countWidth = Math.max(...tally.makers.map((m) => String(m.count).length));
  const lines = tally.makers.map((m) => {
    const types = m.byType.map(([type, n]) => `${type} ${n}`).join(' · ');
    return `  ${m.maker.padEnd(makerWidth)}  ${String(m.count).padStart(countWidth)} — ${types}`;
  });
  return [header, ...lines].join('\n');
}
