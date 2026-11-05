// ========================================
// measureBands — the theme and aspect sketch's harness (docs/tasks/THEME_AND_ASPECTS_REFINEMENT.md T10)
// ========================================
// What the live generators realise under every survivor theme and option, beside the bands the table writes
// (docs/specs/THEME_AND_ASPECTS_REFINEMENT.md §1.6). Not a test: it asserts nothing, because a measurement is not a gate.
// Run it with `npm run sketch:bands` (vitest.sketch.config.ts, which includes only this folder's *.harness.ts), so
// `npm test` never runs it. It writes docs/sketches/data/theme-and-aspect-sketch.json, committed, which
// docs/sketches/theme-and-aspect-sketch.html reads. Re-run it after every retune and commit the JSON with the retune.
//
// The method is the live harness of docs/tasks/EVEN_SEEDED_DRAWS.md T18, committed:
// - The three draw functions are wrapped, and every draw the generators make is recorded per dataId as a fraction of
//   the band handed to the call (a draw over an empty band is skipped). Recorded per theme, for the robots and for the
//   world apart; the option runs are not recorded, they re-draw the same dataIds.
// - Per theme: 300 locales of 12 robots through generateRobotRosterBaseline under withLoading({ theme, aspects: {} }),
//   and 300 style names through generateWorldSeedBaseline. Every band key is then read off the resulting robots and
//   worlds (the readers below): its low, median and high, and for a lit, toggle or pick band the share.
// - Per option, per theme (the override grid's cells): the same 300 rosters through applyDealToBaselines with that one
//   pick, so every robot is dealt it, and the option's keys read off the dealt robots.
// - The timings: per theme, the median of 50 runs after 10 warm-ups, a different world each run, with no draw recorded.
//   The wrappers stay installed, so these are this harness's numbers, not the re-time recipe's (EVEN_SEEDED_DRAWS T0).

// ========================================
// IMPORTS
// ========================================
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import alea from 'alea';
import { createNoise2D, type NoiseFunction2D } from 'simplex-noise';
import { it, vi } from 'vitest';
import { ROBOT_BUS_FILTER_Q } from '@/constants';
import { ASPECT_FAMILIES, ASPECT_FAMILY_IDS, ASPECT_IDS_BY_FAMILY, type AspectFamilyId, type FamilyAspects } from '@/data/bands/aspects';
import type { BandKey, BandTable, RobotBandKey } from '@/data/bands/bandKeys';
import { CLASSIC } from '@/data/bands/classic';
import { withLoading } from '@/data/bands/loadingContext';
import type { LoadingIdentity } from '@/data/bands/loadingIdentity';
import { resolveBands } from '@/data/bands/resolveBands';
import { THEME_IDS, THEMES, themeLights, type ThemeId } from '@/data/bands/themes';
import { OCTAVE_REGISTER_IDS, OCTAVE_REGISTERS } from '@/data/octaveRegisters';
import type { RobotSendField } from '@/data/robotSends';
import { applyDealToBaselines } from '@/systems/aspectDeal';
import {
  generateCompanyRosterBaseline,
  generateRobotRosterBaseline,
  type CompanyRosterBaseline,
  type RobotAudioBaseline,
} from '@/systems/spawnSystem';
import { ROBOT_LFO_TARGET_IDS, type RobotLfoTargetId } from '@/types/lfo';
import { generateWorldSeedBaseline, type WorldSeedBaseline } from '@/utils/seedBaseline';

// ========================================
// THE DRAW RECORDER
// ========================================

/** Where the wrapped draws write: a log per dataId while a sink is set, nothing while it is null. Hoisted, because the
 *  mock factory below runs before the imports. */
const recorder = vi.hoisted(() => ({
  sink: null as Map<string, { fn: string; fractions: number[] }> | null,
}));

vi.mock('@/utils/getSeededVal', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/getSeededVal')>();
  type Draw = typeof actual.getSeededVal;
  // A draw through the real function, recorded as a fraction of the band the caller handed in. The module's own
  // internal calls (the even draw's three plain samples, the centred draw's two even ones) bypass these wrappers, so
  // every recorded draw is one a generator made.
  const wrap =
    (fn: string, real: Draw): Draw =>
    (noiseMap, dataId, offset = 0, min = 0, max = 1) => {
      const value = real(noiseMap, dataId, offset, min, max);
      const sink = recorder.sink;
      if (sink && max > min) {
        let log = sink.get(dataId);
        if (!log) sink.set(dataId, (log = { fn, fractions: [] }));
        log.fractions.push((value - min) / (max - min));
      }
      return value;
    };
  return {
    ...actual,
    getSeededVal: wrap('plain', actual.getSeededVal),
    getUniformSeededVal: wrap('uniform', actual.getUniformSeededVal),
    getCentredSeededVal: wrap('centred', actual.getCentredSeededVal),
  };
});

// ========================================
// CONSTANTS
// ========================================

const WORLDS = 300;
const ROBOTS = 12;
const STYLES = 300;
const TIMING_RUNS = 50;
const TIMING_WARMUPS = 10;

const ROBOT_IDS = Array.from({ length: ROBOTS }, (_, i) => `sketch-robot-${i}`);

/** From the repo root, where `npm run sketch:bands` runs (under jsdom, import.meta.url is not a file URL). */
const OUTPUT = resolve('docs/sketches/data/theme-and-aspect-sketch.json');

/** The same data as a script the page loads with a script tag: a page opened from a checkout (file://) cannot fetch a
 *  JSON file in Chrome or Firefox, and the page must work with no server. The JSON is the record; this is its carrier. */
const OUTPUT_SCRIPT = resolve('docs/sketches/data/theme-and-aspect-sketch.data.js');

/** The colour nodes' and dry-chain pedals' Mix rows: a dark node or pedal seeds a Mix of 0, so the row is read as a lit
 *  share and the lit worlds' values (the band is a plain range; the lit roll is the character's or the pedal's own). */
const LIT_WET_KEYS: ReadonlySet<BandKey> = new Set<BandKey>([
  'distortion.wet',
  'chebyshev.wet',
  'bitCrusher.wet',
  'autoWah.wet',
  'phaser.wet',
  'tremolo.wet',
  'vibrato.wet',
]);

// ========================================
// THE READERS
// ========================================

/** One reading of a band key off a robot or a world: a value, a share flag, or a pick. `flag` is true when the reading
 *  counts towards the band's share: lit for a lit band or a Mix row, off for a toggle. */
interface Sample {
  v?: number;
  flag?: boolean;
  pick?: string;
}

type Reader<T> = (source: T) => Sample[];

/** A lit reading: the value only when lit, since a dark field's value is its plain one (0, a linear curve). */
const lit = (on: boolean, v: number): Sample => (on ? { flag: true, v } : { flag: false });

/** A toggle reading: off is the share, an on value is a value. */
const toggle = (t: { active: boolean; value: number }): Sample =>
  t.active ? { flag: false, v: t.value } : { flag: true };

/** An accent robot carries its resonant bus filter's Q from the accent band; every other robot the fixed open Q. No
 *  band reaches the open Q (Classic's accent band is 3-8, the columns' higher), so the Q tells the two apart. */
const isAccent = (r: RobotAudioBaseline): boolean => r.audioAttributes.filterQ !== ROBOT_BUS_FILTER_Q;

const linksOf = (r: RobotAudioBaseline, match: (target: RobotLfoTargetId) => boolean): Sample[] =>
  ROBOT_LFO_TARGET_IDS.filter(match).map((target) => lit(r.lfoLinks[target].lane !== null, r.lfoLinks[target].depth));

/** The Signature Array's layers (every seeded robot has three; the type leaves them optional). */
const layersOf = (r: RobotAudioBaseline) => r.audioAttributes.layers ?? [];

const registerOf =([min, max]: readonly [number, number]): string =>
  OCTAVE_REGISTER_IDS.find((id) => OCTAVE_REGISTERS[id][0] === min && OCTAVE_REGISTERS[id][1] === max) ?? `${min}-${max}`;

type RobotKey = RobotBandKey | RobotSendField;

/** Every robot band key's reader, over the robot's seeded fields (a copied robot included: its values came from the
 *  same bands). A record over every key, so a new robot key does not compile until it is read. A shaped stage reads its
 *  own band and the plain stage the rest; the open cutoff reads the open robots and the accent rows the accent ones;
 *  the layer gain's share is over the two layers that can go quiet, its values over every sounding layer. */
const ROBOT_READERS: Record<RobotKey, Reader<RobotAudioBaseline>> = {
  'robot.attack': (r) => (r.audioAttributes.adsr.attackCurve === 'linear' ? [{ v: r.audioAttributes.adsr.attack }] : []),
  'robot.shapedAttack': (r) => [lit(r.audioAttributes.adsr.attackCurve !== 'linear', r.audioAttributes.adsr.attack)],
  'robot.decay': (r) => [{ v: r.audioAttributes.adsr.decay }],
  'robot.sustain': (r) => [{ v: r.audioAttributes.adsr.sustain }],
  'robot.release': (r) => (r.audioAttributes.adsr.releaseCurve === 'linear' ? [{ v: r.audioAttributes.adsr.release }] : []),
  'robot.shapedRelease': (r) => [lit(r.audioAttributes.adsr.releaseCurve !== 'linear', r.audioAttributes.adsr.release)],
  'robot.filterFreq': (r) => (isAccent(r) ? [] : [{ v: r.audioAttributes.filterFreq }]),
  'robot.accentFilterFreq': (r) => [lit(isAccent(r), r.audioAttributes.filterFreq)],
  'robot.accentFilterQ': (r) => (isAccent(r) ? [{ v: r.audioAttributes.filterQ }] : []),
  'robot.layerGain': (r) => {
    const [base, ...rest] = layersOf(r);
    return [...(base ? [{ v: base.gain }] : []), ...rest.map((layer) => lit(layer.gain > 0, layer.gain))];
  },
  'robot.detune': (r) => layersOf(r).map((layer) => ({ v: layer.detune })),
  'robot.masterVolume': (r) => [{ v: r.masterVolume }],
  'robot.rhythmicDensity': (r) => [{ v: r.rhythmicDensity }],
  'robot.pitchRepeat': (r) => [{ v: r.pitchRepeat }],
  'robot.dynamics': (r) => [{ v: r.dynamics }],
  'robot.rests': (r) => [{ v: r.rests }],
  'robot.accents': (r) => [{ v: r.accents }],
  'robot.rhythmicMotifLength': (r) => [toggle(r.rhythmicMotifLength)],
  'robot.noteVariance': (r) => [toggle(r.noteVariance)],
  'robot.portamento': (r) => {
    const glide = r.audioAttributes.portamento ?? 0;
    return [lit(glide > 0, glide)];
  },
  'robot.lfoGainDepth': (r) => linksOf(r, (target) => target.endsWith('.gain')),
  'robot.lfoDetuneDepth': (r) => linksOf(r, (target) => target.endsWith('.detune')),
  'robot.lfoBusDepth': (r) => linksOf(r, (target) => target === 'bus.frequency'),
  'robot.waveform': (r) => [r.audioAttributes.waveform, ...layersOf(r).map((layer) => layer.type)].map((pick) => ({ pick })),
  'robot.octaveRegister': (r) => [{ pick: registerOf(r.octaveRange) }],
  // A lit Delay draw can land on 0 (its band starts at 0), so the Delay share reads a hair under its `lit`.
  reverbSend: (r) => [lit(r.reverbSend > 0, r.reverbSend)],
  delaySend: (r) => [lit(r.delaySend > 0, r.delaySend)],
  gritSend: (r) => [lit(r.gritSend > 0, r.gritSend)],
  shimmerSend: (r) => [lit(r.shimmerSend > 0, r.shimmerSend)],
  doubleSend: (r) => [lit(r.doubleSend > 0, r.doubleSend)],
};

function isRobotKey(key: BandKey): key is RobotKey {
  return key in ROBOT_READERS;
}

/** A world key's reader: the tempo, Humanize, the low-pass tie (lit when it has a lane), and every global row off its
 *  block in the captured Audio Rig - a Mix row of a node or pedal as a lit share, the shift as its magnitude (its band
 *  is one; the sign is its own draw). */
function worldReader(key: Exclude<BandKey, RobotKey>): Reader<WorldSeedBaseline> {
  if (key === 'bpm') return (w) => [{ v: w.bpm }];
  if (key === 'humanize') return (w) => [{ v: w.humanize }];
  if (key === 'lfoLink.lpf.frequency') {
    return (w) => [lit(w.globalLfoLinks['lpf.frequency'].lane !== null, w.globalLfoLinks['lpf.frequency'].depth)];
  }
  const [block, param] = key.split('.');
  return (w) => {
    const value = (w.globalAudio as unknown as Record<string, Record<string, number>>)[block][param];
    if (LIT_WET_KEYS.has(key)) return [lit(value > 0, value)];
    return [{ v: key === 'frequencyShifter.shift' ? Math.abs(value) : value }];
  };
}

// ========================================
// THE SUMMARIES
// ========================================

/** What the generators realised for one band key: how many readings, the low, median and high of the values, and the
 *  share of flagged readings (lit, or off for a toggle) or each pick's share. A key with no reading (no robot drew it,
 *  e.g. a shaped stage under a lit of 0) has n 0 and nothing else. */
interface Realised {
  n: number;
  low?: number;
  median?: number;
  high?: number;
  share?: number;
  picks?: Record<string, number>;
}

/** Four significant figures: the JSON stays readable and its diff after a retune shows what moved. */
const sig = (x: number): number => Number(x.toPrecision(4));

const median = (sorted: readonly number[]): number => {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

function realise(samples: readonly Sample[]): Realised {
  const out: Realised = { n: samples.length };
  const values = samples.flatMap((s) => (s.v === undefined ? [] : [s.v])).sort((a, b) => a - b);
  if (values.length > 0) {
    out.low = sig(values[0]);
    out.median = sig(median(values));
    out.high = sig(values[values.length - 1]);
  }
  const flags = samples.filter((s) => s.flag !== undefined);
  if (flags.length > 0) out.share = sig(flags.filter((s) => s.flag).length / flags.length);
  const picks = samples.flatMap((s) => (s.pick === undefined ? [] : [s.pick]));
  if (picks.length > 0) {
    out.picks = {};
    for (const pick of picks) out.picks[pick] = (out.picks[pick] ?? 0) + 1;
    for (const pick of Object.keys(out.picks)) out.picks[pick] = sig(out.picks[pick] / picks.length);
  }
  return out;
}

function realiseKeys(keys: readonly BandKey[], robots: readonly RobotAudioBaseline[], worlds: readonly WorldSeedBaseline[]) {
  const out: Partial<Record<BandKey, Realised>> = {};
  for (const key of keys) {
    out[key] = isRobotKey(key)
      ? realise(robots.flatMap(ROBOT_READERS[key]))
      : realise(worlds.flatMap(worldReader(key)));
  }
  return out;
}

/** One dataId's recorded draws: the draw function, how many, the low, median and high fraction of the band, the share
 *  in the outer tenths (about 20 % on an even draw, 4 % on a centred one) and how many distinct values. */
interface DrawSummary {
  fn: string;
  n: number;
  low: number;
  median: number;
  high: number;
  outer: number;
  distinct: number;
}

function summariseDraws(log: ReadonlyMap<string, { fn: string; fractions: number[] }>): Record<string, DrawSummary> {
  const out: Record<string, DrawSummary> = {};
  for (const dataId of [...log.keys()].sort()) {
    const { fn, fractions } = log.get(dataId)!;
    const sorted = [...fractions].sort((a, b) => a - b);
    out[dataId] = {
      fn,
      n: sorted.length,
      low: sig(sorted[0]),
      median: sig(median(sorted)),
      high: sig(sorted[sorted.length - 1]),
      outer: sig(sorted.filter((f) => f < 0.1 || f >= 0.9).length / sorted.length),
      distinct: new Set(sorted).size,
    };
  }
  return out;
}

/** The median time of `run` in ms over TIMING_RUNS calls after TIMING_WARMUPS, each call handed its run index. */
function medianMs(run: (i: number) => void): number {
  for (let i = 0; i < TIMING_WARMUPS; i++) run(i);
  const times: number[] = [];
  for (let i = 0; i < TIMING_RUNS; i++) {
    const start = performance.now();
    run(TIMING_WARMUPS + i);
    times.push(performance.now() - start);
  }
  return sig(median(times.sort((a, b) => a - b)));
}

const columnKeys = (column: Partial<BandTable>): BandKey[] => Object.keys(column) as BandKey[];

const pickBands = (table: BandTable, keys: readonly BandKey[]): Partial<BandTable> =>
  Object.fromEntries(keys.map((key) => [key, table[key]])) as Partial<BandTable>;

/** One family's option column, read through the family's own options (resolveBands' columnOf does the same). */
const optionColumn = (family: AspectFamilyId, option: string): Partial<BandTable> =>
  (ASPECT_FAMILIES[family].options as Readonly<Record<string, Partial<BandTable>>>)[option];

// ========================================
// THE RUN
// ========================================

/** A turn of the event loop. The run is minutes of synchronous work, and a worker that never yields misses vitest's
 *  RPC calls ("Timeout calling onTaskUpdate", which fails the run after the data is written); yielding at each step
 *  lets them through. A harness's wait, not app timing. */
const yieldToWorker = () => new Promise<void>((done) => setTimeout(done, 0));

it('measures every survivor theme and option and writes the sketch data', async () => {
  const started = performance.now();
  const noiseMaps: NoiseFunction2D[] = Array.from({ length: WORLDS }, (_, i) => createNoise2D(alea(`sketch-world-${i}`)));
  const companies: CompanyRosterBaseline[][] = noiseMaps.map((noiseMap) => generateCompanyRosterBaseline(noiseMap, ROBOT_IDS));
  const allKeys = Object.keys(CLASSIC) as BandKey[];

  const themes: Record<string, unknown> = {};
  const options: Record<string, Record<string, { moves: BandKey[]; written: Partial<BandTable>; realised: Record<string, unknown> }>> = {};
  for (const family of ASPECT_FAMILY_IDS) {
    options[family] = {};
    for (const option of ASPECT_IDS_BY_FAMILY[family]) {
      const moves = columnKeys(optionColumn(family, option));
      const written = pickBands(resolveBands('classic', { [family]: option } as FamilyAspects), moves);
      options[family][option] = { moves, written, realised: {} };
    }
  }
  const timings: Record<string, { robotRosterMs: number; worldSeedMs: number }> = {};

  for (const theme of THEME_IDS) {
    const identity: LoadingIdentity = { theme, aspects: {} };

    const robotDraws = new Map<string, { fn: string; fractions: number[] }>();
    recorder.sink = robotDraws;
    const rosters = withLoading(identity, () => noiseMaps.map((noiseMap) => generateRobotRosterBaseline(noiseMap, ROBOTS)));
    const worldDraws = new Map<string, { fn: string; fractions: number[] }>();
    recorder.sink = worldDraws;
    const worlds = Array.from({ length: STYLES }, (_, i) =>
      generateWorldSeedBaseline({ attenuationStyleName: `sketch-style-${i}`, ...identity }),
    );
    recorder.sink = null;
    await yieldToWorker();

    const column = THEMES[theme];
    themes[theme] = {
      moves: columnKeys(column),
      lights: [...themeLights(column)],
      written: resolveBands(theme, {}),
      realised: realiseKeys(allKeys, rosters.flat(), worlds),
      overrideGrid: Object.fromEntries(
        ASPECT_FAMILY_IDS.map((family) => [
          family,
          columnKeys(column).filter((key) => (ASPECT_FAMILIES[family].keys as readonly BandKey[]).includes(key)),
        ]),
      ),
      draws: { robots: summariseDraws(robotDraws), world: summariseDraws(worldDraws) },
    };

    for (const family of ASPECT_FAMILY_IDS) {
      for (const option of ASPECT_IDS_BY_FAMILY[family]) {
        const entry = options[family][option];
        const dealing: LoadingIdentity = { theme, aspects: { [family]: [option] } };
        const dealt = noiseMaps.flatMap((noiseMap, w) =>
          applyDealToBaselines(rosters[w], ROBOT_IDS, companies[w], dealing, noiseMap),
        );
        entry.realised[theme] = realiseKeys(entry.moves, dealt, []);
        await yieldToWorker();
      }
    }

    timings[theme] = {
      robotRosterMs: withLoading(identity, () => medianMs((i) => generateRobotRosterBaseline(noiseMaps[i % WORLDS], ROBOTS))),
      worldSeedMs: medianMs((i) => generateWorldSeedBaseline({ attenuationStyleName: `sketch-time-${i}`, ...identity })),
    };
    console.log(`measureBands: ${theme} done, ${((performance.now() - started) / 1000).toFixed(0)} s`);
    await yieldToWorker();
  }

  const data = {
    meta: {
      generated: new Date().toISOString(),
      commit: execSync('git rev-parse --short HEAD').toString().trim(),
      worlds: WORLDS,
      robotsPerWorld: ROBOTS,
      styles: STYLES,
      timing: { runs: TIMING_RUNS, warmups: TIMING_WARMUPS },
    },
    themeIds: THEME_IDS satisfies readonly ThemeId[],
    families: Object.fromEntries(
      ASPECT_FAMILY_IDS.map((family) => [family, { keys: ASPECT_FAMILIES[family].keys, options: ASPECT_IDS_BY_FAMILY[family] }]),
    ),
    themes,
    options,
    timings,
  };
  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, `${JSON.stringify(data, null, 1)}\n`);
  writeFileSync(
    OUTPUT_SCRIPT,
    `// Written by scripts/sketch/measureBands.harness.ts (npm run sketch:bands): theme-and-aspect-sketch.json as a script.\n` +
      `window.THEME_AND_ASPECT_SKETCH = ${JSON.stringify(data)};\n`,
  );
  console.log(`measureBands: wrote ${OUTPUT} in ${((performance.now() - started) / 1000).toFixed(0)} s`);
});
