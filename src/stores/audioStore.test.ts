import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { GLOBAL_LFO_TARGET_IDS, DRIFT_GROUP_IDS } from '../types/lfo';

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

vi.mock('../engine/lfoEngine', () => ({
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
    const { globalAudio } = useAudioStore.getState();

    expect(AudioEngine.setGlobalCompressor).toHaveBeenCalledWith(globalAudio.compressor);
    expect(AudioEngine.setGlobalEQ).toHaveBeenCalledWith(globalAudio.eq3);
    expect(AudioEngine.setGlobalFilterLPF).toHaveBeenCalledWith(globalAudio.filterLPF);
    expect(AudioEngine.setGlobalFilterHPF).toHaveBeenCalledWith(globalAudio.filterHPF);
    expect(AudioEngine.setGlobalLimiter).toHaveBeenCalledWith(globalAudio.limiter);
    expect(AudioEngine.setGlobalDelay).toHaveBeenCalledWith(globalAudio.delay);
    expect(AudioEngine.setGlobalReverb).toHaveBeenCalledWith(globalAudio.reverb);
  });

  it('calls lfoEngine.setGlobalRateDrift/setGlobalDepthDrift for all 4 groups with each group\'s own resulting lfoDrift values, alongside the AudioEngine setGlobal* calls', async () => {
    const { useAudioStore } = await import('./audioStore');
    const { lfoEngine } = await import('../engine/lfoEngine');
    const { globalAudio } = useAudioStore.getState();

    for (const group of DRIFT_GROUP_IDS) {
      expect(lfoEngine.setGlobalRateDrift, group).toHaveBeenCalledWith(group, globalAudio.lfoDrift[group].rateDrift);
      expect(lfoEngine.setGlobalDepthDrift, group).toHaveBeenCalledWith(group, globalAudio.lfoDrift[group].depthDrift);
    }
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

describe('useAudioStore - setGlobalLfoDrift', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('updates only rateDrift for the given group and calls lfoEngine.setGlobalRateDrift with that group, leaving depthDrift and every other group untouched', async () => {
    const { useAudioStore } = await import('./audioStore');
    const { lfoEngine } = await import('../engine/lfoEngine');
    const before = useAudioStore.getState().globalAudio.lfoDrift;
    vi.clearAllMocks();

    useAudioStore.getState().setGlobalLfoDrift('eq3', { rateDrift: 0.5 });

    expect(useAudioStore.getState().globalAudio.lfoDrift.eq3.rateDrift).toBe(0.5);
    expect(useAudioStore.getState().globalAudio.lfoDrift.eq3.depthDrift).toBe(before.eq3.depthDrift);
    expect(useAudioStore.getState().globalAudio.lfoDrift.filterLPF).toEqual(before.filterLPF);
    expect(useAudioStore.getState().globalAudio.lfoDrift.filterHPF).toEqual(before.filterHPF);
    expect(useAudioStore.getState().globalAudio.lfoDrift.robots).toEqual(before.robots);
    expect(lfoEngine.setGlobalRateDrift).toHaveBeenCalledWith('eq3', 0.5);
    expect(lfoEngine.setGlobalDepthDrift).not.toHaveBeenCalled();
  });

  it('updates only depthDrift for the given group and calls lfoEngine.setGlobalDepthDrift with that group, leaving rateDrift untouched', async () => {
    const { useAudioStore } = await import('./audioStore');
    const { lfoEngine } = await import('../engine/lfoEngine');
    const rateBefore = useAudioStore.getState().globalAudio.lfoDrift.filterLPF.rateDrift;
    vi.clearAllMocks();

    useAudioStore.getState().setGlobalLfoDrift('filterLPF', { depthDrift: -0.3 });

    expect(useAudioStore.getState().globalAudio.lfoDrift.filterLPF.depthDrift).toBe(-0.3);
    expect(useAudioStore.getState().globalAudio.lfoDrift.filterLPF.rateDrift).toBe(rateBefore);
    expect(lfoEngine.setGlobalDepthDrift).toHaveBeenCalledWith('filterLPF', -0.3);
    expect(lfoEngine.setGlobalRateDrift).not.toHaveBeenCalled();
  });

  it('updates both fields for the given group and calls both engine setters with that group when both are provided together', async () => {
    const { useAudioStore } = await import('./audioStore');
    const { lfoEngine } = await import('../engine/lfoEngine');
    vi.clearAllMocks();

    useAudioStore.getState().setGlobalLfoDrift('robots', { rateDrift: 0.2, depthDrift: 0.9 });

    expect(useAudioStore.getState().globalAudio.lfoDrift.robots).toEqual({ rateDrift: 0.2, depthDrift: 0.9 });
    expect(lfoEngine.setGlobalRateDrift).toHaveBeenCalledWith('robots', 0.2);
    expect(lfoEngine.setGlobalDepthDrift).toHaveBeenCalledWith('robots', 0.9);
  });

  it('calling it twice on the same group with one field each time accumulates rather than clobbering the other field', async () => {
    const { useAudioStore } = await import('./audioStore');
    useAudioStore.getState().setGlobalLfoDrift('filterHPF', { rateDrift: 0.4 });

    useAudioStore.getState().setGlobalLfoDrift('filterHPF', { depthDrift: 0.6 });

    expect(useAudioStore.getState().globalAudio.lfoDrift.filterHPF).toEqual({ rateDrift: 0.4, depthDrift: 0.6 });
  });

  it('setting one group never touches another group\'s stored values — cross-group isolation', async () => {
    const { useAudioStore } = await import('./audioStore');
    const before = useAudioStore.getState().globalAudio.lfoDrift;

    useAudioStore.getState().setGlobalLfoDrift('eq3', { rateDrift: 0.7, depthDrift: 0.7 });

    expect(useAudioStore.getState().globalAudio.lfoDrift.filterLPF).toEqual(before.filterLPF);
    expect(useAudioStore.getState().globalAudio.lfoDrift.filterHPF).toEqual(before.filterHPF);
    expect(useAudioStore.getState().globalAudio.lfoDrift.robots).toEqual(before.robots);
  });
});

describe('useAudioStore - globalLfo state', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('has one entry per GlobalLfoTargetId, JSON-serializable', async () => {
    const { useAudioStore } = await import('./audioStore');
    const { globalLfo } = useAudioStore.getState();
    expect(Object.keys(globalLfo).sort()).toEqual([...GLOBAL_LFO_TARGET_IDS].sort());
    expect(() => JSON.stringify(globalLfo)).not.toThrow();
  });
});

describe('useAudioStore - setGlobalLfo', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('updates globalLfo state for the given target', async () => {
    const { useAudioStore } = await import('./audioStore');
    useAudioStore.getState().setGlobalLfo('eq3.low', { shape: 'square', rate: 3, depth: 40 });
    expect(useAudioStore.getState().globalLfo['eq3.low']).toEqual({ shape: 'square', rate: 3, depth: 40 });
  });

  it('always calls setLfoShape/setLfoRate/setLfoDepth with the value\'s fields', async () => {
    const { useAudioStore } = await import('./audioStore');
    const { lfoEngine } = await import('../engine/lfoEngine');
    vi.clearAllMocks();

    useAudioStore.getState().setGlobalLfo('lpf.frequency', { shape: 'triangle', rate: 5, depth: 60 });

    expect(lfoEngine.setLfoShape).toHaveBeenCalledWith('lpf.frequency', 'triangle');
    expect(lfoEngine.setLfoRate).toHaveBeenCalledWith('lpf.frequency', 5);
    expect(lfoEngine.setLfoDepth).toHaveBeenCalledWith('lpf.frequency', 60);
  });

  it('connects and starts when rate > 0 and connect succeeds', async () => {
    const { useAudioStore } = await import('./audioStore');
    const { lfoEngine } = await import('../engine/lfoEngine');
    vi.clearAllMocks();
    vi.mocked(lfoEngine.connectLfoTarget).mockReturnValue(true);

    useAudioStore.getState().setGlobalLfo('hpf.Q', { shape: 'sine', rate: 1, depth: 20 });

    expect(lfoEngine.connectLfoTarget).toHaveBeenCalledWith('hpf.Q');
    expect(lfoEngine.start).toHaveBeenCalledWith('hpf.Q');
    expect(lfoEngine.disconnectLfoTarget).not.toHaveBeenCalled();
    expect(lfoEngine.stop).not.toHaveBeenCalled();
  });

  it('does not call start when rate > 0 but connect fails', async () => {
    const { useAudioStore } = await import('./audioStore');
    const { lfoEngine } = await import('../engine/lfoEngine');
    vi.clearAllMocks();
    vi.mocked(lfoEngine.connectLfoTarget).mockReturnValue(false);

    useAudioStore.getState().setGlobalLfo('hpf.frequency', { shape: 'sine', rate: 1, depth: 20 });

    expect(lfoEngine.connectLfoTarget).toHaveBeenCalledWith('hpf.frequency');
    expect(lfoEngine.start).not.toHaveBeenCalled();
  });

  it('disconnects and stops when rate is 0', async () => {
    const { useAudioStore } = await import('./audioStore');
    const { lfoEngine } = await import('../engine/lfoEngine');
    vi.clearAllMocks();

    useAudioStore.getState().setGlobalLfo('eq3.high', { shape: 'sine', rate: 0, depth: 20 });

    expect(lfoEngine.disconnectLfoTarget).toHaveBeenCalledWith('eq3.high');
    expect(lfoEngine.stop).toHaveBeenCalledWith('eq3.high');
    expect(lfoEngine.connectLfoTarget).not.toHaveBeenCalled();
    expect(lfoEngine.start).not.toHaveBeenCalled();
  });
});

describe('useAudioStore - globalLfo Attenuation-Style-sync seeding', () => {
  beforeEach(() => {
    vi.resetModules();
    // The lfoEngine mock's call history persists across vi.resetModules() (same
    // established quirk documented in LFO_INTEGRATION_PLAN.md's Task 11 notes for
    // the Tone mock) — clear it so each test only sees its own fresh import's calls.
    vi.clearAllMocks();
  });

  it('seeds globalLfo for the current Attenuation Style on module load (app init)', async () => {
    const { useAudioStore } = await import('./audioStore');
    const { globalLfo } = useAudioStore.getState();
    // Seeded, not left at the DEFAULT_LFO_SETTINGS-inert values (rate would be
    // pinned to LFO_RATE_MIN and depth to LFO_DEPTH_MIN for every target if
    // seeding hadn't run) — at least one target should differ from the inert default.
    const rates = GLOBAL_LFO_TARGET_IDS.map((t) => globalLfo[t].rate);
    expect(new Set(rates).size).toBeGreaterThan(1);
  });

  it('does not touch lfoEngine during seeding — data-only, deferred to AudioEngine.start() (Task 9)', async () => {
    // AS-sync runs at module load / on every Attenuation Style switch, before any user
    // gesture — pushing to lfoEngine here would construct a real Tone.LFO node
    // before an AudioContext exists (found via the Phase 2 checkpoint's full
    // suite run: TransportBar.test.tsx, which imports the real audioStore
    // module, threw "param must be an AudioParam" until this was fixed).
    await import('./audioStore');
    const { lfoEngine } = await import('../engine/lfoEngine');

    expect(lfoEngine.setLfoShape).not.toHaveBeenCalled();
    expect(lfoEngine.setLfoRate).not.toHaveBeenCalled();
    expect(lfoEngine.setLfoDepth).not.toHaveBeenCalled();
    expect(lfoEngine.connectLfoTarget).not.toHaveBeenCalled();
    expect(lfoEngine.start).not.toHaveBeenCalled();
  });

  it('follows setCurrentAttenuationStyleId — switching the active Attenuation Style reseeds globalLfo automatically', async () => {
    const { useAudioStore } = await import('./audioStore');
    const { useAttenuationStyleStore, DEFAULT_PELAGOS } = await import('./attenuationStyleStore');

    const before = useAudioStore.getState().globalLfo;
    useAttenuationStyleStore.getState().addAttenuationStyle({ ...DEFAULT_PELAGOS, id: 'zenith-lfo', name: 'ZenithLfo' });
    useAttenuationStyleStore.getState().setCurrentAttenuationStyleId('zenith-lfo');

    expect(useAudioStore.getState().globalLfo).not.toEqual(before);
  });
});

describe('useAudioStore - pingVarianceAutomation / setPingVarianceAutomation', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('seeds into [0.33, 0.66] on module load (the first regenerateGlobalAudioFromSeed call)', async () => {
    const { useAudioStore } = await import('./audioStore');
    const { pingVarianceAutomation } = useAudioStore.getState();
    expect(pingVarianceAutomation).toBeGreaterThanOrEqual(0.33);
    expect(pingVarianceAutomation).toBeLessThanOrEqual(0.66);
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
    useAudioStore.getState().setPingVarianceAutomation(0.9); // outside the [0.33, 0.66] seed range, so it's unambiguous

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

describe('useAudioStore - regenerateBpmFromSeed (docs/specs/BPM_CONTROL.md §1.3)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('calls setBPM with exactly generateLocaleBpm(localeId, x, y)\'s result', async () => {
    const { useAudioStore } = await import('./audioStore');
    const { generateLocaleBpm } = await import('../utils/localeBpmSeed');
    const { AudioEngine } = await import('../engine/AudioEngine');
    vi.clearAllMocks();

    useAudioStore.getState().regenerateBpmFromSeed('bpm-store-test-locale', { x: 5, y: 9 });

    const expected = generateLocaleBpm('bpm-store-test-locale', 5, 9);
    expect(useAudioStore.getState().bpm).toBe(expected);
    expect(AudioEngine.setBPM).toHaveBeenCalledWith(expected);
  });

  it('a second call for a different locale reflects that call\'s own fresh draw, not a stale value left by the first', async () => {
    const { useAudioStore } = await import('./audioStore');
    const { generateLocaleBpm } = await import('../utils/localeBpmSeed');

    useAudioStore.getState().regenerateBpmFromSeed('bpm-store-test-locale-a', { x: 1, y: 2 });
    expect(useAudioStore.getState().bpm).toBe(generateLocaleBpm('bpm-store-test-locale-a', 1, 2));

    useAudioStore.getState().regenerateBpmFromSeed('bpm-store-test-locale-b', { x: -40, y: 200 });
    expect(useAudioStore.getState().bpm).toBe(generateLocaleBpm('bpm-store-test-locale-b', -40, 200));
  });
});

describe('useAudioStore - BPM locale sync on module load (docs/specs/BPM_CONTROL.md §1.3)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('seeds bpm for the locale current at boot, within LOCALE_BPM_SEED_RANGE', async () => {
    const { useAudioStore } = await import('./audioStore');
    const { LOCALE_BPM_SEED_RANGE } = await import('../utils/localeBpmSeed');

    const { bpm } = useAudioStore.getState();
    expect(bpm).toBeGreaterThanOrEqual(LOCALE_BPM_SEED_RANGE.min);
    expect(bpm).toBeLessThanOrEqual(LOCALE_BPM_SEED_RANGE.max);
  });

  it('matches generateLocaleBpm for the default locale\'s own id/coordinates exactly', async () => {
    const { useAudioStore } = await import('./audioStore');
    const { useLocaleStore, DEFAULT_LOCALE_ID } = await import('./localeStore');
    const { generateLocaleBpm } = await import('../utils/localeBpmSeed');

    const locale = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)!;
    const expected = generateLocaleBpm(locale.id, locale.coordinates.x, locale.coordinates.y);
    expect(useAudioStore.getState().bpm).toBe(expected);
  });

  it('is a one-shot module-load call, not a subscription — audioStore.ts registers only its existing single subscribe (source-scan regression guard)', async () => {
    const { readFileSync } = await import('node:fs');
    const { dirname, join } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const thisFile = fileURLToPath(import.meta.url);
    const source = readFileSync(join(dirname(thisFile), 'audioStore.ts'), 'utf-8');
    const subscribeCalls = source.match(/\.subscribe\(/g) ?? [];
    // Exactly the one pre-existing useAttenuationStyleStore.subscribe (globalAudio/
    // globalLfo AS-sync) — BPM's locale sync must stay a plain function call
    // (syncBpmToCurrentLocale()), never a second subscription, per spec §1.3's
    // "call-site-triggered, not subscription-driven" design.
    expect(subscribeCalls.length).toBe(1);
  });

  it('does NOT reseed bpm merely because currentAttenuationStyleId changes — that would incorrectly fire on an Attenuation-Style-only retransmit', async () => {
    const { useAudioStore } = await import('./audioStore');
    const { useAttenuationStyleStore, DEFAULT_PELAGOS } = await import('./attenuationStyleStore');

    const before = useAudioStore.getState().bpm;
    useAttenuationStyleStore.getState().addAttenuationStyle({ ...DEFAULT_PELAGOS, id: 'bpm-sync-zenith', name: 'BpmSyncZenith' });
    useAttenuationStyleStore.getState().setCurrentAttenuationStyleId('bpm-sync-zenith');

    expect(useAudioStore.getState().bpm).toBe(before);
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

describe('useAudioStore - audioLoad / soundingRobotIds (docs/specs/AUDIO_LOAD_BUDGET.md §3, §4)', () => {
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

  describe('audioLoad at boot', () => {
    it('is 1 (Full, today’s behavior) with no params on a desktop-like device', async () => {
      const { useAudioStore } = await loadFreshWithQuery('');
      expect(useAudioStore.getState().audioLoad).toBe(1);
    });

    it('is 0.2 with ?load=light, 0.6 with ?load=standard, 1 with ?load=full', async () => {
      expect((await loadFreshWithQuery('?load=light')).useAudioStore.getState().audioLoad).toBe(0.2);
      expect((await loadFreshWithQuery('?load=standard')).useAudioStore.getState().audioLoad).toBe(0.6);
      expect((await loadFreshWithQuery('?load=full')).useAudioStore.getState().audioLoad).toBe(1);
    });

    it('is a percent with ?load=45', async () => {
      const { useAudioStore } = await loadFreshWithQuery('?load=45');
      expect(useAudioStore.getState().audioLoad).toBe(0.45);
    });

    it('falls back to detection for an invalid ?load=', async () => {
      expect((await loadFreshWithQuery('?load=bogus')).useAudioStore.getState().audioLoad).toBe(1);
      stubCoarsePointer(true);
      expect((await loadFreshWithQuery('?load=bogus')).useAudioStore.getState().audioLoad).toBe(0.2);
    });

    it('defaults to Light (0.2) on a coarse-pointer, phone-like device', async () => {
      stubCoarsePointer(true);
      const { useAudioStore } = await loadFreshWithQuery('');
      expect(useAudioStore.getState().audioLoad).toBe(0.2);
    });

    it('lets ?load= override detection in both directions', async () => {
      stubCoarsePointer(true);
      expect((await loadFreshWithQuery('?load=full')).useAudioStore.getState().audioLoad).toBe(1);
      stubCoarsePointer(false);
      expect((await loadFreshWithQuery('?load=light')).useAudioStore.getState().audioLoad).toBe(0.2);
    });

    it('reads ?load= among other params', async () => {
      const { useAudioStore } = await loadFreshWithQuery('?debug&seed=bravo&x=-150&y=90&load=standard');
      expect(useAudioStore.getState().audioLoad).toBe(0.6);
    });

    it('does not throw when matchMedia is missing or throws — it just reads as a non-phone', async () => {
      // @ts-expect-error — simulating an environment without matchMedia
      window.matchMedia = undefined;
      expect((await loadFreshWithQuery('')).useAudioStore.getState().audioLoad).toBe(1);
      window.matchMedia = (() => {
        throw new Error('no matchMedia here');
      }) as unknown as typeof window.matchMedia;
      expect((await loadFreshWithQuery('')).useAudioStore.getState().audioLoad).toBe(1);
    });
  });

  describe('setAudioLoad', () => {
    it('sets the dial to exactly the given value', async () => {
      const { useAudioStore } = await loadFreshWithQuery('');
      useAudioStore.getState().setAudioLoad(0.37);
      expect(useAudioStore.getState().audioLoad).toBe(0.37);
    });

    it('clamps to [0, 1] and treats NaN as Full', async () => {
      const { useAudioStore } = await loadFreshWithQuery('');
      useAudioStore.getState().setAudioLoad(-1);
      expect(useAudioStore.getState().audioLoad).toBe(0);
      useAudioStore.getState().setAudioLoad(2);
      expect(useAudioStore.getState().audioLoad).toBe(1);
      useAudioStore.getState().setAudioLoad(0.4);
      useAudioStore.getState().setAudioLoad(NaN);
      expect(useAudioStore.getState().audioLoad).toBe(1);
    });

    it('is a plain state write: no engine call, and no other field changes', async () => {
      const { useAudioStore } = await loadFreshWithQuery('');
      const { AudioEngine } = await import('../engine/AudioEngine');
      vi.clearAllMocks();
      const before = { ...useAudioStore.getState() };

      useAudioStore.getState().setAudioLoad(0.2);

      for (const fn of Object.values(AudioEngine)) expect(fn).not.toHaveBeenCalled();
      const after = useAudioStore.getState();
      expect(after.audioLoad).toBe(0.2);
      expect({ ...after, audioLoad: before.audioLoad }).toEqual(before);
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

    it('is not changed by setAudioLoad (only the budget system derives it)', async () => {
      const { useAudioStore } = await loadFreshWithQuery('');
      useAudioStore.getState().setSoundingRobotIds(['r1']);
      useAudioStore.getState().setAudioLoad(0.1);
      expect(useAudioStore.getState().soundingRobotIds).toEqual(['r1']);
    });
  });

  it('stays JSON-serialisable with both fields set (state holds no runtime objects)', async () => {
    const { useAudioStore } = await loadFreshWithQuery('?load=light');
    useAudioStore.getState().setSoundingRobotIds(['r1', 'r2']);
    const roundTripped = JSON.parse(JSON.stringify(useAudioStore.getState()));
    expect(roundTripped.audioLoad).toBe(0.2);
    expect(roundTripped.soundingRobotIds).toEqual(['r1', 'r2']);
  });
});

describe('useAudioStore - held-off LFOs (docs/specs/AUDIO_LOAD_BUDGET.md §1.4, plan task 20)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('starts with nothing held off and drift not held off', async () => {
    const { useAudioStore } = await import('./audioStore');
    expect(useAudioStore.getState().heldOffLfoKeys).toEqual([]);
    expect(useAudioStore.getState().driftHeldOff).toBe(false);
  });

  it('setHeldOffLfoKeys writes the instance keys', async () => {
    const { useAudioStore } = await import('./audioStore');
    useAudioStore.getState().setHeldOffLfoKeys(['lpf.Q', 'robot-3:layer0.detune']);
    expect(useAudioStore.getState().heldOffLfoKeys).toEqual(['lpf.Q', 'robot-3:layer0.detune']);
  });

  it('does not write, and so does not notify subscribers, when the same LFOs are held off — in any order', async () => {
    const { useAudioStore } = await import('./audioStore');
    useAudioStore.getState().setHeldOffLfoKeys(['a', 'b']);
    const stored = useAudioStore.getState().heldOffLfoKeys;
    const listener = vi.fn();
    const unsubscribe = useAudioStore.subscribe(listener);

    useAudioStore.getState().setHeldOffLfoKeys(['a', 'b']);
    useAudioStore.getState().setHeldOffLfoKeys(['b', 'a']);

    expect(listener).not.toHaveBeenCalled();
    expect(useAudioStore.getState().heldOffLfoKeys).toBe(stored);
    unsubscribe();
  });

  it('writes when the membership changes, including emptying', async () => {
    const { useAudioStore } = await import('./audioStore');
    useAudioStore.getState().setHeldOffLfoKeys(['a', 'b']);
    useAudioStore.getState().setHeldOffLfoKeys(['a']);
    expect(useAudioStore.getState().heldOffLfoKeys).toEqual(['a']);
    useAudioStore.getState().setHeldOffLfoKeys([]);
    expect(useAudioStore.getState().heldOffLfoKeys).toEqual([]);
  });

  it('copies the keys it is given', async () => {
    const { useAudioStore } = await import('./audioStore');
    const keys = ['a'];
    useAudioStore.getState().setHeldOffLfoKeys(keys);
    keys.push('b');
    expect(useAudioStore.getState().heldOffLfoKeys).toEqual(['a']);
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
    useAudioStore.getState().setHeldOffLfoKeys(['lpf.Q']);
    useAudioStore.getState().setDriftHeldOff(true);
    const roundTripped = JSON.parse(JSON.stringify(useAudioStore.getState()));
    expect(roundTripped.heldOffLfoKeys).toEqual(['lpf.Q']);
    expect(roundTripped.driftHeldOff).toBe(true);
  });
});
