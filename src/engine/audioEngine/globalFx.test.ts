// ========================================
// IMPORTS
// ========================================
import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';

// Mock Tone.js — same node shapes as AudioEngine.test.ts's own mock, minus
// Chorus (removed entirely in V2) and plus Limiter (added in V2). Every node
// carries its own `connect`/`disconnect` spy so tests can assert exact
// connection sequences per topology.
// Global Colour T3 (docs/specs/GLOBAL_COLOUR.md section 1.3). BitCrusher is hoisted so every access sees one
// constructor with one call history, and so a test can hide it (a headless env, or a browser without worklets).
const toneFlags = vi.hoisted(() => ({
  // Tone.getContext()'s audio-clock timer, which the Spread de-click defers its write on (docs/specs/GLOBAL_PEDALS.md
  // §8). A test fires a pending callback by hand with fireTimeouts(); `lookAhead` is the context's, read at call time.
  lookAhead: 0.1,
  timeouts: [] as Array<{ id: number; fn: () => void; seconds: number }>,
  nextTimeoutId: 0,
  // Global Modulation T4 (docs/specs/GLOBAL_MODULATION_COLOUR.md section 1.3): AutoWah is hoisted for the same two
  // reasons - one constructor with one call history, and a switch to hide it. Q, gain and wet are Signals; the
  // sweep range, sensitivity and follower smoothing are plain properties, as in Tone 15.
  // Global Modulation T5: the Phaser. Its `stages` is constructor-only in Tone 15, so a test reads it from the
  // constructor's call arguments; `frequency`, `Q` and `wet` are Signals, `octaves` and `baseFrequency` plain
  // properties, and `dispose` is a spy so a rebuild can be seen to release the node it replaces.
  phaserAbsent: false,
  phaserCtor: vi.fn(
    (opts: { frequency?: number; octaves?: number; stages?: number; Q?: number; baseFrequency?: number; wet?: number } = {}) => ({
      connect: vi.fn().mockReturnThis(),
      disconnect: vi.fn(),
      toDestination: vi.fn(),
      dispose: vi.fn(),
      octaves: opts.octaves ?? 2,
      baseFrequency: opts.baseFrequency ?? 350,
      frequency: { value: opts.frequency ?? 0.5, rampTo: vi.fn() },
      Q: { value: opts.Q ?? 10, rampTo: vi.fn() },
      wet: { value: opts.wet ?? 1, rampTo: vi.fn() },
    }),
  ),
  wahAbsent: false,
  wahCtor: vi.fn(
    (opts: { baseFrequency?: number; octaves?: number; sensitivity?: number; follower?: number; Q?: number; gain?: number; wet?: number } = {}) => ({
      connect: vi.fn().mockReturnThis(),
      disconnect: vi.fn(),
      toDestination: vi.fn(),
      baseFrequency: opts.baseFrequency ?? 100,
      octaves: opts.octaves ?? 2.6,
      sensitivity: opts.sensitivity ?? 0,
      follower: opts.follower ?? 0.1,
      Q: { value: opts.Q ?? 2, rampTo: vi.fn() },
      gain: { value: opts.gain ?? 2, rampTo: vi.fn() },
      wet: { value: opts.wet ?? 1, rampTo: vi.fn() },
    }),
  ),
  // Global Pedals T4 (docs/specs/GLOBAL_PEDALS.md section 1.3): the Chorus and the Tremolo, hoisted for one call
  // history and a switch to hide each. Both are Tone LFOEffects whose constructor does NOT start the LFOs, so `start`
  // is a spy. Chorus: `frequency` and `feedback` are Signals, `delayTime` / `depth` / `spread` plain setters.
  // Tremolo: `frequency` and `depth` are Signals, `spread` a plain setter. `wet` is a Signal on both.
  chorusAbsent: false,
  chorusCtor: vi.fn(
    (opts: { frequency?: number; delayTime?: number; depth?: number; spread?: number; feedback?: number; wet?: number } = {}) => {
      const node = {
        connect: vi.fn().mockReturnThis(),
        disconnect: vi.fn(),
        toDestination: vi.fn(),
        start: vi.fn(),
        delayTime: opts.delayTime ?? 3.5,
        depth: opts.depth ?? 0.7,
        spread: opts.spread ?? 180,
        frequency: { value: opts.frequency ?? 1.5, rampTo: vi.fn() },
        feedback: { value: opts.feedback ?? 0, rampTo: vi.fn() },
        wet: { value: opts.wet ?? 1, rampTo: vi.fn() },
      };
      node.start.mockReturnValue(node);
      return node;
    },
  ),
  tremoloAbsent: false,
  tremoloCtor: vi.fn((opts: { frequency?: number; depth?: number; spread?: number; wet?: number } = {}) => {
    const node = {
      connect: vi.fn().mockReturnThis(),
      disconnect: vi.fn(),
      toDestination: vi.fn(),
      start: vi.fn(),
      spread: opts.spread ?? 180,
      frequency: { value: opts.frequency ?? 10, rampTo: vi.fn() },
      depth: { value: opts.depth ?? 0.5, rampTo: vi.fn() },
      wet: { value: opts.wet ?? 1, rampTo: vi.fn() },
    };
    node.start.mockReturnValue(node);
    return node;
  }),
  // Global Pedals T5: the Vibrato and the FrequencyShifter, plain Tone Effects. The Vibrato's constructor starts its own
  // LFO, so `start` is a spy that must stay uncalled; `frequency` and `depth` are Signals. The shifter's `frequency` is
  // a signed Signal. `wet` is a Signal on both.
  vibratoAbsent: false,
  vibratoCtor: vi.fn((opts: { frequency?: number; depth?: number; wet?: number } = {}) => ({
    connect: vi.fn().mockReturnThis(),
    disconnect: vi.fn(),
    toDestination: vi.fn(),
    start: vi.fn(),
    frequency: { value: opts.frequency ?? 5, rampTo: vi.fn() },
    depth: { value: opts.depth ?? 0.1, rampTo: vi.fn() },
    wet: { value: opts.wet ?? 1, rampTo: vi.fn() },
  })),
  shifterAbsent: false,
  shifterCtor: vi.fn((opts: { frequency?: number; wet?: number } = {}) => ({
    connect: vi.fn().mockReturnThis(),
    disconnect: vi.fn(),
    toDestination: vi.fn(),
    frequency: { value: opts.frequency ?? 0, rampTo: vi.fn() },
    wet: { value: opts.wet ?? 1, rampTo: vi.fn() },
  })),
  // The cycle-search cuts (docs/specs/GLOBAL_PEDALS.md, as-built): zero-delay Tone.Delay nodes at the chain entry and
  // after the High-Pass Filter. `delayTime` is a Param.
  cutAbsent: false,
  cutCtor: vi.fn((opts: { delayTime?: number; maxDelay?: number } = {}) => ({
    connect: vi.fn().mockReturnThis(),
    disconnect: vi.fn(),
    toDestination: vi.fn(),
    delayTime: { value: opts.delayTime ?? 0 },
  })),
  // Global Pedals T6: the StereoWidener between the Compressor and the Limiter. `width` and `wet` are Signals.
  widenerAbsent: false,
  widenerCtor: vi.fn((opts: { width?: number; wet?: number } = {}) => ({
    connect: vi.fn().mockReturnThis(),
    disconnect: vi.fn(),
    toDestination: vi.fn(),
    width: { value: opts.width ?? 0.5, rampTo: vi.fn() },
    wet: { value: opts.wet ?? 1, rampTo: vi.fn() },
  })),
  crusherAbsent: false,
  crusherCtor: vi.fn((opts: { bits?: number; wet?: number } = {}) => ({
    connect: vi.fn().mockReturnThis(),
    disconnect: vi.fn(),
    toDestination: vi.fn(),
    bits: { value: opts.bits ?? 4, rampTo: vi.fn() },
    wet: { value: opts.wet ?? 1, rampTo: vi.fn() },
  })),
}));

vi.mock('tone', () => ({
  // Distortion and Chebyshev keep their shape value as a plain property; BitCrusher's `bits` is a Param.
  // `wet` is a Signal on all three.
  Distortion: vi.fn((opts: { distortion?: number; oversample?: string; wet?: number } = {}) => ({
    connect: vi.fn().mockReturnThis(),
    disconnect: vi.fn(),
    toDestination: vi.fn(),
    distortion: opts.distortion ?? 0.4,
    oversample: opts.oversample ?? 'none',
    wet: { value: opts.wet ?? 1, rampTo: vi.fn() },
  })),
  Chebyshev: vi.fn((opts: { order?: number; oversample?: string; wet?: number } = {}) => ({
    connect: vi.fn().mockReturnThis(),
    disconnect: vi.fn(),
    toDestination: vi.fn(),
    order: opts.order ?? 1,
    oversample: opts.oversample ?? 'none',
    wet: { value: opts.wet ?? 1, rampTo: vi.fn() },
  })),
  get BitCrusher() {
    return toneFlags.crusherAbsent ? undefined : toneFlags.crusherCtor;
  },
  get AutoWah() {
    return toneFlags.wahAbsent ? undefined : toneFlags.wahCtor;
  },
  get Phaser() {
    return toneFlags.phaserAbsent ? undefined : toneFlags.phaserCtor;
  },
  get Chorus() {
    return toneFlags.chorusAbsent ? undefined : toneFlags.chorusCtor;
  },
  get Tremolo() {
    return toneFlags.tremoloAbsent ? undefined : toneFlags.tremoloCtor;
  },
  get Vibrato() {
    return toneFlags.vibratoAbsent ? undefined : toneFlags.vibratoCtor;
  },
  get FrequencyShifter() {
    return toneFlags.shifterAbsent ? undefined : toneFlags.shifterCtor;
  },
  get StereoWidener() {
    return toneFlags.widenerAbsent ? undefined : toneFlags.widenerCtor;
  },
  get Delay() {
    return toneFlags.cutAbsent ? undefined : toneFlags.cutCtor;
  },
  Compressor: vi.fn(() => ({
    connect: vi.fn().mockReturnThis(),
    disconnect: vi.fn(),
    toDestination: vi.fn().mockReturnThis(),
    threshold: { value: -18 },
    ratio: { value: 6 },
    attack: { value: 0.003 },
    release: { value: 0.15 },
    knee: { value: 0 },
  })),
  Reverb: vi.fn(() => ({
    connect: vi.fn().mockReturnThis(),
    disconnect: vi.fn(),
    toDestination: vi.fn(),
    ready: Promise.resolve(),
    wet: { value: 0.3 },
    decay: 1.5,
    preDelay: 0.02,
  })),
  FeedbackDelay: vi.fn(() => ({
    connect: vi.fn().mockReturnThis(),
    disconnect: vi.fn(),
    toDestination: vi.fn(),
    wet: { value: 0 },
    delayTime: { value: 0.25 },
    feedback: { value: 0.2 },
  })),
  EQ3: vi.fn(() => ({
    connect: vi.fn().mockReturnThis(),
    disconnect: vi.fn(),
    toDestination: vi.fn(),
    low: { value: 0 },
    mid: { value: 0 },
    high: { value: 0 },
  })),
  Filter: vi.fn(() => ({
    connect: vi.fn().mockReturnThis(),
    disconnect: vi.fn(),
    toDestination: vi.fn(),
    frequency: { value: 20000, rampTo: vi.fn() },
    Q: { value: 1 },
  })),
  Gain: vi.fn(() => ({
    connect: vi.fn().mockReturnThis(),
    disconnect: vi.fn(),
    toDestination: vi.fn(),
    gain: { value: 1 },
  })),
  Limiter: vi.fn(() => ({
    connect: vi.fn().mockReturnThis(),
    disconnect: vi.fn(),
    toDestination: vi.fn(),
    threshold: { value: -12 },
  })),
  // The read-only output taps (docs/specs/AUDIO_OUTPUT_DIAGNOSTIC.md) are NATIVE AnalyserNodes made from Tone's raw
  // context: Tone.Analyser cannot be used, because it sets fftSize = 2 * size and caps size at 16384, so it can neither
  // build a 32768 window nor read more than half of one (found in the real-browser check, Task 6).
  getContext: vi.fn(() => ({
    rawContext: { createAnalyser: () => createAnalyser() },
    lookAhead: toneFlags.lookAhead,
    setTimeout: (fn: () => void, seconds: number) => {
      toneFlags.nextTimeoutId += 1;
      toneFlags.timeouts.push({ id: toneFlags.nextTimeoutId, fn, seconds });
      return toneFlags.nextTimeoutId;
    },
    clearTimeout: (id: number) => {
      toneFlags.timeouts = toneFlags.timeouts.filter((t) => t.id !== id);
    },
  })),
}));

/** Run every pending Tone.getContext().setTimeout callback, as the audio clock passing their time would. */
function fireTimeouts(): void {
  const due = toneFlags.timeouts;
  toneFlags.timeouts = [];
  for (const t of due) t.fn();
}

/** A native AnalyserNode stand-in that enforces the real API's fftSize limit (a power of two, 32..32768). */
function makeFakeAnalyser() {
  let fftSize = 2048;
  return {
    get fftSize() {
      return fftSize;
    },
    set fftSize(value: number) {
      if (value < 32 || value > 32768) throw new RangeError(`fftSize ${value} is out of range`);
      fftSize = value;
    },
    connect: vi.fn(),
    disconnect: vi.fn(),
    getFloatTimeDomainData: vi.fn((buffer: Float32Array) => {
      buffer.fill(0.25);
    }),
  };
}
const createAnalyser = vi.fn(() => makeFakeAnalyser());

vi.mock('@/utils/helpers', () => ({
  devLog: vi.fn(),
  devWarn: vi.fn(),
}));

import * as Tone from 'tone';
import { devWarn } from '@/utils/helpers';
import { SAMPLE_INTERVAL_MS } from '@/utils/audioHealth';

// ========================================
// TEST HELPERS
// ========================================
type AnyMock = Mock & { mock: { results: Array<{ value: unknown }> } };

/** Most recently constructed instance of a mocked Tone constructor. */
const lastInstance = (ctor: unknown) => (ctor as unknown as AnyMock).mock.results.at(-1)?.value;
/** Second-to-most-recently constructed instance — Filter is constructed
 * twice per build (LPF then HPF), so LPF is always the second-to-last. */
const secondLastInstance = (ctor: unknown) => (ctor as unknown as AnyMock).mock.results.at(-2)?.value;
/** The return Gain a room feeds: whatever the room most recently connected to. Found through the wiring itself,
 *  so these tests do not depend on the order buildGlobalFxChain constructs its Gains in. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const returnOf = (room: any) => room.connect.mock.calls.at(-1)?.[0];
/** The post-filter cycle-search cut: the second (last) Delay node a build makes, between the HPF and the Distortion. */
const filterCutOf = () => toneFlags.cutCtor.mock.results.at(-1)?.value;

describe('globalFx', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    toneFlags.crusherAbsent = false;
    toneFlags.wahAbsent = false;
    toneFlags.phaserAbsent = false;
    toneFlags.chorusAbsent = false;
    toneFlags.tremoloAbsent = false;
    toneFlags.vibratoAbsent = false;
    toneFlags.shifterAbsent = false;
    toneFlags.widenerAbsent = false;
    toneFlags.cutAbsent = false;
    toneFlags.lookAhead = 0.1;
    toneFlags.timeouts = [];
  });

  describe('getGlobalChainEntry', () => {
    it('returns null before buildGlobalFxChain() has run', async () => {
      const globalFx = await import('./globalFx');
      expect(globalFx.getGlobalChainEntry()).toBeNull();
    });

    // The entry is the zero-delay cut in front of the EQ3 (see the cycle-search cuts block below), so every robot bus
    // connects into a delay node; the cut feeds the EQ3, still first in both topologies.
    it('returns the entry cut after build, which feeds the EQ3', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      const entry = globalFx.getGlobalChainEntry() as unknown as { delayTime: unknown; connect: ReturnType<typeof vi.fn> };
      expect(entry).toBe(toneFlags.cutCtor.mock.results[0].value);
      expect('delayTime' in entry).toBe(true);
      expect(entry.connect).toHaveBeenCalledWith(lastInstance(Tone.EQ3));
    });

    it('returns the EQ3 itself when no Delay constructor exists (headless)', async () => {
      toneFlags.cutAbsent = true;
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      expect(globalFx.getGlobalChainEntry()).toBe(lastInstance(Tone.EQ3));
    });
  });

  // ========================================
  // The cycle-search cuts (docs/specs/GLOBAL_PEDALS.md, as-built). Tone's standardized-audio-context runs detectCycles on
  // every connect and disconnect: it enumerates EVERY simple path downstream of the destination and stops only at a node
  // with a `delayTime`. Each Tone effect has a dry and a wet path and the stereo / mid-side ones split again, so the count
  // multiplies stage by stage; with the five Global Pedals a power-on took an estimated ~14 minutes of main thread. Two
  // zero-delay DelayNodes (no cycle, so no latency) bound every search, and a rewire disconnects downstream first.
  // ========================================
  describe('the cycle-search cuts', () => {
    it('constructs exactly two zero-delay Delay nodes with a tiny buffer', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      expect(toneFlags.cutCtor).toHaveBeenCalledTimes(2);
      for (const call of toneFlags.cutCtor.mock.calls) {
        expect(call[0]).toStrictEqual({ delayTime: 0, maxDelay: 0.01 });
      }
    });

    it.each([false, true])('puts a cut in front of the EQ3 and one between the HPF and the Distortion, controlledDecay=%s', async (controlled) => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      const [entryCut, filterCut] = toneFlags.cutCtor.mock.results.map((r) => r.value);
      const hpf = lastInstance(Tone.Filter);
      for (const node of [entryCut, filterCut, hpf]) node.connect.mockClear();

      globalFx.wireGlobalFxChain(controlled);

      expect(entryCut.connect.mock.calls).toEqual([[lastInstance(Tone.EQ3)]]);
      expect(hpf.connect.mock.calls).toEqual([[filterCut]]);
      expect(filterCut.connect.mock.calls).toEqual([[lastInstance(Tone.Distortion)]]);
    });

    it('keeps the cuts across a rewire: never rebuilt', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      globalFx.wireGlobalFxChain(true);
      globalFx.wireGlobalFxChain(false);
      expect(toneFlags.cutCtor).toHaveBeenCalledTimes(2);
    });

    it('wires HPF -> Distortion and enters at the EQ3 when the Delay constructor is absent', async () => {
      toneFlags.cutAbsent = true;
      const globalFx = await import('./globalFx');
      expect(() => globalFx.buildGlobalFxChain()).not.toThrow();
      expect(lastInstance(Tone.Filter).connect).toHaveBeenCalledWith(lastInstance(Tone.Distortion));
    });

    it('builds and wires on when the Delay constructor throws, falling back to the EQ3 entry', async () => {
      toneFlags.cutCtor.mockImplementation(() => {
        throw new Error('no delay');
      });
      try {
        const globalFx = await import('./globalFx');
        expect(() => globalFx.buildGlobalFxChain()).not.toThrow();
        expect(devWarn).toHaveBeenCalledWith(expect.stringContaining('cut'), expect.any(Error));
        expect(globalFx.getGlobalChainEntry()).toBe(lastInstance(Tone.EQ3));
        expect(lastInstance(Tone.Filter).connect).toHaveBeenCalledWith(lastInstance(Tone.Distortion));
      } finally {
        toneFlags.cutCtor.mockReset();
        toneFlags.cutCtor.mockImplementation((opts: { delayTime?: number; maxDelay?: number } = {}) => ({
          connect: vi.fn().mockReturnThis(),
          disconnect: vi.fn(),
          toDestination: vi.fn(),
          delayTime: { value: opts.delayTime ?? 0 },
        }));
      }
    });

    // A disconnect runs detectCycles from each destination it drops. Dropping the downstream nodes first means every
    // later search starts from a node that has no outputs left (a front-to-back rewire took 2.6 s with the pedals).
    it('disconnects the chain downstream first on a rewire: master, Limiter, widener, ..., EQ3, entry cut', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      const [entryCut, filterCut] = toneFlags.cutCtor.mock.results.map((r) => r.value);
      const chain = [
        entryCut,
        lastInstance(Tone.EQ3),
        secondLastInstance(Tone.Filter),
        lastInstance(Tone.Filter),
        filterCut,
        lastInstance(Tone.Distortion),
        lastInstance(Tone.Chebyshev),
        lastInstance(toneFlags.crusherCtor),
        lastInstance(toneFlags.wahCtor),
        lastInstance(toneFlags.phaserCtor),
        lastInstance(toneFlags.chorusCtor),
        lastInstance(toneFlags.tremoloCtor),
        lastInstance(toneFlags.vibratoCtor),
        lastInstance(toneFlags.shifterCtor),
        lastInstance(Tone.Compressor),
        lastInstance(toneFlags.widenerCtor),
        lastInstance(Tone.Limiter),
        lastInstance(Tone.Gain),
      ];
      for (const node of chain) node.disconnect.mockClear();

      globalFx.wireGlobalFxChain(true);

      const order = chain.map((node) => node.disconnect.mock.invocationCallOrder[0]);
      for (const at of order) expect(at).toBeDefined();
      expect(order).toStrictEqual([...order].sort((a, b) => b - a));
    });

    it('disconnects each room after the return it feeds, and each return after the master', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      const rooms = [lastInstance(Tone.Reverb), lastInstance(Tone.FeedbackDelay)];
      const nodes = [...rooms, ...rooms.map(returnOf), lastInstance(Tone.Gain)];
      for (const node of nodes) node.disconnect.mockClear();
      globalFx.wireGlobalFxChain(true);
      const at = (node: { disconnect: ReturnType<typeof vi.fn> }) => node.disconnect.mock.invocationCallOrder[0];
      for (const room of rooms) expect(at(room)).toBeGreaterThan(at(returnOf(room)));
      for (const room of rooms) expect(at(returnOf(room))).toBeGreaterThan(at(lastInstance(Tone.Gain)));
    });
  });

  it('no longer exports getMasterCompressor — replaced by getGlobalChainEntry', async () => {
    const globalFx = await import('./globalFx');
    expect('getMasterCompressor' in globalFx).toBe(false);
  });

  // V2 removed the old Chorus; Global Pedals (docs/specs/GLOBAL_PEDALS.md) brings one back as a pedal after the Phaser.
  it('exports setGlobalChorus again — the Global Pedals Chorus', async () => {
    const globalFx = await import('./globalFx');
    expect(typeof globalFx.setGlobalChorus).toBe('function');
  });

  it('exports setGlobalLimiter', async () => {
    const globalFx = await import('./globalFx');
    expect(typeof globalFx.setGlobalLimiter).toBe('function');
  });

  describe('buildGlobalFxChain — Delay construction', () => {
    it('constructs Tone.FeedbackDelay with an explicit maxDelay of 10', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      expect(Tone.FeedbackDelay).toHaveBeenCalledWith(expect.objectContaining({ maxDelay: 10 }));
    });
  });

  // Robot Sends T2 (docs/specs/ROBOT_SENDS.md section 1.3): the two rooms are no longer in the serial chain.
  // Each robot sends into a room (wet 1); the room's output goes through a return Gain to a join node.
  describe('buildGlobalFxChain — the rooms and their returns (Robot Sends)', () => {
    it('constructs the Reverb and the FeedbackDelay fully wet, since the robots decide how much enters', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      expect(Tone.Reverb).toHaveBeenCalledWith(expect.objectContaining({ wet: 1 }));
      expect(Tone.FeedbackDelay).toHaveBeenCalledWith(expect.objectContaining({ wet: 1 }));
    });

    it('gives each room its own return Gain at unity, distinct from the other return and from masterGain', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      const reverbReturn = returnOf(lastInstance(Tone.Reverb));
      const delayReturn = returnOf(lastInstance(Tone.FeedbackDelay));
      const masterGain = lastInstance(Tone.Gain);

      const gains = (Tone.Gain as unknown as AnyMock).mock.results.map((r) => r.value);
      expect(gains).toContain(reverbReturn);
      expect(gains).toContain(delayReturn);
      expect(reverbReturn.gain.value).toBe(1);
      expect(delayReturn.gain.value).toBe(1);
      expect(reverbReturn).not.toBe(delayReturn);
      expect(reverbReturn).not.toBe(masterGain);
      expect(delayReturn).not.toBe(masterGain);
    });
  });

  describe('getGlobalReverbRoom / getGlobalDelayRoom', () => {
    it('return null before buildGlobalFxChain() has run', async () => {
      const globalFx = await import('./globalFx');
      expect(globalFx.getGlobalReverbRoom()).toBeNull();
      expect(globalFx.getGlobalDelayRoom()).toBeNull();
    });

    it('return the live Reverb and FeedbackDelay nodes after build', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      expect(globalFx.getGlobalReverbRoom()).toBe(lastInstance(Tone.Reverb));
      expect(globalFx.getGlobalDelayRoom()).toBe(lastInstance(Tone.FeedbackDelay));
    });
  });

  // Global Colour T3 (docs/specs/GLOBAL_COLOUR.md section 1.3): Distortion -> Chebyshev -> BitCrusher sit in the dry
  // chain between the High-Pass Filter and the Compressor. They are not rooms: nothing about a send or a return
  // touches them.
  describe('buildGlobalFxChain - the colour slot (Global Colour)', () => {
    it('constructs exactly one Distortion, one Chebyshev and one BitCrusher', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      expect(Tone.Distortion).toHaveBeenCalledTimes(1);
      expect(Tone.Chebyshev).toHaveBeenCalledTimes(1);
      expect(toneFlags.crusherCtor).toHaveBeenCalledTimes(1);
    });

    it('builds each dry (wet 0) with no oversampling and the spec shape defaults', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      expect(Tone.Distortion).toHaveBeenCalledWith({ distortion: 0.3, oversample: 'none', wet: 0 });
      expect(Tone.Chebyshev).toHaveBeenCalledWith({ order: 2, oversample: 'none', wet: 0 });
      expect(toneFlags.crusherCtor).toHaveBeenCalledWith({ bits: 8, wet: 0 });
    });

    it('wires HPF -> Distortion -> Chebyshev -> BitCrusher -> AutoWah in Natural Decay', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      const hpf = lastInstance(Tone.Filter);
      const dist = lastInstance(Tone.Distortion);
      const cheb = lastInstance(Tone.Chebyshev);
      const crush = lastInstance(toneFlags.crusherCtor);
      const wah = lastInstance(toneFlags.wahCtor);

      expect(hpf.connect).toHaveBeenCalledTimes(1);
      expect(hpf.connect).toHaveBeenCalledWith(filterCutOf());
      expect(filterCutOf().connect).toHaveBeenCalledWith(dist);
      expect(dist.connect).toHaveBeenCalledTimes(1);
      expect(dist.connect).toHaveBeenCalledWith(cheb);
      expect(cheb.connect).toHaveBeenCalledTimes(1);
      expect(cheb.connect).toHaveBeenCalledWith(crush);
      expect(crush.connect).toHaveBeenCalledTimes(1);
      // Global Modulation T4: the colour slot now hands on to the modulation slot, not the Compressor.
      expect(crush.connect).toHaveBeenCalledWith(wah);
    });

    it('keeps the same slot in Controlled Decay, with the returns joining after it at the Width stage (Global Pedals T6)', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      const dist = lastInstance(Tone.Distortion);
      const cheb = lastInstance(Tone.Chebyshev);
      const crush = lastInstance(toneFlags.crusherCtor);
      const widener = lastInstance(toneFlags.widenerCtor);
      const reverbReturn = returnOf(lastInstance(Tone.Reverb));

      globalFx.wireGlobalFxChain(true);

      expect(lastInstance(Tone.Filter).connect).toHaveBeenLastCalledWith(filterCutOf());
      expect(filterCutOf().connect).toHaveBeenLastCalledWith(dist);
      expect(dist.connect).toHaveBeenLastCalledWith(cheb);
      expect(cheb.connect).toHaveBeenLastCalledWith(crush);
      expect(crush.connect).toHaveBeenLastCalledWith(lastInstance(toneFlags.wahCtor));
      expect(reverbReturn.connect).toHaveBeenLastCalledWith(widener);
    });

    it('connects no colour node to a room or a return, and no room or return to a colour node', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      const rooms = [lastInstance(Tone.Reverb), lastInstance(Tone.FeedbackDelay)];
      const returns = rooms.map(returnOf);
      const colour = [lastInstance(Tone.Distortion), lastInstance(Tone.Chebyshev), lastInstance(toneFlags.crusherCtor)];

      for (const node of colour) {
        for (const other of [...rooms, ...returns]) expect(node.connect).not.toHaveBeenCalledWith(other);
      }
      for (const other of [...rooms, ...returns]) {
        for (const node of colour) expect(other.connect).not.toHaveBeenCalledWith(node);
      }
    });

    it('wires HPF -> Distortion -> Chebyshev -> AutoWah and does not throw when the BitCrusher constructor throws', async () => {
      toneFlags.crusherCtor.mockImplementationOnce(() => {
        throw new Error('AudioWorklet is not supported');
      });
      const globalFx = await import('./globalFx');
      expect(() => globalFx.buildGlobalFxChain()).not.toThrow();

      const dist = lastInstance(Tone.Distortion);
      const cheb = lastInstance(Tone.Chebyshev);
      expect(lastInstance(Tone.Filter).connect).toHaveBeenCalledWith(filterCutOf());
      expect(filterCutOf().connect).toHaveBeenCalledWith(dist);
      expect(dist.connect).toHaveBeenCalledWith(cheb);
      expect(cheb.connect).toHaveBeenCalledWith(lastInstance(toneFlags.wahCtor));
      expect(() => globalFx.setGlobalBitCrusher({ bits: 4, wet: 1 })).not.toThrow();
    });

    it('wires the same way when the BitCrusher constructor is absent altogether', async () => {
      toneFlags.crusherAbsent = true;
      const globalFx = await import('./globalFx');
      expect(() => globalFx.buildGlobalFxChain()).not.toThrow();

      const cheb = lastInstance(Tone.Chebyshev);
      expect(toneFlags.crusherCtor).not.toHaveBeenCalled();
      expect(cheb.connect).toHaveBeenCalledWith(lastInstance(toneFlags.wahCtor));
    });

    it('disconnects and reconnects the three exactly once per Decay Mode flip', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      const colour = [lastInstance(Tone.Distortion), lastInstance(Tone.Chebyshev), lastInstance(toneFlags.crusherCtor)];
      for (const node of colour) {
        node.connect.mockClear();
        node.disconnect.mockClear();
      }

      globalFx.wireGlobalFxChain(true);
      for (const node of colour) {
        expect(node.disconnect).toHaveBeenCalledTimes(1);
        expect(node.connect).toHaveBeenCalledTimes(1);
      }
      globalFx.wireGlobalFxChain(false);
      for (const node of colour) {
        expect(node.disconnect).toHaveBeenCalledTimes(2);
        expect(node.connect).toHaveBeenCalledTimes(2);
      }
    });
  });

  describe('colour setters (Global Colour)', () => {
    async function built() {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      return {
        globalFx,
        dist: lastInstance(Tone.Distortion),
        cheb: lastInstance(Tone.Chebyshev),
        crush: lastInstance(toneFlags.crusherCtor),
      };
    }

    it('exports the three setters', async () => {
      const globalFx = await import('./globalFx');
      expect(typeof globalFx.setGlobalDistortion).toBe('function');
      expect(typeof globalFx.setGlobalChebyshev).toBe('function');
      expect(typeof globalFx.setGlobalBitCrusher).toBe('function');
    });

    it('no-ops without throwing before the chain is built', async () => {
      const globalFx = await import('./globalFx');
      expect(() => globalFx.setGlobalDistortion({ amount: 0.5, wet: 0.5 })).not.toThrow();
      expect(() => globalFx.setGlobalChebyshev({ order: 3, wet: 0.5 })).not.toThrow();
      expect(() => globalFx.setGlobalBitCrusher({ bits: 4, wet: 0.5 })).not.toThrow();
    });

    // Mix is tapered (docs/specs/GLOBAL_COLOUR.md, as built after the Pixel listen, 2026-10-15): the three
    // saturators were far too strong across most of the slider, so the stored 0-1 Mix reaches the node squared.
    // The stored value, the seed bands and the share codes all keep meaning "slider position".
    describe('Mix taper (colourWetGain)', () => {
      it('is exported and maps the slider ends to the node ends: 0 stays dry, 1 stays fully wet', async () => {
        const { colourWetGain } = await import('./globalFx');
        expect(colourWetGain(0)).toBe(0);
        expect(colourWetGain(1)).toBe(1);
      });

      it('is squared: half the slider is a quarter of the wet, and a low Mix is much lower', async () => {
        const { colourWetGain } = await import('./globalFx');
        expect(colourWetGain(0.5)).toBeCloseTo(0.25, 9);
        expect(colourWetGain(0.2)).toBeCloseTo(0.04, 9);
      });

      it('never exceeds the slider position and rises strictly with it (a taper, not a cap)', async () => {
        const { colourWetGain } = await import('./globalFx');
        let previous = -1;
        for (let i = 0; i <= 100; i++) {
          const v = i / 100;
          const gain = colourWetGain(v);
          expect(gain).toBeLessThanOrEqual(v + 1e-12);
          expect(gain).toBeGreaterThan(previous);
          previous = gain;
        }
      });

      it('all three effects use the same curve at the same slider position', async () => {
        const { globalFx, dist, cheb, crush } = await built();
        globalFx.setGlobalDistortion({ wet: 0.6 });
        globalFx.setGlobalChebyshev({ wet: 0.6 });
        globalFx.setGlobalBitCrusher({ wet: 0.6 });
        const written = [dist.wet, cheb.wet, crush.wet].map((p) => (p.rampTo as ReturnType<typeof vi.fn>).mock.calls[0][0] as number);
        for (const value of written) expect(value).toBeCloseTo(globalFx.colourWetGain(0.6), 9);
        expect(written[0]).toBeCloseTo(0.36, 6);
      });

      it('tapers the clamped value, so an out-of-range Mix still lands on 0 or 1 (never above)', async () => {
        const { globalFx, crush } = await built();
        globalFx.setGlobalBitCrusher({ wet: 3 });
        expect(crush.wet.rampTo).toHaveBeenLastCalledWith(1, 0.05);
        globalFx.setGlobalBitCrusher({ wet: -2 });
        expect(crush.wet.rampTo).toHaveBeenLastCalledWith(0, 0.05);
      });
    });

    describe('setGlobalDistortion', () => {
      it('writes amount to the distortion property and leaves wet alone', async () => {
        const { globalFx, dist } = await built();
        globalFx.setGlobalDistortion({ amount: 0.6 });
        expect(dist.distortion).toBe(0.6);
        expect(dist.wet.rampTo).not.toHaveBeenCalled();
      });

      it('ramps the tapered wet over 50 ms and leaves the amount alone', async () => {
        const { globalFx, dist } = await built();
        globalFx.setGlobalDistortion({ wet: 0.4 });
        expect(dist.wet.rampTo).toHaveBeenCalledWith(expect.closeTo(0.16, 6), 0.05);
        expect(dist.distortion).toBe(0.3);
      });

      it('writes both fields when both are given (full Mix is still full wet)', async () => {
        const { globalFx, dist } = await built();
        globalFx.setGlobalDistortion({ amount: 0.2, wet: 1 });
        expect(dist.distortion).toBe(0.2);
        expect(dist.wet.rampTo).toHaveBeenCalledWith(1, 0.05);
      });

      it('writes nothing for an empty object', async () => {
        const { globalFx, dist } = await built();
        globalFx.setGlobalDistortion({});
        expect(dist.distortion).toBe(0.3);
        expect(dist.wet.rampTo).not.toHaveBeenCalled();
      });

      it('falls back to a direct wet.value write when the signal has no rampTo', async () => {
        const { globalFx, dist } = await built();
        dist.wet = { value: 0 };
        globalFx.setGlobalDistortion({ wet: 0.3 });
        expect(dist.wet.value).toBeCloseTo(0.09, 6);
      });

      it('clamps amount and wet into 0-1 so a malformed payload cannot reach the node out of range', async () => {
        const { globalFx, dist } = await built();
        globalFx.setGlobalDistortion({ amount: 1.5, wet: 2 });
        expect(dist.distortion).toBe(1);
        expect(dist.wet.rampTo).toHaveBeenLastCalledWith(1, 0.05);
        globalFx.setGlobalDistortion({ amount: -1, wet: -0.5 });
        expect(dist.distortion).toBe(0);
        expect(dist.wet.rampTo).toHaveBeenLastCalledWith(0, 0.05);
      });

      it('ignores a non-finite value rather than writing NaN to the node', async () => {
        const { globalFx, dist } = await built();
        globalFx.setGlobalDistortion({ amount: Number.NaN, wet: Number.POSITIVE_INFINITY });
        expect(dist.distortion).toBe(0.3);
        expect(dist.wet.rampTo).not.toHaveBeenCalled();
      });

      it('warns and does not throw when the node throws', async () => {
        const { globalFx, dist } = await built();
        dist.wet.rampTo.mockImplementation(() => {
          throw new Error('boom');
        });
        expect(() => globalFx.setGlobalDistortion({ wet: 0.5 })).not.toThrow();
        expect(devWarn).toHaveBeenCalledWith('[AudioEngine] setGlobalDistortion failed', expect.any(Error));
      });
    });

    describe('setGlobalChebyshev', () => {
      it('rounds a fractional order to the nearest whole harmonic', async () => {
        const { globalFx, cheb } = await built();
        globalFx.setGlobalChebyshev({ order: 3.6 });
        expect(cheb.order).toBe(4);
        globalFx.setGlobalChebyshev({ order: 3.4 });
        expect(cheb.order).toBe(3);
      });

      it('clamps order into 1-8, since order 0 is not a harmonic and a huge order would stall the shaper build', async () => {
        const { globalFx, cheb } = await built();
        globalFx.setGlobalChebyshev({ order: 0 });
        expect(cheb.order).toBe(1);
        globalFx.setGlobalChebyshev({ order: 1e9 });
        expect(cheb.order).toBe(8);
      });

      it('ignores a non-finite order', async () => {
        const { globalFx, cheb } = await built();
        globalFx.setGlobalChebyshev({ order: Number.NaN });
        expect(cheb.order).toBe(2);
      });

      it('ramps the tapered wet over 50 ms and leaves the order alone', async () => {
        const { globalFx, cheb } = await built();
        globalFx.setGlobalChebyshev({ wet: 0.25 });
        expect(cheb.wet.rampTo).toHaveBeenCalledWith(expect.closeTo(0.0625, 6), 0.05);
        expect(cheb.order).toBe(2);
      });

      it('writes nothing for an empty object', async () => {
        const { globalFx, cheb } = await built();
        globalFx.setGlobalChebyshev({});
        expect(cheb.order).toBe(2);
        expect(cheb.wet.rampTo).not.toHaveBeenCalled();
      });

      it('warns and does not throw when the node throws', async () => {
        const { globalFx, cheb } = await built();
        cheb.wet.rampTo.mockImplementation(() => {
          throw new Error('boom');
        });
        expect(() => globalFx.setGlobalChebyshev({ wet: 0.5 })).not.toThrow();
        expect(devWarn).toHaveBeenCalledWith('[AudioEngine] setGlobalChebyshev failed', expect.any(Error));
      });
    });

    describe('setGlobalBitCrusher', () => {
      it('ramps bits and the tapered wet over 50 ms (bits is not tapered)', async () => {
        const { globalFx, crush } = await built();
        globalFx.setGlobalBitCrusher({ bits: 4, wet: 0.5 });
        expect(crush.bits.rampTo).toHaveBeenCalledWith(4, 0.05);
        expect(crush.wet.rampTo).toHaveBeenCalledWith(expect.closeTo(0.25, 6), 0.05);
      });

      it('writes only the field given', async () => {
        const { globalFx, crush } = await built();
        globalFx.setGlobalBitCrusher({ wet: 0.5 });
        expect(crush.bits.rampTo).not.toHaveBeenCalled();
        globalFx.setGlobalBitCrusher({ bits: 12 });
        expect(crush.wet.rampTo).toHaveBeenCalledTimes(1);
      });

      it('clamps bits into 1-16 and wet into 0-1', async () => {
        const { globalFx, crush } = await built();
        globalFx.setGlobalBitCrusher({ bits: 0, wet: 3 });
        expect(crush.bits.rampTo).toHaveBeenLastCalledWith(1, 0.05);
        expect(crush.wet.rampTo).toHaveBeenLastCalledWith(1, 0.05);
        globalFx.setGlobalBitCrusher({ bits: 99, wet: -1 });
        expect(crush.bits.rampTo).toHaveBeenLastCalledWith(16, 0.05);
        expect(crush.wet.rampTo).toHaveBeenLastCalledWith(0, 0.05);
      });

      it('falls back to a direct value write when the params have no rampTo', async () => {
        const { globalFx, crush } = await built();
        crush.bits = { value: 8 };
        crush.wet = { value: 0 };
        globalFx.setGlobalBitCrusher({ bits: 5, wet: 0.7 });
        expect(crush.bits.value).toBe(5);
        expect(crush.wet.value).toBeCloseTo(0.49, 6);
      });

      it('warns and does not throw when the node throws', async () => {
        const { globalFx, crush } = await built();
        crush.bits.rampTo.mockImplementation(() => {
          throw new Error('boom');
        });
        expect(() => globalFx.setGlobalBitCrusher({ bits: 4 })).not.toThrow();
        expect(devWarn).toHaveBeenCalledWith('[AudioEngine] setGlobalBitCrusher failed', expect.any(Error));
      });
    });
  });

  // Global Modulation T4 (docs/specs/GLOBAL_MODULATION_COLOUR.md section 1.3): the AutoWah sits between the
  // BitCrusher and the Compressor, in both Decay Modes, with the returns joining after it.
  describe('buildGlobalFxChain - the modulation slot (Global Modulation)', () => {
    it('constructs exactly one AutoWah', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      expect(toneFlags.wahCtor).toHaveBeenCalledTimes(1);
    });

    it('builds it dry (wet 0) at Tone defaults, matching DEFAULT_GLOBAL_AUDIO_SETTINGS.autoWah', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      expect(toneFlags.wahCtor).toHaveBeenCalledWith({
        baseFrequency: 100,
        octaves: 6,
        sensitivity: 0,
        Q: 2,
        gain: 2,
        follower: 0.2,
        wet: 0,
      });
    });

    // Global Pedals T4: the Phaser now hands to the Chorus, the first motion pedal (docs/specs/GLOBAL_PEDALS.md §1.3).
    it('wires BitCrusher -> AutoWah -> Phaser -> Chorus in Natural Decay, each pedal wired to nothing else', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      const crush = lastInstance(toneFlags.crusherCtor);
      const wah = lastInstance(toneFlags.wahCtor);
      const phaser = lastInstance(toneFlags.phaserCtor);
      const chorus = lastInstance(toneFlags.chorusCtor);

      expect(crush.connect).toHaveBeenCalledWith(wah);
      expect(wah.connect).toHaveBeenCalledTimes(1);
      expect(wah.connect).toHaveBeenCalledWith(phaser);
      expect(phaser.connect).toHaveBeenCalledTimes(1);
      expect(phaser.connect).toHaveBeenCalledWith(chorus);
    });

    it('keeps the same slot in Controlled Decay, with the returns joining after it at the Width stage (Global Pedals T6)', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      const wah = lastInstance(toneFlags.wahCtor);
      const phaser = lastInstance(toneFlags.phaserCtor);
      const chorus = lastInstance(toneFlags.chorusCtor);
      const widener = lastInstance(toneFlags.widenerCtor);
      const reverbReturn = returnOf(lastInstance(Tone.Reverb));

      globalFx.wireGlobalFxChain(true);

      expect(lastInstance(toneFlags.crusherCtor).connect).toHaveBeenLastCalledWith(wah);
      expect(wah.connect).toHaveBeenLastCalledWith(phaser);
      expect(phaser.connect).toHaveBeenLastCalledWith(chorus);
      expect(reverbReturn.connect).toHaveBeenLastCalledWith(widener);
    });

    it('connects neither pedal to a room or a return, and no room or return to either pedal', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      const pedals = [lastInstance(toneFlags.wahCtor), lastInstance(toneFlags.phaserCtor)];
      const rooms = [lastInstance(Tone.Reverb), lastInstance(Tone.FeedbackDelay)];
      const returns = rooms.map(returnOf);

      for (const pedal of pedals) {
        for (const other of [...rooms, ...returns]) {
          expect(pedal.connect).not.toHaveBeenCalledWith(other);
          expect(other.connect).not.toHaveBeenCalledWith(pedal);
        }
      }
    });

    it('wires BitCrusher -> Phaser and does not throw when the AutoWah constructor is absent', async () => {
      toneFlags.wahAbsent = true;
      const globalFx = await import('./globalFx');
      expect(() => globalFx.buildGlobalFxChain()).not.toThrow();

      expect(toneFlags.wahCtor).not.toHaveBeenCalled();
      expect(lastInstance(toneFlags.crusherCtor).connect).toHaveBeenCalledWith(lastInstance(toneFlags.phaserCtor));
      expect(() => globalFx.setGlobalAutoWah({ baseFrequency: 200, wet: 1 })).not.toThrow();
    });

    it('wires BitCrusher -> Compressor when no Modulation pedal constructor exists', async () => {
      toneFlags.wahAbsent = true;
      toneFlags.phaserAbsent = true;
      toneFlags.chorusAbsent = true;
      toneFlags.tremoloAbsent = true;
      toneFlags.vibratoAbsent = true;
      toneFlags.shifterAbsent = true;
      const globalFx = await import('./globalFx');
      expect(() => globalFx.buildGlobalFxChain()).not.toThrow();

      expect(lastInstance(toneFlags.crusherCtor).connect).toHaveBeenCalledWith(lastInstance(Tone.Compressor));
    });

    it('disconnects and reconnects each pedal exactly once per Decay Mode flip', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      const pedals = [lastInstance(toneFlags.wahCtor), lastInstance(toneFlags.phaserCtor)];
      for (const pedal of pedals) {
        pedal.connect.mockClear();
        pedal.disconnect.mockClear();
      }

      globalFx.wireGlobalFxChain(true);
      for (const pedal of pedals) {
        expect(pedal.disconnect).toHaveBeenCalledTimes(1);
        expect(pedal.connect).toHaveBeenCalledTimes(1);
      }
      globalFx.wireGlobalFxChain(false);
      for (const pedal of pedals) {
        expect(pedal.disconnect).toHaveBeenCalledTimes(2);
        expect(pedal.connect).toHaveBeenCalledTimes(2);
      }
    });

    it('constructs exactly one Phaser, dry (wet 0) at Tone defaults with 10 stages', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      expect(toneFlags.phaserCtor).toHaveBeenCalledTimes(1);
      expect(toneFlags.phaserCtor).toHaveBeenCalledWith({
        frequency: 0.5,
        octaves: 3,
        stages: 10,
        Q: 10,
        baseFrequency: 350,
        wet: 0,
      });
    });

    it('builds and wires on when the Phaser constructor throws: the AutoWah hands to the Chorus and its setter still works', async () => {
      toneFlags.phaserCtor.mockImplementationOnce(() => {
        throw new Error('no phaser');
      });
      const globalFx = await import('./globalFx');
      expect(() => globalFx.buildGlobalFxChain()).not.toThrow();

      const wah = lastInstance(toneFlags.wahCtor);
      expect(wah.connect).toHaveBeenCalledWith(lastInstance(toneFlags.chorusCtor));
      expect(devWarn).toHaveBeenCalledWith(expect.stringContaining('Phaser'), expect.any(Error));
      expect(() => globalFx.setGlobalPhaser({ rate: 2, stages: 4, wet: 1 })).not.toThrow();
      globalFx.setGlobalAutoWah({ Q: 5 });
      expect(wah.Q.rampTo).toHaveBeenCalledWith(5, 0.05);
    });
  });

  describe('setGlobalAutoWah (Global Modulation)', () => {
    async function built() {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      return { globalFx, wah: lastInstance(toneFlags.wahCtor) };
    }

    it('is exported', async () => {
      const globalFx = await import('./globalFx');
      expect(typeof globalFx.setGlobalAutoWah).toBe('function');
    });

    it('no-ops silently before the chain is built: no throw and no warning (a missing node is not a failure)', async () => {
      const globalFx = await import('./globalFx');
      expect(() => globalFx.setGlobalAutoWah({ baseFrequency: 200, wet: 1 })).not.toThrow();
      expect(devWarn).not.toHaveBeenCalled();
    });

    it('writes the four plain fields straight to the node (no ramp exists for them)', async () => {
      const { globalFx, wah } = await built();
      globalFx.setGlobalAutoWah({ baseFrequency: 250, octaves: 4.5, sensitivity: -18, follower: 0.35 });
      expect(wah.baseFrequency).toBe(250);
      expect(wah.octaves).toBe(4.5);
      expect(wah.sensitivity).toBe(-18);
      expect(wah.follower).toBe(0.35);
    });

    it('ramps Q and gain over 50 ms, untouched by the taper', async () => {
      const { globalFx, wah } = await built();
      globalFx.setGlobalAutoWah({ Q: 6, gain: 12 });
      expect(wah.Q.rampTo).toHaveBeenCalledWith(6, 0.05);
      expect(wah.gain.rampTo).toHaveBeenCalledWith(12, 0.05);
    });

    it('ramps the tapered (squared) wet over 50 ms, as Colour does', async () => {
      const { globalFx, wah } = await built();
      globalFx.setGlobalAutoWah({ wet: 0.5 });
      expect(wah.wet.rampTo).toHaveBeenCalledWith(expect.closeTo(0.25, 6), 0.05);
      globalFx.setGlobalAutoWah({ wet: 1 });
      expect(wah.wet.rampTo).toHaveBeenLastCalledWith(1, 0.05);
      globalFx.setGlobalAutoWah({ wet: 0 });
      expect(wah.wet.rampTo).toHaveBeenLastCalledWith(0, 0.05);
    });

    it('writes only the fields given, and nothing for an empty object', async () => {
      const { globalFx, wah } = await built();
      globalFx.setGlobalAutoWah({});
      globalFx.setGlobalAutoWah({ wet: 0.5 });
      expect(wah.baseFrequency).toBe(100);
      expect(wah.octaves).toBe(6);
      expect(wah.Q.rampTo).not.toHaveBeenCalled();
      expect(wah.gain.rampTo).not.toHaveBeenCalled();
      expect(wah.wet.rampTo).toHaveBeenCalledTimes(1);
    });

    it('clamps every field into its full range so a malformed payload cannot reach the node out of range', async () => {
      const { globalFx, wah } = await built();
      globalFx.setGlobalAutoWah({ baseFrequency: 5, octaves: 0, sensitivity: -100, Q: 0, gain: -3, follower: 0, wet: -1 });
      expect(wah.baseFrequency).toBe(50);
      expect(wah.octaves).toBe(1);
      expect(wah.sensitivity).toBe(-40);
      expect(wah.Q.rampTo).toHaveBeenLastCalledWith(0.5, 0.05);
      expect(wah.gain.rampTo).toHaveBeenLastCalledWith(0, 0.05);
      expect(wah.follower).toBe(0.01);
      expect(wah.wet.rampTo).toHaveBeenLastCalledWith(0, 0.05);

      globalFx.setGlobalAutoWah({ baseFrequency: 1e9, octaves: 99, sensitivity: 12, Q: 99, gain: 99, follower: 99, wet: 3 });
      expect(wah.baseFrequency).toBe(1000);
      expect(wah.octaves).toBe(8);
      expect(wah.sensitivity).toBe(0);
      expect(wah.Q.rampTo).toHaveBeenLastCalledWith(10, 0.05);
      expect(wah.gain.rampTo).toHaveBeenLastCalledWith(20, 0.05);
      expect(wah.follower).toBe(1);
      expect(wah.wet.rampTo).toHaveBeenLastCalledWith(1, 0.05);
    });

    it('ignores a non-finite value rather than writing NaN to the node, and still writes the finite fields beside it', async () => {
      const { globalFx, wah } = await built();
      globalFx.setGlobalAutoWah({
        baseFrequency: Number.NaN,
        octaves: Number.POSITIVE_INFINITY,
        sensitivity: Number.NEGATIVE_INFINITY,
        Q: Number.NaN,
        gain: Number.NaN,
        follower: 0.3,
        wet: Number.NaN,
      });
      expect(wah.baseFrequency).toBe(100);
      expect(wah.octaves).toBe(6);
      expect(wah.sensitivity).toBe(0);
      expect(wah.Q.rampTo).not.toHaveBeenCalled();
      expect(wah.gain.rampTo).not.toHaveBeenCalled();
      expect(wah.wet.rampTo).not.toHaveBeenCalled();
      expect(wah.follower).toBe(0.3);
    });

    it('falls back to a direct value write for Q, gain and wet when the signals have no rampTo', async () => {
      const { globalFx, wah } = await built();
      wah.Q = { value: 2 };
      wah.gain = { value: 2 };
      wah.wet = { value: 0 };
      globalFx.setGlobalAutoWah({ Q: 5, gain: 9, wet: 0.7 });
      expect(wah.Q.value).toBe(5);
      expect(wah.gain.value).toBe(9);
      expect(wah.wet.value).toBeCloseTo(0.49, 6);
    });

    it('warns and does not throw when the node throws', async () => {
      const { globalFx, wah } = await built();
      wah.Q.rampTo.mockImplementation(() => {
        throw new Error('boom');
      });
      expect(() => globalFx.setGlobalAutoWah({ Q: 4 })).not.toThrow();
      expect(devWarn).toHaveBeenCalledWith('[AudioEngine] setGlobalAutoWah failed', expect.any(Error));
    });
  });

  describe('setGlobalPhaser (Global Modulation)', () => {
    async function built() {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      return { globalFx, phaser: lastInstance(toneFlags.phaserCtor) };
    }

    it('is exported', async () => {
      const globalFx = await import('./globalFx');
      expect(typeof globalFx.setGlobalPhaser).toBe('function');
    });

    it('no-ops silently before the chain is built: no throw, no warning, no construction', async () => {
      const globalFx = await import('./globalFx');
      expect(() => globalFx.setGlobalPhaser({ rate: 2, stages: 4, wet: 1 })).not.toThrow();
      expect(devWarn).not.toHaveBeenCalled();
      expect(toneFlags.phaserCtor).not.toHaveBeenCalled();
    });

    it('ramps the rate (Tone frequency) and Q over 50 ms', async () => {
      const { globalFx, phaser } = await built();
      globalFx.setGlobalPhaser({ rate: 2.5, Q: 7 });
      expect(phaser.frequency.rampTo).toHaveBeenCalledWith(2.5, 0.05);
      expect(phaser.Q.rampTo).toHaveBeenCalledWith(7, 0.05);
    });

    it('writes octaves and baseFrequency straight to the node (plain setters in Tone)', async () => {
      const { globalFx, phaser } = await built();
      globalFx.setGlobalPhaser({ octaves: 4.5, baseFrequency: 900 });
      expect(phaser.octaves).toBe(4.5);
      expect(phaser.baseFrequency).toBe(900);
    });

    it('ramps the tapered (squared) wet over 50 ms, as Colour and the AutoWah do', async () => {
      const { globalFx, phaser } = await built();
      globalFx.setGlobalPhaser({ wet: 0.5 });
      expect(phaser.wet.rampTo).toHaveBeenCalledWith(expect.closeTo(0.25, 6), 0.05);
      globalFx.setGlobalPhaser({ wet: 1 });
      expect(phaser.wet.rampTo).toHaveBeenLastCalledWith(1, 0.05);
      globalFx.setGlobalPhaser({ wet: 0 });
      expect(phaser.wet.rampTo).toHaveBeenLastCalledWith(0, 0.05);
    });

    it('writes only the fields given, and nothing for an empty object', async () => {
      const { globalFx, phaser } = await built();
      globalFx.setGlobalPhaser({});
      globalFx.setGlobalPhaser({ wet: 0.5 });
      expect(phaser.octaves).toBe(3);
      expect(phaser.baseFrequency).toBe(350);
      expect(phaser.frequency.rampTo).not.toHaveBeenCalled();
      expect(phaser.Q.rampTo).not.toHaveBeenCalled();
      expect(phaser.wet.rampTo).toHaveBeenCalledTimes(1);
    });

    it('clamps every field into its full range so a malformed payload cannot reach the node out of range', async () => {
      const { globalFx, phaser } = await built();
      globalFx.setGlobalPhaser({ rate: 0, octaves: 0, baseFrequency: 1, Q: 0, wet: -1 });
      expect(phaser.frequency.rampTo).toHaveBeenLastCalledWith(0.05, 0.05);
      expect(phaser.octaves).toBe(0.5);
      expect(phaser.baseFrequency).toBe(50);
      expect(phaser.Q.rampTo).toHaveBeenLastCalledWith(0.5, 0.05);
      expect(phaser.wet.rampTo).toHaveBeenLastCalledWith(0, 0.05);

      globalFx.setGlobalPhaser({ rate: 99, octaves: 99, baseFrequency: 1e9, Q: 99, wet: 3 });
      expect(phaser.frequency.rampTo).toHaveBeenLastCalledWith(10, 0.05);
      expect(phaser.octaves).toBe(6);
      expect(phaser.baseFrequency).toBe(2000);
      expect(phaser.Q.rampTo).toHaveBeenLastCalledWith(20, 0.05);
      expect(phaser.wet.rampTo).toHaveBeenLastCalledWith(1, 0.05);
    });

    it('ignores a non-finite value rather than writing NaN to the node, and still writes the finite fields beside it', async () => {
      const { globalFx, phaser } = await built();
      globalFx.setGlobalPhaser({
        rate: Number.NaN,
        octaves: Number.POSITIVE_INFINITY,
        baseFrequency: Number.NEGATIVE_INFINITY,
        Q: Number.NaN,
        stages: Number.NaN,
        wet: 0.6,
      });
      expect(phaser.frequency.rampTo).not.toHaveBeenCalled();
      expect(phaser.octaves).toBe(3);
      expect(phaser.baseFrequency).toBe(350);
      expect(phaser.Q.rampTo).not.toHaveBeenCalled();
      expect(toneFlags.phaserCtor).toHaveBeenCalledTimes(1);
      expect(phaser.wet.rampTo).toHaveBeenCalledWith(expect.closeTo(0.36, 6), 0.05);
    });

    it('falls back to a direct value write for rate, Q and wet when the signals have no rampTo', async () => {
      const { globalFx, phaser } = await built();
      phaser.frequency = { value: 0.5 };
      phaser.Q = { value: 10 };
      phaser.wet = { value: 0 };
      globalFx.setGlobalPhaser({ rate: 3, Q: 4, wet: 0.7 });
      expect(phaser.frequency.value).toBe(3);
      expect(phaser.Q.value).toBe(4);
      expect(phaser.wet.value).toBeCloseTo(0.49, 6);
    });

    it('warns and does not throw when the node throws', async () => {
      const { globalFx, phaser } = await built();
      phaser.Q.rampTo.mockImplementation(() => {
        throw new Error('boom');
      });
      expect(() => globalFx.setGlobalPhaser({ Q: 4 })).not.toThrow();
      expect(devWarn).toHaveBeenCalledWith('[AudioEngine] setGlobalPhaser failed', expect.any(Error));
    });

    describe('stages (constructor-only in Tone, so a change rebuilds the node)', () => {
      const ctorOptions = (n = -1) => toneFlags.phaserCtor.mock.calls.at(n)?.[0];

      it('builds a new node with the new stage count and disposes the old one', async () => {
        const { globalFx, phaser: old } = await built();
        globalFx.setGlobalPhaser({ stages: 6 });
        expect(toneFlags.phaserCtor).toHaveBeenCalledTimes(2);
        expect(ctorOptions()).toMatchObject({ stages: 6 });
        expect(old.dispose).toHaveBeenCalledTimes(1);
        expect(lastInstance(toneFlags.phaserCtor)).not.toBe(old);
      });

      it('carries the last-written values of every other field into the new node, with the Mix already tapered', async () => {
        const { globalFx } = await built();
        globalFx.setGlobalPhaser({ rate: 2, octaves: 4, baseFrequency: 500, Q: 5, wet: 0.5 });
        globalFx.setGlobalPhaser({ stages: 6 });
        expect(ctorOptions()).toStrictEqual({
          frequency: 2,
          octaves: 4,
          stages: 6,
          Q: 5,
          baseFrequency: 500,
          wet: expect.closeTo(0.25, 6),
        });
      });

      it('builds a dry node from a dry Mix, and a full one from a full Mix', async () => {
        const { globalFx } = await built();
        globalFx.setGlobalPhaser({ stages: 4 });
        expect(ctorOptions()).toMatchObject({ wet: 0 });
        globalFx.setGlobalPhaser({ wet: 1 });
        globalFx.setGlobalPhaser({ stages: 8 });
        expect(ctorOptions()).toMatchObject({ wet: 1, stages: 8 });
      });

      it('builds the new node with the other fields of the same call, so one edit that moves both lands in full', async () => {
        const { globalFx, phaser: old } = await built();
        globalFx.setGlobalPhaser({ stages: 6, rate: 3, octaves: 5, Q: 8, wet: 1 });
        expect(ctorOptions()).toStrictEqual({ frequency: 3, octaves: 5, stages: 6, Q: 8, baseFrequency: 350, wet: 1 });
        // ...and the replaced node is not written to on its way out: nothing audible should move on it.
        expect(old.frequency.rampTo).not.toHaveBeenCalled();
        expect(old.Q.rampTo).not.toHaveBeenCalled();
        expect(old.wet.rampTo).not.toHaveBeenCalled();
        expect(old.octaves).toBe(3);
      });

      it('still wires the new node, and does not throw, when disposing the old one throws', async () => {
        const { globalFx, phaser: old } = await built();
        old.dispose.mockImplementation(() => {
          throw new Error('already gone');
        });
        expect(() => globalFx.setGlobalPhaser({ stages: 6 })).not.toThrow();
        expect(devWarn).toHaveBeenCalledWith(expect.stringContaining('disposing'), expect.any(Error));
        const fresh = lastInstance(toneFlags.phaserCtor);
        expect(lastInstance(toneFlags.wahCtor).connect).toHaveBeenLastCalledWith(fresh);
        expect(fresh.connect).toHaveBeenCalledWith(lastInstance(toneFlags.chorusCtor));
      });

      it('treats a fresh build as ten stages again: rebuilding at 6, building the chain anew, then asking for 6 rebuilds', async () => {
        const { globalFx } = await built();
        globalFx.setGlobalPhaser({ stages: 6 });
        globalFx.buildGlobalFxChain();
        const constructed = toneFlags.phaserCtor.mock.calls.length;
        globalFx.setGlobalPhaser({ stages: 6 });
        expect(toneFlags.phaserCtor.mock.calls.length).toBe(constructed + 1);
        expect(ctorOptions()).toMatchObject({ stages: 6 });
      });

      it('constructs nothing when the rounded count equals the live one', async () => {
        const { globalFx, phaser } = await built();
        globalFx.setGlobalPhaser({ stages: 10 });
        globalFx.setGlobalPhaser({ stages: 10.4 });
        expect(toneFlags.phaserCtor).toHaveBeenCalledTimes(1);
        expect(phaser.dispose).not.toHaveBeenCalled();
      });

      it('rounds a fractional count: 6.4 builds 6 and 6.6 builds 7', async () => {
        const { globalFx } = await built();
        globalFx.setGlobalPhaser({ stages: 6.4 });
        expect(ctorOptions()).toMatchObject({ stages: 6 });
        globalFx.setGlobalPhaser({ stages: 6.6 });
        expect(ctorOptions()).toMatchObject({ stages: 7 });
      });

      it('clamps the count into 1-12 before comparing: 0 builds 1, 99 builds 12', async () => {
        const { globalFx } = await built();
        globalFx.setGlobalPhaser({ stages: 0 });
        expect(ctorOptions()).toMatchObject({ stages: 1 });
        globalFx.setGlobalPhaser({ stages: 99 });
        expect(ctorOptions()).toMatchObject({ stages: 12 });
      });

      it('remembers the live count across rebuilds: repeating the new count builds nothing, a different one builds again', async () => {
        const { globalFx } = await built();
        globalFx.setGlobalPhaser({ stages: 6 });
        globalFx.setGlobalPhaser({ stages: 6 });
        globalFx.setGlobalPhaser({ rate: 1 });
        expect(toneFlags.phaserCtor).toHaveBeenCalledTimes(2);
        globalFx.setGlobalPhaser({ stages: 10 });
        expect(toneFlags.phaserCtor).toHaveBeenCalledTimes(3);
      });

      it('releases each node it replaces: 10 -> 6 -> 8 disposes the original, then the 6-stage node', async () => {
        const { globalFx, phaser: first } = await built();
        globalFx.setGlobalPhaser({ stages: 6 });
        const second = lastInstance(toneFlags.phaserCtor);
        globalFx.setGlobalPhaser({ stages: 8 });
        expect(first.dispose).toHaveBeenCalledTimes(1);
        expect(second.dispose).toHaveBeenCalledTimes(1);
        expect(lastInstance(toneFlags.phaserCtor).dispose).not.toHaveBeenCalled();
      });

      it('re-wires the chain so the new node sits between the AutoWah and the Chorus (Natural Decay)', async () => {
        const { globalFx } = await built();
        const wah = lastInstance(toneFlags.wahCtor);
        globalFx.setGlobalPhaser({ stages: 6 });
        const fresh = lastInstance(toneFlags.phaserCtor);
        expect(wah.connect).toHaveBeenLastCalledWith(fresh);
        expect(fresh.connect).toHaveBeenCalledWith(lastInstance(toneFlags.chorusCtor));
      });

      it('re-wires in the Decay Mode last passed to wireGlobalFxChain: Controlled keeps the returns at the widener', async () => {
        const { globalFx } = await built();
        globalFx.wireGlobalFxChain(true);
        const reverbReturn = returnOf(lastInstance(Tone.Reverb));
        const delayReturn = returnOf(lastInstance(Tone.FeedbackDelay));
        const widener = lastInstance(toneFlags.widenerCtor);

        globalFx.setGlobalPhaser({ stages: 6 });

        expect(reverbReturn.connect).toHaveBeenLastCalledWith(widener);
        expect(delayReturn.connect).toHaveBeenLastCalledWith(widener);
        expect(lastInstance(toneFlags.phaserCtor).connect).toHaveBeenCalledWith(lastInstance(toneFlags.chorusCtor));
      });

      it('re-wires Natural after a flip back from Controlled', async () => {
        const { globalFx } = await built();
        globalFx.wireGlobalFxChain(true);
        globalFx.wireGlobalFxChain(false);
        const reverbReturn = returnOf(lastInstance(Tone.Reverb));

        globalFx.setGlobalPhaser({ stages: 6 });

        expect(reverbReturn.connect).toHaveBeenLastCalledWith(lastInstance(Tone.Compressor));
      });

      it('connects the new node exactly once and leaves the AutoWah and Compressor wired once each', async () => {
        const { globalFx } = await built();
        const wah = lastInstance(toneFlags.wahCtor);
        wah.connect.mockClear();
        globalFx.setGlobalPhaser({ stages: 6 });
        expect(wah.connect).toHaveBeenCalledTimes(1);
        expect(lastInstance(toneFlags.phaserCtor).connect).toHaveBeenCalledTimes(1);
      });

      it('keeps the output taps connected through a rebuild', async () => {
        const { globalFx } = await built();
        globalFx.attachOutputTaps();
        const eq = lastInstance(Tone.EQ3);
        const preTap = createAnalyser.mock.results[0].value;
        eq.connect.mockClear();
        globalFx.setGlobalPhaser({ stages: 6 });
        expect(eq.connect.mock.calls.filter((c: unknown[]) => c[0] === preTap)).toHaveLength(1);
      });

      it('keeps the old node, undisposed and wired, when the new one cannot be built, and tries again next time', async () => {
        const { globalFx, phaser: old } = await built();
        toneFlags.phaserCtor.mockImplementationOnce(() => {
          throw new Error('no memory');
        });
        expect(() => globalFx.setGlobalPhaser({ stages: 6 })).not.toThrow();
        expect(devWarn).toHaveBeenCalledWith(expect.stringContaining('Phaser'), expect.any(Error));
        expect(old.dispose).not.toHaveBeenCalled();
        expect(old.connect).toHaveBeenLastCalledWith(lastInstance(toneFlags.chorusCtor));

        globalFx.setGlobalPhaser({ stages: 6 });
        expect(ctorOptions()).toMatchObject({ stages: 6 });
        expect(old.dispose).toHaveBeenCalledTimes(1);
      });

      it('still applies the rest of the edit to the surviving node when the rebuild fails', async () => {
        const { globalFx, phaser: old } = await built();
        toneFlags.phaserCtor.mockImplementationOnce(() => {
          throw new Error('no memory');
        });
        globalFx.setGlobalPhaser({ stages: 6, rate: 4, octaves: 5 });
        expect(old.frequency.rampTo).toHaveBeenCalledWith(4, 0.05);
        expect(old.octaves).toBe(5);
      });

      it('does not use a value that was ignored as non-finite or clamped away from what was written: the mirror holds what the node got', async () => {
        const { globalFx } = await built();
        globalFx.setGlobalPhaser({ octaves: Number.NaN, Q: 99, baseFrequency: 1 });
        globalFx.setGlobalPhaser({ stages: 6 });
        expect(ctorOptions()).toMatchObject({ octaves: 3, Q: 20, baseFrequency: 50 });
      });

      it('starts each fresh build from the defaults, not from values a previous build was given', async () => {
        const { globalFx } = await built();
        globalFx.setGlobalPhaser({ octaves: 5, Q: 3, wet: 1, rate: 4 });
        globalFx.setGlobalPhaser({ stages: 6 });
        globalFx.buildGlobalFxChain();
        globalFx.setGlobalPhaser({ stages: 8 });
        expect(ctorOptions()).toStrictEqual({ frequency: 0.5, octaves: 3, stages: 8, Q: 10, baseFrequency: 350, wet: 0 });
      });
    });
  });

  // ========================================
  // Global Pedals T4 (docs/specs/GLOBAL_PEDALS.md §1.3): the Chorus and the Tremolo after the Phaser.
  // ========================================
  describe('buildGlobalFxChain - the Chorus and the Tremolo (Global Pedals)', () => {
    it('constructs exactly one of each, dry (wet 0) at Tone defaults', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      expect(toneFlags.chorusCtor).toHaveBeenCalledTimes(1);
      expect(toneFlags.chorusCtor).toHaveBeenCalledWith({
        frequency: 1.5,
        delayTime: 3.5,
        depth: 0.7,
        spread: 180,
        feedback: 0,
        wet: 0,
      });
      expect(toneFlags.tremoloCtor).toHaveBeenCalledTimes(1);
      expect(toneFlags.tremoloCtor).toHaveBeenCalledWith({ frequency: 10, depth: 0.5, spread: 180, wet: 0 });
    });

    // Tone's Chorus and Tremolo do not start their LFOs in the constructor: an unstarted one is a fixed delay / a fixed
    // gain, so a lit Mix would hear no motion (spec assumption 4: the LFOs run always, a dark pedal is Mix 0).
    it('starts each LFO exactly once at construction', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      expect(lastInstance(toneFlags.chorusCtor).start).toHaveBeenCalledTimes(1);
      expect(lastInstance(toneFlags.tremoloCtor).start).toHaveBeenCalledTimes(1);
    });

    it('does not start them again on a Decay Mode flip', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      globalFx.wireGlobalFxChain(true);
      globalFx.wireGlobalFxChain(false);
      expect(lastInstance(toneFlags.chorusCtor).start).toHaveBeenCalledTimes(1);
      expect(lastInstance(toneFlags.tremoloCtor).start).toHaveBeenCalledTimes(1);
    });

    // Global Pedals T5 extends the slot: ... Tremolo -> Vibrato -> FrequencyShifter -> Compressor.
    it.each([false, true])('wires Phaser -> Chorus -> Tremolo -> Vibrato -> FrequencyShifter -> Compressor with controlledDecay=%s, each wired to one node', async (controlled) => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      const phaser = lastInstance(toneFlags.phaserCtor);
      const chorus = lastInstance(toneFlags.chorusCtor);
      const tremolo = lastInstance(toneFlags.tremoloCtor);
      const vibrato = lastInstance(toneFlags.vibratoCtor);
      const shifter = lastInstance(toneFlags.shifterCtor);
      const comp = lastInstance(Tone.Compressor);
      for (const node of [phaser, chorus, tremolo, vibrato, shifter]) node.connect.mockClear();

      globalFx.wireGlobalFxChain(controlled);

      expect(phaser.connect.mock.calls).toEqual([[chorus]]);
      expect(chorus.connect.mock.calls).toEqual([[tremolo]]);
      expect(tremolo.connect.mock.calls).toEqual([[vibrato]]);
      expect(vibrato.connect.mock.calls).toEqual([[shifter]]);
      expect(shifter.connect.mock.calls).toEqual([[comp]]);
    });

    it('keeps the rooms off both pedals: no room or return connects to either, nor either to a room or return', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      globalFx.wireGlobalFxChain(true);
      const pedals = [lastInstance(toneFlags.chorusCtor), lastInstance(toneFlags.tremoloCtor)];
      const rooms = [lastInstance(Tone.Reverb), lastInstance(Tone.FeedbackDelay)];
      const returns = rooms.map(returnOf);
      for (const pedal of pedals) {
        for (const other of [...rooms, ...returns]) {
          expect(pedal.connect).not.toHaveBeenCalledWith(other);
          expect(other.connect).not.toHaveBeenCalledWith(pedal);
        }
      }
    });

    it('disconnects each pedal once per rewire, so a Decay flip never doubles an edge', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      const pedals = [lastInstance(toneFlags.chorusCtor), lastInstance(toneFlags.tremoloCtor)];
      for (const pedal of pedals) pedal.disconnect.mockClear();
      globalFx.wireGlobalFxChain(true);
      for (const pedal of pedals) expect(pedal.disconnect).toHaveBeenCalledTimes(1);
    });

    it('wires Phaser -> Tremolo when the Chorus constructor is absent, and Phaser -> Vibrato when both are', async () => {
      toneFlags.chorusAbsent = true;
      let globalFx = await import('./globalFx');
      expect(() => globalFx.buildGlobalFxChain()).not.toThrow();
      expect(lastInstance(toneFlags.phaserCtor).connect).toHaveBeenCalledWith(lastInstance(toneFlags.tremoloCtor));
      expect(() => globalFx.setGlobalChorus({ rate: 2, wet: 1 })).not.toThrow();

      vi.resetModules();
      toneFlags.tremoloAbsent = true;
      globalFx = await import('./globalFx');
      expect(() => globalFx.buildGlobalFxChain()).not.toThrow();
      expect(lastInstance(toneFlags.phaserCtor).connect).toHaveBeenCalledWith(lastInstance(toneFlags.vibratoCtor));
      expect(() => globalFx.setGlobalTremolo({ rate: 2, wet: 1 })).not.toThrow();
    });

    it('builds and wires on when the Chorus constructor throws: the Phaser hands to the Tremolo', async () => {
      toneFlags.chorusCtor.mockImplementationOnce(() => {
        throw new Error('no chorus');
      });
      const globalFx = await import('./globalFx');
      expect(() => globalFx.buildGlobalFxChain()).not.toThrow();
      expect(devWarn).toHaveBeenCalledWith(expect.stringContaining('Chorus'), expect.any(Error));
      expect(lastInstance(toneFlags.phaserCtor).connect).toHaveBeenCalledWith(lastInstance(toneFlags.tremoloCtor));
      expect(() => globalFx.setGlobalChorus({ rate: 2, wet: 1 })).not.toThrow();
    });

    it('builds and wires on when the Tremolo constructor throws: the Chorus hands to the Vibrato', async () => {
      toneFlags.tremoloCtor.mockImplementationOnce(() => {
        throw new Error('no tremolo');
      });
      const globalFx = await import('./globalFx');
      expect(() => globalFx.buildGlobalFxChain()).not.toThrow();
      expect(devWarn).toHaveBeenCalledWith(expect.stringContaining('Tremolo'), expect.any(Error));
      expect(lastInstance(toneFlags.chorusCtor).connect).toHaveBeenCalledWith(lastInstance(toneFlags.vibratoCtor));
    });
  });

  // ========================================
  // Global Pedals T5 (docs/specs/GLOBAL_PEDALS.md §1.3): the Vibrato and the FrequencyShifter, the two plain Effects,
  // after the Tremolo and before the Compressor.
  // ========================================
  describe('buildGlobalFxChain - the Vibrato and the FrequencyShifter (Global Pedals)', () => {
    it('constructs exactly one of each, dry (wet 0) at Tone defaults, the Vibrato at Tone\'s own maxDelay', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      expect(toneFlags.vibratoCtor).toHaveBeenCalledTimes(1);
      // No maxDelay key: Tone's 0.005 s default is the Depth ceiling the full range is written against.
      expect(toneFlags.vibratoCtor).toHaveBeenCalledWith({ frequency: 5, depth: 0.1, wet: 0 });
      expect(toneFlags.shifterCtor).toHaveBeenCalledTimes(1);
      expect(toneFlags.shifterCtor).toHaveBeenCalledWith({ frequency: 0, wet: 0 });
    });

    // Tone's Vibrato starts its LFO in its own constructor; starting it again would restart the LFO's phase.
    it('never calls start() on the Vibrato', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      globalFx.wireGlobalFxChain(true);
      globalFx.setGlobalVibrato({ rate: 3, depth: 0.2, wet: 0.5 });
      expect(lastInstance(toneFlags.vibratoCtor).start).not.toHaveBeenCalled();
    });

    it('wires the Tremolo straight to the shifter when the Vibrato constructor is absent, and the Vibrato to the Compressor when the shifter is', async () => {
      toneFlags.vibratoAbsent = true;
      let globalFx = await import('./globalFx');
      expect(() => globalFx.buildGlobalFxChain()).not.toThrow();
      expect(lastInstance(toneFlags.tremoloCtor).connect).toHaveBeenCalledWith(lastInstance(toneFlags.shifterCtor));
      expect(() => globalFx.setGlobalVibrato({ rate: 3, wet: 1 })).not.toThrow();

      vi.resetModules();
      vi.clearAllMocks();
      toneFlags.vibratoAbsent = false;
      toneFlags.shifterAbsent = true;
      globalFx = await import('./globalFx');
      expect(() => globalFx.buildGlobalFxChain()).not.toThrow();
      expect(lastInstance(toneFlags.vibratoCtor).connect).toHaveBeenCalledWith(lastInstance(Tone.Compressor));
      expect(() => globalFx.setGlobalFrequencyShifter({ shift: 10, wet: 1 })).not.toThrow();
    });

    it('builds and wires on when either constructor throws', async () => {
      toneFlags.vibratoCtor.mockImplementationOnce(() => {
        throw new Error('no vibrato');
      });
      toneFlags.shifterCtor.mockImplementationOnce(() => {
        throw new Error('no shifter');
      });
      const globalFx = await import('./globalFx');
      expect(() => globalFx.buildGlobalFxChain()).not.toThrow();
      expect(devWarn).toHaveBeenCalledWith(expect.stringContaining('Vibrato'), expect.any(Error));
      expect(devWarn).toHaveBeenCalledWith(expect.stringContaining('FrequencyShifter'), expect.any(Error));
      expect(lastInstance(toneFlags.tremoloCtor).connect).toHaveBeenCalledWith(lastInstance(Tone.Compressor));
    });

    it('disconnects each once per rewire and connects neither to a room or a return', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      const pedals = [lastInstance(toneFlags.vibratoCtor), lastInstance(toneFlags.shifterCtor)];
      for (const pedal of pedals) pedal.disconnect.mockClear();
      globalFx.wireGlobalFxChain(true);
      const rooms = [lastInstance(Tone.Reverb), lastInstance(Tone.FeedbackDelay)];
      const returns = rooms.map(returnOf);
      for (const pedal of pedals) {
        expect(pedal.disconnect).toHaveBeenCalledTimes(1);
        for (const other of [...rooms, ...returns]) {
          expect(pedal.connect).not.toHaveBeenCalledWith(other);
          expect(other.connect).not.toHaveBeenCalledWith(pedal);
        }
      }
    });
  });

  // ========================================
  // Global Pedals T6 (docs/specs/GLOBAL_PEDALS.md §1.3, assumption 2): the Width stage between the Compressor and the
  // Limiter. Under Controlled Decay the rooms' returns now join at the widener's input instead of the Limiter's, so the
  // widener hears the rooms in both modes (Width 0 folds the echoes too).
  // ========================================
  describe('buildGlobalFxChain - the StereoWidener and the Controlled-Decay join (Global Pedals)', () => {
    it('constructs exactly one, at unity width (0.5) and fully wet', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      expect(toneFlags.widenerCtor).toHaveBeenCalledTimes(1);
      expect(toneFlags.widenerCtor).toHaveBeenCalledWith({ width: 0.5, wet: 1 });
    });

    it.each([false, true])('wires Compressor -> StereoWidener -> Limiter with controlledDecay=%s', async (controlled) => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      const comp = lastInstance(Tone.Compressor);
      const widener = lastInstance(toneFlags.widenerCtor);
      const limiter = lastInstance(Tone.Limiter);
      for (const node of [comp, widener]) node.connect.mockClear();

      globalFx.wireGlobalFxChain(controlled);

      expect(comp.connect.mock.calls).toEqual([[widener]]);
      expect(widener.connect.mock.calls).toEqual([[limiter]]);
    });

    it('joins both returns at the Compressor under Natural Decay (unchanged), so they reach the widener after it', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      const comp = lastInstance(Tone.Compressor);
      const widener = lastInstance(toneFlags.widenerCtor);
      for (const room of [lastInstance(Tone.Reverb), lastInstance(Tone.FeedbackDelay)]) {
        expect(returnOf(room).connect).toHaveBeenLastCalledWith(comp);
        expect(returnOf(room).connect).not.toHaveBeenCalledWith(widener);
      }
    });

    it('joins both returns at the widener under Controlled Decay, not at the Limiter', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      const widener = lastInstance(toneFlags.widenerCtor);
      const limiter = lastInstance(Tone.Limiter);
      const returns = [lastInstance(Tone.Reverb), lastInstance(Tone.FeedbackDelay)].map(returnOf);
      for (const ret of returns) ret.connect.mockClear();

      globalFx.wireGlobalFxChain(true);

      for (const ret of returns) {
        expect(ret.connect.mock.calls).toEqual([[widener]]);
        expect(ret.connect).not.toHaveBeenCalledWith(limiter);
      }
    });

    it('falls back to the Limiter for the Controlled join, and Compressor -> Limiter, when the widener constructor is absent', async () => {
      toneFlags.widenerAbsent = true;
      const globalFx = await import('./globalFx');
      expect(() => globalFx.buildGlobalFxChain()).not.toThrow();
      const comp = lastInstance(Tone.Compressor);
      const limiter = lastInstance(Tone.Limiter);
      globalFx.wireGlobalFxChain(true);
      expect(comp.connect).toHaveBeenLastCalledWith(limiter);
      for (const room of [lastInstance(Tone.Reverb), lastInstance(Tone.FeedbackDelay)]) {
        expect(returnOf(room).connect).toHaveBeenLastCalledWith(limiter);
      }
      expect(() => globalFx.setGlobalStereoWidener({ width: 0.2 })).not.toThrow();
    });

    it('builds and wires on when the widener constructor throws, with the same Limiter fallback', async () => {
      toneFlags.widenerCtor.mockImplementationOnce(() => {
        throw new Error('no widener');
      });
      const globalFx = await import('./globalFx');
      expect(() => globalFx.buildGlobalFxChain()).not.toThrow();
      expect(devWarn).toHaveBeenCalledWith(expect.stringContaining('StereoWidener'), expect.any(Error));
      globalFx.wireGlobalFxChain(true);
      expect(returnOf(lastInstance(Tone.Reverb)).connect).toHaveBeenLastCalledWith(lastInstance(Tone.Limiter));
    });

    it('keeps the width across a Decay flip: the node is rewired, never rebuilt', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      const widener = lastInstance(toneFlags.widenerCtor);
      globalFx.setGlobalStereoWidener({ width: 0.2 });
      widener.width.rampTo.mockClear();
      globalFx.wireGlobalFxChain(true);
      globalFx.wireGlobalFxChain(false);
      expect(toneFlags.widenerCtor).toHaveBeenCalledTimes(1);
      expect(widener.width.rampTo).not.toHaveBeenCalled();
      expect(widener.disconnect).toHaveBeenCalledTimes(3);
    });
  });

  describe('setGlobalStereoWidener (Global Pedals)', () => {
    async function built() {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      return { globalFx, widener: lastInstance(toneFlags.widenerCtor) };
    }

    it('no-ops silently before the chain is built', async () => {
      const globalFx = await import('./globalFx');
      expect(() => globalFx.setGlobalStereoWidener({ width: 0.2 })).not.toThrow();
      expect(devWarn).not.toHaveBeenCalled();
    });

    // 0.5 must stay unity, so the width is never squared the way a Mix is: 0.3 is 0.3, not 0.09.
    it('ramps the width over 50 ms with no taper', async () => {
      const { globalFx, widener } = await built();
      globalFx.setGlobalStereoWidener({ width: 0.3 });
      expect(widener.width.rampTo).toHaveBeenLastCalledWith(0.3, 0.05);
      globalFx.setGlobalStereoWidener({ width: 0.5 });
      expect(widener.width.rampTo).toHaveBeenLastCalledWith(0.5, 0.05);
    });

    it('clamps the width into 0 - 1', async () => {
      const { globalFx, widener } = await built();
      globalFx.setGlobalStereoWidener({ width: -0.4 });
      expect(widener.width.rampTo).toHaveBeenLastCalledWith(0, 0.05);
      globalFx.setGlobalStereoWidener({ width: 1.7 });
      expect(widener.width.rampTo).toHaveBeenLastCalledWith(1, 0.05);
    });

    it('ignores a non-finite width and writes nothing for an empty object; never touches the node wet', async () => {
      const { globalFx, widener } = await built();
      globalFx.setGlobalStereoWidener({ width: Number.NaN });
      globalFx.setGlobalStereoWidener({});
      expect(widener.width.rampTo).not.toHaveBeenCalled();
      expect(widener.wet.rampTo).not.toHaveBeenCalled();
    });

    it('falls back to a direct value write when the Signal has no rampTo', async () => {
      const { globalFx, widener } = await built();
      widener.width = { value: 0.5 };
      globalFx.setGlobalStereoWidener({ width: 0.8 });
      expect(widener.width.value).toBe(0.8);
    });

    it('warns and does not throw when the node throws', async () => {
      const { globalFx, widener } = await built();
      widener.width.rampTo.mockImplementation(() => {
        throw new Error('boom');
      });
      expect(() => globalFx.setGlobalStereoWidener({ width: 0.3 })).not.toThrow();
      expect(devWarn).toHaveBeenCalledWith('[AudioEngine] setGlobalStereoWidener failed', expect.any(Error));
    });
  });

  describe('setGlobalVibrato (Global Pedals)', () => {
    async function built() {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      return { globalFx, vibrato: lastInstance(toneFlags.vibratoCtor) };
    }

    it('no-ops silently before the chain is built', async () => {
      const globalFx = await import('./globalFx');
      expect(() => globalFx.setGlobalVibrato({ rate: 3, depth: 0.2, wet: 1 })).not.toThrow();
      expect(devWarn).not.toHaveBeenCalled();
    });

    it('ramps the rate (Tone frequency) and the depth Signal over 50 ms', async () => {
      const { globalFx, vibrato } = await built();
      globalFx.setGlobalVibrato({ rate: 6.5, depth: 0.25 });
      expect(vibrato.frequency.rampTo).toHaveBeenCalledWith(6.5, 0.05);
      expect(vibrato.depth.rampTo).toHaveBeenCalledWith(0.25, 0.05);
    });

    it('ramps the tapered (squared) wet, and writes only the fields given', async () => {
      const { globalFx, vibrato } = await built();
      globalFx.setGlobalVibrato({ wet: 0.5 });
      expect(vibrato.wet.rampTo).toHaveBeenCalledWith(expect.closeTo(0.25, 6), 0.05);
      expect(vibrato.frequency.rampTo).not.toHaveBeenCalled();
      expect(vibrato.depth.rampTo).not.toHaveBeenCalled();
    });

    it('clamps every field into its full range at both ends', async () => {
      const { globalFx, vibrato } = await built();
      globalFx.setGlobalVibrato({ rate: 0, depth: -1, wet: -1 });
      expect(vibrato.frequency.rampTo).toHaveBeenLastCalledWith(0.05, 0.05);
      expect(vibrato.depth.rampTo).toHaveBeenLastCalledWith(0, 0.05);
      expect(vibrato.wet.rampTo).toHaveBeenLastCalledWith(0, 0.05);
      globalFx.setGlobalVibrato({ rate: 20, depth: 3, wet: 3 });
      expect(vibrato.frequency.rampTo).toHaveBeenLastCalledWith(10, 0.05);
      expect(vibrato.depth.rampTo).toHaveBeenLastCalledWith(1, 0.05);
      expect(vibrato.wet.rampTo).toHaveBeenLastCalledWith(1, 0.05);
    });

    it('ignores a non-finite value and still writes the finite fields beside it', async () => {
      const { globalFx, vibrato } = await built();
      globalFx.setGlobalVibrato({ rate: Number.NaN, depth: Number.POSITIVE_INFINITY, wet: 0.4 });
      expect(vibrato.frequency.rampTo).not.toHaveBeenCalled();
      expect(vibrato.depth.rampTo).not.toHaveBeenCalled();
      expect(vibrato.wet.rampTo).toHaveBeenCalledWith(expect.closeTo(0.16, 6), 0.05);
    });

    it('warns and does not throw when the node throws', async () => {
      const { globalFx, vibrato } = await built();
      vibrato.depth.rampTo.mockImplementation(() => {
        throw new Error('boom');
      });
      expect(() => globalFx.setGlobalVibrato({ depth: 0.3 })).not.toThrow();
      expect(devWarn).toHaveBeenCalledWith('[AudioEngine] setGlobalVibrato failed', expect.any(Error));
    });
  });

  describe('setGlobalFrequencyShifter (Global Pedals)', () => {
    async function built() {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      return { globalFx, shifter: lastInstance(toneFlags.shifterCtor) };
    }

    it('no-ops silently before the chain is built', async () => {
      const globalFx = await import('./globalFx');
      expect(() => globalFx.setGlobalFrequencyShifter({ shift: 12, wet: 1 })).not.toThrow();
      expect(devWarn).not.toHaveBeenCalled();
    });

    it('ramps the shift to Tone frequency over 50 ms, keeping its sign', async () => {
      const { globalFx, shifter } = await built();
      globalFx.setGlobalFrequencyShifter({ shift: 12 });
      expect(shifter.frequency.rampTo).toHaveBeenLastCalledWith(12, 0.05);
      globalFx.setGlobalFrequencyShifter({ shift: -7 });
      expect(shifter.frequency.rampTo).toHaveBeenLastCalledWith(-7, 0.05);
      globalFx.setGlobalFrequencyShifter({ shift: 0 });
      expect(shifter.frequency.rampTo).toHaveBeenLastCalledWith(0, 0.05);
    });

    it('clamps the shift signed, not by magnitude: -3000 -> -1000 and 3000 -> 1000', async () => {
      const { globalFx, shifter } = await built();
      globalFx.setGlobalFrequencyShifter({ shift: -3000 });
      expect(shifter.frequency.rampTo).toHaveBeenLastCalledWith(-1000, 0.05);
      globalFx.setGlobalFrequencyShifter({ shift: 3000 });
      expect(shifter.frequency.rampTo).toHaveBeenLastCalledWith(1000, 0.05);
    });

    it('ramps the tapered (squared) wet and clamps it, writing only the fields given', async () => {
      const { globalFx, shifter } = await built();
      globalFx.setGlobalFrequencyShifter({ wet: 0.5 });
      expect(shifter.wet.rampTo).toHaveBeenCalledWith(expect.closeTo(0.25, 6), 0.05);
      expect(shifter.frequency.rampTo).not.toHaveBeenCalled();
      globalFx.setGlobalFrequencyShifter({ wet: 4 });
      expect(shifter.wet.rampTo).toHaveBeenLastCalledWith(1, 0.05);
    });

    it('ignores a non-finite shift and still writes the finite wet beside it', async () => {
      const { globalFx, shifter } = await built();
      globalFx.setGlobalFrequencyShifter({ shift: Number.NaN, wet: 0.2 });
      globalFx.setGlobalFrequencyShifter({ shift: Number.NEGATIVE_INFINITY });
      expect(shifter.frequency.rampTo).not.toHaveBeenCalled();
      expect(shifter.wet.rampTo).toHaveBeenCalledWith(expect.closeTo(0.04, 6), 0.05);
    });

    it('warns and does not throw when the node throws', async () => {
      const { globalFx, shifter } = await built();
      shifter.frequency.rampTo.mockImplementation(() => {
        throw new Error('boom');
      });
      expect(() => globalFx.setGlobalFrequencyShifter({ shift: 5 })).not.toThrow();
      expect(devWarn).toHaveBeenCalledWith('[AudioEngine] setGlobalFrequencyShifter failed', expect.any(Error));
    });
  });

  describe('setGlobalChorus (Global Pedals)', () => {
    async function built() {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      return { globalFx, chorus: lastInstance(toneFlags.chorusCtor) };
    }

    it('no-ops silently before the chain is built', async () => {
      const globalFx = await import('./globalFx');
      expect(() => globalFx.setGlobalChorus({ rate: 2, delayTime: 5, wet: 1 })).not.toThrow();
      expect(devWarn).not.toHaveBeenCalled();
    });

    it('ramps the rate (Tone frequency) and the feedback Signal over 50 ms', async () => {
      const { globalFx, chorus } = await built();
      globalFx.setGlobalChorus({ rate: 2.5, feedback: 0.4 });
      expect(chorus.frequency.rampTo).toHaveBeenCalledWith(2.5, 0.05);
      expect(chorus.feedback.rampTo).toHaveBeenCalledWith(0.4, 0.05);
    });

    it("without Tone's sweep internals, writes delayTime and depth through Tone's own setters; spread is a plain write", async () => {
      const { globalFx, chorus } = await built();
      globalFx.setGlobalChorus({ delayTime: 6.5, depth: 0.4, spread: 90 });
      expect(chorus.delayTime).toBe(6.5);
      expect(chorus.depth).toBe(0.4);
      expect(chorus.spread).toBe(90);
    });

    // Tone's Chorus `delayTime` / `depth` setters write each LFO's range as an instant Signal step (Scale._setRange), a
    // click: one 0.5 ms Delay step measured x217 the steady peak second difference in an offline render, one 0.01 Depth
    // step x13 (docs/specs/GLOBAL_PEDALS.md §8). setGlobalChorus ramps the same two Signals per LFO instead.
    describe("with Tone's sweep internals present", () => {
      type Ramp = { value: number; rampTo: ReturnType<typeof vi.fn> };
      type Scaler = { _min: number; _max: number; _add: Ramp; _mult: Ramp };
      type Sweep = { _delayTime: number; _depth: number; _lfoL: { _scaler: Scaler }; _lfoR: { _scaler: Scaler } };
      const scaler = (): Scaler => ({ _min: 0, _max: 1, _add: { value: 0, rampTo: vi.fn() }, _mult: { value: 1, rampTo: vi.fn() } });

      async function builtWithSweep() {
        const { globalFx, chorus } = await built();
        // Tone stores delayTime in SECONDS internally (the setter takes ms).
        const sweep = Object.assign(chorus, { _delayTime: 0.0035, _depth: 0.7, _lfoL: { _scaler: scaler() }, _lfoR: { _scaler: scaler() } }) as typeof chorus & Sweep;
        return { globalFx, chorus: sweep };
      }

      /** Each LFO's scaler ramped to Tone's own range for (delay seconds, depth): min = d - d*depth, span = 2*d*depth. */
      function expectSweepRamped(chorus: Sweep, delaySeconds: number, depth: number) {
        const min = delaySeconds - delaySeconds * depth;
        const max = delaySeconds + delaySeconds * depth;
        for (const lfo of [chorus._lfoL, chorus._lfoR]) {
          expect(lfo._scaler._add.rampTo).toHaveBeenLastCalledWith(expect.closeTo(min, 9), 0.05);
          expect(lfo._scaler._mult.rampTo).toHaveBeenLastCalledWith(expect.closeTo(max - min, 9), 0.05);
          expect(lfo._scaler._min).toBeCloseTo(min, 9);
          expect(lfo._scaler._max).toBeCloseTo(max, 9);
        }
        expect(chorus._delayTime).toBeCloseTo(delaySeconds, 9);
        expect(chorus._depth).toBeCloseTo(depth, 9);
      }

      it("ramps a Delay change over 50 ms and never calls Tone's stepping setter", async () => {
        const { globalFx, chorus } = await builtWithSweep();
        globalFx.setGlobalChorus({ delayTime: 4 });
        expectSweepRamped(chorus, 0.004, 0.7);
        expect(chorus.delayTime).toBe(3.5);
      });

      it('ramps a Depth change around the stored Delay', async () => {
        const { globalFx, chorus } = await builtWithSweep();
        globalFx.setGlobalChorus({ depth: 0.2 });
        expectSweepRamped(chorus, 0.0035, 0.2);
        expect(chorus.depth).toBe(0.7);
      });

      it('ramps both at once to the range of the new pair, and a later Depth edit keeps the new Delay', async () => {
        const { globalFx, chorus } = await builtWithSweep();
        globalFx.setGlobalChorus({ delayTime: 8, depth: 0.5 });
        expectSweepRamped(chorus, 0.008, 0.5);
        globalFx.setGlobalChorus({ depth: 0.25 });
        expectSweepRamped(chorus, 0.008, 0.25);
      });

      it('clamps first: Delay 0 is 1 ms and Depth 9 is 1, so the range runs from 0 to 2 ms', async () => {
        const { globalFx, chorus } = await builtWithSweep();
        globalFx.setGlobalChorus({ delayTime: 0, depth: 9 });
        expectSweepRamped(chorus, 0.001, 1);
      });

      it('touches no scaler for an edit that changes neither Delay nor Depth', async () => {
        const { globalFx, chorus } = await builtWithSweep();
        globalFx.setGlobalChorus({ rate: 2, spread: 90, wet: 0.5 });
        expect(chorus._lfoL._scaler._add.rampTo).not.toHaveBeenCalled();
        expect(chorus._lfoR._scaler._mult.rampTo).not.toHaveBeenCalled();
      });

      it("falls back to Tone's setters when one LFO's scaler is missing (a Tone that changed its internals)", async () => {
        const { globalFx, chorus } = await builtWithSweep();
        (chorus._lfoR as { _scaler?: Scaler })._scaler = undefined;
        globalFx.setGlobalChorus({ delayTime: 6, depth: 0.3 });
        expect(chorus.delayTime).toBe(6);
        expect(chorus.depth).toBe(0.3);
        expect(chorus._lfoL._scaler._add.rampTo).not.toHaveBeenCalled();
      });
    });

    it('ramps the tapered (squared) wet over 50 ms', async () => {
      const { globalFx, chorus } = await built();
      globalFx.setGlobalChorus({ wet: 0.5 });
      expect(chorus.wet.rampTo).toHaveBeenCalledWith(expect.closeTo(0.25, 6), 0.05);
      globalFx.setGlobalChorus({ wet: 1 });
      expect(chorus.wet.rampTo).toHaveBeenLastCalledWith(1, 0.05);
    });

    it('writes only the fields given', async () => {
      const { globalFx, chorus } = await built();
      globalFx.setGlobalChorus({});
      globalFx.setGlobalChorus({ wet: 0.5 });
      expect([chorus.delayTime, chorus.depth, chorus.spread]).toEqual([3.5, 0.7, 180]);
      expect(chorus.frequency.rampTo).not.toHaveBeenCalled();
      expect(chorus.feedback.rampTo).not.toHaveBeenCalled();
      expect(chorus.wet.rampTo).toHaveBeenCalledTimes(1);
    });

    it('clamps every field into its full range at both ends', async () => {
      const { globalFx, chorus } = await built();
      globalFx.setGlobalChorus({ rate: 0, delayTime: 0, depth: -1, spread: -10, feedback: -1, wet: -1 });
      expect(chorus.frequency.rampTo).toHaveBeenLastCalledWith(0.05, 0.05);
      expect([chorus.delayTime, chorus.depth, chorus.spread]).toEqual([1, 0, 0]);
      expect(chorus.feedback.rampTo).toHaveBeenLastCalledWith(0, 0.05);
      expect(chorus.wet.rampTo).toHaveBeenLastCalledWith(0, 0.05);

      globalFx.setGlobalChorus({ rate: 99, delayTime: 99, depth: 9, spread: 999, feedback: 5, wet: 3 });
      expect(chorus.frequency.rampTo).toHaveBeenLastCalledWith(10, 0.05);
      expect([chorus.delayTime, chorus.depth, chorus.spread]).toEqual([20, 1, 180]);
      // Above 0.9 a feedback loop runs away; the full range stops there.
      expect(chorus.feedback.rampTo).toHaveBeenLastCalledWith(0.9, 0.05);
      expect(chorus.wet.rampTo).toHaveBeenLastCalledWith(1, 0.05);
    });

    it('ignores a non-finite value and still writes the finite fields beside it', async () => {
      const { globalFx, chorus } = await built();
      globalFx.setGlobalChorus({
        rate: Number.NaN,
        delayTime: Number.POSITIVE_INFINITY,
        depth: Number.NaN,
        spread: Number.NEGATIVE_INFINITY,
        feedback: Number.NaN,
        wet: 0.6,
      });
      expect(chorus.frequency.rampTo).not.toHaveBeenCalled();
      expect(chorus.feedback.rampTo).not.toHaveBeenCalled();
      expect([chorus.delayTime, chorus.depth, chorus.spread]).toEqual([3.5, 0.7, 180]);
      expect(chorus.wet.rampTo).toHaveBeenCalledWith(expect.closeTo(0.36, 6), 0.05);
    });

    it('falls back to a direct value write when the Signals have no rampTo', async () => {
      const { globalFx, chorus } = await built();
      chorus.frequency = { value: 1.5 };
      chorus.feedback = { value: 0 };
      chorus.wet = { value: 0 };
      globalFx.setGlobalChorus({ rate: 3, feedback: 0.2, wet: 0.7 });
      expect(chorus.frequency.value).toBe(3);
      expect(chorus.feedback.value).toBe(0.2);
      expect(chorus.wet.value).toBeCloseTo(0.49, 6);
    });

    it('warns and does not throw when the node throws', async () => {
      const { globalFx, chorus } = await built();
      chorus.feedback.rampTo.mockImplementation(() => {
        throw new Error('boom');
      });
      expect(() => globalFx.setGlobalChorus({ feedback: 0.3 })).not.toThrow();
      expect(devWarn).toHaveBeenCalledWith('[AudioEngine] setGlobalChorus failed', expect.any(Error));
    });
  });

  describe('setGlobalTremolo (Global Pedals)', () => {
    async function built() {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      return { globalFx, tremolo: lastInstance(toneFlags.tremoloCtor) };
    }

    it('no-ops silently before the chain is built', async () => {
      const globalFx = await import('./globalFx');
      expect(() => globalFx.setGlobalTremolo({ rate: 2, depth: 0.5, wet: 1 })).not.toThrow();
      expect(devWarn).not.toHaveBeenCalled();
    });

    it('ramps the rate (Tone frequency) and the depth Signal over 50 ms, and writes spread plain', async () => {
      const { globalFx, tremolo } = await built();
      globalFx.setGlobalTremolo({ rate: 4, depth: 0.3, spread: 45 });
      expect(tremolo.frequency.rampTo).toHaveBeenCalledWith(4, 0.05);
      expect(tremolo.depth.rampTo).toHaveBeenCalledWith(0.3, 0.05);
      expect(tremolo.spread).toBe(45);
    });

    it('ramps the tapered (squared) wet over 50 ms', async () => {
      const { globalFx, tremolo } = await built();
      globalFx.setGlobalTremolo({ wet: 0.5 });
      expect(tremolo.wet.rampTo).toHaveBeenCalledWith(expect.closeTo(0.25, 6), 0.05);
    });

    it('writes only the fields given', async () => {
      const { globalFx, tremolo } = await built();
      globalFx.setGlobalTremolo({ wet: 0.5 });
      expect(tremolo.spread).toBe(180);
      expect(tremolo.frequency.rampTo).not.toHaveBeenCalled();
      expect(tremolo.depth.rampTo).not.toHaveBeenCalled();
    });

    it('clamps every field into its full range at both ends', async () => {
      const { globalFx, tremolo } = await built();
      globalFx.setGlobalTremolo({ rate: -1, depth: -1, spread: -1, wet: -1 });
      expect(tremolo.frequency.rampTo).toHaveBeenLastCalledWith(0.05, 0.05);
      expect(tremolo.depth.rampTo).toHaveBeenLastCalledWith(0, 0.05);
      expect(tremolo.spread).toBe(0);
      expect(tremolo.wet.rampTo).toHaveBeenLastCalledWith(0, 0.05);
      globalFx.setGlobalTremolo({ rate: 50, depth: 2, spread: 400, wet: 2 });
      expect(tremolo.frequency.rampTo).toHaveBeenLastCalledWith(10, 0.05);
      expect(tremolo.depth.rampTo).toHaveBeenLastCalledWith(1, 0.05);
      expect(tremolo.spread).toBe(180);
      expect(tremolo.wet.rampTo).toHaveBeenLastCalledWith(1, 0.05);
    });

    it('ignores a non-finite value and still writes the finite fields beside it', async () => {
      const { globalFx, tremolo } = await built();
      globalFx.setGlobalTremolo({ rate: Number.NaN, depth: Number.POSITIVE_INFINITY, spread: Number.NaN, wet: 0.4 });
      expect(tremolo.frequency.rampTo).not.toHaveBeenCalled();
      expect(tremolo.depth.rampTo).not.toHaveBeenCalled();
      expect(tremolo.spread).toBe(180);
      expect(tremolo.wet.rampTo).toHaveBeenCalledWith(expect.closeTo(0.16, 6), 0.05);
    });

    it('warns and does not throw when the node throws', async () => {
      const { globalFx, tremolo } = await built();
      tremolo.depth.rampTo.mockImplementation(() => {
        throw new Error('boom');
      });
      expect(() => globalFx.setGlobalTremolo({ depth: 0.3 })).not.toThrow();
      expect(devWarn).toHaveBeenCalledWith('[AudioEngine] setGlobalTremolo failed', expect.any(Error));
    });
  });

  // The Spread de-click (docs/specs/GLOBAL_PEDALS.md §8). Tone's `spread` setter swaps both LFOs' waveform at once, on
  // the audio thread's current time: measured in a real-time context, one 5° step clicked x49-79 on a lit Chorus and
  // x7 on a lit Tremolo. A lit pedal is ducked instead: Mix ramps to dry over 20 ms, Spread is written from Tone's
  // audio-clock timer once the ramp has run (lookAhead + 20 ms + 10 ms, because ramps start lookAhead ahead and the
  // swap does not), then Mix ramps back. Measured x1.3 / x1.6. A dry pedal is written at once.
  describe.each([
    {
      pedal: 'chorus' as const,
      set: (fx: typeof import('./globalFx'), p: { spread?: number; wet?: number }) => fx.setGlobalChorus(p),
      node: () => lastInstance(toneFlags.chorusCtor),
    },
    {
      pedal: 'tremolo' as const,
      set: (fx: typeof import('./globalFx'), p: { spread?: number; wet?: number }) => fx.setGlobalTremolo(p),
      node: () => lastInstance(toneFlags.tremoloCtor),
    },
  ])('the $pedal Spread de-click', ({ set, node }) => {
    async function lit(mix = 0.5) {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      set(globalFx, { wet: mix });
      return { globalFx, n: node() };
    }

    it('writes Spread at once on a dry pedal: nothing to hear, so no duck and no timer', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      const n = node();
      set(globalFx, { spread: 90 });
      expect(n.spread).toBe(90);
      expect(toneFlags.timeouts).toHaveLength(0);
      expect(n.wet.rampTo).not.toHaveBeenCalled();
    });

    it('on a lit pedal ducks to dry over 20 ms, writes Spread only when the timer fires, then ramps back to its Mix', async () => {
      const { globalFx, n } = await lit(0.5);
      set(globalFx, { spread: 90 });
      expect(n.wet.rampTo).toHaveBeenLastCalledWith(0, 0.02);
      expect(n.spread).toBe(180);
      expect(toneFlags.timeouts).toHaveLength(1);
      expect(toneFlags.timeouts[0].seconds).toBeCloseTo(0.1 + 0.02 + 0.01, 9);
      fireTimeouts();
      expect(n.spread).toBe(90);
      expect(n.wet.rampTo).toHaveBeenLastCalledWith(expect.closeTo(0.25, 9), 0.02);
    });

    it("waits out the context's lookAhead as it is at the call", async () => {
      toneFlags.lookAhead = 0.03;
      const { globalFx } = await lit(0.5);
      set(globalFx, { spread: 90 });
      expect(toneFlags.timeouts[0].seconds).toBeCloseTo(0.03 + 0.02 + 0.01, 9);
    });

    it('folds a drag into one write: one duck, the timer re-armed on every step, the last Spread written', async () => {
      const { globalFx, n } = await lit(0.5);
      set(globalFx, { spread: 170 });
      set(globalFx, { spread: 160 });
      set(globalFx, { spread: 150 });
      expect(n.wet.rampTo.mock.calls.filter(([v]: unknown[]) => v === 0)).toHaveLength(1);
      expect(toneFlags.timeouts).toHaveLength(1);
      fireTimeouts();
      expect(n.spread).toBe(150);
    });

    it('a Mix edit during the duck moves where it returns to, without ramping up early', async () => {
      const { globalFx, n } = await lit(0.5);
      set(globalFx, { spread: 90 });
      set(globalFx, { wet: 0.8 });
      expect(n.wet.rampTo).toHaveBeenLastCalledWith(0, 0.02);
      fireTimeouts();
      expect(n.wet.rampTo).toHaveBeenLastCalledWith(expect.closeTo(0.64, 9), 0.02);
    });

    it('a Mix of 0 during the duck leaves the pedal dry after the write', async () => {
      const { globalFx, n } = await lit(0.5);
      set(globalFx, { spread: 90 });
      set(globalFx, { wet: 0 });
      fireTimeouts();
      expect(n.spread).toBe(90);
      expect(n.wet.rampTo).toHaveBeenLastCalledWith(0, 0.02);
    });

    it('a chain rebuilt during the duck drops the pending write and starts the new node dry', async () => {
      const { globalFx, n } = await lit(0.5);
      set(globalFx, { spread: 90 });
      globalFx.buildGlobalFxChain();
      const fresh = node();
      expect(fresh).not.toBe(n);
      fireTimeouts();
      expect(n.spread).toBe(180);
      set(globalFx, { spread: 45 });
      expect(fresh.spread).toBe(45);
    });

    it('warns and does not throw when the deferred write throws', async () => {
      const { globalFx, n } = await lit(0.5);
      set(globalFx, { spread: 90 });
      n.wet.rampTo.mockImplementation(() => {
        throw new Error('boom');
      });
      expect(() => fireTimeouts()).not.toThrow();
      expect(devWarn).toHaveBeenCalledWith('[AudioEngine] a ducked Spread write failed', expect.any(Error));
    });
  });

  describe('wireGlobalFxChain — Natural Decay (controlledDecay=false)', () => {
    it('wires the dry chain entry cut -> EQ3 -> LPF -> HPF -> filter cut -> Distortion -> Chebyshev -> BitCrusher -> AutoWah -> Phaser -> Chorus -> Tremolo -> Vibrato -> FrequencyShifter -> Compressor -> StereoWidener -> Limiter -> masterGain -> Destination', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain(); // builds + wires Natural Decay by default

      const eqNode = lastInstance(Tone.EQ3);
      const hpfNode = lastInstance(Tone.Filter);
      const lpfNode = secondLastInstance(Tone.Filter);
      const distNode = lastInstance(Tone.Distortion);
      const chebNode = lastInstance(Tone.Chebyshev);
      const crushNode = lastInstance(toneFlags.crusherCtor);
      const wahNode = lastInstance(toneFlags.wahCtor);
      const phaserNode = lastInstance(toneFlags.phaserCtor);
      const chorusNode = lastInstance(toneFlags.chorusCtor);
      const tremoloNode = lastInstance(toneFlags.tremoloCtor);
      const vibratoNode = lastInstance(toneFlags.vibratoCtor);
      const shifterNode = lastInstance(toneFlags.shifterCtor);
      const compNode = lastInstance(Tone.Compressor);
      const limiterNode = lastInstance(Tone.Limiter);
      const gainNode = lastInstance(Tone.Gain);

      expect(eqNode.connect).toHaveBeenCalledWith(lpfNode);
      expect(lpfNode.connect).toHaveBeenCalledWith(hpfNode);
      expect(hpfNode.connect).toHaveBeenCalledWith(filterCutOf());
      expect(filterCutOf().connect).toHaveBeenCalledWith(distNode);
      expect(hpfNode.connect).not.toHaveBeenCalledWith(compNode);
      expect(distNode.connect).toHaveBeenCalledWith(chebNode);
      expect(chebNode.connect).toHaveBeenCalledWith(crushNode);
      expect(crushNode.connect).toHaveBeenCalledWith(wahNode);
      expect(crushNode.connect).not.toHaveBeenCalledWith(compNode);
      expect(wahNode.connect).toHaveBeenCalledWith(phaserNode);
      expect(wahNode.connect).not.toHaveBeenCalledWith(compNode);
      expect(phaserNode.connect).toHaveBeenCalledWith(chorusNode);
      expect(phaserNode.connect).not.toHaveBeenCalledWith(compNode);
      expect(chorusNode.connect).toHaveBeenCalledWith(tremoloNode);
      expect(tremoloNode.connect).toHaveBeenCalledWith(vibratoNode);
      expect(vibratoNode.connect).toHaveBeenCalledWith(shifterNode);
      expect(shifterNode.connect).toHaveBeenCalledWith(compNode);
      expect(compNode.connect).toHaveBeenCalledWith(lastInstance(toneFlags.widenerCtor));
      expect(lastInstance(toneFlags.widenerCtor).connect).toHaveBeenCalledWith(limiterNode);
      expect(limiterNode.connect).toHaveBeenCalledWith(gainNode);
      expect(gainNode.toDestination).toHaveBeenCalled();
    });

    it('sends the dry chain nowhere near a room - no dry node connects to Delay or Reverb', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      const delayNode = lastInstance(Tone.FeedbackDelay);
      const reverbNode = lastInstance(Tone.Reverb);

      for (const ctor of [Tone.EQ3, Tone.Compressor, Tone.Limiter]) {
        const node = lastInstance(ctor);
        expect(node.connect).not.toHaveBeenCalledWith(delayNode);
        expect(node.connect).not.toHaveBeenCalledWith(reverbNode);
      }
      for (const filter of [lastInstance(Tone.Filter), secondLastInstance(Tone.Filter)]) {
        expect(filter.connect).not.toHaveBeenCalledWith(delayNode);
        expect(filter.connect).not.toHaveBeenCalledWith(reverbNode);
      }
    });

    it('runs each room into its own return only, and both returns into the Compressor input', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      const delayNode = lastInstance(Tone.FeedbackDelay);
      const reverbNode = lastInstance(Tone.Reverb);
      const compNode = lastInstance(Tone.Compressor);
      const limiterNode = lastInstance(Tone.Limiter);

      expect(reverbNode.connect).toHaveBeenCalledTimes(1);
      expect(delayNode.connect).toHaveBeenCalledTimes(1);
      expect(reverbNode.connect).not.toHaveBeenCalledWith(delayNode);
      expect(delayNode.connect).not.toHaveBeenCalledWith(reverbNode);
      for (const ret of [returnOf(reverbNode), returnOf(delayNode)]) {
        expect(ret.connect).toHaveBeenCalledTimes(1);
        expect(ret.connect).toHaveBeenCalledWith(compNode);
        expect(ret.connect).not.toHaveBeenCalledWith(limiterNode);
      }
    });
  });

  describe('wireGlobalFxChain — Controlled Decay (controlledDecay=true)', () => {
    it('keeps the same dry chain entry cut -> EQ3 -> LPF -> HPF -> filter cut -> Distortion -> Chebyshev -> BitCrusher -> AutoWah -> Phaser -> Chorus -> Tremolo -> Vibrato -> FrequencyShifter -> Compressor -> StereoWidener -> Limiter -> masterGain', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();

      const eqNode = lastInstance(Tone.EQ3);
      const hpfNode = lastInstance(Tone.Filter);
      const lpfNode = secondLastInstance(Tone.Filter);
      const distNode = lastInstance(Tone.Distortion);
      const chebNode = lastInstance(Tone.Chebyshev);
      const crushNode = lastInstance(toneFlags.crusherCtor);
      const wahNode = lastInstance(toneFlags.wahCtor);
      const phaserNode = lastInstance(toneFlags.phaserCtor);
      const chorusNode = lastInstance(toneFlags.chorusCtor);
      const tremoloNode = lastInstance(toneFlags.tremoloCtor);
      const vibratoNode = lastInstance(toneFlags.vibratoCtor);
      const shifterNode = lastInstance(toneFlags.shifterCtor);
      const compNode = lastInstance(Tone.Compressor);
      const limiterNode = lastInstance(Tone.Limiter);
      const gainNode = lastInstance(Tone.Gain);

      globalFx.wireGlobalFxChain(true);

      expect(eqNode.connect).toHaveBeenLastCalledWith(lpfNode);
      expect(lpfNode.connect).toHaveBeenLastCalledWith(hpfNode);
      expect(hpfNode.connect).toHaveBeenLastCalledWith(filterCutOf());
      expect(filterCutOf().connect).toHaveBeenLastCalledWith(distNode);
      expect(distNode.connect).toHaveBeenLastCalledWith(chebNode);
      expect(chebNode.connect).toHaveBeenLastCalledWith(crushNode);
      expect(crushNode.connect).toHaveBeenLastCalledWith(wahNode);
      expect(wahNode.connect).toHaveBeenLastCalledWith(phaserNode);
      expect(phaserNode.connect).toHaveBeenLastCalledWith(chorusNode);
      expect(chorusNode.connect).toHaveBeenLastCalledWith(tremoloNode);
      expect(tremoloNode.connect).toHaveBeenLastCalledWith(vibratoNode);
      expect(vibratoNode.connect).toHaveBeenLastCalledWith(shifterNode);
      expect(shifterNode.connect).toHaveBeenLastCalledWith(compNode);
      expect(compNode.connect).toHaveBeenLastCalledWith(lastInstance(toneFlags.widenerCtor));
      expect(lastInstance(toneFlags.widenerCtor).connect).toHaveBeenLastCalledWith(limiterNode);
      expect(limiterNode.connect).toHaveBeenLastCalledWith(gainNode);
    });

    // Global Pedals T6: the Controlled join moved from the Limiter to the StereoWidener just before it.
    it('joins both returns at the StereoWidener input and none at the Compressor or the Limiter', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      const delayNode = lastInstance(Tone.FeedbackDelay);
      const reverbNode = lastInstance(Tone.Reverb);
      const compNode = lastInstance(Tone.Compressor);
      const limiterNode = lastInstance(Tone.Limiter);
      const widenerNode = lastInstance(toneFlags.widenerCtor);
      const reverbReturn = returnOf(reverbNode);
      const delayReturn = returnOf(delayNode);
      for (const ret of [reverbReturn, delayReturn]) ret.connect.mockClear();
      for (const room of [reverbNode, delayNode]) room.connect.mockClear();

      globalFx.wireGlobalFxChain(true);

      expect(reverbNode.connect).toHaveBeenCalledTimes(1);
      expect(delayNode.connect).toHaveBeenCalledTimes(1);
      expect(reverbNode.connect).toHaveBeenCalledWith(reverbReturn);
      expect(delayNode.connect).toHaveBeenCalledWith(delayReturn);
      for (const ret of [reverbReturn, delayReturn]) {
        expect(ret.connect).toHaveBeenCalledTimes(1);
        expect(ret.connect).toHaveBeenCalledWith(widenerNode);
        expect(ret.connect).not.toHaveBeenCalledWith(limiterNode);
        expect(ret.connect).not.toHaveBeenCalledWith(compNode);
      }
    });

    it('disconnects every real node before reconnecting the new topology (no dual-routing after a toggle flip)', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain(); // wires Natural Decay once already

      const eqNode = lastInstance(Tone.EQ3);
      const hpfNode = lastInstance(Tone.Filter);
      const lpfNode = secondLastInstance(Tone.Filter);
      const delayNode = lastInstance(Tone.FeedbackDelay);
      const reverbNode = lastInstance(Tone.Reverb);
      const compNode = lastInstance(Tone.Compressor);
      const limiterNode = lastInstance(Tone.Limiter);

      const reverbReturn = returnOf(reverbNode);
      const delayReturn = returnOf(delayNode);
      const colourNodes = [lastInstance(Tone.Distortion), lastInstance(Tone.Chebyshev), lastInstance(toneFlags.crusherCtor)];
      const modulationNodes = [lastInstance(toneFlags.wahCtor), lastInstance(toneFlags.phaserCtor)];
      const all = [eqNode, lpfNode, hpfNode, ...colourNodes, ...modulationNodes, delayNode, reverbNode, compNode, limiterNode, reverbReturn, delayReturn];
      // Forget the build's own wiring so only the flip is under test.
      for (const node of all) node.disconnect.mockClear();

      globalFx.wireGlobalFxChain(true);

      for (const node of all) {
        expect(node.disconnect).toHaveBeenCalled();
      }
    });

    it('flipping back to false (Natural) after true (Controlled) moves both returns back to the Compressor', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      globalFx.wireGlobalFxChain(true);

      const compNode = lastInstance(Tone.Compressor);
      const reverbReturn = returnOf(lastInstance(Tone.Reverb));
      const delayReturn = returnOf(lastInstance(Tone.FeedbackDelay));
      expect(reverbReturn.connect).toHaveBeenLastCalledWith(lastInstance(toneFlags.widenerCtor));

      globalFx.wireGlobalFxChain(false);

      // The dry chain is the same either way; only where the returns rejoin moves.
      expect(reverbReturn.connect).toHaveBeenLastCalledWith(compNode);
      expect(delayReturn.connect).toHaveBeenLastCalledWith(compNode);
      expect(lastInstance(toneFlags.phaserCtor).connect).toHaveBeenLastCalledWith(lastInstance(toneFlags.chorusCtor));
    });

    it('only ever calls disconnect() with no arguments, so a robot send into a room survives every flip', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      globalFx.wireGlobalFxChain(true);
      globalFx.wireGlobalFxChain(false);
      globalFx.wireGlobalFxChain(true);

      // disconnect() with no argument drops a node's OUTPUTS and nothing else. A room's INPUT (where a robot's
      // send gain is connected) therefore stays wired - the same reason the engine can flip Decay Mode mid-play.
      const nodes = [Tone.EQ3, Tone.Filter, Tone.Distortion, Tone.Chebyshev, toneFlags.crusherCtor, toneFlags.wahCtor, toneFlags.phaserCtor, Tone.Reverb, Tone.FeedbackDelay, Tone.Compressor, Tone.Limiter, Tone.Gain];
      for (const ctor of nodes) {
        for (const result of (ctor as unknown as AnyMock).mock.results) {
          for (const call of (result.value as { disconnect: Mock }).disconnect.mock.calls) {
            expect(call).toEqual([]);
          }
        }
      }
    });

    it('wires every connection exactly once per flip - a return never doubles up on its join node', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      const reverbReturn = returnOf(lastInstance(Tone.Reverb));
      reverbReturn.connect.mockClear();

      globalFx.wireGlobalFxChain(true);
      globalFx.wireGlobalFxChain(false);

      expect(reverbReturn.connect).toHaveBeenCalledTimes(2);
      expect(reverbReturn.disconnect).toHaveBeenCalledTimes(3); // build, flip, flip
    });

    it('keeps the output taps connected through repeated flips', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      globalFx.attachOutputTaps();
      const eqNode = lastInstance(Tone.EQ3);
      const preTap = createAnalyser.mock.results[0].value;
      const masterTap = createAnalyser.mock.results[1].value;
      const masterGain = lastInstance(Tone.Gain);
      eqNode.connect.mockClear();
      masterGain.connect.mockClear();

      globalFx.wireGlobalFxChain(true);
      globalFx.wireGlobalFxChain(false);

      expect(eqNode.connect.mock.calls.filter((c: unknown[]) => c[0] === preTap)).toHaveLength(2);
      expect(masterGain.connect.mock.calls.filter((c: unknown[]) => c[0] === masterTap)).toHaveLength(2);
    });
  });

  describe('output taps (docs/specs/AUDIO_OUTPUT_DIAGNOSTIC.md)', () => {
    type FakeAnalyser = ReturnType<typeof makeFakeAnalyser>;
    const analysers = (): FakeAnalyser[] => createAnalyser.mock.results.map((r) => r.value as FakeAnalyser);
    /** The analysers a node has been asked to feed. */
    const tapsFedBy = (node: { connect: Mock }): FakeAnalyser[] =>
      node.connect.mock.calls.map((call) => call[0] as FakeAnalyser).filter((target) => analysers().includes(target));

    it('creates no analyser while nothing has asked for the taps (the ?debug-off case)', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      globalFx.wireGlobalFxChain(true);
      globalFx.wireGlobalFxChain(false);
      expect(createAnalyser).not.toHaveBeenCalled();
    });

    it('attachOutputTaps() after the build creates two analysers, each with the largest window Web Audio allows', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      globalFx.attachOutputTaps();
      expect(createAnalyser).toHaveBeenCalledTimes(2);
      expect(globalFx.OUTPUT_TAP_SIZE).toBe(32768);
      for (const tap of analysers()) expect(tap.fftSize).toBe(globalFx.OUTPUT_TAP_SIZE);
    });

    it('feeds one analyser from EQ3 (pre-chain) and a different one from masterGain (master)', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      const eq = lastInstance(Tone.EQ3);
      const masterGain = lastInstance(Tone.Gain);
      globalFx.attachOutputTaps();

      const preTaps = tapsFedBy(eq);
      const masterTaps = tapsFedBy(masterGain);
      expect(preTaps).toHaveLength(1);
      expect(masterTaps).toHaveLength(1);
      expect(preTaps[0]).not.toBe(masterTaps[0]);
    });

    it('never connects a tap onward — no output, and never the destination', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      globalFx.attachOutputTaps();
      for (const tap of analysers()) expect(tap.connect).not.toHaveBeenCalled();
    });

    it('is idempotent: asking twice still creates only two analysers', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      globalFx.attachOutputTaps();
      globalFx.attachOutputTaps();
      expect(createAnalyser).toHaveBeenCalledTimes(2);
    });

    it('reads each tap as a full-window Float32Array: pre from the EQ3 tap, master from the masterGain tap', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      const eq = lastInstance(Tone.EQ3);
      const masterGain = lastInstance(Tone.Gain);
      globalFx.attachOutputTaps();
      tapsFedBy(eq)[0].getFloatTimeDomainData.mockImplementation((buffer: Float32Array) => buffer.fill(0.1));
      tapsFedBy(masterGain)[0].getFloatTimeDomainData.mockImplementation((buffer: Float32Array) => buffer.fill(0.3));

      const { pre, master } = globalFx.readOutputTaps();
      // Full window: the whole fftSize, not half of it (Tone.Analyser halved it, leaving unseen gaps).
      expect(pre).toHaveLength(globalFx.OUTPUT_TAP_SIZE);
      expect(master).toHaveLength(globalFx.OUTPUT_TAP_SIZE);
      expect(pre![0]).toBeCloseTo(0.1, 6);
      expect(pre!.at(-1)).toBeCloseTo(0.1, 6);
      expect(master![0]).toBeCloseTo(0.3, 6);
    });

    it('reuses one buffer per tap across reads instead of allocating ~128 KB every sampler tick', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      globalFx.attachOutputTaps();
      const first = globalFx.readOutputTaps();
      const second = globalFx.readOutputTaps();
      expect(second.pre).toBe(first.pre);
      expect(second.master).toBe(first.master);
      expect(first.pre).not.toBe(first.master);
    });

    it('reads null for both taps before anything is attached', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      expect(globalFx.readOutputTaps()).toEqual({ pre: null, master: null });
    });

    it('reads null for a tap whose analyser throws, without throwing itself', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      const masterGain = lastInstance(Tone.Gain);
      globalFx.attachOutputTaps();
      tapsFedBy(masterGain)[0].getFloatTimeDomainData.mockImplementation(() => {
        throw new Error('analyser gone');
      });
      expect(() => globalFx.readOutputTaps()).not.toThrow();
      expect(globalFx.readOutputTaps().master).toBeNull();
      expect(globalFx.readOutputTaps().pre).not.toBeNull();
    });

    it('does nothing, and does not throw, when the FX nodes have not been built yet', async () => {
      const globalFx = await import('./globalFx');
      expect(() => globalFx.attachOutputTaps()).not.toThrow();
      expect(createAnalyser).not.toHaveBeenCalled();
      expect(globalFx.readOutputTaps()).toEqual({ pre: null, master: null });
    });

    it('warns instead of throwing when an analyser cannot be created, and reads null', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      createAnalyser.mockImplementationOnce(() => {
        throw new Error('no analyser for you');
      });
      expect(() => globalFx.attachOutputTaps()).not.toThrow();
      expect(devWarn).toHaveBeenCalled();
      expect(globalFx.readOutputTaps().pre).toBeNull();
    });

    it('warns instead of throwing when connecting a tap fails', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      const eq = lastInstance(Tone.EQ3);
      eq.connect.mockImplementationOnce(() => {
        throw new Error('connect refused');
      });
      expect(() => globalFx.attachOutputTaps()).not.toThrow();
      expect(devWarn).toHaveBeenCalled();
    });

    it('detachOutputTaps() disconnects each tap from its source and reads null afterwards', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      const eq = lastInstance(Tone.EQ3);
      const masterGain = lastInstance(Tone.Gain);
      globalFx.attachOutputTaps();
      const [preTap] = tapsFedBy(eq);
      const [masterTap] = tapsFedBy(masterGain);

      globalFx.detachOutputTaps();

      expect(eq.disconnect).toHaveBeenCalledWith(preTap);
      expect(masterGain.disconnect).toHaveBeenCalledWith(masterTap);
      expect(globalFx.readOutputTaps()).toEqual({ pre: null, master: null });
    });

    it('detachOutputTaps() is safe with nothing attached, and safe to repeat', async () => {
      const globalFx = await import('./globalFx');
      expect(() => globalFx.detachOutputTaps()).not.toThrow();
      globalFx.buildGlobalFxChain();
      globalFx.attachOutputTaps();
      globalFx.detachOutputTaps();
      expect(() => globalFx.detachOutputTaps()).not.toThrow();
    });

    it('a tap can be attached again after a detach, on fresh analysers', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      globalFx.attachOutputTaps();
      globalFx.detachOutputTaps();
      globalFx.attachOutputTaps();
      expect(createAnalyser).toHaveBeenCalledTimes(4);
    });

    describe('surviving a rewire (the re-attach hook at the end of wireGlobalFxChain)', () => {
      /** Was the last thing done between `source` and a tap a connect — i.e. after the source's last disconnect? */
      const tapStillConnected = (source: { connect: Mock; disconnect: Mock }): boolean => {
        const tapConnects = source.connect.mock.calls.map((call, i) =>
          analysers().includes(call[0] as FakeAnalyser) ? source.connect.mock.invocationCallOrder[i] : -1,
        );
        const lastTapConnect = Math.max(-1, ...tapConnects);
        const lastDisconnect = Math.max(-1, ...source.disconnect.mock.invocationCallOrder);
        return lastTapConnect > lastDisconnect;
      };

      it('taps asked for before the chain exists are built and connected once the chain is built', async () => {
        const globalFx = await import('./globalFx');
        globalFx.attachOutputTaps();
        expect(createAnalyser).not.toHaveBeenCalled(); // nothing to listen to yet

        globalFx.buildGlobalFxChain();
        const eq = lastInstance(Tone.EQ3);
        const masterGain = lastInstance(Tone.Gain);

        expect(createAnalyser).toHaveBeenCalledTimes(2);
        expect(tapsFedBy(eq)).toHaveLength(1);
        expect(tapsFedBy(masterGain)).toHaveLength(1);
        expect(tapStillConnected(eq)).toBe(true);
        expect(tapStillConnected(masterGain)).toBe(true);
      });

      it('leaves both taps connected after Natural -> Controlled Decay and back (disconnectAllFxNodes drops every output)', async () => {
        const globalFx = await import('./globalFx');
        globalFx.buildGlobalFxChain();
        const eq = lastInstance(Tone.EQ3);
        const masterGain = lastInstance(Tone.Gain);
        globalFx.attachOutputTaps();

        globalFx.wireGlobalFxChain(true);
        expect(tapStillConnected(eq)).toBe(true);
        expect(tapStillConnected(masterGain)).toBe(true);

        globalFx.wireGlobalFxChain(false);
        expect(tapStillConnected(eq)).toBe(true);
        expect(tapStillConnected(masterGain)).toBe(true);
      });

      it('reconnects the same two analysers rather than making new ones', async () => {
        const globalFx = await import('./globalFx');
        globalFx.buildGlobalFxChain();
        const eq = lastInstance(Tone.EQ3);
        globalFx.attachOutputTaps();
        const [preTap] = tapsFedBy(eq);

        globalFx.wireGlobalFxChain(true);
        globalFx.wireGlobalFxChain(false);

        expect(createAnalyser).toHaveBeenCalledTimes(2);
        expect(tapsFedBy(eq).every((tap) => tap === preTap)).toBe(true);
      });

      it('warns instead of throwing when a tap cannot be reconnected after a rewire', async () => {
        const globalFx = await import('./globalFx');
        globalFx.buildGlobalFxChain();
        const eq = lastInstance(Tone.EQ3);
        globalFx.attachOutputTaps();
        eq.connect.mockImplementation((target: unknown) => {
          if (analysers().includes(target as FakeAnalyser)) throw new Error('refused');
          return eq;
        });

        expect(() => globalFx.wireGlobalFxChain(true)).not.toThrow();
        expect(devWarn).toHaveBeenCalled();
      });

      it('does not reconnect anything after detachOutputTaps()', async () => {
        const globalFx = await import('./globalFx');
        globalFx.buildGlobalFxChain();
        const eq = lastInstance(Tone.EQ3);
        const masterGain = lastInstance(Tone.Gain);
        globalFx.attachOutputTaps();
        globalFx.detachOutputTaps();
        const eqCallsBefore = eq.connect.mock.calls.length;
        const masterCallsBefore = masterGain.connect.mock.calls.length;

        globalFx.wireGlobalFxChain(true);

        const tapConnects = (node: { connect: Mock }, from: number) =>
          node.connect.mock.calls.slice(from).filter((call) => analysers().includes(call[0] as FakeAnalyser));
        expect(tapConnects(eq, eqCallsBefore)).toHaveLength(0);
        expect(tapConnects(masterGain, masterCallsBefore)).toHaveLength(0);
        expect(createAnalyser).toHaveBeenCalledTimes(2);
      });
    });

    it('OUTPUT_TAP_SIZE covers a whole sampler interval even at 44.1 kHz (no unseen gap between samples)', async () => {
      const globalFx = await import('./globalFx');
      expect((globalFx.OUTPUT_TAP_SIZE / 44100) * 1000).toBeGreaterThanOrEqual(SAMPLE_INTERVAL_MS);
    });
  });

  describe('setGlobalLimiter', () => {
    it('does not throw when called before buildGlobalFxChain()', async () => {
      const globalFx = await import('./globalFx');
      expect(() => globalFx.setGlobalLimiter({ threshold: -6 })).not.toThrow();
    });

    it('updates the live Limiter node\'s threshold', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      const limiterNode = lastInstance(Tone.Limiter) ?? { threshold: { value: -12 } };

      globalFx.setGlobalLimiter({ threshold: -6 });

      expect(limiterNode.threshold.value).toBe(-6);
    });
  });

  it('no longer exports setEffectBypass/setGlobalBypass — removed, off states are expressed via the setGlobal* params themselves', async () => {
    const globalFx = await import('./globalFx');
    expect('setEffectBypass' in globalFx).toBe(false);
    expect('setGlobalBypass' in globalFx).toBe(false);
  });

  describe('setGlobalFilterLPF/HPF frequency ramping (docs/tasks/AUDIO_ENGINE_CLEANUP.md P2.4) — confirmed live: a large LPF frequency jump produced an audible click with a direct .value write', () => {
    it('ramps the live LPF frequency via rampTo when available, rather than an instant .value jump', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      const lpfNode = secondLastInstance(Tone.Filter);

      globalFx.setGlobalFilterLPF({ frequency: 4000 });

      expect(lpfNode.frequency.rampTo).toHaveBeenCalledWith(4000, expect.any(Number));
    });

    it('ramps the live HPF frequency via rampTo too — same node type, same click risk', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      const hpfNode = lastInstance(Tone.Filter);

      globalFx.setGlobalFilterHPF({ frequency: 800 });

      expect(hpfNode.frequency.rampTo).toHaveBeenCalledWith(800, expect.any(Number));
    });

    it('falls back to a direct .value assignment when rampTo is unavailable (headless/older Tone)', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      const lpfNode = secondLastInstance(Tone.Filter);
      delete lpfNode.frequency.rampTo;

      globalFx.setGlobalFilterLPF({ frequency: 5000 });

      expect(lpfNode.frequency.value).toBe(5000);
    });

    it('does not ramp Q — only frequency was confirmed audible, Q stays a direct .value write', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      const lpfNode = secondLastInstance(Tone.Filter);

      globalFx.setGlobalFilterLPF({ Q: 8 });

      expect(lpfNode.Q.value).toBe(8);
    });
  });

  // Robot Sends T2 (assumption 3): the global Reverb / Delay `wet` sliders drive the RETURN gain, never
  // Effect.wet - the rooms stay fully wet so a robot's send is the only thing that sets how much enters.
  describe.each([
    { name: 'setGlobalReverb', ctor: () => Tone.Reverb, set: 'setGlobalReverb' as const },
    { name: 'setGlobalDelay', ctor: () => Tone.FeedbackDelay, set: 'setGlobalDelay' as const },
  ])('$name - wet drives the return gain', ({ ctor, set }) => {
    const build = async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      const room = lastInstance(ctor());
      return { globalFx, room, ret: returnOf(room), wetBefore: room.wet.value as number };
    };

    it('writes wet to the return gain and does not touch the room wet', async () => {
      const { globalFx, room, ret, wetBefore } = await build();
      globalFx[set]({ wet: 0.4 });
      expect(ret.gain.value).toBe(0.4);
      expect(room.wet.value).toBe(wetBefore);
    });

    it('lets wet reach exactly 0 and exactly 1 (0 is a real value, not skipped)', async () => {
      const { globalFx, ret } = await build();
      globalFx[set]({ wet: 0 });
      expect(ret.gain.value).toBe(0);
      globalFx[set]({ wet: 1 });
      expect(ret.gain.value).toBe(1);
    });

    it('leaves the return gain alone when wet is not in the update', async () => {
      const { globalFx, ret } = await build();
      globalFx[set]({ wet: 0.6 });
      globalFx[set]({ feedback: 0.3 } as never);
      expect(ret.gain.value).toBe(0.6);
    });

    it('moves only its own return, never the other return', async () => {
      const { globalFx, ret } = await build();
      const otherCtor = ctor() === Tone.Reverb ? Tone.FeedbackDelay : Tone.Reverb;
      const otherRet = returnOf(lastInstance(otherCtor));
      globalFx[set]({ wet: 0.2 });
      expect(ret.gain.value).toBe(0.2);
      expect(otherRet.gain.value).toBe(1);
    });

    it('does not throw before buildGlobalFxChain() has run', async () => {
      const globalFx = await import('./globalFx');
      expect(() => globalFx[set]({ wet: 0.5 })).not.toThrow();
    });
  });

  describe('setGlobalDelay - the other fields still go to the room', () => {
    it('writes delayTime and feedback to the FeedbackDelay itself', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      const delayNode = lastInstance(Tone.FeedbackDelay);

      globalFx.setGlobalDelay({ delayTime: 0.5, feedback: 0.4 });

      expect(delayNode.delayTime.value).toBe(0.5);
      expect(delayNode.feedback.value).toBe(0.4);
    });
  });

  describe('setGlobalReverb', () => {
    it('never touches a `dampening` property on the live node — Tone.Reverb has no such property', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      const reverbNode = lastInstance(Tone.Reverb) ?? { wet: { value: 0.3 } };

      expect('dampening' in reverbNode).toBe(false);
      globalFx.setGlobalReverb({ wet: 0.6, decay: 2, preDelay: 0.05 });
      expect('dampening' in reverbNode).toBe(false);
    });

    // Tone.Reverb's `decay` and `preDelay` setters each call generate(): an OfflineContext render
    // of `decay + preDelay` seconds of stereo noise plus a convolver buffer swap. The Audio Rig
    // sliders fire on every change event during a drag, so without coalescing one drag queues
    // dozens of renders. `wet` is a plain AudioParam and stays immediate.
    describe('impulse-response fields are coalesced', () => {
      /** Replace a plain mock field with a setter spy so every assignment is counted. */
      function spyOnField(node: Record<string, unknown>, field: string) {
        let current = node[field];
        const setter = vi.fn((v: unknown) => { current = v; });
        Object.defineProperty(node, field, { configurable: true, get: () => current, set: setter });
        return setter;
      }

      beforeEach(() => {
        vi.useFakeTimers();
      });
      afterEach(() => {
        vi.useRealTimers();
      });

      it('writes decay/preDelay once with the last value after a burst of calls, and wet immediately', async () => {
        const globalFx = await import('./globalFx');
        globalFx.buildGlobalFxChain();
        const reverbNode = lastInstance(Tone.Reverb) as Record<string, unknown>;
        const decaySet = spyOnField(reverbNode, 'decay');
        const preDelaySet = spyOnField(reverbNode, 'preDelay');

        globalFx.setGlobalReverb({ wet: 0.5, decay: 2, preDelay: 0.1 });
        globalFx.setGlobalReverb({ decay: 3 });
        globalFx.setGlobalReverb({ decay: 4, preDelay: 0.2 });

        // wet is the return gain now (Robot Sends T2), and still immediate, never deferred.
        expect(returnOf(reverbNode).gain.value).toBe(0.5);
        expect(decaySet).not.toHaveBeenCalled();
        expect(preDelaySet).not.toHaveBeenCalled();

        vi.advanceTimersByTime(globalFx.REVERB_IR_COALESCE_MS);

        expect(decaySet).toHaveBeenCalledTimes(1);
        expect(decaySet).toHaveBeenCalledWith(4);
        expect(preDelaySet).toHaveBeenCalledTimes(1);
        expect(preDelaySet).toHaveBeenCalledWith(0.2);
      });

      it('skips the write entirely when the value already matches the node (no regeneration)', async () => {
        const globalFx = await import('./globalFx');
        globalFx.buildGlobalFxChain();
        const reverbNode = lastInstance(Tone.Reverb) as Record<string, unknown>;
        const decaySet = spyOnField(reverbNode, 'decay');
        const preDelaySet = spyOnField(reverbNode, 'preDelay');

        // Mock defaults are decay 1.5 / preDelay 0.02 — re-sending them must not regenerate.
        globalFx.setGlobalReverb({ decay: 1.5, preDelay: 0.02 });
        vi.advanceTimersByTime(globalFx.REVERB_IR_COALESCE_MS);

        expect(decaySet).not.toHaveBeenCalled();
        expect(preDelaySet).not.toHaveBeenCalled();
      });

      it('only writes the field that actually changed', async () => {
        const globalFx = await import('./globalFx');
        globalFx.buildGlobalFxChain();
        const reverbNode = lastInstance(Tone.Reverb) as Record<string, unknown>;
        const decaySet = spyOnField(reverbNode, 'decay');
        const preDelaySet = spyOnField(reverbNode, 'preDelay');

        globalFx.setGlobalReverb({ decay: 6, preDelay: 0.02 });
        vi.advanceTimersByTime(globalFx.REVERB_IR_COALESCE_MS);

        expect(decaySet).toHaveBeenCalledTimes(1);
        expect(preDelaySet).not.toHaveBeenCalled();
      });
    });
  });
});
