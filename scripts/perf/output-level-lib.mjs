/**
 * Pure helpers for `npm run perf:level` (scripts/perf/output-level.mjs) — everything that can be decided without a
 * browser: reading the `?debug` overlay's output line and summarising a series of readings per tap. Node built-ins
 * only; no I/O. Unit-tested in output-level-lib.test.mjs; the Chrome/CDP plumbing lives in output-level.mjs.
 * Built for roadmap 54, docs/specs/OUTPUT_HEADROOM.md §5.2.
 */

// ========================================
// THE HUD'S OUTPUT LINE
// ========================================

/** One level token as `hudLines.ts` prints it: `-12.0dB`, `-inf` (silence) or `-` (no reading). */
const LEVEL = String.raw`(-?\d+(?:\.\d+)?dB|-inf|-)`;

/**
 * `out <peak> rms <rms>  pre <peak>  fin <ok|NaN!|->` (src/components/debug/hudLines.ts `outputLine`). No leading
 * anchor: the overlay's `textContent` runs its rows together, so the previous row's `)` sits right before `out`.
 */
const OUTPUT_LINE = new RegExp(String.raw`out ${LEVEL} rms ${LEVEL}\s+pre ${LEVEL}\s+fin (ok|NaN!|-)`);

/** A level token as dB: `-inf` is -Infinity, `-` is null, a rounded `-0.0` is plain 0 (it reached full scale). */
function levelToDb(token) {
  if (token === '-') return null;
  if (token === '-inf') return -Infinity;
  return Number(token.slice(0, -'dB'.length)) + 0;
}

/**
 * Read the master peak, master RMS and pre-chain peak (dB) and the non-finite flag off the overlay's text, or null when
 * the output line is absent (no `?debug`, an older build) or its tokens are not levels. `fin` is `'ok'`, `'NaN!'`, or
 * null for the overlay's dash (neither tap has reported yet).
 */
export function parseOutputFromHud(text) {
  const match = OUTPUT_LINE.exec(text ?? '');
  if (!match) return null;
  const [, outPeak, outRms, prePeak, fin] = match;
  return {
    outPeakDb: levelToDb(outPeak),
    outRmsDb: levelToDb(outRms),
    prePeakDb: levelToDb(prePeak),
    fin: fin === '-' ? null : fin,
  };
}

// ========================================
// THE SUMMARY
// ========================================

const isReading = (value) => typeof value === 'number' && !Number.isNaN(value);
const mean = (values) => (values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null);

/**
 * One tap's statistics over the readings that have a peak (`n`); readings without one are `missing`. A silent reading
 * (-Infinity) counts in `n` and below 0 dB but not in the means, which average finite dB values; `silent` says how many
 * were left out. `atOrAboveZero` counts peaks ≥ 0 dB (full scale or over). `rmsKey`, when given, adds `rmsMean`.
 */
function tapSummary(samples, peakKey, rmsKey) {
  const peaks = samples.map((s) => s[peakKey]).filter(isReading);
  const finitePeaks = peaks.filter(Number.isFinite);
  const atOrAboveZero = peaks.filter((p) => p >= 0).length;
  const summary = {
    n: peaks.length,
    missing: samples.length - peaks.length,
    silent: peaks.length - finitePeaks.length,
    peakMax: peaks.length ? Math.max(...peaks) : null,
    peakMean: mean(finitePeaks),
    atOrAboveZero,
    atOrAboveZeroFraction: peaks.length ? atOrAboveZero / peaks.length : null,
  };
  if (rmsKey) summary.rmsMean = mean(samples.map((s) => s[rmsKey]).filter(Number.isFinite));
  return summary;
}

/**
 * Summarise a probe series (`{ t, outPeakDb, outRmsDb, prePeakDb, fin }[]`, as parseOutputFromHud plus a time) per tap:
 * `out` (master, with an RMS mean) and `pre` (pre-chain), plus how many readings carried each `fin` token.
 */
export function summarizeLevels(samples) {
  return {
    out: tapSummary(samples, 'outPeakDb', 'outRmsDb'),
    pre: tapSummary(samples, 'prePeakDb'),
    fin: {
      ok: samples.filter((s) => s.fin === 'ok').length,
      nonFinite: samples.filter((s) => s.fin === 'NaN!').length,
      none: samples.filter((s) => s.fin !== 'ok' && s.fin !== 'NaN!').length,
    },
  };
}
