// ========================================
// IMPORTS
// ========================================
import { describe, it, expect } from 'vitest';

import {
  DEFAULT_GLOBAL_AUDIO_SETTINGS,
  PEDAL_RATE_RANGE_HZ,
  PEDAL_RATE_STEP_HZ,
  SYNCED_RATE_KEYS,
  isSyncedRateKey,
  withGlobalAudioDefaults,
} from './globalAudio';
import type { ChorusSettings, GlobalAudioSettings, PhaserSettings, TremoloSettings } from './globalAudio';

// ========================================
// TESTS
// ========================================

describe('SYNCED_RATE_KEYS', () => {
  it('lists the four synced-rate blocks, the Phaser first, in chain order', () => {
    expect([...SYNCED_RATE_KEYS]).toStrictEqual(['phaser', 'chorus', 'tremolo', 'vibrato']);
  });

  it('isSyncedRateKey is true for exactly those four keys, and false for every other effect key and for junk', () => {
    for (const key of SYNCED_RATE_KEYS) expect(isSyncedRateKey(key), key).toBe(true);
    for (const key of ['autoWah', 'frequencyShifter', 'stereoWidener', 'delay', 'reverb', 'eq3', 'limiter', '', 'Phaser', 'rate']) {
      expect(isSyncedRateKey(key), key).toBe(false);
    }
  });
});

describe('DEFAULT_GLOBAL_AUDIO_SETTINGS', () => {
  // Robot Sends T6 (docs/specs/ROBOT_SENDS.md §1.1): the rooms are fed by each robot's own send, so the
  // global wet is their RETURN level - full by default, not a wet/dry mix.
  it('defaults the Reverb and Delay return levels to full (1)', () => {
    expect(DEFAULT_GLOBAL_AUDIO_SETTINGS.reverb.wet).toBe(1);
    expect(DEFAULT_GLOBAL_AUDIO_SETTINGS.delay.wet).toBe(1);
  });

  // Spec amendment 2026-10-21 (docs/tasks/ROBOT_EFFECT_SENDS.md T17.2): the Colour room has no master Return, so no
  // settings block; each colour Mix is its effect's return level.
  it('has no Colour room block, in the defaults or the type', () => {
    expect('colourRoom' in DEFAULT_GLOBAL_AUDIO_SETTINGS).toBe(false);
    // @ts-expect-error - GlobalAudioSettings has no colourRoom key (npm run build:types enforces this line).
    const stray: GlobalAudioSettings['colourRoom'] = { wet: 1 };
    expect(stray).toBeDefined();
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

  // V2 removed a Chorus ("the effect isn't correct for this music"); Global Pedals (docs/specs/GLOBAL_PEDALS.md,
  // backlog 22) brings one back as a dry-by-default pedal after the Phaser, so the old absence guard is inverted.
  // Robot Effect Sends T8 (docs/specs/ROBOT_EFFECT_SENDS.md assumption 4): the Chorus is the Double room now, and its
  // wet the room's Return, full by default; a robot's own Double send sets how much goes in.
  it('has a chorus field again, its wet a full Return by default (Global Pedals, Robot Effect Sends)', () => {
    expect('chorus' in DEFAULT_GLOBAL_AUDIO_SETTINGS).toBe(true);
    expect(DEFAULT_GLOBAL_AUDIO_SETTINGS.chorus.wet).toBe(1);
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

// Global Modulation T1 (docs/specs/GLOBAL_MODULATION_COLOUR.md §1.1, assumption 10): two pedal blocks at
// Tone's own defaults, both dry (wet 0), the Phaser Free (no sync key).
describe('DEFAULT_GLOBAL_AUDIO_SETTINGS modulation blocks', () => {
  it('carries autoWah and phaser at Tone\'s defaults', () => {
    expect(DEFAULT_GLOBAL_AUDIO_SETTINGS.autoWah).toStrictEqual({
      baseFrequency: 100,
      octaves: 6,
      sensitivity: 0,
      Q: 2,
      gain: 2,
      follower: 0.2,
      wet: 0,
    });
    expect(DEFAULT_GLOBAL_AUDIO_SETTINGS.phaser).toStrictEqual({
      rate: 0.5,
      octaves: 3,
      baseFrequency: 350,
      stages: 10,
      Q: 10,
      wet: 0,
    });
  });

  it('keeps both pedals dry so a default world is clean', () => {
    expect(DEFAULT_GLOBAL_AUDIO_SETTINGS.autoWah.wet).toBe(0);
    expect(DEFAULT_GLOBAL_AUDIO_SETTINGS.phaser.wet).toBe(0);
  });

  it('defaults the Phaser to Free: there is no sync key at all, not even undefined', () => {
    expect('sync' in DEFAULT_GLOBAL_AUDIO_SETTINGS.phaser).toBe(false);
  });

  it('keeps stages an integer inside 1 - 12', () => {
    const { stages } = DEFAULT_GLOBAL_AUDIO_SETTINGS.phaser;
    expect(Number.isInteger(stages)).toBe(true);
    expect(stages).toBeGreaterThanOrEqual(1);
    expect(stages).toBeLessThanOrEqual(12);
  });

  it('puts the two pedals between bitCrusher and the Global Pedals blocks in key order', () => {
    const keys = Object.keys(DEFAULT_GLOBAL_AUDIO_SETTINGS);
    expect(keys.indexOf('autoWah')).toBe(keys.indexOf('bitCrusher') + 1);
    expect(keys.indexOf('phaser')).toBe(keys.indexOf('autoWah') + 1);
    expect(keys.indexOf('chorus')).toBe(keys.indexOf('phaser') + 1);
  });
});

// Global Pedals T1 (docs/specs/GLOBAL_PEDALS.md §1.1, assumption 10): five blocks at Tone's defaults, every Mix 0 and
// Width 0.5 (unity), so a default world sounds as it did; no `sync` key on the three LFO pedals (Free).
describe('DEFAULT_GLOBAL_AUDIO_SETTINGS Global Pedals blocks', () => {
  it('carries the four motion pedals and the widener at Tone\'s defaults', () => {
    expect(DEFAULT_GLOBAL_AUDIO_SETTINGS.chorus).toStrictEqual({
      rate: 1.5,
      delayTime: 3.5,
      depth: 0.7,
      spread: 180,
      feedback: 0,
      wet: 1,
    });
    expect(DEFAULT_GLOBAL_AUDIO_SETTINGS.tremolo).toStrictEqual({ rate: 10, depth: 0.5, spread: 180, wet: 0 });
    expect(DEFAULT_GLOBAL_AUDIO_SETTINGS.vibrato).toStrictEqual({ rate: 5, depth: 0.1, wet: 0 });
    // Robot Effect Sends T8: the shifter's wet is the Shimmer room's Return, full by default.
    expect(DEFAULT_GLOBAL_AUDIO_SETTINGS.frequencyShifter).toStrictEqual({ shift: 0, wet: 1 });
    expect(DEFAULT_GLOBAL_AUDIO_SETTINGS.stereoWidener).toStrictEqual({ width: 0.5 });
  });

  // Robot Effect Sends T8: the Tremolo and Vibrato stay dry by default; the Chorus and shifter wets are room Returns, full
  // by default, and a default world is still clean because no robot sends into those rooms until its seed says so.
  it('keeps the in-chain motion pedals dry, the two room Returns full, and the widener at unity, so a default world is clean', () => {
    for (const key of ['tremolo', 'vibrato'] as const) {
      expect(DEFAULT_GLOBAL_AUDIO_SETTINGS[key].wet, key).toBe(0);
    }
    for (const key of ['chorus', 'frequencyShifter'] as const) {
      expect(DEFAULT_GLOBAL_AUDIO_SETTINGS[key].wet, key).toBe(1);
    }
    expect(DEFAULT_GLOBAL_AUDIO_SETTINGS.stereoWidener.width).toBe(0.5);
  });

  it('defaults the three LFO pedals to Free: no sync key at all, not even undefined', () => {
    for (const key of ['chorus', 'tremolo', 'vibrato'] as const) {
      expect('sync' in DEFAULT_GLOBAL_AUDIO_SETTINGS[key], key).toBe(false);
    }
  });

  it('keeps every default rate inside PEDAL_RATE_RANGE_HZ', () => {
    for (const key of ['chorus', 'tremolo', 'vibrato'] as const) {
      expect(DEFAULT_GLOBAL_AUDIO_SETTINGS[key].rate, key).toBeGreaterThanOrEqual(PEDAL_RATE_RANGE_HZ.min);
      expect(DEFAULT_GLOBAL_AUDIO_SETTINGS[key].rate, key).toBeLessThanOrEqual(PEDAL_RATE_RANGE_HZ.max);
    }
  });

  it('orders the keys as the chain: Phaser, the four motion pedals, the widener, then the Limiter', () => {
    const keys = Object.keys(DEFAULT_GLOBAL_AUDIO_SETTINGS);
    const at = (key: string) => keys.indexOf(key);
    expect(at('chorus')).toBe(at('phaser') + 1);
    expect(at('tremolo')).toBe(at('chorus') + 1);
    expect(at('vibrato')).toBe(at('tremolo') + 1);
    expect(at('frequencyShifter')).toBe(at('vibrato') + 1);
    expect(at('stereoWidener')).toBe(at('frequencyShifter') + 1);
    expect(at('limiter')).toBe(at('stereoWidener') + 1);
  });
});

describe('PEDAL_RATE_RANGE_HZ', () => {
  it('spans 0.05 - 10 Hz: zero is excluded because a stopped phaser is a fixed notch, not off', () => {
    expect(PEDAL_RATE_RANGE_HZ).toStrictEqual({ min: 0.05, max: 10 });
  });

  it('steps the Rate slider by 0.05 Hz, the lane Rate slider step, so a Sync to Free conversion lands on its grid', () => {
    expect(PEDAL_RATE_STEP_HZ).toBe(0.05);
    expect(PEDAL_RATE_STEP_HZ).toBe(PEDAL_RATE_RANGE_HZ.min);
  });

  it('contains the default rate', () => {
    expect(DEFAULT_GLOBAL_AUDIO_SETTINGS.phaser.rate).toBeGreaterThanOrEqual(PEDAL_RATE_RANGE_HZ.min);
    expect(DEFAULT_GLOBAL_AUDIO_SETTINGS.phaser.rate).toBeLessThanOrEqual(PEDAL_RATE_RANGE_HZ.max);
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

  // Spec assumption 13 as amended (T17.2): a payload saved between T2 and the amendment may carry a Colour room block;
  // it is dropped on the way in, never an error.
  it('drops a stray colourRoom block from an old payload, keeping every other block', () => {
    const stale = { colourRoom: { wet: 0.4 }, reverb: { decay: 2, preDelay: 0.01, wet: 0.3 } } as unknown as Partial<GlobalAudioSettings>;
    const result = withGlobalAudioDefaults(stale);
    expect('colourRoom' in result).toBe(false);
    expect(result.reverb).toStrictEqual({ decay: 2, preDelay: 0.01, wet: 0.3 });
    expect(Object.keys(result)).toEqual(Object.keys(DEFAULT_GLOBAL_AUDIO_SETTINGS));
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

  it.each([
    ['a number', 1],
    ['a string', 'chorus'],
    ['a boolean', true],
    ['an array', [0.5]],
  ])('treats a block that is %s as absent, so a crafted payload cannot reach the sanitisers', (_label, value) => {
    const given = { chorus: value, phaser: value, delay: value, limiter: value } as unknown as Partial<GlobalAudioSettings>;
    const result = withGlobalAudioDefaults(given);
    expect(result.chorus).toStrictEqual(DEFAULT_GLOBAL_AUDIO_SETTINGS.chorus);
    expect(result.phaser).toStrictEqual(DEFAULT_GLOBAL_AUDIO_SETTINGS.phaser);
    expect(result.delay).toStrictEqual(DEFAULT_GLOBAL_AUDIO_SETTINGS.delay);
    expect(result.limiter).toStrictEqual(DEFAULT_GLOBAL_AUDIO_SETTINGS.limiter);
  });

  it('keeps a boolean compressorBeforeDelay and defaults one of the wrong type', () => {
    expect(withGlobalAudioDefaults({ compressorBeforeDelay: true }).compressorBeforeDelay).toBe(true);
    const crafted = { compressorBeforeDelay: { on: true } } as unknown as Partial<GlobalAudioSettings>;
    expect(withGlobalAudioDefaults(crafted).compressorBeforeDelay).toBe(false);
  });

  it('does not share nested state between two calls', () => {
    const a = withGlobalAudioDefaults({});
    const b = withGlobalAudioDefaults({});
    expect(a.bitCrusher).not.toBe(b.bitCrusher);
    expect(a.autoWah).not.toBe(b.autoWah);
    expect(a.phaser).not.toBe(b.phaser);
  });

  it('fills both pedal blocks for an empty payload', () => {
    const result = withGlobalAudioDefaults({});
    expect(result.autoWah).toStrictEqual(DEFAULT_GLOBAL_AUDIO_SETTINGS.autoWah);
    expect(result.phaser).toStrictEqual(DEFAULT_GLOBAL_AUDIO_SETTINGS.phaser);
  });

  it('keeps a present phaser byte-for-byte, sync key included, and fills the absent autoWah', () => {
    const phaser: PhaserSettings = {
      rate: 2,
      octaves: 4,
      baseFrequency: 500,
      stages: 6,
      Q: 5,
      wet: 0.2,
      sync: { division: '1/4', modifier: 'dotted' },
    };
    const result = withGlobalAudioDefaults({ phaser: structuredClone(phaser) });
    expect(result.phaser).toStrictEqual(phaser);
    expect(result.autoWah).toStrictEqual(DEFAULT_GLOBAL_AUDIO_SETTINGS.autoWah);
  });

  it('keeps a present autoWah byte-for-byte and fills the absent phaser with no sync key', () => {
    const autoWah = { baseFrequency: 200, octaves: 3, sensitivity: -12, Q: 4, gain: 6, follower: 0.1, wet: 0.15 };
    const result = withGlobalAudioDefaults({ autoWah: { ...autoWah } });
    expect(result.autoWah).toStrictEqual(autoWah);
    expect(result.phaser).toStrictEqual(DEFAULT_GLOBAL_AUDIO_SETTINGS.phaser);
    expect('sync' in result.phaser).toBe(false);
  });

  it('treats an explicit undefined pedal block as absent', () => {
    const given = { phaser: undefined, autoWah: undefined } as unknown as Partial<GlobalAudioSettings>;
    const result = withGlobalAudioDefaults(given);
    expect(result.phaser).toStrictEqual(DEFAULT_GLOBAL_AUDIO_SETTINGS.phaser);
    expect(result.autoWah).toStrictEqual(DEFAULT_GLOBAL_AUDIO_SETTINGS.autoWah);
  });

  it('fills all five Global Pedals blocks for an empty payload (an old save loads dry, at unity width)', () => {
    const result = withGlobalAudioDefaults({});
    for (const key of ['chorus', 'tremolo', 'vibrato', 'frequencyShifter', 'stereoWidener'] as const) {
      expect(result[key], key).toStrictEqual(DEFAULT_GLOBAL_AUDIO_SETTINGS[key]);
      expect(result[key], key).not.toBe(DEFAULT_GLOBAL_AUDIO_SETTINGS[key]);
    }
  });

  it('keeps a present Global Pedals block whole (sync included) and never deep-merges a partial one', () => {
    const chorus: ChorusSettings = {
      rate: 2,
      delayTime: 6,
      depth: 0.4,
      spread: 90,
      feedback: 0.3,
      wet: 0.5,
      sync: { division: '1/4', modifier: 'straight' },
    };
    const partialTremolo = { wet: 0.4 } as unknown as TremoloSettings;
    const result = withGlobalAudioDefaults({ chorus: structuredClone(chorus), tremolo: partialTremolo });
    expect(result.chorus).toStrictEqual(chorus);
    expect(result.tremolo).toStrictEqual({ wet: 0.4 });
    expect(result.vibrato).toStrictEqual(DEFAULT_GLOBAL_AUDIO_SETTINGS.vibrato);
  });

  it('stays JSON-serialisable', () => {
    const result = withGlobalAudioDefaults({});
    expect(JSON.parse(JSON.stringify(result))).toStrictEqual(result);
  });
});
