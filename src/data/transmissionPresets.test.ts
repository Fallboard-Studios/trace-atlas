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

import { TRANSMISSION_PRESETS, presetPayload, type TransmissionPreset } from './transmissionPresets';
import { applySessionPayload } from '../utils/sessionDiff';
import { decodeWorldLink } from '../utils/worldLink';
import { useAttenuationStyleStore, selectCurrentAttenuationStyle, DEFAULT_PELAGOS } from '../stores/attenuationStyleStore';
import { useLocaleStore, DEFAULT_LOCALE } from '../stores/localeStore';
import { useAudioStore } from '../stores/audioStore';
import { stopRobotLifecycle } from '../systems/robotSystems';
import { stopAudioSwells } from '../systems/audioSwells';
import { CONTENT, labels } from '../content';
import { LFO_LANE_IDS, GLOBAL_LFO_TARGET_IDS } from '../types/lfo';

/*
 * docs/tasks/OFF_SCREEN.md Task 11 (spec assumption 13): a preset is a pasted link — `{ id, nameKey, link }` — and
 * presetPayload decodes it through the same codec a shared link arrives by. The three entries are the placeholders'
 * bare triples until Crawford pastes his; the three hand-kept payload constants are gone.
 */

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

/** The identity a link's params name, read back with the browser's own parser. */
function linkIdentity(link: string) {
  const params = new URL(link, 'http://localhost').searchParams;
  return { attenuationStyleName: params.get('seed'), coordinates: { x: Number(params.get('x')), y: Number(params.get('y')) } };
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

  it('is a link and a name and nothing else: no payload constant rides along', () => {
    for (const preset of TRANSMISSION_PRESETS) {
      expect(Object.keys(preset).sort()).toEqual(['id', 'link', 'nameKey']);
      expect(typeof preset.link).toBe('string');
    }
  });

  it('each link names a whole world — a seed and both coordinates, as integers', () => {
    for (const preset of TRANSMISSION_PRESETS) {
      const { attenuationStyleName, coordinates } = linkIdentity(preset.link);
      expect(attenuationStyleName, preset.id).toBeTruthy();
      expect(Number.isInteger(coordinates.x), preset.id).toBe(true);
      expect(Number.isInteger(coordinates.y), preset.id).toBe(true);
    }
  });

  it('gives each preset its own world, so picking one is visible on the faint backdrop', () => {
    const worlds = TRANSMISSION_PRESETS.map((p) => {
      const { attenuationStyleName, coordinates } = linkIdentity(p.link);
      return `${attenuationStyleName}@${coordinates.x},${coordinates.y}`;
    });
    expect(new Set(worlds).size).toBe(3);
  });

  describe.each(TRANSMISSION_PRESETS.map((p) => [p.id, p] as const))('preset %s, decoded', (_id, preset) => {
    it("decodes to a whole payload whose identity is the link's", () => {
      const payload = presetPayload(preset)!;
      expect(payload).not.toBeNull();
      const expected = linkIdentity(preset.link);
      expect(payload.attenuationStyleName).toBe(expected.attenuationStyleName);
      expect(payload.coordinates).toEqual(expected.coordinates);
    });

    it('is what the same link decodes to at the address bar: one codec behind both', () => {
      expect(presetPayload(preset)).toEqual(decodeWorldLink(new URL(preset.link, 'http://localhost').search));
    });

    it('is whole: every Audio Rig block, every LFO lane and every global link, never a partial set', () => {
      const payload = presetPayload(preset)!;
      expect(payload.globalAudio).toBeDefined();
      expect(Object.keys(payload.lfoBank ?? {}).sort()).toEqual([...LFO_LANE_IDS].sort());
      expect(Object.keys(payload.globalLfoLinks ?? {}).sort()).toEqual([...GLOBAL_LFO_TARGET_IDS].sort());
      for (const n of [payload.bpm, payload.swellFrequency, payload.swellDuration, payload.pingVarianceAutomation]) {
        expect(Number.isFinite(n)).toBe(true);
      }
    });

    it('is a plain untweaked world: no per-robot or per-company edits (a bare triple carries no blob)', () => {
      const payload = presetPayload(preset)!;
      expect(payload.robotOverrides).toEqual({});
      expect(payload.companyDiffs).toEqual({});
      expect(payload.userCreatedCompanies).toEqual([]);
    });

    it('is a fresh object on every call, so applying one pick can never leak into the next', () => {
      const first = presetPayload(preset)!;
      const second = presetPayload(preset)!;
      expect(first).not.toBe(second);
      expect(first.globalAudio).not.toBe(second.globalAudio);
      expect(first).toEqual(second);
    });

    it('is JSON-serialisable and survives a JSON round trip unchanged (no undefined holes)', () => {
      const payload = presetPayload(preset)!;
      expect(JSON.parse(JSON.stringify(payload))).toEqual(payload);
    });

    it('is accepted by applySessionPayload, which retransmits the world it names', () => {
      setupWorld();
      const payload = presetPayload(preset)!;
      expect(() => applySessionPayload(payload)).not.toThrow();
      expect(selectCurrentAttenuationStyle(useAttenuationStyleStore.getState())?.name).toBe(payload.attenuationStyleName);
      expect(currentLocale()?.coordinates).toEqual(payload.coordinates);
    });

    it('lands its pacing and LFO settings in the stores', () => {
      setupWorld();
      const payload = presetPayload(preset)!;
      applySessionPayload(payload);
      const audio = useAudioStore.getState();
      expect(audio.bpm).toBe(payload.bpm);
      expect(audio.swellFrequency).toBe(payload.swellFrequency);
      expect(audio.swellDuration).toBe(payload.swellDuration);
      expect(audio.pingVarianceAutomation).toBe(payload.pingVarianceAutomation);
      expect(audio.lfoBank).toEqual(payload.lfoBank);
      expect(audio.globalLfoLinks).toEqual(payload.globalLfoLinks);
    });

    it('applies twice in a row (the second pick names the already-current style)', () => {
      setupWorld();
      applySessionPayload(presetPayload(preset)!);
      expect(() => applySessionPayload(presetPayload(preset)!)).not.toThrow();
      expect(selectCurrentAttenuationStyle(useAttenuationStyleStore.getState())?.name).toBe(linkIdentity(preset.link).attenuationStyleName);
    });
  });

  it('switches from one preset to another', () => {
    setupWorld();
    const [first, second] = TRANSMISSION_PRESETS;
    applySessionPayload(presetPayload(first)!);
    applySessionPayload(presetPayload(second)!);
    const expected = linkIdentity(second.link);
    expect(selectCurrentAttenuationStyle(useAttenuationStyleStore.getState())?.name).toBe(expected.attenuationStyleName);
    expect(currentLocale()?.coordinates).toEqual(expected.coordinates);
  });
});

describe('presetPayload on a link that is not quite a world', () => {
  const preset = (link: string): TransmissionPreset => ({ id: 'x', nameKey: 'home.off.presets.a', link });

  it('a full share URL decodes the same as its bare query', () => {
    const query = TRANSMISSION_PRESETS[0].link;
    expect(presetPayload(preset(`https://host/trace-atlas/${query}`))).toEqual(presetPayload(preset(query)));
  });

  it('a malformed part is filled the way a shared link fills it — a random name, a random axis — and never throws', () => {
    const payload = presetPayload(preset('?seed=&x=foo&y=3'))!;
    expect(payload).not.toBeNull();
    expect(payload.attenuationStyleName).not.toBe('');
    expect(Number.isInteger(payload.coordinates.x)).toBe(true);
    expect(payload.coordinates.y).toBe(3);
  });

  it('a link that names no world at all is null, never a throw (the off screen applies nothing for it)', () => {
    expect(presetPayload(preset(''))).toBeNull();
    expect(presetPayload(preset('https://host/trace-atlas/?debug'))).toBeNull();
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
});
