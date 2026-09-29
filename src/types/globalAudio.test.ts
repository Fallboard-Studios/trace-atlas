// ========================================
// IMPORTS
// ========================================
import { describe, it, expect } from 'vitest';

import { DEFAULT_GLOBAL_AUDIO_SETTINGS } from './globalAudio';
import { DRIFT_GROUP_IDS } from './lfo';

// ========================================
// TESTS
// ========================================

describe('DEFAULT_GLOBAL_AUDIO_SETTINGS', () => {
  it('has an independent filterLPF matching AudioEngine\'s lowpass node defaults', () => {
    expect(DEFAULT_GLOBAL_AUDIO_SETTINGS.filterLPF).toEqual({
      type: 'lowpass',
      frequency: 20000,
      Q: 1,
    });
  });

  it('has an independent filterHPF matching AudioEngine\'s highpass node defaults', () => {
    expect(DEFAULT_GLOBAL_AUDIO_SETTINGS.filterHPF).toEqual({
      type: 'highpass',
      frequency: 20,
      Q: 1,
    });
  });

  it('no longer has a single generic "filter" key', () => {
    // GlobalAudioSettings used to declare one `filter` field even though
    // AudioEngine has always built two independent Tone filter nodes
    // (_globalLPF/_globalHPF) with separate setters — this asserts the
    // stale generic key is gone, not just that the two real ones exist.
    expect('filter' in DEFAULT_GLOBAL_AUDIO_SETTINGS).toBe(false);
  });

  it('remains JSON-serializable', () => {
    expect(() => JSON.stringify(DEFAULT_GLOBAL_AUDIO_SETTINGS)).not.toThrow();
  });

  it('no longer has a chorus field', () => {
    // V2: Chorus removed entirely — "the effect isn't correct for this music."
    expect('chorus' in DEFAULT_GLOBAL_AUDIO_SETTINGS).toBe(false);
  });

  it('reverb no longer has a dampening field', () => {
    // V2: dampening was a dead cast in globalFx.ts — Tone.Reverb has no such
    // property and never read it. Reverb keeps exactly decay/preDelay/wet.
    expect('dampening' in DEFAULT_GLOBAL_AUDIO_SETTINGS.reverb).toBe(false);
  });

  it('has a limiter field matching Tone.Limiter\'s own default threshold', () => {
    expect(DEFAULT_GLOBAL_AUDIO_SETTINGS.limiter).toEqual({
      threshold: -12,
    });
  });

  it('no longer has an enabled field or a globalBypass flag anywhere — removed, off states are expressed via the params themselves', () => {
    expect('globalBypass' in DEFAULT_GLOBAL_AUDIO_SETTINGS).toBe(false);
    expect('enabled' in DEFAULT_GLOBAL_AUDIO_SETTINGS.reverb).toBe(false);
    expect('enabled' in DEFAULT_GLOBAL_AUDIO_SETTINGS.delay).toBe(false);
    expect('enabled' in DEFAULT_GLOBAL_AUDIO_SETTINGS.compressor).toBe(false);
    expect('enabled' in DEFAULT_GLOBAL_AUDIO_SETTINGS.eq3).toBe(false);
    expect('enabled' in DEFAULT_GLOBAL_AUDIO_SETTINGS.filterLPF).toBe(false);
    expect('enabled' in DEFAULT_GLOBAL_AUDIO_SETTINGS.filterHPF).toBe(false);
    expect('enabled' in DEFAULT_GLOBAL_AUDIO_SETTINGS.limiter).toBe(false);
  });

  it('defaults compressorBeforeDelay to false (Natural Decay)', () => {
    expect(DEFAULT_GLOBAL_AUDIO_SETTINGS.compressorBeforeDelay).toBe(false);
  });

  it('has a lfoDrift entry for every DriftGroupId, each defaulting to zero drift on both axes', () => {
    // Reshaped for docs/specs/LFO_DRIFT_GROUPS.md — was a single flat
    // { rateDrift, depthDrift } pair (Roadmap 10.2); now one independent pair
    // per drift group (Roadmap 10.3).
    for (const group of DRIFT_GROUP_IDS) {
      expect(DEFAULT_GLOBAL_AUDIO_SETTINGS.lfoDrift[group], group).toEqual({ rateDrift: 0, depthDrift: 0 });
    }
  });

  it('lfoDrift has exactly the 2 DriftGroupId groups, no more no fewer', () => {
    expect(Object.keys(DEFAULT_GLOBAL_AUDIO_SETTINGS.lfoDrift).sort()).toEqual([...DRIFT_GROUP_IDS].sort());
  });

  it('lfoDrift is a top-level flag, not nested under any effect object', () => {
    // Guards against a future edit accidentally moving it under reverb/delay/etc.
    // by analogy to the per-effect settings objects that surround it.
    expect('lfoDrift' in DEFAULT_GLOBAL_AUDIO_SETTINGS).toBe(true);
    expect('lfoDrift' in DEFAULT_GLOBAL_AUDIO_SETTINGS.reverb).toBe(false);
  });
});
