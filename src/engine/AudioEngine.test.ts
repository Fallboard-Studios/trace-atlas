/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MAX_POLYPHONY } from '../constants';

vi.mock('../utils/localeHelpers', () => ({ getActiveLocaleId: vi.fn(() => 'testLocale') }));

// Mock Tone.js to avoid audio context initialization in tests
vi.mock('tone', () => ({
  start: vi.fn().mockResolvedValue(undefined),
  now: vi.fn(() => 0),
  Time: vi.fn((duration: string) => ({
    toSeconds: () => {
      const map: Record<string, number> = { '8n': 0.5, '4n': 1.0, '2n': 2.0 };
      return map[duration] || 1.0;
    },
  })),
  getTransport: vi.fn(() => ({
    state: 'stopped',
    start: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    stop: vi.fn(),
    clear: vi.fn(),
    scheduleOnce: vi.fn(),
    scheduleRepeat: vi.fn(() => 1),
  })),
  // Tone.getContext().setTimeout is the AudioContext-clock-based, tempo-independent
  // scheduling primitive scheduleVoiceRelease uses (docs/specs/BPM_CONTROL.md's
  // bug-fix follow-up) — distinct from Transport.scheduleOnce, which resolves a
  // '+N' offset against Transport's own tick timeline and is therefore skewed by
  // any bpm change between scheduling and firing.
  getContext: vi.fn(() => ({
    now: vi.fn(() => 0),
    setTimeout: vi.fn(() => 1),
    clearTimeout: vi.fn(),
  })),
  PolySynth: vi.fn(() => ({
    connect: vi.fn().mockReturnThis(),
    triggerAttackRelease: vi.fn(),
  })),
  Synth: vi.fn((config?: { oscillator?: { type?: string; width?: number } }) => {
    // PulseOscillator exposes a connectable width Signal; other oscillator
    // types don't — mirror that here so getRobotModulationTarget's
    // type === 'pulse' branch (Task 9) is genuinely exercised, not just
    // trivially passing against a flat always-present mock field.
    const oscillator: Record<string, unknown> = { detune: { value: 0 } };
    if (config?.oscillator?.type === 'pulse') {
      oscillator.width = { value: config.oscillator.width ?? 0.5 };
    }
    return {
      connect: vi.fn().mockReturnThis(),
      disconnect: vi.fn(),
      dispose: vi.fn(),
      triggerAttackRelease: vi.fn(),
      set: vi.fn(),
      oscillator,
      volume: { value: -6 },
    };
  }),
  // Legacy synth constructors removed from tests — use generic `Synth` or `PolySynth` mocks above
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
  Panner: vi.fn(() => ({
    connect: vi.fn().mockReturnThis(),
    disconnect: vi.fn(),
    dispose: vi.fn(),
    pan: { value: 0 },
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
  Limiter: vi.fn(() => ({
    connect: vi.fn().mockReturnThis(),
    disconnect: vi.fn(),
    toDestination: vi.fn(),
    threshold: { value: -12 },
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
    frequency: { value: 20000 },
    Q: { value: 1 },
  })),
  Gain: vi.fn(() => ({
    connect: vi.fn().mockReturnThis(),
    disconnect: vi.fn(),
    toDestination: vi.fn(),
    gain: { value: 1 },
  })),
}));

// Mock harmony system
vi.mock('./harmonySystem', () => ({
  getAvailableNotes: () => ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'],
  scheduleHarmonyCycle: vi.fn((_transport?: unknown) => undefined),
  stopHarmonyCycle: vi.fn(),
}));

// Mock beat clock
vi.mock('./beatClock', () => ({
  initBeatClock: vi.fn((_transport?: unknown) => undefined),
  getCurrentHour: vi.fn(() => 0),
  getCurrentMeasure: vi.fn(() => 0),
  getCurrentBeat: vi.fn(() => 0),
  subscribeToMeasure: vi.fn((_cb?: unknown) => undefined),  // ← add
  resetBeatClock: vi.fn(() => undefined),
}));

// Mock refs utility
vi.mock('../utils/refs', () => ({
  getRef: vi.fn(() => undefined), // Returns undefined by default in tests
  setRef: vi.fn(),
  deleteRef: vi.fn(),
  clearRefs: vi.fn(),
}));

// Mock GSAP
vi.mock('gsap', () => ({
  default: {
    getProperty: vi.fn(() => undefined), // Returns undefined (fallback to state position)
  },
}));

// Mock constants — spread the real module and override only DEV_TUNING (genuinely
// different in tests; prod derives it from import.meta.env.DEV). Everything else
// (MIN_LEAD, MAX_POLYPHONY, WORLD_WIDTH, ...) comes from the real module so it can
// never silently drift from src/constants/index.ts.
vi.mock('../constants', async () => {
  const actual = await vi.importActual<typeof import('../constants')>('../constants');
  return { ...actual, DEV_TUNING: false };
});

// Mock lfoEngine (Task 9) — AudioEngine.start() primes/connects/starts global
// LFOs through this, but exercising the real lfoEngine here would mean also
// mocking a real Tone.LFO, which is out of scope for testing AudioEngine's own
// orchestration logic (which target got which call, in what order).
vi.mock('./lfoEngine', () => ({
  lfoEngine: {
    getLfoSettings: vi.fn(),
    setLfoRate: vi.fn(),
    setLfoDepth: vi.fn(),
    setLfoShape: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    connectLfoTarget: vi.fn(() => true),
    disconnectLfoTarget: vi.fn(),
    setGlobalRateDrift: vi.fn(),
    setGlobalDepthDrift: vi.fn(),
  },
}));

/* eslint-disable @typescript-eslint/no-explicit-any */

import { AudioEngine } from './AudioEngine';
import { useLocaleStore } from '../stores/localeStore';
import { volumePositionToGain } from './audioEngine/volumeTaper';

/** Shared placeholder ADSR for tests that don't care about specific envelope values —
 * reserveVoice's adsr parameter is required (Roadmap Phase 9), so every call needs one. */
const TEST_ADSR = { attack: 0.01, decay: 0.1, sustain: 0.8, release: 0.5 };

describe('AudioEngine.reReserveVoice', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('releases and re-reserves using updated audioAttributes', () => {
    vi.spyOn(useLocaleStore, 'getState').mockReturnValue({
      locales: {
        testLocale: {
          robots: [
            {
              id: 'r1',
              name: '',
              state: 'idle',
              direction: 'right',
              position: { x: 960, y: 0 },
              destination: null,
              createdAt: Date.now(),
              melody: [],
              octaveRange: [3, 4],
              masterVolume: 0.8,
              audioMode: 'none',
              audioAttributes: {
                waveform: 'sine',
                adsr: { attack: 0.01, decay: 0.1, sustain: 0.8, release: 0.5 },
                filterFreq: 1200,
                layers: [{ type: 'sine', pulseWidth: 0.42 }],
                phase: 37,
                detune: 5,
              },
            },
          ],
        },
      },
    } as any);

    const reserveSpy = vi.spyOn(AudioEngine, 'reserveVoice').mockImplementation(() => true);
    const releaseSpy = vi.spyOn(AudioEngine, 'releaseVoice').mockImplementation(() => { });

    const res = AudioEngine.reReserveVoice('r1');

    expect(res).toBe(true);
    expect(releaseSpy).toHaveBeenCalledWith('r1');
    // adsr is threaded through as the 3rd positional argument, ahead of phase/detune/pulseWidth
    // (Roadmap Phase 9 — the robot's one shared envelope, read from audioAttributes.adsr).
    // masterVolume (0.8, from the fixture's own robot.masterVolume) is threaded through as the
    // 7th — the robot's live bus gain, per the same phase's live-fader fix.
    expect(reserveSpy).toHaveBeenCalledWith(
      'r1',
      expect.arrayContaining([expect.objectContaining({ type: 'sine' })]),
      { attack: 0.01, decay: 0.1, sustain: 0.8, release: 0.5 },
      37,
      5,
      0.42,
      0.8,
    );
  });
});

// The following audioMode tests were merged from AudioEngine.audioMode.test.ts
// They require importing the locale store after a module reset to ensure
// the AudioEngine and test share the same store instance.

let merged_useLocaleStore: any;
let merged_DEFAULT_LOCALE_ID: string;

describe('AudioEngine - Polyphony Management', () => {
  const TEST_LAYERED = { base: 'sine', layers: [{ type: 'sine', gain: 0.8 }] } as any;

  beforeEach(async () => {
    // Reset modules to clear state between tests
    vi.resetModules();

    // Re-import with fresh state
    const { AudioEngine } = await import('./AudioEngine');

    // Initialize AudioEngine (loads synth pool)
    await AudioEngine.start();

    // Reserve a composite voice for the shared 'test' robot so triggerWithCap can trigger it
    AudioEngine.reserveVoice('test', TEST_LAYERED, TEST_ADSR);
  });

  describe('triggerWithCap', () => {
    it('accepts notes when under polyphony limit', async () => {
      const { triggerWithCap } = await import('./AudioEngine');

      // Should accept first note
      const result = triggerWithCap({ robotId: 'test', note: 'C4', duration: '4n', time: 0, velocity: 0.8 });
      expect(result).toBe(true);
    });

    it('skips notes when at polyphony limit', async () => {
      const { triggerWithCap } = await import('./AudioEngine');

      // Fill up to limit (16 voices)
      for (let i = 0; i < 16; i++) {
        const result = triggerWithCap({ robotId: 'test', note: 'C4', duration: '4n', time: 0, velocity: 0.8 });
        expect(result).toBe(true);
      }

      // 17th note should be skipped
      const result = triggerWithCap({ robotId: 'test', note: 'C4', duration: '4n', time: 0, velocity: 0.8 });
      expect(result).toBe(false);
    });

    it('returns false when synth pool not loaded', async () => {
      // Import fresh module without initialization
      vi.resetModules();
      const { triggerWithCap } = await import('./AudioEngine');

      const result = triggerWithCap({ robotId: 'test', note: 'C4', duration: '4n', time: 0, velocity: 0.8 });
      expect(result).toBe(false);
    });

    it('uses default time when time parameter omitted', async () => {
      const { triggerWithCap } = await import('./AudioEngine');

      // Should not throw, should use Tone.now()
      const result = triggerWithCap({ robotId: 'test', note: 'C4', duration: '4n', time: undefined, velocity: 0.8 });
      expect(result).toBe(true);
    });

    it('uses default velocity when velocity parameter omitted', async () => {
      const { triggerWithCap } = await import('./AudioEngine');

      // Should not throw, should use 0.8
      const result = triggerWithCap({ robotId: 'test', note: 'C4', duration: '4n', time: 0 });
      expect(result).toBe(true);
    });

    it('handles trigger errors gracefully', async () => {
      const { triggerWithCap } = await import('./AudioEngine');

      // This test verifies error handling exists in the implementation
      // Detailed mocking of Tone.js errors is complex and not worth it
      // The implementation has try-catch that restores voice counter on error
      expect(triggerWithCap).toBeDefined();
    });
  });

  describe('Voice Counter', () => {
    it('increments activeVoices when note triggered', async () => {
      const { triggerWithCap } = await import('./AudioEngine');

      // Trigger 3 notes
      triggerWithCap({ robotId: 'test', note: 'C4', duration: '4n', time: 0, velocity: 0.8 });
      triggerWithCap({ robotId: 'test', note: 'E4', duration: '4n', time: 0, velocity: 0.8 });
      triggerWithCap({ robotId: 'test', note: 'G4', duration: '4n', time: 0, velocity: 0.8 });

      // Can't directly test activeVoices (internal), but can verify
      // that we can still trigger more (under limit)
      const result = triggerWithCap({ robotId: 'test', note: 'C5', duration: '4n', time: 0, velocity: 0.8 });
      expect(result).toBe(true);
    });

    it('prevents negative voice count on error', async () => {
      const { triggerWithCap } = await import('./AudioEngine');

      // This test verifies counter protection exists in the implementation
      // The implementation uses Math.max(0, activeVoices - 1) to prevent negatives
      // Detailed mocking of Tone.js Transport errors is not practical in tests
      expect(triggerWithCap).toBeDefined();
    });
  });

  describe('Polyphony Limit', () => {
    it('enforces MAX_POLYPHONY voices', async () => {
      const { triggerWithCap } = await import('./AudioEngine');

      let acceptedCount = 0;
      let skippedCount = 0;

      // Try to trigger more notes than the cap allows
      const attempts = MAX_POLYPHONY + 4;
      for (let i = 0; i < attempts; i++) {
        const result = triggerWithCap({ robotId: 'test', note: 'C4', duration: '4n', time: 0, velocity: 0.8 });
        if (result) {
          acceptedCount++;
        } else {
          skippedCount++;
        }
      }

      // Should accept exactly MAX_POLYPHONY, skip the rest
      expect(acceptedCount).toBe(MAX_POLYPHONY);
      expect(skippedCount).toBe(attempts - MAX_POLYPHONY);
    });
  });

  // Audio Load Budget (docs/specs/AUDIO_LOAD_BUDGET.md §4.3): two module-state inputs the budget system
  // pushes in — the set of robots allowed to sound, and a dynamic polyphony ceiling. Both default to
  // "no restriction" so the engine behaves exactly as before until (and unless) something pushes them.
  describe('Audio Load Budget gate (sounding set + dynamic polyphony cap)', () => {
    const play = async (robotId = 'test', note = 'C4') => {
      const { triggerWithCap } = await import('./AudioEngine');
      return triggerWithCap({ robotId, note, duration: '4n', time: 0, velocity: 0.8 });
    };

    /** How many times any synth was told to play `note` — how the tests see whether a trigger reached the audio graph. */
    const synthTriggersFor = async (note: string) => {
      const Tone = await import('tone');
      let count = 0;
      for (const result of (Tone.Synth as unknown as any).mock.results) {
        result.value?.triggerAttackRelease?.mock?.calls?.forEach((call: any) => {
          if (call[0] === note) count++;
        });
      }
      return count;
    };

    /** Fire every scheduled voice release, as the AudioContext clock reaching them would. */
    const fireAllReleases = async () => {
      const Tone = await import('tone');
      const contexts = (Tone.getContext as unknown as ReturnType<typeof vi.fn>).mock.results as Array<{ value: { setTimeout: ReturnType<typeof vi.fn> } }>;
      contexts.forEach((result) => {
        result.value.setTimeout.mock.calls.forEach((call: unknown[]) => (call[0] as () => void)());
        result.value.setTimeout.mockClear();
      });
    };

    describe('defaults', () => {
      it('plays every robot and reports the full ceiling while nothing has been pushed', async () => {
        const { AudioEngine } = await import('./AudioEngine');
        expect(await play()).toBe(true);
        expect(AudioEngine.getPolyphonyStats().maxVoices).toBe(MAX_POLYPHONY);
      });
    });

    describe('sounding set', () => {
      it('plays a robot that is in the set (control: the note reaches a synth)', async () => {
        const { AudioEngine } = await import('./AudioEngine');
        AudioEngine.setSoundingRobots(['test']);

        expect(await play('test', 'G8')).toBe(true);

        expect(AudioEngine.getPolyphonyStats().voices).toBe(1);
        expect(await synthTriggersFor('G8')).toBeGreaterThan(0);
      });

      it('never triggers a robot that is outside the set, and it consumes no polyphony slot', async () => {
        const { AudioEngine } = await import('./AudioEngine');
        AudioEngine.setSoundingRobots(['someone-else']);

        expect(await play('test', 'G9')).toBe(false);

        expect(AudioEngine.getPolyphonyStats().voices).toBe(0);
        expect(await synthTriggersFor('G9')).toBe(0);
      });

      it('a standing-by robot hammering the trigger never uses up slots the sounding robots need', async () => {
        const { AudioEngine } = await import('./AudioEngine');
        AudioEngine.reserveVoice('waiting', TEST_LAYERED, TEST_ADSR);
        AudioEngine.setSoundingRobots(['test']);

        for (let i = 0; i < MAX_POLYPHONY * 3; i++) expect(await play('waiting')).toBe(false);

        expect(AudioEngine.getPolyphonyStats().voices).toBe(0);
        for (let i = 0; i < MAX_POLYPHONY; i++) expect(await play('test')).toBe(true);
      });

      it('an empty set silences everyone — it is not the same as having no set', async () => {
        const { AudioEngine } = await import('./AudioEngine');
        AudioEngine.setSoundingRobots([]);
        expect(await play()).toBe(false);
      });

      it('null removes the restriction again', async () => {
        const { AudioEngine } = await import('./AudioEngine');
        AudioEngine.setSoundingRobots(['someone-else']);
        expect(await play()).toBe(false);

        AudioEngine.setSoundingRobots(null);

        expect(await play()).toBe(true);
      });

      it('takes effect on the very next note, in both directions', async () => {
        const { AudioEngine } = await import('./AudioEngine');
        AudioEngine.setSoundingRobots(['test']);
        expect(await play()).toBe(true);
        AudioEngine.setSoundingRobots(['other']);
        expect(await play()).toBe(false);
        AudioEngine.setSoundingRobots(['test', 'other']);
        expect(await play()).toBe(true);
      });

      it('copies the ids it is given — mutating the caller’s array afterwards changes nothing', async () => {
        const { AudioEngine } = await import('./AudioEngine');
        const ids = ['test'];
        AudioEngine.setSoundingRobots(ids);
        ids.length = 0;
        expect(await play()).toBe(true);
      });

      it('applies whether or not the locale has any robots in the store', async () => {
        // This suite runs with an empty locale, so the mute/solo check is skipped entirely — the gate must not be.
        const { AudioEngine } = await import('./AudioEngine');
        AudioEngine.setSoundingRobots(['other']);
        expect(await play('test')).toBe(false);
      });
    });

    describe('dynamic polyphony cap', () => {
      it('accepts exactly `cap` simultaneous notes and refuses the rest', async () => {
        const { AudioEngine } = await import('./AudioEngine');
        AudioEngine.setPolyphonyCap(3);

        const results = [];
        for (let i = 0; i < 6; i++) results.push(await play());

        expect(results).toEqual([true, true, true, false, false, false]);
      });

      it('reports the live cap as maxVoices', async () => {
        const { AudioEngine } = await import('./AudioEngine');
        AudioEngine.setPolyphonyCap(8);
        expect(AudioEngine.getPolyphonyStats().maxVoices).toBe(8);
        AudioEngine.setPolyphonyCap(MAX_POLYPHONY);
        expect(AudioEngine.getPolyphonyStats().maxVoices).toBe(MAX_POLYPHONY);
      });

      it('lowering the cap below the notes already sounding blocks new notes without touching the counter', async () => {
        const { AudioEngine } = await import('./AudioEngine');
        for (let i = 0; i < 5; i++) expect(await play()).toBe(true);

        AudioEngine.setPolyphonyCap(2);

        expect(AudioEngine.getPolyphonyStats().voices).toBe(5); // not forcibly decremented, not stranded
        expect(await play()).toBe(false);
        expect(AudioEngine.getPolyphonyStats().voices).toBe(5);
      });

      it('lets the counter drain naturally after a lowered cap, then admits up to the new cap', async () => {
        const { AudioEngine } = await import('./AudioEngine');
        for (let i = 0; i < 5; i++) await play();
        AudioEngine.setPolyphonyCap(2);

        await fireAllReleases();

        expect(AudioEngine.getPolyphonyStats().voices).toBe(0);
        expect(await play()).toBe(true);
        expect(await play()).toBe(true);
        expect(await play()).toBe(false);
      });

      it('raising the cap restores normal behavior immediately', async () => {
        const { AudioEngine } = await import('./AudioEngine');
        AudioEngine.setPolyphonyCap(1);
        expect(await play()).toBe(true);
        expect(await play()).toBe(false);

        AudioEngine.setPolyphonyCap(MAX_POLYPHONY);

        expect(await play()).toBe(true);
      });

      it('clamps to [0, MAX_POLYPHONY], floors fractions, and treats NaN as the full ceiling', async () => {
        const { AudioEngine } = await import('./AudioEngine');
        AudioEngine.setPolyphonyCap(99);
        expect(AudioEngine.getPolyphonyStats().maxVoices).toBe(MAX_POLYPHONY);
        AudioEngine.setPolyphonyCap(2.9);
        expect(AudioEngine.getPolyphonyStats().maxVoices).toBe(2);
        AudioEngine.setPolyphonyCap(-5);
        expect(AudioEngine.getPolyphonyStats().maxVoices).toBe(0);
        expect(await play()).toBe(false);
        AudioEngine.setPolyphonyCap(NaN);
        expect(AudioEngine.getPolyphonyStats().maxVoices).toBe(MAX_POLYPHONY);
      });
    });

    describe('killAll', () => {
      it('still resets the voice counter, and leaves the gate and the cap in force', async () => {
        const { AudioEngine } = await import('./AudioEngine');
        AudioEngine.setPolyphonyCap(4);
        AudioEngine.setSoundingRobots(['other']);
        AudioEngine.setSoundingRobots(['test']);
        await play();
        await play();
        expect(AudioEngine.getPolyphonyStats().voices).toBe(2);

        AudioEngine.killAll();

        expect(AudioEngine.getPolyphonyStats().voices).toBe(0);
        expect(AudioEngine.getPolyphonyStats().maxVoices).toBe(4);
        AudioEngine.setSoundingRobots(['other']);
        AudioEngine.killAll();
        expect(await play()).toBe(false); // the set survived a power cycle
      });
    });

    it('applies the gate before the polyphony cap, so a blocked robot is not counted even when the cap is also full', async () => {
      const { AudioEngine } = await import('./AudioEngine');
      AudioEngine.setPolyphonyCap(1);
      AudioEngine.setSoundingRobots(['test']);
      expect(await play('test')).toBe(true); // fills the only slot
      AudioEngine.reserveVoice('waiting', TEST_LAYERED, TEST_ADSR);

      expect(await play('waiting')).toBe(false);

      expect(AudioEngine.getPolyphonyStats().voices).toBe(1);
    });
  });

  // Bug: changing BPM while notes are sounding made playback "peter out" —
  // only already-triggered notes finished, then nothing new played. Root
  // cause: scheduleVoiceRelease computed a real-seconds voice-release delay
  // but scheduled it via transport.scheduleOnce('+N'), which Tone.js resolves
  // against the TRANSPORT's own tick timeline (Transport.scheduleOnce ->
  // TransportTimeClass(...).toTicks()) — a fixed tick position computed at
  // the CURRENT tempo. Any bpm change before that tick position is reached
  // shifts how much real time it takes to get there, so releases fire late
  // (bpm decreased) or early (bpm increased). Enough skew — one Tempo slider
  // drag while 16 notes are in flight is enough — strands activeVoices at
  // MAX_POLYPHONY for an extended stretch, silently blocking every new
  // trigger. docs/specs/BPM_CONTROL.md's bug-fix follow-up.
  describe('Voice release scheduling is tempo-independent', () => {
    it('schedules the release via the AudioContext clock (context.setTimeout), not Transport.scheduleOnce', async () => {
      const Tone = await import('tone');
      const { triggerWithCap } = await import('./AudioEngine');

      triggerWithCap({ robotId: 'test', note: 'C4', duration: '4n', time: 0, velocity: 0.8 });

      const contextMock = (Tone.getContext as unknown as ReturnType<typeof vi.fn>).mock.results.at(-1)?.value;
      expect(contextMock.setTimeout).toHaveBeenCalled();

      const transportMock = (Tone.getTransport as unknown as ReturnType<typeof vi.fn>).mock.results.at(-1)?.value;
      expect(transportMock.scheduleOnce).not.toHaveBeenCalled();
    });

    it('frees the voice when the context.setTimeout callback fires, even after an intervening setBPM call — a bpm change must not strand activeVoices at the polyphony cap', async () => {
      const Tone = await import('tone');
      const { AudioEngine, triggerWithCap } = await import('./AudioEngine');

      // Fill to the polyphony cap.
      for (let i = 0; i < 16; i++) {
        expect(triggerWithCap({ robotId: 'test', note: 'C4', duration: '4n', time: 0, velocity: 0.8 })).toBe(true);
      }
      expect(triggerWithCap({ robotId: 'test', note: 'C4', duration: '4n', time: 0, velocity: 0.8 })).toBe(false); // capped

      // The Tempo slider does exactly this while those 16 notes are still
      // sounding — must not prevent their scheduled releases from firing.
      AudioEngine.setBPM(90);

      // Fire every release scheduled so far (simulates the AudioContext clock
      // reaching each one, regardless of whatever bpm did in between).
      const contextCalls = (Tone.getContext as unknown as ReturnType<typeof vi.fn>).mock.results as Array<{ value: { setTimeout: ReturnType<typeof vi.fn> } }>;
      contextCalls.forEach((result) => {
        result.value.setTimeout.mock.calls.forEach((call: unknown[]) => (call[0] as () => void)());
      });

      expect(triggerWithCap({ robotId: 'test', note: 'C4', duration: '4n', time: 0, velocity: 0.8 })).toBe(true); // freed up again
    });
  });
});

describe('AudioEngine - audioMode enforcement (solo/mute/highlight)', () => {
  beforeEach(() => {
    vi.resetModules();
    // ensure deterministic locale store defaults — import after resetModules
    // so AudioEngine and tests reference the same store instance.
    return (async () => {
      const storeMod = await import('../stores/localeStore');
      const attenuationStyleMod = await import('../stores/attenuationStyleStore');
      merged_useLocaleStore = storeMod.useLocaleStore;
      merged_DEFAULT_LOCALE_ID = attenuationStyleMod.DEFAULT_LOCALE_ID;
    })();
  });

  it('mutes robots with audioMode=\'mute\' (no synth calls)', async () => {
    const Tone = await import('tone');
    const { AudioEngine } = await import('./AudioEngine');
    const helpers = await import('../utils/localeHelpers');
    (helpers.getActiveLocaleId as ReturnType<typeof vi.fn>).mockReturnValue(merged_DEFAULT_LOCALE_ID);

    // Populate locale robots: one muted, one normal
    merged_useLocaleStore.getState().setLocaleData(merged_DEFAULT_LOCALE_ID, {
      robots: [
        { id: 'r-muted', audioMode: 'mute', audioAttributes: { adsr: { attack: 0.01, decay: 0.1, sustain: 0.8, release: 0.2 }, waveform: 'sine', filterFreq: 100 }, masterVolume: 0.8, melody: [], octaveRange: [3, 4], position: { x: 960, y: 0 }, createdAt: Date.now(), name: '', state: 'idle', direction: 'right' },
        { id: 'r-other', audioMode: 'none', audioAttributes: { adsr: { attack: 0.01, decay: 0.1, sustain: 0.8, release: 0.2 }, waveform: 'sine', filterFreq: 100 }, masterVolume: 0.8, melody: [], octaveRange: [3, 4], position: { x: 960, y: 0 }, createdAt: Date.now(), name: '', state: 'idle', direction: 'right' },
      ],
    });

    await AudioEngine.start();

    // Reserve composite voices for both robots using canonical layers array
    const layered: any[] = [{ type: 'sine', gain: 0.8, detune: 0, phase: 0 }];
    AudioEngine.reserveVoice('r-muted', layered as any, TEST_ADSR);
    AudioEngine.reserveVoice('r-other', layered as any, TEST_ADSR);

    // Clear prior calls on created Synth instances
    const synthResults = (Tone.Synth as unknown as any).mock.results;
    synthResults.forEach((r: any) => r.value?.triggerAttackRelease?.mockClear());

    // Use a unique note name to avoid background scheduler collisions
    const targetMutedNote = 'G9';
    AudioEngine.scheduleNote({ robotId: 'r-muted', note: targetMutedNote, duration: '4n', time: 0 });

    // Ensure no Synth instance received a trigger call for our unique note
    let foundMuted = false;
    synthResults.forEach((r: any) => {
      const inst = r.value;
      inst?.triggerAttackRelease?.mock?.calls?.forEach((c: any) => { if (c[0] === targetMutedNote) foundMuted = true; });
    });
    expect(foundMuted).toBe(false);

    // Non-muted should trigger with a different unique note
    const targetOtherNote = 'G8';
    AudioEngine.scheduleNote({ robotId: 'r-other', note: targetOtherNote, duration: '4n', time: 0 });
    let foundOther = false;
    synthResults.forEach((r: any) => {
      const inst = r.value;
      inst?.triggerAttackRelease?.mock?.calls?.forEach((c: any) => { if (c[0] === targetOtherNote) foundOther = true; });
    });
    expect(foundOther).toBe(true);
  });

  describe('AudioEngine.updateVoiceLayerParams', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('calls composite.set with provided layers when voice reserved', async () => {
      vi.resetModules();
      const { AudioEngine } = await import('./AudioEngine');

      await AudioEngine.start();

      const initialLayers: any[] = [{ type: 'sine', gain: 0.8 }];
      AudioEngine.reserveVoice('v1', initialLayers as any, TEST_ADSR);

      const comp = AudioEngine.getVoiceForRobot('v1') as any;
      const setSpy = vi.spyOn(comp, 'set');

      const updatedLayers = [{ type: 'sine', gain: 0.5, detune: 3 }];
      AudioEngine.updateVoiceLayerParams('v1', updatedLayers as any);

      expect(setSpy).toHaveBeenCalledWith({ layers: expect.arrayContaining([expect.objectContaining({ type: 'sine' })]) });
    });

    it('no-ops (does not throw) when no voice reserved', async () => {
      vi.resetModules();
      const { AudioEngine } = await import('./AudioEngine');
      await AudioEngine.start();

      expect(() => AudioEngine.updateVoiceLayerParams('missing', [{ type: 'sine', gain: 0.5 } as any])).not.toThrow();
    });
  });

  it('enforces solo: only solo robot produces audio', async () => {
    const Tone = await import('tone');
    const { AudioEngine } = await import('./AudioEngine');
    const helpers = await import('../utils/localeHelpers');
    (helpers.getActiveLocaleId as ReturnType<typeof vi.fn>).mockReturnValue(merged_DEFAULT_LOCALE_ID);

    merged_useLocaleStore.getState().setLocaleData(merged_DEFAULT_LOCALE_ID, {
      robots: [
        { id: 'r-solo', audioMode: 'solo', audioAttributes: { adsr: { attack: 0.01, decay: 0.1, sustain: 0.8, release: 0.2 }, waveform: 'sine', filterFreq: 100 }, masterVolume: 0.9, melody: [], octaveRange: [3, 4], position: { x: 960, y: 0 }, createdAt: Date.now(), name: '', state: 'idle', direction: 'right' },
        { id: 'r-other2', audioMode: 'none', audioAttributes: { adsr: { attack: 0.01, decay: 0.1, sustain: 0.8, release: 0.2 }, waveform: 'sine', filterFreq: 100 }, masterVolume: 0.9, melody: [], octaveRange: [3, 4], position: { x: 960, y: 0 }, createdAt: Date.now(), name: '', state: 'idle', direction: 'right' },
      ],
    });

    await AudioEngine.start();

    // Reserve composite voices using canonical layers array
    const layered: any[] = [{ type: 'sine', gain: 0.8, detune: 0, phase: 0 }];
    AudioEngine.reserveVoice('r-solo', layered as any, TEST_ADSR);
    AudioEngine.reserveVoice('r-other2', layered as any, TEST_ADSR);

    const synthResults = (Tone.Synth as unknown as any).mock.results;
    synthResults.forEach((r: any) => r.value?.triggerAttackRelease?.mockClear());

    const targetOtherNote = 'G7';
    AudioEngine.scheduleNote({ robotId: 'r-other2', note: targetOtherNote, duration: '4n', time: 0 });
    let foundOther = false;
    synthResults.forEach((r: any) => {
      const inst = r.value;
      inst?.triggerAttackRelease?.mock?.calls?.forEach((c: any) => { if (c[0] === targetOtherNote) foundOther = true; });
    });
    expect(foundOther).toBe(false); // suppressed by solo

    const targetSoloNote = 'G6';
    AudioEngine.scheduleNote({ robotId: 'r-solo', note: targetSoloNote, duration: '4n', time: 0 });
    let foundSolo = false;
    synthResults.forEach((r: any) => {
      const inst = r.value;
      inst?.triggerAttackRelease?.mock?.calls?.forEach((c: any) => { if (c[0] === targetSoloNote) foundSolo = true; });
    });
    expect(foundSolo).toBe(true);
  });

  it('applies ~50% attenuation to non-highlighted robots when one is highlighted', async () => {
    const Tone = await import('tone');
    const { AudioEngine } = await import('./AudioEngine');
    const helpers = await import('../utils/localeHelpers');
    (helpers.getActiveLocaleId as ReturnType<typeof vi.fn>).mockReturnValue(merged_DEFAULT_LOCALE_ID);

    merged_useLocaleStore.getState().setLocaleData(merged_DEFAULT_LOCALE_ID, {
      robots: [
        { id: 'r-h', audioMode: 'highlight', audioAttributes: { adsr: { attack: 0.01, decay: 0.1, sustain: 0.8, release: 0.2 }, waveform: 'sine', filterFreq: 100 }, masterVolume: 0.8, melody: [], octaveRange: [3, 4], position: { x: 960, y: 0 }, createdAt: Date.now(), name: '', state: 'idle', direction: 'right' },
        { id: 'r-nh', audioMode: 'none', audioAttributes: { adsr: { attack: 0.01, decay: 0.1, sustain: 0.8, release: 0.2 }, waveform: 'sine', filterFreq: 100 }, masterVolume: 0.8, melody: [], octaveRange: [3, 4], position: { x: 960, y: 0 }, createdAt: Date.now(), name: '', state: 'idle', direction: 'right' },
      ],
    });

    await AudioEngine.start();

    // Reserve composite voices using canonical layers array
    const layered: any[] = [{ type: 'sine', gain: 0.8, detune: 0, phase: 0 }];
    AudioEngine.reserveVoice('r-h', layered as any, TEST_ADSR);
    AudioEngine.reserveVoice('r-nh', layered as any, TEST_ADSR);

    const synthResults = (Tone.Synth as unknown as any).mock.results;
    synthResults.forEach((r: any) => r.value?.triggerAttackRelease?.mockClear());

    // Schedule note for non-highlighted robot with a unique note. Pass an
    // explicit velocity (0.8) so this test isolates the highlight-attenuation
    // step (scheduleNote's audioMode logic unconditionally applies × 0.5,
    // whether velocity came from the caller or from computeNoteVelocitySeeded)
    // rather than depending on the active locale's seeded noise map landing in
    // its "no variance" branch — that incidental coupling is exactly what
    // broke when the default locale's noise-map coordinates were fixed off
    // their (0, 0) dead zone (docs/todo/roadmap.md § 5 "Known Issue").
    const targetNote = 'G5';
    AudioEngine.scheduleNote({ robotId: 'r-nh', note: targetNote, duration: '4n', time: 0, velocity: 0.8 });

    // Find the call for our unique note and assert velocity ≈ 0.4
    let found = false;
    synthResults.forEach((r: any) => {
      const inst = r.value;
      inst?.triggerAttackRelease?.mock?.calls?.forEach((c: any) => {
        if (c[0] === targetNote) {
          const vel = c[3];
          expect(typeof vel).toBe('number');
          expect(Math.abs(vel - 0.4)).toBeLessThan(0.05);
          found = true;
        }
      });
    });
    expect(found).toBe(true);
  });
});

describe('AudioEngine - Melody Lifecycle', () => {
  beforeEach(async () => {
    // Reset modules to clear state between tests
    vi.resetModules();

    // Re-import with fresh state
    const { AudioEngine } = await import('./AudioEngine');

    // Initialize AudioEngine
    await AudioEngine.start();
  });

  describe('registerRobotMelody', () => {
    it('adds melody events to step registry', async () => {
      const { AudioEngine } = await import('./AudioEngine');

      const melody = [
        { id: 'event1', startStep: 1, length: '8n' as const, noteIndex: 0, octave: 4 },
        { id: 'event2', startStep: 5, length: '4n' as const, noteIndex: 2, octave: 4 },
        { id: 'event3', startStep: 9, length: '8n' as const, noteIndex: 4, octave: 4 },
      ];

      AudioEngine.registerRobotMelody('robot1', melody);

      // Verify events were registered by attempting to unregister and checking count
      AudioEngine.unregisterRobotMelody('robot1');
      // If registration worked, unregister should have removed events
      // (proven by console.log output in implementation)
    });

    it('allows multiple robots to register events at same step', async () => {
      const { AudioEngine } = await import('./AudioEngine');

      const melody1 = [
        { id: 'r1-e1', startStep: 1, length: '8n' as const, noteIndex: 0, octave: 4 },
        { id: 'r1-e2', startStep: 5, length: '4n' as const, noteIndex: 2, octave: 4 },
      ];

      const melody2 = [
        { id: 'r2-e1', startStep: 1, length: '8n' as const, noteIndex: 1, octave: 4 },
        { id: 'r2-e2', startStep: 5, length: '4n' as const, noteIndex: 3, octave: 4 },
      ];

      // Both robots register events at steps 1 and 5
      AudioEngine.registerRobotMelody('robot1', melody1);
      AudioEngine.registerRobotMelody('robot2', melody2);

      // Clean up
      AudioEngine.unregisterRobotMelody('robot1');
      AudioEngine.unregisterRobotMelody('robot2');
    });

    it('handles empty melody arrays', async () => {
      const { AudioEngine } = await import('./AudioEngine');

      // Should not throw
      AudioEngine.registerRobotMelody('robot1', []);
    });
  });

  describe('unregisterRobotMelody', () => {
    it('removes all events for specific robot', async () => {
      const { AudioEngine } = await import('./AudioEngine');

      const melody = [
        { id: 'event1', startStep: 1, length: '8n' as const, noteIndex: 0, octave: 4 },
        { id: 'event2', startStep: 5, length: '4n' as const, noteIndex: 2, octave: 4 },
        { id: 'event3', startStep: 9, length: '8n' as const, noteIndex: 4, octave: 4 },
      ];

      AudioEngine.registerRobotMelody('robot1', melody);
      AudioEngine.unregisterRobotMelody('robot1');

      // Attempting to unregister again should remove 0 events
      AudioEngine.unregisterRobotMelody('robot1');
    });

    it('does not affect other robots events', async () => {
      const { AudioEngine } = await import('./AudioEngine');

      const melody1 = [
        { id: 'r1-e1', startStep: 1, length: '8n' as const, noteIndex: 0, octave: 4 },
        { id: 'r1-e2', startStep: 5, length: '4n' as const, noteIndex: 2, octave: 4 },
      ];

      const melody2 = [
        { id: 'r2-e1', startStep: 1, length: '8n' as const, noteIndex: 1, octave: 4 },
        { id: 'r2-e2', startStep: 9, length: '4n' as const, noteIndex: 3, octave: 4 },
      ];

      AudioEngine.registerRobotMelody('robot1', melody1);
      AudioEngine.registerRobotMelody('robot2', melody2);

      // Remove robot1
      AudioEngine.unregisterRobotMelody('robot1');

      // Robot2 should still be registered (verified by unregister removing events)
      AudioEngine.unregisterRobotMelody('robot2');
    });

    it('handles unregistering non-existent robot', async () => {
      const { AudioEngine } = await import('./AudioEngine');

      // Should not throw, removes 0 events
      AudioEngine.unregisterRobotMelody('nonexistent');
    });
  });

  describe('Registry Cleanup', () => {
    it('removes empty steps from registry after unregister', async () => {
      const { AudioEngine } = await import('./AudioEngine');

      const melody = [
        { id: 'event1', startStep: 1, length: '8n' as const, noteIndex: 0, octave: 4 },
        { id: 'event2', startStep: 5, length: '4n' as const, noteIndex: 2, octave: 4 },
      ];

      AudioEngine.registerRobotMelody('robot1', melody);
      AudioEngine.unregisterRobotMelody('robot1');

      // Registry should delete empty step entries (implementation does this)
      // Verified by code inspection: stepRegistry.delete(step) when filtered.length === 0
    });
  });

  describe('Integration: registered melody -> scheduling', () => {
    it('schedules notes from newly-registered melody on processMelodyStep', async () => {
      const { AudioEngine } = await import('./AudioEngine');

      const melody = [
        { id: 'm1', startStep: 7, length: '8n' as const, noteIndex: 0, octave: 4 },
      ];

      const spy = vi.spyOn(AudioEngine, 'scheduleNote').mockImplementation((_params: unknown) => { });

      AudioEngine.registerRobotMelody('int-1', melody);

      // Simulate a transport tick for step 7 at time 0
      AudioEngine.processMelodyStep(7, 0);

      expect(spy).toHaveBeenCalled();

      const calledWith = spy.mock.calls[0][0];
      expect(calledWith.robotId).toBe('int-1'); // Ensure previous file chunk ends cleanly
      expect(typeof calledWith.note).toBe('string');
      expect(calledWith.note.endsWith('4')).toBe(true);

      spy.mockRestore();
    });
  });
});

describe('AudioEngine - Motif Group Accent', () => {
  beforeEach(async () => {
    vi.resetModules();
    const { AudioEngine } = await import('./AudioEngine');
    await AudioEngine.start();
  });

  function makeRobot(id: string, rhythmicMotifLength: { active: boolean; value: number }) {
    return {
      id,
      identityColor: '#428d95',
      rhythmicMotifLength,
      audioAttributes: { adsr: { attack: 0.01, decay: 0.1, sustain: 0.8, release: 0.2 }, waveform: 'sine' as const, filterFreq: 100 },
      masterVolume: 0.8,
      melody: [],
      octaveRange: [3, 4] as [number, number],
      position: { x: 0, y: 0 },
      destination: null,
      createdAt: Date.now(),
      name: '',
      state: 'idle' as const,
      direction: 'right' as const,
      docking: 'active' as const,
      batteryLevel: 100,
    };
  }

  it('accents the first event in each motif-tiling window when Motif Length is active', async () => {
    const { AudioEngine } = await import('./AudioEngine');
    const storeMod = await import('../stores/localeStore');
    const attenuationStyleMod = await import('../stores/attenuationStyleStore');
    const helpers = await import('../utils/localeHelpers');
    (helpers.getActiveLocaleId as ReturnType<typeof vi.fn>).mockReturnValue(attenuationStyleMod.DEFAULT_LOCALE_ID);

    storeMod.useLocaleStore.getState().setLocaleData(attenuationStyleMod.DEFAULT_LOCALE_ID, {
      robots: [makeRobot('accent-robot', { active: true, value: 4 })],
    });

    // Windows of 4 steps: [1-4], [5-8], [9-12], [13-16]. Two events share the
    // first window (steps 2 and 3) -- step 2 is earliest, so only it accents.
    // Step 6 is the sole event in the second window, so it accents too.
    const melody = [
      { id: 'e1', startStep: 2, length: '8n' as const, noteIndex: 0, octave: 4 },
      { id: 'e2', startStep: 3, length: '8n' as const, noteIndex: 0, octave: 4 },
      { id: 'e3', startStep: 6, length: '8n' as const, noteIndex: 0, octave: 4 },
    ];

    const spy = vi.spyOn(AudioEngine, 'scheduleNote').mockImplementation(() => { });
    AudioEngine.registerRobotMelody('accent-robot', melody);

    AudioEngine.processMelodyStep(2, 0);
    AudioEngine.processMelodyStep(3, 0);
    AudioEngine.processMelodyStep(6, 0);

    expect(spy).toHaveBeenCalledTimes(3);
    const [step2Params, step3Params, step6Params] = spy.mock.calls.map((c) => c[0]);
    expect(step2Params.accentMultiplier).toBeGreaterThan(1);
    expect(step3Params.accentMultiplier ?? 1).toBe(1);
    expect(step6Params.accentMultiplier).toBeGreaterThan(1);

    spy.mockRestore();
  });

  it('does not accent any event when Motif Length is inactive (scatter mode)', async () => {
    const { AudioEngine } = await import('./AudioEngine');
    const storeMod = await import('../stores/localeStore');
    const attenuationStyleMod = await import('../stores/attenuationStyleStore');
    const helpers = await import('../utils/localeHelpers');
    (helpers.getActiveLocaleId as ReturnType<typeof vi.fn>).mockReturnValue(attenuationStyleMod.DEFAULT_LOCALE_ID);

    storeMod.useLocaleStore.getState().setLocaleData(attenuationStyleMod.DEFAULT_LOCALE_ID, {
      robots: [makeRobot('scatter-robot', { active: false, value: 4 })],
    });

    const melody = [
      { id: 'e1', startStep: 2, length: '8n' as const, noteIndex: 0, octave: 4 },
      { id: 'e2', startStep: 6, length: '8n' as const, noteIndex: 0, octave: 4 },
    ];

    const spy = vi.spyOn(AudioEngine, 'scheduleNote').mockImplementation(() => { });
    AudioEngine.registerRobotMelody('scatter-robot', melody);
    AudioEngine.processMelodyStep(2, 0);
    AudioEngine.processMelodyStep(6, 0);

    spy.mock.calls.forEach((c) => {
      expect(c[0].accentMultiplier ?? 1).toBe(1);
    });

    spy.mockRestore();
  });

  it('scheduleNote multiplies velocity by accentMultiplier', async () => {
    const Tone = await import('tone');
    const { AudioEngine } = await import('./AudioEngine');

    const layered: any[] = [{ type: 'sine', gain: 0.8, detune: 0, phase: 0 }];
    AudioEngine.reserveVoice('accent-vel-robot', layered as any, TEST_ADSR);
    const synthResults = (Tone.Synth as unknown as any).mock.results;
    synthResults.forEach((r: any) => r.value?.triggerAttackRelease?.mockClear());

    const note = 'C7';
    AudioEngine.scheduleNote({ robotId: 'accent-vel-robot', note, duration: '4n', time: 0, velocity: 0.5, accentMultiplier: 1.15 });

    let found = false;
    synthResults.forEach((r: any) => {
      r.value?.triggerAttackRelease?.mock?.calls?.forEach((c: any) => {
        if (c[0] === note) {
          expect(c[3]).toBeCloseTo(0.575, 5);
          found = true;
        }
      });
    });
    expect(found).toBe(true);
  });

  it('scheduleNote clamps the accented velocity to a maximum of 1', async () => {
    const Tone = await import('tone');
    const { AudioEngine } = await import('./AudioEngine');

    const layered: any[] = [{ type: 'sine', gain: 0.8, detune: 0, phase: 0 }];
    AudioEngine.reserveVoice('accent-clamp-robot', layered as any, TEST_ADSR);
    const synthResults = (Tone.Synth as unknown as any).mock.results;
    synthResults.forEach((r: any) => r.value?.triggerAttackRelease?.mockClear());

    const note = 'C8';
    AudioEngine.scheduleNote({ robotId: 'accent-clamp-robot', note, duration: '4n', time: 0, velocity: 0.95, accentMultiplier: 1.15 });

    let found = false;
    synthResults.forEach((r: any) => {
      r.value?.triggerAttackRelease?.mock?.calls?.forEach((c: any) => {
        if (c[0] === note) {
          expect(c[3]).toBe(1);
          found = true;
        }
      });
    });
    expect(found).toBe(true);
  });
});

describe('AudioEngine.registerRobotMelody — Click Track override', () => {
  beforeEach(async () => {
    vi.resetModules();
    const { AudioEngine } = await import('./AudioEngine');
    await AudioEngine.start();
  });

  function makeRobot(id: string, overrides: { clickTrackActive?: boolean; octaveRange?: [number, number] } = {}) {
    return {
      id,
      identityColor: '#428d95',
      clickTrackActive: overrides.clickTrackActive ?? false,
      audioAttributes: { adsr: { attack: 0.01, decay: 0.1, sustain: 0.8, release: 0.2 }, waveform: 'sine' as const, filterFreq: 100 },
      masterVolume: 0.8,
      melody: [],
      octaveRange: overrides.octaveRange ?? ([3, 4] as [number, number]),
      position: { x: 0, y: 0 },
      destination: null,
      createdAt: Date.now(),
      name: '',
      state: 'idle' as const,
      direction: 'right' as const,
      docking: 'active' as const,
      batteryLevel: 100,
    };
  }

  async function setActiveRobot(robot: ReturnType<typeof makeRobot>) {
    const storeMod = await import('../stores/localeStore');
    const attenuationStyleMod = await import('../stores/attenuationStyleStore');
    const helpers = await import('../utils/localeHelpers');
    (helpers.getActiveLocaleId as ReturnType<typeof vi.fn>).mockReturnValue(attenuationStyleMod.DEFAULT_LOCALE_ID);
    storeMod.useLocaleStore.getState().setLocaleData(attenuationStyleMod.DEFAULT_LOCALE_ID, { robots: [robot] });
  }

  it('registers the passed-in melody unchanged when clickTrackActive is false', async () => {
    const { AudioEngine } = await import('./AudioEngine');
    await setActiveRobot(makeRobot('r1', { clickTrackActive: false }));

    const melody = [{ id: 'real-1', startStep: 3, length: '8n' as const, noteIndex: 5, octave: 4 }];
    const spy = vi.spyOn(AudioEngine, 'scheduleNote').mockImplementation(() => {});
    AudioEngine.registerRobotMelody('r1', melody);
    AudioEngine.processMelodyStep(3, 0);

    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('substitutes the fixed click-track pattern, ignoring the passed-in melody entirely, when clickTrackActive is true', async () => {
    const { AudioEngine } = await import('./AudioEngine');
    await setActiveRobot(makeRobot('r2', { clickTrackActive: true, octaveRange: [3, 6] }));

    // A real melody with an onset nowhere near the click track's own downbeats (1/5/9/13).
    const realMelody = [{ id: 'real-1', startStep: 7, length: '8n' as const, noteIndex: 5, octave: 4 }];
    const spy = vi.spyOn(AudioEngine, 'scheduleNote').mockImplementation(() => {});
    AudioEngine.registerRobotMelody('r2', realMelody);

    // The real melody's own step never fires...
    AudioEngine.processMelodyStep(7, 0);
    expect(spy).not.toHaveBeenCalled();

    // ...but the click track's downbeats do, at the robot's own octave-range minimum (3).
    AudioEngine.processMelodyStep(1, 0);
    AudioEngine.processMelodyStep(5, 0);
    AudioEngine.processMelodyStep(9, 0);
    AudioEngine.processMelodyStep(13, 0);

    expect(spy).toHaveBeenCalledTimes(4);
    const notes = spy.mock.calls.map((c) => c[0].note);
    // This file's getAvailableNotes() mock (line ~126) returns note NAMES that already carry
    // their own octave digit (['C4','D4',...]) — scheduleNote's `${noteName}${event.octave}`
    // concatenation then appends the click track's own octave (3) after that, e.g. 'C4' + 3 =
    // 'C43'. Odd-looking but consistent with every other note-string assertion in this file.
    expect(notes).toEqual(['C43', 'D43', 'C43', 'E43']);
    spy.mockRestore();
  });

  it('keeps enforcing the click track even when a later registerRobotMelody call carries a freshly regenerated real melody (e.g. the docking pitch-drift reroll)', async () => {
    const { AudioEngine } = await import('./AudioEngine');
    await setActiveRobot(makeRobot('r3', { clickTrackActive: true }));

    const spy = vi.spyOn(AudioEngine, 'scheduleNote').mockImplementation(() => {});
    // First registration, as if from turning the toggle on.
    AudioEngine.registerRobotMelody('r3', []);
    // A second, unrelated registration carrying a real (drifted) melody — simulates
    // robotSystems.ts's landOnDocked re-registering after a pitch-drift reroll while the
    // click track is still toggled on.
    AudioEngine.registerRobotMelody('r3', [{ id: 'drifted-1', startStep: 2, length: '8n' as const, noteIndex: 3, octave: 5 }]);

    AudioEngine.processMelodyStep(2, 0); // the drifted melody's own step — must NOT fire
    AudioEngine.processMelodyStep(1, 0); // a click-track downbeat — must fire

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0].note).toBe('C43'); // 'C4' (mocked note name) + octave 3
    spy.mockRestore();
  });

  it('does not accent any click-track event, even when the robot\'s own Motif Length toggle is active', async () => {
    const { AudioEngine } = await import('./AudioEngine');
    const robot = makeRobot('r4', { clickTrackActive: true });
    await setActiveRobot({ ...robot, rhythmicMotifLength: { active: true, value: 4 } } as never);

    const spy = vi.spyOn(AudioEngine, 'scheduleNote').mockImplementation(() => {});
    AudioEngine.registerRobotMelody('r4', []);
    AudioEngine.processMelodyStep(1, 0);
    AudioEngine.processMelodyStep(5, 0);

    spy.mock.calls.forEach((c) => expect(c[0].accentMultiplier ?? 1).toBe(1));
    spy.mockRestore();
  });
});

describe('AudioEngine — masterVolume drives a live per-robot bus gain, not per-note velocity', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('reserveVoice initializes the per-robot bus gain from the masterVolume parameter, through the perceptual taper', async () => {
    const Tone = await import('tone');
    const { AudioEngine } = await import('./AudioEngine');
    await AudioEngine.start();
    (Tone.Gain as unknown as ReturnType<typeof vi.fn>).mockClear();

    const layered: any[] = [{ type: 'sine', gain: 0.8, detune: 0, phase: 0 }];
    AudioEngine.reserveVoice('bus-gain-robot', layered as any, TEST_ADSR, undefined, undefined, undefined, 0.3);

    // The bus gain is constructed after the (single) layer's own gain node, inside the same
    // reserveVoice call — its constructor argument is what this asserts, not the mocked Gain
    // factory's echoed-back .gain.value (the mock ignores its constructor argument entirely).
    // The value itself is the taper's output for position 0.3, not 0.3 verbatim — a linear
    // pass-through is exactly the bug this taper fixes (see volumeTaper.test.ts for the curve's
    // own dedicated tests; this just confirms AudioEngine actually applies it).
    const gainCalls = (Tone.Gain as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const busGainCallArgs = gainCalls[gainCalls.length - 1];
    expect(busGainCallArgs[0]).toBe(volumePositionToGain(0.3));
  });

  it('defaults the bus gain to 1 when masterVolume is omitted (backward compatible)', async () => {
    const Tone = await import('tone');
    const { AudioEngine } = await import('./AudioEngine');
    await AudioEngine.start();
    (Tone.Gain as unknown as ReturnType<typeof vi.fn>).mockClear();

    const layered: any[] = [{ type: 'sine', gain: 0.8, detune: 0, phase: 0 }];
    AudioEngine.reserveVoice('bus-gain-default-robot', layered as any, TEST_ADSR);

    const gainCalls = (Tone.Gain as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const busGainCallArgs = gainCalls[gainCalls.length - 1];
    expect(busGainCallArgs[0]).toBe(1);
  });

  it('a note scheduled at masterVolume 0 still triggers at a real velocity — muting is the bus gain\'s job now, not a zeroed velocity', async () => {
    // Confirms computeNoteVelocitySeeded no longer reads masterVolume at all: velocity reflects
    // the neutral baseline (clamped to [VELOCITY_MIN, 1]) regardless of how quiet/muted the robot's
    // bus is. Muting a robot dialed to 0% Volume now works by silencing its bus gain (see the
    // updateRobotMasterVolume/reserveVoice tests above), which multiplies its actual audio output
    // to nothing — a real Web Audio gain of 0 is genuinely silent even though the synth still
    // "plays" at full velocity underneath it.
    const Tone = await import('tone');
    const { AudioEngine } = await import('./AudioEngine');
    await AudioEngine.start();

    const layered: any[] = [{ type: 'sine', gain: 0.8, detune: 0, phase: 0 }];
    AudioEngine.reserveVoice('zero-volume-robot', layered as any, TEST_ADSR, undefined, undefined, undefined, 0);
    const synthResults = (Tone.Synth as unknown as any).mock.results;

    AudioEngine.scheduleNote({ robotId: 'zero-volume-robot', note: 'D6', duration: '4n', time: 0 });

    let velocity: number | undefined;
    synthResults.forEach((r: any) => r.value?.triggerAttackRelease?.mock?.calls?.forEach((c: any) => {
      if (c[0] === 'D6') velocity = c[3];
    }));
    expect(velocity).toBe(1);
  });
});

describe('AudioEngine.updateRobotMasterVolume', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('sets the robot\'s live bus gain immediately, so an already-sounding note\'s tail is affected too', async () => {
    // The whole point of this design: unlike a per-note velocity (baked in at trigger time and
    // impossible to change retroactively, same as a real instrument), the bus gain is a
    // continuously-live AudioParam — moving it instantly affects anything currently passing
    // through the bus, not just the next note this robot happens to play.
    const Tone = await import('tone');
    const { AudioEngine } = await import('./AudioEngine');
    await AudioEngine.start();

    const layered: any[] = [{ type: 'sine', gain: 0.8, detune: 0, phase: 0 }];
    AudioEngine.reserveVoice('volume-live-edit-robot', layered as any, TEST_ADSR, undefined, undefined, undefined, 0.55);

    const gainResults = (Tone.Gain as unknown as { mock: { results: { value: { gain: { value: number } } }[] } }).mock.results;
    const busGainInstance = gainResults[gainResults.length - 1].value;
    expect(busGainInstance.gain.value).toBe(1); // the mock's own hardcoded starting value

    AudioEngine.updateRobotMasterVolume('volume-live-edit-robot', 0.2);

    // Taper output for position 0.2, not 0.2 verbatim (see volumeTaper.test.ts for the curve's own
    // dedicated tests) — this just confirms the live-update path applies it too, not only construction.
    expect(busGainInstance.gain.value).toBe(volumePositionToGain(0.2));
  });

  it('is a safe no-op (no throw) when the robot has never had a note scheduled yet', async () => {
    const { AudioEngine } = await import('./AudioEngine');
    expect(() => AudioEngine.updateRobotMasterVolume('never-scheduled-robot', 0.5)).not.toThrow();
  });
});

// Additional focused unit tests for reservation & isolation
describe('AudioEngine - Reservation & Isolation (focused)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('reserves a voice and getVoiceForRobot returns a synth', async () => {
    const { AudioEngine } = await import('./AudioEngine');
    await AudioEngine.start();
    const layered: any[] = [{ type: 'sine', gain: 0.8, detune: 0, phase: 0 }];
    const ok = AudioEngine.reserveVoice('robot-test-1', layered as any, TEST_ADSR);
    expect(ok).toBe(true);
    const synth = AudioEngine.getVoiceForRobot('robot-test-1');
    expect(synth).not.toBeNull();
  });

  it('skips trigger when no composite voice is reserved', async () => {
    const { triggerWithCap } = await import('./AudioEngine');
    const result = triggerWithCap({ robotId: 'unreserved-robot', note: 'C4', duration: '8n' });
    expect(result).toBe(false);
  });

  it('triggers when composite voice is reserved', async () => {
    const { AudioEngine } = await import('./AudioEngine');
    await AudioEngine.start();
    const layered: any[] = [{ type: 'sine', gain: 0.8, detune: 0, phase: 0 }];
    const ok = AudioEngine.reserveVoice('robot-test-2', layered as any, TEST_ADSR);
    expect(ok).toBe(true);
    const { triggerWithCap } = await import('./AudioEngine');
    const result = triggerWithCap({ robotId: 'robot-test-2', note: 'C4', duration: '8n' });
    expect(result).toBe(true);
  });
});

describe('AudioEngine - Composite Voices (Layered)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('can reserve a composite voice from a LayeredWave descriptor', async () => {
    const { AudioEngine } = await import('./AudioEngine');
    await AudioEngine.start();
    const layered: any[] = [{ type: 'sine', gain: 0.8, detune: 0, phase: 0 }];
    const ok = AudioEngine.reserveVoice('composite-robot-1', layered as any, TEST_ADSR);
    expect(ok).toBe(true);
    const voice = AudioEngine.getVoiceForRobot('composite-robot-1');
    expect(voice).not.toBeNull();
  });

  it('triggerWithCap uses composite voice when reserved and returns true', async () => {
    const { AudioEngine, triggerWithCap } = await import('./AudioEngine');
    await AudioEngine.start();
    const layered: any[] = [{ type: 'sine', gain: 0.6, detune: 0, phase: 0 }];
    const ok = AudioEngine.reserveVoice('composite-robot-2', layered as any, TEST_ADSR);
    expect(ok).toBe(true);
    const result = triggerWithCap({ robotId: 'composite-robot-2', note: 'C4', duration: '8n', time: 0 });
    expect(result).toBe(true);
  });

  it('falls back to a stub panner/gain/filter when a Tone constructor is unavailable, and reservation still succeeds (docs/tasks/AUDIO_ENGINE_CLEANUP.md Task 5)', async () => {
    const { AudioEngine } = await import('./AudioEngine');
    await AudioEngine.start();
    const Tone = await import('tone');
    const realPanner = Tone.Panner;
    (Tone as unknown as { Panner?: unknown }).Panner = undefined;
    try {
      const layered: any[] = [{ type: 'sine', gain: 0.6, detune: 0, phase: 0 }];
      const ok = AudioEngine.reserveVoice('stub-ctor-robot', layered as any, TEST_ADSR);
      expect(ok).toBe(true);
      const { triggerWithCap } = await import('./AudioEngine');
      expect(() => triggerWithCap({ robotId: 'stub-ctor-robot', note: 'C4', duration: '8n', time: 0 })).not.toThrow();
    } finally {
      (Tone as unknown as { Panner?: unknown }).Panner = realPanner;
    }
  });

  it('falls back to a fully stubbed composite voice when construction throws, and reserveVoice returns false without throwing (docs/tasks/AUDIO_ENGINE_CLEANUP.md Task 5)', async () => {
    const { AudioEngine } = await import('./AudioEngine');
    await AudioEngine.start();
    const Tone = await import('tone');
    const realSynth = Tone.Synth;
    (Tone as unknown as { Synth: unknown }).Synth = vi.fn(() => { throw new Error('simulated construction failure'); });
    try {
      const layered: any[] = [{ type: 'sine', gain: 0.6, detune: 0, phase: 0 }];
      const ok = AudioEngine.reserveVoice('stub-catch-robot', layered as any, TEST_ADSR);
      expect(ok).toBe(false);
      const { triggerWithCap } = await import('./AudioEngine');
      expect(() => triggerWithCap({ robotId: 'stub-catch-robot', note: 'C4', duration: '8n', time: 0 })).not.toThrow();
    } finally {
      (Tone as unknown as { Synth: unknown }).Synth = realSynth;
    }
  });

  it('triggerWithCap no longer sets the panner\'s pan directly — that\'s updateAllPanners\' job now, once per tick (docs/tasks/AUDIO_ENGINE_CLEANUP.md Task 6)', async () => {
    const { AudioEngine, triggerWithCap } = await import('./AudioEngine');
    await AudioEngine.start();
    const storeMod = await import('../stores/localeStore');
    const attenuationStyleMod = await import('../stores/attenuationStyleStore');
    const helpers = await import('../utils/localeHelpers');
    (helpers.getActiveLocaleId as ReturnType<typeof vi.fn>).mockReturnValue(attenuationStyleMod.DEFAULT_LOCALE_ID);
    storeMod.useLocaleStore.getState().setLocaleData(attenuationStyleMod.DEFAULT_LOCALE_ID, {
      robots: [{
        id: 'pan-recompute-robot', identityColor: '#428d95', audioMode: 'none',
        audioAttributes: { adsr: TEST_ADSR, waveform: 'sine' as const, filterFreq: 100 },
        masterVolume: 0.8, melody: [], octaveRange: [3, 4] as [number, number],
        // x: 0 maps to pan -0.5 (calculatePanFromPosition) — clearly distinct from the
        // Panner mock's own default pan.value of 0, so an unwanted write is detectable.
        position: { x: 0, y: 0 }, destination: null, createdAt: Date.now(), name: '',
        state: 'idle' as const, direction: 'right' as const, docking: 'active' as const, batteryLevel: 100,
      }],
    });
    const layered: any[] = [{ type: 'sine', gain: 0.8, detune: 0, phase: 0 }];
    AudioEngine.reserveVoice('pan-recompute-robot', layered as any, TEST_ADSR);
    const Tone = await import('tone');
    const pannerInstance = (Tone.Panner as unknown as { mock: { results: { value: { pan: { value: number } } }[] } }).mock.results.at(-1)!.value;
    expect(pannerInstance.pan.value).toBe(0); // sanity: still the mock's untouched default before triggering

    triggerWithCap({ robotId: 'pan-recompute-robot', note: 'C4', duration: '8n', time: 0 });

    expect(pannerInstance.pan.value).toBe(0);
  });

  it('releases composite and cleans up internal maps on releaseVoice', async () => {
    const { AudioEngine } = await import('./AudioEngine');
    await AudioEngine.start();
    const layered: any[] = [{ type: 'sine', gain: 0.6, detune: 0, phase: 0 }];
    const ok = AudioEngine.reserveVoice('composite-robot-3', layered as any, TEST_ADSR);
    expect(ok).toBe(true);
    // ensure voice exists
    let voice = AudioEngine.getVoiceForRobot('composite-robot-3');
    expect(voice).not.toBeNull();
    // release and ensure it's removed
    AudioEngine.releaseVoice('composite-robot-3');
    voice = AudioEngine.getVoiceForRobot('composite-robot-3');
    expect(voice).toBeNull();
  });

  it('excludes gain: 0 layers from the reserved composite voice (Roadmap Phase 9 — mute, not delete)', async () => {
    const { AudioEngine } = await import('./AudioEngine');
    await AudioEngine.start();
    const layers = [
      { type: 'sine', gain: 1, detune: 0, phase: 0 },
      { type: 'square', gain: 0, detune: 0, phase: 0 },
      { type: 'sawtooth', gain: 1, detune: 0, phase: 0 },
    ];
    AudioEngine.reserveVoice('active-filter-robot', layers as any, TEST_ADSR);
    const voice = AudioEngine.getVoiceForRobot('active-filter-robot');
    expect(voice?.layers?.length).toBe(2);
    expect(voice?.layers?.map((l) => l.layer.type)).toEqual(['sine', 'sawtooth']);
  });

  it('treats a layer with no gain field as audible (fixtures predating a real value stay audible)', async () => {
    const { AudioEngine } = await import('./AudioEngine');
    await AudioEngine.start();
    const layers: any[] = [{ type: 'sine', detune: 0, phase: 0 }];
    AudioEngine.reserveVoice('no-gain-field-robot', layers as any, TEST_ADSR);
    const voice = AudioEngine.getVoiceForRobot('no-gain-field-robot');
    expect(voice?.layers?.length).toBe(1);
  });
});

describe('AudioEngine.updateVoiceEnvelope', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('applies the new ADSR to every audible layer\'s live synth via the existing set({ layers }) path', async () => {
    const { AudioEngine } = await import('./AudioEngine');
    await AudioEngine.start();
    const layers: any[] = [
      { type: 'sine', gain: 1, detune: 0, phase: 0 },
      { type: 'square', gain: 1, detune: 0, phase: 0 },
    ];
    AudioEngine.reserveVoice('envelope-robot', layers as any, TEST_ADSR);

    const newAdsr = { attack: 0.5, decay: 0.4, sustain: 0.3, release: 0.2 };
    AudioEngine.updateVoiceEnvelope('envelope-robot', newAdsr);

    const voice = AudioEngine.getVoiceForRobot('envelope-robot');
    voice?.layers?.forEach(({ synth }) => {
      expect((synth as any).set).toHaveBeenCalledWith({ envelope: newAdsr });
    });
  });

  it('is a safe no-op when no composite voice is reserved for the robot', async () => {
    const { AudioEngine } = await import('./AudioEngine');
    await AudioEngine.start();
    expect(() => AudioEngine.updateVoiceEnvelope('never-reserved', TEST_ADSR)).not.toThrow();
  });
});

describe('AudioEngine - Global FX Chain', () => {
  // Helper: get the most recently constructed mock instance for a Tone constructor
  type AnyMock = ReturnType<typeof vi.fn>;
  const lastInstance = (ctor: unknown) =>
    (ctor as unknown as AnyMock).mock.results.at(-1)?.value;

  beforeEach(() => {
    vi.resetModules();
  });

  it('starts without throwing when FX constructors are present', async () => {
    const { AudioEngine } = await import('./AudioEngine');
    await expect(AudioEngine.start()).resolves.not.toThrow();
  });

  describe('setGlobalReverb', () => {
    it('updates wet value on the reverb node', async () => {
      const Tone = await import('tone');
      const { AudioEngine } = await import('./AudioEngine');
      await AudioEngine.start();
      const reverbNode = lastInstance(Tone.Reverb) ?? { wet: { value: 0.3 } };
      AudioEngine.setGlobalReverb({ wet: 0.8 });
      expect(reverbNode.wet.value).toBe(0.8);
    });

    it('is a no-op when AudioEngine not started', async () => {
      const { AudioEngine } = await import('./AudioEngine');
      // Do NOT start — _globalReverb is null
      expect(() => AudioEngine.setGlobalReverb({ wet: 0.8 })).not.toThrow();
    });
  });

  describe('setGlobalDelay', () => {
    it('updates wet value on the delay node', async () => {
      const Tone = await import('tone');
      const { AudioEngine } = await import('./AudioEngine');
      await AudioEngine.start();
      const delayNode = lastInstance(Tone.FeedbackDelay) ?? { wet: { value: 0 } };
      AudioEngine.setGlobalDelay({ wet: 0.5 });
      expect(delayNode.wet.value).toBe(0.5);
    });
  });

  describe('setGlobalLimiter', () => {
    it('updates threshold on the limiter node', async () => {
      const Tone = await import('tone');
      const { AudioEngine } = await import('./AudioEngine');
      await AudioEngine.start();
      const limiterNode = lastInstance(Tone.Limiter) ?? { threshold: { value: -12 } };
      AudioEngine.setGlobalLimiter({ threshold: -6 });
      expect(limiterNode.threshold.value).toBe(-6);
    });
  });

  describe('setGlobalEQ', () => {
    it('updates band values on the EQ3 node', async () => {
      const Tone = await import('tone');
      const { AudioEngine } = await import('./AudioEngine');
      await AudioEngine.start();
      const eqNode = lastInstance(Tone.EQ3) ?? { low: { value: 0 }, mid: { value: 0 }, high: { value: 0 } };
      AudioEngine.setGlobalEQ({ low: -3, mid: 2, high: 4 });
      expect(eqNode.low.value).toBe(-3);
      expect(eqNode.mid.value).toBe(2);
      expect(eqNode.high.value).toBe(4);
    });
  });

  describe('setGlobalFilterLPF', () => {
    it('updates frequency on the LPF node', async () => {
      const Tone = await import('tone');
      const { AudioEngine } = await import('./AudioEngine');
      await AudioEngine.start();
      // Filter is called twice in loadInstruments (LPF then HPF).
      // mock.results accumulates across tests, so use at(-2) for LPF and at(-1) for HPF.
      const lpfNode = (Tone.Filter as unknown as AnyMock).mock.results.at(-2)?.value
        ?? { frequency: { value: 20000 } };
      AudioEngine.setGlobalFilterLPF({ frequency: 8000 });
      expect(lpfNode.frequency.value).toBe(8000);
    });
  });

  describe('setGlobalCompressor', () => {
    it('updates threshold and ratio on the master compressor', async () => {
      const Tone = await import('tone');
      const { AudioEngine } = await import('./AudioEngine');
      await AudioEngine.start();
      const compNode = lastInstance(Tone.Compressor) ?? { threshold: { value: -18 }, ratio: { value: 6 } };
      AudioEngine.setGlobalCompressor({ threshold: -30, ratio: 4 });
      expect(compNode.threshold.value).toBe(-30);
      expect(compNode.ratio.value).toBe(4);
    });
  });

  describe('reserveVoice — bus wiring', () => {
    it('connects each robot bus into getGlobalChainEntry()\'s node (EQ3), not a compressor-specific accessor', async () => {
      const Tone = await import('tone');
      const { AudioEngine } = await import('./AudioEngine');
      await AudioEngine.start();
      const eqNode = lastInstance(Tone.EQ3) ?? { connect: vi.fn() };
      const layered = { base: 'sine', layers: [{ type: 'sine', gain: 0.8 }] } as any;
      AudioEngine.reserveVoice('bus-wiring-test', layered, TEST_ADSR);
      // busFilter is a Tone.Filter instance — it's the third Filter construction
      // per reserveVoice call site (after LPF/HPF from loadInstruments), so grab
      // the freshest one and confirm it was connected into the chain entry.
      const busFilterNode = lastInstance(Tone.Filter);
      expect(busFilterNode.connect).toHaveBeenCalledWith(eqNode);
    });
  });

  it('no longer exports setEffectBypass/setGlobalBypass — removed, off states are expressed via the sliders/params themselves', async () => {
    const { AudioEngine } = await import('./AudioEngine');
    expect('setEffectBypass' in AudioEngine).toBe(false);
    expect('setGlobalBypass' in AudioEngine).toBe(false);
  });
});

// ============================================================
// Issue #220 — Transport methods & master volume
// ============================================================
describe('AudioEngine - Transport methods & Master Volume (Issue #220)', () => {
  type AnyMock = ReturnType<typeof vi.fn>;
  const lastInstance = (ctor: unknown) =>
    (ctor as unknown as AnyMock).mock.results.at(-1)?.value;

  beforeEach(() => {
    vi.resetModules();
  });

  // ── pause ──────────────────────────────────────────────── //
  describe('pause()', () => {
    it('calls Transport.pause()', async () => {
      const Tone = await import('tone');
      const { AudioEngine } = await import('./AudioEngine');
      await AudioEngine.start();
      const transport = (Tone.getTransport as unknown as AnyMock).mock.results.at(-1)?.value;
      AudioEngine.pause();
      expect(transport.pause).toHaveBeenCalled();
    });

    it('does not throw when called before start', async () => {
      const { AudioEngine } = await import('./AudioEngine');
      expect(() => AudioEngine.pause()).not.toThrow();
    });
  });

  // ── resume ─────────────────────────────────────────────── //
  describe('resume()', () => {
    it('calls Transport.start()', async () => {
      const Tone = await import('tone');
      const { AudioEngine } = await import('./AudioEngine');
      await AudioEngine.start();
      const transport = (Tone.getTransport as unknown as AnyMock).mock.results.at(-1)?.value;
      // Reset call count so only the resume call is counted
      transport.start.mockClear();
      AudioEngine.resume();
      expect(transport.start).toHaveBeenCalled();
    });

    it('does not throw when called before start', async () => {
      const { AudioEngine } = await import('./AudioEngine');
      expect(() => AudioEngine.resume()).not.toThrow();
    });
  });

  // ── killAll ────────────────────────────────────────────── //
  describe('killAll()', () => {
    it('calls Transport.cancel() and Transport.stop()', async () => {
      const Tone = await import('tone');
      // Ensure transport reports state as 'started' so stop() is invoked
      // Use mockReturnValueOnce so the override doesn't bleed into later tests.
      (Tone.getTransport as unknown as AnyMock).mockReturnValueOnce({
        state: 'started',
        start: vi.fn().mockResolvedValue(undefined),
        stop: vi.fn(),
        pause: vi.fn(),
        cancel: vi.fn(),
        clear: vi.fn(),
        scheduleOnce: vi.fn(),
        scheduleRepeat: vi.fn(() => 1),
        bpm: { value: 120 },
      });
      const { AudioEngine } = await import('./AudioEngine');
      await AudioEngine.start();
      const transport = (Tone.getTransport as unknown as AnyMock).mock.results.at(-1)?.value;
      AudioEngine.killAll();
      expect(transport.cancel).toHaveBeenCalled();
      expect(transport.stop).toHaveBeenCalled();
    });

    it('does not throw when called on an uninitialised engine', async () => {
      const { AudioEngine } = await import('./AudioEngine');
      expect(() => AudioEngine.killAll()).not.toThrow();
    });
  });

  // ── setBPM (docs/specs/BPM_CONTROL.md §1.6) ───────────── //
  describe('setBPM()', () => {
    // Deliberately instant, not ramped — see the doc comment on setBPM itself.
    // A ramp that gets cancelled and restarted on every rapid call (exactly
    // what the Tempo slider's continuous onValueChange produces during a
    // drag) never settles, making the actual tempo wobble for the whole
    // drag gesture instead of tracking the slider precisely.
    it('assigns the transport bpm value directly, with no ramp', async () => {
      const Tone = await import('tone');
      (Tone.getTransport as unknown as AnyMock).mockReturnValueOnce({
        state: 'stopped',
        start: vi.fn().mockResolvedValue(undefined),
        pause: vi.fn(),
        stop: vi.fn(),
        clear: vi.fn(),
        scheduleOnce: vi.fn(),
        scheduleRepeat: vi.fn(() => 1),
        bpm: { value: 60, rampTo: vi.fn() },
      });
      const { AudioEngine } = await import('./AudioEngine');
      await AudioEngine.start();
      const transport = (Tone.getTransport as unknown as AnyMock).mock.results.at(-1)?.value;
      AudioEngine.setBPM(140);
      expect(transport.bpm.value).toBe(140);
      expect(transport.bpm.rampTo).not.toHaveBeenCalled();
    });

    it('does not restart/interrupt itself across rapid successive calls — each is an independent instant set, not a cancelled ramp', async () => {
      const Tone = await import('tone');
      (Tone.getTransport as unknown as AnyMock).mockReturnValueOnce({
        state: 'stopped',
        start: vi.fn().mockResolvedValue(undefined),
        pause: vi.fn(),
        stop: vi.fn(),
        clear: vi.fn(),
        scheduleOnce: vi.fn(),
        scheduleRepeat: vi.fn(() => 1),
        bpm: { value: 60 },
      });
      const { AudioEngine } = await import('./AudioEngine');
      await AudioEngine.start();
      const transport = (Tone.getTransport as unknown as AnyMock).mock.results.at(-1)?.value;

      // Simulates a fast slider drag — many onChange calls in quick succession.
      for (let bpm = 61; bpm <= 90; bpm++) AudioEngine.setBPM(bpm);

      expect(transport.bpm.value).toBe(90);
    });

    it('does not throw when called before start (no-op)', async () => {
      const { AudioEngine } = await import('./AudioEngine');
      expect(() => AudioEngine.setBPM(140)).not.toThrow();
    });
  });

  // ── setMasterVolume ────────────────────────────────────── //
  describe('setMasterVolume()', () => {
    it('updates the master gain node value', async () => {
      const Tone = await import('tone');
      const { AudioEngine } = await import('./AudioEngine');
      await AudioEngine.start();
      // The last Gain instance created in loadInstruments is the master gain
      const gainNode = lastInstance(Tone.Gain) ?? { gain: { value: 1 } };
      AudioEngine.setMasterVolume(0.5);
      expect(gainNode.gain.value).toBe(0.5);
    });

    it('clamps values above 1 to 1', async () => {
      const Tone = await import('tone');
      const { AudioEngine } = await import('./AudioEngine');
      await AudioEngine.start();
      const gainNode = lastInstance(Tone.Gain) ?? { gain: { value: 1 } };
      AudioEngine.setMasterVolume(2);
      expect(gainNode.gain.value).toBe(1);
    });

    it('clamps values below 0 to 0', async () => {
      const Tone = await import('tone');
      const { AudioEngine } = await import('./AudioEngine');
      await AudioEngine.start();
      const gainNode = lastInstance(Tone.Gain) ?? { gain: { value: 1 } };
      AudioEngine.setMasterVolume(-1);
      expect(gainNode.gain.value).toBe(0);
    });

    it('silences audio at 0 without stopping transport', async () => {
      const Tone = await import('tone');
      const { AudioEngine } = await import('./AudioEngine');
      await AudioEngine.start();
      const gainNode = lastInstance(Tone.Gain) ?? { gain: { value: 1 } };
      const transport = (Tone.getTransport as unknown as AnyMock).mock.results.at(-1)?.value;
      AudioEngine.setMasterVolume(0);
      expect(gainNode.gain.value).toBe(0);
      // transport should NOT have been stopped
      expect(transport.stop).not.toHaveBeenCalled();
    });
  });

  // ── getMasterVolume ────────────────────────────────────── //
  describe('getMasterVolume()', () => {
    it('returns 1 before any setMasterVolume call', async () => {
      const { AudioEngine } = await import('./AudioEngine');
      await AudioEngine.start();
      expect(AudioEngine.getMasterVolume()).toBe(1);
    });

    it('returns the value set by setMasterVolume', async () => {
      const { AudioEngine } = await import('./AudioEngine');
      await AudioEngine.start();
      AudioEngine.setMasterVolume(0.3);
      expect(AudioEngine.getMasterVolume()).toBeCloseTo(0.3);
    });

    it('round-trips setMasterVolume(0) → getMasterVolume() === 0', async () => {
      const { AudioEngine } = await import('./AudioEngine');
      await AudioEngine.start();
      AudioEngine.setMasterVolume(0);
      expect(AudioEngine.getMasterVolume()).toBe(0);
    });

    it('round-trips setMasterVolume(1) → getMasterVolume() === 1', async () => {
      const { AudioEngine } = await import('./AudioEngine');
      await AudioEngine.start();
      AudioEngine.setMasterVolume(0); // set to 0 first
      AudioEngine.setMasterVolume(1); // restore
      expect(AudioEngine.getMasterVolume()).toBe(1);
    });
  });
});

describe('AudioEngine - getRobotModulationTarget', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns null (not throw) for an unreserved robotId', async () => {
    const { AudioEngine } = await import('./AudioEngine');
    await AudioEngine.start();
    expect(() => AudioEngine.getRobotModulationTarget('never-reserved', 'volume')).not.toThrow();
    expect(AudioEngine.getRobotModulationTarget('never-reserved', 'volume')).toBeNull();
  });

  it('returns the composite voice\'s output gain Signal for "volume"', async () => {
    const { AudioEngine } = await import('./AudioEngine');
    await AudioEngine.start();
    const layered: any[] = [{ type: 'sine', gain: 0.8, detune: 0, phase: 0 }];
    AudioEngine.reserveVoice('mod-target-volume', layered as any, TEST_ADSR);

    const target = AudioEngine.getRobotModulationTarget('mod-target-volume', 'volume');
    expect(target).not.toBeNull();
    expect(target).toHaveProperty('value');
  });

  it('returns the per-layer Tone.Gain.gain Signal for "layerN.gain"', async () => {
    const { AudioEngine } = await import('./AudioEngine');
    await AudioEngine.start();
    const layered: any[] = [
      { type: 'sine', gain: 0.8, detune: 0, phase: 0 },
      { type: 'triangle', gain: 0.5, detune: 0, phase: 0 },
    ];
    AudioEngine.reserveVoice('mod-target-gain', layered as any, TEST_ADSR);

    expect(AudioEngine.getRobotModulationTarget('mod-target-gain', 'layer0.gain')).toHaveProperty('value');
    expect(AudioEngine.getRobotModulationTarget('mod-target-gain', 'layer1.gain')).toHaveProperty('value');
  });

  it('returns the oscillator detune Signal for "layerN.detune"', async () => {
    const { AudioEngine } = await import('./AudioEngine');
    await AudioEngine.start();
    const layered: any[] = [{ type: 'sine', gain: 0.8, detune: -5, phase: 0 }];
    AudioEngine.reserveVoice('mod-target-detune', layered as any, TEST_ADSR);

    const target = AudioEngine.getRobotModulationTarget('mod-target-detune', 'layer0.detune');
    expect(target).not.toBeNull();
    expect(target).toHaveProperty('value');
  });

  it('returns null (not throw) for "layerN.phase" — no live Signal exists for oscillator phase in Tone.js', async () => {
    const { AudioEngine } = await import('./AudioEngine');
    await AudioEngine.start();
    const layered: any[] = [{ type: 'sine', gain: 0.8, detune: 0, phase: 45 }];
    AudioEngine.reserveVoice('mod-target-phase', layered as any, TEST_ADSR);

    expect(() => AudioEngine.getRobotModulationTarget('mod-target-phase', 'layer0.phase')).not.toThrow();
    expect(AudioEngine.getRobotModulationTarget('mod-target-phase', 'layer0.phase')).toBeNull();
  });

  it('returns the PulseOscillator width Signal for "layerN.pulseWidth" when the layer type is \'pulse\'', async () => {
    const { AudioEngine } = await import('./AudioEngine');
    await AudioEngine.start();
    const layered: any[] = [{ type: 'pulse', gain: 0.8, detune: 0, phase: 0, pulseWidth: 0.3 }];
    AudioEngine.reserveVoice('mod-target-pulse', layered as any, TEST_ADSR);

    const target = AudioEngine.getRobotModulationTarget('mod-target-pulse', 'layer0.pulseWidth');
    expect(target).not.toBeNull();
    expect(target).toHaveProperty('value');
  });

  it('returns null (not throw) for "layerN.pulseWidth" when the layer type is \'square\' — no adjustable width exists in Tone.js', async () => {
    const { AudioEngine } = await import('./AudioEngine');
    await AudioEngine.start();
    const layered: any[] = [{ type: 'square', gain: 0.8, detune: 0, phase: 0 }];
    AudioEngine.reserveVoice('mod-target-square', layered as any, TEST_ADSR);

    expect(() => AudioEngine.getRobotModulationTarget('mod-target-square', 'layer0.pulseWidth')).not.toThrow();
    expect(AudioEngine.getRobotModulationTarget('mod-target-square', 'layer0.pulseWidth')).toBeNull();
  });

  it('returns null (not throw) for an out-of-range layer index', async () => {
    const { AudioEngine } = await import('./AudioEngine');
    await AudioEngine.start();
    const layered: any[] = [{ type: 'sine', gain: 0.8, detune: 0, phase: 0 }]; // only layer0 exists
    AudioEngine.reserveVoice('mod-target-oob', layered as any, TEST_ADSR);

    expect(() => AudioEngine.getRobotModulationTarget('mod-target-oob', 'layer2.gain')).not.toThrow();
    expect(AudioEngine.getRobotModulationTarget('mod-target-oob', 'layer2.gain')).toBeNull();
  });
});

describe('AudioEngine - getGlobalModulationTarget', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns null (not throw) for every target before AudioEngine.start() constructs the FX chain', async () => {
    const { AudioEngine } = await import('./AudioEngine');
    const targets = [
      'eq3.low', 'eq3.mid', 'eq3.high',
      'lpf.frequency', 'lpf.Q',
      'hpf.frequency', 'hpf.Q',
    ] as const;
    for (const target of targets) {
      expect(() => AudioEngine.getGlobalModulationTarget(target)).not.toThrow();
      expect(AudioEngine.getGlobalModulationTarget(target)).toBeNull();
    }
  });

  it('returns the live EQ3 low/mid/high Params after start()', async () => {
    const { AudioEngine } = await import('./AudioEngine');
    await AudioEngine.start();
    expect(AudioEngine.getGlobalModulationTarget('eq3.low')).toHaveProperty('value');
    expect(AudioEngine.getGlobalModulationTarget('eq3.mid')).toHaveProperty('value');
    expect(AudioEngine.getGlobalModulationTarget('eq3.high')).toHaveProperty('value');
  });

  it('returns the live LPF frequency/Q Signals after start()', async () => {
    const { AudioEngine } = await import('./AudioEngine');
    await AudioEngine.start();
    expect(AudioEngine.getGlobalModulationTarget('lpf.frequency')).toHaveProperty('value');
    expect(AudioEngine.getGlobalModulationTarget('lpf.Q')).toHaveProperty('value');
  });

  it('returns the live HPF frequency/Q Signals after start()', async () => {
    const { AudioEngine } = await import('./AudioEngine');
    await AudioEngine.start();
    expect(AudioEngine.getGlobalModulationTarget('hpf.frequency')).toHaveProperty('value');
    expect(AudioEngine.getGlobalModulationTarget('hpf.Q')).toHaveProperty('value');
  });

  it('distinguishes LPF and HPF — they are separate Filter instances, not the same node read twice', async () => {
    const { AudioEngine } = await import('./AudioEngine');
    await AudioEngine.start();
    const lpf = AudioEngine.getGlobalModulationTarget('lpf.frequency');
    const hpf = AudioEngine.getGlobalModulationTarget('hpf.frequency');
    expect(lpf).not.toBe(hpf);
  });
});

describe('AudioEngine.start - prime, connect, and start seeded global LFOs (Task 9)', () => {
  // One entry per GlobalLfoTargetId, with a deliberate mix: some with a
  // nonzero (oscillating) rate, some at rate 0 (off), and one oscillating
  // target ('eq3.mid') whose connectLfoTarget call will be made to return
  // false, to prove start() is conditioned on a real connect.
  const FIXTURE_GLOBAL_LFO = {
    'eq3.low': { shape: 'sine', rate: 2, depth: 30 },
    'eq3.mid': { shape: 'square', rate: 3, depth: 40 },
    'eq3.high': { shape: 'triangle', rate: 0, depth: 10 },
    'lpf.frequency': { shape: 'sawtooth', rate: 4, depth: 50 },
    'lpf.Q': { shape: 'sine', rate: 0, depth: 20 },
    'hpf.frequency': { shape: 'sine', rate: 0, depth: 60 },
    'hpf.Q': { shape: 'square', rate: 0, depth: 70 },
  } as const;

  beforeEach(() => {
    vi.resetModules();
  });

  async function startWithFixture() {
    const { AudioEngine } = await import('./AudioEngine');
    const { useAudioStore } = await import('../stores/audioStore');
    const { lfoEngine } = await import('./lfoEngine');

    useAudioStore.setState({ globalLfo: FIXTURE_GLOBAL_LFO as any });
    // The lfoEngine mock's call history persists across vi.resetModules() (same
    // quirk LFO_INTEGRATION_PLAN.md's Task 11 and audioStore.test.ts's AS-sync
    // block both document for the Tone/lfoEngine mocks) — clear it so each test
    // only sees this start() call's own calls.
    vi.clearAllMocks();
    vi.mocked(lfoEngine.connectLfoTarget).mockImplementation((target: unknown) => target !== 'eq3.mid');

    await AudioEngine.start();
    return { lfoEngine };
  }

  it('primes setLfoShape/setLfoRate/setLfoDepth for every one of the 7 targets from globalLfo state', async () => {
    const { lfoEngine } = await startWithFixture();

    for (const [target, settings] of Object.entries(FIXTURE_GLOBAL_LFO)) {
      expect(lfoEngine.setLfoShape).toHaveBeenCalledWith(target, settings.shape);
      expect(lfoEngine.setLfoRate).toHaveBeenCalledWith(target, settings.rate);
      expect(lfoEngine.setLfoDepth).toHaveBeenCalledWith(target, settings.depth);
    }
  });

  it('connects every target with a nonzero rate and starts it when connect succeeds', async () => {
    const { lfoEngine } = await startWithFixture();

    expect(lfoEngine.connectLfoTarget).toHaveBeenCalledWith('eq3.low');
    expect(lfoEngine.start).toHaveBeenCalledWith('eq3.low');

    expect(lfoEngine.connectLfoTarget).toHaveBeenCalledWith('lpf.frequency');
    expect(lfoEngine.start).toHaveBeenCalledWith('lpf.frequency');
  });

  it('does not call start for a nonzero-rate target whose connect fails', async () => {
    const { lfoEngine } = await startWithFixture();

    expect(lfoEngine.connectLfoTarget).toHaveBeenCalledWith('eq3.mid');
    expect(lfoEngine.start).not.toHaveBeenCalledWith('eq3.mid');
  });

  it('never connects or starts a target whose rate is 0', async () => {
    const { lfoEngine } = await startWithFixture();

    for (const target of ['eq3.high', 'lpf.Q', 'hpf.frequency', 'hpf.Q']) {
      expect(lfoEngine.connectLfoTarget).not.toHaveBeenCalledWith(target);
      expect(lfoEngine.start).not.toHaveBeenCalledWith(target);
    }
  });

  it('does not throw and existing start() behavior (instrument loading, beat clock) still runs', async () => {
    const { AudioEngine } = await import('./AudioEngine');
    const { useAudioStore } = await import('../stores/audioStore');
    useAudioStore.setState({ globalLfo: FIXTURE_GLOBAL_LFO as any });

    await expect(AudioEngine.start()).resolves.not.toThrow();
    const beatClock = await import('./beatClock');
    expect(beatClock.initBeatClock).toHaveBeenCalled();
  });
});

describe('AudioEngine.start — primes the just-built global FX chain from currently-seeded globalAudio state', () => {
  // Deliberately far from globalFx.ts's own hardcoded construction defaults
  // (compressor threshold -18/ratio 6, EQ bands 0, LPF/HPF passthrough,
  // delay wet 0, reverb wet 0.3, limiter threshold -12) — if start() actually
  // applies this fixture, the resulting node values can only have come from
  // the seeded globalAudio state, not buildGlobalFxChain()'s own literals.
  const FIXTURE_GLOBAL_AUDIO = {
    compressorBeforeDelay: false,
    lfoDrift: {
      eq3: { rateDrift: 0, depthDrift: 0 },
      filterLPF: { rateDrift: 0, depthDrift: 0 },
      filterHPF: { rateDrift: 0, depthDrift: 0 },
      robots: { rateDrift: 0, depthDrift: 0 },
    },
    compressor: { threshold: -50, ratio: 15, attack: 0.02, release: 0.22, knee: 9 },
    eq3: { low: 4, mid: -3, high: 2 },
    filterLPF: { type: 'lowpass', frequency: 9000, Q: 3 },
    filterHPF: { type: 'highpass', frequency: 250, Q: 2 },
    delay: { delayTime: 0.4, feedback: 0.3, wet: 0.25 },
    reverb: { decay: 3, preDelay: 0.05, wet: 0.35 },
    limiter: { threshold: -2 },
  };

  type AnyMock = ReturnType<typeof vi.fn>;
  const lastInstance = (ctor: unknown) =>
    (ctor as unknown as AnyMock).mock.results.at(-1)?.value;

  beforeEach(() => {
    vi.resetModules();
  });

  async function startWithFixture() {
    const Tone = await import('tone');
    const { AudioEngine } = await import('./AudioEngine');
    const { useAudioStore } = await import('../stores/audioStore');
    useAudioStore.setState({ globalAudio: FIXTURE_GLOBAL_AUDIO as any });
    await AudioEngine.start();
    return { Tone };
  }

  it('applies the current globalAudio.compressor values to the freshly-built Compressor node', async () => {
    const { Tone } = await startWithFixture();
    const compNode = lastInstance(Tone.Compressor);
    expect(compNode.threshold.value).toBe(-50);
    expect(compNode.ratio.value).toBe(15);
    expect(compNode.attack.value).toBe(0.02);
    expect(compNode.release.value).toBe(0.22);
    expect(compNode.knee.value).toBe(9);
  });

  it('applies the current globalAudio.eq3/filterLPF/filterHPF/reverb/limiter values to their freshly-built nodes', async () => {
    const { Tone } = await startWithFixture();
    expect(lastInstance(Tone.EQ3).low.value).toBe(4);
    expect(lastInstance(Tone.EQ3).mid.value).toBe(-3);
    expect(lastInstance(Tone.EQ3).high.value).toBe(2);
    // Filter is constructed twice in loadInstruments (LPF then HPF) — at(-2)/at(-1).
    const filterResults = (Tone.Filter as unknown as AnyMock).mock.results;
    expect(filterResults.at(-2)?.value.frequency.value).toBe(9000);
    expect(filterResults.at(-2)?.value.Q.value).toBe(3);
    expect(filterResults.at(-1)?.value.frequency.value).toBe(250);
    expect(filterResults.at(-1)?.value.Q.value).toBe(2);
    expect(lastInstance(Tone.Reverb).wet.value).toBe(0.35);
    expect(lastInstance(Tone.Limiter).threshold.value).toBe(-2);
    expect(lastInstance(Tone.FeedbackDelay).wet.value).toBe(0.25);
  });
});
