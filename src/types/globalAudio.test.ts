// ========================================
// IMPORTS
// ========================================
import { describe, it, expect } from 'vitest';

import { DEFAULT_GLOBAL_AUDIO_SETTINGS } from './globalAudio';

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

  it('no longer has a lfoDrift field — moved to the LFO Bank\'s per-lane drift (docs/tasks/LFO_BANK.md Task 17)', () => {
    expect('lfoDrift' in DEFAULT_GLOBAL_AUDIO_SETTINGS).toBe(false);
  });
});
