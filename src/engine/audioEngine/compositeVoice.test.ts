/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

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

  it('live-update set({ layers }) still applies a per-entry adsr patch to the synth (unchanged path)', () => {
    const voice = createCompositeVoice([makeLayer()], SHARED_ADSR);
    const synthInstance = (Tone.Synth as unknown as { mock: { results: { value: { set: ReturnType<typeof vi.fn> } }[] } })
      .mock.results[0].value;

    const newAdsr: ADSREnvelope = { attack: 0.5, decay: 0.5, sustain: 0.5, release: 0.5 };
    voice.set({ layers: [{ adsr: newAdsr } as Partial<OscillatorLayer> & { adsr: ADSREnvelope }] });

    expect(synthInstance.set).toHaveBeenCalledWith({ envelope: newAdsr });
  });

  it('every layer builds a Tone.Synth — no NoiseSynth construction path remains', () => {
    createCompositeVoice([makeLayer({ type: 'square' }), makeLayer({ type: 'pulse' })], SHARED_ADSR);
    expect(Tone.Synth).toHaveBeenCalledTimes(2);
  });

  describe('detune/phase/pulseWidth application (docs/tasks/AUDIO_ENGINE_CLEANUP.md Task 4) — characterizes today\'s behavior before extracting a shared helper, so the refactor has a real safety net', () => {
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

describe('createCompositeVoice: set({ layers }) portamento and curves', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('applies portamento to the one layer whose entry carries it, leaving the others alone', () => {
    const voice = createCompositeVoice([makeLayer(), makeLayer(), makeLayer()], SHARED_ADSR);
    const synths = synthInstances();
    synths.forEach((s) => { s.portamento = 0.5; });
    voice.set({ layers: [{ portamento: 0.1 }] });
    expect(synths[0].portamento).toBe(0.1);
    expect(synths[1].portamento).toBe(0.5);
    expect(synths[2].portamento).toBe(0.5);
  });

  it('applies portamento to all layers when every entry carries it', () => {
    const voice = createCompositeVoice([makeLayer(), makeLayer(), makeLayer()], SHARED_ADSR);
    voice.set({ layers: [{ portamento: 0.1 }, { portamento: 0.1 }, { portamento: 0.1 }] });
    synthInstances().forEach((s) => expect(s.portamento).toBe(0.1));
  });

  it('applies a portamento of 0 (glide off is a real value, not skipped as falsy)', () => {
    const voice = createCompositeVoice([makeLayer()], SHARED_ADSR, 0.4);
    const synth = synthInstances()[0];
    synth.portamento = 0.4;
    voice.set({ layers: [{ portamento: 0 }] });
    expect(synth.portamento).toBe(0);
  });

  it('leaves portamento untouched when the entry does not carry it', () => {
    const voice = createCompositeVoice([makeLayer()], SHARED_ADSR);
    const synth = synthInstances()[0];
    synth.portamento = 0.7;
    voice.set({ layers: [{ gain: 0.5 }] });
    expect(synth.portamento).toBe(0.7);
  });

  it('ignores a portamento entry past the last layer', () => {
    const voice = createCompositeVoice([makeLayer()], SHARED_ADSR);
    expect(() => voice.set({ layers: [{}, { portamento: 0.2 }] })).not.toThrow();
  });

  it('applies portamento and adsr from the same entry together', () => {
    const voice = createCompositeVoice([makeLayer()], SHARED_ADSR);
    const synth = synthInstances()[0];
    voice.set({ layers: [{ portamento: 0.25, adsr: { ...SHARED_ADSR, attack: 0.9 } }] });
    expect(synth.portamento).toBe(0.25);
    expect(synth.set).toHaveBeenCalledWith({ envelope: { ...SHARED_ADSR, attack: 0.9 } });
  });

  it('survives a throwing portamento assignment and still applies the rest of the patch', () => {
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
    expect(() => voice.set({ layers: [{ portamento: 0.2, detune: 33, adsr: SHARED_ADSR }] })).not.toThrow();
    expect((synth as unknown as { oscillator: { detune: { value: number } } }).oscillator.detune.value).toBe(33);
    expect(synth.set).toHaveBeenCalledWith({ envelope: SHARED_ADSR });
  });

  it('sends the live adsr patch through toToneEnvelope: four keys, no undefined-valued curve key', () => {
    const voice = createCompositeVoice([makeLayer()], SHARED_ADSR);
    const synth = synthInstances()[0];
    voice.set({ layers: [{ adsr: { ...SHARED_ADSR, attackCurve: undefined, releaseCurve: undefined } }] });
    const call = synth.set.mock.calls.find((c) => (c[0] as { envelope?: unknown }).envelope);
    const sent = call![0] as { envelope: Record<string, unknown> };
    expect(Object.keys(sent.envelope).sort()).toEqual(['attack', 'decay', 'release', 'sustain']);
  });

  it('sends a present curve in the live adsr patch', () => {
    const voice = createCompositeVoice([makeLayer()], SHARED_ADSR);
    const synth = synthInstances()[0];
    voice.set({ layers: [{ adsr: { ...SHARED_ADSR, attackCurve: 'bounce' } }] });
    expect(synth.set).toHaveBeenCalledWith({ envelope: { ...SHARED_ADSR, attackCurve: 'bounce' } });
  });
});
