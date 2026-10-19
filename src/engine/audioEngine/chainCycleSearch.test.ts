// ========================================
// IMPORTS
// ========================================
import { describe, it, expect } from 'vitest';

import { createDetectCycles } from 'standardized-audio-context/build/es2019/factories/detect-cycles.js';

// The library behaviour the global chain's cycle-search cuts rely on (globalFx.ts CHAIN_CUT_OPTIONS, docs/specs/
// GLOBAL_PEDALS.md §8). Tone's standardized-audio-context runs detectCycles on every connect and disconnect: it walks
// EVERY path downstream of the destination, with no memo, and stops only at a node that has a `delayTime`. With the
// Global Pedals that walk took an estimated ~14 minutes at power-on until two zero-delay Delay nodes cut it. This drives
// the library's REAL detectCycles over fake graphs, so an upgrade that changes either half (the search stops being
// exponential, or stops stopping at a delay) fails here rather than as a silent power-on hang. If it fails, re-measure
// power-on with the headless hang probe before keeping or removing the cuts.

// ========================================
// HELPERS
// ========================================

type FakeNode = { context: object; name: string; delayTime?: number; outputs: Set<[FakeNode, number, number]> };

const CONTEXT = {};
const node = (name: string, delay = false): FakeNode => ({
  context: CONTEXT,
  name,
  ...(delay ? { delayTime: 0 } : {}),
  outputs: new Set(),
});
const connect = (from: FakeNode, to: FakeNode) => from.outputs.add([to, 0, 0]);

/** detectCycles over the fake graph, with a count of the nodes it expanded. */
function search() {
  let visits = 0;
  const detectCycles = createDetectCycles(
    new WeakMap() as never,
    ((n: FakeNode) => {
      visits += 1;
      return { outputs: n.outputs };
    }) as never,
    (() => {
      throw new Error('an AudioParam lookup was not expected');
    }) as never,
  );
  return {
    run: (chain: FakeNode[], next: FakeNode) => detectCycles(chain as never, next as never) as unknown as FakeNode[][],
    visits: () => visits,
  };
}

/** `stages` diamonds in series (each splits in two and rejoins, as a Tone effect's dry and wet paths do); returns the
 *  first and last node. A walk from the front sees 2^stages paths. */
function diamonds(stages: number, prefix: string): { first: FakeNode; last: FakeNode } {
  const first = node(`${prefix}0`);
  let join = first;
  for (let i = 1; i <= stages; i++) {
    const dry = node(`${prefix}${i}dry`);
    const wet = node(`${prefix}${i}wet`);
    const next = node(`${prefix}${i}`);
    connect(join, dry);
    connect(join, wet);
    connect(dry, next);
    connect(wet, next);
    join = next;
  }
  return { first, last: join };
}

// ========================================
// TESTS
// ========================================

describe("standardized-audio-context's detectCycles (the behaviour the chain cuts rely on)", () => {
  it('walks every path downstream: ten split-and-rejoin stages cost over a thousand expansions', () => {
    const { first } = diamonds(10, 's');
    const source = node('source');
    const probe = search();
    expect(probe.run([source], first)).toEqual([]);
    // 2^10 paths reach the last join; each path expands every node on it.
    expect(probe.visits()).toBeGreaterThan(2 ** 10);
  });

  it('stops at once at a node that has a delayTime: a connect into a cut walks nothing behind it', () => {
    const cut = node('cut', true);
    connect(cut, diamonds(10, 's').first);
    const probe = search();
    expect(probe.run([node('source')], cut)).toEqual([]);
    expect(probe.visits()).toBe(0);
  });

  it('a cut between two runs of stages bounds the walk to the run before it', () => {
    const before = diamonds(8, 'a');
    const after = diamonds(8, 'b');
    const cut = node('cut', true);
    connect(before.last, cut);
    connect(cut, after.first);
    const cutProbe = search();
    cutProbe.run([node('source')], before.first);

    const before2 = diamonds(8, 'c');
    const after2 = diamonds(8, 'd');
    connect(before2.last, after2.first);
    const openProbe = search();
    openProbe.run([node('source')], before2.first);

    // Without the cut the two runs multiply (2^16 paths); with it the walk ends at the cut (2^8).
    expect(openProbe.visits()).toBeGreaterThan(cutProbe.visits() * 100);
  });

  it('still reports a real cycle that has no delay in it (the search the cuts shorten is the real one)', () => {
    const a = node('a');
    const b = node('b');
    connect(a, b);
    connect(b, a);
    const cycles = search().run([a], b);
    expect(cycles.map((cycle) => cycle.map((n) => n.name))).toEqual([['a', 'b']]);
  });
});
