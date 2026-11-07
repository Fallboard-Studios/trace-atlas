// Tests for the pure tally behind `npm run perf:audio-census` (scripts/perf/audio-census.mjs, backlog 67 T1).
// The Chrome/CDP plumbing and the source-map lookup are not unit-tested; they are verified by a real run.
import { describe, expect, it } from 'vitest';

import { formatCensusByMaker, parseStack, pickMaker, tallyByMaker } from './audio-census-lib.mjs';

// ========================================
// HELPERS
// ========================================

const BUNDLE = 'http://localhost:4173/trace-atlas/assets/index-abc123.js';

/** One V8 stack as `new Error().stack` prints it, innermost frame first, from `[fn, column]` pairs in BUNDLE line 1. */
const stack = (...frames) => ['Error', ...frames.map(([fn, column]) => `    at ${fn} (${BUNDLE}:1:${column})`)].join('\n');

/**
 * A fake source-map lookup over BUNDLE line 1, keyed by column: what the runner's resolver answers. Columns not in
 * the table (and every other file) cannot be mapped, so they keep their raw location.
 */
const MAP = {
  100: { source: '../../node_modules/standardized-audio-context/build/es2019/factories/native-gain-node-factory.js', line: 4, column: 2 },
  200: { source: '../../node_modules/standardized-audio-context/build/es2019/factories/native-constant-source-node-factory.js', line: 7, column: 2 },
  300: { source: '../../node_modules/tone/build/esm/core/context/Gain.js', line: 30, column: 8 },
  400: { source: '../../node_modules/tone/build/esm/signal/ToneConstantSource.js', line: 22, column: 8 },
  500: { source: '../../node_modules/tone/build/esm/component/channel/CrossFade.js', line: 60, column: 8 },
  600: { source: '../../node_modules/tone/build/esm/effect/Phaser.js', line: 40, column: 8 },
  700: { source: '../../src/engine/AudioEngine.ts', line: 812, column: 10, name: 'reserveVoice' },
  800: { source: '../../src/engine/audioEngine/bypassCell.ts', line: 120, column: 6, name: 'buildCell' },
  900: { source: '../../src/systems/spawnSystem.ts', line: 50, column: 4, name: 'spawnRobot' },
  950: { source: '../../src/engine/audioEngine/globalFx.ts', line: 210, column: 4 },
};
const resolve = (frame) => (frame.url === BUNDLE && frame.line === 1 ? MAP[frame.column] ?? null : null);

/**
 * Six records: three made by reserveVoice (two Gains through Tone's Gain, a ConstantSource through Tone's
 * ToneConstantSource), two Gains made by buildCell, and one Gain whose stack is Tone's alone (a Phaser's CrossFade,
 * the app frames cut off), so it goes to the outermost Tone class, Phaser.
 */
function fixture() {
  const viaReserve = (native, tone) => stack(['Hn', native], ['new Kn', tone], ['Object.reserveVoice', 700], ['Ot', 900]);
  return [
    { type: 'Gain', stack: viaReserve(100, 300) },
    { type: 'Gain', stack: viaReserve(100, 300) },
    { type: 'ConstantSource', stack: viaReserve(200, 400) },
    { type: 'Gain', stack: stack(['Hn', 100], ['new Kn', 300], ['Xe', 800], ['Ze', 950]) },
    { type: 'Gain', stack: stack(['Hn', 100], ['new Kn', 300], ['Xe', 800], ['Ze', 950]) },
    { type: 'Gain', stack: stack(['Hn', 100], ['new Kn', 300], ['new Qr', 500], ['new Wa', 600]) },
  ];
}

// ========================================
// parseStack
// ========================================

describe('parseStack', () => {
  it('reads each V8 frame as its function, url, line and column, innermost first, skipping the message line', () => {
    expect(parseStack(stack(['new Kn', 300], ['Object.reserveVoice', 700]))).toEqual([
      { fn: 'new Kn', url: BUNDLE, line: 1, column: 300 },
      { fn: 'Object.reserveVoice', url: BUNDLE, line: 1, column: 700 },
    ]);
  });

  it('reads an anonymous frame with no function name', () => {
    expect(parseStack(`Error\n    at ${BUNDLE}:3:40`)).toEqual([{ fn: null, url: BUNDLE, line: 3, column: 40 }]);
  });

  it('skips frames with no location, such as a built-in', () => {
    const text = `Error\n    at Array.forEach (<anonymous>)\n    at Xe (${BUNDLE}:1:800)\n    at native`;
    expect(parseStack(text)).toEqual([{ fn: 'Xe', url: BUNDLE, line: 1, column: 800 }]);
  });

  it('gives no frames for an empty, missing or non-string stack', () => {
    expect(parseStack('')).toEqual([]);
    expect(parseStack(undefined)).toEqual([]);
    expect(parseStack(42)).toEqual([]);
  });
});

// ========================================
// pickMaker
// ========================================

describe('pickMaker', () => {
  it('names the first frame outside node_modules by its original function and file', () => {
    expect(pickMaker(fixture()[0].stack, resolve)).toBe('reserveVoice (AudioEngine.ts)');
  });

  it('skips the library frames above the app frame, Tone and standardized-audio-context alike', () => {
    expect(pickMaker(fixture()[3].stack, resolve)).toBe('buildCell (bypassCell.ts)');
  });

  it('uses the frame name, cleaned, when the resolver gives no original name', () => {
    expect(pickMaker(stack(['Hn', 100], ['Object.updateBus', 950]), resolve)).toBe('updateBus (globalFx.ts)');
  });

  it('prefers the [as …] alias V8 prints: the property a minified function was called through keeps its name', () => {
    const text = stack(['Hn', 100], ['Object.Jce [as createCompositeVoice]', 950]);
    expect(pickMaker(text, resolve)).toBe('createCompositeVoice (globalFx.ts)');
  });

  it('names an anonymous app frame by the nearest named frame out in the same file, its encloser', () => {
    // A forEach callback: the arrow (globalFx.ts) is called by forEach (no location), then by the function holding it.
    const text = [
      'Error',
      `    at Hn (${BUNDLE}:1:100)`,
      `    at ${BUNDLE}:1:951`,
      '    at Array.forEach (<anonymous>)',
      `    at Ot (${BUNDLE}:1:900)`,
      `    at Object.Yle [as buildGlobalFxChain] (${BUNDLE}:1:952)`,
    ].join('\n');
    const twoInFx = (frame, caller) => {
      if (frame.column === 951 || frame.column === 952) return { ...MAP[950], line: frame.column - 740 };
      return resolve(frame, caller);
    };
    expect(pickMaker(text, twoInFx)).toBe('buildGlobalFxChain (globalFx.ts)');
  });

  it('passes over a nested anonymous frame on the way out to the named encloser', () => {
    const text = ['Error', `    at Hn (${BUNDLE}:1:100)`, `    at ${BUNDLE}:1:951`, `    at ${BUNDLE}:1:953`, `    at Object.Yle [as buildGlobalFxChain] (${BUNDLE}:1:952)`].join('\n');
    const threeInFx = (frame, caller) => (frame.column > 950 ? { ...MAP[950], line: frame.column - 740 } : resolve(frame, caller));
    expect(pickMaker(text, threeInFx)).toBe('buildGlobalFxChain (globalFx.ts)');
  });

  it('keeps an anonymous app frame as its file and line when no named frame out shares its file', () => {
    const text = ['Error', `    at Hn (${BUNDLE}:1:100)`, `    at ${BUNDLE}:1:950`, `    at Ot (${BUNDLE}:1:900)`].join('\n');
    expect(pickMaker(text, resolve)).toBe('globalFx.ts:210');
  });

  it('hands the resolver each frame with its caller, the next frame out, and null for the outermost', () => {
    const seen = [];
    const spy = (frame, caller) => {
      seen.push([frame.column, caller?.column ?? null]);
      return resolve(frame);
    };
    pickMaker(stack(['Hn', 100], ['Xe', 800], ['Ze', 950]), spy);
    expect(seen).toEqual([[100, 800], [800, 950], [950, null]]);
  });

  it('takes a minified function name from its call site when the resolver reads it there', () => {
    // A minified bundle keeps the original name at the call, so the runner names a frame from its caller's entry.
    const callSite = (frame, caller) => {
      const entry = resolve(frame);
      return entry && caller?.column === 950 ? { ...entry, name: 'buildCell' } : entry;
    };
    expect(pickMaker(stack(['Hn', 100], ['Xe', 900], ['Ze', 950]), callSite)).toBe('buildCell (spawnSystem.ts)');
  });

  it('drops a constructor or async prefix from the frame name', () => {
    expect(pickMaker(stack(['new LfoBank', 950]), resolve)).toBe('LfoBank (globalFx.ts)');
    expect(pickMaker(stack(['async loadInstruments', 950]), resolve)).toBe('loadInstruments (globalFx.ts)');
  });

  it('names an app frame with neither name by its file and line', () => {
    expect(pickMaker(`Error\n    at ${BUNDLE}:1:950`, resolve)).toBe('globalFx.ts:210');
  });

  it('gives a Tone-only stack to its outermost Tone class, by the Tone file name', () => {
    expect(pickMaker(fixture()[5].stack, resolve)).toBe('Phaser (tone)');
  });

  it('gives a stack with no app frame and no Tone frame to unknown', () => {
    expect(pickMaker(stack(['Hn', 100], ['Gn', 200]), resolve)).toBe('unknown');
    expect(pickMaker('Error', resolve)).toBe('unknown');
  });

  it('keeps the raw location of a frame the resolver cannot map', () => {
    const text = `Error\n    at Hn (${BUNDLE}:1:100)\n    at Zt (http://localhost:4173/trace-atlas/assets/worker-xyz.js:3:40)`;
    expect(pickMaker(text, resolve)).toBe('Zt (worker-xyz.js:3:40)');
  });

  it('reads raw frames by their URL when no resolver is given: node_modules is still library code', () => {
    const text = [
      'Error',
      '    at new Gain (http://localhost:5173/trace-atlas/node_modules/.vite/deps/tone.js?v=1a2b:9000:12)',
      '    at Object.reserveVoice (http://localhost:5173/trace-atlas/src/engine/AudioEngine.ts?t=99:812:10)',
    ].join('\n');
    expect(pickMaker(text)).toBe('reserveVoice (AudioEngine.ts:812:10)');
  });

  it('treats a minified bundle frame as the maker when no resolver is given', () => {
    expect(pickMaker(fixture()[0].stack)).toBe('Hn (index-abc123.js:1:100)');
  });

  it('reads Windows separators in a resolved source', () => {
    const winResolve = () => ({ source: 'C:\\repo\\src\\engine\\AudioEngine.ts', line: 1, column: 1, name: 'reserveVoice' });
    expect(pickMaker(stack(['Xe', 1]), winResolve)).toBe('reserveVoice (AudioEngine.ts)');
  });
});

// ========================================
// tallyByMaker
// ========================================

describe('tallyByMaker', () => {
  it('tallies class by maker, makers largest first, classes largest first, with the attributed share', () => {
    expect(tallyByMaker(fixture(), resolve)).toEqual({
      total: 6,
      attributedShare: 5 / 6,
      makers: [
        { maker: 'reserveVoice (AudioEngine.ts)', count: 3, attributed: true, byType: [['Gain', 2], ['ConstantSource', 1]] },
        { maker: 'buildCell (bypassCell.ts)', count: 2, attributed: true, byType: [['Gain', 2]] },
        { maker: 'Phaser (tone)', count: 1, attributed: false, byType: [['Gain', 1]] },
      ],
    });
  });

  it('breaks a tie in count by maker name, and a tie in class count by class name', () => {
    // spawnRobot is seen first, so only the name rule puts buildCell ahead of it.
    const records = [
      { type: 'Gain', stack: stack(['Ot', 900]) },
      { type: 'Delay', stack: stack(['Ot', 900]) },
      { type: 'Oscillator', stack: stack(['Xe', 800]) },
      { type: 'Gain', stack: stack(['Xe', 800]) },
    ];
    const { makers } = tallyByMaker(records, resolve);
    expect(makers.map((m) => m.maker)).toEqual(['buildCell (bypassCell.ts)', 'spawnRobot (spawnSystem.ts)']);
    expect(makers[0].byType).toEqual([['Gain', 1], ['Oscillator', 1]]);
  });

  it('counts a record with no type as unknown', () => {
    const { makers } = tallyByMaker([{ stack: stack(['Xe', 800]) }], resolve);
    expect(makers[0].byType).toEqual([['unknown', 1]]);
  });

  it('gives total 0 and share 0, not NaN, for an empty or missing input', () => {
    for (const records of [[], undefined, null]) {
      expect(tallyByMaker(records, resolve)).toEqual({ total: 0, attributedShare: 0, makers: [] });
    }
  });
});

// ========================================
// formatCensusByMaker
// ========================================

describe('formatCensusByMaker', () => {
  it('prints a header with the total and the attributed share, then one line per maker, classes largest first', () => {
    const lines = formatCensusByMaker(tallyByMaker(fixture(), resolve)).split('\n');
    expect(lines[0]).toBe('census by maker (6 nodes; 83.3% made outside node_modules)');
    expect(lines.slice(1)).toEqual([
      '  reserveVoice (AudioEngine.ts)  3 — Gain 2 · ConstantSource 1',
      '  buildCell (bypassCell.ts)      2 — Gain 2',
      '  Phaser (tone)                  1 — Gain 1',
    ]);
  });

  it('right-aligns the counts when they differ in width', () => {
    const records = [...Array(12)].map(() => ({ type: 'Gain', stack: stack(['Xe', 800]) }));
    records.push({ type: 'Gain', stack: stack(['Ot', 900]) });
    const lines = formatCensusByMaker(tallyByMaker(records, resolve)).split('\n');
    expect(lines[1]).toBe('  buildCell (bypassCell.ts)    12 — Gain 12');
    expect(lines[2]).toBe('  spawnRobot (spawnSystem.ts)   1 — Gain 1');
  });

  it('prints an empty table with total 0 for no records, never NaN', () => {
    const text = formatCensusByMaker(tallyByMaker([], resolve));
    expect(text).toBe('census by maker (0 nodes; 0.0% made outside node_modules)\n  (no records)');
  });
});
