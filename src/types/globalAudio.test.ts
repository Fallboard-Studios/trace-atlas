// ========================================
// IMPORTS
// ========================================
import { describe, it, expect } from 'vitest';

import { DEFAULT_GLOBAL_AUDIO_SETTINGS, withGlobalAudioDefaults } from './globalAudio';
import type { GlobalAudioSettings } from './globalAudio';

// ========================================
// TESTS
// ========================================

describe('DEFAULT_GLOBAL_AUDIO_SETTINGS', () => {
  // Robot Sends T6 (docs/specs/ROBOT_SENDS.md §1.1): the rooms are fed by each robot's own send, so the
  // global wet is their RETURN level - full by default, not a wet/dry mix.
  it('defaults the Reverb and Delay return levels to full (1)', () => {
    expect(DEFAULT_GLOBAL_AUDIO_SETTINGS.reverb.wet).toBe(1);
    expect(DEFAULT_GLOBAL_AUDIO_SETTINGS.delay.wet).toBe(1);
  });

  it('leaves the rest of the Reverb and Delay defaults as they were', () => {
    expect(DEFAULT_GLOBAL_AUDIO_SETTINGS.reverb).toEqual({ decay: 1.5, preDelay: 0.02, wet: 1 });
    expect(DEFAULT_GLOBAL_AUDIO_SETTINGS.delay).toEqual({ delayTime: 0.25, feedback: 0.2, wet: 1 });
  });

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

// Global Colour T1 (docs/specs/GLOBAL_COLOUR.md §1.1): three colour blocks, all dry by default.
describe('DEFAULT_GLOBAL_AUDIO_SETTINGS colour blocks', () => {
  it('carries distortion, chebyshev and bitCrusher at their spec defaults', () => {
    expect(DEFAULT_GLOBAL_AUDIO_SETTINGS.distortion).toEqual({ amount: 0.3, wet: 0 });
    expect(DEFAULT_GLOBAL_AUDIO_SETTINGS.chebyshev).toEqual({ order: 2, wet: 0 });
    expect(DEFAULT_GLOBAL_AUDIO_SETTINGS.bitCrusher).toEqual({ bits: 8, wet: 0 });
  });

  it('keeps every colour wet at 0 so a default world is clean', () => {
    expect(DEFAULT_GLOBAL_AUDIO_SETTINGS.distortion.wet).toBe(0);
    expect(DEFAULT_GLOBAL_AUDIO_SETTINGS.chebyshev.wet).toBe(0);
    expect(DEFAULT_GLOBAL_AUDIO_SETTINGS.bitCrusher.wet).toBe(0);
  });

  it('keeps order and bits integers inside their full ranges', () => {
    expect(Number.isInteger(DEFAULT_GLOBAL_AUDIO_SETTINGS.chebyshev.order)).toBe(true);
    expect(Number.isInteger(DEFAULT_GLOBAL_AUDIO_SETTINGS.bitCrusher.bits)).toBe(true);
  });
});

describe('withGlobalAudioDefaults', () => {
  it('returns a full settings object equal to the defaults for an empty payload', () => {
    expect(withGlobalAudioDefaults({})).toStrictEqual(DEFAULT_GLOBAL_AUDIO_SETTINGS);
  });

  it('returns a copy, never the defaults object itself, so a caller cannot mutate the defaults', () => {
    const result = withGlobalAudioDefaults({});
    expect(result).not.toBe(DEFAULT_GLOBAL_AUDIO_SETTINGS);
    expect(result.distortion).not.toBe(DEFAULT_GLOBAL_AUDIO_SETTINGS.distortion);
  });

  it('fills a missing block from the defaults and keeps a present block byte-for-byte', () => {
    const given = { bitCrusher: { bits: 4, wet: 0.7 } };
    const result = withGlobalAudioDefaults(given);
    expect(result.bitCrusher).toStrictEqual({ bits: 4, wet: 0.7 });
    expect(result.distortion).toStrictEqual(DEFAULT_GLOBAL_AUDIO_SETTINGS.distortion);
    expect(result.chebyshev).toStrictEqual(DEFAULT_GLOBAL_AUDIO_SETTINGS.chebyshev);
  });

  it('keeps a nested partial block as given: blocks are whole, never deep-merged', () => {
    // The existing whole-block convention: a block that is present is trusted as a block. A delay carrying only
    // `wet` stays that way (it is a malformed payload, not a legacy one); only absent keys are filled.
    const given = { delay: { wet: 0.5 } } as unknown as Partial<GlobalAudioSettings>;
    const result = withGlobalAudioDefaults(given);
    expect(result.delay).toStrictEqual({ wet: 0.5 });
  });

  it('keeps every present non-colour block untouched', () => {
    const given: Partial<GlobalAudioSettings> = {
      compressorBeforeDelay: true,
      eq3: { low: 1, mid: 2, high: 3 },
      limiter: { threshold: -3 },
    };
    const result = withGlobalAudioDefaults(given);
    expect(result.compressorBeforeDelay).toBe(true);
    expect(result.eq3).toStrictEqual({ low: 1, mid: 2, high: 3 });
    expect(result.limiter).toStrictEqual({ threshold: -3 });
    expect(result.reverb).toStrictEqual(DEFAULT_GLOBAL_AUDIO_SETTINGS.reverb);
  });

  it('drops an unknown key rather than carrying it into the engine', () => {
    const given = { distortion: { amount: 0.5, wet: 0.2 }, mystery: { x: 1 } } as unknown as Partial<GlobalAudioSettings>;
    const result = withGlobalAudioDefaults(given);
    expect('mystery' in result).toBe(false);
    expect(result.distortion).toStrictEqual({ amount: 0.5, wet: 0.2 });
  });

  it('treats an explicit undefined block as absent', () => {
    const given = { chebyshev: undefined } as unknown as Partial<GlobalAudioSettings>;
    expect(withGlobalAudioDefaults(given).chebyshev).toStrictEqual(DEFAULT_GLOBAL_AUDIO_SETTINGS.chebyshev);
  });

  it('does not share nested state between two calls', () => {
    const a = withGlobalAudioDefaults({});
    const b = withGlobalAudioDefaults({});
    expect(a.bitCrusher).not.toBe(b.bitCrusher);
  });

  it('stays JSON-serialisable', () => {
    const result = withGlobalAudioDefaults({});
    expect(JSON.parse(JSON.stringify(result))).toStrictEqual(result);
  });
});
