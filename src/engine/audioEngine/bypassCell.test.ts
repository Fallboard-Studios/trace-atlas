import { describe, it, expect, vi, beforeEach } from 'vitest';
import type * as Tone from 'tone';

// The cell laws are pure arithmetic here, and the chain cells' protocol is driven through the chain by globalFx.test.ts.
// The rooms (Robot Effect Sends T3) are driven here directly, so Tone is only the context's audio-clock timer: a test
// fires a pending callback by hand with context.fireAll().
const context = vi.hoisted(() => {
  const c = {
    lookAhead: 0.1,
    timeouts: [] as Array<{ id: number; fn: () => void; seconds: number }>,
    cleared: [] as number[],
    nextId: 0,
    now: () => 0,
    setTimeout(fn: () => void, seconds: number): number {
      const id = ++c.nextId;
      c.timeouts.push({ id, fn, seconds });
      return id;
    },
    clearTimeout(id: number): void {
      c.cleared.push(id);
      c.timeouts = c.timeouts.filter((t) => t.id !== id);
    },
    fireAll(): void {
      const due = c.timeouts;
      c.timeouts = [];
      for (const t of due) t.fn();
    },
  };
  return c;
});
vi.mock('tone', () => ({ getContext: () => context }));

/** The colour taper, as the spec states it (colourWetGain): the stored Mix squared. */
const colourWetGainOf = (mix: number) => mix * mix;
vi.mock('@/utils/helpers', () => ({ devWarn: vi.fn() }));

describe('bypassCell', () => {
  it('lists the ten bypass effects once each, in chain order', async () => {
    const { BYPASS_KEYS } = await import('./bypassCell');
    expect([...BYPASS_KEYS]).toStrictEqual([
      'distortion',
      'chebyshev',
      'bitCrusher',
      'autoWah',
      'phaser',
      'chorus',
      'tremolo',
      'vibrato',
      'frequencyShifter',
      'stereoWidener',
    ]);
  });

  // Mix is tapered (docs/specs/GLOBAL_COLOUR.md, as built after the Pixel listen, 2026-10-15): the three
  // saturators were far too strong across most of the slider, so the stored 0-1 Mix reaches the node squared.
  describe('Mix taper (colourWetGain)', () => {
    it('is exported and maps the slider ends to the node ends: 0 stays dry, 1 stays fully wet', async () => {
      const { colourWetGain } = await import('./bypassCell');
      expect(colourWetGain(0)).toBe(0);
      expect(colourWetGain(1)).toBe(1);
    });

    it('is squared: half the slider is a quarter of the wet, and a low Mix is much lower', async () => {
      const { colourWetGain } = await import('./bypassCell');
      expect(colourWetGain(0.5)).toBeCloseTo(0.25, 9);
      expect(colourWetGain(0.2)).toBeCloseTo(0.04, 9);
    });

    it('never exceeds the slider position and rises strictly with it (a taper, not a cap)', async () => {
      const { colourWetGain } = await import('./bypassCell');
      let previous = -1;
      for (let i = 0; i <= 100; i++) {
        const v = i / 100;
        const gain = colourWetGain(v);
        expect(gain).toBeLessThanOrEqual(v + 1e-12);
        expect(gain).toBeGreaterThan(previous);
        previous = gain;
      }
    });
  });

  // Dark-Effect Bypass T1 (docs/specs/DARK_EFFECT_BYPASS.md section 1.1): the two laws a bypass cell's dry and wet
  // gains follow. A Mix effect's cell takes Tone's own CrossFade law (equal power), so an effect pinned at wet 1 inside
  // a cell at cellGains(g) sounds as the bare effect at wet g. Width's cell crossfades two identical signals at 0.5, so
  // it fades linearly.
  describe('bypass cell laws (Dark-Effect Bypass T1)', () => {
    describe('cellGains (Tone CrossFade law)', () => {
      it('is fully dry at 0', async () => {
        const { cellGains } = await import('./bypassCell');
        const { dry, wet } = cellGains(0);
        expect(dry).toBeCloseTo(1, 12);
        expect(wet).toBeCloseTo(0, 12);
      });

      it('is fully wet at 1', async () => {
        const { cellGains } = await import('./bypassCell');
        const { dry, wet } = cellGains(1);
        expect(dry).toBeCloseTo(0, 12);
        expect(wet).toBeCloseTo(1, 12);
      });

      it('gives both paths the square root of one half at the midpoint', async () => {
        const { cellGains } = await import('./bypassCell');
        const { dry, wet } = cellGains(0.5);
        expect(dry).toBeCloseTo(Math.SQRT1_2, 12);
        expect(wet).toBeCloseTo(Math.SQRT1_2, 12);
      });

      it('is equal power: dry squared plus wet squared is 1 at every tenth from 0 to 1', async () => {
        const { cellGains } = await import('./bypassCell');
        for (let i = 0; i <= 10; i++) {
          const { dry, wet } = cellGains(i / 10);
          expect(dry * dry + wet * wet).toBeCloseTo(1, 12);
        }
      });

      it('matches the cos / sin of Tone CrossFade at a quarter and three quarters (a StereoPanner at pan 2f - 1)', async () => {
        const { cellGains } = await import('./bypassCell');
        expect(cellGains(0.25).dry).toBeCloseTo(Math.cos(Math.PI / 8), 12);
        expect(cellGains(0.25).wet).toBeCloseTo(Math.sin(Math.PI / 8), 12);
        expect(cellGains(0.75).dry).toBeCloseTo(Math.cos((3 * Math.PI) / 8), 12);
        expect(cellGains(0.75).wet).toBeCloseTo(Math.sin((3 * Math.PI) / 8), 12);
      });

      it('falls on the dry side and rises on the wet side strictly as the input rises', async () => {
        const { cellGains } = await import('./bypassCell');
        let previous = cellGains(0);
        for (let i = 1; i <= 100; i++) {
          const next = cellGains(i / 100);
          expect(next.dry).toBeLessThan(previous.dry);
          expect(next.wet).toBeGreaterThan(previous.wet);
          previous = next;
        }
      });

      it('gives the smallest lit Mix a wet gain above zero, so a lit cell always has a wet path', async () => {
        const { cellGains, colourWetGain } = await import('./bypassCell');
        const { dry, wet } = cellGains(colourWetGain(0.001));
        expect(wet).toBeGreaterThan(0);
        expect(dry).toBeLessThanOrEqual(1);
        expect(dry).toBeGreaterThan(0.999999);
      });

      it('keeps both gains inside 0 to 1 for every input in range', async () => {
        const { cellGains } = await import('./bypassCell');
        for (let i = 0; i <= 100; i++) {
          const { dry, wet } = cellGains(i / 100);
          expect(dry).toBeGreaterThanOrEqual(-1e-12);
          expect(dry).toBeLessThanOrEqual(1);
          expect(wet).toBeGreaterThanOrEqual(0);
          expect(wet).toBeLessThanOrEqual(1);
        }
      });
    });

    describe('widthCellGains (linear)', () => {
      it('is fully dry at 0 and fully wet at 1', async () => {
        const { widthCellGains } = await import('./bypassCell');
        expect(widthCellGains(0)).toEqual({ dry: 1, wet: 0 });
        expect(widthCellGains(1)).toEqual({ dry: 0, wet: 1 });
      });

      it('sums to exactly 1 at 0, a quarter, a half, three quarters and 1', async () => {
        const { widthCellGains } = await import('./bypassCell');
        for (const f of [0, 0.25, 0.5, 0.75, 1]) {
          const { dry, wet } = widthCellGains(f);
          expect(dry + wet).toBe(1);
        }
      });

      it('is linear, not equal power: a half each at the midpoint', async () => {
        const { widthCellGains } = await import('./bypassCell');
        expect(widthCellGains(0.5)).toEqual({ dry: 0.5, wet: 0.5 });
        expect(widthCellGains(0.25)).toEqual({ dry: 0.75, wet: 0.25 });
      });
    });

    it('exports the disconnect margin, 10 ms past lookAhead plus the ramp', async () => {
      const { BYPASS_DISCONNECT_MARGIN_SECONDS } = await import('./bypassCell');
      expect(BYPASS_DISCONNECT_MARGIN_SECONDS).toBe(0.01);
    });
  });

  // Robot Effect Sends T3 (docs/specs/ROBOT_EFFECT_SENDS.md assumptions 2-3, §1.3, §4): a room is the cell machinery
  // with the dry branch removed. The branch is the crossing unit; the room is live while some robot feeds it AND its
  // Return is above 0. Pure here: fake Gain / Delay constructors and a hand-driven context timer.
  describe('rooms (Robot Effect Sends T3)', () => {
    type FakeNode = {
      kind: string;
      connect: ReturnType<typeof vi.fn>;
      disconnect: ReturnType<typeof vi.fn>;
      dispose: ReturnType<typeof vi.fn>;
      gain: { value: number; rampTo: ReturnType<typeof vi.fn> };
    };
    const made: FakeNode[] = [];
    function fakeNode(kind: string, value = 0): FakeNode {
      const node: FakeNode = {
        kind,
        connect: vi.fn().mockReturnThis(),
        disconnect: vi.fn(),
        dispose: vi.fn(),
        gain: { value, rampTo: vi.fn() },
      };
      made.push(node);
      return node;
    }
    const GainCtor = vi.fn(function (value?: number) {
      return fakeNode('gain', value ?? 1);
    }) as unknown as new (...args: unknown[]) => Tone.Gain;
    const DelayCtor = vi.fn(function () {
      return fakeNode('delay');
    }) as unknown as new (...args: unknown[]) => Tone.Delay;
    const effect = (name: string) => fakeNode(name) as unknown as Tone.ToneAudioNode;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fake = (node: unknown) => node as any;

    beforeEach(() => {
      vi.resetModules();
      made.length = 0;
      context.timeouts = [];
      context.lookAhead = 0.1;
      context.cleared = [];
    });

    async function grit() {
      const cells = await import('./bypassCell');
      cells.buildRoom('grit', GainCtor, DelayCtor);
      const dist = effect('distortion');
      const cheb = effect('chebyshev');
      cells.buildBranch('distortion', 'grit', dist, GainCtor);
      cells.buildBranch('chebyshev', 'grit', cheb, GainCtor);
      cells.wireCells();
      return { cells, room: cells.getRoom('grit')!, dist, cheb };
    }
    const wetRamps = (cell: { wet: unknown }) => fake(cell.wet).gain.rampTo.mock.calls.map((c: unknown[]) => c[0]);
    const edgesFrom = (node: unknown) => fake(node).connect.mock.calls.map((c: unknown[]) => c[0]);

    it('names the three rooms and which bypass effects are branches of each', async () => {
      const { ROOM_KEYS, ROOM_BRANCHES } = await import('./bypassCell');
      expect([...ROOM_KEYS]).toStrictEqual(['grit', 'shimmer', 'double']);
      expect(ROOM_BRANCHES).toStrictEqual({
        grit: ['distortion', 'chebyshev', 'bitCrusher'],
        shimmer: ['frequencyShifter'],
        double: ['chorus'],
      });
    });

    it('branchGains is wet-only: no dry at any depth, the wet the input itself', async () => {
      const { branchGains } = await import('./bypassCell');
      for (const w of [0, 0.04, 0.25, 0.5, 1]) expect(branchGains(w)).toStrictEqual({ dry: 0, wet: w });
    });

    it('builds a room as in (1), a zero-delay cut and a return (1), unfed, at a Return of 1', async () => {
      const cells = await import('./bypassCell');
      cells.buildRoom('shimmer', GainCtor, DelayCtor);
      const room = cells.getRoom('shimmer')!;
      expect(room.fed).toBe(false);
      expect(room.returnLevel).toBe(1);
      expect(fake(room.in).gain.value).toBe(1);
      expect(fake(room.return).gain.value).toBe(1);
      expect(fake(room.cut).kind).toBe('delay');
      expect(vi.mocked(DelayCtor as unknown as ReturnType<typeof vi.fn>)).toHaveBeenLastCalledWith({ delayTime: 0, maxDelay: 0.01 });
      expect(cells.getRoom('grit')).toBeUndefined();
    });

    it('leaves the room out, releasing what it made, when a constructor throws', async () => {
      const cells = await import('./bypassCell');
      let calls = 0;
      const Flaky = vi.fn(function () {
        calls++;
        if (calls === 2) throw new Error('no gain');
        return fakeNode('gain', 1);
      }) as unknown as new (...args: unknown[]) => Tone.Gain;
      cells.buildRoom('grit', Flaky, DelayCtor);
      expect(cells.getRoom('grit')).toBeUndefined();
      expect(made[0].dispose).toHaveBeenCalled();
    });

    it('builds a branch dark: sharing the room in and cut, no dry gain, a wet gain at 0, the effect unconnected', async () => {
      const { cells, room, dist } = await grit();
      const branch = cells.getCell('distortion')!;
      expect(branch.room).toBe('grit');
      expect(branch.in).toBe(room.in);
      expect(branch.cut).toBe(room.cut);
      expect(branch.dry).toBeNull();
      expect(fake(branch.wet).gain.value).toBe(0);
      expect(branch.connected).toBe(false);
      expect(branch.depth).toBe(0);
      expect(edgesFrom(room.in)).not.toContain(dist);
      expect(edgesFrom(dist)).toEqual([]);
    });

    it('a branch without its room, or without an effect, is not built and its effect is released', async () => {
      const cells = await import('./bypassCell');
      const orphan = effect('chorus');
      cells.buildBranch('chorus', 'double', orphan, GainCtor);
      expect(cells.getCell('chorus')).toBeUndefined();
      expect(fake(orphan).dispose).toHaveBeenCalled();
      cells.buildRoom('double', GainCtor, DelayCtor);
      cells.buildBranch('chorus', 'double', null, GainCtor);
      expect(cells.getCell('chorus')).toBeUndefined();
    });

    it('wires a branch wet -> cut and the room cut -> return, with no dry edge and no effect edge while dark', async () => {
      const { cells, room, dist } = await grit();
      const branch = cells.getCell('distortion')!;
      expect(edgesFrom(branch.wet)).toEqual([room.cut]);
      expect(edgesFrom(room.cut)).toEqual([room.return]);
      expect(edgesFrom(room.in)).toEqual([]);
      expect(edgesFrom(dist)).toEqual([]);
    });

    it('a Mix write on an unfed room records the depth and connects nothing, writes no gain, arms no timer', async () => {
      const { cells, room, dist } = await grit();
      cells.writeCellMix('distortion', 0.3);
      const branch = cells.getCell('distortion')!;
      expect(branch.depth).toBe(0.3);
      expect(branch.connected).toBe(false);
      expect(edgesFrom(room.in)).not.toContain(dist);
      expect(wetRamps(branch)).toEqual([]);
      expect(context.timeouts).toEqual([]);
    });

    it('feeding the room lights the branch at its depth: connects in -> effect -> wet once, ramps only the wet', async () => {
      const { cells, room, dist } = await grit();
      cells.writeCellMix('distortion', 0.3);
      cells.setRoomFed('grit', true);
      const branch = cells.getCell('distortion')!;
      expect(branch.connected).toBe(true);
      expect(edgesFrom(room.in).filter((n: unknown) => n === dist)).toHaveLength(1);
      expect(edgesFrom(dist)).toEqual([branch.wet]);
      expect(wetRamps(branch)).toEqual([expect.closeTo(colourWetGainOf(0.3), 12)]);
      expect(fake(branch.wet).gain.rampTo.mock.calls[0][1]).toBe(0.05);
    });

    it('feeding the room re-targets every branch, lit ones lit and a branch at depth 0 left dark', async () => {
      const { cells, dist, cheb } = await grit();
      cells.writeCellMix('distortion', 0.3);
      cells.writeCellMix('chebyshev', 0.5);
      cells.setRoomFed('grit', true);
      expect(cells.getCell('distortion')!.connected).toBe(true);
      expect(cells.getCell('chebyshev')!.connected).toBe(true);
      expect(edgesFrom(dist)).toHaveLength(1);
      expect(edgesFrom(cheb)).toHaveLength(1);
      expect(cells.getConnectedEffectCount()).toBe(2);

      cells.writeCellMix('chebyshev', 0);
      context.fireAll();
      expect(cells.getConnectedEffectCount()).toBe(1);
    });

    it('un-feeding darkens: ramps the wet to 0, arms one timer at lookAhead + ramp + margin, disconnects at the fire', async () => {
      const { cells, room, dist } = await grit();
      cells.writeCellMix('distortion', 0.3);
      cells.setRoomFed('grit', true);
      const branch = cells.getCell('distortion')!;
      cells.setRoomFed('grit', false);
      expect(wetRamps(branch).at(-1)).toBe(0);
      expect(context.timeouts).toHaveLength(1);
      expect(context.timeouts[0].seconds).toBeCloseTo(0.1 + 0.05 + 0.01, 12);
      expect(branch.connected).toBe(true);
      context.fireAll();
      expect(branch.connected).toBe(false);
      expect(fake(room.in).disconnect).toHaveBeenCalledWith(dist);
      expect(fake(dist).disconnect).toHaveBeenCalledWith(branch.wet);
      expect(branch.depth).toBe(0.3);
    });

    it('a re-feed before the darken fires cancels the disconnect and re-lights without a second connect', async () => {
      const { cells, room, dist } = await grit();
      cells.writeCellMix('distortion', 0.3);
      cells.setRoomFed('grit', true);
      cells.setRoomFed('grit', false);
      const timer = context.timeouts[0];
      cells.setRoomFed('grit', true);
      expect(context.cleared).toContain(timer.id);
      context.fireAll();
      const branch = cells.getCell('distortion')!;
      expect(branch.connected).toBe(true);
      expect(edgesFrom(room.in).filter((n: unknown) => n === dist)).toHaveLength(1);
      expect(wetRamps(branch).at(-1)).toBeCloseTo(colourWetGainOf(0.3), 12);
    });

    it('a Return of 0 on a fed room darkens it, and a Return of 0.4 re-lights it; the return gain ramps each time', async () => {
      const { cells, room } = await grit();
      cells.writeCellMix('distortion', 0.3);
      cells.setRoomFed('grit', true);
      const branch = cells.getCell('distortion')!;

      cells.setRoomReturn('grit', 0);
      expect(room.returnLevel).toBe(0);
      expect(fake(room.return).gain.rampTo).toHaveBeenLastCalledWith(0, 0.05);
      expect(wetRamps(branch).at(-1)).toBe(0);
      context.fireAll();
      expect(branch.connected).toBe(false);

      cells.setRoomReturn('grit', 0.4);
      expect(fake(room.return).gain.rampTo).toHaveBeenLastCalledWith(0.4, 0.05);
      expect(branch.connected).toBe(true);
      expect(wetRamps(branch).at(-1)).toBeCloseTo(colourWetGainOf(0.3), 12);
    });

    it('a Return moving between two levels above 0 ramps the return only and re-targets no branch', async () => {
      const { cells } = await grit();
      cells.writeCellMix('distortion', 0.3);
      cells.setRoomFed('grit', true);
      const branch = cells.getCell('distortion')!;
      const before = wetRamps(branch).length;
      cells.setRoomReturn('grit', 0.6);
      expect(wetRamps(branch)).toHaveLength(before);
      expect(context.timeouts).toEqual([]);
    });

    it('a Return of 0 on an unfed room, then a feed, keeps the room dark; the Return coming up then lights it', async () => {
      const { cells } = await grit();
      cells.writeCellMix('distortion', 0.3);
      cells.setRoomReturn('grit', 0);
      cells.setRoomFed('grit', true);
      expect(cells.getCell('distortion')!.connected).toBe(false);
      cells.setRoomReturn('grit', 1);
      expect(cells.getCell('distortion')!.connected).toBe(true);
    });

    it('ignores a non-finite Return, and re-sent equal fed and Return states write nothing', async () => {
      const { cells, room } = await grit();
      cells.writeCellMix('distortion', 0.3);
      cells.setRoomFed('grit', true);
      const branch = cells.getCell('distortion')!;
      const returnRamps = fake(room.return).gain.rampTo.mock.calls.length;
      const before = wetRamps(branch).length;
      cells.setRoomReturn('grit', Number.NaN);
      cells.setRoomReturn('grit', 1);
      cells.setRoomFed('grit', true);
      cells.writeCellMix('distortion', 0.3);
      expect(room.returnLevel).toBe(1);
      expect(fake(room.return).gain.rampTo.mock.calls).toHaveLength(returnRamps);
      expect(wetRamps(branch)).toHaveLength(before);
      expect(context.timeouts).toEqual([]);
    });

    it('a pinned-1 branch (Shimmer) lights at a wet of 1 once fed', async () => {
      const cells = await import('./bypassCell');
      cells.buildRoom('shimmer', GainCtor, DelayCtor);
      const shifter = effect('frequencyShifter');
      cells.buildBranch('frequencyShifter', 'shimmer', shifter, GainCtor);
      cells.wireCells();
      cells.writeCellMix('frequencyShifter', 1);
      expect(cells.getCell('frequencyShifter')!.connected).toBe(false);
      cells.setRoomFed('shimmer', true);
      expect(wetRamps(cells.getCell('frequencyShifter')!)).toEqual([1]);
      expect(cells.getConnectedEffectCount()).toBe(1);
    });

    it('a depth change on a live room ramps the branch to the new depth; depth 0 darkens it', async () => {
      const { cells } = await grit();
      cells.setRoomFed('grit', true);
      cells.writeCellMix('distortion', 0.3);
      const branch = cells.getCell('distortion')!;
      cells.writeCellMix('distortion', 0.5);
      expect(wetRamps(branch).at(-1)).toBeCloseTo(0.25, 12);
      cells.writeCellMix('distortion', 0);
      expect(wetRamps(branch).at(-1)).toBe(0);
      context.fireAll();
      expect(branch.connected).toBe(false);
      expect(branch.depth).toBe(0);
    });

    it('a duck on a lit branch ramps its wet to 0 and back, never touching a dry gain (needsDuck reads connected)', async () => {
      const cells = await import('./bypassCell');
      cells.buildRoom('double', GainCtor, DelayCtor);
      cells.buildBranch('chorus', 'double', effect('chorus'), GainCtor);
      cells.wireCells();
      expect(cells.needsDuck('chorus')).toBe(false);
      cells.writeCellMix('chorus', 1);
      cells.setRoomFed('double', true);
      expect(cells.needsDuck('chorus')).toBe(true);
      const apply = vi.fn();
      cells.duckCell('chorus', apply);
      const branch = cells.getCell('chorus')!;
      expect(wetRamps(branch).at(-1)).toBe(0);
      context.fireAll();
      expect(apply).toHaveBeenCalledTimes(1);
      expect(wetRamps(branch).at(-1)).toBe(1);
    });

    it('lists a room as in, each branch effect + wet, cut, return; a branch is not a chain stage', async () => {
      const { cells, room, dist, cheb } = await grit();
      expect(cells.roomNodes('grit')).toEqual([
        room.in,
        dist,
        cells.getCell('distortion')!.wet,
        cheb,
        cells.getCell('chebyshev')!.wet,
        room.cut,
        room.return,
      ]);
      expect(cells.roomNodes('double')).toEqual([]);
      expect(cells.cellSpan('distortion')).toBeNull();
      expect(cells.cellNodes('distortion')).toEqual([dist, cells.getCell('distortion')!.wet]);
    });

    it('clearCells drops the rooms with the cells, and a pending branch darken', async () => {
      const { cells } = await grit();
      cells.writeCellMix('distortion', 0.3);
      cells.setRoomFed('grit', true);
      cells.setRoomFed('grit', false);
      const timer = context.timeouts[0];
      cells.clearCells();
      expect(cells.getRoom('grit')).toBeUndefined();
      expect(cells.getCell('distortion')).toBeUndefined();
      expect(context.cleared).toContain(timer.id);
      expect(() => cells.setRoomFed('grit', true)).not.toThrow();
      expect(() => cells.setRoomReturn('grit', 0.5)).not.toThrow();
    });

    it('chain cells are untouched by the rooms: a chain cell still has its dry gain and its dry edge', async () => {
      const cells = await import('./bypassCell');
      cells.buildCell('tremolo', effect('tremolo'), GainCtor, DelayCtor);
      cells.wireCells();
      const cell = cells.getCell('tremolo')!;
      expect(cell.room).toBeNull();
      expect(cell.dry).not.toBeNull();
      expect(edgesFrom(cell.in)).toEqual([cell.dry]);
      expect(edgesFrom(cell.dry)).toEqual([cell.cut]);
    });

    // docs/specs/LIGHT_TIER_STANDING_COST.md H3a (Task 16): a dark cell's effect LFOs are stopped. They start before the
    // light crossing's connect and stop when the darken timer's disconnect has run, so "in the path" and "running" agree.
    describe('dark LFOs stopped (Light tier standing cost T16)', () => {
      type FakeLfo = { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> };
      const lfo = (): FakeLfo => ({ start: vi.fn(), stop: vi.fn() });
      /** A Chorus / Tremolo / Phaser: two LFOs, Tone's `_lfoL` and `_lfoR`. */
      const twoLfoEffect = (name: string) => Object.assign(fakeNode(name), { _lfoL: lfo(), _lfoR: lfo() });
      /** The Vibrato: one, Tone's `_lfo`. */
      const oneLfoEffect = (name: string) => Object.assign(fakeNode(name), { _lfo: lfo() });
      const order = (fn: ReturnType<typeof vi.fn>, k = 0) => fn.mock.invocationCallOrder[k];

      async function chainCell(key: 'tremolo' | 'vibrato' | 'autoWah', effectNode: FakeNode) {
        const cells = await import('./bypassCell');
        cells.buildCell(key, effectNode as unknown as Tone.ToneAudioNode, GainCtor, DelayCtor);
        cells.wireCells();
        return { cells, cell: cells.getCell(key)! };
      }

      it('records the effect LFOs on the cell and stops each once at build (every cell is built dark)', async () => {
        const tremolo = twoLfoEffect('tremolo');
        const { cell } = await chainCell('tremolo', tremolo);
        expect(cell.lfos).toEqual([tremolo._lfoL, tremolo._lfoR]);
        for (const l of [tremolo._lfoL, tremolo._lfoR]) {
          expect(l.stop).toHaveBeenCalledTimes(1);
          expect(l.start).not.toHaveBeenCalled();
        }

        const vibrato = oneLfoEffect('vibrato');
        const built = await chainCell('vibrato', vibrato);
        expect(built.cell.lfos).toEqual([vibrato._lfo]);
        expect(vibrato._lfo.stop).toHaveBeenCalledTimes(1); // undoes the start in Tone's own constructor
      });

      it('starts the LFOs before the effect edge is made when the cell lights', async () => {
        const tremolo = twoLfoEffect('tremolo');
        const { cells, cell } = await chainCell('tremolo', tremolo);

        cells.writeCellMix('tremolo', 0.3);

        const inConnect = fake(cell.in).connect;
        const toEffect = inConnect.mock.calls.findIndex((c: unknown[]) => c[0] === tremolo);
        expect(toEffect).toBeGreaterThanOrEqual(0);
        for (const l of [tremolo._lfoL, tremolo._lfoR]) {
          expect(l.start).toHaveBeenCalledTimes(1);
          expect(order(l.start)).toBeLessThan(order(inConnect, toEffect));
        }
      });

      it('stops them only when the darken timer fires, after the effect is disconnected', async () => {
        const tremolo = twoLfoEffect('tremolo');
        const { cells, cell } = await chainCell('tremolo', tremolo);
        cells.writeCellMix('tremolo', 0.3);

        cells.writeCellMix('tremolo', 0);
        expect(tremolo._lfoL.stop).toHaveBeenCalledTimes(1); // the build's, nothing yet
        context.fireAll();

        expect(cell.connected).toBe(false);
        for (const l of [tremolo._lfoL, tremolo._lfoR]) {
          expect(l.stop).toHaveBeenCalledTimes(2);
          expect(order(l.stop, 1)).toBeGreaterThan(order(tremolo.disconnect));
        }
      });

      it('a re-light before the timer fires leaves them running: no stop, no second start', async () => {
        const tremolo = twoLfoEffect('tremolo');
        const { cells } = await chainCell('tremolo', tremolo);
        cells.writeCellMix('tremolo', 0.3);
        cells.writeCellMix('tremolo', 0);

        cells.writeCellMix('tremolo', 0.2);
        context.fireAll();

        expect(tremolo._lfoL.stop).toHaveBeenCalledTimes(1);
        expect(tremolo._lfoL.start).toHaveBeenCalledTimes(1);
      });

      it('lights and darkens an effect with no LFO as before', async () => {
        const wah = fakeNode('autoWah');
        const { cells, cell } = await chainCell('autoWah', wah);
        expect(cell.lfos).toEqual([]);
        cells.writeCellMix('autoWah', 0.4);
        expect(cell.connected).toBe(true);
        cells.writeCellMix('autoWah', 0);
        context.fireAll();
        expect(cell.connected).toBe(false);
      });

      it('stops them again when Tone refuses the connect, so an unconnected cell never runs its LFOs', async () => {
        const tremolo = twoLfoEffect('tremolo');
        const { cells, cell } = await chainCell('tremolo', tremolo);
        fake(cell.in).connect.mockImplementationOnce(() => {
          throw new Error('refused');
        });

        cells.writeCellMix('tremolo', 0.3);

        expect(cell.connected).toBe(false);
        expect(tremolo._lfoL.start).toHaveBeenCalledTimes(1);
        expect(tremolo._lfoL.stop).toHaveBeenCalledTimes(2);
        expect(order(tremolo._lfoL.stop, 1)).toBeGreaterThan(order(tremolo._lfoL.start));
      });

      it('a room branch (the Chorus) is built with its LFOs stopped and starts them as its room goes live', async () => {
        const cells = await import('./bypassCell');
        cells.buildRoom('double', GainCtor, DelayCtor);
        const chorus = twoLfoEffect('chorus');
        cells.buildBranch('chorus', 'double', chorus as unknown as Tone.ToneAudioNode, GainCtor);
        cells.wireCells();
        expect(chorus._lfoR.stop).toHaveBeenCalledTimes(1);

        cells.writeCellMix('chorus', 1);
        expect(chorus._lfoR.start).not.toHaveBeenCalled(); // pinned at depth 1, but unfed: still dark
        cells.setRoomFed('double', true);
        expect(chorus._lfoR.start).toHaveBeenCalledTimes(1);

        cells.setRoomFed('double', false);
        context.fireAll();
        expect(chorus._lfoR.stop).toHaveBeenCalledTimes(2);
      });

      it('swapping a cell effect (the Phaser rebuild) records the new LFOs and stops them; the next light starts those', async () => {
        const cells = await import('./bypassCell');
        const old = twoLfoEffect('phaser');
        cells.buildCell('phaser', old as unknown as Tone.ToneAudioNode, GainCtor, DelayCtor);
        cells.wireCells();
        const cell = cells.getCell('phaser')!;
        const fresh = twoLfoEffect('phaser');

        cells.setCellEffect(cell, fresh as unknown as Tone.ToneAudioNode);

        expect(cell.effect).toBe(fresh);
        expect(cell.lfos).toEqual([fresh._lfoL, fresh._lfoR]);
        expect(fresh._lfoL.stop).toHaveBeenCalledTimes(1);
        expect(cells.connectEffect('phaser', cell, fresh as unknown as Tone.ToneAudioNode)).toBe(true);
        expect(fresh._lfoL.start).toHaveBeenCalledTimes(1);
        expect(old._lfoL.start).not.toHaveBeenCalled();
      });
    });

    // docs/specs/DESKTOP_FULL_TIER_STANDING_COST.md G3 (Task 15): a cell enters its effect at the effect's send and
    // leaves at its return, so Tone's input, CrossFade and output around the effect never render (8 nodes a lit
    // effect, B5).
    describe('the cells reach the effect send and return (backlog 67 G3)', () => {
      /** A Tone Effect (the AutoWah, Distortion, Vibrato, the widener...): effectSend and effectReturn Gains. */
      const sendReturnEffect = (name: string) =>
        Object.assign(fakeNode(name), { effectSend: fakeNode(`${name}.send`), effectReturn: fakeNode(`${name}.return`) });
      /** A Tone StereoEffect (the Chorus, Phaser and Tremolo): its Split and Merge in their place. */
      const stereoEffect = (name: string) =>
        Object.assign(fakeNode(name), { _split: fakeNode(`${name}.split`), _merge: fakeNode(`${name}.merge`) });

      async function chainCell(key: 'autoWah' | 'tremolo' | 'phaser', effectNode: FakeNode) {
        const cells = await import('./bypassCell');
        const { devWarn } = await import('@/utils/helpers');
        vi.mocked(devWarn).mockClear(); // the mock keeps its calls across resetModules; the earlier tests' fakes have no pairs
        cells.buildCell(key, effectNode as unknown as Tone.ToneAudioNode, GainCtor, DelayCtor);
        cells.wireCells();
        return { cells, cell: cells.getCell(key)!, devWarn: vi.mocked(devWarn) };
      }

      it('a lit Effect is entered at its effectSend and left at its effectReturn; nothing connects to the effect itself', async () => {
        const autoWah = sendReturnEffect('autoWah');
        const { cells, cell, devWarn } = await chainCell('autoWah', autoWah);

        cells.writeCellMix('autoWah', 0.5);

        expect(cell.connected).toBe(true);
        expect(edgesFrom(cell.in)).toContain(autoWah.effectSend);
        expect(edgesFrom(cell.in)).not.toContain(autoWah);
        expect(edgesFrom(autoWah.effectReturn)).toEqual([cell.wet]);
        expect(autoWah.connect).not.toHaveBeenCalled();
        expect(devWarn).not.toHaveBeenCalled();
      });

      it('a lit StereoEffect is entered at its Split and left at its Merge', async () => {
        const tremolo = stereoEffect('tremolo');
        const { cells, cell, devWarn } = await chainCell('tremolo', tremolo);

        cells.writeCellMix('tremolo', 0.5);

        expect(edgesFrom(cell.in)).toContain(tremolo._split);
        expect(edgesFrom(tremolo._merge)).toEqual([cell.wet]);
        expect(tremolo.connect).not.toHaveBeenCalled();
        expect(devWarn).not.toHaveBeenCalled();
      });

      it('a darken disconnects exactly the send and return edges the light made', async () => {
        const autoWah = sendReturnEffect('autoWah');
        const { cells, cell } = await chainCell('autoWah', autoWah);
        cells.writeCellMix('autoWah', 0.5);

        cells.writeCellMix('autoWah', 0);
        context.fireAll();

        expect(cell.connected).toBe(false);
        expect(fake(cell.in).disconnect).toHaveBeenCalledWith(autoWah.effectSend);
        expect(autoWah.effectReturn.disconnect).toHaveBeenCalledWith(cell.wet);
        expect(autoWah.disconnect).not.toHaveBeenCalled();
      });

      it('wireCells re-makes a lit cell send and return edges (a Decay flip), and none for a dark one', async () => {
        const autoWah = sendReturnEffect('autoWah');
        const { cells, cell } = await chainCell('autoWah', autoWah);
        cells.writeCellMix('autoWah', 0.5);
        fake(cell.in).connect.mockClear();
        autoWah.effectReturn.connect.mockClear();

        cells.wireCells();

        expect(edgesFrom(cell.in)).toContain(autoWah.effectSend);
        expect(edgesFrom(autoWah.effectReturn)).toEqual([cell.wet]);
        expect(autoWah.connect).not.toHaveBeenCalled();

        const tremolo = stereoEffect('tremolo');
        cells.buildCell('tremolo', tremolo as unknown as Tone.ToneAudioNode, GainCtor, DelayCtor);
        cells.wireCells();
        expect(tremolo._merge.connect).not.toHaveBeenCalled();
      });

      it('a room branch (the Chorus) reaches its Split from the room in and its Merge to the branch wet', async () => {
        const cells = await import('./bypassCell');
        cells.buildRoom('double', GainCtor, DelayCtor);
        const chorus = stereoEffect('chorus');
        cells.buildBranch('chorus', 'double', chorus as unknown as Tone.ToneAudioNode, GainCtor);
        cells.wireCells();

        cells.writeCellMix('chorus', 1);
        cells.setRoomFed('double', true);

        const branch = cells.getCell('chorus')!;
        expect(branch.connected).toBe(true);
        expect(edgesFrom(cells.getRoom('double')!.in)).toContain(chorus._split);
        expect(edgesFrom(chorus._merge)).toEqual([branch.wet]);
        expect(chorus.connect).not.toHaveBeenCalled();
      });

      it('the Phaser rebuild connects the new node at its Split and Merge', async () => {
        const old = stereoEffect('phaser');
        const { cells, cell } = await chainCell('phaser', old);
        const fresh = stereoEffect('phaser');

        cells.setCellEffect(cell, fresh as unknown as Tone.ToneAudioNode);
        expect(cells.connectEffect('phaser', cell, fresh as unknown as Tone.ToneAudioNode)).toBe(true);

        expect(edgesFrom(cell.in)).toContain(fresh._split);
        expect(edgesFrom(fresh._merge)).toEqual([cell.wet]);
        expect(fresh.connect).not.toHaveBeenCalled();
      });

      it('an effect with neither pair keeps the old edges into the effect and out of it, warned once for its key', async () => {
        const plain = fakeNode('autoWah');
        const { cells, cell, devWarn } = await chainCell('autoWah', plain);

        cells.writeCellMix('autoWah', 0.5);
        cells.writeCellMix('autoWah', 0);
        context.fireAll();
        cells.writeCellMix('autoWah', 0.5);

        expect(edgesFrom(cell.in)).toContain(plain);
        expect(edgesFrom(plain)).toContain(cell.wet);
        expect(fake(cell.in).disconnect).toHaveBeenCalledWith(plain);
        expect(plain.disconnect).toHaveBeenCalledWith(cell.wet);
        expect(devWarn).toHaveBeenCalledTimes(1);
        expect(String(devWarn.mock.calls[0][0])).toContain('autoWah');
      });
    });

    // docs/specs/DARK_EFFECTS_LEAVE_THE_GRAPH.md §1.2: a registered key's effect exists only between its cell's first
    // light and the teardown after it goes dark at its own level. Stub builders stand in for globalFx.ts's; a cell with
    // no registration keeps today's behaviour.
    describe('the effect lifetime (backlog 72)', () => {
      type FakeLfo = { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> };
      type StubEffect = FakeNode & { effectSend: FakeNode; effectReturn: FakeNode; _lfoL: FakeLfo; _lfoR: FakeLfo };
      const lfo = (): FakeLfo => ({ start: vi.fn(), stop: vi.fn() });
      /** A fresh effect per build, with its send and return (no ends warning) and two LFOs. */
      const stubBuilder = (name: string) => {
        const built: StubEffect[] = [];
        const build = vi.fn(() => {
          const node = Object.assign(fakeNode(name), {
            effectSend: fakeNode(`${name}.send`),
            effectReturn: fakeNode(`${name}.return`),
            _lfoL: lfo(),
            _lfoR: lfo(),
          });
          built.push(node);
          return node as unknown as Tone.ToneAudioNode;
        });
        return { build, built };
      };
      const order = (fn: ReturnType<typeof vi.fn>, k = 0) => fn.mock.invocationCallOrder[k];

      async function setup() {
        const cells = await import('./bypassCell');
        const { devWarn } = await import('@/utils/helpers');
        vi.mocked(devWarn).mockClear(); // the mock keeps its calls across resetModules
        return { cells, devWarn: vi.mocked(devWarn) };
      }

      /** The Grit room with an empty Distortion branch, registered unless `register` is false. */
      async function emptyGrit(register = true) {
        const { cells, devWarn } = await setup();
        const stub = stubBuilder('distortion');
        const onTeardown = vi.fn();
        if (register) cells.registerEffect('distortion', { build: stub.build, onTeardown });
        cells.buildRoom('grit', GainCtor, DelayCtor);
        cells.buildBranch('distortion', 'grit', null, GainCtor);
        cells.wireCells();
        return { cells, devWarn, onTeardown, room: cells.getRoom('grit')!, branch: cells.getCell('distortion')!, ...stub };
      }

      /** An empty Tremolo chain cell, registered. */
      async function emptyTremolo() {
        const { cells, devWarn } = await setup();
        const stub = stubBuilder('tremolo');
        const onTeardown = vi.fn();
        cells.registerEffect('tremolo', { build: stub.build, onTeardown });
        cells.buildCell('tremolo', null, GainCtor, DelayCtor);
        cells.wireCells();
        return { cells, devWarn, onTeardown, cell: cells.getCell('tremolo')!, ...stub };
      }

      /** Fire one pending context timer by hand, leaving the others pending. */
      const fire = (timer: { id: number; fn: () => void }) => {
        context.timeouts = context.timeouts.filter((t) => t.id !== timer.id);
        timer.fn();
      };

      /** The Distortion branch built and lit at a depth of 0.3 in its fed Grit room. */
      async function litGrit() {
        const grit = await emptyGrit();
        grit.cells.setRoomFed('grit', true);
        grit.cells.writeCellMix('distortion', 0.3);
        return { ...grit, node: grit.built[0] };
      }

      /** The Shifter branch, pinned at depth 1, lit in its fed Shimmer room and then left unfed: disconnected, effect kept. */
      async function unfedShimmer() {
        const { cells } = await setup();
        const stub = stubBuilder('frequencyShifter');
        cells.registerEffect('frequencyShifter', { build: stub.build });
        cells.buildRoom('shimmer', GainCtor, DelayCtor);
        cells.buildBranch('frequencyShifter', 'shimmer', null, GainCtor);
        cells.wireCells();
        cells.writeCellMix('frequencyShifter', 1);
        cells.setRoomFed('shimmer', true);
        cells.setRoomFed('shimmer', false);
        context.fireAll();
        return { cells, branch: cells.getCell('frequencyShifter')!, node: stub.built[0], ...stub };
      }

      describe('built at a light (Task 1)', () => {
        it('a registered empty branch builds its effect at its first light, connects it under a wet of 0, then ramps', async () => {
          const { cells, room, branch, build, built } = await emptyGrit();
          cells.setRoomFed('grit', true);
          expect(build).not.toHaveBeenCalled(); // fed, but its depth is 0: dark

          cells.writeCellMix('distortion', 0.3);

          expect(build).toHaveBeenCalledTimes(1);
          const node = built[0];
          expect(branch.effect).toBe(node);
          expect(branch.connected).toBe(true);
          expect(edgesFrom(room.in)).toContain(node.effectSend);
          expect(edgesFrom(node.effectReturn)).toEqual([branch.wet]);
          expect(fake(branch.wet).gain.value).toBe(0);
          const wetRamp = fake(branch.wet).gain.rampTo;
          expect(wetRamps(branch)).toEqual([expect.closeTo(colourWetGainOf(0.3), 12)]);
          expect(order(wetRamp)).toBeGreaterThan(order(node.effectReturn.connect));
          expect(context.timeouts).toEqual([]);
        });

        it('records the built effect LFOs and stops them before the connect starts them', async () => {
          const { cells, branch, built } = await emptyGrit();
          cells.setRoomFed('grit', true);
          cells.writeCellMix('distortion', 0.3);
          const node = built[0];
          expect(branch.lfos).toEqual([node._lfoL, node._lfoR]);
          for (const l of [node._lfoL, node._lfoR]) {
            expect(l.stop).toHaveBeenCalledTimes(1);
            expect(l.start).toHaveBeenCalledTimes(1);
            expect(order(l.stop)).toBeLessThan(order(l.start));
          }
        });

        it('a second light and a depth change while lit build nothing more', async () => {
          const { cells, branch, build, built } = await emptyGrit();
          cells.setRoomFed('grit', true);
          cells.writeCellMix('distortion', 0.3);
          cells.writeCellMix('distortion', 0.3);
          cells.writeCellMix('distortion', 0.6);
          expect(build).toHaveBeenCalledTimes(1);
          expect(branch.effect).toBe(built[0]);
          expect(wetRamps(branch).at(-1)).toBeCloseTo(colourWetGainOf(0.6), 12);
        });

        it('a depth written while the room is unfed builds nothing; the feed then lights it and builds once', async () => {
          const { cells, branch, build } = await emptyGrit();
          cells.writeCellMix('distortion', 0.3);
          expect(build).not.toHaveBeenCalled();
          expect(branch.depth).toBe(0.3);
          expect(branch.connected).toBe(false);
          expect(context.timeouts).toEqual([]);

          cells.setRoomFed('grit', true);
          expect(build).toHaveBeenCalledTimes(1);
          expect(branch.connected).toBe(true);
        });

        it('a registered empty chain cell builds at a Mix above 0 and ramps both gains; a Mix of 0 builds nothing', async () => {
          const { cells, cell, build, built } = await emptyTremolo();
          cells.writeCellMix('tremolo', 0);
          expect(build).not.toHaveBeenCalled();
          expect(context.timeouts).toEqual([]);

          cells.writeCellMix('tremolo', 0.5);
          expect(build).toHaveBeenCalledTimes(1);
          expect(cell.effect).toBe(built[0]);
          expect(cell.connected).toBe(true);
          expect(edgesFrom(cell.in)).toContain(built[0].effectSend);
          expect(fake(cell.dry).gain.rampTo).toHaveBeenCalled();
          expect(fake(cell.wet).gain.rampTo).toHaveBeenCalled();
          expect(cells.getConnectedEffectCount()).toBe(1);
        });

        it('a throwing builder warns once over two lights, leaves the cell dry and unconnected each time, and the next light tries again', async () => {
          const { cells, devWarn, branch, build, built } = await emptyGrit();
          const fails = () => {
            throw new Error('no constructor today');
          };
          build.mockImplementationOnce(fails).mockImplementationOnce(fails);
          cells.setRoomFed('grit', true);

          cells.writeCellMix('distortion', 0.3);
          expect(branch.effect).toBeNull();
          expect(branch.connected).toBe(false);
          expect(branch.mix).toBe(0);
          expect(wetRamps(branch)).toEqual([]);
          expect(context.timeouts).toEqual([]);

          cells.writeCellMix('distortion', 0.3); // the same value: a retry, not a re-send
          expect(build).toHaveBeenCalledTimes(2);
          expect(branch.effect).toBeNull();
          expect(wetRamps(branch)).toEqual([]);
          expect(devWarn).toHaveBeenCalledTimes(1);
          expect(String(devWarn.mock.calls[0][0])).toContain('distortion');

          cells.writeCellMix('distortion', 0.3);
          expect(build).toHaveBeenCalledTimes(3);
          expect(branch.effect).toBe(built[0]);
          expect(branch.connected).toBe(true);
          expect(devWarn).toHaveBeenCalledTimes(1);
        });

        it('a throwing builder on a chain cell writes neither gain', async () => {
          const { cells, cell, build } = await emptyTremolo();
          build.mockImplementation(() => {
            throw new Error('no constructor today');
          });
          cells.writeCellMix('tremolo', 0.5);
          expect(cell.connected).toBe(false);
          expect(fake(cell.dry).gain.rampTo).not.toHaveBeenCalled();
          expect(fake(cell.wet).gain.rampTo).not.toHaveBeenCalled();
        });

        it('an unregistered empty chain cell ignores every write, as today', async () => {
          const { cells } = await setup();
          cells.buildCell('autoWah', null, GainCtor, DelayCtor);
          cells.wireCells();
          const cell = cells.getCell('autoWah')!;
          cells.writeCellMix('autoWah', 0.5);
          cells.writeCellMix('autoWah', 0);
          expect(cell.effect).toBeNull();
          expect(cell.connected).toBe(false);
          expect(cell.mix).toBe(0);
          expect(fake(cell.dry).gain.rampTo).not.toHaveBeenCalled();
          expect(fake(cell.wet).gain.rampTo).not.toHaveBeenCalled();
          expect(context.timeouts).toEqual([]);
        });

        it('an unregistered key with no effect gets no branch, as today', async () => {
          const { cells } = await emptyGrit(false);
          expect(cells.getCell('distortion')).toBeUndefined();
        });

        it('clearCells drops the registrations with the cells', async () => {
          const { cells, build } = await emptyTremolo();
          cells.clearCells();
          cells.buildCell('tremolo', null, GainCtor, DelayCtor);
          cells.writeCellMix('tremolo', 0.5);
          expect(build).not.toHaveBeenCalled();
          expect(cells.getCell('tremolo')!.connected).toBe(false);
          cells.buildRoom('grit', GainCtor, DelayCtor);
          cells.buildBranch('distortion', 'grit', null, GainCtor);
          expect(cells.getCell('distortion')).toBeUndefined();
        });
      });

      describe('torn down after a darken (Task 2)', () => {
        it('exports the wait, 1 s on the context timer', async () => {
          const { DARK_TEARDOWN_SECONDS } = await import('./bypassCell');
          expect(DARK_TEARDOWN_SECONDS).toBe(1);
        });

        it('a branch darkened by its depth disconnects at the first fire, arms one teardown, and is disposed at the second', async () => {
          const { cells, branch, node, onTeardown } = await litGrit();
          cells.writeCellMix('distortion', 0);
          expect(context.timeouts).toHaveLength(1); // the darken's disconnect only

          context.fireAll();
          expect(branch.connected).toBe(false);
          expect(branch.effect).toBe(node);
          expect(context.timeouts).toHaveLength(1);
          expect(context.timeouts[0].seconds).toBe(1);
          expect(node.dispose).not.toHaveBeenCalled();
          expect(onTeardown).not.toHaveBeenCalled();

          context.fireAll();
          expect(node.dispose).toHaveBeenCalledTimes(1);
          expect(branch.effect).toBeNull();
          expect(branch.lfos).toEqual([]);
          expect(onTeardown).toHaveBeenCalledTimes(1);
          expect(order(onTeardown)).toBeGreaterThan(order(node.dispose));
          expect(context.timeouts).toEqual([]);
          expect(cells.getConnectedEffectCount()).toBe(0);
          expect(cells.roomNodes('grit')).not.toContain(node);
        });

        it('the next light after a teardown builds a fresh effect and lights it', async () => {
          const { cells, branch, build, built } = await litGrit();
          cells.writeCellMix('distortion', 0);
          context.fireAll();
          context.fireAll();

          cells.writeCellMix('distortion', 0.5);
          expect(build).toHaveBeenCalledTimes(2);
          expect(branch.effect).toBe(built[1]);
          expect(branch.connected).toBe(true);
          expect(wetRamps(branch).at(-1)).toBeCloseTo(colourWetGainOf(0.5), 12);
        });

        it('a light inside the wait cancels the teardown and lights the same node, building nothing', async () => {
          const { cells, branch, node, build } = await litGrit();
          cells.writeCellMix('distortion', 0);
          context.fireAll();
          const teardown = context.timeouts[0];

          cells.writeCellMix('distortion', 0.3);
          expect(context.cleared).toContain(teardown.id);
          expect(context.timeouts).toEqual([]);
          expect(build).toHaveBeenCalledTimes(1);
          expect(branch.effect).toBe(node);
          expect(branch.connected).toBe(true);
          context.fireAll();
          expect(node.dispose).not.toHaveBeenCalled();
        });

        it('a branch darkened only by its room going unfed keeps its effect: no teardown, and a re-feed lights the same node', async () => {
          const { cells, branch, node, build } = await litGrit();
          cells.setRoomFed('grit', false);
          context.fireAll();
          expect(branch.connected).toBe(false);
          expect(context.timeouts).toEqual([]);
          expect(branch.effect).toBe(node);
          expect(node.dispose).not.toHaveBeenCalled();

          cells.setRoomFed('grit', true);
          expect(build).toHaveBeenCalledTimes(1);
          expect(branch.effect).toBe(node);
          expect(branch.connected).toBe(true);
        });

        it('a branch darkened by a Return of 0 on its fed room is torn down', async () => {
          const { cells, branch, node } = await litGrit();
          cells.setRoomReturn('grit', 0);
          context.fireAll();
          expect(context.timeouts).toHaveLength(1);
          context.fireAll();
          expect(node.dispose).toHaveBeenCalledTimes(1);
          expect(branch.effect).toBeNull();
        });

        it('a chain cell darkened by a Mix of 0 is torn down', async () => {
          const { cells, cell, built, onTeardown } = await emptyTremolo();
          cells.writeCellMix('tremolo', 0.5);
          cells.writeCellMix('tremolo', 0);
          context.fireAll();
          expect(context.timeouts.map((t) => t.seconds)).toEqual([1]);
          context.fireAll();
          expect(built[0].dispose).toHaveBeenCalledTimes(1);
          expect(cell.effect).toBeNull();
          expect(onTeardown).toHaveBeenCalledTimes(1);
        });

        it('a darken whose disconnect Tone refuses leaves the effect in the path: no teardown', async () => {
          const { cells, branch, room, node } = await litGrit();
          fake(room.in).disconnect.mockImplementationOnce(() => {
            throw new Error('refused');
          });
          cells.writeCellMix('distortion', 0);
          context.fireAll();
          expect(branch.connected).toBe(true);
          expect(context.timeouts).toEqual([]);
          expect(node.dispose).not.toHaveBeenCalled();
        });

        it('an unregistered cell darkened keeps its effect for good', async () => {
          const { cells } = await setup();
          const wah = fakeNode('autoWah');
          cells.buildCell('autoWah', wah as unknown as Tone.ToneAudioNode, GainCtor, DelayCtor);
          cells.wireCells();
          cells.writeCellMix('autoWah', 0.5);
          cells.writeCellMix('autoWah', 0);
          context.fireAll();
          expect(context.timeouts).toEqual([]);
          context.fireAll();
          expect(wah.dispose).not.toHaveBeenCalled();
          expect(cells.getCell('autoWah')!.effect).toBe(wah);
        });

        it('clearCells cancels a pending teardown', async () => {
          const { cells, node } = await litGrit();
          cells.writeCellMix('distortion', 0);
          context.fireAll();
          const teardown = context.timeouts[0];
          cells.clearCells();
          expect(context.cleared).toContain(teardown.id);
          expect(context.timeouts).toEqual([]);
          fire(teardown); // a fire that slipped past the cancel finds its cell gone
          expect(node.dispose).not.toHaveBeenCalled();
        });
      });

      describe('checked on every write (Task 3)', () => {
        it('a depth of 0 on an unfed room, its branch already disconnected, arms the teardown (the re-sent dark write, as the hold-off sends it)', async () => {
          const { cells, branch, node } = await litGrit();
          cells.setRoomFed('grit', false);
          context.fireAll();
          expect(context.timeouts).toEqual([]);

          cells.writeCellMix('distortion', 0);
          expect(context.timeouts.map((t) => t.seconds)).toEqual([1]);
          context.fireAll();
          expect(node.dispose).toHaveBeenCalledTimes(1);
          expect(branch.effect).toBeNull();
        });

        it('a depth raised again on the unfed room before the fire cancels the teardown and keeps the node, unlit', async () => {
          const { cells, branch, node } = await litGrit();
          cells.setRoomFed('grit', false);
          context.fireAll();
          cells.writeCellMix('distortion', 0);
          const teardown = context.timeouts[0];

          cells.writeCellMix('distortion', 0.3);
          expect(context.cleared).toContain(teardown.id);
          expect(context.timeouts).toEqual([]);
          expect(branch.connected).toBe(false);
          expect(branch.effect).toBe(node);
          expect(node.dispose).not.toHaveBeenCalled();
        });

        it('on a pinned branch of an unfed room, a Return of 0 arms the teardown and a Return of 0.5 before the fire cancels it', async () => {
          const { cells, branch, node } = await unfedShimmer();
          expect(context.timeouts).toEqual([]);

          cells.setRoomReturn('shimmer', 0);
          expect(context.timeouts.map((t) => t.seconds)).toEqual([1]);
          const teardown = context.timeouts[0];

          cells.setRoomReturn('shimmer', 0.5);
          expect(context.cleared).toContain(teardown.id);
          expect(context.timeouts).toEqual([]);
          context.fireAll();
          expect(branch.effect).toBe(node);
          expect(node.dispose).not.toHaveBeenCalled();
        });

        it('a Return of 0 on an unfed room left to its fire tears the branch down; feeding the room after builds it again', async () => {
          const { cells, branch, node, build } = await unfedShimmer();
          cells.setRoomReturn('shimmer', 0);
          context.fireAll();
          expect(node.dispose).toHaveBeenCalledTimes(1);
          expect(branch.effect).toBeNull();

          cells.setRoomFed('shimmer', true);
          expect(build).toHaveBeenCalledTimes(1); // the Return is still 0: dark
          cells.setRoomReturn('shimmer', 0.8);
          expect(build).toHaveBeenCalledTimes(2);
          expect(branch.connected).toBe(true);
        });

        it('a re-sent dark write keeps a pending teardown as it is, so the wait still runs from the disconnect', async () => {
          const { cells } = await litGrit();
          cells.writeCellMix('distortion', 0);
          context.fireAll();
          const teardown = context.timeouts[0];

          cells.writeCellMix('distortion', 0);
          cells.setRoomFed('grit', false);
          cells.setRoomFed('grit', true);
          expect(context.timeouts.map((t) => t.id)).toEqual([teardown.id]);
          expect(context.cleared).not.toContain(teardown.id);
        });

        it('a re-sent dark write on a torn-down cell arms nothing', async () => {
          const { cells } = await emptyTremolo();
          cells.writeCellMix('tremolo', 0.5);
          cells.writeCellMix('tremolo', 0);
          context.fireAll();
          context.fireAll();
          cells.writeCellMix('tremolo', 0);
          expect(context.timeouts).toEqual([]);
        });
      });

      describe('a teardown cancels its key duck (Task 4)', () => {
        /** A lit Tremolo ducked, darkened, its disconnect fired, and the duck re-armed past it: the teardown pending. */
        async function duckPastDarken() {
          const tremolo = await emptyTremolo();
          const { cells } = tremolo;
          cells.writeCellMix('tremolo', 0.5);
          cells.duckCell('tremolo', vi.fn());
          cells.writeCellMix('tremolo', 0);
          fire(context.timeouts[1]); // the darken's disconnect, the duck's first change still pending
          expect(tremolo.cell.connected).toBe(false);
          const apply = vi.fn();
          expect(cells.needsDuck('tremolo')).toBe(true);
          cells.duckCell('tremolo', apply); // a drag still re-arming it
          const [teardown, duck] = context.timeouts;
          expect(teardown.seconds).toBe(1);
          return { ...tremolo, apply, teardown, duck };
        }

        it('the teardown clears the pending duck: its timer is cancelled, its apply never runs, the key is not ducked', async () => {
          const { cells, cell, built, apply, teardown, duck, onTeardown } = await duckPastDarken();

          fire(teardown);

          expect(context.cleared).toContain(duck.id);
          expect(cells.isDucked('tremolo')).toBe(false);
          expect(built[0].dispose).toHaveBeenCalledTimes(1);
          expect(cell.effect).toBeNull();
          expect(onTeardown).toHaveBeenCalledTimes(1);
          expect(context.timeouts).toEqual([]);
          context.fireAll();
          expect(apply).not.toHaveBeenCalled();
        });

        it('a light in the wait keeps the duck, which then runs as before', async () => {
          const { cells, cell, built, apply } = await duckPastDarken();

          cells.writeCellMix('tremolo', 0.5);
          context.fireAll();

          expect(apply).toHaveBeenCalledTimes(1);
          expect(cells.isDucked('tremolo')).toBe(false);
          expect(cell.effect).toBe(built[0]);
          expect(cell.connected).toBe(true);
        });

        it('a duck on a lit registered cell runs as before', async () => {
          const { cells } = await emptyTremolo();
          cells.writeCellMix('tremolo', 0.5);
          const apply = vi.fn();
          cells.duckCell('tremolo', apply);
          context.fireAll();
          expect(apply).toHaveBeenCalledTimes(1);
          expect(cells.isDucked('tremolo')).toBe(false);
        });
      });
    });
  });
});
