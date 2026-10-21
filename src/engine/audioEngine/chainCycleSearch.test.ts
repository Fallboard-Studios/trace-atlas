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
//
// The same behaviour protects a third thing: the ten bypass cells (globalFx.ts buildCell, docs/specs/
// DARK_EFFECT_BYPASS.md assumption 3). Each cell ends in its own zero-delay cut, so a connect anywhere in the chain (a
// crossing's two edges, a Phaser rebuild, a Decay flip) walks one cell and stops, however many cells are lit. Without
// those cuts every lit cell multiplies the walk.

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

type FakeCell = { in: FakeNode; effect: FakeNode; wet: FakeNode; cut: FakeNode };

/** One bypass cell as globalFx.ts builds it: `in` -> `dry` -> `cut` always, and while lit `in` -> effect -> `wet` ->
 *  `cut`, the effect itself one split-and-rejoin stage (a Tone effect's own dry and wet paths). Its `cut` is a
 *  zero-delay Delay when `withCut`, a plain node otherwise. */
function bypassCell(prefix: string, lit: boolean, withCut: boolean): FakeCell {
  const input = node(`${prefix}in`);
  const dry = node(`${prefix}dry`);
  const wet = node(`${prefix}wet`);
  const cut = node(`${prefix}cut`, withCut);
  const effect = diamonds(1, `${prefix}fx`);
  connect(input, dry);
  connect(dry, cut);
  connect(wet, cut);
  if (lit) {
    connect(input, effect.first);
    connect(effect.last, wet);
  }
  return { in: input, effect: effect.first, wet, cut };
}

/** `count` cells in series, each cell's `cut` feeding the next cell's `in`, the last feeding a destination node. */
function cellChain(count: number, lit: boolean, withCut: boolean): FakeCell[] {
  const cells = Array.from({ length: count }, (_, i) => bypassCell(`c${i}`, lit, withCut));
  for (let i = 0; i < count - 1; i++) connect(cells[i].cut, cells[i + 1].in);
  connect(cells[count - 1].cut, node('destination'));
  return cells;
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

  describe('a chain of ten bypass cells (Dark-Effect Bypass T8)', () => {
    // A lit cell, walked from its `in`: in, dry, the effect's four nodes, and wet once per effect path (9 expansions);
    // the cut ends it. So "fewer than 16" means one cell and nothing past it.
    it('walks one cell and stops at its cut when a source connects into the first cell, all ten lit', () => {
      const cells = cellChain(10, true, true);
      const probe = search();
      expect(probe.run([node('source')], cells[0].in)).toEqual([]);
      expect(probe.visits()).toBe(9);
      expect(probe.visits()).toBeLessThan(16);
    });

    it('walks one cell from the sixth as from the first', () => {
      const cells = cellChain(10, true, true);
      const first = search();
      first.run([node('source')], cells[0].in);
      const sixth = search();
      sixth.run([cells[4].cut], cells[5].in);
      expect(sixth.visits()).toBeLessThan(16);
      expect(sixth.visits()).toBe(first.visits());
    });

    it('walks one cell from the last, whose cut feeds the destination', () => {
      const cells = cellChain(10, true, true);
      const probe = search();
      probe.run([cells[8].cut], cells[9].in);
      expect(probe.visits()).toBeLessThan(16);
    });

    // A crossing's two edges: in -> effect (the walk starts at the effect) and effect -> wet (it starts at the wet).
    it('walks only the effect and the wet gain when a crossing lights the middle cell of ten lit', () => {
      const cells = cellChain(10, true, true);
      const intoEffect = search();
      expect(intoEffect.run([cells[5].in], cells[5].effect)).toEqual([]);
      expect(intoEffect.visits()).toBeLessThan(8);
      const intoWet = search();
      intoWet.run([node('effect output')], cells[5].wet);
      expect(intoWet.visits()).toBe(1);
    });

    it('walks two nodes into a chain of ten dark cells: a dark cell is a single path', () => {
      const cells = cellChain(10, false, true);
      const probe = search();
      probe.run([node('source')], cells[0].in);
      expect(probe.visits()).toBe(2);
    });

    // Three paths through each lit cell (its dry gain, and the effect's own dry and wet), so 3^10 reach the destination.
    it('without a cut at each cell, the same lit chain costs over 3^10 (so over 2^10) expansions from the first cell', () => {
      const cells = cellChain(10, true, false);
      const probe = search();
      expect(probe.run([node('source')], cells[0].in)).toEqual([]);
      expect(probe.visits()).toBeGreaterThan(3 ** 10);
    });

    it('without the cuts, ten dark cells stay linear: only lit cells multiply the walk', () => {
      const cells = cellChain(10, false, false);
      const probe = search();
      probe.run([node('source')], cells[0].in);
      // in, dry and the uncut cut of each cell, then the destination.
      expect(probe.visits()).toBe(31);
    });
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
