// ========================================
// IMPORTS
// ========================================
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { SessionPayload } from '../types/session';
import type { LfoLaneId, GlobalLfoTargetId, LfoLink, BankLfoSettings } from '../types/lfo';
import { LFO_LANE_IDS, GLOBAL_LFO_TARGET_IDS } from '../types/lfo';
import { DEFAULT_BANK_LFO, DEFAULT_LFO_LINK } from '../data/lfoConfig';
import { NOTE_VALUES, type NoteValue } from '../data/noteValues';
import { DEFAULT_GLOBAL_AUDIO_SETTINGS } from '../types/globalAudio';
import { encodeSessionPayload, decodeSessionPayload, buildShareUrl, copySessionLink } from './sessionShareUtils';

// ========================================
// HELPERS
// ========================================

/** Decodes an encodeSessionPayload() output back to its raw wire JSON object -- bypassing
 *  decodeSessionPayload's own expansion, so a test can inspect the actual bytes-on-the-wire
 *  shape (abbreviated keys, omitted-when-empty fields) rather than the reconstructed SessionPayload. */
function decodeRawWire(encoded: string): unknown {
  const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function makePayload(overrides: Partial<SessionPayload> = {}): SessionPayload {
  return {
    version: 1,
    attenuationStyleName: 'Pelagos 7!',
    coordinates: { x: -5, y: 777 },
    // A full set of blocks, as every real payload carries: decoding fills any missing block from the
    // defaults (Global Colour T10), so an empty stand-in would no longer round-trip as itself.
    globalAudio: structuredClone(DEFAULT_GLOBAL_AUDIO_SETTINGS),
    robotOverrides: {},
    companyDiffs: {},
    userCreatedCompanies: [],
    ...overrides,
  };
}

function makeLfoBank(overrides: Partial<Record<LfoLaneId, BankLfoSettings>> = {}): Record<LfoLaneId, BankLfoSettings> {
  const base: BankLfoSettings = { shape: 'sine', rate: 2, rateDrift: 0.1, depthDrift: -0.2 };
  return Object.fromEntries(LFO_LANE_IDS.map((lane) => [lane, overrides[lane] ?? { ...base }])) as Record<LfoLaneId, BankLfoSettings>;
}

function makeGlobalLfoLinks(overrides: Partial<Record<GlobalLfoTargetId, LfoLink>> = {}): Record<GlobalLfoTargetId, LfoLink> {
  return Object.fromEntries(GLOBAL_LFO_TARGET_IDS.map((t) => [t, overrides[t] ?? { lane: null, depth: 0 }])) as Record<GlobalLfoTargetId, LfoLink>;
}

// ========================================
// TESTS
// ========================================

describe('encodeSessionPayload / decodeSessionPayload', () => {
  it('round-trips a representative payload', () => {
    const payload = makePayload();
    expect(decodeSessionPayload(encodeSessionPayload(payload))).toEqual(payload);
  });

  it('round-trips non-Latin1 characters (company/robot names are not charset-restricted)', () => {
    const payload = makePayload({
      userCreatedCompanies: [{ id: 'c1', name: 'Ü Robotics 日本語', color: '#123456', robotIds: [] }],
    });
    expect(decodeSessionPayload(encodeSessionPayload(payload))).toEqual(payload);
  });

  it('omits empty robotOverrides/companyDiffs/userCreatedCompanies from the wire encoding entirely -- only what changed is sent', () => {
    const payload = makePayload({ robotOverrides: {}, companyDiffs: {}, userCreatedCompanies: [] });
    const wire = decodeRawWire(encodeSessionPayload(payload)) as Record<string, unknown>;
    expect(wire).not.toHaveProperty('r');
    expect(wire).not.toHaveProperty('d');
    expect(wire).not.toHaveProperty('u');
  });

  it('includes robotOverrides/companyDiffs/userCreatedCompanies on the wire when non-empty, and they still round-trip', () => {
    const payload = makePayload({
      robotOverrides: { 'robot-1': { rhythmicDensity: 42 } },
      companyDiffs: { 'company-1': { name: 'Renamed Co' } },
      userCreatedCompanies: [{ id: 'c1', name: 'User Co', color: '#abcdef', robotIds: [] }],
    });
    const wire = decodeRawWire(encodeSessionPayload(payload)) as Record<string, unknown>;
    expect(wire).toHaveProperty('r');
    expect(wire).toHaveProperty('d');
    expect(wire).toHaveProperty('u');
    expect(decodeSessionPayload(encodeSessionPayload(payload))).toEqual(payload);
  });

  it('omits bpm/swellFrequency/swellDuration/pingVarianceAutomation from the wire entirely when absent from the payload', () => {
    const payload = makePayload();
    const wire = decodeRawWire(encodeSessionPayload(payload)) as Record<string, unknown>;
    expect(wire).not.toHaveProperty('b');
    expect(wire).not.toHaveProperty('sf');
    expect(wire).not.toHaveProperty('sd');
    expect(wire).not.toHaveProperty('pv');
  });

  it('includes and round-trips bpm/swellFrequency/swellDuration/pingVarianceAutomation when present, via abbreviated wire keys', () => {
    const payload = makePayload({ bpm: 77, swellFrequency: 9, swellDuration: 5, pingVarianceAutomation: 0.42 });
    const wire = decodeRawWire(encodeSessionPayload(payload)) as Record<string, unknown>;
    expect(wire.b).toBe(77);
    expect(wire.sf).toBe(9);
    expect(wire.sd).toBe(5);
    expect(wire.pv).toBe(0.42);
    expect(decodeSessionPayload(encodeSessionPayload(payload))).toEqual(payload);
  });

  it('uses abbreviated top-level keys on the wire, not the full SessionPayload field names', () => {
    const payload = makePayload();
    const wire = decodeRawWire(encodeSessionPayload(payload)) as Record<string, unknown>;
    expect(Object.keys(wire).sort()).toEqual(['c', 'g', 'n', 'v']);
    expect(wire).not.toHaveProperty('attenuationStyleName');
    expect(wire).not.toHaveProperty('coordinates');
  });

  it('round-trips lfoBank and globalLfoLinks on a version-2 payload (LFO Bank, docs/tasks/LFO_BANK.md Task 18)', () => {
    const payload = makePayload({
      version: 2,
      lfoBank: makeLfoBank({ b: { shape: 'triangle', rate: 3.5, rateDrift: 0.5, depthDrift: -0.75 } }),
      globalLfoLinks: makeGlobalLfoLinks({ 'eq3.low': { lane: 'c', depth: 42 } }),
    });
    expect(decodeSessionPayload(encodeSessionPayload(payload))).toEqual(payload);
  });

  it('round-trips a robot\'s lfoLinks diff on a version-2 payload', () => {
    const payload = makePayload({
      version: 2,
      lfoBank: makeLfoBank(),
      globalLfoLinks: makeGlobalLfoLinks(),
      robotOverrides: { 'robot-1': { lfoLinks: { 'layer1.gain': { lane: 'a', depth: 30 }, 'layer2.detune': { lane: null, depth: 0 } } } },
    });
    expect(decodeSessionPayload(encodeSessionPayload(payload))).toEqual(payload);
  });

  it('omits the lane key on the wire for a null-lane link, and still round-trips', () => {
    const payload = makePayload({ version: 2, lfoBank: makeLfoBank(), globalLfoLinks: makeGlobalLfoLinks() });
    const wire = decodeRawWire(encodeSessionPayload(payload)) as { gll: Record<string, Record<string, unknown>> };
    expect(wire.gll['eq3.low']).not.toHaveProperty('l');
    expect(decodeSessionPayload(encodeSessionPayload(payload))).toEqual(payload);
  });

  it('abbreviates lfoBank entries to {s,r,rd,dd}, global link entries to {l?,d}, and robot link entries under ll to {l?,d}', () => {
    const payload = makePayload({
      version: 2,
      lfoBank: makeLfoBank({ a: { shape: 'square', rate: 1.5, rateDrift: 0.25, depthDrift: -0.1 } }),
      globalLfoLinks: makeGlobalLfoLinks({ 'lpf.frequency': { lane: 'd', depth: 60 } }),
      robotOverrides: { 'robot-1': { lfoLinks: { 'layer1.gain': { lane: 'a', depth: 30 } } } },
    });
    const wire = decodeRawWire(encodeSessionPayload(payload)) as {
      lb: Record<string, Record<string, unknown>>;
      gll: Record<string, Record<string, unknown>>;
      r: Record<string, Record<string, unknown>>;
    };

    expect(Object.keys(wire.lb.a).sort()).toEqual(['dd', 'r', 'rd', 's']);
    expect(Object.keys(wire.gll['lpf.frequency']).sort()).toEqual(['d', 'l']);
    expect(Object.keys(wire.r['robot-1']).sort()).toEqual(['ll']);
    expect(Object.keys((wire.r['robot-1'].ll as Record<string, Record<string, unknown>>)['layer1.gain']).sort()).toEqual(['d', 'l']);
    expect(decodeSessionPayload(encodeSessionPayload(payload))).toEqual(payload);
  });

  describe('a manual pan on the wire (the `p` code, Robot Pan T12)', () => {
    /** Re-encodes a hand-edited wire object, the way a corrupted or tampered share link would arrive. */
    function encodeWire(wire: unknown): string {
      return btoa(unescape(encodeURIComponent(JSON.stringify(wire))));
    }

    /** A real encoded payload whose single robot entry has been replaced with `entry`. */
    function decodeWithRobotWire(entry: Record<string, unknown>) {
      const wire = decodeRawWire(encodeSessionPayload(makePayload({ robotOverrides: { 'robot-1': { rhythmicDensity: 42 } } }))) as Record<string, unknown>;
      return decodeSessionPayload(encodeWire({ ...wire, r: { 'robot-1': entry } }));
    }

    it('encodes pan as `p` and decodes it back to the original payload', () => {
      const payload = makePayload({ robotOverrides: { 'robot-1': { pan: 0.4 } } });
      const wire = decodeRawWire(encodeSessionPayload(payload)) as { r: Record<string, Record<string, unknown>> };

      expect(wire.r['robot-1']).toEqual({ p: 0.4 });
      expect(decodeSessionPayload(encodeSessionPayload(payload))).toEqual(payload);
    });

    it('round-trips a pan of exactly 0 (Auto off at the centre must not be dropped as falsy)', () => {
      const payload = makePayload({ robotOverrides: { 'robot-1': { pan: 0 } } });
      const wire = decodeRawWire(encodeSessionPayload(payload)) as { r: Record<string, Record<string, unknown>> };

      expect(wire.r['robot-1']).toEqual({ p: 0 });
      expect(decodeSessionPayload(encodeSessionPayload(payload))).toEqual(payload);
    });

    it('round-trips the negative range and both ends', () => {
      for (const pan of [-1, -0.25, 1]) {
        const payload = makePayload({ robotOverrides: { 'robot-1': { pan } } });
        expect(decodeSessionPayload(encodeSessionPayload(payload))).toEqual(payload);
      }
    });

    it('an entry with no `p` decodes with no pan key (absent means Auto)', () => {
      const decoded = decodeWithRobotWire({ rd: 42 });

      expect(decoded?.robotOverrides['robot-1']).toEqual({ rhythmicDensity: 42 });
      expect(decoded?.robotOverrides['robot-1']).not.toHaveProperty('pan');
    });

    it('drops a `p` that is a string, null (what JSON makes of NaN), out of range, or a boolean, keeping the rest of the entry', () => {
      for (const bad of ['x', null, 3, -1.5, 1.0001, true, {}]) {
        const decoded = decodeWithRobotWire({ rd: 42, p: bad });

        expect(decoded?.robotOverrides['robot-1']).toEqual({ rhythmicDensity: 42 });
      }
    });

    it('carries a pan next to the robot\'s other overrides', () => {
      const payload = makePayload({ robotOverrides: { 'robot-1': { rhythmicDensity: 42, pan: -0.6, name: 'Held' } } });

      expect(decodeSessionPayload(encodeSessionPayload(payload))).toEqual(payload);
    });

    it('a version-2 payload with one manual robot among others survives encode then decode, and stays version 2', () => {
      const payload = makePayload({
        version: 2,
        lfoBank: makeLfoBank(),
        globalLfoLinks: makeGlobalLfoLinks(),
        robotOverrides: {
          'robot-1': { rhythmicDensity: 42 },
          'robot-2': { pan: 0.4 },
          'robot-3': { lfoLinks: { 'layer1.gain': { lane: 'a', depth: 30 } } },
        },
      });

      const decoded = decodeSessionPayload(encodeSessionPayload(payload));

      expect(decoded).toEqual(payload);
      expect(decoded?.version).toBe(2);
    });
  });

  describe('sends on the wire (the `rs` / `ds` codes, Robot Sends T16)', () => {
    function encodeWire(wire: unknown): string {
      return btoa(unescape(encodeURIComponent(JSON.stringify(wire))));
    }

    /** A real encoded payload whose single robot entry has been replaced with `entry`. */
    function decodeWithRobotWire(entry: Record<string, unknown>) {
      const wire = decodeRawWire(encodeSessionPayload(makePayload({ robotOverrides: { 'robot-1': { rhythmicDensity: 42 } } }))) as Record<string, unknown>;
      return decodeSessionPayload(encodeWire({ ...wire, r: { 'robot-1': entry } }));
    }

    it('abbreviates the two sends as rs and ds and decodes them back, toEqual', () => {
      const payload = makePayload({ robotOverrides: { 'robot-1': { reverbSend: 0.35, delaySend: 0.6 } } });
      const wire = decodeRawWire(encodeSessionPayload(payload)) as { r: Record<string, Record<string, unknown>> };

      expect(wire.r['robot-1']).toEqual({ rs: 0.35, ds: 0.6 });
      expect(decodeSessionPayload(encodeSessionPayload(payload))).toEqual(payload);
    });

    it('round-trips a send of exactly 0 and of exactly 1 (a switched-off send must not be dropped as falsy)', () => {
      for (const send of [0, 1]) {
        const payload = makePayload({ robotOverrides: { 'robot-1': { reverbSend: send, delaySend: send } } });
        const wire = decodeRawWire(encodeSessionPayload(payload)) as { r: Record<string, Record<string, unknown>> };

        expect(wire.r['robot-1']).toEqual({ rs: send, ds: send });
        expect(decodeSessionPayload(encodeSessionPayload(payload))).toEqual(payload);
      }
    });

    it('carries one send alone, leaving the other key absent on the wire and after decoding', () => {
      const reverbOnly = makePayload({ robotOverrides: { 'robot-1': { reverbSend: 0.2 } } });
      const delayOnly = makePayload({ robotOverrides: { 'robot-1': { delaySend: 0 } } });

      const reverbWire = decodeRawWire(encodeSessionPayload(reverbOnly)) as { r: Record<string, Record<string, unknown>> };
      const delayWire = decodeRawWire(encodeSessionPayload(delayOnly)) as { r: Record<string, Record<string, unknown>> };
      expect(reverbWire.r['robot-1']).toEqual({ rs: 0.2 });
      expect(delayWire.r['robot-1']).toEqual({ ds: 0 });

      const reverbDecoded = decodeSessionPayload(encodeSessionPayload(reverbOnly));
      const delayDecoded = decodeSessionPayload(encodeSessionPayload(delayOnly));
      expect(reverbDecoded).toEqual(reverbOnly);
      expect(reverbDecoded?.robotOverrides['robot-1']).not.toHaveProperty('delaySend');
      expect(delayDecoded).toEqual(delayOnly);
      expect(delayDecoded?.robotOverrides['robot-1']).not.toHaveProperty('reverbSend');
    });

    it('an entry with neither key decodes with neither send (absent means the seeded send)', () => {
      const decoded = decodeWithRobotWire({ rd: 42 });

      expect(decoded?.robotOverrides['robot-1']).toEqual({ rhythmicDensity: 42 });
      expect(decoded?.robotOverrides['robot-1']).not.toHaveProperty('reverbSend');
      expect(decoded?.robotOverrides['robot-1']).not.toHaveProperty('delaySend');
    });

    it('drops an rs or ds that is a string, null (what JSON makes of NaN), a boolean, an object or out of [0, 1], keeping the rest of the entry', () => {
      for (const bad of ['x', '0.5', null, true, {}, [], 3, -0.1, 1.0001]) {
        expect(decodeWithRobotWire({ rd: 42, rs: bad })?.robotOverrides['robot-1']).toEqual({ rhythmicDensity: 42 });
        expect(decodeWithRobotWire({ rd: 42, ds: bad })?.robotOverrides['robot-1']).toEqual({ rhythmicDensity: 42 });
      }
    });

    it('drops each send on its own: a good rs survives a bad ds and the reverse', () => {
      expect(decodeWithRobotWire({ rs: 0.4, ds: 'x' })?.robotOverrides['robot-1']).toEqual({ reverbSend: 0.4 });
      expect(decodeWithRobotWire({ rs: -0.1, ds: 0.7 })?.robotOverrides['robot-1']).toEqual({ delaySend: 0.7 });
    });

    it('carries the sends next to the robot\'s other overrides, a pan and the articulation keys', () => {
      const payload = makePayload({
        robotOverrides: { 'robot-1': { rhythmicDensity: 42, pan: -0.6, portamento: 0.15, reverbSend: 0.25, delaySend: 0.5, name: 'Held' } },
      });

      expect(decodeSessionPayload(encodeSessionPayload(payload))).toEqual(payload);
    });

    it('a link from before the sends (no rs / ds) decodes to exactly the diff it always did, and stays version 2', () => {
      const payload = makePayload({
        version: 2,
        robotOverrides: { 'robot-1': { filterFreq: 800, pan: 0.4, name: 'Held' } },
      });
      const wire = decodeRawWire(encodeSessionPayload(payload)) as Record<string, unknown>;
      const olderWire = { ...wire, r: { 'robot-1': { f: 800, p: 0.4, nm: 'Held' } } };

      const decoded = decodeSessionPayload(encodeWire(olderWire));

      expect(decoded).toEqual(payload);
      expect(decoded?.version).toBe(2);
    });
  });

  // docs/tasks/ROBOT_PERFORMANCE.md Task 16: the three robot fields ride as dy / rt / ax, Humanize as the top-level hm.
  describe('performance on the wire (dy / rt / ax per robot, hm at the top level, Robot Performance T16)', () => {
    function encodeWire(wire: unknown): string {
      return btoa(unescape(encodeURIComponent(JSON.stringify(wire))));
    }

    /** A real encoded payload whose single robot entry has been replaced with `entry`. */
    function decodeWithRobotWire(entry: Record<string, unknown>) {
      const wire = decodeRawWire(encodeSessionPayload(makePayload({ robotOverrides: { 'robot-1': { rhythmicDensity: 42 } } }))) as Record<string, unknown>;
      return decodeSessionPayload(encodeWire({ ...wire, r: { 'robot-1': entry } }));
    }

    it('a payload with all four fields round-trips toEqual, abbreviated as dy / rt / ax and hm on the wire', () => {
      const payload = makePayload({ humanize: 12, robotOverrides: { 'robot-1': { dynamics: 70, rests: 30, accents: 60 } } });
      const wire = decodeRawWire(encodeSessionPayload(payload)) as { hm: unknown; r: Record<string, Record<string, unknown>> };

      expect(wire.hm).toBe(12);
      expect(wire.r['robot-1']).toEqual({ dy: 70, rt: 30, ax: 60 });
      expect(decodeSessionPayload(encodeSessionPayload(payload))).toEqual(payload);
    });

    it('round-trips a 0 and a 100 (a flattened robot must not be dropped as falsy)', () => {
      for (const value of [0, 100]) {
        const payload = makePayload({ humanize: 0, robotOverrides: { 'robot-1': { dynamics: value, rests: value, accents: value } } });

        expect(decodeSessionPayload(encodeSessionPayload(payload))).toEqual(payload);
      }
    });

    it('absent keys stay absent: no hm on the wire or after decoding, and a robot entry carries only the field it has', () => {
      const restsOnly = makePayload({ robotOverrides: { 'robot-1': { rests: 30 } } });
      const wire = decodeRawWire(encodeSessionPayload(restsOnly)) as Record<string, unknown> & { r: Record<string, Record<string, unknown>> };

      expect(wire).not.toHaveProperty('hm');
      expect(wire.r['robot-1']).toEqual({ rt: 30 });
      const decoded = decodeSessionPayload(encodeSessionPayload(restsOnly));
      expect(decoded).toEqual(restsOnly);
      // The top-level pacing fields decode as present-but-undefined keys (the sd / sf / b / pv convention), which
      // applySessionPayload reads as absent; the per-robot keys are genuinely omitted.
      expect(decoded?.humanize).toBeUndefined();
      expect(decoded?.robotOverrides['robot-1']).not.toHaveProperty('dynamics');
      expect(decoded?.robotOverrides['robot-1']).not.toHaveProperty('accents');
    });

    it('hm: "x" fails validation the way sd: "x" does (decodeSessionPayload returns null)', () => {
      const wire = decodeRawWire(encodeSessionPayload(makePayload())) as Record<string, unknown>;

      expect(decodeSessionPayload(encodeWire({ ...wire, hm: 'x' }))).toBeNull();
      expect(decodeSessionPayload(encodeWire({ ...wire, hm: 12 }))?.humanize).toBe(12);
    });

    it('dy: NaN decodes to absent (JSON writes a NaN as null), and a dropped key costs nothing beside it', () => {
      const encoded = encodeSessionPayload(makePayload({ robotOverrides: { 'robot-1': { dynamics: NaN, rests: 30 } } }));

      expect(decodeSessionPayload(encoded)?.robotOverrides['robot-1']).toEqual({ rests: 30 });
    });

    it('drops a dy, rt or ax that is a string, null, a boolean, an object or non-finite, keeping the rest of the entry', () => {
      for (const bad of ['x', '30', null, true, {}, []]) {
        expect(decodeWithRobotWire({ rd: 42, dy: bad })?.robotOverrides['robot-1']).toEqual({ rhythmicDensity: 42 });
        expect(decodeWithRobotWire({ rd: 42, rt: bad })?.robotOverrides['robot-1']).toEqual({ rhythmicDensity: 42 });
        expect(decodeWithRobotWire({ rd: 42, ax: bad })?.robotOverrides['robot-1']).toEqual({ rhythmicDensity: 42 });
      }
    });

    it('drops each field on its own: a good dy survives a bad rt and ax', () => {
      expect(decodeWithRobotWire({ dy: 70, rt: 'x', ax: null })?.robotOverrides['robot-1']).toEqual({ dynamics: 70 });
    });
  });

  describe('articulation on the wire (po / fq / ft, and ac / rc inside the envelope, Robot Articulation T12)', () => {
    function encodeWire(wire: unknown): string {
      return btoa(unescape(encodeURIComponent(JSON.stringify(wire))));
    }

    /** A real encoded payload whose single robot entry has been replaced with `entry`. */
    function decodeWithRobotWire(entry: Record<string, unknown>) {
      const wire = decodeRawWire(encodeSessionPayload(makePayload({ robotOverrides: { 'robot-1': { rhythmicDensity: 42 } } }))) as Record<string, unknown>;
      return decodeSessionPayload(encodeWire({ ...wire, r: { 'robot-1': entry } }));
    }

    const STAGES = { at: 0.01, dc: 0.2, su: 0.7, rl: 0.3 };

    it('round-trips all five new values together, toEqual', () => {
      const payload = makePayload({
        robotOverrides: {
          'robot-1': {
            adsr: { attack: 0.01, decay: 0.2, sustain: 0.7, release: 0.3, attackCurve: 'bounce', releaseCurve: 'step' },
            portamento: 0.15,
            filterQ: 4.5,
            filterType: 'bandpass',
          },
        },
      });

      expect(decodeSessionPayload(encodeSessionPayload(payload))).toEqual(payload);
    });

    it('abbreviates them as po, fq and ft on the robot and ac and rc inside the envelope', () => {
      const payload = makePayload({
        robotOverrides: {
          'robot-1': {
            adsr: { attack: 0.01, decay: 0.2, sustain: 0.7, release: 0.3, attackCurve: 'sine', releaseCurve: 'ripple' },
            portamento: 0.15,
            filterQ: 4,
            filterType: 'highpass',
          },
        },
      });
      const wire = decodeRawWire(encodeSessionPayload(payload)) as { r: Record<string, Record<string, unknown>> };

      expect(wire.r['robot-1']).toEqual({ a: { ...STAGES, ac: 'sine', rc: 'ripple' }, po: 0.15, fq: 4, ft: 'highpass' });
    });

    it('leaves absent keys absent on the wire and after decoding', () => {
      const payload = makePayload({
        robotOverrides: { 'robot-1': { adsr: { attack: 0.01, decay: 0.2, sustain: 0.7, release: 0.3 }, rhythmicDensity: 42 } },
      });
      const wire = decodeRawWire(encodeSessionPayload(payload)) as { r: Record<string, Record<string, unknown>> };

      expect(wire.r['robot-1']).toEqual({ a: STAGES, rd: 42 });
      const decoded = decodeSessionPayload(encodeSessionPayload(payload));
      expect(decoded).toEqual(payload);
      expect(decoded?.robotOverrides['robot-1'].adsr).not.toHaveProperty('attackCurve');
      expect(decoded?.robotOverrides['robot-1'].adsr).not.toHaveProperty('releaseCurve');
      expect(decoded?.robotOverrides['robot-1']).not.toHaveProperty('portamento');
    });

    it('round-trips a portamento of exactly 0 (the seeded glide switched off must not be dropped as falsy)', () => {
      const payload = makePayload({ robotOverrides: { 'robot-1': { portamento: 0 } } });
      const wire = decodeRawWire(encodeSessionPayload(payload)) as { r: Record<string, Record<string, unknown>> };

      expect(wire.r['robot-1']).toEqual({ po: 0 });
      expect(decodeSessionPayload(encodeSessionPayload(payload))).toEqual(payload);
    });

    it('round-trips every curve name and every filter type', () => {
      for (const curve of ['linear', 'exponential', 'sine', 'cosine', 'bounce', 'ripple', 'step'] as const) {
        const payload = makePayload({
          robotOverrides: { 'robot-1': { adsr: { attack: 0.01, decay: 0.2, sustain: 0.7, release: 0.3, attackCurve: curve, releaseCurve: curve } } },
        });
        expect(decodeSessionPayload(encodeSessionPayload(payload))).toEqual(payload);
      }
      for (const filterType of ['lowpass', 'bandpass', 'highpass'] as const) {
        const payload = makePayload({ robotOverrides: { 'robot-1': { filterType } } });
        expect(decodeSessionPayload(encodeSessionPayload(payload))).toEqual(payload);
      }
    });

    it('carries one curve without the other', () => {
      const payload = makePayload({
        robotOverrides: { 'robot-1': { adsr: { attack: 0.01, decay: 0.2, sustain: 0.7, release: 0.3, releaseCurve: 'cosine' } } },
      });
      const wire = decodeRawWire(encodeSessionPayload(payload)) as { r: Record<string, { a: Record<string, unknown> }> };

      expect(wire.r['robot-1'].a).toEqual({ ...STAGES, rc: 'cosine' });
      expect(decodeSessionPayload(encodeSessionPayload(payload))).toEqual(payload);
    });

    it('drops an unlisted ft, keeping the rest of the entry', () => {
      for (const bad of ['notch', 'Lowpass', '', 3, null, true, {}]) {
        expect(decodeWithRobotWire({ rd: 42, ft: bad })?.robotOverrides['robot-1']).toEqual({ rhythmicDensity: 42 });
      }
    });

    it('drops a non-numeric po or fq, keeping the rest of the entry', () => {
      for (const bad of ['x', null, true, {}, []]) {
        expect(decodeWithRobotWire({ rd: 42, po: bad, fq: bad })?.robotOverrides['robot-1']).toEqual({ rhythmicDensity: 42 });
      }
    });

    it('drops an unlisted ac or rc and keeps the stages and the other curve', () => {
      for (const bad of [3, 'zigzag', 'Sine', null, true, {}]) {
        const decoded = decodeWithRobotWire({ a: { ...STAGES, ac: bad, rc: 'ripple' } });

        expect(decoded?.robotOverrides['robot-1']).toEqual({
          adsr: { attack: 0.01, decay: 0.2, sustain: 0.7, release: 0.3, releaseCurve: 'ripple' },
        });
        expect(decoded?.robotOverrides['robot-1'].adsr).not.toHaveProperty('attackCurve');
      }
      const both = decodeWithRobotWire({ a: { ...STAGES, ac: 3, rc: 'x' } });
      expect(both?.robotOverrides['robot-1'].adsr).toEqual({ attack: 0.01, decay: 0.2, sustain: 0.7, release: 0.3 });
    });

    it('decodes a pre-phase link (none of the new keys) to exactly the diff it always did', () => {
      const payload = makePayload({
        robotOverrides: {
          'robot-1': {
            adsr: { attack: 0.01, decay: 0.2, sustain: 0.7, release: 0.3 },
            filterFreq: 800,
            pan: 0.4,
            name: 'Held',
          },
        },
      });
      const prePhaseWire = {
        v: 1, n: 'Pelagos 7!', c: { x: -5, y: 777 }, g: {},
        r: { 'robot-1': { a: STAGES, f: 800, p: 0.4, nm: 'Held' } },
      };

      expect(decodeSessionPayload(encodeWire(prePhaseWire))).toEqual(payload);
    });
  });

  it('a v1 blob carrying legacy lf/gl wire keys (pre-LFO-Bank share links) decodes with them dropped and everything else intact', () => {
    const payload = makePayload({ robotOverrides: { 'robot-1': { rhythmicDensity: 42 } } });
    const wire = decodeRawWire(encodeSessionPayload(payload)) as Record<string, unknown>;
    const robotWire = (wire.r as Record<string, unknown>)['robot-1'] as object;
    const legacyWire = {
      ...wire,
      gl: { 'eq3.low': { shape: 'sine', rate: 1, depth: 10 } },
      r: { 'robot-1': { ...robotWire, lf: { 'layer0.gain': { shape: 'sine', rate: 1, depth: 10 } } } },
    };
    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(legacyWire))));

    expect(decodeSessionPayload(encoded)).toEqual(payload);
  });

  it('a 12-robot world with ~20 lfoLinks encodes at a recorded size (wire-compaction follow-up tracked in docs/tasks/LFO_BANK.md Task 20)', () => {
    const robotOverrides: SessionPayload['robotOverrides'] = {};
    for (let i = 0; i < 12; i++) {
      robotOverrides[`robot-${i}`] = {
        lfoLinks: {
          'layer0.gain': { lane: 'a', depth: 20 },
          'layer1.detune': { lane: 'b', depth: 35 },
        },
      };
    }
    const payload = makePayload({
      version: 2,
      // An empty g on purpose: this measures what the LFO links cost on the wire, which is the number
      // the bound below was recorded against. Encoding applies no defaults, so it stays comparable.
      globalAudio: {} as SessionPayload['globalAudio'],
      lfoBank: makeLfoBank(),
      globalLfoLinks: makeGlobalLfoLinks({ 'eq3.low': { lane: 'c', depth: 40 } }),
      robotOverrides,
    });

    const encodedLength = encodeSessionPayload(payload).length;

    // Measured 2026-10-01: 1844 chars for this fixture (12 robots x 2 links + the 4-lane bank +
    // 1 global link). Generous bound, not a tight regression gate -- the wire-compaction
    // follow-up (Task 20) tracks this number if it ever needs shrinking.
    expect(encodedLength).toBeLessThan(2200);
  });

  it('drops an unknown/removed target key from gll and ll on decode, instead of carrying it through untyped', () => {
    const payload = makePayload({
      version: 2,
      lfoBank: makeLfoBank(),
      globalLfoLinks: makeGlobalLfoLinks(),
      robotOverrides: { 'robot-1': { lfoLinks: { 'layer1.gain': { lane: 'a', depth: 30 } } } },
    });
    const wire = decodeRawWire(encodeSessionPayload(payload)) as Record<string, unknown>;
    const robotWire = (wire.r as Record<string, unknown>)['robot-1'] as { ll: Record<string, unknown> };
    const wireWithStaleKeys = {
      ...wire,
      gll: { ...(wire.gll as Record<string, unknown>), 'layer0.phase': { d: 10 } },
      r: { 'robot-1': { ...robotWire, ll: { ...robotWire.ll, 'layer0.phase': { d: 10 } } } },
    };
    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(wireWithStaleKeys))));

    const decoded = decodeSessionPayload(encoded);

    expect(decoded?.globalLfoLinks).not.toHaveProperty('layer0.phase');
    expect(decoded?.robotOverrides['robot-1']?.lfoLinks).not.toHaveProperty('layer0.phase');
    expect(decoded).toEqual(payload);
  });

  it('backfills a lane missing from lb with the default bank LFO on decode, instead of leaving it undefined', () => {
    const payload = makePayload({
      version: 2,
      lfoBank: makeLfoBank({ a: { shape: 'square', rate: 1.5, rateDrift: 0.25, depthDrift: -0.1 } }),
      globalLfoLinks: makeGlobalLfoLinks(),
    });
    const wire = decodeRawWire(encodeSessionPayload(payload)) as Record<string, unknown>;
    const lb = wire.lb as Record<string, unknown>;
    const { b: _b, c: _c, d: _d, ...trimmedLb } = lb; // simulate a hand-trimmed/corrupted share link
    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify({ ...wire, lb: trimmedLb }))));

    const decoded = decodeSessionPayload(encoded);

    expect(decoded?.lfoBank?.a).toEqual(payload.lfoBank!.a);
    expect(decoded?.lfoBank?.b).toEqual(DEFAULT_BANK_LFO);
    expect(decoded?.lfoBank?.c).toEqual(DEFAULT_BANK_LFO);
    expect(decoded?.lfoBank?.d).toEqual(DEFAULT_BANK_LFO);
  });

  it('backfills a target missing from gll with the default (unlinked) link on decode, instead of leaving it undefined', () => {
    const payload = makePayload({
      version: 2,
      lfoBank: makeLfoBank(),
      globalLfoLinks: makeGlobalLfoLinks({ 'eq3.low': { lane: 'c', depth: 42 } }),
    });
    const wire = decodeRawWire(encodeSessionPayload(payload)) as Record<string, unknown>;
    const gll = wire.gll as Record<string, unknown>;
    const { 'eq3.mid': _mid, ...trimmedGll } = gll; // simulate a hand-trimmed/corrupted share link
    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify({ ...wire, gll: trimmedGll }))));

    const decoded = decodeSessionPayload(encoded);

    expect(decoded?.globalLfoLinks?.['eq3.low']).toEqual({ lane: 'c', depth: 42 });
    expect(decoded?.globalLfoLinks?.['eq3.mid']).toEqual(DEFAULT_LFO_LINK['eq3.mid']);
  });

  it('drops an unknown lane key from lb on decode, instead of carrying it through untyped', () => {
    const payload = makePayload({ version: 2, lfoBank: makeLfoBank(), globalLfoLinks: makeGlobalLfoLinks() });
    const wire = decodeRawWire(encodeSessionPayload(payload)) as Record<string, unknown>;
    const wireWithStaleLane = { ...wire, lb: { ...(wire.lb as Record<string, unknown>), e: { s: 'sine', r: 1, rd: 0, dd: 0 } } };
    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(wireWithStaleLane))));

    const decoded = decodeSessionPayload(encoded);

    expect(decoded?.lfoBank).not.toHaveProperty('e');
    expect(decoded).toEqual(payload);
  });

  it('decodeSessionPayload returns null when present-but-wrong-typed lb/gll would otherwise corrupt lfoBank/globalLfoLinks', () => {
    const validPayload = makePayload();
    const validWire = decodeRawWire(encodeSessionPayload(validPayload)) as Record<string, unknown>;

    const arrayLb = { ...validWire, lb: ['not', 'a', 'record'] };
    expect(decodeSessionPayload(btoa(unescape(encodeURIComponent(JSON.stringify(arrayLb)))))).toBeNull();

    const stringGll = { ...validWire, gll: 'not an object' };
    expect(decodeSessionPayload(btoa(unescape(encodeURIComponent(JSON.stringify(stringGll)))))).toBeNull();
  });

  it('a typical mostly-empty share is meaningfully smaller than the naive full-field encoding', () => {
    const payload = makePayload();
    const compactLength = encodeSessionPayload(payload).length;
    const naiveLength = btoa(unescape(encodeURIComponent(JSON.stringify(payload)))).length;
    expect(compactLength).toBeLessThan(naiveLength);
  });

  it('abbreviates robotOverrides/companyDiffs field names on the wire too -- not just the top level (12 robots multiplies these)', () => {
    const payload = makePayload({
      robotOverrides: {
        'robot-1': {
          adsr: { attack: 0.01, decay: 0.2, sustain: 0.7, release: 0.3 },
          layers: [{ type: 'sine', gain: 1, detune: 0, phase: 0, pulseWidth: 0.5 }],
          filterFreq: 800,
          rhythmicDensity: 42,
          rhythmicMotifLength: { active: true, value: 4 },
          noteVariance: { active: false, value: 0 },
          pitchRepeat: 50,
          octaveRange: [3, 5],
          name: 'Renamed Bot',
        },
      },
      companyDiffs: { 'company-1': { name: 'Renamed Co', robotIds: ['robot-1'] } },
    });
    const wire = decodeRawWire(encodeSessionPayload(payload)) as { r: Record<string, Record<string, unknown>>; d: Record<string, Record<string, unknown>> };

    const robotWire = wire.r['robot-1'];
    expect(Object.keys(robotWire).sort()).toEqual(['a', 'f', 'l', 'nm', 'nv', 'or', 'pr', 'rd', 'rm']);
    expect(robotWire).not.toHaveProperty('adsr');
    expect(robotWire).not.toHaveProperty('rhythmicDensity');
    expect(Object.keys(robotWire.a as object).sort()).toEqual(['at', 'dc', 'rl', 'su']);
    expect(Object.keys((robotWire.l as unknown[])[0] as object).sort()).toEqual(['dt', 'g', 'ph', 'pw', 't']);
    expect(Object.keys(robotWire.rm as object).sort()).toEqual(['a', 'v']);

    const companyWire = wire.d['company-1'];
    expect(Object.keys(companyWire).sort()).toEqual(['n', 'r']);

    expect(decodeSessionPayload(encodeSessionPayload(payload))).toEqual(payload);
  });

  it('omits optional nested fields (e.g. a layer with no pulseWidth) from the wire, and still round-trips', () => {
    const payload = makePayload({
      robotOverrides: {
        'robot-1': { layers: [{ type: 'square', gain: 0.8, detune: 5, phase: 0 }] },
      },
    });
    const wire = decodeRawWire(encodeSessionPayload(payload)) as { r: Record<string, { l: [Record<string, unknown>] }> };
    expect(wire.r['robot-1'].l[0]).not.toHaveProperty('pw');
    expect(decodeSessionPayload(encodeSessionPayload(payload))).toEqual(payload);
  });

  it('decodeSessionPayload returns null (never throws) for invalid base64', () => {
    expect(decodeSessionPayload('not-valid-base64!!!')).toBeNull();
  });

  it('decodeSessionPayload returns null for valid base64 that is not JSON', () => {
    expect(decodeSessionPayload(btoa('this is not json'))).toBeNull();
  });

  it('decodeSessionPayload returns null for well-formed JSON that is not a SessionPayload shape', () => {
    expect(decodeSessionPayload(btoa(JSON.stringify({})))).toBeNull();
    expect(decodeSessionPayload(btoa(JSON.stringify([])))).toBeNull();
    expect(decodeSessionPayload(btoa(JSON.stringify('a string')))).toBeNull();
    expect(decodeSessionPayload(btoa(JSON.stringify(null)))).toBeNull();
    expect(decodeSessionPayload(btoa(JSON.stringify({ attenuationStyleName: 'x' })))).toBeNull(); // missing coordinates
  });

  it('decodeSessionPayload returns null when g (globalAudio) is missing or the wrong type -- the specific field that would otherwise crash applyGlobalAudioToEngine with no guard', () => {
    const validPayload = makePayload();
    const validWire = decodeRawWire(encodeSessionPayload(validPayload)) as Record<string, unknown>;

    const missingG = { ...validWire };
    delete missingG.g;
    expect(decodeSessionPayload(btoa(unescape(encodeURIComponent(JSON.stringify(missingG)))))).toBeNull();

    const wrongTypeG = { ...validWire, g: 'not an object' };
    expect(decodeSessionPayload(btoa(unescape(encodeURIComponent(JSON.stringify(wrongTypeG)))))).toBeNull();

    const nullG = { ...validWire, g: null };
    expect(decodeSessionPayload(btoa(unescape(encodeURIComponent(JSON.stringify(nullG)))))).toBeNull();
  });

  it('decodeSessionPayload returns null when c.x/c.y are missing or not numbers', () => {
    const validPayload = makePayload();
    const validWire = decodeRawWire(encodeSessionPayload(validPayload)) as Record<string, unknown>;

    const emptyCoords = { ...validWire, c: {} };
    expect(decodeSessionPayload(btoa(unescape(encodeURIComponent(JSON.stringify(emptyCoords)))))).toBeNull();

    const stringCoords = { ...validWire, c: { x: '1', y: '2' } };
    expect(decodeSessionPayload(btoa(unescape(encodeURIComponent(JSON.stringify(stringCoords)))))).toBeNull();

    const nonObjectCoords = { ...validWire, c: 'not an object' };
    expect(decodeSessionPayload(btoa(unescape(encodeURIComponent(JSON.stringify(nonObjectCoords)))))).toBeNull();
  });

  it('decodeSessionPayload returns null when present-but-wrong-typed r/d/u would otherwise corrupt robotOverrides/companyDiffs/userCreatedCompanies', () => {
    const validPayload = makePayload();
    const validWire = decodeRawWire(encodeSessionPayload(validPayload)) as Record<string, unknown>;

    const arrayR = { ...validWire, r: ['not', 'a', 'record'] };
    expect(decodeSessionPayload(btoa(unescape(encodeURIComponent(JSON.stringify(arrayR)))))).toBeNull();

    const stringD = { ...validWire, d: 'not an object' };
    expect(decodeSessionPayload(btoa(unescape(encodeURIComponent(JSON.stringify(stringD)))))).toBeNull();

    const objectU = { ...validWire, u: { not: 'an array' } };
    expect(decodeSessionPayload(btoa(unescape(encodeURIComponent(JSON.stringify(objectU)))))).toBeNull();
  });

  it('decodeSessionPayload returns null when present-but-wrong-typed b/sf/sd/pv would otherwise corrupt bpm/swellFrequency/swellDuration/pingVarianceAutomation', () => {
    const validPayload = makePayload();
    const validWire = decodeRawWire(encodeSessionPayload(validPayload)) as Record<string, unknown>;

    const stringB = { ...validWire, b: 'not a number' };
    expect(decodeSessionPayload(btoa(unescape(encodeURIComponent(JSON.stringify(stringB)))))).toBeNull();

    const stringSf = { ...validWire, sf: 'not a number' };
    expect(decodeSessionPayload(btoa(unescape(encodeURIComponent(JSON.stringify(stringSf)))))).toBeNull();

    const stringSd = { ...validWire, sd: 'not a number' };
    expect(decodeSessionPayload(btoa(unescape(encodeURIComponent(JSON.stringify(stringSd)))))).toBeNull();

    const stringPv = { ...validWire, pv: 'not a number' };
    expect(decodeSessionPayload(btoa(unescape(encodeURIComponent(JSON.stringify(stringPv)))))).toBeNull();
  });
});

// ========================================
// SYNC CODEC — docs/specs/FREE_SYNC_TOGGLE.md §1.8, docs/tasks/FREE_SYNC_TOGGLE.md Task 14
// ========================================

describe('lane `sync` on the wire (the `y` code)', () => {
  const FREE_LANE: BankLfoSettings = { shape: 'sine', rate: 2, rateDrift: 0.1, depthDrift: -0.2 };
  const nv = (division: NoteValue['division'], modifier: NoteValue['modifier'] = 'straight'): NoteValue => ({ division, modifier });

  /** A wire blob built by hand, re-encoded the way the app encodes it. */
  function encodeRawWire(wire: unknown): string {
    return btoa(unescape(encodeURIComponent(JSON.stringify(wire))));
  }

  /** A v2 payload whose lane `a` is the given lane; the other lanes are Free. */
  function payloadWithLaneA(lane: BankLfoSettings): SessionPayload {
    return makePayload({ version: 2, lfoBank: makeLfoBank({ a: lane }), globalLfoLinks: makeGlobalLfoLinks() });
  }

  /** The wire of `payloadWithLaneA(FREE_LANE)` with lane `a`'s `y` forced to `y`, decoded. */
  function decodeLaneAWithRawY(y: unknown): BankLfoSettings | undefined {
    const wire = decodeRawWire(encodeSessionPayload(payloadWithLaneA(FREE_LANE))) as { lb: Record<string, Record<string, unknown>> };
    wire.lb.a.y = y;
    return decodeSessionPayload(encodeRawWire(wire))?.lfoBank?.a;
  }

  it.each(NOTE_VALUES.map((v) => [`${v.division} ${v.modifier}`, v] as const))(
    'round-trips %s through `y`',
    (_label, sync) => {
      const payload = payloadWithLaneA({ ...FREE_LANE, sync });
      const decoded = decodeSessionPayload(encodeSessionPayload(payload));
      expect(decoded).toEqual(payload);
      expect(decoded?.lfoBank?.a.sync).toEqual(sync);
    },
  );

  it('writes the compact code: division token (32 16 8 4 2 1b 2b 4b) plus a modifier suffix (none / d / t)', () => {
    const expected: Array<[NoteValue, string]> = [
      [nv('1/32'), '32'], [nv('1/16'), '16'], [nv('1/8'), '8'], [nv('1/4'), '4'], [nv('1/2'), '2'],
      [nv('1'), '1b'], [nv('2'), '2b'], [nv('4'), '4b'],
      [nv('1/8', 'dotted'), '8d'], [nv('1/16', 'triplet'), '16t'], [nv('1/32', 'triplet'), '32t'],
      [nv('1', 'dotted'), '1bd'], [nv('1/2', 'triplet'), '2t'],
    ];
    for (const [sync, code] of expected) {
      const wire = decodeRawWire(encodeSessionPayload(payloadWithLaneA({ ...FREE_LANE, sync }))) as { lb: Record<string, { y?: string }> };
      expect(wire.lb.a.y, `${sync.division} ${sync.modifier}`).toBe(code);
    }
  });

  it('gives all 20 note values a distinct code', () => {
    const codes = new Set(
      NOTE_VALUES.map((sync) => {
        const wire = decodeRawWire(encodeSessionPayload(payloadWithLaneA({ ...FREE_LANE, sync }))) as { lb: Record<string, { y?: string }> };
        return wire.lb.a.y;
      }),
    );
    expect(codes.size).toBe(NOTE_VALUES.length);
    expect(codes.has(undefined)).toBe(false);
  });

  it('a Free lane adds no `y` to the wire — its entry is byte-for-byte the pre-Sync {s,r,rd,dd}', () => {
    const wire = decodeRawWire(encodeSessionPayload(payloadWithLaneA(FREE_LANE))) as { lb: Record<string, Record<string, unknown>> };
    for (const lane of LFO_LANE_IDS) expect(Object.keys(wire.lb[lane]).sort(), lane).toEqual(['dd', 'r', 'rd', 's']);
  });

  it('a synced lane adds exactly one key, `y`, and still carries its Free rate underneath', () => {
    const payload = payloadWithLaneA({ ...FREE_LANE, rate: 3.5, sync: nv('1/8', 'dotted') });
    const wire = decodeRawWire(encodeSessionPayload(payload)) as { lb: Record<string, Record<string, unknown>> };
    expect(Object.keys(wire.lb.a).sort()).toEqual(['dd', 'r', 'rd', 's', 'y']);
    expect(wire.lb.a.r).toBe(3.5);
    expect(decodeSessionPayload(encodeSessionPayload(payload))?.lfoBank?.a.rate).toBe(3.5);
  });

  it('a mixed Free / Sync bank round-trips toEqual, with each lane\'s own note', () => {
    const payload = makePayload({
      version: 2,
      lfoBank: makeLfoBank({
        a: { ...FREE_LANE, sync: nv('1/8', 'dotted') },
        c: { ...FREE_LANE, shape: 'square', rate: 6, sync: nv('4') },
      }),
      globalLfoLinks: makeGlobalLfoLinks(),
    });
    const decoded = decodeSessionPayload(encodeSessionPayload(payload));
    expect(decoded).toEqual(payload);
    expect('sync' in decoded!.lfoBank!.b).toBe(false);
    expect('sync' in decoded!.lfoBank!.d).toBe(false);
  });

  it('a Free lane decodes with no `sync` key at all — not `sync: undefined`', () => {
    const decoded = decodeSessionPayload(encodeSessionPayload(payloadWithLaneA(FREE_LANE)));
    expect(decoded?.lfoBank?.a).toStrictEqual(FREE_LANE);
  });

  it('an absent `y` decodes to a lane with no `sync` key (a pre-Sync share link)', () => {
    expect(decodeLaneAWithRawY(undefined)).toStrictEqual(FREE_LANE);
  });

  it.each<[string, unknown]>([
    ['an empty string', ''],
    ['an unknown division', '3'],
    ['letters', 'x'],
    ['a typo\'d division', '4x'],
    ['a doubled modifier', '8dd'],
    ['a modifier the division does not offer: 2 bars dotted', '2bd'],
    ['a modifier the division does not offer: 4 bars triplet', '4bt'],
    ['an uppercase modifier', '8D'],
    ['surrounding whitespace', ' 4'],
    ['trailing whitespace', '4 '],
    ['a slash form of the division', '1/4'],
    ['an inherited-property name', 'constructor'],
    ['__proto__', '__proto__'],
    ['a number', 4],
    ['null', null],
    ['a boolean', true],
    ['an object', { division: '1/4', modifier: 'straight' }],
    ['an array', ['4']],
  ])('garbage `y` (%s) decodes to a Free lane — no `sync` key — without throwing', (_label, y) => {
    expect(() => decodeLaneAWithRawY(y)).not.toThrow();
    expect(decodeLaneAWithRawY(y)).toStrictEqual(FREE_LANE);
  });

  it('garbage `y` on one lane leaves every other lane and the rest of the payload intact', () => {
    const payload = makePayload({
      version: 2,
      lfoBank: makeLfoBank({ b: { ...FREE_LANE, sync: nv('1/4') } }),
      globalLfoLinks: makeGlobalLfoLinks(),
    });
    const wire = decodeRawWire(encodeSessionPayload(payload)) as { lb: Record<string, Record<string, unknown>> };
    wire.lb.a.y = 'garbage';
    const decoded = decodeSessionPayload(encodeRawWire(wire));
    expect(decoded?.lfoBank?.a).toStrictEqual(FREE_LANE);
    expect(decoded?.lfoBank?.b.sync).toEqual(nv('1/4'));
    expect(decoded?.coordinates).toEqual(payload.coordinates);
  });

  it('an in-memory lane carrying a bogus `sync` is written as Free — the encoder never emits a code it cannot vouch for', () => {
    const bogus = { ...FREE_LANE, sync: { division: '1/3', modifier: 'straight' } } as unknown as BankLfoSettings;
    const wire = decodeRawWire(encodeSessionPayload(payloadWithLaneA(bogus))) as { lb: Record<string, Record<string, unknown>> };
    expect(wire.lb.a).not.toHaveProperty('y');
    expect(decodeSessionPayload(encodeSessionPayload(payloadWithLaneA(bogus)))?.lfoBank?.a).toStrictEqual(FREE_LANE);
  });
});

describe('Delay `sync` travels inside `g` whole', () => {
  const delay = { delayTime: 0.3, feedback: 0.2, wet: 0.1 };

  it('round-trips a synced Delay with its note, needing no codec of its own', () => {
    const sync: NoteValue = { division: '1/8', modifier: 'dotted' };
    const payload = makePayload({ version: 2, globalAudio: { ...structuredClone(DEFAULT_GLOBAL_AUDIO_SETTINGS), delay: { ...delay, sync } } });
    const decoded = decodeSessionPayload(encodeSessionPayload(payload));
    expect(decoded).toEqual(payload);
    expect((decoded!.globalAudio as unknown as { delay: { sync: NoteValue } }).delay.sync).toEqual(sync);
  });

  it('a Free Delay stays Free — no `sync` key appears on the round trip', () => {
    const payload = makePayload({ version: 2, globalAudio: { delay } as unknown as SessionPayload['globalAudio'] });
    const decoded = decodeSessionPayload(encodeSessionPayload(payload));
    expect('sync' in (decoded!.globalAudio as unknown as { delay: object }).delay).toBe(false);
  });
});

describe('getSessionSharePayload (boot-time ?session= URL param)', () => {
  afterEach(() => {
    window.history.replaceState({}, '', '/');
    vi.resetModules();
  });

  async function loadFreshWithQuery(query: string) {
    window.history.replaceState({}, '', `/${query}`);
    vi.resetModules();
    return import('./sessionShareUtils');
  }

  it('reflects a valid ?session= param present at module import time', async () => {
    const payload = makePayload();
    // encodeSessionPayload is pure/stateless, safe to use from the top-level import even
    // though getSessionSharePayload is read from a freshly re-imported module instance below.
    const fresh = await loadFreshWithQuery(`?session=${encodeSessionPayload(payload)}`);
    expect(fresh.getSessionSharePayload()).toEqual(payload);
  });

  it('returns null when ?session= is absent', async () => {
    const fresh = await loadFreshWithQuery('');
    expect(fresh.getSessionSharePayload()).toBeNull();
  });

  it('returns null when ?session= is present but malformed', async () => {
    const fresh = await loadFreshWithQuery('?session=not-valid-base64!!!');
    expect(fresh.getSessionSharePayload()).toBeNull();
  });

  it('getSessionSharePayload keeps returning the same value on every call -- unaffected by consumeSessionSharePayload', async () => {
    const payload = makePayload();
    const fresh = await loadFreshWithQuery(`?session=${encodeSessionPayload(payload)}`);
    fresh.consumeSessionSharePayload();
    expect(fresh.getSessionSharePayload()).toEqual(payload);
    expect(fresh.getSessionSharePayload()).toEqual(payload);
  });
});

describe('consumeSessionSharePayload (one-time-per-page-load consumption)', () => {
  afterEach(() => {
    window.history.replaceState({}, '', '/');
    vi.resetModules();
  });

  async function loadFreshWithQuery(query: string) {
    window.history.replaceState({}, '', `/${query}`);
    vi.resetModules();
    return import('./sessionShareUtils');
  }

  it('returns the payload on the first call', async () => {
    const payload = makePayload();
    const fresh = await loadFreshWithQuery(`?session=${encodeSessionPayload(payload)}`);
    expect(fresh.consumeSessionSharePayload()).toEqual(payload);
  });

  it('returns null on every call after the first -- the power-cycle regression guard', async () => {
    const payload = makePayload();
    const fresh = await loadFreshWithQuery(`?session=${encodeSessionPayload(payload)}`);
    fresh.consumeSessionSharePayload();
    expect(fresh.consumeSessionSharePayload()).toBeNull();
    expect(fresh.consumeSessionSharePayload()).toBeNull();
  });

  it('returns null on the first call too when no share payload was present', async () => {
    const fresh = await loadFreshWithQuery('');
    expect(fresh.consumeSessionSharePayload()).toBeNull();
  });
});

describe('buildShareUrl', () => {
  afterEach(() => {
    window.history.replaceState({}, '', '/');
  });

  it('builds origin + pathname + exactly one ?session= param', () => {
    window.history.replaceState({}, '', '/some/path');
    const payload = makePayload();
    const url = buildShareUrl(payload);
    const expected = new URL(`${window.location.origin}/some/path`);
    expected.searchParams.set('session', encodeSessionPayload(payload));
    expect(url).toBe(expected.toString());
  });

  it('drops any other query params currently in the address bar', () => {
    window.history.replaceState({}, '', '/?debug&seed=x');
    const payload = makePayload();
    const url = buildShareUrl(payload);
    const parsed = new URL(url);
    expect(Array.from(parsed.searchParams.keys())).toEqual(['session']);
  });
});

describe('copySessionLink', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.replaceState({}, '', '/');
  });

  it('writes buildShareUrl\'s exact output to the clipboard and resolves true on success', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const payload = makePayload();

    const result = await copySessionLink(payload);

    expect(writeText).toHaveBeenCalledWith(buildShareUrl(payload));
    expect(result).toBe(true);
  });

  it('resolves false (never throws/rejects) when the clipboard write fails', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('permission denied'));
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    const result = await copySessionLink(makePayload());

    expect(result).toBe(false);
  });
});

// ----------------------------------------
// GLOBAL COLOUR DEFAULTS ON DECODE (docs/specs/GLOBAL_COLOUR.md assumption 11; docs/tasks/GLOBAL_COLOUR.md Task 10)
// ----------------------------------------
// Nothing new is encoded: globalAudio already travels whole in `g`. The only change is on the way in -- a
// link written before the colour blocks existed decodes with them at the defaults (dry). The fixture is
// the Audio Palette series' recorded 50.2 baseline link (docs/todo/scratchy-audio-phones.md), whose `g`
// carries exactly the eight pre-colour keys.

const PRE_COLOUR_BASELINE_LINK = 'eyJ2IjoyLCJuIjoiYWxwaGEiLCJjIjp7IngiOjAsInkiOjUwfSwiZyI6eyJjb21wcmVzc29yQmVmb3JlRGVsYXkiOmZhbHNlLCJyZXZlcmIiOnsiZGVjYXkiOjEuNSwicHJlRGVsYXkiOjAuMDIsIndldCI6MC4zfSwiZGVsYXkiOnsiZGVsYXlUaW1lIjowLjI1LCJmZWVkYmFjayI6MC4yLCJ3ZXQiOjAuMTV9LCJjb21wcmVzc29yIjp7InRocmVzaG9sZCI6LTI0LCJyYXRpbyI6MiwiYXR0YWNrIjowLjAwMywicmVsZWFzZSI6MC4yNSwia25lZSI6Nn0sImVxMyI6eyJsb3ciOjAsIm1pZCI6MCwiaGlnaCI6MH0sImZpbHRlckxQRiI6eyJ0eXBlIjoibG93cGFzcyIsImZyZXF1ZW5jeSI6MjAwMDAsIlEiOjF9LCJmaWx0ZXJIUEYiOnsidHlwZSI6ImhpZ2hwYXNzIiwiZnJlcXVlbmN5IjoyMCwiUSI6MX0sImxpbWl0ZXIiOnsidGhyZXNob2xkIjotMTJ9fX0=';
const COLOUR_KEYS = ['distortion', 'chebyshev', 'bitCrusher'] as const;
const LOUD_COLOUR = {
  distortion: { amount: 0.77, wet: 0.41 },
  chebyshev: { order: 5, wet: 0.22 },
  bitCrusher: { bits: 3, wet: 0.6 },
};

/** Encodes an arbitrary raw wire object the way encodeSessionPayload does, to build hand-edited links. */
function encodeRaw(wire: unknown): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(wire))));
}

describe('colour defaults on decode (Global Colour T10)', () => {
  it('the recorded 50.2 baseline link really lacks the three colour keys (the fixture proves what it claims)', () => {
    const wire = decodeRawWire(PRE_COLOUR_BASELINE_LINK) as { g: Record<string, unknown> };
    for (const key of COLOUR_KEYS) expect(key in wire.g, key).toBe(false);
  });

  it('decodes the old baseline link with the three blocks at the defaults, dry, and its eight saved keys untouched', () => {
    const decoded = decodeSessionPayload(PRE_COLOUR_BASELINE_LINK)!;
    expect(decoded).not.toBeNull();
    const wire = decodeRawWire(PRE_COLOUR_BASELINE_LINK) as { g: Record<string, unknown> };
    for (const key of COLOUR_KEYS) expect(decoded.globalAudio[key], key).toEqual(DEFAULT_GLOBAL_AUDIO_SETTINGS[key]);
    expect([decoded.globalAudio.distortion.wet, decoded.globalAudio.chebyshev.wet, decoded.globalAudio.bitCrusher.wet]).toEqual([0, 0, 0]);
    for (const [key, value] of Object.entries(wire.g)) {
      expect(decoded.globalAudio[key as keyof typeof decoded.globalAudio], key).toEqual(value);
    }
  });

  it('a payload that carries non-default colour blocks round-trips through encode and decode exactly', () => {
    const payload = makePayload({ version: 2, globalAudio: { ...DEFAULT_GLOBAL_AUDIO_SETTINGS, ...LOUD_COLOUR } });
    const encoded = encodeSessionPayload(payload);
    expect(decodeSessionPayload(encoded)).toEqual(payload);
    const wire = decodeRawWire(encoded) as { g: Record<string, unknown> };
    for (const key of COLOUR_KEYS) expect(wire.g[key], key).toEqual(LOUD_COLOUR[key]);
  });

  it('a link with only some colour blocks keeps those byte for byte and defaults the rest', () => {
    const { distortion: _d, chebyshev: _c, ...rest } = DEFAULT_GLOBAL_AUDIO_SETTINGS;
    const link = encodeRaw({ v: 2, n: 'alpha', c: { x: 0, y: 0 }, g: { ...rest, bitCrusher: LOUD_COLOUR.bitCrusher } });
    const decoded = decodeSessionPayload(link)!;
    expect(decoded.globalAudio.bitCrusher).toEqual(LOUD_COLOUR.bitCrusher);
    expect(decoded.globalAudio.distortion).toEqual(DEFAULT_GLOBAL_AUDIO_SETTINGS.distortion);
    expect(decoded.globalAudio.chebyshev).toEqual(DEFAULT_GLOBAL_AUDIO_SETTINGS.chebyshev);
  });

  it('a present block is kept whole, never deep-merged: a bitCrusher with only a wet stays without bits (the existing whole-block convention)', () => {
    const link = encodeRaw({ v: 2, n: 'alpha', c: { x: 0, y: 0 }, g: { ...DEFAULT_GLOBAL_AUDIO_SETTINGS, bitCrusher: { wet: 0.5 } } });
    expect(decodeSessionPayload(link)!.globalAudio.bitCrusher).toEqual({ wet: 0.5 });
  });

  it('a null colour block is a missing one and takes the default', () => {
    const link = encodeRaw({ v: 2, n: 'alpha', c: { x: 0, y: 0 }, g: { ...DEFAULT_GLOBAL_AUDIO_SETTINGS, chebyshev: null } });
    expect(decodeSessionPayload(link)!.globalAudio.chebyshev).toEqual(DEFAULT_GLOBAL_AUDIO_SETTINGS.chebyshev);
  });

  it('an empty g decodes to a full set of defaults rather than an empty object (the payload is never left partial)', () => {
    const link = encodeRaw({ v: 2, n: 'alpha', c: { x: 0, y: 0 }, g: {} });
    expect(decodeSessionPayload(link)!.globalAudio).toEqual(DEFAULT_GLOBAL_AUDIO_SETTINGS);
  });

  it('an unknown key in g is dropped, not carried into the store', () => {
    const link = encodeRaw({ v: 2, n: 'alpha', c: { x: 0, y: 0 }, g: { ...DEFAULT_GLOBAL_AUDIO_SETTINGS, ringMod: { wet: 1 } } });
    expect('ringMod' in decodeSessionPayload(link)!.globalAudio).toBe(false);
  });

  it('the decoded defaults are copies: editing one decode never changes the shared defaults or the next decode', () => {
    const first = decodeSessionPayload(PRE_COLOUR_BASELINE_LINK)!;
    first.globalAudio.bitCrusher.wet = 0.9;
    expect(DEFAULT_GLOBAL_AUDIO_SETTINGS.bitCrusher.wet).toBe(0);
    expect(decodeSessionPayload(PRE_COLOUR_BASELINE_LINK)!.globalAudio.bitCrusher.wet).toBe(0);
  });
});

// ----------------------------------------
// GLOBAL MODULATION PEDALS ON THE WIRE (docs/specs/GLOBAL_MODULATION_COLOUR.md; docs/tasks/GLOBAL_MODULATION_COLOUR.md Task 12)
// ----------------------------------------
// Nothing new is encoded: the AutoWah and Phaser travel inside `g` whole, the Phaser's `sync` with them (the
// Delay's convention, above). The only change is on the way in: a link written before the pedals existed
// decodes with both at the defaults (dry). The fixture is the same recorded 50.2 baseline link, which
// predates the colour blocks and so the pedals too.

const PEDAL_KEYS = ['autoWah', 'phaser'] as const;
const LIT_PEDALS = {
  autoWah: { baseFrequency: 220, octaves: 3, sensitivity: -20, Q: 5, gain: 9, follower: 0.4, wet: 0.5 },
  phaser: { rate: 0.8, octaves: 4, baseFrequency: 420, stages: 7, Q: 6, wet: 0.3 },
};

describe('pedal defaults and Phaser sync on the wire (Global Modulation T12)', () => {
  it('the recorded 50.2 baseline link really lacks both pedal keys (the fixture proves what it claims)', () => {
    const wire = decodeRawWire(PRE_COLOUR_BASELINE_LINK) as { g: Record<string, unknown> };
    for (const key of PEDAL_KEYS) expect(key in wire.g, key).toBe(false);
  });

  it('decodes the old baseline link with both pedals at the defaults, dry, with no sync, and its saved keys untouched', () => {
    const decoded = decodeSessionPayload(PRE_COLOUR_BASELINE_LINK)!;
    expect(decoded).not.toBeNull();
    const wire = decodeRawWire(PRE_COLOUR_BASELINE_LINK) as { g: Record<string, unknown> };
    for (const key of PEDAL_KEYS) expect(decoded.globalAudio[key], key).toEqual(DEFAULT_GLOBAL_AUDIO_SETTINGS[key]);
    expect([decoded.globalAudio.autoWah.wet, decoded.globalAudio.phaser.wet]).toEqual([0, 0]);
    expect('sync' in decoded.globalAudio.phaser).toBe(false);
    for (const [key, value] of Object.entries(wire.g)) {
      expect(decoded.globalAudio[key as keyof typeof decoded.globalAudio], key).toEqual(value);
    }
  });

  it('a link written with a synced Phaser decodes with the same sync, whole, and the pedals ride in g with no codec of their own', () => {
    const sync: NoteValue = { division: '1/4', modifier: 'dotted' };
    const payload = makePayload({ version: 2, globalAudio: { ...DEFAULT_GLOBAL_AUDIO_SETTINGS, autoWah: LIT_PEDALS.autoWah, phaser: { ...LIT_PEDALS.phaser, sync } } });
    const encoded = encodeSessionPayload(payload);
    expect(decodeSessionPayload(encoded)).toEqual(payload);
    const wire = decodeRawWire(encoded) as { g: Record<string, unknown> };
    expect(wire.g.phaser).toEqual({ ...LIT_PEDALS.phaser, sync });
    expect(wire.g.autoWah).toEqual(LIT_PEDALS.autoWah);
    expect(Object.keys(wire.g).sort()).toEqual(Object.keys(payload.globalAudio).sort());
  });

  it('a Free Phaser stays Free on the wire and after the round trip: no `sync` key appears', () => {
    const payload = makePayload({ version: 2, globalAudio: { ...DEFAULT_GLOBAL_AUDIO_SETTINGS, phaser: LIT_PEDALS.phaser } });
    const encoded = encodeSessionPayload(payload);
    expect('sync' in (decodeRawWire(encoded) as { g: { phaser: object } }).g.phaser).toBe(false);
    expect('sync' in decodeSessionPayload(encoded)!.globalAudio.phaser).toBe(false);
  });

  it('a link with only the Phaser keeps it byte for byte and defaults the AutoWah (and the reverse)', () => {
    const { autoWah: _w, ...withoutWah } = DEFAULT_GLOBAL_AUDIO_SETTINGS;
    const onlyPhaser = decodeSessionPayload(encodeRaw({ v: 2, n: 'alpha', c: { x: 0, y: 0 }, g: { ...withoutWah, phaser: LIT_PEDALS.phaser } }))!;
    expect(onlyPhaser.globalAudio.phaser).toEqual(LIT_PEDALS.phaser);
    expect(onlyPhaser.globalAudio.autoWah).toEqual(DEFAULT_GLOBAL_AUDIO_SETTINGS.autoWah);

    const { phaser: _p, ...withoutPhaser } = DEFAULT_GLOBAL_AUDIO_SETTINGS;
    const onlyWah = decodeSessionPayload(encodeRaw({ v: 2, n: 'alpha', c: { x: 0, y: 0 }, g: { ...withoutPhaser, autoWah: LIT_PEDALS.autoWah } }))!;
    expect(onlyWah.globalAudio.autoWah).toEqual(LIT_PEDALS.autoWah);
    expect(onlyWah.globalAudio.phaser).toEqual(DEFAULT_GLOBAL_AUDIO_SETTINGS.phaser);
  });

  it('a null pedal block is a missing one and takes the default', () => {
    const link = encodeRaw({ v: 2, n: 'alpha', c: { x: 0, y: 0 }, g: { ...DEFAULT_GLOBAL_AUDIO_SETTINGS, phaser: null, autoWah: null } });
    const decoded = decodeSessionPayload(link)!;
    expect(decoded.globalAudio.phaser).toEqual(DEFAULT_GLOBAL_AUDIO_SETTINGS.phaser);
    expect(decoded.globalAudio.autoWah).toEqual(DEFAULT_GLOBAL_AUDIO_SETTINGS.autoWah);
  });

  it('the decoded pedal defaults are copies: editing one decode never changes the shared defaults or the next decode', () => {
    const first = decodeSessionPayload(PRE_COLOUR_BASELINE_LINK)!;
    first.globalAudio.phaser.wet = 0.9;
    first.globalAudio.autoWah.wet = 0.9;
    expect(DEFAULT_GLOBAL_AUDIO_SETTINGS.phaser.wet).toBe(0);
    expect(DEFAULT_GLOBAL_AUDIO_SETTINGS.autoWah.wet).toBe(0);
    const second = decodeSessionPayload(PRE_COLOUR_BASELINE_LINK)!;
    expect([second.globalAudio.phaser.wet, second.globalAudio.autoWah.wet]).toEqual([0, 0]);
  });
});
