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
  // Global Modulation T4 (docs/specs/GLOBAL_MODULATION_COLOUR.md section 1.3): AutoWah is hoisted for the same two
  // reasons - one constructor with one call history, and a switch to hide it. Q, gain and wet are Signals; the
  // sweep range, sensitivity and follower smoothing are plain properties, as in Tone 15.
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
  getContext: vi.fn(() => ({ rawContext: { createAnalyser: () => createAnalyser() } })),
}));

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

describe('globalFx', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    toneFlags.crusherAbsent = false;
    toneFlags.wahAbsent = false;
  });

  describe('getGlobalChainEntry', () => {
    it('returns null before buildGlobalFxChain() has run', async () => {
      const globalFx = await import('./globalFx');
      expect(globalFx.getGlobalChainEntry()).toBeNull();
    });

    it('returns the EQ3 node after build — the entry point in both topologies', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      const eqNode = lastInstance(Tone.EQ3);
      expect(globalFx.getGlobalChainEntry()).toBe(eqNode);
    });
  });

  it('no longer exports getMasterCompressor — replaced by getGlobalChainEntry', async () => {
    const globalFx = await import('./globalFx');
    expect('getMasterCompressor' in globalFx).toBe(false);
  });

  it('no longer exports setGlobalChorus — Chorus removed entirely from the global chain', async () => {
    const globalFx = await import('./globalFx');
    expect('setGlobalChorus' in globalFx).toBe(false);
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
      expect(hpf.connect).toHaveBeenCalledWith(dist);
      expect(dist.connect).toHaveBeenCalledTimes(1);
      expect(dist.connect).toHaveBeenCalledWith(cheb);
      expect(cheb.connect).toHaveBeenCalledTimes(1);
      expect(cheb.connect).toHaveBeenCalledWith(crush);
      expect(crush.connect).toHaveBeenCalledTimes(1);
      // Global Modulation T4: the colour slot now hands on to the modulation slot, not the Compressor.
      expect(crush.connect).toHaveBeenCalledWith(wah);
    });

    it('keeps the same slot in Controlled Decay, with the returns joining after it at the Limiter', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      const dist = lastInstance(Tone.Distortion);
      const cheb = lastInstance(Tone.Chebyshev);
      const crush = lastInstance(toneFlags.crusherCtor);
      const limiter = lastInstance(Tone.Limiter);
      const reverbReturn = returnOf(lastInstance(Tone.Reverb));

      globalFx.wireGlobalFxChain(true);

      expect(lastInstance(Tone.Filter).connect).toHaveBeenLastCalledWith(dist);
      expect(dist.connect).toHaveBeenLastCalledWith(cheb);
      expect(cheb.connect).toHaveBeenLastCalledWith(crush);
      expect(crush.connect).toHaveBeenLastCalledWith(lastInstance(toneFlags.wahCtor));
      expect(reverbReturn.connect).toHaveBeenLastCalledWith(limiter);
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
      expect(lastInstance(Tone.Filter).connect).toHaveBeenCalledWith(dist);
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

    it('wires BitCrusher -> AutoWah -> Compressor in Natural Decay, and the AutoWah is not wired to anything else', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      const crush = lastInstance(toneFlags.crusherCtor);
      const wah = lastInstance(toneFlags.wahCtor);
      const comp = lastInstance(Tone.Compressor);

      expect(crush.connect).toHaveBeenCalledWith(wah);
      expect(wah.connect).toHaveBeenCalledTimes(1);
      expect(wah.connect).toHaveBeenCalledWith(comp);
    });

    it('keeps the same slot in Controlled Decay, with the returns joining after it at the Limiter', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      const wah = lastInstance(toneFlags.wahCtor);
      const comp = lastInstance(Tone.Compressor);
      const limiter = lastInstance(Tone.Limiter);
      const reverbReturn = returnOf(lastInstance(Tone.Reverb));

      globalFx.wireGlobalFxChain(true);

      expect(lastInstance(toneFlags.crusherCtor).connect).toHaveBeenLastCalledWith(wah);
      expect(wah.connect).toHaveBeenLastCalledWith(comp);
      expect(reverbReturn.connect).toHaveBeenLastCalledWith(limiter);
    });

    it('connects the AutoWah to no room or return, and no room or return to the AutoWah', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      const wah = lastInstance(toneFlags.wahCtor);
      const rooms = [lastInstance(Tone.Reverb), lastInstance(Tone.FeedbackDelay)];
      const returns = rooms.map(returnOf);

      for (const other of [...rooms, ...returns]) {
        expect(wah.connect).not.toHaveBeenCalledWith(other);
        expect(other.connect).not.toHaveBeenCalledWith(wah);
      }
    });

    it('wires BitCrusher -> Compressor and does not throw when the AutoWah constructor is absent', async () => {
      toneFlags.wahAbsent = true;
      const globalFx = await import('./globalFx');
      expect(() => globalFx.buildGlobalFxChain()).not.toThrow();

      expect(toneFlags.wahCtor).not.toHaveBeenCalled();
      expect(lastInstance(toneFlags.crusherCtor).connect).toHaveBeenCalledWith(lastInstance(Tone.Compressor));
      expect(() => globalFx.setGlobalAutoWah({ baseFrequency: 200, wet: 1 })).not.toThrow();
    });

    it('disconnects and reconnects the AutoWah exactly once per Decay Mode flip', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      const wah = lastInstance(toneFlags.wahCtor);
      wah.connect.mockClear();
      wah.disconnect.mockClear();

      globalFx.wireGlobalFxChain(true);
      expect(wah.disconnect).toHaveBeenCalledTimes(1);
      expect(wah.connect).toHaveBeenCalledTimes(1);
      globalFx.wireGlobalFxChain(false);
      expect(wah.disconnect).toHaveBeenCalledTimes(2);
      expect(wah.connect).toHaveBeenCalledTimes(2);
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

  describe('wireGlobalFxChain — Natural Decay (controlledDecay=false)', () => {
    it('wires the dry chain EQ3 -> LPF -> HPF -> Distortion -> Chebyshev -> BitCrusher -> AutoWah -> Compressor -> Limiter -> masterGain -> Destination', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain(); // builds + wires Natural Decay by default

      const eqNode = lastInstance(Tone.EQ3);
      const hpfNode = lastInstance(Tone.Filter);
      const lpfNode = secondLastInstance(Tone.Filter);
      const distNode = lastInstance(Tone.Distortion);
      const chebNode = lastInstance(Tone.Chebyshev);
      const crushNode = lastInstance(toneFlags.crusherCtor);
      const wahNode = lastInstance(toneFlags.wahCtor);
      const compNode = lastInstance(Tone.Compressor);
      const limiterNode = lastInstance(Tone.Limiter);
      const gainNode = lastInstance(Tone.Gain);

      expect(eqNode.connect).toHaveBeenCalledWith(lpfNode);
      expect(lpfNode.connect).toHaveBeenCalledWith(hpfNode);
      expect(hpfNode.connect).toHaveBeenCalledWith(distNode);
      expect(hpfNode.connect).not.toHaveBeenCalledWith(compNode);
      expect(distNode.connect).toHaveBeenCalledWith(chebNode);
      expect(chebNode.connect).toHaveBeenCalledWith(crushNode);
      expect(crushNode.connect).toHaveBeenCalledWith(wahNode);
      expect(crushNode.connect).not.toHaveBeenCalledWith(compNode);
      expect(wahNode.connect).toHaveBeenCalledWith(compNode);
      expect(compNode.connect).toHaveBeenCalledWith(limiterNode);
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
    it('keeps the same dry chain EQ3 -> LPF -> HPF -> Distortion -> Chebyshev -> BitCrusher -> AutoWah -> Compressor -> Limiter -> masterGain', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();

      const eqNode = lastInstance(Tone.EQ3);
      const hpfNode = lastInstance(Tone.Filter);
      const lpfNode = secondLastInstance(Tone.Filter);
      const distNode = lastInstance(Tone.Distortion);
      const chebNode = lastInstance(Tone.Chebyshev);
      const crushNode = lastInstance(toneFlags.crusherCtor);
      const wahNode = lastInstance(toneFlags.wahCtor);
      const compNode = lastInstance(Tone.Compressor);
      const limiterNode = lastInstance(Tone.Limiter);
      const gainNode = lastInstance(Tone.Gain);

      globalFx.wireGlobalFxChain(true);

      expect(eqNode.connect).toHaveBeenLastCalledWith(lpfNode);
      expect(lpfNode.connect).toHaveBeenLastCalledWith(hpfNode);
      expect(hpfNode.connect).toHaveBeenLastCalledWith(distNode);
      expect(distNode.connect).toHaveBeenLastCalledWith(chebNode);
      expect(chebNode.connect).toHaveBeenLastCalledWith(crushNode);
      expect(crushNode.connect).toHaveBeenLastCalledWith(wahNode);
      expect(wahNode.connect).toHaveBeenLastCalledWith(compNode);
      expect(compNode.connect).toHaveBeenLastCalledWith(limiterNode);
      expect(limiterNode.connect).toHaveBeenLastCalledWith(gainNode);
    });

    it('joins both returns at the Limiter input and none at the Compressor', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      const delayNode = lastInstance(Tone.FeedbackDelay);
      const reverbNode = lastInstance(Tone.Reverb);
      const compNode = lastInstance(Tone.Compressor);
      const limiterNode = lastInstance(Tone.Limiter);
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
        expect(ret.connect).toHaveBeenCalledWith(limiterNode);
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
      const modulationNodes = [lastInstance(toneFlags.wahCtor)];
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
      expect(reverbReturn.connect).toHaveBeenLastCalledWith(lastInstance(Tone.Limiter));

      globalFx.wireGlobalFxChain(false);

      // The dry chain is the same either way; only where the returns rejoin moves.
      expect(reverbReturn.connect).toHaveBeenLastCalledWith(compNode);
      expect(delayReturn.connect).toHaveBeenLastCalledWith(compNode);
      expect(lastInstance(toneFlags.wahCtor).connect).toHaveBeenLastCalledWith(compNode);
    });

    it('only ever calls disconnect() with no arguments, so a robot send into a room survives every flip', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      globalFx.wireGlobalFxChain(true);
      globalFx.wireGlobalFxChain(false);
      globalFx.wireGlobalFxChain(true);

      // disconnect() with no argument drops a node's OUTPUTS and nothing else. A room's INPUT (where a robot's
      // send gain is connected) therefore stays wired - the same reason the engine can flip Decay Mode mid-play.
      const nodes = [Tone.EQ3, Tone.Filter, Tone.Distortion, Tone.Chebyshev, toneFlags.crusherCtor, toneFlags.wahCtor, Tone.Reverb, Tone.FeedbackDelay, Tone.Compressor, Tone.Limiter, Tone.Gain];
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
