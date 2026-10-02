import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { GLOBAL_LFO_TARGET_IDS, LFO_LANE_IDS } from '../types/lfo';

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
    // Exactly the one pre-existing useAttenuationStyleStore.subscribe (globalAudio/lfoBank/
    // globalLfoLinks AS-sync) — BPM's locale sync must stay a plain function call
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
