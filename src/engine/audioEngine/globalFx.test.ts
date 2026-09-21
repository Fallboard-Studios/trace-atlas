// ========================================
// IMPORTS
// ========================================
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

// Mock Tone.js — same node shapes as AudioEngine.test.ts's own mock, minus
// Chorus (removed entirely in V2) and plus Limiter (added in V2). Every node
// carries its own `connect`/`disconnect` spy so tests can assert exact
// connection sequences per topology.
vi.mock('tone', () => ({
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
  // Read-only output taps (docs/specs/AUDIO_OUTPUT_DIAGNOSTIC.md). Each instance has its own spies.
  Analyser: vi.fn((type: string, size: number) => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    dispose: vi.fn(),
    getValue: vi.fn(() => new Float32Array(size).fill(0.25)),
    type,
    size,
  })),
}));

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

describe('globalFx', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
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

  describe('wireGlobalFxChain — Natural Decay (controlledDecay=false)', () => {
    it('wires EQ3 -> LPF -> HPF -> Delay -> Reverb -> Compressor -> Limiter -> masterGain -> Destination', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain(); // builds + wires Natural Decay by default

      const eqNode = lastInstance(Tone.EQ3);
      const hpfNode = lastInstance(Tone.Filter);
      const lpfNode = secondLastInstance(Tone.Filter);
      const delayNode = lastInstance(Tone.FeedbackDelay);
      const reverbNode = lastInstance(Tone.Reverb);
      const compNode = lastInstance(Tone.Compressor);
      const limiterNode = lastInstance(Tone.Limiter);
      const gainNode = lastInstance(Tone.Gain);

      expect(eqNode.connect).toHaveBeenCalledWith(lpfNode);
      expect(lpfNode.connect).toHaveBeenCalledWith(hpfNode);
      expect(hpfNode.connect).toHaveBeenCalledWith(delayNode);
      expect(delayNode.connect).toHaveBeenCalledWith(reverbNode);
      expect(reverbNode.connect).toHaveBeenCalledWith(compNode);
      expect(compNode.connect).toHaveBeenCalledWith(limiterNode);
      expect(limiterNode.connect).toHaveBeenCalledWith(gainNode);
      expect(gainNode.toDestination).toHaveBeenCalled();
    });
  });

  describe('wireGlobalFxChain — Controlled Decay (controlledDecay=true)', () => {
    it('wires EQ3 -> LPF -> HPF -> Compressor -> Delay -> Reverb -> Limiter -> masterGain -> Destination', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();

      const eqNode = lastInstance(Tone.EQ3);
      const hpfNode = lastInstance(Tone.Filter);
      const lpfNode = secondLastInstance(Tone.Filter);
      const delayNode = lastInstance(Tone.FeedbackDelay);
      const reverbNode = lastInstance(Tone.Reverb);
      const compNode = lastInstance(Tone.Compressor);
      const limiterNode = lastInstance(Tone.Limiter);
      const gainNode = lastInstance(Tone.Gain);

      globalFx.wireGlobalFxChain(true);

      expect(eqNode.connect).toHaveBeenCalledWith(lpfNode);
      expect(lpfNode.connect).toHaveBeenCalledWith(hpfNode);
      expect(hpfNode.connect).toHaveBeenCalledWith(compNode);
      expect(compNode.connect).toHaveBeenCalledWith(delayNode);
      expect(delayNode.connect).toHaveBeenCalledWith(reverbNode);
      expect(reverbNode.connect).toHaveBeenCalledWith(limiterNode);
      expect(limiterNode.connect).toHaveBeenCalledWith(gainNode);
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

      globalFx.wireGlobalFxChain(true);

      for (const node of [eqNode, lpfNode, hpfNode, delayNode, reverbNode, compNode, limiterNode]) {
        expect(node.disconnect).toHaveBeenCalled();
      }
    });

    it('flipping back to false (Natural) after true (Controlled) re-establishes the Natural sequence', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      globalFx.wireGlobalFxChain(true);

      const hpfNode = lastInstance(Tone.Filter);
      const delayNode = lastInstance(Tone.FeedbackDelay);

      globalFx.wireGlobalFxChain(false);

      // Natural Decay: HPF's most recent connect goes to Delay directly (not
      // to Compressor, as it did while Controlled Decay was active).
      expect(hpfNode.connect).toHaveBeenLastCalledWith(delayNode);
    });
  });

  describe('output taps (docs/specs/AUDIO_OUTPUT_DIAGNOSTIC.md)', () => {
    type Spy = { connect: Mock; disconnect: Mock; dispose: Mock; getValue: Mock };
    const analysers = (): Spy[] => (Tone.Analyser as unknown as AnyMock).mock.results.map((r) => r.value as Spy);
    /** The analysers a node has been asked to feed. */
    const tapsFedBy = (node: { connect: Mock }): Spy[] =>
      node.connect.mock.calls.map((call) => call[0] as Spy).filter((target) => analysers().includes(target));

    it('constructs no Analyser while nothing has asked for the taps (the ?debug-off case)', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      globalFx.wireGlobalFxChain(true);
      globalFx.wireGlobalFxChain(false);
      expect(Tone.Analyser).not.toHaveBeenCalled();
    });

    it('attachOutputTaps() after the build constructs two waveform analysers of OUTPUT_TAP_SIZE', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      globalFx.attachOutputTaps();
      expect(Tone.Analyser).toHaveBeenCalledTimes(2);
      expect(Tone.Analyser).toHaveBeenNthCalledWith(1, 'waveform', globalFx.OUTPUT_TAP_SIZE);
      expect(Tone.Analyser).toHaveBeenNthCalledWith(2, 'waveform', globalFx.OUTPUT_TAP_SIZE);
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
      for (const tap of analysers()) {
        expect(tap.connect).not.toHaveBeenCalled();
        expect(tap).not.toHaveProperty('toDestination');
      }
    });

    it('is idempotent: asking twice still constructs only two analysers', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      globalFx.attachOutputTaps();
      globalFx.attachOutputTaps();
      expect(Tone.Analyser).toHaveBeenCalledTimes(2);
    });

    it('reads each tap as its own Float32Array: pre from the EQ3 tap, master from the masterGain tap', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      const eq = lastInstance(Tone.EQ3);
      const masterGain = lastInstance(Tone.Gain);
      globalFx.attachOutputTaps();
      const preBuffer = new Float32Array([0.1, 0.2]);
      const masterBuffer = new Float32Array([0.3, 0.4]);
      tapsFedBy(eq)[0].getValue.mockReturnValue(preBuffer);
      tapsFedBy(masterGain)[0].getValue.mockReturnValue(masterBuffer);

      const { pre, master } = globalFx.readOutputTaps();
      expect(pre).toBe(preBuffer);
      expect(master).toBe(masterBuffer);
    });

    it('reads null for both taps before anything is attached', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      expect(globalFx.readOutputTaps()).toEqual({ pre: null, master: null });
    });

    it('takes the first channel when the analyser answers per channel', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      const masterGain = lastInstance(Tone.Gain);
      globalFx.attachOutputTaps();
      const left = new Float32Array([0.5]);
      const right = new Float32Array([0.6]);
      tapsFedBy(masterGain)[0].getValue.mockReturnValue([left, right]);
      expect(globalFx.readOutputTaps().master).toBe(left);
    });

    it('reads null for a tap whose getValue throws, without throwing itself', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      const masterGain = lastInstance(Tone.Gain);
      globalFx.attachOutputTaps();
      tapsFedBy(masterGain)[0].getValue.mockImplementation(() => {
        throw new Error('analyser gone');
      });
      expect(() => globalFx.readOutputTaps()).not.toThrow();
      expect(globalFx.readOutputTaps().master).toBeNull();
    });

    it('does nothing, and does not throw, when the FX nodes have not been built yet', async () => {
      const globalFx = await import('./globalFx');
      expect(() => globalFx.attachOutputTaps()).not.toThrow();
      expect(Tone.Analyser).not.toHaveBeenCalled();
      expect(globalFx.readOutputTaps()).toEqual({ pre: null, master: null });
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

    it('detachOutputTaps() disconnects each tap from its source, disposes it, and reads null afterwards', async () => {
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
      expect(preTap.dispose).toHaveBeenCalledTimes(1);
      expect(masterTap.dispose).toHaveBeenCalledTimes(1);
      expect(globalFx.readOutputTaps()).toEqual({ pre: null, master: null });
    });

    it('detachOutputTaps() is safe with nothing attached, and safe to repeat', async () => {
      const globalFx = await import('./globalFx');
      expect(() => globalFx.detachOutputTaps()).not.toThrow();
      globalFx.buildGlobalFxChain();
      globalFx.attachOutputTaps();
      globalFx.detachOutputTaps();
      expect(() => globalFx.detachOutputTaps()).not.toThrow();
      for (const tap of analysers()) expect(tap.dispose).toHaveBeenCalledTimes(1);
    });

    it('a tap can be attached again after a detach, on fresh analysers', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      globalFx.attachOutputTaps();
      globalFx.detachOutputTaps();
      globalFx.attachOutputTaps();
      expect(Tone.Analyser).toHaveBeenCalledTimes(4);
    });

    describe('surviving a rewire (the re-attach hook at the end of wireGlobalFxChain)', () => {
      /** Was the last thing done between `source` and a tap a connect — i.e. after the source's last disconnect? */
      const tapStillConnected = (source: { connect: Mock; disconnect: Mock }): boolean => {
        const tapConnects = source.connect.mock.calls.map((call, i) =>
          analysers().includes(call[0] as Spy) ? source.connect.mock.invocationCallOrder[i] : -1,
        );
        const lastTapConnect = Math.max(-1, ...tapConnects);
        const lastDisconnect = Math.max(-1, ...source.disconnect.mock.invocationCallOrder);
        return lastTapConnect > lastDisconnect;
      };

      it('taps asked for before the chain exists are built and connected once the chain is built', async () => {
        const globalFx = await import('./globalFx');
        globalFx.attachOutputTaps();
        expect(Tone.Analyser).not.toHaveBeenCalled(); // nothing to listen to yet

        globalFx.buildGlobalFxChain();
        const eq = lastInstance(Tone.EQ3);
        const masterGain = lastInstance(Tone.Gain);

        expect(Tone.Analyser).toHaveBeenCalledTimes(2);
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

      it('reconnects the same two analysers rather than building new ones', async () => {
        const globalFx = await import('./globalFx');
        globalFx.buildGlobalFxChain();
        const eq = lastInstance(Tone.EQ3);
        globalFx.attachOutputTaps();
        const [preTap] = tapsFedBy(eq);

        globalFx.wireGlobalFxChain(true);
        globalFx.wireGlobalFxChain(false);

        expect(Tone.Analyser).toHaveBeenCalledTimes(2);
        expect(tapsFedBy(eq).every((tap) => tap === preTap)).toBe(true);
      });

      it('warns instead of throwing when a tap cannot be reconnected after a rewire', async () => {
        const globalFx = await import('./globalFx');
        globalFx.buildGlobalFxChain();
        const eq = lastInstance(Tone.EQ3);
        globalFx.attachOutputTaps();
        eq.connect.mockImplementation((target: unknown) => {
          if (analysers().includes(target as Spy)) throw new Error('refused');
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
          node.connect.mock.calls.slice(from).filter((call) => analysers().includes(call[0] as Spy));
        expect(tapConnects(eq, eqCallsBefore)).toHaveLength(0);
        expect(tapConnects(masterGain, masterCallsBefore)).toHaveLength(0);
        expect(Tone.Analyser).toHaveBeenCalledTimes(2);
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

  describe('setGlobalReverb', () => {
    it('never touches a `dampening` property on the live node — Tone.Reverb has no such property', async () => {
      const globalFx = await import('./globalFx');
      globalFx.buildGlobalFxChain();
      const reverbNode = lastInstance(Tone.Reverb) ?? { wet: { value: 0.3 } };

      expect('dampening' in reverbNode).toBe(false);
      globalFx.setGlobalReverb({ wet: 0.6, decay: 2, preDelay: 0.05 });
      expect('dampening' in reverbNode).toBe(false);
    });
  });
});
