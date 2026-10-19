import { describe, it, expect, vi, afterEach } from 'vitest';

// Same mock sessionDiff.test.ts uses: applySessionPayload retransmits the world, which starts the
// robot-lifecycle / audio-swells ticks, and those subscribe to BeatClock (no AudioContext in jsdom).
vi.mock('../engine/beatClock', () => ({
  subscribeToMeasure: vi.fn(() => vi.fn()),
  getCurrentMeasure: vi.fn(() => 0),
  scheduleRepeat: vi.fn(() => 'schedule-id'),
  cancelSchedule: vi.fn(),
  getCurrentMeasurePrecise: vi.fn(() => 0),
}));

import { TRANSMISSION_PRESETS } from './transmissionPresets';
import { applySessionPayload } from '../utils/sessionDiff';
import { encodeSessionPayload, decodeSessionPayload } from '../utils/sessionShareUtils';
import { useAttenuationStyleStore, selectCurrentAttenuationStyle, DEFAULT_PELAGOS } from '../stores/attenuationStyleStore';
import { useLocaleStore, DEFAULT_LOCALE } from '../stores/localeStore';
import { useAudioStore } from '../stores/audioStore';
import { stopRobotLifecycle } from '../systems/robotSystems';
import { stopAudioSwells } from '../systems/audioSwells';
import { CONTENT, fill, labels } from '../content';
import { LFO_LANE_IDS, GLOBAL_LFO_TARGET_IDS } from '../types/lfo';
import { DEFAULT_GLOBAL_AUDIO_SETTINGS } from '../types/globalAudio';

afterEach(() => {
  stopRobotLifecycle();
  stopAudioSwells();
});

let localeIdCounter = 0;
/** A fresh world for an apply to land on: one default Attenuation Style (whose name no preset shares)
 *  with an empty locale, so each test starts from the same blank state. */
function setupWorld(): string {
  const localeId = `transmission-presets-locale-${localeIdCounter++}`;
  useAttenuationStyleStore.setState({
    attenuationStyles: [{ ...DEFAULT_PELAGOS, name: 'not-a-preset', currentLocaleId: localeId }],
    currentAttenuationStyleId: DEFAULT_PELAGOS.id,
  });
  useLocaleStore.setState({ locales: { [localeId]: { ...DEFAULT_LOCALE, id: localeId, robots: [], companies: [] } } });
  return localeId;
}

function currentLocale() {
  const style = selectCurrentAttenuationStyle(useAttenuationStyleStore.getState());
  return style?.currentLocaleId ? useLocaleStore.getState().getLocaleById(style.currentLocaleId) : undefined;
}

describe('TRANSMISSION_PRESETS', () => {
  it('has exactly three presets', () => {
    expect(TRANSMISSION_PRESETS).toHaveLength(3);
  });

  it('gives each preset a distinct, non-empty, stable id', () => {
    const ids = TRANSMISSION_PRESETS.map((p) => p.id);
    expect(ids.every((id) => id.trim() !== '')).toBe(true);
    expect(new Set(ids).size).toBe(3);
    expect(ids).toEqual(['a', 'b', 'c']);
  });

  it('names each preset through a content key that exists, in the home.off.presets group', () => {
    for (const preset of TRANSMISSION_PRESETS) {
      expect(preset.nameKey).toBe(`home.off.presets.${preset.id}`);
      expect(preset.nameKey in CONTENT).toBe(true);
    }
  });

  it('shows three distinct, non-empty names', () => {
    const names = TRANSMISSION_PRESETS.map((p) => labels(p.nameKey).humanLabel);
    expect(names.every((n) => n.trim() !== '')).toBe(true);
    expect(new Set(names).size).toBe(3);
  });

  it('gives each preset its own world, so picking one is visible on the faint backdrop', () => {
    const worlds = TRANSMISSION_PRESETS.map((p) => `${p.payload.attenuationStyleName}@${p.payload.coordinates.x},${p.payload.coordinates.y}`);
    expect(new Set(worlds).size).toBe(3);
  });

  // Code review 2026-10-11: payloads captured from a live session carried floating-point noise
  // (0.30000000000000004); the session save path strips it, so a hand-kept payload must too.
  it('holds no floating-point noise: every number survives rounding to 10 decimals unchanged', () => {
    const noisy: string[] = [];
    const walk = (value: unknown, path: string) => {
      if (typeof value === 'number') {
        if (Number(value.toFixed(10)) !== value) noisy.push(`${path} = ${value}`);
      } else if (Array.isArray(value)) {
        value.forEach((item, i) => walk(item, `${path}[${i}]`));
      } else if (value && typeof value === 'object') {
        for (const [key, item] of Object.entries(value)) walk(item, `${path}.${key}`);
      }
    };
    for (const preset of TRANSMISSION_PRESETS) walk(preset.payload, preset.id);
    expect(noisy).toEqual([]);
  });

  it('shares no object between presets, so a change to one can never leak into another', () => {
    const [a, b, c] = TRANSMISSION_PRESETS.map((p) => p.payload);
    expect(a.globalAudio).not.toBe(b.globalAudio);
    expect(b.globalAudio).not.toBe(c.globalAudio);
    expect(a.lfoBank).not.toBe(b.lfoBank);
    expect(a.coordinates).not.toBe(b.coordinates);
  });

  describe.each(TRANSMISSION_PRESETS.map((p) => [p.id, p] as const))('preset %s payload', (_id, preset) => {
    const { payload } = preset;

    it('is a plain version-2 payload with no per-robot or per-company edits', () => {
      expect(payload.version).toBe(2);
      expect(payload.robotOverrides).toEqual({});
      expect(payload.companyDiffs).toEqual({});
      expect(payload.userCreatedCompanies).toEqual([]);
    });

    // Robot Sends T6: the rooms' return level is full in every preset, so the three worlds' echo is set by the
    // robots' own sends, not by a wet value the preset carried over from the old wet/dry mix.
    it('sets both room return levels (reverb.wet, delay.wet) to full, 1', () => {
      expect(payload.globalAudio?.reverb.wet).toBe(1);
      expect(payload.globalAudio?.delay.wet).toBe(1);
    });

    // Global Colour T1 (docs/specs/GLOBAL_COLOUR.md assumption 8): a preset is a hand-written world, so it
    // carries the three colour blocks explicitly, dry, at the shape defaults.
    it('carries the three colour blocks dry at the defaults', () => {
      expect(payload.globalAudio?.distortion).toStrictEqual({ amount: 0.3, wet: 0 });
      expect(payload.globalAudio?.chebyshev).toStrictEqual({ order: 2, wet: 0 });
      expect(payload.globalAudio?.bitCrusher).toStrictEqual({ bits: 8, wet: 0 });
    });

    // Global Modulation T1 (docs/specs/GLOBAL_MODULATION_COLOUR.md assumption 10): presets stay clean, so both
    // pedals are carried explicitly at Tone's defaults with wet 0 and no sync key (Free).
    it('carries both modulation pedals dry at the defaults, the Phaser Free', () => {
      expect(payload.globalAudio?.autoWah).toStrictEqual({
        baseFrequency: 100, octaves: 6, sensitivity: 0, Q: 2, gain: 2, follower: 0.2, wet: 0,
      });
      expect(payload.globalAudio?.phaser).toStrictEqual({
        rate: 0.5, octaves: 3, baseFrequency: 350, stages: 10, Q: 10, wet: 0,
      });
      expect(payload.globalAudio?.phaser && 'sync' in payload.globalAudio.phaser).toBe(false);
    });

    // Global Pedals T1 (docs/specs/GLOBAL_PEDALS.md assumption 10): presets stay clean, so the five new blocks are
    // carried explicitly at the defaults - every motion pedal dry and Free, the widener at unity.
    it('carries the five Global Pedals blocks at the defaults, dry and Free, Width at unity', () => {
      for (const key of ['chorus', 'tremolo', 'vibrato', 'frequencyShifter', 'stereoWidener'] as const) {
        expect(payload.globalAudio?.[key], key).toBeDefined();
        expect(payload.globalAudio?.[key], key).toStrictEqual(DEFAULT_GLOBAL_AUDIO_SETTINGS[key]);
      }
    });

    it('carries every LFO lane and every global LFO link, never a partial set', () => {
      expect(Object.keys(payload.lfoBank ?? {}).sort()).toEqual([...LFO_LANE_IDS].sort());
      expect(Object.keys(payload.globalLfoLinks ?? {}).sort()).toEqual([...GLOBAL_LFO_TARGET_IDS].sort());
    });

    it('has a non-empty Attenuation Style name and finite coordinates and pacing numbers', () => {
      expect(payload.attenuationStyleName.trim()).not.toBe('');
      for (const n of [payload.coordinates.x, payload.coordinates.y, payload.bpm, payload.swellFrequency, payload.swellDuration, payload.pingVarianceAutomation]) {
        expect(Number.isFinite(n)).toBe(true);
      }
    });

    it('is JSON-serialisable and survives a JSON round trip unchanged (no undefined holes)', () => {
      expect(JSON.parse(JSON.stringify(payload))).toEqual(payload);
    });

    it('passes the same wire validation a shared link passes, and decodes back to the same payload', () => {
      const decoded = decodeSessionPayload(encodeSessionPayload(payload));
      expect(decoded).not.toBeNull();
      expect(decoded?.attenuationStyleName).toBe(payload.attenuationStyleName);
      expect(decoded?.coordinates).toEqual(payload.coordinates);
      expect(decoded?.globalAudio).toEqual(payload.globalAudio);
      expect(decoded?.lfoBank).toEqual(payload.lfoBank);
      expect(decoded?.globalLfoLinks).toEqual(payload.globalLfoLinks);
    });

    it('is accepted by applySessionPayload, which retransmits the world it names', () => {
      setupWorld();
      expect(() => applySessionPayload(payload)).not.toThrow();
      expect(selectCurrentAttenuationStyle(useAttenuationStyleStore.getState())?.name).toBe(payload.attenuationStyleName);
      expect(currentLocale()?.coordinates).toEqual(payload.coordinates);
    });

    it('lands its pacing and LFO settings in the stores', () => {
      setupWorld();
      applySessionPayload(payload);
      const audio = useAudioStore.getState();
      expect(audio.bpm).toBe(payload.bpm);
      expect(audio.swellFrequency).toBe(payload.swellFrequency);
      expect(audio.swellDuration).toBe(payload.swellDuration);
      expect(audio.pingVarianceAutomation).toBe(payload.pingVarianceAutomation);
      expect(audio.lfoBank).toEqual(payload.lfoBank);
      expect(audio.globalLfoLinks).toEqual(payload.globalLfoLinks);
    });

    it('lands the full room return levels in the audio store', () => {
      setupWorld();
      applySessionPayload(payload);
      const audio = useAudioStore.getState();
      expect(audio.globalAudio.reverb.wet).toBe(1);
      expect(audio.globalAudio.delay.wet).toBe(1);
    });

    it('is left untouched by applying it, so the constant can be picked again', () => {
      const before = structuredClone(payload);
      setupWorld();
      applySessionPayload(payload);
      expect(payload).toEqual(before);
    });

    it('applies twice in a row (the second pick names the already-current style)', () => {
      setupWorld();
      applySessionPayload(payload);
      expect(() => applySessionPayload(payload)).not.toThrow();
      expect(selectCurrentAttenuationStyle(useAttenuationStyleStore.getState())?.name).toBe(payload.attenuationStyleName);
    });
  });

  it('switches from one preset to another', () => {
    setupWorld();
    const [first, second] = TRANSMISSION_PRESETS;
    applySessionPayload(first.payload);
    applySessionPayload(second.payload);
    expect(selectCurrentAttenuationStyle(useAttenuationStyleStore.getState())?.name).toBe(second.payload.attenuationStyleName);
    expect(currentLocale()?.coordinates).toEqual(second.payload.coordinates);
  });
});

describe('the off-screen content', () => {
  it('has the etched label, the power hint and the picker row name', () => {
    for (const key of ['home.off.label', 'home.off.powerHint', 'home.off.transmission'] as const) {
      expect(labels(key).humanLabel.trim()).not.toBe('');
    }
  });

  it('says pressing power will play sound', () => {
    expect(labels('home.off.powerHint').humanLabel.toLowerCase()).toContain('sound');
  });

  it('fills the readout well from a preset name and its code', () => {
    expect(fill('home.off.readout', { name: 'Kryndara', code: 'kr1nd4ra' })).toBe('Kryndara · kr1nd4ra');
  });

  it('refuses to fill the readout without its slots', () => {
    expect(() => fill('home.off.readout', { name: 'Kryndara' })).toThrow();
  });
});
