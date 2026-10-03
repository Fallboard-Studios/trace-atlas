import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { GLOBAL_LFO_TARGET_IDS, LFO_LANE_IDS } from '../types/lfo';
import { resolveDelayTimeSeconds } from '../utils/tempoSync';

// Ensure AudioEngine is mocked before importing the store so the module's
// import of AudioEngine receives the mock. The store now calls the full
// global-FX setter surface (Task 6), not just setBPM — keep this mock's
// shape matching what audioStore.ts actually depends on.
vi.mock('../engine/AudioEngine', () => ({
  AudioEngine: {
    setBPM: vi.fn(),
    setGlobalCompressor: vi.fn(),
    setGlobalEQ: vi.fn(),
    setGlobalFilterLPF: vi.fn(),
    setGlobalFilterHPF: vi.fn(),
    setGlobalLimiter: vi.fn(),
    setGlobalDelay: vi.fn(),
    setGlobalReverb: vi.fn(),
    setMasterVolume: vi.fn(),
  },
}));

// audioStore.ts imports wireGlobalFxChain directly from globalFx.ts (Task 9) —
// no circular-import risk here since globalFx.ts has zero store-layer imports.
vi.mock('../engine/audioEngine/globalFx', () => ({
  wireGlobalFxChain: vi.fn(),
}));

// The LFO Bank engine (docs/tasks/LFO_BANK.md Task 7).
vi.mock('../engine/lfoEngine', () => ({
  lfoEngine: {
    primeLfoBank: vi.fn(),
    setBankShape: vi.fn(),
    setBankRate: vi.fn(),
    setBankRateDrift: vi.fn(),
    setBankDepthDrift: vi.fn(),
    getBankSettings: vi.fn(),
    linkTarget: vi.fn(() => true),
    unlinkTarget: vi.fn(),
    disposeRobotLinks: vi.fn(),
    setDriftEnabled: vi.fn(),
    setFilterLinksEnabled: vi.fn(),
  },
}));

describe('useAudioStore - setBPM', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('updates store bpm and delegates to AudioEngine.setBPM', async () => {
    // Import after mock so the store picks up the mocked AudioEngine
    const { useAudioStore } = await import('./audioStore');
    const { AudioEngine } = await import('../engine/AudioEngine');

    const initial = useAudioStore.getState().bpm;
    expect(typeof initial).toBe('number');

    // Call setter
    useAudioStore.getState().setBPM(140);

    // Store updated
    expect(useAudioStore.getState().bpm).toBe(140);

    // Delegated to AudioEngine
    expect(AudioEngine.setBPM).toHaveBeenCalledWith(140);
  });
});

// docs/specs/FREE_SYNC_TOGGLE.md §1.6, Task 6: a tempo change re-pushes the resolved Hz of every
// synced lane (never a Free one), after the transport has the new tempo. Delay joins in Task 11.
describe('useAudioStore - setBPM re-applies tempo-synced lanes', () => {
  const QUARTER = { division: '1/4', modifier: 'straight' } as const;
  const EIGHTH_DOTTED = { division: '1/8', modifier: 'dotted' } as const;
  const FREE_LANE = { shape: 'sine', rate: 1.5, rateDrift: 0, depthDrift: 0 } as const;

  beforeEach(() => {
    vi.resetModules();
  });

  /** A fresh store with each given lane set (the rest left as seeded), bpm pinned, mocks cleared. */
  async function setup(lanes: Partial<Record<'a' | 'b' | 'c' | 'd', Record<string, unknown>>>, bpm = 60) {
    const { useAudioStore } = await import('./audioStore');
    const { AudioEngine } = await import('../engine/AudioEngine');
    const { lfoEngine } = await import('../engine/lfoEngine');
    const lfoBank = { ...useAudioStore.getState().lfoBank } as Record<string, unknown>;
    // Every lane Free first, so the module-load seed can't leak a synced lane into a "none synced" case.
    for (const lane of LFO_LANE_IDS) lfoBank[lane] = { ...FREE_LANE };
    Object.assign(lfoBank, lanes);
    useAudioStore.setState({ bpm, lfoBank: lfoBank as never });
    vi.clearAllMocks();
    return { useAudioStore, AudioEngine, lfoEngine };
  }

  it('re-pushes a synced lane at the new tempo — 1/4 is 1 Hz at 60 BPM and 2 Hz at 120', async () => {
    const { useAudioStore, lfoEngine } = await setup({ b: { ...FREE_LANE, sync: QUARTER } }, 60);

    useAudioStore.getState().setBPM(120);

    expect(lfoEngine.setBankRate).toHaveBeenCalledTimes(1);
    expect(lfoEngine.setBankRate).toHaveBeenCalledWith('b', 2);
  });

  it('pushes the resolved Hz, not the stored Free rate underneath the sync', async () => {
    const { useAudioStore, lfoEngine } = await setup({ c: { ...FREE_LANE, rate: 7, sync: EIGHTH_DOTTED } }, 60);

    useAudioStore.getState().setBPM(90);

    // 1/8 dotted = 0.75 beats; at 90 BPM that is 0.5 s => 2 Hz
    expect(lfoEngine.setBankRate).toHaveBeenCalledWith('c', 1 / (0.75 * (60 / 90)));
  });

  it('never touches a Free lane — no rate, shape or drift push', async () => {
    const { useAudioStore, lfoEngine } = await setup({}, 60);

    useAudioStore.getState().setBPM(120);

    expect(lfoEngine.setBankRate).not.toHaveBeenCalled();
    expect(lfoEngine.setBankShape).not.toHaveBeenCalled();
    expect(lfoEngine.setBankRateDrift).not.toHaveBeenCalled();
    expect(lfoEngine.setBankDepthDrift).not.toHaveBeenCalled();
  });

  it('re-pushes only the synced lanes in a mixed bank — each at its own note, the Free ones left alone', async () => {
    const { useAudioStore, lfoEngine } = await setup(
      { a: { ...FREE_LANE, sync: QUARTER }, c: { ...FREE_LANE, sync: EIGHTH_DOTTED } },
      60,
    );

    useAudioStore.getState().setBPM(120);

    expect(lfoEngine.setBankRate).toHaveBeenCalledTimes(2);
    expect(lfoEngine.setBankRate).toHaveBeenCalledWith('a', 2);
    expect(lfoEngine.setBankRate).toHaveBeenCalledWith('c', 1 / 0.375);
    expect(lfoEngine.setBankRate).not.toHaveBeenCalledWith('b', expect.anything());
    expect(lfoEngine.setBankRate).not.toHaveBeenCalledWith('d', expect.anything());
  });

  it('re-pushes all four lanes when all four are synced', async () => {
    const synced = { ...FREE_LANE, sync: QUARTER };
    const { useAudioStore, lfoEngine } = await setup({ a: synced, b: synced, c: synced, d: synced }, 60);

    useAudioStore.getState().setBPM(120);

    expect(lfoEngine.setBankRate).toHaveBeenCalledTimes(4);
    for (const lane of LFO_LANE_IDS) expect(lfoEngine.setBankRate).toHaveBeenCalledWith(lane, 2);
  });

  it('writes state, then the transport, then the lanes — the lanes resolve against the tempo the transport already has', async () => {
    const { useAudioStore, AudioEngine, lfoEngine } = await setup({ b: { ...FREE_LANE, sync: QUARTER } }, 60);
    let bpmInStateAtTransportCall: number | undefined;
    vi.mocked(AudioEngine.setBPM).mockImplementation(() => {
      bpmInStateAtTransportCall = useAudioStore.getState().bpm;
    });

    useAudioStore.getState().setBPM(120);

    expect(bpmInStateAtTransportCall).toBe(120);
    const transportOrder = vi.mocked(AudioEngine.setBPM).mock.invocationCallOrder[0];
    const laneOrder = vi.mocked(lfoEngine.setBankRate).mock.invocationCallOrder[0];
    expect(transportOrder).toBeLessThan(laneOrder);
  });

  it('a note that would outrun the lane cap at the new tempo clamps to 20 Hz, never more', async () => {
    const { useAudioStore, lfoEngine } = await setup({ d: { ...FREE_LANE, sync: { division: '1/32', modifier: 'triplet' } } }, 60);

    useAudioStore.getState().setBPM(200);

    expect(lfoEngine.setBankRate).toHaveBeenCalledWith('d', 20);
  });

  it('a note too slow for the lane at the new tempo clamps to the floor — it does not push 0 and stop the lane', async () => {
    const { useAudioStore, lfoEngine } = await setup({ a: { ...FREE_LANE, sync: { division: '4', modifier: 'straight' } } }, 60);

    useAudioStore.getState().setBPM(20); // 4 bars at 20 BPM = 48 s per cycle, ~0.021 Hz

    const pushed = vi.mocked(lfoEngine.setBankRate).mock.calls.at(-1)![1];
    expect(pushed).toBeGreaterThan(0);
    expect(pushed).toBeCloseTo(1 / 48, 6);
  });

  it('an unrecognised sync value counts as Free — it is not re-pushed', async () => {
    const { useAudioStore, lfoEngine } = await setup({ b: { ...FREE_LANE, sync: { division: '1/3', modifier: 'straight' } } }, 60);

    useAudioStore.getState().setBPM(120);

    expect(lfoEngine.setBankRate).not.toHaveBeenCalled();
  });

  it('every tick of a tempo drag re-pushes at that tick\'s tempo', async () => {
    const { useAudioStore, lfoEngine } = await setup({ b: { ...FREE_LANE, sync: QUARTER } }, 60);

    useAudioStore.getState().setBPM(90);
    useAudioStore.getState().setBPM(120);
    useAudioStore.getState().setBPM(150);

    expect(vi.mocked(lfoEngine.setBankRate).mock.calls).toEqual([
      ['b', 1.5],
      ['b', 2],
      ['b', 2.5],
    ]);
  });

  it('does not alter lane state — the stored note and Free rate are untouched by a tempo change', async () => {
    const { useAudioStore } = await setup({ b: { ...FREE_LANE, rate: 3, sync: QUARTER } }, 60);

    useAudioStore.getState().setBPM(120);

    expect(useAudioStore.getState().lfoBank.b).toStrictEqual({ ...FREE_LANE, rate: 3, sync: QUARTER });
  });

  it('regenerateBpmFromSeed (the Attenuation Style reseed) goes through the same re-apply', async () => {
    const { useAudioStore, lfoEngine } = await setup({ b: { ...FREE_LANE, sync: QUARTER } }, 60);

    useAudioStore.getState().regenerateBpmFromSeed('att-style-id', 'att-style-name');

    const { generateAttenuationStyleBpm } = await import('../utils/bpmSeed');
    const seeded = generateAttenuationStyleBpm('att-style-id', 'att-style-name');
    expect(lfoEngine.setBankRate).toHaveBeenCalledWith('b', seeded / 60);
  });

  it('is safe before audio has started — no throw when AudioEngine is not initialised', async () => {
    const { useAudioStore, AudioEngine } = await setup({ b: { ...FREE_LANE, sync: QUARTER } }, 60);
    // AudioEngine.setBPM no-ops pre-start (its own guard); the lane push must not need an engine check either.
    vi.mocked(AudioEngine.setBPM).mockImplementation(() => undefined);

    expect(() => useAudioStore.getState().setBPM(100)).not.toThrow();
    expect(useAudioStore.getState().bpm).toBe(100);
  });
});

describe('useAudioStore - regenerateGlobalAudioFromSeed', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('seeds globalAudio for the current Attenuation Style on module load (app init)', async () => {
    // Importing the store is the trigger under test — its module-scope sync
    // runs at import time, before any explicit action is called.
    await import('./audioStore');
    const { AudioEngine } = await import('../engine/AudioEngine');

    expect(AudioEngine.setGlobalReverb).toHaveBeenCalled();
    expect(AudioEngine.setGlobalCompressor).toHaveBeenCalled();
  });

  it('seeds delay.wet quiet (0) for roughly 1-in-4 Attenuation Styles, not roughly all or none', async () => {
    // Same statistical-spot-check style as globalAudioSeed.test.ts's own
    // delay.wet test — a wide tolerance band instead of an exact count, to
    // avoid flakiness while still clearly distinguishing this from "always
    // quiet" or "never quiet". Replaces the old force-enabled-true override
    // regression guard now that there's no separate enabled field.
    const { useAudioStore } = await import('./audioStore');
    const SAMPLE_ATTENUATION_STYLES = 40;
    let quietCount = 0;
    for (let i = 0; i < SAMPLE_ATTENUATION_STYLES; i++) {
      useAudioStore.getState().regenerateGlobalAudioFromSeed(`store-delay-sample-${i}`, `StoreDelaySample${i}`);
      if (useAudioStore.getState().globalAudio.delay.wet === 0) quietCount++;
    }
    const quietRate = quietCount / SAMPLE_ATTENUATION_STYLES;
    expect(quietRate).toBeGreaterThan(0.05);
    expect(quietRate).toBeLessThan(0.5);
  });

  it('fixes filterLPF/filterHPF type to their identity', async () => {
    const { useAudioStore } = await import('./audioStore');
    const { globalAudio } = useAudioStore.getState();
    expect(globalAudio.filterLPF.type).toBe('lowpass');
    expect(globalAudio.filterHPF.type).toBe('highpass');
  });

  it('calls every AudioEngine setGlobal* setter with the resulting values', async () => {
    const { useAudioStore } = await import('./audioStore');
    const { AudioEngine } = await import('../engine/AudioEngine');
    const { globalAudio, bpm } = useAudioStore.getState();

    expect(AudioEngine.setGlobalCompressor).toHaveBeenCalledWith(globalAudio.compressor);
    expect(AudioEngine.setGlobalEQ).toHaveBeenCalledWith(globalAudio.eq3);
    expect(AudioEngine.setGlobalFilterLPF).toHaveBeenCalledWith(globalAudio.filterLPF);
    expect(AudioEngine.setGlobalFilterHPF).toHaveBeenCalledWith(globalAudio.filterHPF);
    expect(AudioEngine.setGlobalLimiter).toHaveBeenCalledWith(globalAudio.limiter);
    // The engine only ever hears the resolved delay: `sync` stripped, `delayTime` in seconds at the
    // current tempo. The seeded Delay is Sync or Free depending on the (random, per-boot) default
    // Attenuation Style, so this must hold for both — a Free delay resolves to itself.
    const { sync: _sync, ...engineDelay } = globalAudio.delay;
    expect(AudioEngine.setGlobalDelay).toHaveBeenCalledWith({
      ...engineDelay,
      delayTime: resolveDelayTimeSeconds(globalAudio.delay, bpm),
    });
    expect(AudioEngine.setGlobalReverb).toHaveBeenCalledWith(globalAudio.reverb);
  });

  it('is deterministic — calling it twice with the same Attenuation Style produces the same globalAudio', async () => {
    const { useAudioStore } = await import('./audioStore');
    const first = useAudioStore.getState().globalAudio;
    useAudioStore.getState().regenerateGlobalAudioFromSeed('pelagos', 'Pelagos');
    const second = useAudioStore.getState().globalAudio;
    expect(second).toEqual(first);
  });

  it('produces different globalAudio for a different Attenuation Style', async () => {
    const { useAudioStore } = await import('./audioStore');
    const pelagos = useAudioStore.getState().globalAudio;
    useAudioStore.getState().regenerateGlobalAudioFromSeed('a-different-as-id', 'Zenith');
    const other = useAudioStore.getState().globalAudio;
    expect(other).not.toEqual(pelagos);
  });

  it('preserves compressorBeforeDelay across a reseed — it is not seeded, so an Attenuation Style switch must not silently reset a live user choice back to default', async () => {
    const { useAudioStore } = await import('./audioStore');
    useAudioStore.getState().setCompressorBeforeDelay(true);

    useAudioStore.getState().regenerateGlobalAudioFromSeed('a-different-as-id', 'Zenith');

    expect(useAudioStore.getState().globalAudio.compressorBeforeDelay).toBe(true);
  });

  it('follows setCurrentAttenuationStyleId — switching the active Attenuation Style reseeds globalAudio automatically', async () => {
    const { useAudioStore } = await import('./audioStore');
    const { useAttenuationStyleStore, DEFAULT_PELAGOS } = await import('./attenuationStyleStore');
    const { AudioEngine } = await import('../engine/AudioEngine');

    const before = useAudioStore.getState().globalAudio;
    useAttenuationStyleStore.getState().addAttenuationStyle({ ...DEFAULT_PELAGOS, id: 'zenith', name: 'Zenith' });
    vi.clearAllMocks();

    useAttenuationStyleStore.getState().setCurrentAttenuationStyleId('zenith');

    expect(useAudioStore.getState().globalAudio).not.toEqual(before);
    expect(AudioEngine.setGlobalReverb).toHaveBeenCalled();
  });

  it('does not throw and leaves globalAudio unchanged when currentAttenuationStyleId matches no Attenuation Style', async () => {
    const { useAudioStore } = await import('./audioStore');
    const { useAttenuationStyleStore } = await import('./attenuationStyleStore');
    const before = useAudioStore.getState().globalAudio;

    expect(() => useAttenuationStyleStore.getState().setCurrentAttenuationStyleId('does-not-exist')).not.toThrow();
    expect(useAudioStore.getState().globalAudio).toEqual(before);
  });

  it('does not redundantly recompute when currentAttenuationStyleId is set to its current value', async () => {
    const { useAudioStore } = await import('./audioStore');
    const { useAttenuationStyleStore } = await import('./attenuationStyleStore');
    const { AudioEngine } = await import('../engine/AudioEngine');

    void useAudioStore.getState();
    vi.clearAllMocks();
    useAttenuationStyleStore.getState().setCurrentAttenuationStyleId(useAttenuationStyleStore.getState().currentAttenuationStyleId);

    expect(AudioEngine.setGlobalReverb).not.toHaveBeenCalled();
  });
});

describe('useAudioStore - setGlobalAudio pushes to AudioEngine', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('updates globalAudio state for the given effect/partial', async () => {
    const { useAudioStore } = await import('./audioStore');
    useAudioStore.getState().setGlobalAudio('compressor', { threshold: -30 });
    expect(useAudioStore.getState().globalAudio.compressor.threshold).toBe(-30);
  });

  it('calls the matching AudioEngine setter with the partial', async () => {
    const { useAudioStore } = await import('./audioStore');
    const { AudioEngine } = await import('../engine/AudioEngine');
    vi.clearAllMocks();

    useAudioStore.getState().setGlobalAudio('compressor', { threshold: -30 });
    expect(AudioEngine.setGlobalCompressor).toHaveBeenCalledWith({ threshold: -30 });

    useAudioStore.getState().setGlobalAudio('eq3', { low: 4 });
    expect(AudioEngine.setGlobalEQ).toHaveBeenCalledWith({ low: 4 });

    useAudioStore.getState().setGlobalAudio('filterLPF', { frequency: 8000 });
    expect(AudioEngine.setGlobalFilterLPF).toHaveBeenCalledWith({ frequency: 8000 });

    useAudioStore.getState().setGlobalAudio('filterHPF', { Q: 5 });
    expect(AudioEngine.setGlobalFilterHPF).toHaveBeenCalledWith({ Q: 5 });

    useAudioStore.getState().setGlobalAudio('limiter', { threshold: -6 });
    expect(AudioEngine.setGlobalLimiter).toHaveBeenCalledWith({ threshold: -6 });

    useAudioStore.getState().setGlobalAudio('delay', { feedback: 0.4 });
    expect(AudioEngine.setGlobalDelay).toHaveBeenCalledWith({ feedback: 0.4 });

    useAudioStore.getState().setGlobalAudio('reverb', { wet: 0.6 });
    expect(AudioEngine.setGlobalReverb).toHaveBeenCalledWith({ wet: 0.6 });
  });
});

describe('useAudioStore - no setEffectEnabled/setGlobalBypassEnabled', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('no longer exposes setEffectEnabled/setGlobalBypassEnabled, or globalBypass/enabled fields — removed, off states are expressed via the params/sliders themselves', async () => {
    const { useAudioStore } = await import('./audioStore');
    const state = useAudioStore.getState();
    expect('setEffectEnabled' in state).toBe(false);
    expect('setGlobalBypassEnabled' in state).toBe(false);
    expect('globalBypass' in state.globalAudio).toBe(false);
    expect('enabled' in state.globalAudio.reverb).toBe(false);
  });
});

describe('useAudioStore - setCompressorBeforeDelay', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('starts false (Natural Decay) before any action runs', async () => {
    const { useAudioStore } = await import('./audioStore');
    expect(useAudioStore.getState().globalAudio.compressorBeforeDelay).toBe(false);
  });

  it('setting true updates state and calls wireGlobalFxChain(true)', async () => {
    const { useAudioStore } = await import('./audioStore');
    const { wireGlobalFxChain } = await import('../engine/audioEngine/globalFx');
    vi.clearAllMocks();

    useAudioStore.getState().setCompressorBeforeDelay(true);

    expect(useAudioStore.getState().globalAudio.compressorBeforeDelay).toBe(true);
    expect(wireGlobalFxChain).toHaveBeenCalledWith(true);
  });

  it('setting false updates state and calls wireGlobalFxChain(false)', async () => {
    const { useAudioStore } = await import('./audioStore');
    const { wireGlobalFxChain } = await import('../engine/audioEngine/globalFx');
    useAudioStore.getState().setCompressorBeforeDelay(true);
    vi.clearAllMocks();

    useAudioStore.getState().setCompressorBeforeDelay(false);

    expect(useAudioStore.getState().globalAudio.compressorBeforeDelay).toBe(false);
    expect(wireGlobalFxChain).toHaveBeenCalledWith(false);
  });
});

describe('useAudioStore - lfoBank state (docs/tasks/LFO_BANK.md Task 8)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('has one entry per LfoLaneId, JSON-serializable', async () => {
    const { useAudioStore } = await import('./audioStore');
    const { lfoBank } = useAudioStore.getState();
    expect(Object.keys(lfoBank).sort()).toEqual([...LFO_LANE_IDS].sort());
    expect(() => JSON.stringify(lfoBank)).not.toThrow();
  });
});

describe('useAudioStore - setLfoBank', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('updates lfoBank state for the given lane/partial', async () => {
    const { useAudioStore } = await import('./audioStore');
    useAudioStore.getState().setLfoBank('b', { rate: 2 });
    expect(useAudioStore.getState().lfoBank.b.rate).toBe(2);
  });

  it('calls setBankRate and no other engine setter when only rate is given', async () => {
    const { useAudioStore } = await import('./audioStore');
    const { lfoEngine } = await import('../engine/lfoEngine');
    // Pin lane b Free: the default Attenuation Style's name is random per boot and may seed it Sync,
    // in which case a rate edit (correctly) pushes the synced Hz instead of the typed rate.
    useAudioStore.setState({
      lfoBank: { ...useAudioStore.getState().lfoBank, b: { shape: 'sine', rate: 1, rateDrift: 0, depthDrift: 0 } },
    });
    vi.clearAllMocks();

    useAudioStore.getState().setLfoBank('b', { rate: 2 });

    expect(lfoEngine.setBankRate).toHaveBeenCalledWith('b', 2);
    expect(lfoEngine.setBankShape).not.toHaveBeenCalled();
    expect(lfoEngine.setBankRateDrift).not.toHaveBeenCalled();
    expect(lfoEngine.setBankDepthDrift).not.toHaveBeenCalled();
  });

  it('calls only the engine setters for the fields actually given, for every other field', async () => {
    const { useAudioStore } = await import('./audioStore');
    const { lfoEngine } = await import('../engine/lfoEngine');
    vi.clearAllMocks();

    useAudioStore.getState().setLfoBank('a', { shape: 'square', depthDrift: 0.5 });

    expect(lfoEngine.setBankShape).toHaveBeenCalledWith('a', 'square');
    expect(lfoEngine.setBankDepthDrift).toHaveBeenCalledWith('a', 0.5);
    expect(lfoEngine.setBankRate).not.toHaveBeenCalled();
    expect(lfoEngine.setBankRateDrift).not.toHaveBeenCalled();
  });

  it('merges the partial onto the lane\'s existing settings — other fields survive', async () => {
    const { useAudioStore } = await import('./audioStore');
    useAudioStore.getState().setLfoBank('c', { rate: 3 });
    useAudioStore.getState().setLfoBank('c', { shape: 'triangle' });

    expect(useAudioStore.getState().lfoBank.c).toMatchObject({ rate: 3, shape: 'triangle' });
  });

  it('touches only the named lane — every other lane\'s settings are untouched', async () => {
    const { useAudioStore } = await import('./audioStore');
    const before = useAudioStore.getState().lfoBank;

    useAudioStore.getState().setLfoBank('d', { rate: 7 });

    expect(useAudioStore.getState().lfoBank.a).toEqual(before.a);
    expect(useAudioStore.getState().lfoBank.b).toEqual(before.b);
    expect(useAudioStore.getState().lfoBank.c).toEqual(before.c);
  });

  it('is a safe no-op for an undefined partial — e.g. a hole left by a malformed session payload — instead of throwing', async () => {
    const { useAudioStore } = await import('./audioStore');
    const { lfoEngine } = await import('../engine/lfoEngine');
    const before = useAudioStore.getState().lfoBank;
    vi.clearAllMocks();

    expect(() => useAudioStore.getState().setLfoBank('a', undefined as unknown as Partial<import('../types/lfo').BankLfoSettings>)).not.toThrow();

    expect(useAudioStore.getState().lfoBank).toEqual(before);
    expect(lfoEngine.setBankShape).not.toHaveBeenCalled();
    expect(lfoEngine.setBankRate).not.toHaveBeenCalled();
    expect(lfoEngine.setBankRateDrift).not.toHaveBeenCalled();
    expect(lfoEngine.setBankDepthDrift).not.toHaveBeenCalled();
  });
});

// docs/specs/FREE_SYNC_TOGGLE.md §1.3/§1.5, Task 5: a lane's Rate reaches the engine only as a
// resolved Hz, never as the note value; a Free lane behaves exactly as before.
describe('useAudioStore - lane Sync: setLfoBank resolves, replaceLfoBankLane / setLfoBankLaneSyncMode', () => {
  const QUARTER = { division: '1/4', modifier: 'straight' } as const;
  const EIGHTH_DOTTED = { division: '1/8', modifier: 'dotted' } as const;
  const FREE_LANE = { shape: 'sine', rate: 1.5, rateDrift: 0, depthDrift: 0 } as const;

  beforeEach(() => {
    vi.resetModules();
  });

  /** A fresh store with lane `lane` set to `settings`, the others left as seeded, bpm pinned, mocks cleared. */
  async function setup(lane: 'a' | 'b' | 'c' | 'd', settings: Record<string, unknown>, bpm = 60) {
    const { useAudioStore } = await import('./audioStore');
    const { lfoEngine } = await import('../engine/lfoEngine');
    useAudioStore.setState({ bpm, lfoBank: { ...useAudioStore.getState().lfoBank, [lane]: settings as never } });
    vi.clearAllMocks();
    return { useAudioStore, lfoEngine };
  }

  describe('setLfoBank', () => {
    it('{ sync } pushes the note\'s resolved Hz, not the stored Free rate — 1/4 at 120 BPM is 2 Hz', async () => {
      const { useAudioStore, lfoEngine } = await setup('b', FREE_LANE, 120);

      useAudioStore.getState().setLfoBank('b', { sync: QUARTER });

      expect(lfoEngine.setBankRate).toHaveBeenCalledTimes(1);
      expect(lfoEngine.setBankRate).toHaveBeenCalledWith('b', 2);
      expect(useAudioStore.getState().lfoBank.b.sync).toEqual(QUARTER);
    });

    it('{ sync } at a different tempo resolves at that tempo — 1/4 at 60 BPM is 1 Hz', async () => {
      const { useAudioStore, lfoEngine } = await setup('b', FREE_LANE, 60);

      useAudioStore.getState().setLfoBank('b', { sync: QUARTER });

      expect(lfoEngine.setBankRate).toHaveBeenCalledWith('b', 1);
    });

    it('{ sync } whose note is faster than the lane cap clamps into range — 1/32 triplet at 200 BPM pushes 20 Hz, never more', async () => {
      const { useAudioStore, lfoEngine } = await setup('b', FREE_LANE, 200);

      useAudioStore.getState().setLfoBank('b', { sync: { division: '1/32', modifier: 'triplet' } });

      expect(lfoEngine.setBankRate).toHaveBeenCalledWith('b', 20);
    });

    it('a Free-rate edit on an already-synced lane keeps pushing the synced Hz — the stored rate is ignored while sync is present', async () => {
      const { useAudioStore, lfoEngine } = await setup('b', { ...FREE_LANE, sync: EIGHTH_DOTTED }, 60);

      useAudioStore.getState().setLfoBank('b', { rate: 9 });

      expect(useAudioStore.getState().lfoBank.b.rate).toBe(9); // the Free value is still stored underneath
      expect(lfoEngine.setBankRate).toHaveBeenCalledWith('b', 1 / 0.75);
    });

    it('a Free lane\'s { rate } edit pushes the typed rate exactly as before', async () => {
      const { useAudioStore, lfoEngine } = await setup('b', FREE_LANE, 120);

      useAudioStore.getState().setLfoBank('b', { rate: 3.25 });

      expect(lfoEngine.setBankRate).toHaveBeenCalledWith('b', 3.25);
    });

    it('a { rate: 0 } edit on a Free lane still pushes 0 (the lane stops) — only a synced lane is "always running"', async () => {
      const { useAudioStore, lfoEngine } = await setup('b', FREE_LANE, 120);

      useAudioStore.getState().setLfoBank('b', { rate: 0 });

      expect(lfoEngine.setBankRate).toHaveBeenCalledWith('b', 0);
    });

    it('{ shape } alone pushes no rate — a sync lane\'s rate is not re-sent on an unrelated edit', async () => {
      const { useAudioStore, lfoEngine } = await setup('b', { ...FREE_LANE, sync: QUARTER }, 60);

      useAudioStore.getState().setLfoBank('b', { shape: 'square' });

      expect(lfoEngine.setBankShape).toHaveBeenCalledWith('b', 'square');
      expect(lfoEngine.setBankRate).not.toHaveBeenCalled();
    });

    it('{ rateDrift } on a synced lane still reaches the engine while drift applies to synced lanes (the shipped constant)', async () => {
      const { useAudioStore, lfoEngine } = await setup('b', { ...FREE_LANE, sync: QUARTER }, 60);

      useAudioStore.getState().setLfoBank('b', { rateDrift: 0.5 });

      expect(lfoEngine.setBankRateDrift).toHaveBeenCalledWith('b', 0.5);
      expect(lfoEngine.setBankRate).not.toHaveBeenCalled();
    });

    it('{ sync: undefined } is a no-op: a merge can never delete a key, so the lane stays synced, no `undefined` lands in state, and nothing is pushed', async () => {
      const { useAudioStore, lfoEngine } = await setup('b', { ...FREE_LANE, sync: QUARTER }, 120);

      useAudioStore.getState().setLfoBank('b', { sync: undefined });

      expect(useAudioStore.getState().lfoBank.b.sync).toEqual(QUARTER);
      expect(lfoEngine.setBankRate).not.toHaveBeenCalled();
    });

    it('an undefined-valued key never lands in state through the merge (spec §3: a Free result has no `sync` key, never `sync: undefined`)', async () => {
      const { useAudioStore } = await setup('b', FREE_LANE, 120);

      useAudioStore.getState().setLfoBank('b', { sync: undefined, rateDrift: 0.3 });

      expect('sync' in useAudioStore.getState().lfoBank.b).toBe(false);
      expect(useAudioStore.getState().lfoBank.b.rateDrift).toBe(0.3);
    });

    it('an unrecognised sync value resolves as Free — the stored rate is pushed, not NaN from a bogus note', async () => {
      const { useAudioStore, lfoEngine } = await setup('b', FREE_LANE, 120);

      useAudioStore.getState().setLfoBank('b', { sync: { division: '1/3', modifier: 'straight' } as never });

      expect(lfoEngine.setBankRate).toHaveBeenCalledWith('b', 1.5);
    });
  });

  describe('replaceLfoBankLane', () => {
    it('writes the lane whole — a Free lane over a synced one leaves no `sync` key at all', async () => {
      const { useAudioStore } = await setup('c', { ...FREE_LANE, sync: QUARTER });

      useAudioStore.getState().replaceLfoBankLane('c', { ...FREE_LANE });

      expect('sync' in useAudioStore.getState().lfoBank.c).toBe(false);
      expect(useAudioStore.getState().lfoBank.c).toEqual(FREE_LANE);
    });

    it('is a replace, not a merge — a field the new settings omit does not survive from the old lane', async () => {
      const { useAudioStore } = await setup('c', { shape: 'square', rate: 4, rateDrift: 0.3, depthDrift: 0.4, sync: QUARTER });

      useAudioStore.getState().replaceLfoBankLane('c', { shape: 'sine', rate: 1, rateDrift: 0, depthDrift: 0 });

      expect(useAudioStore.getState().lfoBank.c).toStrictEqual({ shape: 'sine', rate: 1, rateDrift: 0, depthDrift: 0 });
    });

    it('pushes the whole lane to the engine: shape, the resolved Hz, and both drifts', async () => {
      const { useAudioStore, lfoEngine } = await setup('c', FREE_LANE, 120);

      useAudioStore.getState().replaceLfoBankLane('c', { shape: 'triangle', rate: 7, rateDrift: 0.25, depthDrift: 0.5, sync: QUARTER });

      expect(lfoEngine.setBankShape).toHaveBeenCalledWith('c', 'triangle');
      expect(lfoEngine.setBankRate).toHaveBeenCalledWith('c', 2); // 1/4 at 120, not the stored 7
      expect(lfoEngine.setBankRateDrift).toHaveBeenCalledWith('c', 0.25);
      expect(lfoEngine.setBankDepthDrift).toHaveBeenCalledWith('c', 0.5);
    });

    it('pushes a Free lane\'s stored rate unchanged, including 0', async () => {
      const { useAudioStore, lfoEngine } = await setup('c', { ...FREE_LANE, sync: QUARTER }, 120);

      useAudioStore.getState().replaceLfoBankLane('c', { shape: 'sine', rate: 0, rateDrift: 0, depthDrift: 0 });

      expect(lfoEngine.setBankRate).toHaveBeenCalledWith('c', 0);
    });

    it('touches only the named lane', async () => {
      const { useAudioStore } = await setup('c', FREE_LANE);
      const before = useAudioStore.getState().lfoBank;

      useAudioStore.getState().replaceLfoBankLane('c', { shape: 'square', rate: 2, rateDrift: 0, depthDrift: 0 });

      expect(useAudioStore.getState().lfoBank.a).toBe(before.a);
      expect(useAudioStore.getState().lfoBank.b).toBe(before.b);
      expect(useAudioStore.getState().lfoBank.d).toBe(before.d);
    });

    it('is a safe no-op for undefined settings, same defence as setLfoBank', async () => {
      const { useAudioStore, lfoEngine } = await setup('c', FREE_LANE);
      const before = useAudioStore.getState().lfoBank;

      expect(() => useAudioStore.getState().replaceLfoBankLane('c', undefined as never)).not.toThrow();

      expect(useAudioStore.getState().lfoBank).toBe(before);
      expect(lfoEngine.setBankShape).not.toHaveBeenCalled();
      expect(lfoEngine.setBankRate).not.toHaveBeenCalled();
    });
  });

  describe('setLfoBankLaneSyncMode', () => {
    it('Free -> Sync snaps to the nearest allowed note and pushes its Hz — 1.5 Hz at 60 BPM is a 1/4 triplet (1.5 Hz exactly)', async () => {
      const { useAudioStore, lfoEngine } = await setup('a', FREE_LANE, 60);

      useAudioStore.getState().setLfoBankLaneSyncMode('a', true);

      expect(useAudioStore.getState().lfoBank.a.sync).toEqual({ division: '1/4', modifier: 'triplet' });
      expect(useAudioStore.getState().lfoBank.a.rate).toBe(1.5); // the Free value is kept underneath
      expect(lfoEngine.setBankRate).toHaveBeenLastCalledWith('a', 1.5);
    });

    it('Free -> Sync from a held 0 Hz lands on the slowest allowed note, not a crash and not 0', async () => {
      const { useAudioStore, lfoEngine } = await setup('a', { ...FREE_LANE, rate: 0 }, 60);

      useAudioStore.getState().setLfoBankLaneSyncMode('a', true);

      const lane = useAudioStore.getState().lfoBank.a;
      expect(lane.sync).toBeDefined();
      const pushed = vi.mocked(lfoEngine.setBankRate).mock.calls.at(-1)![1];
      expect(pushed).toBeGreaterThan(0);
      expect(pushed).toBeLessThan(0.1); // 4 bars at 60 BPM = 0.0625 Hz, the slowest note that fits
    });

    it('Sync -> Free keeps what the user hears: the resolved Hz becomes the Free rate, and the `sync` key is gone', async () => {
      const { useAudioStore, lfoEngine } = await setup('a', { ...FREE_LANE, rate: 9, sync: EIGHTH_DOTTED }, 60);

      useAudioStore.getState().setLfoBankLaneSyncMode('a', false);

      const lane = useAudioStore.getState().lfoBank.a;
      expect('sync' in lane).toBe(false);
      expect(lane.rate).toBeCloseTo(1.35, 10); // 1/8 dotted at 60 BPM = 0.75 s
      expect(lfoEngine.setBankRate).toHaveBeenLastCalledWith('a', lane.rate);
    });

    it('a Free -> Sync -> Free round trip leaves no `sync` key and the lane within one slider step of where it started', async () => {
      const { useAudioStore } = await setup('a', FREE_LANE, 60);

      useAudioStore.getState().setLfoBankLaneSyncMode('a', true);
      useAudioStore.getState().setLfoBankLaneSyncMode('a', false);

      const lane = useAudioStore.getState().lfoBank.a;
      expect('sync' in lane).toBe(false);
      expect(lane.rate).toBeCloseTo(1.5, 10);
      expect(lane.shape).toBe('sine');
    });

    it('Sync -> Free at a tempo where the note is slower than one slider step floors at one step, never 0 (a running lane must not stop)', async () => {
      const { useAudioStore, lfoEngine } = await setup('a', { ...FREE_LANE, sync: { division: '4', modifier: 'straight' } }, 20);

      useAudioStore.getState().setLfoBankLaneSyncMode('a', false);

      expect(useAudioStore.getState().lfoBank.a.rate).toBeGreaterThan(0);
      expect(vi.mocked(lfoEngine.setBankRate).mock.calls.at(-1)![1]).toBeGreaterThan(0);
    });

    it('setting Free on an already-Free lane changes nothing but still carries no `sync` key — a held 0 Hz stays 0', async () => {
      const { useAudioStore } = await setup('a', { ...FREE_LANE, rate: 0 }, 60);

      useAudioStore.getState().setLfoBankLaneSyncMode('a', false);

      expect(useAudioStore.getState().lfoBank.a).toStrictEqual({ ...FREE_LANE, rate: 0 });
    });

    it('setting Sync on an already-synced lane keeps its note — a stale Free rate is not a request to re-snap', async () => {
      const { useAudioStore } = await setup('a', { ...FREE_LANE, rate: 9, sync: EIGHTH_DOTTED }, 60);

      useAudioStore.getState().setLfoBankLaneSyncMode('a', true);

      expect(useAudioStore.getState().lfoBank.a.sync).toEqual(EIGHTH_DOTTED);
    });

    it('touches only the named lane', async () => {
      const { useAudioStore } = await setup('a', FREE_LANE, 60);
      const before = useAudioStore.getState().lfoBank;

      useAudioStore.getState().setLfoBankLaneSyncMode('a', true);

      expect(useAudioStore.getState().lfoBank.b).toBe(before.b);
      expect(useAudioStore.getState().lfoBank.c).toBe(before.c);
      expect(useAudioStore.getState().lfoBank.d).toBe(before.d);
    });

    it('keeps the lane JSON-serialisable in both modes (state rule — no undefined `sync` key, no functions)', async () => {
      const { useAudioStore } = await setup('a', FREE_LANE, 60);

      useAudioStore.getState().setLfoBankLaneSyncMode('a', true);
      expect(JSON.parse(JSON.stringify(useAudioStore.getState().lfoBank.a))).toEqual(useAudioStore.getState().lfoBank.a);

      useAudioStore.getState().setLfoBankLaneSyncMode('a', false);
      expect(JSON.stringify(useAudioStore.getState().lfoBank.a)).not.toContain('sync');
    });
  });
});

// docs/specs/FREE_SYNC_TOGGLE.md §1.3 (delay rows), §1.5, §1.6, Task 11: the engine only ever hears
// plain seconds. A synced Delay resolves from the store's bpm at every push site; a Free one — and any
// partial that carries neither `delayTime` nor `sync`, i.e. an Audio Swell's `{ wet }` — is untouched.
describe('useAudioStore - Delay Sync (docs/specs/FREE_SYNC_TOGGLE.md Task 11)', () => {
  const QUARTER = { division: '1/4', modifier: 'straight' } as const;
  const EIGHTH_DOTTED = { division: '1/8', modifier: 'dotted' } as const;
  const QUARTER_TRIPLET = { division: '1/4', modifier: 'triplet' } as const;
  const FOUR_BARS = { division: '4', modifier: 'straight' } as const;
  const FREE_DELAY = { delayTime: 0.9, feedback: 0.3, wet: 0.25 } as const;

  beforeEach(() => {
    vi.resetModules();
  });

  /** A fresh store with the given delay and bpm installed, every mock cleared. */
  async function setup(delay: Record<string, unknown>, bpm = 60) {
    const { useAudioStore, applyGlobalAudioToEngine } = await import('./audioStore');
    const { AudioEngine } = await import('../engine/AudioEngine');
    const { lfoEngine } = await import('../engine/lfoEngine');
    useAudioStore.setState({
      bpm,
      globalAudio: { ...useAudioStore.getState().globalAudio, delay: delay as never },
    });
    vi.clearAllMocks();
    return { useAudioStore, applyGlobalAudioToEngine, AudioEngine, lfoEngine };
  }

  /** The single argument of the last AudioEngine.setGlobalDelay call. */
  function lastDelayPush(AudioEngine: { setGlobalDelay: unknown }): Record<string, unknown> {
    return vi.mocked(AudioEngine.setGlobalDelay as (p: unknown) => void).mock.calls.at(-1)![0] as Record<string, unknown>;
  }

  describe('setGlobalAudio(\'delay\', …)', () => {
    it('a `sync` partial pushes the resolved seconds — 1/4 is 1 s at 60 BPM — and no `sync` key', async () => {
      const { useAudioStore, AudioEngine } = await setup(FREE_DELAY, 60);

      useAudioStore.getState().setGlobalAudio('delay', { sync: QUARTER });

      expect(AudioEngine.setGlobalDelay).toHaveBeenCalledTimes(1);
      expect(lastDelayPush(AudioEngine)).toStrictEqual({ delayTime: 1 });
    });

    it('resolves against the store\'s current bpm — the same note is 0.5 s at 120 BPM', async () => {
      const { useAudioStore, AudioEngine } = await setup(FREE_DELAY, 120);

      useAudioStore.getState().setGlobalAudio('delay', { sync: QUARTER });

      expect(lastDelayPush(AudioEngine)).toStrictEqual({ delayTime: 0.5 });
    });

    it('stores the note itself in state, not the seconds it resolves to', async () => {
      const { useAudioStore } = await setup(FREE_DELAY, 60);

      useAudioStore.getState().setGlobalAudio('delay', { sync: EIGHTH_DOTTED });

      expect(useAudioStore.getState().globalAudio.delay.sync).toEqual(EIGHTH_DOTTED);
      expect(useAudioStore.getState().globalAudio.delay.delayTime).toBe(0.9); // the Free value underneath, untouched
    });

    it('a Free `delayTime` partial is forwarded as that number', async () => {
      const { useAudioStore, AudioEngine } = await setup(FREE_DELAY, 60);

      useAudioStore.getState().setGlobalAudio('delay', { delayTime: 0.3 });

      expect(lastDelayPush(AudioEngine)).toStrictEqual({ delayTime: 0.3 });
    });

    it('a Free `delayTime` edit on a synced Delay re-sends the synced seconds, not the number just typed', async () => {
      const { useAudioStore, AudioEngine } = await setup({ ...FREE_DELAY, sync: QUARTER }, 60);

      useAudioStore.getState().setGlobalAudio('delay', { delayTime: 0.3 });

      expect(lastDelayPush(AudioEngine)).toStrictEqual({ delayTime: 1 });
      expect(useAudioStore.getState().globalAudio.delay.delayTime).toBe(0.3); // still recorded underneath
    });

    it('an Audio Swell\'s `{ wet }` is forwarded exactly — no delayTime added — on a Free Delay', async () => {
      const { useAudioStore, AudioEngine } = await setup(FREE_DELAY, 60);

      useAudioStore.getState().setGlobalAudio('delay', { wet: 0.4 });

      expect(AudioEngine.setGlobalDelay).toHaveBeenCalledTimes(1);
      expect(lastDelayPush(AudioEngine)).toStrictEqual({ wet: 0.4 });
    });

    it('an Audio Swell\'s `{ wet }` is forwarded exactly on a SYNCED Delay too — the swell path must not re-push the time every tick', async () => {
      const { useAudioStore, AudioEngine } = await setup({ ...FREE_DELAY, sync: QUARTER }, 60);

      useAudioStore.getState().setGlobalAudio('delay', { wet: 0.4 });

      expect(lastDelayPush(AudioEngine)).toStrictEqual({ wet: 0.4 });
    });

    it('`{ feedback }` alone is forwarded exactly, on a synced Delay as well', async () => {
      const { useAudioStore, AudioEngine } = await setup({ ...FREE_DELAY, sync: QUARTER }, 60);

      useAudioStore.getState().setGlobalAudio('delay', { feedback: 0.45 });

      expect(lastDelayPush(AudioEngine)).toStrictEqual({ feedback: 0.45 });
    });

    it('a partial carrying `sync` plus other keys pushes those keys alongside the resolved seconds, still with no `sync`', async () => {
      const { useAudioStore, AudioEngine } = await setup(FREE_DELAY, 60);

      useAudioStore.getState().setGlobalAudio('delay', { sync: QUARTER, feedback: 0.5 });

      expect(lastDelayPush(AudioEngine)).toStrictEqual({ feedback: 0.5, delayTime: 1 });
    });

    it('clamps a note longer than the node allows into 10 s — 4 bars at 40 BPM is 24 s', async () => {
      const { useAudioStore, AudioEngine } = await setup(FREE_DELAY, 40);

      useAudioStore.getState().setGlobalAudio('delay', { sync: FOUR_BARS });

      expect(lastDelayPush(AudioEngine)).toStrictEqual({ delayTime: 10 });
    });

    it('an explicit `sync: undefined` is a no-op: the Delay stays synced, no `undefined` lands in state, nothing is pushed', async () => {
      const { useAudioStore, AudioEngine } = await setup({ ...FREE_DELAY, sync: QUARTER }, 60);

      useAudioStore.getState().setGlobalAudio('delay', { sync: undefined });

      expect(useAudioStore.getState().globalAudio.delay.sync).toEqual(QUARTER);
      expect(AudioEngine.setGlobalDelay).not.toHaveBeenCalled();
    });

    it('an undefined-valued key is dropped from the merge while the rest of the partial still applies', async () => {
      const { useAudioStore, AudioEngine } = await setup(FREE_DELAY, 60);

      useAudioStore.getState().setGlobalAudio('delay', { sync: undefined, feedback: 0.45 });

      expect('sync' in useAudioStore.getState().globalAudio.delay).toBe(false);
      expect(useAudioStore.getState().globalAudio.delay.feedback).toBe(0.45);
      expect(lastDelayPush(AudioEngine)).toStrictEqual({ feedback: 0.45 });
    });

    it('leaves every other effect\'s setter untouched', async () => {
      const { useAudioStore, AudioEngine } = await setup(FREE_DELAY, 60);

      useAudioStore.getState().setGlobalAudio('delay', { sync: QUARTER });

      expect(AudioEngine.setGlobalReverb).not.toHaveBeenCalled();
      expect(AudioEngine.setGlobalCompressor).not.toHaveBeenCalled();
    });
  });

  describe('applyGlobalAudioToEngine(globalAudio, bpm)', () => {
    it('pushes a Free Delay as it is stored', async () => {
      const { useAudioStore, applyGlobalAudioToEngine, AudioEngine } = await setup(FREE_DELAY, 60);

      applyGlobalAudioToEngine(useAudioStore.getState().globalAudio, 60);

      expect(lastDelayPush(AudioEngine)).toStrictEqual(FREE_DELAY);
    });

    it('pushes a synced Delay with delayTime resolved at the given bpm, feedback/wet kept, and no `sync` key', async () => {
      const { useAudioStore, applyGlobalAudioToEngine, AudioEngine } = await setup({ ...FREE_DELAY, sync: QUARTER }, 60);

      applyGlobalAudioToEngine(useAudioStore.getState().globalAudio, 60);

      expect(lastDelayPush(AudioEngine)).toStrictEqual({ delayTime: 1, feedback: 0.3, wet: 0.25 });
    });

    it('uses the bpm it is GIVEN, not whatever the store holds — a session restore passes its own tempo', async () => {
      const { useAudioStore, applyGlobalAudioToEngine, AudioEngine } = await setup({ ...FREE_DELAY, sync: QUARTER }, 60);

      applyGlobalAudioToEngine(useAudioStore.getState().globalAudio, 120);

      expect(lastDelayPush(AudioEngine).delayTime).toBe(0.5);
    });

    it('does not mutate the object it is given — the stored Delay keeps its `sync`', async () => {
      const { useAudioStore, applyGlobalAudioToEngine } = await setup({ ...FREE_DELAY, sync: QUARTER }, 60);
      const globalAudio = useAudioStore.getState().globalAudio;

      applyGlobalAudioToEngine(globalAudio, 60);

      expect(globalAudio.delay.sync).toEqual(QUARTER);
      expect(globalAudio.delay.delayTime).toBe(0.9);
    });

    it('still pushes every other effect exactly as stored', async () => {
      const { useAudioStore, applyGlobalAudioToEngine, AudioEngine } = await setup({ ...FREE_DELAY, sync: QUARTER }, 60);
      const { globalAudio } = useAudioStore.getState();

      applyGlobalAudioToEngine(globalAudio, 60);

      expect(AudioEngine.setGlobalCompressor).toHaveBeenCalledWith(globalAudio.compressor);
      expect(AudioEngine.setGlobalEQ).toHaveBeenCalledWith(globalAudio.eq3);
      expect(AudioEngine.setGlobalFilterLPF).toHaveBeenCalledWith(globalAudio.filterLPF);
      expect(AudioEngine.setGlobalFilterHPF).toHaveBeenCalledWith(globalAudio.filterHPF);
      expect(AudioEngine.setGlobalLimiter).toHaveBeenCalledWith(globalAudio.limiter);
      expect(AudioEngine.setGlobalReverb).toHaveBeenCalledWith(globalAudio.reverb);
    });
  });

  describe('regenerateGlobalAudioFromSeed', () => {
    afterEach(() => {
      vi.doUnmock('../utils/globalAudioSeed');
    });

    it('resolves a seeded synced Delay at the store\'s current bpm (Task 13 will seed one; the wiring must already be there)', async () => {
      vi.doMock('../utils/globalAudioSeed', async (importOriginal) => {
        const real = await importOriginal<typeof import('../utils/globalAudioSeed')>();
        return {
          ...real,
          generateGlobalAudioSettings: (...args: Parameters<typeof real.generateGlobalAudioSettings>) => {
            const generated = real.generateGlobalAudioSettings(...args);
            return { ...generated, delay: { ...generated.delay, sync: QUARTER } };
          },
        };
      });
      const { useAudioStore } = await import('./audioStore');
      const { AudioEngine } = await import('../engine/AudioEngine');
      useAudioStore.setState({ bpm: 120 });
      vi.clearAllMocks();

      useAudioStore.getState().regenerateGlobalAudioFromSeed('delay-sync-regen', 'Delay Sync Regen');

      expect(lastDelayPush(AudioEngine).delayTime).toBe(0.5);
      expect('sync' in lastDelayPush(AudioEngine)).toBe(false);
      expect(useAudioStore.getState().globalAudio.delay.sync).toEqual(QUARTER); // state keeps the note
    });
  });

  describe('setBPM re-applies a synced Delay (spec §1.6)', () => {
    it('re-pushes the resolved seconds at the new tempo — 1/4 is 1 s at 60 and 0.5 s at 120', async () => {
      const { useAudioStore, AudioEngine } = await setup({ ...FREE_DELAY, sync: QUARTER }, 60);

      useAudioStore.getState().setBPM(120);

      expect(AudioEngine.setGlobalDelay).toHaveBeenCalledTimes(1);
      expect(lastDelayPush(AudioEngine)).toStrictEqual({ delayTime: 0.5 });
    });

    it('pushes the resolved seconds, not the Free delayTime stored underneath the sync', async () => {
      const { useAudioStore, AudioEngine } = await setup({ ...FREE_DELAY, delayTime: 7, sync: EIGHTH_DOTTED }, 60);

      useAudioStore.getState().setBPM(90);

      // 1/8 dotted = 0.75 beats; at 90 BPM a beat is 2/3 s
      expect(lastDelayPush(AudioEngine).delayTime).toBeCloseTo(0.75 * (60 / 90), 10);
    });

    it('never touches a Free Delay', async () => {
      const { useAudioStore, AudioEngine } = await setup(FREE_DELAY, 60);

      useAudioStore.getState().setBPM(120);

      expect(AudioEngine.setGlobalDelay).not.toHaveBeenCalled();
    });

    it('clamps into the node\'s range as the tempo drops — 4 bars is 16 s at 60 BPM, so the push is 10', async () => {
      const { useAudioStore, AudioEngine } = await setup({ ...FREE_DELAY, sync: FOUR_BARS }, 120);

      useAudioStore.getState().setBPM(60);

      expect(lastDelayPush(AudioEngine)).toStrictEqual({ delayTime: 10 });
    });

    it('moving the tempo back restores the note\'s own seconds — the clamp is never written into state', async () => {
      const { useAudioStore, AudioEngine } = await setup({ ...FREE_DELAY, sync: FOUR_BARS }, 120);

      useAudioStore.getState().setBPM(60);
      useAudioStore.getState().setBPM(120);

      expect(useAudioStore.getState().globalAudio.delay.sync).toEqual(FOUR_BARS);
      expect(lastDelayPush(AudioEngine)).toStrictEqual({ delayTime: 8 }); // 16 beats at 120 BPM
    });

    it('re-pushes the Delay and a synced lane together, each at its own note', async () => {
      const { useAudioStore, AudioEngine, lfoEngine } = await setup({ ...FREE_DELAY, sync: QUARTER }, 60);
      const lfoBank = { ...useAudioStore.getState().lfoBank };
      lfoBank.a = { shape: 'sine', rate: 1.5, rateDrift: 0, depthDrift: 0, sync: EIGHTH_DOTTED };
      useAudioStore.setState({ lfoBank });
      vi.clearAllMocks();

      useAudioStore.getState().setBPM(120);

      expect(lastDelayPush(AudioEngine)).toStrictEqual({ delayTime: 0.5 });
      expect(lfoEngine.setBankRate).toHaveBeenCalledWith('a', 1 / 0.375);
    });

    it('runs after the transport has the new tempo', async () => {
      const { useAudioStore, AudioEngine } = await setup({ ...FREE_DELAY, sync: QUARTER }, 60);

      useAudioStore.getState().setBPM(120);

      const bpmOrder = vi.mocked(AudioEngine.setBPM).mock.invocationCallOrder[0];
      const delayOrder = vi.mocked(AudioEngine.setGlobalDelay).mock.invocationCallOrder[0];
      expect(bpmOrder).toBeLessThan(delayOrder);
    });
  });

  describe('setDelaySyncMode', () => {
    it('Free -> Sync snaps to the nearest allowed note, keeps delayTime underneath, and pushes that note\'s seconds', async () => {
      const { useAudioStore, AudioEngine } = await setup(FREE_DELAY, 60);

      useAudioStore.getState().setDelaySyncMode(true);

      // 0.9 s: 1/4 (1 s) is 0.1 away, 1/8 dotted (0.75 s) is 0.15 away
      expect(useAudioStore.getState().globalAudio.delay).toStrictEqual({ ...FREE_DELAY, sync: QUARTER });
      expect(AudioEngine.setGlobalDelay).toHaveBeenCalledTimes(1);
      expect(lastDelayPush(AudioEngine)).toStrictEqual({ delayTime: 1 });
    });

    it('Sync -> Free keeps what the user hears: delayTime becomes the resolved seconds and `sync` is DELETED', async () => {
      const { useAudioStore, AudioEngine } = await setup({ ...FREE_DELAY, delayTime: 7, sync: EIGHTH_DOTTED }, 60);

      useAudioStore.getState().setDelaySyncMode(false);

      const delay = useAudioStore.getState().globalAudio.delay;
      expect(delay).toStrictEqual({ delayTime: 0.75, feedback: 0.3, wet: 0.25 });
      expect('sync' in delay).toBe(false);
      expect(lastDelayPush(AudioEngine)).toStrictEqual({ delayTime: 0.75 });
    });

    it('Sync -> Free quantises to the slider step, and pushes the same number it stored (no audible jump)', async () => {
      // 1/4 triplet at 70 BPM = (2/3) * 60/70 = 0.571428… s
      const { useAudioStore, AudioEngine } = await setup({ ...FREE_DELAY, sync: QUARTER_TRIPLET }, 70);

      useAudioStore.getState().setDelaySyncMode(false);

      const stored = useAudioStore.getState().globalAudio.delay.delayTime;
      expect(stored).toBe(0.571);
      expect(lastDelayPush(AudioEngine).delayTime).toBe(stored);
    });

    it('Sync -> Free from a clamped note stores the clamped seconds — what was audible — not the raw 24 s', async () => {
      const { useAudioStore } = await setup({ ...FREE_DELAY, sync: FOUR_BARS }, 40);

      useAudioStore.getState().setDelaySyncMode(false);

      expect(useAudioStore.getState().globalAudio.delay.delayTime).toBe(10);
    });

    it('a Free -> Sync -> Free round trip leaves no `sync` key anywhere in the serialised delay', async () => {
      const { useAudioStore } = await setup(FREE_DELAY, 60);

      useAudioStore.getState().setDelaySyncMode(true);
      useAudioStore.getState().setDelaySyncMode(false);

      expect(JSON.stringify(useAudioStore.getState().globalAudio.delay)).not.toContain('sync');
    });

    it('keeps the stored state JSON-serialisable while synced (no functions, no undefined keys)', async () => {
      const { useAudioStore } = await setup(FREE_DELAY, 60);

      useAudioStore.getState().setDelaySyncMode(true);

      const delay = useAudioStore.getState().globalAudio.delay;
      expect(JSON.parse(JSON.stringify(delay))).toStrictEqual(delay);
    });

    it('setting Sync on an already-synced Delay keeps its note — a stale Free delayTime is not a request to re-snap', async () => {
      const { useAudioStore, AudioEngine } = await setup({ ...FREE_DELAY, delayTime: 7, sync: EIGHTH_DOTTED }, 60);

      useAudioStore.getState().setDelaySyncMode(true);

      expect(useAudioStore.getState().globalAudio.delay.sync).toEqual(EIGHTH_DOTTED);
      expect(lastDelayPush(AudioEngine)).toStrictEqual({ delayTime: 0.75 });
    });

    it('setting Free on an already-Free Delay changes nothing and pushes its own delayTime', async () => {
      const { useAudioStore, AudioEngine } = await setup(FREE_DELAY, 60);

      useAudioStore.getState().setDelaySyncMode(false);

      expect(useAudioStore.getState().globalAudio.delay).toStrictEqual(FREE_DELAY);
      expect(lastDelayPush(AudioEngine)).toStrictEqual({ delayTime: 0.9 });
    });

    it('a Delay at 0 s snaps to the shortest allowed note, not to NaN or a crash', async () => {
      const { useAudioStore, AudioEngine } = await setup({ ...FREE_DELAY, delayTime: 0 }, 60);
      const { allowedDelayNoteValues } = await import('../utils/tempoSync');

      useAudioStore.getState().setDelaySyncMode(true);

      const shortest = allowedDelayNoteValues(60)[0];
      expect(useAudioStore.getState().globalAudio.delay.sync).toEqual(shortest);
      expect(lastDelayPush(AudioEngine).delayTime).toBeGreaterThan(0);
    });

    it('a Delay at the 10 s ceiling on a slow tempo snaps to a note that fits, and never pushes past 10', async () => {
      const { useAudioStore, AudioEngine } = await setup({ ...FREE_DELAY, delayTime: 10 }, 40);
      const { allowedDelayNoteValues } = await import('../utils/tempoSync');

      useAudioStore.getState().setDelaySyncMode(true);

      expect(useAudioStore.getState().globalAudio.delay.sync).toEqual(allowedDelayNoteValues(40).at(-1));
      expect(lastDelayPush(AudioEngine).delayTime as number).toBeLessThanOrEqual(10);
    });

    it('leaves feedback, wet and every other effect alone, and pushes nothing but delayTime', async () => {
      const { useAudioStore, AudioEngine } = await setup(FREE_DELAY, 60);
      const before = useAudioStore.getState().globalAudio;

      useAudioStore.getState().setDelaySyncMode(true);

      const after = useAudioStore.getState().globalAudio;
      expect(after.delay.feedback).toBe(0.3);
      expect(after.delay.wet).toBe(0.25);
      expect(after.reverb).toBe(before.reverb);
      expect(after.compressor).toBe(before.compressor);
      expect(Object.keys(lastDelayPush(AudioEngine))).toEqual(['delayTime']);
      expect(AudioEngine.setGlobalReverb).not.toHaveBeenCalled();
    });

    it('does not touch the LFO Bank engine', async () => {
      const { useAudioStore, lfoEngine } = await setup(FREE_DELAY, 60);

      useAudioStore.getState().setDelaySyncMode(true);

      expect(lfoEngine.setBankRate).not.toHaveBeenCalled();
    });
  });
});

describe('useAudioStore - globalLfoLinks state (docs/tasks/LFO_BANK.md Task 8)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('has one entry per GlobalLfoTargetId, JSON-serializable', async () => {
    const { useAudioStore } = await import('./audioStore');
    const { globalLfoLinks } = useAudioStore.getState();
    expect(Object.keys(globalLfoLinks).sort()).toEqual([...GLOBAL_LFO_TARGET_IDS].sort());
    expect(() => JSON.stringify(globalLfoLinks)).not.toThrow();
  });
});

describe('useAudioStore - setGlobalLfoLink', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('updates globalLfoLinks state for the given target', async () => {
    const { useAudioStore } = await import('./audioStore');
    useAudioStore.getState().setGlobalLfoLink('eq3.low', { lane: 'a', depth: 40 });
    expect(useAudioStore.getState().globalLfoLinks['eq3.low']).toEqual({ lane: 'a', depth: 40 });
  });

  it('calls linkTarget with the target and link, and no robotId', async () => {
    const { useAudioStore } = await import('./audioStore');
    const { lfoEngine } = await import('../engine/lfoEngine');
    vi.clearAllMocks();

    useAudioStore.getState().setGlobalLfoLink('eq3.low', { lane: 'a', depth: 40 });

    expect(lfoEngine.linkTarget).toHaveBeenCalledWith('eq3.low', { lane: 'a', depth: 40 });
    expect(lfoEngine.linkTarget).toHaveBeenCalledTimes(1);
  });

  it('touches only the named target — every other target\'s link is untouched', async () => {
    const { useAudioStore } = await import('./audioStore');
    const before = useAudioStore.getState().globalLfoLinks;

    useAudioStore.getState().setGlobalLfoLink('hpf.Q', { lane: 'b', depth: 30 });

    expect(useAudioStore.getState().globalLfoLinks['eq3.low']).toEqual(before['eq3.low']);
  });

  it('is a safe no-op for an undefined link — e.g. a hole left by a malformed session payload — instead of throwing', async () => {
    const { useAudioStore } = await import('./audioStore');
    const { lfoEngine } = await import('../engine/lfoEngine');
    const before = useAudioStore.getState().globalLfoLinks;
    vi.clearAllMocks();

    expect(() => useAudioStore.getState().setGlobalLfoLink('eq3.low', undefined as unknown as import('../types/lfo').LfoLink)).not.toThrow();

    expect(useAudioStore.getState().globalLfoLinks).toEqual(before);
    expect(lfoEngine.linkTarget).not.toHaveBeenCalled();
  });
});

describe('useAudioStore - LFO Bank / global links Attenuation-Style-sync seeding (docs/tasks/LFO_BANK.md Task 8)', () => {
  beforeEach(() => {
    vi.resetModules();
    // The lfoEngine mock's call history persists across vi.resetModules() (same quirk documented
    // elsewhere in this file) — clear it so each test only sees its own fresh import's calls.
    vi.clearAllMocks();
  });

  it('seeds lfoBank for the current Attenuation Style on module load (app init)', async () => {
    const { useAudioStore } = await import('./audioStore');
    const { lfoBank } = useAudioStore.getState();
    // The four lanes draw from disjoint rate bands (LFO_BANK_RATE_BANDS) — seeded, not left
    // at DEFAULT_BANK_LFO's inert rate 0 for every lane.
    const rates = LFO_LANE_IDS.map((lane) => lfoBank[lane].rate);
    expect(rates.every((r) => r > 0)).toBe(true);
  });

  it('seeds globalLfoLinks for the current Attenuation Style on module load (app init)', async () => {
    const { useAudioStore } = await import('./audioStore');
    const { globalLfoLinks } = useAudioStore.getState();
    // At least one of the 7 global targets should have rolled a lane across a real seed —
    // same statistical-spot-check style as the lfoBank seeding test above.
    const lanes = GLOBAL_LFO_TARGET_IDS.map((t) => globalLfoLinks[t].lane);
    expect(lanes.some((lane) => lane !== null)).toBe(true);
  });

  it('does not touch the bank engine during seeding — data-only, deferred to AudioEngine.start() (Task 10)', async () => {
    await import('./audioStore');
    const { lfoEngine } = await import('../engine/lfoEngine');

    expect(lfoEngine.primeLfoBank).not.toHaveBeenCalled();
    expect(lfoEngine.setBankRate).not.toHaveBeenCalled();
    expect(lfoEngine.setBankShape).not.toHaveBeenCalled();
    expect(lfoEngine.linkTarget).not.toHaveBeenCalled();
  });

  it('follows setCurrentAttenuationStyleId — switching reseeds lfoBank and globalLfoLinks automatically', async () => {
    const { useAudioStore } = await import('./audioStore');
    const { useAttenuationStyleStore, DEFAULT_PELAGOS } = await import('./attenuationStyleStore');

    const beforeBank = useAudioStore.getState().lfoBank;
    const beforeLinks = useAudioStore.getState().globalLfoLinks;
    useAttenuationStyleStore.getState().addAttenuationStyle({ ...DEFAULT_PELAGOS, id: 'zenith-bank', name: 'ZenithBank' });
    useAttenuationStyleStore.getState().setCurrentAttenuationStyleId('zenith-bank');

    expect(useAudioStore.getState().lfoBank).not.toEqual(beforeBank);
    expect(useAudioStore.getState().globalLfoLinks).not.toEqual(beforeLinks);
  });
});

describe('useAudioStore - pingVarianceAutomation / setPingVarianceAutomation', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('seeds into [0.10, 0.60] on module load (the first regenerateGlobalAudioFromSeed call) — docs/specs/AUTOMATION_FREQUENCY_DURATION_SPLIT.md §1.2, narrowed from [0.33, 0.66]', async () => {
    const { useAudioStore } = await import('./audioStore');
    const { pingVarianceAutomation } = useAudioStore.getState();
    expect(pingVarianceAutomation).toBeGreaterThanOrEqual(0.10);
    expect(pingVarianceAutomation).toBeLessThanOrEqual(0.60);
  });

  it('setPingVarianceAutomation updates the store directly — a plain write, no AudioEngine call', async () => {
    const { useAudioStore } = await import('./audioStore');
    const { AudioEngine } = await import('../engine/AudioEngine');
    const reverbCallsBefore = vi.mocked(AudioEngine.setGlobalReverb).mock.calls.length;

    useAudioStore.getState().setPingVarianceAutomation(0.9);
    expect(useAudioStore.getState().pingVarianceAutomation).toBe(0.9);

    expect(vi.mocked(AudioEngine.setGlobalReverb).mock.calls.length).toBe(reverbCallsBefore);
  });

  it('carries the seeded value forward across a later Attenuation Style switch — does not reseed', async () => {
    const { useAudioStore } = await import('./audioStore');
    const seeded = useAudioStore.getState().pingVarianceAutomation;

    useAudioStore.getState().regenerateGlobalAudioFromSeed('a-different-as-id', 'Zenith');

    expect(useAudioStore.getState().pingVarianceAutomation).toBe(seeded);
  });

  it('carries a hand-dragged value forward across a later Attenuation Style switch too', async () => {
    const { useAudioStore } = await import('./audioStore');
    useAudioStore.getState().setPingVarianceAutomation(0.9); // outside the [0.10, 0.60] seed range, so it's unambiguous

    useAudioStore.getState().regenerateGlobalAudioFromSeed('a-different-as-id', 'Zenith');

    expect(useAudioStore.getState().pingVarianceAutomation).toBe(0.9);
  });

  it('no longer coexists with the old audioSwellsEnabled/setAudioSwellsEnabled fields it replaces (docs/tasks/PING-VARIANCE-AUTOMATION.md Task 7)', async () => {
    const { useAudioStore } = await import('./audioStore');
    const state = useAudioStore.getState();
    expect('audioSwellsEnabled' in state).toBe(false);
    expect('setAudioSwellsEnabled' in state).toBe(false);
  });
});

describe('useAudioStore - swellFrequency / setSwellFrequency (docs/specs/AUTOMATION_FREQUENCY_DURATION_SPLIT.md §1.5)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('seeds into [2, 8] on module load (the first regenerateGlobalAudioFromSeed call)', async () => {
    const { useAudioStore } = await import('./audioStore');
    const { swellFrequency } = useAudioStore.getState();
    expect(swellFrequency).toBeGreaterThanOrEqual(2);
    expect(swellFrequency).toBeLessThanOrEqual(8);
  });

  it('setSwellFrequency updates the store directly — a plain write, no AudioEngine call', async () => {
    const { useAudioStore } = await import('./audioStore');
    const { AudioEngine } = await import('../engine/AudioEngine');
    const reverbCallsBefore = vi.mocked(AudioEngine.setGlobalReverb).mock.calls.length;

    useAudioStore.getState().setSwellFrequency(20);
    expect(useAudioStore.getState().swellFrequency).toBe(20);

    expect(vi.mocked(AudioEngine.setGlobalReverb).mock.calls.length).toBe(reverbCallsBefore);
  });

  it('carries the seeded value forward across a later Attenuation Style switch — does not reseed', async () => {
    const { useAudioStore } = await import('./audioStore');
    const seeded = useAudioStore.getState().swellFrequency;

    useAudioStore.getState().regenerateGlobalAudioFromSeed('a-different-as-id', 'Zenith');

    expect(useAudioStore.getState().swellFrequency).toBe(seeded);
  });

  it('carries a hand-dragged value forward across a later Attenuation Style switch too', async () => {
    const { useAudioStore } = await import('./audioStore');
    useAudioStore.getState().setSwellFrequency(20); // outside the [2, 8] seed range, so it's unambiguous

    useAudioStore.getState().regenerateGlobalAudioFromSeed('a-different-as-id', 'Zenith');

    expect(useAudioStore.getState().swellFrequency).toBe(20);
  });
});

describe('useAudioStore - swellDuration / setSwellDuration (docs/specs/AUTOMATION_FREQUENCY_DURATION_SPLIT.md §1.5)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('seeds into [2, 8] on module load (the first regenerateGlobalAudioFromSeed call)', async () => {
    const { useAudioStore } = await import('./audioStore');
    const { swellDuration } = useAudioStore.getState();
    expect(swellDuration).toBeGreaterThanOrEqual(2);
    expect(swellDuration).toBeLessThanOrEqual(8);
  });

  it('setSwellDuration updates the store directly — a plain write, no AudioEngine call', async () => {
    const { useAudioStore } = await import('./audioStore');
    const { AudioEngine } = await import('../engine/AudioEngine');
    const reverbCallsBefore = vi.mocked(AudioEngine.setGlobalReverb).mock.calls.length;

    useAudioStore.getState().setSwellDuration(20);
    expect(useAudioStore.getState().swellDuration).toBe(20);

    expect(vi.mocked(AudioEngine.setGlobalReverb).mock.calls.length).toBe(reverbCallsBefore);
  });

  it('carries the seeded value forward across a later Attenuation Style switch — does not reseed', async () => {
    const { useAudioStore } = await import('./audioStore');
    const seeded = useAudioStore.getState().swellDuration;

    useAudioStore.getState().regenerateGlobalAudioFromSeed('a-different-as-id', 'Zenith');

    expect(useAudioStore.getState().swellDuration).toBe(seeded);
  });

  it('carries a hand-dragged value forward across a later Attenuation Style switch too', async () => {
    const { useAudioStore } = await import('./audioStore');
    useAudioStore.getState().setSwellDuration(20); // outside the [2, 8] seed range, so it's unambiguous

    useAudioStore.getState().regenerateGlobalAudioFromSeed('a-different-as-id', 'Zenith');

    expect(useAudioStore.getState().swellDuration).toBe(20);
  });
});

describe('useAudioStore - regenerateBpmFromSeed (docs/specs/FREE_SYNC_TOGGLE.md §1.7)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('calls setBPM with exactly generateAttenuationStyleBpm(id, name)\'s result', async () => {
    const { useAudioStore } = await import('./audioStore');
    const { generateAttenuationStyleBpm } = await import('../utils/bpmSeed');
    const { AudioEngine } = await import('../engine/AudioEngine');
    vi.clearAllMocks();

    useAudioStore.getState().regenerateBpmFromSeed('bpm-store-test-as', 'Bpm Store Test');

    const expected = generateAttenuationStyleBpm('bpm-store-test-as', 'Bpm Store Test');
    expect(useAudioStore.getState().bpm).toBe(expected);
    expect(AudioEngine.setBPM).toHaveBeenCalledWith(expected);
  });

  it('a second call for a different Attenuation Style reflects that call\'s own fresh draw, not a stale value left by the first', async () => {
    const { useAudioStore } = await import('./audioStore');
    const { generateAttenuationStyleBpm } = await import('../utils/bpmSeed');

    useAudioStore.getState().regenerateBpmFromSeed('bpm-store-test-as-a', 'Bpm Store Alpha');
    expect(useAudioStore.getState().bpm).toBe(generateAttenuationStyleBpm('bpm-store-test-as-a', 'Bpm Store Alpha'));

    useAudioStore.getState().regenerateBpmFromSeed('bpm-store-test-as-b', 'Bpm Store Beta');
    expect(useAudioStore.getState().bpm).toBe(generateAttenuationStyleBpm('bpm-store-test-as-b', 'Bpm Store Beta'));
  });
});

describe('useAudioStore - BPM Attenuation Style sync (docs/specs/FREE_SYNC_TOGGLE.md §1.7)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('seeds bpm for the Attenuation Style current at boot, within BPM_SEED_RANGE', async () => {
    const { useAudioStore } = await import('./audioStore');
    const { BPM_SEED_RANGE } = await import('../utils/bpmSeed');

    const { bpm } = useAudioStore.getState();
    expect(bpm).toBeGreaterThanOrEqual(BPM_SEED_RANGE.min);
    expect(bpm).toBeLessThanOrEqual(BPM_SEED_RANGE.max);
  });

  it('matches generateAttenuationStyleBpm for the default Attenuation Style\'s own id/name exactly', async () => {
    const { useAudioStore } = await import('./audioStore');
    const { DEFAULT_PELAGOS } = await import('./attenuationStyleStore');
    const { generateAttenuationStyleBpm } = await import('../utils/bpmSeed');

    expect(useAudioStore.getState().bpm).toBe(generateAttenuationStyleBpm(DEFAULT_PELAGOS.id, DEFAULT_PELAGOS.name));
  });

  it('stays driven by the existing single AS subscription — audioStore.ts registers no second subscribe (source-scan regression guard)', async () => {
    const { readFileSync } = await import('node:fs');
    const { dirname, join } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const thisFile = fileURLToPath(import.meta.url);
    const source = readFileSync(join(dirname(thisFile), 'audioStore.ts'), 'utf-8');
    const subscribeCalls = source.match(/\.subscribe\(/g) ?? [];
    // Exactly the one useAttenuationStyleStore.subscribe: BPM now rides the same AS-sync that
    // reseeds globalAudio/lfoBank/globalLfoLinks, so it needs no subscription of its own.
    expect(subscribeCalls.length).toBe(1);
  });

  it('no longer reads the locale — audioStore.ts imports and calls nothing from localeStore (source-scan regression guard)', async () => {
    const { readFileSync } = await import('node:fs');
    const { dirname, join } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const thisFile = fileURLToPath(import.meta.url);
    const source = readFileSync(join(dirname(thisFile), 'audioStore.ts'), 'utf-8');
    expect(source).not.toMatch(/localeStore|useLocaleStore|getLocaleById/);
  });

  it('reseeds bpm when currentAttenuationStyleId changes', async () => {
    const { useAudioStore } = await import('./audioStore');
    const { useAttenuationStyleStore, DEFAULT_PELAGOS } = await import('./attenuationStyleStore');
    const { generateAttenuationStyleBpm } = await import('../utils/bpmSeed');

    useAttenuationStyleStore.getState().addAttenuationStyle({ ...DEFAULT_PELAGOS, id: 'bpm-sync-zenith', name: 'BpmSyncZenith' });
    useAttenuationStyleStore.getState().setCurrentAttenuationStyleId('bpm-sync-zenith');

    expect(useAudioStore.getState().bpm).toBe(generateAttenuationStyleBpm('bpm-sync-zenith', 'BpmSyncZenith'));
  });

  it('discards a hand-dragged bpm on an Attenuation Style change, same as Audio Rig edits', async () => {
    const { useAudioStore } = await import('./audioStore');
    const { useAttenuationStyleStore, DEFAULT_PELAGOS } = await import('./attenuationStyleStore');

    useAudioStore.getState().setBPM(190); // outside the [40, 100] seed range, so it's unambiguous
    useAttenuationStyleStore.getState().addAttenuationStyle({ ...DEFAULT_PELAGOS, id: 'bpm-sync-zenith', name: 'BpmSyncZenith' });
    useAttenuationStyleStore.getState().setCurrentAttenuationStyleId('bpm-sync-zenith');

    expect(useAudioStore.getState().bpm).not.toBe(190);
  });

  it('does NOT reseed bpm when currentAttenuationStyleId is set to the value it already has', async () => {
    const { useAudioStore } = await import('./audioStore');
    const { useAttenuationStyleStore, DEFAULT_PELAGOS } = await import('./attenuationStyleStore');

    useAudioStore.getState().setBPM(190);
    useAttenuationStyleStore.getState().setCurrentAttenuationStyleId(DEFAULT_PELAGOS.id);

    expect(useAudioStore.getState().bpm).toBe(190);
  });

  it('reseeds bpm BEFORE it pushes globalAudio, so a tempo-resolved push (Task 11) lands at the new tempo', async () => {
    await import('./audioStore'); // registers the AS-sync subscription under test
    const { useAttenuationStyleStore, DEFAULT_PELAGOS } = await import('./attenuationStyleStore');
    const { AudioEngine } = await import('../engine/AudioEngine');
    vi.clearAllMocks();

    useAttenuationStyleStore.getState().addAttenuationStyle({ ...DEFAULT_PELAGOS, id: 'bpm-order-zenith', name: 'BpmOrderZenith' });
    useAttenuationStyleStore.getState().setCurrentAttenuationStyleId('bpm-order-zenith');

    const bpmCall = vi.mocked(AudioEngine.setBPM).mock.invocationCallOrder[0];
    const globalAudioCall = vi.mocked(AudioEngine.setGlobalDelay).mock.invocationCallOrder[0];
    expect(bpmCall).toBeDefined();
    expect(globalAudioCall).toBeDefined();
    expect(bpmCall).toBeLessThan(globalAudioCall);
  });
});

describe('useAudioStore - volume / setVolume / setMuted (docs/specs/GLOBAL_VOLUME_CONTROL.md §1.3, §4)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('defaults volume to 1 on a fresh module import', async () => {
    const { useAudioStore } = await import('./audioStore');
    expect(useAudioStore.getState().volume).toBe(1);
  });

  it('setVolume updates store.volume to exactly the given value', async () => {
    const { useAudioStore } = await import('./audioStore');
    useAudioStore.getState().setVolume(0.42);
    expect(useAudioStore.getState().volume).toBe(0.42);
  });

  it('setVolume calls AudioEngine.setMasterVolume with volumePositionToGain(volume), not the raw position', async () => {
    const { useAudioStore } = await import('./audioStore');
    const { AudioEngine } = await import('../engine/AudioEngine');
    const { volumePositionToGain } = await import('../engine/audioEngine/volumeTaper');
    vi.clearAllMocks();

    useAudioStore.getState().setVolume(0.5);

    expect(AudioEngine.setMasterVolume).toHaveBeenCalledWith(volumePositionToGain(0.5));
  });

  it('setVolume clears isMuted, even when it was already true — dragging the slider while muted auto-unmutes to the dragged-to level', async () => {
    const { useAudioStore } = await import('./audioStore');
    useAudioStore.setState({ isMuted: true });

    useAudioStore.getState().setVolume(0.8);

    expect(useAudioStore.getState().isMuted).toBe(false);
  });

  it('setVolume is a harmless no-op on isMuted when it was already false', async () => {
    const { useAudioStore } = await import('./audioStore');
    useAudioStore.setState({ isMuted: false });

    useAudioStore.getState().setVolume(0.3);

    expect(useAudioStore.getState().isMuted).toBe(false);
  });

  it('setMuted(true) sets isMuted and calls AudioEngine.setMasterVolume(0), without touching volume', async () => {
    const { useAudioStore } = await import('./audioStore');
    useAudioStore.getState().setVolume(0.65);
    const { AudioEngine } = await import('../engine/AudioEngine');
    vi.clearAllMocks();

    useAudioStore.getState().setMuted(true);

    expect(useAudioStore.getState().isMuted).toBe(true);
    expect(useAudioStore.getState().volume).toBe(0.65);
    expect(AudioEngine.setMasterVolume).toHaveBeenCalledWith(0);
  });

  it('setMuted(false) reads the LIVE volume already in state — not a stale/default snapshot', async () => {
    const { useAudioStore } = await import('./audioStore');
    const { AudioEngine } = await import('../engine/AudioEngine');
    const { volumePositionToGain } = await import('../engine/audioEngine/volumeTaper');
    // Set a non-default volume, then mute — mirroring the real interaction order
    // (drag to 0.7, then mute) — without going through setVolume's own auto-unmute,
    // so isMuted genuinely starts true here.
    useAudioStore.setState({ volume: 0.7, isMuted: true });
    vi.clearAllMocks();

    useAudioStore.getState().setMuted(false);

    expect(useAudioStore.getState().isMuted).toBe(false);
    expect(AudioEngine.setMasterVolume).toHaveBeenCalledWith(volumePositionToGain(0.7));
  });

  it('preMuteVolume/setPreMuteVolume no longer exist on the store', async () => {
    const { useAudioStore } = await import('./audioStore');
    const state = useAudioStore.getState();
    expect('preMuteVolume' in state).toBe(false);
    expect('setPreMuteVolume' in state).toBe(false);
  });
});

describe('useAudioStore - robotLoad / effectsLoad / soundingRobotIds (docs/specs/AUDIO_LOAD_BUDGET.md §3, §4)', () => {
  const originalMatchMedia = window.matchMedia;

  /** Stub `(pointer: coarse)` — jsdom has no matchMedia of its own. */
  function stubCoarsePointer(coarse: boolean) {
    window.matchMedia = vi.fn((query: string) => ({
      matches: query === '(pointer: coarse)' && coarse,
    })) as unknown as typeof window.matchMedia;
  }

  /** Load a fresh copy of the store as if the page had booted with this query string. */
  async function loadFreshWithQuery(query: string) {
    window.history.replaceState({}, '', `/${query}`);
    vi.resetModules();
    return import('./audioStore');
  }

  beforeEach(() => {
    window.history.replaceState({}, '', '/');
    window.matchMedia = originalMatchMedia;
    vi.resetModules();
  });

  afterEach(() => {
    window.history.replaceState({}, '', '/');
    window.matchMedia = originalMatchMedia;
    vi.resetModules();
  });

  describe('robotLoad / effectsLoad at boot', () => {
    it('are both 1 (Full, today’s behavior) with no params on a desktop-like device', async () => {
      const { useAudioStore } = await loadFreshWithQuery('');
      expect(useAudioStore.getState().robotLoad).toBe(1);
      expect(useAudioStore.getState().effectsLoad).toBe(1);
    });

    it('?load= pins both axes together: 0.2 with light, 0.6 with standard, 1 with full', async () => {
      for (const [preset, value] of [
        ['light', 0.2],
        ['standard', 0.6],
        ['full', 1],
      ] as const) {
        const { useAudioStore } = await loadFreshWithQuery(`?load=${preset}`);
        expect(useAudioStore.getState().robotLoad).toBe(value);
        expect(useAudioStore.getState().effectsLoad).toBe(value);
      }
    });

    it('?fxLoad= pins the effects axis independently of ?load=', async () => {
      const { useAudioStore } = await loadFreshWithQuery('?load=full&fxLoad=light');
      expect(useAudioStore.getState().robotLoad).toBe(1);
      expect(useAudioStore.getState().effectsLoad).toBe(0.2);
    });

    it('falls back to detection for an invalid ?load=, on both axes', async () => {
      expect((await loadFreshWithQuery('?load=bogus')).useAudioStore.getState().robotLoad).toBe(1);
      expect((await loadFreshWithQuery('?load=bogus')).useAudioStore.getState().effectsLoad).toBe(1);
      stubCoarsePointer(true);
      expect((await loadFreshWithQuery('?load=bogus')).useAudioStore.getState().robotLoad).toBe(0.2);
      expect((await loadFreshWithQuery('?load=bogus')).useAudioStore.getState().effectsLoad).toBe(0.2);
    });

    it('default to Light (0.2) on a coarse-pointer, phone-like device', async () => {
      stubCoarsePointer(true);
      const { useAudioStore } = await loadFreshWithQuery('');
      expect(useAudioStore.getState().robotLoad).toBe(0.2);
      expect(useAudioStore.getState().effectsLoad).toBe(0.2);
    });

    it('does not throw when matchMedia is missing or throws — it just reads as a non-phone', async () => {
      // @ts-expect-error — simulating an environment without matchMedia
      window.matchMedia = undefined;
      expect((await loadFreshWithQuery('')).useAudioStore.getState().robotLoad).toBe(1);
      window.matchMedia = (() => {
        throw new Error('no matchMedia here');
      }) as unknown as typeof window.matchMedia;
      expect((await loadFreshWithQuery('')).useAudioStore.getState().effectsLoad).toBe(1);
    });
  });

  describe('setRobotLoad / setEffectsLoad', () => {
    it('each set their own axis to exactly the given value, leaving the other alone', async () => {
      const { useAudioStore } = await loadFreshWithQuery('');
      useAudioStore.getState().setRobotLoad(0.37);
      expect(useAudioStore.getState().robotLoad).toBe(0.37);
      expect(useAudioStore.getState().effectsLoad).toBe(1);
      useAudioStore.getState().setEffectsLoad(0.12);
      expect(useAudioStore.getState().effectsLoad).toBe(0.12);
      expect(useAudioStore.getState().robotLoad).toBe(0.37);
    });

    it('each clamp to [0, 1] and treat NaN as Full', async () => {
      const { useAudioStore } = await loadFreshWithQuery('');
      useAudioStore.getState().setRobotLoad(-1);
      expect(useAudioStore.getState().robotLoad).toBe(0);
      useAudioStore.getState().setRobotLoad(2);
      expect(useAudioStore.getState().robotLoad).toBe(1);
      useAudioStore.getState().setRobotLoad(0.4);
      useAudioStore.getState().setRobotLoad(NaN);
      expect(useAudioStore.getState().robotLoad).toBe(1);

      useAudioStore.getState().setEffectsLoad(-1);
      expect(useAudioStore.getState().effectsLoad).toBe(0);
      useAudioStore.getState().setEffectsLoad(2);
      expect(useAudioStore.getState().effectsLoad).toBe(1);
    });

    it('are plain state writes: no engine call, and no other field changes', async () => {
      const { useAudioStore } = await loadFreshWithQuery('');
      const { AudioEngine } = await import('../engine/AudioEngine');
      vi.clearAllMocks();
      const before = { ...useAudioStore.getState() };

      useAudioStore.getState().setRobotLoad(0.2);

      for (const fn of Object.values(AudioEngine)) expect(fn).not.toHaveBeenCalled();
      const after = useAudioStore.getState();
      expect(after.robotLoad).toBe(0.2);
      expect({ ...after, robotLoad: before.robotLoad }).toEqual(before);
    });
  });

  describe('soundingRobotIds', () => {
    it('defaults to an empty list', async () => {
      const { useAudioStore } = await loadFreshWithQuery('');
      expect(useAudioStore.getState().soundingRobotIds).toEqual([]);
    });

    it('is written by setSoundingRobotIds', async () => {
      const { useAudioStore } = await loadFreshWithQuery('');
      useAudioStore.getState().setSoundingRobotIds(['r1', 'r2']);
      expect(useAudioStore.getState().soundingRobotIds).toEqual(['r1', 'r2']);
    });

    it('does not write, and so does not notify subscribers, when the set is unchanged', async () => {
      const { useAudioStore } = await loadFreshWithQuery('');
      useAudioStore.getState().setSoundingRobotIds(['r1', 'r2']);
      const stored = useAudioStore.getState().soundingRobotIds;
      const listener = vi.fn();
      const unsubscribe = useAudioStore.subscribe(listener);

      useAudioStore.getState().setSoundingRobotIds(['r1', 'r2']); // same content, new array
      useAudioStore.getState().setSoundingRobotIds(stored); // the very same array

      expect(listener).not.toHaveBeenCalled();
      expect(useAudioStore.getState().soundingRobotIds).toBe(stored);

      useAudioStore.getState().setSoundingRobotIds(['r2', 'r1']); // a different order IS a change (arrival order matters)
      expect(listener).toHaveBeenCalledTimes(1);
      unsubscribe();
    });

    it('treats a shrunken or emptied set as a change', async () => {
      const { useAudioStore } = await loadFreshWithQuery('');
      useAudioStore.getState().setSoundingRobotIds(['r1', 'r2']);
      useAudioStore.getState().setSoundingRobotIds(['r1']);
      expect(useAudioStore.getState().soundingRobotIds).toEqual(['r1']);
      useAudioStore.getState().setSoundingRobotIds([]);
      expect(useAudioStore.getState().soundingRobotIds).toEqual([]);
    });

    it('is not changed by setRobotLoad/setEffectsLoad (only the budget system derives it)', async () => {
      const { useAudioStore } = await loadFreshWithQuery('');
      useAudioStore.getState().setSoundingRobotIds(['r1']);
      useAudioStore.getState().setRobotLoad(0.1);
      useAudioStore.getState().setEffectsLoad(0.1);
      expect(useAudioStore.getState().soundingRobotIds).toEqual(['r1']);
    });
  });

  it('stays JSON-serialisable with both fields set (state holds no runtime objects)', async () => {
    const { useAudioStore } = await loadFreshWithQuery('?load=light');
    useAudioStore.getState().setSoundingRobotIds(['r1', 'r2']);
    const roundTripped = JSON.parse(JSON.stringify(useAudioStore.getState()));
    expect(roundTripped.robotLoad).toBe(0.2);
    expect(roundTripped.effectsLoad).toBe(0.2);
    expect(roundTripped.soundingRobotIds).toEqual(['r1', 'r2']);
  });
});

describe('useAudioStore - filterLinksHeldOff / driftHeldOff (docs/tasks/LFO_BANK.md Task 3)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('starts with filter links not held off and drift not held off', async () => {
    const { useAudioStore } = await import('./audioStore');
    expect(useAudioStore.getState().filterLinksHeldOff).toBe(false);
    expect(useAudioStore.getState().driftHeldOff).toBe(false);
  });

  it('setFilterLinksHeldOff writes once', async () => {
    const { useAudioStore } = await import('./audioStore');
    const listener = vi.fn();
    const unsubscribe = useAudioStore.subscribe(listener);

    useAudioStore.getState().setFilterLinksHeldOff(true);

    expect(useAudioStore.getState().filterLinksHeldOff).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('a repeat with the same value is a no-op write', async () => {
    const { useAudioStore } = await import('./audioStore');
    useAudioStore.getState().setFilterLinksHeldOff(true);
    const listener = vi.fn();
    const unsubscribe = useAudioStore.subscribe(listener);

    useAudioStore.getState().setFilterLinksHeldOff(true);

    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('setDriftHeldOff writes only when the flag changes', async () => {
    const { useAudioStore } = await import('./audioStore');
    const listener = vi.fn();
    const unsubscribe = useAudioStore.subscribe(listener);

    useAudioStore.getState().setDriftHeldOff(false); // already false
    expect(listener).not.toHaveBeenCalled();

    useAudioStore.getState().setDriftHeldOff(true);
    expect(useAudioStore.getState().driftHeldOff).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('stays JSON-serialisable with both set', async () => {
    const { useAudioStore } = await import('./audioStore');
    useAudioStore.getState().setFilterLinksHeldOff(true);
    useAudioStore.getState().setDriftHeldOff(true);
    const roundTripped = JSON.parse(JSON.stringify(useAudioStore.getState()));
    expect(roundTripped.filterLinksHeldOff).toBe(true);
    expect(roundTripped.driftHeldOff).toBe(true);
  });
});
