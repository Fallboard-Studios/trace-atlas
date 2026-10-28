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
  });
});
