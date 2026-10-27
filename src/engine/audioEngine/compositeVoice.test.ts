/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// One tick's length for the glide cases (docs/specs/SWELL_PHASE_PULSE_WIDTH_CUT.md §8.2). Undefined, as with no
// transport, everywhere else, so the point cases below keep exercising the headless path.
const tick = vi.hoisted(() => ({ seconds: undefined as number | undefined }));
vi.mock('../beatClock', () => ({ getTickSeconds: () => tick.seconds }));

// Mock Tone.js the same way AudioEngine.test.ts does, scoped to what compositeVoice.ts uses.
vi.mock('tone', () => ({
  now: vi.fn(() => 0),
  Time: vi.fn((duration: string) => ({
    toSeconds: () => {
      const map: Record<string, number> = { '8n': 0.5, '4n': 1.0, '2n': 2.0 };
      return map[duration] || 1.0;
    },
  })),
  Synth: vi.fn((config?: { oscillator?: { type?: string }; envelope?: Record<string, number> }) => ({
    connect: vi.fn().mockReturnThis(),
    disconnect: vi.fn(),
    dispose: vi.fn(),
    triggerAttackRelease: vi.fn(),
    triggerAttack: vi.fn(),
    triggerRelease: vi.fn(),
    set: vi.fn(),
    oscillator: { type: config?.oscillator?.type, detune: { value: 0 } },
    envelope: config?.envelope,
  })),
  Gain: vi.fn(() => ({
    connect: vi.fn().mockReturnThis(),
    disconnect: vi.fn(),
    dispose: vi.fn(),
    toDestination: vi.fn(),
    gain: { value: 1 },
  })),
}));

import * as Tone from 'tone';
import { createCompositeVoice, toToneEnvelope } from './compositeVoice';
import type { OscillatorLayer } from '@/types/layeredAudio';
import type { ADSREnvelope } from '@/types/Robot';

const SHARED_ADSR: ADSREnvelope = { attack: 0.2, decay: 0.3, sustain: 0.6, release: 1.5 };

function makeLayer(overrides: Partial<OscillatorLayer> = {}): OscillatorLayer {
  return { type: 'sine', gain: 1, detune: 0, phase: 0, ...overrides };
}

describe('createCompositeVoice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('applies the shared ADSR to a single layer synth at construction', () => {
    createCompositeVoice([makeLayer()], SHARED_ADSR);

    expect(Tone.Synth).toHaveBeenCalledTimes(1);
    const config = (Tone.Synth as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0] as {
      envelope: ADSREnvelope;
    };
    expect(config.envelope).toEqual(SHARED_ADSR);
  });

  it('applies the identical shared ADSR to every layer, not a per-layer value', () => {
    const layers = [
      makeLayer({ type: 'sine' }),
      makeLayer({ type: 'square' }),
      makeLayer({ type: 'sawtooth' }),
    ];

    createCompositeVoice(layers, SHARED_ADSR);

    expect(Tone.Synth).toHaveBeenCalledTimes(3);
    const calls = (Tone.Synth as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    calls.forEach((call) => {
      const config = call[0] as { envelope: ADSREnvelope };
      expect(config.envelope).toEqual(SHARED_ADSR);
    });
  });

  it('reflects a different shared ADSR on the next construction (not cached/stale)', () => {
    createCompositeVoice([makeLayer()], SHARED_ADSR);
    const otherAdsr: ADSREnvelope = { attack: 0.01, decay: 0.05, sustain: 0.9, release: 0.2 };
    createCompositeVoice([makeLayer()], otherAdsr);

    const calls = (Tone.Synth as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect((calls[0][0] as { envelope: ADSREnvelope }).envelope).toEqual(SHARED_ADSR);
    expect((calls[1][0] as { envelope: ADSREnvelope }).envelope).toEqual(otherAdsr);
  });

  it('a live setShared({ adsr }) applies the new envelope to the synth', () => {
    const voice = createCompositeVoice([makeLayer()], SHARED_ADSR);
    const synthInstance = (Tone.Synth as unknown as { mock: { results: { value: { set: ReturnType<typeof vi.fn> } }[] } })
      .mock.results[0].value;

    const newAdsr: ADSREnvelope = { attack: 0.5, decay: 0.5, sustain: 0.5, release: 0.5 };
    voice.setShared({ adsr: newAdsr });

    expect(synthInstance.set).toHaveBeenCalledWith({ envelope: newAdsr });
  });

  it('every layer builds a Tone.Synth — no NoiseSynth construction path remains', () => {
    createCompositeVoice([makeLayer({ type: 'square' }), makeLayer({ type: 'pulse' })], SHARED_ADSR);
    expect(Tone.Synth).toHaveBeenCalledTimes(2);
  });

  describe('detune/phase/pulseWidth application (docs/tasks/archive/AUDIO_ENGINE_CLEANUP.md Task 4) — characterizes today\'s behavior before extracting a shared helper, so the refactor has a real safety net', () => {
    describe('at construction', () => {
      it('applies detune directly onto oscillator.detune.value', () => {
        createCompositeVoice([makeLayer({ detune: 37 })], SHARED_ADSR);
        const synth = (Tone.Synth as unknown as { mock: { results: { value: { oscillator: { detune: { value: number } } } }[] } }).mock.results[0].value;
        expect(synth.oscillator.detune.value).toBe(37);
      });

      it('applies phase via synth.set() when it succeeds', () => {
        createCompositeVoice([makeLayer({ phase: 90 })], SHARED_ADSR);
        const synth = (Tone.Synth as unknown as { mock: { results: { value: { set: ReturnType<typeof vi.fn> } }[] } }).mock.results[0].value;
        expect(synth.set).toHaveBeenCalledWith({ oscillator: { phase: 90 } });
      });

      it('falls back to oscillator.phase.value when synth.set() throws and phase is Signal-shaped', () => {
        (Tone.Synth as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
          connect: vi.fn().mockReturnThis(), disconnect: vi.fn(), dispose: vi.fn(),
          triggerAttackRelease: vi.fn(), triggerAttack: vi.fn(), triggerRelease: vi.fn(),
          set: vi.fn(() => { throw new Error('set unsupported'); }),
          oscillator: { detune: { value: 0 }, phase: { value: 0 } },
        }));
        createCompositeVoice([makeLayer({ phase: 45 })], SHARED_ADSR);
        const synth = (Tone.Synth as unknown as { mock: { results: { value: { oscillator: { phase: { value: number } } } }[] } }).mock.results[0].value;
        expect(synth.oscillator.phase.value).toBe(45);
      });

      it('falls back to a raw oscillator.phase assignment when synth.set() throws and phase is a plain number', () => {
        (Tone.Synth as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
          connect: vi.fn().mockReturnThis(), disconnect: vi.fn(), dispose: vi.fn(),
          triggerAttackRelease: vi.fn(), triggerAttack: vi.fn(), triggerRelease: vi.fn(),
          set: vi.fn(() => { throw new Error('set unsupported'); }),
          oscillator: { detune: { value: 0 }, phase: 0 },
        }));
        createCompositeVoice([makeLayer({ phase: 45 })], SHARED_ADSR);
        const synth = (Tone.Synth as unknown as { mock: { results: { value: { oscillator: { phase: number } } }[] } }).mock.results[0].value;
        expect(synth.oscillator.phase).toBe(45);
      });

      it('applies pulseWidth via synth.set({ oscillator: { width } }) when it succeeds', () => {
        createCompositeVoice([makeLayer({ type: 'pulse', pulseWidth: 0.3 })], SHARED_ADSR);
        const synth = (Tone.Synth as unknown as { mock: { results: { value: { set: ReturnType<typeof vi.fn> } }[] } }).mock.results[0].value;
        expect(synth.set).toHaveBeenCalledWith({ oscillator: { width: 0.3 } });
      });
    });

    describe('via the live-update set({ layers }) path', () => {
      it('applies detune directly onto oscillator.detune.value', () => {
        const voice = createCompositeVoice([makeLayer()], SHARED_ADSR);
        const synth = (Tone.Synth as unknown as { mock: { results: { value: { oscillator: { detune: { value: number } } } }[] } }).mock.results[0].value;
        voice.set({ layers: [{ detune: 12 }] });
        expect(synth.oscillator.detune.value).toBe(12);
      });

      it('applies phase via synth.set() when it succeeds', () => {
        const voice = createCompositeVoice([makeLayer()], SHARED_ADSR);
        const synth = (Tone.Synth as unknown as { mock: { results: { value: { set: ReturnType<typeof vi.fn> } }[] } }).mock.results[0].value;
        voice.set({ layers: [{ phase: 180 }] });
        expect(synth.set).toHaveBeenCalledWith({ oscillator: { phase: 180 } });
      });

      it('falls back to oscillator.phase.value when synth.set() throws and phase is Signal-shaped', () => {
        const voice = createCompositeVoice([makeLayer()], SHARED_ADSR);
        const synth = (Tone.Synth as unknown as { mock: { results: { value: { set: ReturnType<typeof vi.fn>; oscillator: { phase: { value: number } } } }[] } }).mock.results[0].value;
        synth.oscillator.phase = { value: 0 };
        synth.set = vi.fn(() => { throw new Error('set unsupported'); });
        voice.set({ layers: [{ phase: 270 }] });
        expect(synth.oscillator.phase.value).toBe(270);
      });

      it('falls back to a raw width assignment when synth.set() throws and width is a plain number', () => {
        const voice = createCompositeVoice([makeLayer()], SHARED_ADSR);
        const synth = (Tone.Synth as unknown as { mock: { results: { value: { set: ReturnType<typeof vi.fn>; oscillator: { width?: number } } }[] } }).mock.results[0].value;
        synth.oscillator.width = 0;
        synth.set = vi.fn(() => { throw new Error('set unsupported'); });
        voice.set({ layers: [{ pulseWidth: 0.75 }] });
        expect(synth.oscillator.width).toBe(0.75);
      });
    });
  });
});

// ========================================
// ROBOT ARTICULATION (docs/specs/ROBOT_ARTICULATION.md §1.3 / §4, Task 2)
// ========================================

type SynthMock = { set: ReturnType<typeof vi.fn>; portamento?: number };
type SynthCtorMock = { mock: { calls: unknown[][]; results: { value: SynthMock }[] } };

/** The config object each Tone.Synth was constructed with, in layer order. */
function synthConfigs(): { portamento?: number; envelope: Record<string, unknown> }[] {
  return (Tone.Synth as unknown as SynthCtorMock).mock.calls.map(
    (c) => c[0] as { portamento?: number; envelope: Record<string, unknown> },
  );
}

function synthInstances(): SynthMock[] {
  return (Tone.Synth as unknown as SynthCtorMock).mock.results.map((r) => r.value);
}

describe('toToneEnvelope', () => {
  it('returns exactly the four timing keys when no curve is set', () => {
    const env = toToneEnvelope(SHARED_ADSR);
    expect(Object.keys(env).sort()).toEqual(['attack', 'decay', 'release', 'sustain']);
    expect(env).toEqual({ attack: 0.2, decay: 0.3, sustain: 0.6, release: 1.5 });
  });

  it('adds attackCurve only when present', () => {
    const env = toToneEnvelope({ ...SHARED_ADSR, attackCurve: 'bounce' });
    expect(Object.keys(env).sort()).toEqual(['attack', 'attackCurve', 'decay', 'release', 'sustain']);
    expect(env).toMatchObject({ attackCurve: 'bounce' });
  });

  it('adds releaseCurve only when present', () => {
    const env = toToneEnvelope({ ...SHARED_ADSR, releaseCurve: 'ripple' });
    expect(Object.keys(env).sort()).toEqual(['attack', 'decay', 'release', 'releaseCurve', 'sustain']);
    expect(env).toMatchObject({ releaseCurve: 'ripple' });
  });

  it('carries both curves when both are present', () => {
    const env = toToneEnvelope({ ...SHARED_ADSR, attackCurve: 'sine', releaseCurve: 'cosine' });
    expect(Object.keys(env)).toHaveLength(6);
    expect(env).toMatchObject({ attackCurve: 'sine', releaseCurve: 'cosine' });
  });

  it('keeps an explicit linear curve (present is present, even when it equals the Tone default)', () => {
    const env = toToneEnvelope({ ...SHARED_ADSR, attackCurve: 'linear' });
    expect(Object.keys(env)).toContain('attackCurve');
    expect(env).toMatchObject({ attackCurve: 'linear' });
  });

  it('drops a curve key whose value is explicitly undefined, so Tone never receives attackCurve: undefined', () => {
    const env = toToneEnvelope({ ...SHARED_ADSR, attackCurve: undefined, releaseCurve: undefined });
    expect(Object.keys(env).sort()).toEqual(['attack', 'decay', 'release', 'sustain']);
    expect('attackCurve' in env).toBe(false);
    expect('releaseCurve' in env).toBe(false);
  });

  it('returns a new object and leaves its input untouched', () => {
    const input: ADSREnvelope = { ...SHARED_ADSR, attackCurve: 'step' };
    const snapshot = { ...input };
    const env = toToneEnvelope(input);
    expect(env).not.toBe(input);
    expect(input).toEqual(snapshot);
  });

  it('preserves zero-valued timings (a zero attack is real, not absent)', () => {
    const env = toToneEnvelope({ attack: 0, decay: 0, sustain: 0, release: 0 });
    expect(env).toEqual({ attack: 0, decay: 0, sustain: 0, release: 0 });
  });
});

describe('createCompositeVoice: portamento at construction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes portamento to every layer synth', () => {
    createCompositeVoice([makeLayer(), makeLayer({ type: 'square' }), makeLayer({ type: 'sawtooth' })], SHARED_ADSR, 0.2);
    const configs = synthConfigs();
    expect(configs).toHaveLength(3);
    configs.forEach((c) => expect(c.portamento).toBe(0.2));
  });

  it('defaults to 0 (no glide, today) when omitted', () => {
    createCompositeVoice([makeLayer(), makeLayer()], SHARED_ADSR);
    synthConfigs().forEach((c) => expect(c.portamento).toBe(0));
  });

  it('passes an explicit 0 through as 0', () => {
    createCompositeVoice([makeLayer()], SHARED_ADSR, 0);
    expect(synthConfigs()[0].portamento).toBe(0);
  });

  it('reflects a different portamento on the next construction (not cached)', () => {
    createCompositeVoice([makeLayer()], SHARED_ADSR, 0.1);
    createCompositeVoice([makeLayer()], SHARED_ADSR, 0.3);
    const configs = synthConfigs();
    expect(configs[0].portamento).toBe(0.1);
    expect(configs[1].portamento).toBe(0.3);
  });

  it('builds the constructor envelope through toToneEnvelope: four keys, no undefined-valued curve key', () => {
    createCompositeVoice([makeLayer()], { ...SHARED_ADSR, attackCurve: undefined });
    const env = synthConfigs()[0].envelope;
    expect(Object.keys(env).sort()).toEqual(['attack', 'decay', 'release', 'sustain']);
  });

  it('passes a present curve through to the constructor envelope on every layer', () => {
    createCompositeVoice([makeLayer(), makeLayer()], { ...SHARED_ADSR, attackCurve: 'bounce', releaseCurve: 'step' });
    synthConfigs().forEach((c) =>
      expect(c.envelope).toEqual({ ...SHARED_ADSR, attackCurve: 'bounce', releaseCurve: 'step' }),
    );
  });
});

describe('createCompositeVoice: setShared portamento and curves', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('applies portamento to every layer', () => {
    const voice = createCompositeVoice([makeLayer(), makeLayer(), makeLayer()], SHARED_ADSR);
    voice.setShared({ portamento: 0.1 });
    synthInstances().forEach((s) => expect(s.portamento).toBe(0.1));
  });

  it('applies a portamento of 0 (glide off is a real value, not skipped as falsy)', () => {
    const voice = createCompositeVoice([makeLayer()], SHARED_ADSR, 0.4);
    const synth = synthInstances()[0];
    synth.portamento = 0.4;
    voice.setShared({ portamento: 0 });
    expect(synth.portamento).toBe(0);
  });

  it('a layer patch leaves portamento untouched', () => {
    const voice = createCompositeVoice([makeLayer()], SHARED_ADSR);
    const synth = synthInstances()[0];
    synth.portamento = 0.7;
    voice.set({ layers: [{ gain: 0.5 }] });
    expect(synth.portamento).toBe(0.7);
  });

  it('setShared on a voice with no layers does nothing and does not throw', () => {
    const voice = createCompositeVoice({}, SHARED_ADSR);
    expect(() => voice.setShared({ portamento: 0.2, adsr: { ...SHARED_ADSR, attack: 0.9 } })).not.toThrow();
  });

  it('applies portamento and adsr from the same call together', () => {
    const voice = createCompositeVoice([makeLayer()], SHARED_ADSR);
    const synth = synthInstances()[0];
    voice.setShared({ portamento: 0.25, adsr: { ...SHARED_ADSR, attack: 0.9 } });
    expect(synth.portamento).toBe(0.25);
    expect(synth.set).toHaveBeenCalledWith({ envelope: { ...SHARED_ADSR, attack: 0.9 } });
  });

  it('survives a throwing portamento assignment and still applies the envelope', () => {
    (Tone.Synth as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      const synth = {
        connect: vi.fn().mockReturnThis(), disconnect: vi.fn(), dispose: vi.fn(),
        triggerAttackRelease: vi.fn(), triggerAttack: vi.fn(), triggerRelease: vi.fn(),
        set: vi.fn(),
        oscillator: { detune: { value: 0 } },
      };
      Object.defineProperty(synth, 'portamento', { set() { throw new Error('portamento unsupported'); } });
      return synth;
    });
    const voice = createCompositeVoice([makeLayer()], SHARED_ADSR);
    const synth = synthInstances()[0];
    const adsr = { ...SHARED_ADSR, sustain: 0.4 }; // differs from the build, so it is written
    expect(() => voice.setShared({ portamento: 0.2, adsr })).not.toThrow();
    expect(synth.set).toHaveBeenCalledWith({ envelope: adsr });
    expect(voice.layerAt(0)!.written.portamento).toBe(0); // the throw is not recorded
  });

  it('sends the live adsr patch through toToneEnvelope: four keys, no undefined-valued curve key', () => {
    const voice = createCompositeVoice([makeLayer()], SHARED_ADSR);
    const synth = synthInstances()[0];
    // attack differs from the build, so the envelope is written
    voice.setShared({ adsr: { ...SHARED_ADSR, attack: 0.05, attackCurve: undefined, releaseCurve: undefined } });
    const call = synth.set.mock.calls.find((c) => (c[0] as { envelope?: unknown }).envelope);
    const sent = call![0] as { envelope: Record<string, unknown> };
    expect(Object.keys(sent.envelope).sort()).toEqual(['attack', 'decay', 'release', 'sustain']);
  });

  it('sends a present curve in the live adsr patch', () => {
    const voice = createCompositeVoice([makeLayer()], SHARED_ADSR);
    const synth = synthInstances()[0];
    voice.setShared({ adsr: { ...SHARED_ADSR, attackCurve: 'bounce' } });
    expect(synth.set).toHaveBeenCalledWith({ envelope: { ...SHARED_ADSR, attackCurve: 'bounce' } });
  });
});

// ========================================
// BEATCLOCK TRANSPORT TIME (docs/specs/BEATCLOCK_TRANSPORT_TIME.md §3, §5.1 item 3, Task 2)
// ========================================

type TimedParam = { value: number; setValueAtTime?: ReturnType<typeof vi.fn> };

/** One-layer voice whose layer gain and oscillator detune carry a `setValueAtTime` spy, as a live Tone Param / Signal does. */
function timedVoice() {
  const voice = createCompositeVoice([makeLayer()], SHARED_ADSR);
  const gain = voice.layers![0].gainNode!.gain as unknown as TimedParam;
  gain.setValueAtTime = vi.fn();
  const detune = (synthInstances()[0] as unknown as { oscillator: { detune: TimedParam } }).oscillator.detune;
  detune.setValueAtTime = vi.fn();
  return { voice, gain, detune, synth: synthInstances()[0] };
}

describe('createCompositeVoice: set(params, time) places live Param writes at the Transport time', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('a layer gain with a time is a timed point, and .value is not assigned', () => {
    const { voice, gain } = timedVoice();
    gain.value = 1;
    voice.set({ layers: [{ gain: 0.4 }] }, 12.5);
    expect(gain.setValueAtTime).toHaveBeenCalledTimes(1);
    expect(gain.setValueAtTime).toHaveBeenCalledWith(0.4, 12.5);
    expect(gain.value).toBe(1);
  });

  it('a layer gain without a time is assigned, and no point is placed', () => {
    const { voice, gain } = timedVoice();
    voice.set({ layers: [{ gain: 0.4 }] });
    expect(gain.value).toBe(0.4);
    expect(gain.setValueAtTime).not.toHaveBeenCalled();
  });

  it('a detune with a time is a timed point on oscillator.detune', () => {
    const { voice, detune } = timedVoice();
    voice.set({ layers: [{ detune: 7 }] }, 12.5);
    expect(detune.setValueAtTime).toHaveBeenCalledWith(7, 12.5);
    expect(detune.value).toBe(0);
  });

  it('a detune without a time is assigned, and no point is placed', () => {
    const { voice, detune } = timedVoice();
    voice.set({ layers: [{ detune: 7 }] });
    expect(detune.value).toBe(7);
    expect(detune.setValueAtTime).not.toHaveBeenCalled();
  });

  it('a time of 0 is a time, not a missing one', () => {
    const { voice, gain, detune } = timedVoice();
    voice.set({ layers: [{ gain: 0.3, detune: 5 }] }, 0);
    expect(gain.setValueAtTime).toHaveBeenCalledWith(0.3, 0);
    expect(detune.setValueAtTime).toHaveBeenCalledWith(5, 0);
  });

  it('places each layer its own point at the one time', () => {
    const voice = createCompositeVoice([makeLayer(), makeLayer()], SHARED_ADSR);
    const gains = voice.layers!.map((l) => {
      const g = l.gainNode!.gain as unknown as TimedParam;
      g.setValueAtTime = vi.fn();
      return g;
    });
    voice.set({ layers: [{ gain: 0.2 }, { gain: 0.6 }] }, 3.5);
    expect(gains[0].setValueAtTime).toHaveBeenCalledWith(0.2, 3.5);
    expect(gains[1].setValueAtTime).toHaveBeenCalledWith(0.6, 3.5);
  });

  it('phase, pulseWidth, portamento and adsr are settings: the same calls with a time as without', () => {
    const { voice, synth } = timedVoice();
    synth.set.mockClear(); // construction already applied the layer's phase through synth.set
    const adsr = { ...SHARED_ADSR, release: 0.8 }; // differs from the build, so it is written
    voice.set({ layers: [{ phase: 180, pulseWidth: 0.3 }] }, 12.5);
    voice.setShared({ portamento: 0.2, adsr }, 12.5);
    expect(synth.set.mock.calls).toEqual([
      [{ oscillator: { phase: 180 } }],
      [{ oscillator: { width: 0.3 } }],
      [{ envelope: adsr }],
    ]);
    expect(synth.portamento).toBe(0.2);
  });

  it('a gain and a detune stub without setValueAtTime, given a time, fall back to .value (headless parity)', () => {
    const voice = createCompositeVoice([makeLayer()], SHARED_ADSR);
    const gain = voice.layers![0].gainNode!.gain as unknown as TimedParam;
    const detune = (synthInstances()[0] as unknown as { oscillator: { detune: TimedParam } }).oscillator.detune;
    expect(() => voice.set({ layers: [{ gain: 0.4, detune: 9 }] }, 12.5)).not.toThrow();
    expect(gain.value).toBe(0.4);
    expect(detune.value).toBe(9);
  });
});

// docs/specs/SWELL_PHASE_PULSE_WIDTH_CUT.md §8.4 test 2: on a live Param / Signal (it has rampTo), a timed layer gain
// or detune glides one tick into the next instead of stepping; an untimed one is assigned as before.
describe('createCompositeVoice: set(params, time) glides one tick on params that can ramp', () => {
  type GlideParam = TimedParam & { rampTo: ReturnType<typeof vi.fn> };

  function glidingVoice(layerCount = 1) {
    const voice = createCompositeVoice(Array.from({ length: layerCount }, () => makeLayer()), SHARED_ADSR);
    const withRamp = (param: TimedParam) => Object.assign(param, { rampTo: vi.fn(), setValueAtTime: vi.fn() }) as GlideParam;
    const gains = voice.layers!.map((l) => withRamp(l.gainNode!.gain as unknown as TimedParam));
    const detunes = synthInstances().map((s) => withRamp((s as unknown as { oscillator: { detune: TimedParam } }).oscillator.detune));
    return { voice, gains, detunes };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    tick.seconds = 0.137;
  });

  afterEach(() => {
    tick.seconds = undefined;
  });

  it('a timed gain and detune each glide one tick from the time, with no point and no assignment', () => {
    const { voice, gains: [gain], detunes: [detune] } = glidingVoice();
    gain.value = 1;
    voice.set({ layers: [{ gain: 0.4, detune: 7 }] }, 12.5);
    expect(gain.rampTo.mock.calls).toEqual([[0.4, 0.137, 12.5]]);
    expect(detune.rampTo.mock.calls).toEqual([[7, 0.137, 12.5]]);
    expect(gain.setValueAtTime).not.toHaveBeenCalled();
    expect(detune.setValueAtTime).not.toHaveBeenCalled();
    expect([gain.value, detune.value]).toEqual([1, 0]);
  });

  it('an untimed gain and detune are assigned and never ramp', () => {
    const { voice, gains: [gain], detunes: [detune] } = glidingVoice();
    voice.set({ layers: [{ gain: 0.4, detune: 7 }] });
    expect([gain.value, detune.value]).toEqual([0.4, 7]);
    expect(gain.rampTo).not.toHaveBeenCalled();
    expect(detune.rampTo).not.toHaveBeenCalled();
  });

  it('each layer glides to its own value at the one time', () => {
    const { voice, gains } = glidingVoice(2);
    voice.set({ layers: [{ gain: 0.2 }, { gain: 0.6 }] }, 3.5);
    expect(gains.map((g) => g.rampTo.mock.calls)).toEqual([[[0.2, 0.137, 3.5]], [[0.6, 0.137, 3.5]]]);
  });

  it('a time of 0 glides from 0', () => {
    const { voice, gains: [gain], detunes: [detune] } = glidingVoice();
    voice.set({ layers: [{ gain: 0.3, detune: 5 }] }, 0);
    expect(gain.rampTo).toHaveBeenCalledWith(0.3, 0.137, 0);
    expect(detune.rampTo).toHaveBeenCalledWith(5, 0.137, 0);
  });
});

// ========================================
// COMPOSITE LAYER WRITES (docs/specs/COMPOSITE_LAYER_WRITES.md §1.2, §5.1)
// ========================================

type DetuneMock = { oscillator: { detune: { value: number } } };

describe('createCompositeVoice: records carry the robot layer index, and set routes by it', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /** A voice built from robot layers 0 and 2 (layer 1 muted at build), every gain starting at 1. */
  function voiceWithoutLayer1() {
    const voice = createCompositeVoice([makeLayer(), makeLayer({ type: 'square' })], SHARED_ADSR, 0, [0, 2]);
    const gains = voice.layers!.map((l) => l.gainNode!.gain as unknown as { value: number });
    const detunes = synthInstances().map((s) => (s as unknown as DetuneMock).oscillator.detune);
    return { voice, gains, detunes };
  }

  it('routes patch i to the layer built from robot layer i, and nothing gets the patch for the unbuilt one', () => {
    const { voice, gains } = voiceWithoutLayer1();
    voice.set({ layers: [{ gain: 0.1 }, { gain: 0.2 }, { gain: 0.3 }] });
    expect(gains.map((g) => g.value)).toEqual([0.1, 0.3]);
  });

  it('routes detune by index too', () => {
    const { voice, detunes } = voiceWithoutLayer1();
    voice.set({ layers: [{}, { detune: 11 }, { detune: 22 }] });
    expect(detunes.map((d) => d.value)).toEqual([0, 22]);
  });

  it('layerAt finds a record by robot index, and the records carry it', () => {
    const { voice } = voiceWithoutLayer1();
    expect(voice.layers!.map((l) => l.index)).toEqual([0, 2]);
    expect(voice.layerAt(0)).toBe(voice.layers![0]);
    expect(voice.layerAt(1)).toBeUndefined();
    expect(voice.layerAt(2)).toBe(voice.layers![1]);
    expect(voice.layerAt(3)).toBeUndefined();
  });

  it('a sparse patch array routes the same as one with undefined holes', () => {
    const sparse = voiceWithoutLayer1();
    const patch: { gain?: number }[] = [];
    patch[2] = { gain: 0.3 };
    sparse.voice.set({ layers: patch });

    const holes = voiceWithoutLayer1();
    holes.voice.set({ layers: [undefined as unknown as { gain?: number }, undefined as unknown as { gain?: number }, { gain: 0.3 }] });

    expect(sparse.gains.map((g) => g.value)).toEqual([1, 0.3]);
    expect(holes.gains.map((g) => g.value)).toEqual([1, 0.3]);
  });

  it('drops a patch past the last robot index without throwing', () => {
    const { voice, gains } = voiceWithoutLayer1();
    expect(() => voice.set({ layers: [{}, {}, {}, { gain: 0.4 }] })).not.toThrow();
    expect(gains.map((g) => g.value)).toEqual([1, 1]);
  });

  it('without indices, the robot index is the position', () => {
    const voice = createCompositeVoice([makeLayer(), makeLayer(), makeLayer()], SHARED_ADSR);
    expect(voice.layers!.map((l) => l.index)).toEqual([0, 1, 2]);
    expect(voice.layerAt(1)).toBe(voice.layers![1]);
  });

  it('the { base } descriptor builds robot layer 0', () => {
    const voice = createCompositeVoice({ base: 'square' }, SHARED_ADSR);
    expect(voice.layers!.map((l) => l.index)).toEqual([0]);
    expect(voice.layerAt(0)!.written).toEqual({ gain: 1, detune: 0, phase: 0, adsr: SHARED_ADSR, portamento: 0 });
  });
});

describe('createCompositeVoice: written is seeded from what construction wrote', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('records the layer fields, a copy of the shared ADSR and the portamento', () => {
    const adsr: ADSREnvelope = { ...SHARED_ADSR, attackCurve: 'bounce' };
    const voice = createCompositeVoice(
      [makeLayer({ type: 'pulse', gain: 0.8, detune: -5, phase: 90, pulseWidth: 0.3 })],
      adsr,
      0.2,
    );
    const written = voice.layerAt(0)!.written;
    expect(written).toEqual({ gain: 0.8, detune: -5, phase: 90, pulseWidth: 0.3, adsr, portamento: 0.2 });
    expect(written.adsr).not.toBe(adsr);
  });

  it('a layer without a pulse width records none', () => {
    const voice = createCompositeVoice([makeLayer()], SHARED_ADSR);
    expect('pulseWidth' in voice.layerAt(0)!.written).toBe(false);
  });

  it('each layer records its own values', () => {
    const voice = createCompositeVoice([makeLayer({ gain: 0.2, detune: 3 }), makeLayer({ gain: 0.7, phase: 45 })], SHARED_ADSR, 0, [0, 2]);
    expect(voice.layerAt(0)!.written).toMatchObject({ gain: 0.2, detune: 3, phase: 0 });
    expect(voice.layerAt(2)!.written).toMatchObject({ gain: 0.7, detune: 0, phase: 45 });
  });
});

/** Count assignments to `obj[key]` from here on, keeping the value readable. */
function countWrites<T extends object>(obj: T, key: string): { count: () => number } {
  let current = (obj as Record<string, unknown>)[key];
  let n = 0;
  Object.defineProperty(obj, key, {
    configurable: true,
    get: () => current,
    set: (v: unknown) => { n++; current = v; },
  });
  return { count: () => n };
}

describe('createCompositeVoice: a write equal to its record is skipped', () => {
  type RampParam = { value: number; rampTo?: ReturnType<typeof vi.fn>; setValueAtTime?: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  /** One layer built as [type gain detune phase (width)], with write counters on gain, detune and portamento. */
  function watchedVoice(layer: Partial<OscillatorLayer> = {}, portamento = 0, adsr: ADSREnvelope = SHARED_ADSR) {
    const voice = createCompositeVoice([makeLayer({ gain: 0.8, detune: 0, phase: 90, ...layer })], adsr, portamento);
    const synth = synthInstances()[0];
    const gain = voice.layers![0].gainNode!.gain as unknown as RampParam;
    const detune = (synth as unknown as { oscillator: { detune: RampParam } }).oscillator.detune;
    synth.portamento = portamento;
    const writes = { gain: countWrites(gain, 'value'), detune: countWrites(detune, 'value'), portamento: countWrites(synth, 'portamento') };
    synth.set.mockClear();
    return { voice, synth, gain, detune, writes };
  }

  it('equal gain, detune and phase write nothing', () => {
    const { voice, synth, writes } = watchedVoice();
    voice.set({ layers: [{ gain: 0.8, detune: 0, phase: 90 }] });
    expect(writes.gain.count()).toBe(0);
    expect(writes.detune.count()).toBe(0);
    expect(synth.set).not.toHaveBeenCalled();
  });

  it('a changed gain writes once and nothing else', () => {
    const { voice, synth, gain, writes } = watchedVoice();
    voice.set({ layers: [{ gain: 0.5, detune: 0, phase: 90 }] });
    expect(writes.gain.count()).toBe(1);
    expect(gain.value).toBe(0.5);
    expect(writes.detune.count()).toBe(0);
    expect(synth.set).not.toHaveBeenCalled();
  });

  it('a changed detune writes once and nothing else', () => {
    const { voice, synth, detune, writes } = watchedVoice();
    voice.set({ layers: [{ gain: 0.8, detune: -7, phase: 90 }] });
    expect(writes.detune.count()).toBe(1);
    expect(detune.value).toBe(-7);
    expect(writes.gain.count()).toBe(0);
    expect(synth.set).not.toHaveBeenCalled();
  });

  it('a changed phase writes once and nothing else', () => {
    const { voice, synth, writes } = watchedVoice();
    voice.set({ layers: [{ gain: 0.8, detune: 0, phase: 180 }] });
    expect(synth.set.mock.calls).toEqual([[{ oscillator: { phase: 180 } }]]);
    expect(writes.gain.count() + writes.detune.count()).toBe(0);
  });

  it('pulse width: equal writes nothing, changed writes once', () => {
    const { voice, synth } = watchedVoice({ type: 'pulse', pulseWidth: 0.3 });
    voice.set({ layers: [{ pulseWidth: 0.3 }] });
    expect(synth.set).not.toHaveBeenCalled();
    voice.set({ layers: [{ pulseWidth: 0.4 }] });
    expect(synth.set.mock.calls).toEqual([[{ oscillator: { width: 0.4 } }]]);
  });

  it('a pulse width on a layer built without one is written', () => {
    const { voice, synth } = watchedVoice();
    voice.set({ layers: [{ pulseWidth: 0.5 }] });
    expect(synth.set.mock.calls).toEqual([[{ oscillator: { width: 0.5 } }]]);
  });

  it('portamento: equal writes nothing, changed writes once', () => {
    const { voice, synth, writes } = watchedVoice({}, 0.2);
    voice.setShared({ portamento: 0.2 });
    expect(writes.portamento.count()).toBe(0);
    voice.setShared({ portamento: 0.35 });
    expect(writes.portamento.count()).toBe(1);
    expect(synth.portamento).toBe(0.35);
  });

  it('the ADSR: an identical object with a different reference writes nothing', () => {
    const { voice, synth } = watchedVoice();
    voice.setShared({ adsr: { ...SHARED_ADSR } });
    expect(synth.set).not.toHaveBeenCalled();
  });

  it('the ADSR: a one-field change writes the whole envelope once', () => {
    const { voice, synth } = watchedVoice();
    voice.setShared({ adsr: { ...SHARED_ADSR, release: 2.5 } });
    expect(synth.set.mock.calls).toEqual([[{ envelope: { ...SHARED_ADSR, release: 2.5 } }]]);
  });

  it('the ADSR: a curve added or removed is a change', () => {
    const { voice, synth } = watchedVoice({}, 0, { ...SHARED_ADSR, releaseCurve: 'ripple' });
    voice.setShared({ adsr: { ...SHARED_ADSR, releaseCurve: 'ripple' } });
    expect(synth.set).not.toHaveBeenCalled();
    voice.setShared({ adsr: SHARED_ADSR });
    voice.setShared({ adsr: { ...SHARED_ADSR, attackCurve: 'sine' } });
    expect(synth.set.mock.calls).toEqual([[{ envelope: SHARED_ADSR }], [{ envelope: { ...SHARED_ADSR, attackCurve: 'sine' } }]]);
  });

  it('the ADSR: an explicitly undefined curve equals an absent one', () => {
    const { voice, synth } = watchedVoice();
    voice.setShared({ adsr: { ...SHARED_ADSR, attackCurve: undefined, releaseCurve: undefined } });
    expect(synth.set).not.toHaveBeenCalled();
  });

  it('timed: an equal gain or detune places no glide, a changed one places one', () => {
    tick.seconds = 0.137;
    try {
      const { voice, gain, detune } = watchedVoice();
      gain.rampTo = vi.fn();
      detune.rampTo = vi.fn();
      voice.set({ layers: [{ gain: 0.8, detune: 0 }] }, 4);
      expect(gain.rampTo).not.toHaveBeenCalled();
      expect(detune.rampTo).not.toHaveBeenCalled();
      voice.set({ layers: [{ gain: 0.6, detune: 3 }] }, 4.5);
      expect(gain.rampTo.mock.calls).toEqual([[0.6, 0.137, 4.5]]);
      expect(detune.rampTo.mock.calls).toEqual([[3, 0.137, 4.5]]);
    } finally {
      tick.seconds = undefined;
    }
  });

  it('records follow writes: the same new gain twice writes once', () => {
    const { voice, writes } = watchedVoice();
    voice.set({ layers: [{ gain: 0.5 }] });
    voice.set({ layers: [{ gain: 0.5 }] });
    expect(writes.gain.count()).toBe(1);
    expect(voice.layerAt(0)!.written.gain).toBe(0.5);
  });

  it('records follow writes: every field, including a copy of the ADSR', () => {
    const { voice, synth, writes } = watchedVoice();
    const adsr = { ...SHARED_ADSR, decay: 0.9 };
    const patch = { gain: 0.4, detune: 6, phase: 45, pulseWidth: 0.2 };
    voice.set({ layers: [patch] });
    voice.setShared({ portamento: 0.1, adsr });
    voice.set({ layers: [{ ...patch }] });
    voice.setShared({ portamento: 0.1, adsr: { ...adsr } });
    expect(synth.set).toHaveBeenCalledTimes(3); // phase, width, envelope: once each
    expect(writes.gain.count() + writes.detune.count() + writes.portamento.count()).toBe(3);
    expect(voice.layerAt(0)!.written).toEqual({ ...patch, portamento: 0.1, adsr });
    expect(voice.layerAt(0)!.written.adsr).not.toBe(adsr);
  });

  it('construction writes the phase once, and a following set with the same phase does not repeat it', () => {
    const voice = createCompositeVoice([makeLayer({ phase: 90 })], SHARED_ADSR);
    const synth = synthInstances()[0];
    voice.set({ layers: [{ phase: 90 }] });
    expect(synth.set.mock.calls).toEqual([[{ oscillator: { phase: 90 } }]]);
  });

  it('a gain write that throws is not recorded, so the next equal write tries again', () => {
    const { voice, gain } = watchedVoice();
    let throwOnce = true;
    let current = 0.8;
    let landed = 0;
    Object.defineProperty(gain, 'value', {
      configurable: true,
      get: () => current,
      set: (v: number) => {
        if (throwOnce) { throwOnce = false; throw new Error('gain unavailable'); }
        landed++;
        current = v;
      },
    });
    voice.set({ layers: [{ gain: 0.5 }] });
    expect(voice.layerAt(0)!.written.gain).toBe(0.8);
    voice.set({ layers: [{ gain: 0.5 }] });
    expect(landed).toBe(1);
    expect(voice.layerAt(0)!.written.gain).toBe(0.5);
  });
});

describe('createCompositeVoice: setShared applies the two robot-level fields to every built layer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function twoLayerVoice(indices?: number[]) {
    const voice = createCompositeVoice([makeLayer({ gain: 0.8 }), makeLayer({ type: 'pulse', pulseWidth: 0.3 })], SHARED_ADSR, 0, indices);
    const synths = synthInstances();
    synths.forEach((s) => { s.portamento = 0; s.set.mockClear(); });
    return { voice, synths };
  }

  it('an ADSR writes { envelope } once per layer; the same again writes nothing; a one-field change once more per layer', () => {
    const { voice, synths } = twoLayerVoice();
    const adsr = { ...SHARED_ADSR, attack: 0.7 };
    voice.setShared({ adsr });
    expect(synths.map((s) => s.set.mock.calls)).toEqual([[[{ envelope: adsr }]], [[{ envelope: adsr }]]]);
    voice.setShared({ adsr: { ...adsr } });
    expect(synths.map((s) => s.set.mock.calls.length)).toEqual([1, 1]);
    voice.setShared({ adsr: { ...adsr, release: 3 } });
    expect(synths.map((s) => s.set.mock.calls.length)).toEqual([2, 2]);
    expect(synths.map((s) => s.set.mock.calls[1][0])).toEqual([{ envelope: { ...adsr, release: 3 } }, { envelope: { ...adsr, release: 3 } }]);
  });

  it('a portamento is set on every layer, and not again', () => {
    const { voice, synths } = twoLayerVoice();
    const writes = synths.map((s) => countWrites(s, 'portamento'));
    voice.setShared({ portamento: 0.3 });
    voice.setShared({ portamento: 0.3 });
    expect(synths.map((s) => s.portamento)).toEqual([0.3, 0.3]);
    expect(writes.map((w) => w.count())).toEqual([1, 1]);
  });

  it('writes no layer field: no gain, detune, phase or width', () => {
    const { voice, synths } = twoLayerVoice();
    const gains = voice.layers!.map((l) => countWrites(l.gainNode!.gain as object, 'value'));
    const detunes = synths.map((s) => countWrites((s as unknown as DetuneMock).oscillator.detune, 'value'));
    voice.setShared({ adsr: { ...SHARED_ADSR, sustain: 0.1 }, portamento: 0.4 });
    expect([...gains, ...detunes].map((w) => w.count())).toEqual([0, 0, 0, 0]);
    synths.forEach((s) => expect(s.set.mock.calls).toEqual([[{ envelope: { ...SHARED_ADSR, sustain: 0.1 } }]]));
  });

  it('reaches every built layer on a voice with a muted layer', () => {
    const { voice, synths } = twoLayerVoice([0, 2]);
    voice.setShared({ portamento: 0.15 });
    expect(synths.map((s) => s.portamento)).toEqual([0.15, 0.15]);
    expect([voice.layerAt(0)!.written.portamento, voice.layerAt(2)!.written.portamento]).toEqual([0.15, 0.15]);
  });

  it('an empty call writes nothing', () => {
    const { voice, synths } = twoLayerVoice();
    const writes = synths.map((s) => countWrites(s, 'portamento'));
    voice.setShared({});
    expect(writes.map((w) => w.count())).toEqual([0, 0]);
    synths.forEach((s) => expect(s.set).not.toHaveBeenCalled());
  });

  it('a time changes nothing: the ADSR and portamento are settings', () => {
    const { voice, synths } = twoLayerVoice();
    const adsr = { ...SHARED_ADSR, decay: 1.1 };
    voice.setShared({ adsr, portamento: 0.2 }, 7.5);
    synths.forEach((s) => {
      expect(s.set.mock.calls).toEqual([[{ envelope: adsr }]]);
      expect(s.portamento).toBe(0.2);
    });
  });
});

describe('createCompositeVoice: set reports a non-zero gain that found no synth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /** Robot layers 0 and 2 built, layer 1 muted at build. */
  const voiceWithoutLayer1 = () => createCompositeVoice([makeLayer(), makeLayer()], SHARED_ADSR, 0, [0, 2]);

  it('a non-zero gain for the unbuilt layer is unrouted', () => {
    expect(voiceWithoutLayer1().set({ layers: [{}, { gain: 0.5 }, {}] })).toEqual({ unrouted: [1] });
  });

  it('a zero gain or a detune for the unbuilt layer is not', () => {
    expect(voiceWithoutLayer1().set({ layers: [{}, { gain: 0 }, {}] })).toEqual({ unrouted: [] });
    expect(voiceWithoutLayer1().set({ layers: [{}, { detune: 5 }, {}] })).toEqual({ unrouted: [] });
    expect(voiceWithoutLayer1().set({ layers: [{}, { phase: 90, pulseWidth: 0.4 }, {}] })).toEqual({ unrouted: [] });
  });

  it('a full-voice set, a hole, no layers and an output gain alone report nothing', () => {
    const full = createCompositeVoice([makeLayer(), makeLayer(), makeLayer()], SHARED_ADSR);
    expect(full.set({ layers: [{ gain: 0.2 }, { gain: 0.3 }, { gain: 0.4 }] })).toEqual({ unrouted: [] });
    const holes: { gain?: number }[] = [];
    holes[2] = { gain: 0.3 };
    expect(voiceWithoutLayer1().set({ layers: holes })).toEqual({ unrouted: [] });
    expect(voiceWithoutLayer1().set({})).toEqual({ unrouted: [] });
    expect(voiceWithoutLayer1().set({ outputGain: 0.5 })).toEqual({ unrouted: [] });
  });

  it('two missing non-zero gains are both reported, ascending', () => {
    const voice = createCompositeVoice([makeLayer()], SHARED_ADSR, 0, [1]);
    expect(voice.set({ layers: [{ gain: 0.3 }, { gain: 0.6 }, { gain: 0.4 }] })).toEqual({ unrouted: [0, 2] });
  });

  it('a gain at a built index is never reported, even when equal to its record', () => {
    const voice = voiceWithoutLayer1();
    expect(voice.set({ layers: [{ gain: 0.5 }, {}, { gain: 1 }] })).toEqual({ unrouted: [] });
    expect(voice.set({ layers: [{ gain: 0.5 }] })).toEqual({ unrouted: [] });
  });

  it('the unrouted patch writes nothing to the built layers', () => {
    const voice = voiceWithoutLayer1();
    const gains = voice.layers!.map((l) => countWrites(l.gainNode!.gain as object, 'value'));
    voice.set({ layers: [{}, { gain: 0.5 }, {}] });
    expect(gains.map((g) => g.count())).toEqual([0, 0]);
  });
});
