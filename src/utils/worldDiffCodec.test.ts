// ========================================
// IMPORTS
// ========================================
import { describe, it, expect } from 'vitest';
import type { SessionPayload } from '../types/session';
import type { LfoLaneId, GlobalLfoTargetId, LfoLink, BankLfoSettings } from '../types/lfo';
import { LFO_LANE_IDS, GLOBAL_LFO_TARGET_IDS } from '../types/lfo';
import { NOTE_VALUES, type NoteValue } from '../data/noteValues';
import { DEFAULT_GLOBAL_AUDIO_SETTINGS } from '../types/globalAudio';
import { toCompactWorldDiff, fromCompactWorldDiff, isValidCompactWorldDiff } from './worldDiffCodec';
import { fillWorldFromSeed, generateWorldSeedBaseline, type WorldDiff } from './seedBaseline';

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

function makeLfoBank(overrides: Partial<Record<LfoLaneId, BankLfoSettings>> = {}): Record<LfoLaneId, BankLfoSettings> {
  const base: BankLfoSettings = { shape: 'sine', rate: 2, rateDrift: 0.1, depthDrift: -0.2 };
  return Object.fromEntries(LFO_LANE_IDS.map((lane) => [lane, overrides[lane] ?? { ...base }])) as Record<LfoLaneId, BankLfoSettings>;
}

function makeGlobalLfoLinks(overrides: Partial<Record<GlobalLfoTargetId, LfoLink>> = {}): Record<GlobalLfoTargetId, LfoLink> {
  return Object.fromEntries(GLOBAL_LFO_TARGET_IDS.map((t) => [t, overrides[t] ?? { lane: null, depth: 0 }])) as Record<GlobalLfoTargetId, LfoLink>;
}

/** A WorldDiff carrying only the given fields: the identity and version are not the blob's to carry (spec assumption 3). */
function makeDiff(fields: Partial<SessionPayload> = {}): WorldDiff {
  const { version: _v, attenuationStyleName: _n, coordinates: _c, ...diff } = fields;
  return diff;
}

/** A hand-built wire object as it arrives off a link: through JSON, so a NaN is a null and nothing is shared. */
function asWire(wire: unknown): unknown {
  return JSON.parse(JSON.stringify(wire));
}

/** The JSON a diff is written as, read back the way the decoder sees it. */
function wireOf(diff: WorldDiff): unknown {
  return asWire(toCompactWorldDiff(diff));
}

/** A diff through the wire and back. */
function roundTrip(diff: WorldDiff): WorldDiff | null {
  return fromCompactWorldDiff(wireOf(diff));
}

// ========================================
// TESTS
// ========================================

// ========================================
// COMPACT WORLD DIFF — per-robot fields (ported from the ?session= codec; docs/tasks/SHORT_WORLD_LINK.md Task 4)
// ========================================

describe('CompactWorldDiff codec (toCompactWorldDiff / fromCompactWorldDiff)', () => {
  const REVERB = { decay: 4.2, preDelay: 0.05, wet: 0.8 };
  const LANE_B: BankLfoSettings = { shape: 'triangle', rate: 3.5, rateDrift: 0.5, depthDrift: -0.75, sync: { division: '1/8', modifier: 'dotted' } };

  /** One robot carrying every per-field code the codec has. */
  const EVERY_FIELD_ROBOT: NonNullable<WorldDiff['robotOverrides']>[string] = {
    adsr: { attack: 0.01, decay: 0.2, sustain: 0.7, release: 0.3, attackCurve: 'bounce', releaseCurve: 'step' },
    layers: [{ type: 'square', gain: 0.8, detune: 5, phase: 0, pulseWidth: 0.4 }],
    filterFreq: 800,
    portamento: 0,
    filterQ: 4.5,
    filterType: 'bandpass',
    rhythmicDensity: 42,
    rhythmicMotifLength: { active: true, value: 4 },
    noteVariance: { active: false, value: 0 },
    pitchRepeat: 50,
    pan: -0.6,
    reverbSend: 0,
    delaySend: 1,
    gritSend: 0.45,
    shimmerSend: 0.15,
    doubleSend: 0.05,
    dynamics: 70,
    rests: 0,
    accents: 100,
    octaveRange: [3, 5],
    name: 'Ärger & Co — 7',
    lfoLinks: { 'layer1.gain': { lane: 'a', depth: 30 }, 'layer2.detune': { lane: null, depth: 0 } },
  };

  const DIFF: WorldDiff = {
    globalAudio: { reverb: REVERB },
    lfoBank: { b: LANE_B },
    globalLfoLinks: { 'eq3.low': { lane: 'c', depth: 42 } },
    bpm: 77,
    robotOverrides: { 'robot-1': EVERY_FIELD_ROBOT },
    companyDiffs: { 'company-1': { name: 'Night Shift', robotIds: ['robot-1', 'robot-4'] } },
  };

  it('round-trips a diff with one block, one synced lane, one target, bpm, a robot with every code and a company diff', () => {
    expect(roundTrip(DIFF)).toEqual(DIFF);
  });

  it('writes every robot field under its abbreviated code', () => {
    const wire = wireOf(DIFF) as { r: Record<string, Record<string, unknown>>; d: Record<string, Record<string, unknown>> };
    expect(Object.keys(wire.r['robot-1']).sort()).toEqual(
      ['a', 'l', 'f', 'po', 'fq', 'ft', 'rd', 'rm', 'nv', 'pr', 'p', 'rs', 'ds', 'gr', 'sm', 'db', 'dy', 'rt', 'ax', 'or', 'nm', 'll'].sort(),
    );
    expect(Object.keys(wire.d['company-1']).sort()).toEqual(['n', 'r']);
  });

  it('writes g, lb and gll only for the blocks, lanes and targets the diff carries, never a whole record', () => {
    const wire = wireOf(DIFF) as Record<string, Record<string, unknown>>;
    expect(Object.keys(wire).sort()).toEqual(['b', 'd', 'g', 'gll', 'lb', 'r']);
    expect(Object.keys(wire.g)).toEqual(['reverb']);
    expect(wire.g.reverb).toEqual(REVERB);
    expect(Object.keys(wire.lb)).toEqual(['b']);
    expect(wire.lb.b).toEqual({ s: 'triangle', r: 3.5, rd: 0.5, dd: -0.75, y: '8d' });
    expect(Object.keys(wire.gll)).toEqual(['eq3.low']);
    expect(wire.gll['eq3.low']).toEqual({ l: 'c', d: 42 });
  });

  it('an empty diff is {}, and so is a diff whose parts are all empty', () => {
    expect(toCompactWorldDiff({})).toEqual({});
    expect(
      toCompactWorldDiff({ globalAudio: {}, lfoBank: {}, globalLfoLinks: {}, robotOverrides: {}, companyDiffs: {}, userCreatedCompanies: [] }),
    ).toEqual({});
    expect(fromCompactWorldDiff({})).toEqual({});
  });

  it('carries the five pacing scalars as b / sf / sd / hm / pv, 0 included', () => {
    const scalars: WorldDiff = { bpm: 0, swellFrequency: 9, swellDuration: 5, humanize: 0, pingVarianceAutomation: 0.42 };
    expect(wireOf(scalars)).toEqual({ b: 0, sf: 9, sd: 5, hm: 0, pv: 0.42 });
    expect(roundTrip(scalars)).toEqual(scalars);
  });

  it('round-trips user-created companies whole, multi-byte names included', () => {
    const diff: WorldDiff = { userCreatedCompanies: [{ id: 'c1', name: 'Ü Robotics 日本語', color: '#123456', robotIds: ['robot-2'] }] };
    expect(wireOf(diff)).toEqual({ u: diff.userCreatedCompanies });
    expect(roundTrip(diff)).toEqual(diff);
  });

  it.each<[string, unknown]>([
    ['a string', 'a string'],
    ['a number', 5],
    ['null', null],
    ['undefined', undefined],
    ['an array', []],
    ['g a number', { g: 5 }],
    ['g an array', { g: [] }],
    ['g null', { g: null }],
    ['lb an array', { lb: ['not', 'a', 'record'] }],
    ['gll a string', { gll: 'not an object' }],
    ['r an array', { r: ['not', 'a', 'record'] }],
    ['d a string', { d: 'not an object' }],
    ['u an object', { u: { not: 'an array' } }],
    ['b a string', { b: 'not a number' }],
    ['sf a string', { sf: '9' }],
    ['sd a string', { sd: 'x' }],
    ['hm a string', { hm: 'x' }],
    ['pv a boolean', { pv: true }],
  ])('returns null for %s (the shape check)', (_label, parsed) => {
    expect(isValidCompactWorldDiff(parsed)).toBe(false);
    expect(fromCompactWorldDiff(parsed)).toBeNull();
  });

  it('the shape check passes an empty object and one with every key of the right kind', () => {
    expect(isValidCompactWorldDiff({})).toBe(true);
    expect(isValidCompactWorldDiff(wireOf({ ...DIFF, swellFrequency: 1, swellDuration: 2, humanize: 3, pingVarianceAutomation: 0.4, userCreatedCompanies: [] }))).toBe(true);
  });

  it('drops an unknown gll target and keeps the known one; an unknown robot ll target goes the same way', () => {
    const decoded = fromCompactWorldDiff(
      asWire({
        gll: { 'eq3.low': { l: 'c', d: 42 }, 'layer0.phase': { d: 10 } },
        r: { 'robot-1': { ll: { 'layer1.gain': { l: 'a', d: 30 }, 'layer0.phase': { d: 10 } } } },
      }),
    )!;
    expect(decoded.globalLfoLinks).toEqual({ 'eq3.low': { lane: 'c', depth: 42 } });
    expect(decoded.robotOverrides).toEqual({ 'robot-1': { lfoLinks: { 'layer1.gain': { lane: 'a', depth: 30 } } } });
  });

  it('drops an unknown lane and fills nothing in: a blob with lane a alone decodes with lane a alone', () => {
    const decoded = fromCompactWorldDiff(
      asWire({ lb: { a: { s: 'square', r: 1.5, rd: 0.25, dd: -0.1 }, e: { s: 'sine', r: 1, rd: 0, dd: 0 } } }),
    )!;
    expect(decoded.lfoBank).toEqual({ a: { shape: 'square', rate: 1.5, rateDrift: 0.25, depthDrift: -0.1 } });
  });

  it('leaves a lane Free for a bogus y, keeping its Free rate', () => {
    const decoded = fromCompactWorldDiff(asWire({ lb: { b: { s: 'sine', r: 2, rd: 0.1, dd: -0.2, y: '3x' } } }))!;
    expect(decoded.lfoBank!.b).toStrictEqual({ shape: 'sine', rate: 2, rateDrift: 0.1, depthDrift: -0.2 });
  });

  it('drops an entry that is not an object (a lane, a link, a robot, a company) and keeps its good siblings', () => {
    const decoded = fromCompactWorldDiff(
      asWire({
        lb: { a: 5, b: { s: 'sine', r: 2, rd: 0, dd: 0 } },
        gll: { 'eq3.low': null, 'eq3.mid': { l: 'a', d: 12 } },
        r: { 'robot-1': null, 'robot-2': [], 'robot-3': { p: 0.1 } },
        d: { 'company-1': 'x', 'company-2': { n: 'Co' } },
      }),
    )!;
    expect(decoded).toEqual({
      lfoBank: { b: { shape: 'sine', rate: 2, rateDrift: 0, depthDrift: 0 } },
      globalLfoLinks: { 'eq3.mid': { lane: 'a', depth: 12 } },
      robotOverrides: { 'robot-3': { pan: 0.1 } },
      companyDiffs: { 'company-2': { name: 'Co' } },
    });
  });

  it('a part whose every entry is dropped writes no key at all', () => {
    expect(fromCompactWorldDiff(asWire({ lb: { e: {} }, gll: { nope: { d: 1 } }, r: { x: null }, d: { y: 3 }, u: [] }))).toEqual({});
  });

  it('a __proto__ key in g or r pollutes nothing: the g key is not a block, the robot id is just an id', () => {
    const parsed = JSON.parse('{"g":{"__proto__":{"wet":1}},"r":{"__proto__":{"p":0.5}}}') as unknown;
    const decoded = fromCompactWorldDiff(parsed)!;
    expect(decoded.globalAudio).toBeUndefined();
    expect(Object.keys(decoded.robotOverrides!)).toEqual(['__proto__']);
    expect(({} as Record<string, unknown>).wet).toBeUndefined();
    expect(({} as Record<string, unknown>).p).toBeUndefined();
  });
});

describe('CompactWorldDiff: the per-robot fields', () => {
  describe('a manual pan on the wire (the `p` code, Robot Pan T12)', () => {
    /** A real encoded payload whose single robot entry has been replaced with `entry`. */
    function decodeWithRobotWire(entry: Record<string, unknown>) {
      const wire = wireOf(makeDiff({ robotOverrides: { 'robot-1': { rhythmicDensity: 42 } } })) as Record<string, unknown>;
      return fromCompactWorldDiff(asWire({ ...wire, r: { 'robot-1': entry } }));
    }

    it('encodes pan as `p` and decodes it back to the original payload', () => {
      const payload = makeDiff({ robotOverrides: { 'robot-1': { pan: 0.4 } } });
      const wire = wireOf(payload) as { r: Record<string, Record<string, unknown>> };

      expect(wire.r['robot-1']).toEqual({ p: 0.4 });
      expect(roundTrip(payload)).toEqual(payload);
    });

    it('round-trips a pan of exactly 0 (Auto off at the centre must not be dropped as falsy)', () => {
      const payload = makeDiff({ robotOverrides: { 'robot-1': { pan: 0 } } });
      const wire = wireOf(payload) as { r: Record<string, Record<string, unknown>> };

      expect(wire.r['robot-1']).toEqual({ p: 0 });
      expect(roundTrip(payload)).toEqual(payload);
    });

    it('round-trips the negative range and both ends', () => {
      for (const pan of [-1, -0.25, 1]) {
        const payload = makeDiff({ robotOverrides: { 'robot-1': { pan } } });
        expect(roundTrip(payload)).toEqual(payload);
      }
    });

    it('an entry with no `p` decodes with no pan key (absent means Auto)', () => {
      const decoded = decodeWithRobotWire({ rd: 42 });

      expect(decoded?.robotOverrides?.['robot-1']).toEqual({ rhythmicDensity: 42 });
      expect(decoded?.robotOverrides?.['robot-1']).not.toHaveProperty('pan');
    });

    it('drops a `p` that is a string, null (what JSON makes of NaN), out of range, or a boolean, keeping the rest of the entry', () => {
      for (const bad of ['x', null, 3, -1.5, 1.0001, true, {}]) {
        const decoded = decodeWithRobotWire({ rd: 42, p: bad });

        expect(decoded?.robotOverrides?.['robot-1']).toEqual({ rhythmicDensity: 42 });
      }
    });

    it('carries a pan next to the robot\'s other overrides', () => {
      const payload = makeDiff({ robotOverrides: { 'robot-1': { rhythmicDensity: 42, pan: -0.6, name: 'Held' } } });

      expect(roundTrip(payload)).toEqual(payload);
    });

    // The blob carries no version of its own: wire version 1 implies payload version 2 (spec assumption 3).
    it('a diff with one manual robot among others, a whole bank and the global links survives encode then decode, with no version key', () => {
      const payload = makeDiff({
        version: 2,
        lfoBank: makeLfoBank(),
        globalLfoLinks: makeGlobalLfoLinks(),
        robotOverrides: {
          'robot-1': { rhythmicDensity: 42 },
          'robot-2': { pan: 0.4 },
          'robot-3': { lfoLinks: { 'layer1.gain': { lane: 'a', depth: 30 } } },
        },
      });

      const decoded = roundTrip(payload);

      expect(decoded).toEqual(payload);
      expect(decoded).not.toHaveProperty('version');
      expect(wireOf(payload)).not.toHaveProperty('v');
    });
  });

  describe('sends on the wire (the `rs` / `ds` codes, Robot Sends T16)', () => {
    /** A real encoded payload whose single robot entry has been replaced with `entry`. */
    function decodeWithRobotWire(entry: Record<string, unknown>) {
      const wire = wireOf(makeDiff({ robotOverrides: { 'robot-1': { rhythmicDensity: 42 } } })) as Record<string, unknown>;
      return fromCompactWorldDiff(asWire({ ...wire, r: { 'robot-1': entry } }));
    }

    it('abbreviates the two sends as rs and ds and decodes them back, toEqual', () => {
      const payload = makeDiff({ robotOverrides: { 'robot-1': { reverbSend: 0.35, delaySend: 0.6 } } });
      const wire = wireOf(payload) as { r: Record<string, Record<string, unknown>> };

      expect(wire.r['robot-1']).toEqual({ rs: 0.35, ds: 0.6 });
      expect(roundTrip(payload)).toEqual(payload);
    });

    it('round-trips a send of exactly 0 and of exactly 1 (a switched-off send must not be dropped as falsy)', () => {
      for (const send of [0, 1]) {
        const payload = makeDiff({ robotOverrides: { 'robot-1': { reverbSend: send, delaySend: send } } });
        const wire = wireOf(payload) as { r: Record<string, Record<string, unknown>> };

        expect(wire.r['robot-1']).toEqual({ rs: send, ds: send });
        expect(roundTrip(payload)).toEqual(payload);
      }
    });

    it('carries one send alone, leaving the other key absent on the wire and after decoding', () => {
      const reverbOnly = makeDiff({ robotOverrides: { 'robot-1': { reverbSend: 0.2 } } });
      const delayOnly = makeDiff({ robotOverrides: { 'robot-1': { delaySend: 0 } } });

      const reverbWire = wireOf(reverbOnly) as { r: Record<string, Record<string, unknown>> };
      const delayWire = wireOf(delayOnly) as { r: Record<string, Record<string, unknown>> };
      expect(reverbWire.r['robot-1']).toEqual({ rs: 0.2 });
      expect(delayWire.r['robot-1']).toEqual({ ds: 0 });

      const reverbDecoded = roundTrip(reverbOnly);
      const delayDecoded = roundTrip(delayOnly);
      expect(reverbDecoded).toEqual(reverbOnly);
      expect(reverbDecoded?.robotOverrides?.['robot-1']).not.toHaveProperty('delaySend');
      expect(delayDecoded).toEqual(delayOnly);
      expect(delayDecoded?.robotOverrides?.['robot-1']).not.toHaveProperty('reverbSend');
    });

    it('an entry with neither key decodes with neither send (absent means the seeded send)', () => {
      const decoded = decodeWithRobotWire({ rd: 42 });

      expect(decoded?.robotOverrides?.['robot-1']).toEqual({ rhythmicDensity: 42 });
      expect(decoded?.robotOverrides?.['robot-1']).not.toHaveProperty('reverbSend');
      expect(decoded?.robotOverrides?.['robot-1']).not.toHaveProperty('delaySend');
    });

    it('drops an rs or ds that is a string, null (what JSON makes of NaN), a boolean, an object or out of [0, 1], keeping the rest of the entry', () => {
      for (const bad of ['x', '0.5', null, true, {}, [], 3, -0.1, 1.0001]) {
        expect(decodeWithRobotWire({ rd: 42, rs: bad })?.robotOverrides?.['robot-1']).toEqual({ rhythmicDensity: 42 });
        expect(decodeWithRobotWire({ rd: 42, ds: bad })?.robotOverrides?.['robot-1']).toEqual({ rhythmicDensity: 42 });
      }
    });

    it('drops each send on its own: a good rs survives a bad ds and the reverse', () => {
      expect(decodeWithRobotWire({ rs: 0.4, ds: 'x' })?.robotOverrides?.['robot-1']).toEqual({ reverbSend: 0.4 });
      expect(decodeWithRobotWire({ rs: -0.1, ds: 0.7 })?.robotOverrides?.['robot-1']).toEqual({ delaySend: 0.7 });
    });

    it('carries the sends next to the robot\'s other overrides, a pan and the articulation keys', () => {
      const payload = makeDiff({
        robotOverrides: { 'robot-1': { rhythmicDensity: 42, pan: -0.6, portamento: 0.15, reverbSend: 0.25, delaySend: 0.5, name: 'Held' } },
      });

      expect(roundTrip(payload)).toEqual(payload);
    });

    it('an entry without rs / ds decodes to exactly the diff it always did', () => {
      const payload = makeDiff({
        version: 2,
        robotOverrides: { 'robot-1': { filterFreq: 800, pan: 0.4, name: 'Held' } },
      });
      const wire = wireOf(payload) as Record<string, unknown>;
      const olderWire = { ...wire, r: { 'robot-1': { f: 800, p: 0.4, nm: 'Held' } } };

      const decoded = fromCompactWorldDiff(asWire(olderWire));

      expect(decoded).toEqual(payload);
    });
  });

  // docs/tasks/ROBOT_EFFECT_SENDS.md Task 16: Grit, Shimmer and Double ride as gr / sm / db, exactly as rs / ds do.
  describe('the three effect sends on the wire (the `gr` / `sm` / `db` codes, Robot Effect Sends T16)', () => {
    function decodeWithRobotWire(entry: Record<string, unknown>) {
      const wire = wireOf(makeDiff({ robotOverrides: { 'robot-1': { rhythmicDensity: 42 } } })) as Record<string, unknown>;
      return fromCompactWorldDiff(asWire({ ...wire, r: { 'robot-1': entry } }));
    }

    const CODES = [
      { field: 'gritSend', code: 'gr' },
      { field: 'shimmerSend', code: 'sm' },
      { field: 'doubleSend', code: 'db' },
    ] as const;

    it('abbreviates all five sends and decodes them back, toEqual, each value on its own code', () => {
      const payload = makeDiff({
        robotOverrides: { 'robot-1': { reverbSend: 0.35, delaySend: 0.6, gritSend: 0.45, shimmerSend: 0.15, doubleSend: 0.05 } },
      });
      const wire = wireOf(payload) as { r: Record<string, Record<string, unknown>> };

      expect(wire.r['robot-1']).toEqual({ rs: 0.35, ds: 0.6, gr: 0.45, sm: 0.15, db: 0.05 });
      expect(roundTrip(payload)).toEqual(payload);
    });

    describe.each(CODES)('$field as $code', ({ field, code }) => {
      it('round-trips alone, 0 and 1 included, with every other send key absent on the wire and after decoding', () => {
        for (const send of [0, 0.3, 1]) {
          const payload = makeDiff({ robotOverrides: { 'robot-1': { [field]: send } } });
          const wire = wireOf(payload) as { r: Record<string, Record<string, unknown>> };
          expect(wire.r['robot-1']).toEqual({ [code]: send });

          const decoded = roundTrip(payload);
          expect(decoded).toEqual(payload);
          expect(Object.keys(decoded!.robotOverrides!['robot-1'])).toEqual([field]);
        }
      });

      it('an entry without the key decodes without the field', () => {
        expect(decodeWithRobotWire({ rd: 42 })?.robotOverrides?.['robot-1']).toEqual({ rhythmicDensity: 42 });
      });

      it('drops a value that is a string, null, a boolean, an object or out of [0, 1], keeping the rest of the entry', () => {
        for (const bad of ['x', '0.5', null, true, {}, [], 3, -0.1, 1.0001]) {
          expect(decodeWithRobotWire({ rd: 42, [code]: bad })?.robotOverrides?.['robot-1'], String(bad)).toEqual({ rhythmicDensity: 42 });
        }
      });

      it('a bad value costs no other send: a good rs survives it, and it survives a bad rs', () => {
        expect(decodeWithRobotWire({ rs: 0.4, [code]: 'x' })?.robotOverrides?.['robot-1']).toEqual({ reverbSend: 0.4 });
        expect(decodeWithRobotWire({ rs: -0.1, [code]: 0.7 })?.robotOverrides?.['robot-1']).toEqual({ [field]: 0.7 });
      });
    });

    // Spec assumption 13 (as amended, T17.2): no upgrade. An entry with none of the three codes decodes with every
    // value (the Chorus and shifter wets included) untouched; a stray Colour room block in `g` decodes without error and
    // is dropped, and an unknown `v` is ignored.
    it('a blob without the three sends decodes with nothing rewritten, and a stray colourRoom block is dropped', () => {
      const oldG = DEFAULT_GLOBAL_AUDIO_SETTINGS;
      const g = { ...oldG, chorus: { ...oldG.chorus, wet: 0.35 }, frequencyShifter: { ...oldG.frequencyShifter, wet: 0.2 } };
      const wire = wireOf(makeDiff({ robotOverrides: { 'robot-1': { reverbSend: 0.25 } } })) as Record<string, unknown>;
      const olderWire = { ...wire, v: 2, g: { ...g, colourRoom: { wet: 0.4 } }, r: { 'robot-1': { rs: 0.25 } } };

      const decoded = fromCompactWorldDiff(asWire(olderWire))!;

      expect(decoded).not.toHaveProperty('version');
      expect(decoded.robotOverrides!['robot-1']).toEqual({ reverbSend: 0.25 });
      expect('colourRoom' in decoded.globalAudio!).toBe(false);
      expect(decoded.globalAudio!.chorus!.wet).toBe(0.35);
      expect(decoded.globalAudio!.frequencyShifter!.wet).toBe(0.2);
      expect(Object.keys(decoded.globalAudio!)).toEqual(Object.keys(g));
      for (const [key, value] of Object.entries(g)) {
        expect(decoded.globalAudio![key as keyof typeof g], key).toEqual(value);
      }
    });
  });

  // docs/tasks/ROBOT_PERFORMANCE.md Task 16: the three robot fields ride as dy / rt / ax, Humanize as the top-level hm.
  describe('performance on the wire (dy / rt / ax per robot, hm at the top level, Robot Performance T16)', () => {
    /** A real encoded payload whose single robot entry has been replaced with `entry`. */
    function decodeWithRobotWire(entry: Record<string, unknown>) {
      const wire = wireOf(makeDiff({ robotOverrides: { 'robot-1': { rhythmicDensity: 42 } } })) as Record<string, unknown>;
      return fromCompactWorldDiff(asWire({ ...wire, r: { 'robot-1': entry } }));
    }

    it('a payload with all four fields round-trips toEqual, abbreviated as dy / rt / ax and hm on the wire', () => {
      const payload = makeDiff({ humanize: 12, robotOverrides: { 'robot-1': { dynamics: 70, rests: 30, accents: 60 } } });
      const wire = wireOf(payload) as { hm: unknown; r: Record<string, Record<string, unknown>> };

      expect(wire.hm).toBe(12);
      expect(wire.r['robot-1']).toEqual({ dy: 70, rt: 30, ax: 60 });
      expect(roundTrip(payload)).toEqual(payload);
    });

    it('round-trips a 0 and a 100 (a flattened robot must not be dropped as falsy)', () => {
      for (const value of [0, 100]) {
        const payload = makeDiff({ humanize: 0, robotOverrides: { 'robot-1': { dynamics: value, rests: value, accents: value } } });

        expect(roundTrip(payload)).toEqual(payload);
      }
    });

    it('absent keys stay absent: no hm on the wire or after decoding, and a robot entry carries only the field it has', () => {
      const restsOnly = makeDiff({ robotOverrides: { 'robot-1': { rests: 30 } } });
      const wire = wireOf(restsOnly) as Record<string, unknown> & { r: Record<string, Record<string, unknown>> };

      expect(wire).not.toHaveProperty('hm');
      expect(wire.r['robot-1']).toEqual({ rt: 30 });
      const decoded = roundTrip(restsOnly);
      expect(decoded).toEqual(restsOnly);
      // A WorldDiff never carries a key whose value is undefined: an absent pacing scalar has no key at all (it is
      // the seed's on the fill), and the per-robot keys are omitted the same way.
      expect(decoded).not.toHaveProperty('humanize');
      expect(decoded?.robotOverrides?.['robot-1']).not.toHaveProperty('dynamics');
      expect(decoded?.robotOverrides?.['robot-1']).not.toHaveProperty('accents');
    });

    it('hm: "x" fails the shape check the way sd: "x" does (fromCompactWorldDiff returns null)', () => {
      const wire = wireOf(makeDiff()) as Record<string, unknown>;

      expect(fromCompactWorldDiff(asWire({ ...wire, hm: 'x' }))).toBeNull();
      expect(fromCompactWorldDiff(asWire({ ...wire, hm: 12 }))?.humanize).toBe(12);
    });

    it('dy: NaN decodes to absent (JSON writes a NaN as null), and a dropped key costs nothing beside it', () => {
      const encoded = wireOf(makeDiff({ robotOverrides: { 'robot-1': { dynamics: NaN, rests: 30 } } }));

      expect(fromCompactWorldDiff(encoded)?.robotOverrides?.['robot-1']).toEqual({ rests: 30 });
    });

    it('drops a dy, rt or ax that is a string, null, a boolean, an object or non-finite, keeping the rest of the entry', () => {
      for (const bad of ['x', '30', null, true, {}, []]) {
        expect(decodeWithRobotWire({ rd: 42, dy: bad })?.robotOverrides?.['robot-1']).toEqual({ rhythmicDensity: 42 });
        expect(decodeWithRobotWire({ rd: 42, rt: bad })?.robotOverrides?.['robot-1']).toEqual({ rhythmicDensity: 42 });
        expect(decodeWithRobotWire({ rd: 42, ax: bad })?.robotOverrides?.['robot-1']).toEqual({ rhythmicDensity: 42 });
      }
    });

    it('drops each field on its own: a good dy survives a bad rt and ax', () => {
      expect(decodeWithRobotWire({ dy: 70, rt: 'x', ax: null })?.robotOverrides?.['robot-1']).toEqual({ dynamics: 70 });
    });
  });

  describe('articulation on the wire (po / fq / ft, and ac / rc inside the envelope, Robot Articulation T12)', () => {
    /** A real encoded payload whose single robot entry has been replaced with `entry`. */
    function decodeWithRobotWire(entry: Record<string, unknown>) {
      const wire = wireOf(makeDiff({ robotOverrides: { 'robot-1': { rhythmicDensity: 42 } } })) as Record<string, unknown>;
      return fromCompactWorldDiff(asWire({ ...wire, r: { 'robot-1': entry } }));
    }

    const STAGES = { at: 0.01, dc: 0.2, su: 0.7, rl: 0.3 };

    it('round-trips all five new values together, toEqual', () => {
      const payload = makeDiff({
        robotOverrides: {
          'robot-1': {
            adsr: { attack: 0.01, decay: 0.2, sustain: 0.7, release: 0.3, attackCurve: 'bounce', releaseCurve: 'step' },
            portamento: 0.15,
            filterQ: 4.5,
            filterType: 'bandpass',
          },
        },
      });

      expect(roundTrip(payload)).toEqual(payload);
    });

    it('abbreviates them as po, fq and ft on the robot and ac and rc inside the envelope', () => {
      const payload = makeDiff({
        robotOverrides: {
          'robot-1': {
            adsr: { attack: 0.01, decay: 0.2, sustain: 0.7, release: 0.3, attackCurve: 'sine', releaseCurve: 'ripple' },
            portamento: 0.15,
            filterQ: 4,
            filterType: 'highpass',
          },
        },
      });
      const wire = wireOf(payload) as { r: Record<string, Record<string, unknown>> };

      expect(wire.r['robot-1']).toEqual({ a: { ...STAGES, ac: 'sine', rc: 'ripple' }, po: 0.15, fq: 4, ft: 'highpass' });
    });

    it('leaves absent keys absent on the wire and after decoding', () => {
      const payload = makeDiff({
        robotOverrides: { 'robot-1': { adsr: { attack: 0.01, decay: 0.2, sustain: 0.7, release: 0.3 }, rhythmicDensity: 42 } },
      });
      const wire = wireOf(payload) as { r: Record<string, Record<string, unknown>> };

      expect(wire.r['robot-1']).toEqual({ a: STAGES, rd: 42 });
      const decoded = roundTrip(payload);
      expect(decoded).toEqual(payload);
      expect(decoded?.robotOverrides?.['robot-1'].adsr).not.toHaveProperty('attackCurve');
      expect(decoded?.robotOverrides?.['robot-1'].adsr).not.toHaveProperty('releaseCurve');
      expect(decoded?.robotOverrides?.['robot-1']).not.toHaveProperty('portamento');
    });

    it('round-trips a portamento of exactly 0 (the seeded glide switched off must not be dropped as falsy)', () => {
      const payload = makeDiff({ robotOverrides: { 'robot-1': { portamento: 0 } } });
      const wire = wireOf(payload) as { r: Record<string, Record<string, unknown>> };

      expect(wire.r['robot-1']).toEqual({ po: 0 });
      expect(roundTrip(payload)).toEqual(payload);
    });

    it('round-trips every curve name and every filter type', () => {
      for (const curve of ['linear', 'exponential', 'sine', 'cosine', 'bounce', 'ripple', 'step'] as const) {
        const payload = makeDiff({
          robotOverrides: { 'robot-1': { adsr: { attack: 0.01, decay: 0.2, sustain: 0.7, release: 0.3, attackCurve: curve, releaseCurve: curve } } },
        });
        expect(roundTrip(payload)).toEqual(payload);
      }
      for (const filterType of ['lowpass', 'bandpass', 'highpass'] as const) {
        const payload = makeDiff({ robotOverrides: { 'robot-1': { filterType } } });
        expect(roundTrip(payload)).toEqual(payload);
      }
    });

    it('carries one curve without the other', () => {
      const payload = makeDiff({
        robotOverrides: { 'robot-1': { adsr: { attack: 0.01, decay: 0.2, sustain: 0.7, release: 0.3, releaseCurve: 'cosine' } } },
      });
      const wire = wireOf(payload) as { r: Record<string, { a: Record<string, unknown> }> };

      expect(wire.r['robot-1'].a).toEqual({ ...STAGES, rc: 'cosine' });
      expect(roundTrip(payload)).toEqual(payload);
    });

    it('drops an unlisted ft, keeping the rest of the entry', () => {
      for (const bad of ['notch', 'Lowpass', '', 3, null, true, {}]) {
        expect(decodeWithRobotWire({ rd: 42, ft: bad })?.robotOverrides?.['robot-1']).toEqual({ rhythmicDensity: 42 });
      }
    });

    it('drops a non-numeric po or fq, keeping the rest of the entry', () => {
      for (const bad of ['x', null, true, {}, []]) {
        expect(decodeWithRobotWire({ rd: 42, po: bad, fq: bad })?.robotOverrides?.['robot-1']).toEqual({ rhythmicDensity: 42 });
      }
    });

    it('drops an unlisted ac or rc and keeps the stages and the other curve', () => {
      for (const bad of [3, 'zigzag', 'Sine', null, true, {}]) {
        const decoded = decodeWithRobotWire({ a: { ...STAGES, ac: bad, rc: 'ripple' } });

        expect(decoded?.robotOverrides?.['robot-1']).toEqual({
          adsr: { attack: 0.01, decay: 0.2, sustain: 0.7, release: 0.3, releaseCurve: 'ripple' },
        });
        expect(decoded?.robotOverrides?.['robot-1'].adsr).not.toHaveProperty('attackCurve');
      }
      const both = decodeWithRobotWire({ a: { ...STAGES, ac: 3, rc: 'x' } });
      expect(both?.robotOverrides?.['robot-1'].adsr).toEqual({ attack: 0.01, decay: 0.2, sustain: 0.7, release: 0.3 });
    });

    it('decodes a pre-phase entry (none of the new keys) to exactly the diff it always did, ignoring a stray v / n / c and an empty g', () => {
      const payload = makeDiff({
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

      expect(fromCompactWorldDiff(asWire(prePhaseWire))).toEqual(payload);
    });
  });
});

// ========================================
// SYNC CODEC — docs/specs/FREE_SYNC_TOGGLE.md §1.8, docs/tasks/FREE_SYNC_TOGGLE.md Task 14
// ========================================

describe('lane `sync` on the wire (the `y` code)', () => {
  const FREE_LANE: BankLfoSettings = { shape: 'sine', rate: 2, rateDrift: 0.1, depthDrift: -0.2 };
  const nv = (division: NoteValue['division'], modifier: NoteValue['modifier'] = 'straight'): NoteValue => ({ division, modifier });

  /** A diff carrying the whole bank, lane `a` the given lane and the other lanes Free. */
  function payloadWithLaneA(lane: BankLfoSettings): WorldDiff {
    return makeDiff({ version: 2, lfoBank: makeLfoBank({ a: lane }), globalLfoLinks: makeGlobalLfoLinks() });
  }

  /** The wire of `payloadWithLaneA(FREE_LANE)` with lane `a`'s `y` forced to `y`, decoded. */
  function decodeLaneAWithRawY(y: unknown): BankLfoSettings | undefined {
    const wire = wireOf(payloadWithLaneA(FREE_LANE)) as { lb: Record<string, Record<string, unknown>> };
    wire.lb.a.y = y;
    return fromCompactWorldDiff(asWire(wire))?.lfoBank?.a;
  }

  it.each(NOTE_VALUES.map((v) => [`${v.division} ${v.modifier}`, v] as const))(
    'round-trips %s through `y`',
    (_label, sync) => {
      const payload = payloadWithLaneA({ ...FREE_LANE, sync });
      const decoded = roundTrip(payload);
      expect(decoded).toEqual(payload);
      expect(decoded?.lfoBank?.a?.sync).toEqual(sync);
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
      const wire = wireOf(payloadWithLaneA({ ...FREE_LANE, sync })) as { lb: Record<string, { y?: string }> };
      expect(wire.lb.a.y, `${sync.division} ${sync.modifier}`).toBe(code);
    }
  });

  it('gives all 20 note values a distinct code', () => {
    const codes = new Set(
      NOTE_VALUES.map((sync) => {
        const wire = wireOf(payloadWithLaneA({ ...FREE_LANE, sync })) as { lb: Record<string, { y?: string }> };
        return wire.lb.a.y;
      }),
    );
    expect(codes.size).toBe(NOTE_VALUES.length);
    expect(codes.has(undefined)).toBe(false);
  });

  it('a Free lane adds no `y` to the wire — its entry is byte-for-byte the pre-Sync {s,r,rd,dd}', () => {
    const wire = wireOf(payloadWithLaneA(FREE_LANE)) as { lb: Record<string, Record<string, unknown>> };
    for (const lane of LFO_LANE_IDS) expect(Object.keys(wire.lb[lane]).sort(), lane).toEqual(['dd', 'r', 'rd', 's']);
  });

  it('a synced lane adds exactly one key, `y`, and still carries its Free rate underneath', () => {
    const payload = payloadWithLaneA({ ...FREE_LANE, rate: 3.5, sync: nv('1/8', 'dotted') });
    const wire = wireOf(payload) as { lb: Record<string, Record<string, unknown>> };
    expect(Object.keys(wire.lb.a).sort()).toEqual(['dd', 'r', 'rd', 's', 'y']);
    expect(wire.lb.a.r).toBe(3.5);
    expect(roundTrip(payload)?.lfoBank?.a?.rate).toBe(3.5);
  });

  it('a mixed Free / Sync bank round-trips toEqual, with each lane\'s own note', () => {
    const payload = makeDiff({
      version: 2,
      lfoBank: makeLfoBank({
        a: { ...FREE_LANE, sync: nv('1/8', 'dotted') },
        c: { ...FREE_LANE, shape: 'square', rate: 6, sync: nv('4') },
      }),
      globalLfoLinks: makeGlobalLfoLinks(),
    });
    const decoded = roundTrip(payload);
    expect(decoded).toEqual(payload);
    expect('sync' in decoded!.lfoBank!.b!).toBe(false);
    expect('sync' in decoded!.lfoBank!.d!).toBe(false);
  });

  it('a Free lane decodes with no `sync` key at all — not `sync: undefined`', () => {
    const decoded = roundTrip(payloadWithLaneA(FREE_LANE));
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

  it('garbage `y` on one lane leaves every other lane and the rest of the diff intact', () => {
    const payload = makeDiff({
      version: 2,
      lfoBank: makeLfoBank({ b: { ...FREE_LANE, sync: nv('1/4') } }),
      globalLfoLinks: makeGlobalLfoLinks(),
      bpm: 91,
      robotOverrides: { 'robot-1': { pan: -0.3 } },
    });
    const wire = wireOf(payload) as { lb: Record<string, Record<string, unknown>> };
    wire.lb.a.y = 'garbage';
    const decoded = fromCompactWorldDiff(asWire(wire));
    expect(decoded?.lfoBank?.a).toStrictEqual(FREE_LANE);
    expect(decoded?.lfoBank?.b?.sync).toEqual(nv('1/4'));
    expect(decoded?.bpm).toBe(91);
    expect(decoded?.robotOverrides).toEqual({ 'robot-1': { pan: -0.3 } });
    expect(decoded?.globalLfoLinks).toEqual(payload.globalLfoLinks);
  });

  it('an in-memory lane carrying a bogus `sync` is written as Free — the encoder never emits a code it cannot vouch for', () => {
    const bogus = { ...FREE_LANE, sync: { division: '1/3', modifier: 'straight' } } as unknown as BankLfoSettings;
    const wire = wireOf(payloadWithLaneA(bogus)) as { lb: Record<string, Record<string, unknown>> };
    expect(wire.lb.a).not.toHaveProperty('y');
    expect(roundTrip(payloadWithLaneA(bogus))?.lfoBank?.a).toStrictEqual(FREE_LANE);
  });
});

describe('Delay `sync` travels inside `g` whole', () => {
  const delay = { delayTime: 0.3, feedback: 0.2, wet: 0.1 };

  it('round-trips a synced Delay with its note, needing no codec of its own', () => {
    const sync: NoteValue = { division: '1/8', modifier: 'dotted' };
    const payload = makeDiff({ version: 2, globalAudio: { ...structuredClone(DEFAULT_GLOBAL_AUDIO_SETTINGS), delay: { ...delay, sync } } });
    const decoded = roundTrip(payload);
    expect(decoded).toEqual(payload);
    expect((decoded!.globalAudio as unknown as { delay: { sync: NoteValue } }).delay.sync).toEqual(sync);
  });

  it('a Free Delay stays Free — no `sync` key appears on the round trip', () => {
    const payload = makeDiff({ version: 2, globalAudio: { delay } as unknown as SessionPayload['globalAudio'] });
    const decoded = roundTrip(payload);
    expect(decoded).toEqual({ globalAudio: { delay } });
    expect('sync' in (decoded!.globalAudio as unknown as { delay: object }).delay).toBe(false);
  });

  it('a Free Delay carried over a seeded Sync one fills back Free: the block replaces the seed whole', () => {
    const baseline = generateWorldSeedBaseline('n40dh8p8');
    expect(baseline.globalAudio.delay.sync).toBeDefined();
    const filled = fillWorldFromSeed(
      { attenuationStyleName: 'n40dh8p8', coordinates: { x: 0, y: 0 } },
      roundTrip({ globalAudio: { delay } })!,
      baseline,
    );
    expect(filled.globalAudio.delay).toEqual(delay);
  });
});

// ----------------------------------------
// GLOBAL COLOUR BLOCKS IN `g` (docs/specs/GLOBAL_COLOUR.md assumption 11; ported to the world link, docs/specs/SHORT_WORLD_LINK.md assumption 4)
// ----------------------------------------
// The colour blocks travel inside `g` whole, with no codec of their own. On the world link `g` carries only the blocks
// that differ from the seed, so a block the blob does not carry -- absent, null, or not an object -- is simply not in
// the diff, and fillWorldFromSeed gives it the seed's (never DEFAULT_GLOBAL_AUDIO_SETTINGS). The fixture is the Audio
// Palette series' recorded 50.2 baseline link (docs/todo/scratchy-audio-phones.md): its `g` carries exactly the eight
// pre-colour keys, so it stands in for a blob that carries some blocks and not others.

const PRE_COLOUR_BASELINE_LINK = 'eyJ2IjoyLCJuIjoiYWxwaGEiLCJjIjp7IngiOjAsInkiOjUwfSwiZyI6eyJjb21wcmVzc29yQmVmb3JlRGVsYXkiOmZhbHNlLCJyZXZlcmIiOnsiZGVjYXkiOjEuNSwicHJlRGVsYXkiOjAuMDIsIndldCI6MC4zfSwiZGVsYXkiOnsiZGVsYXlUaW1lIjowLjI1LCJmZWVkYmFjayI6MC4yLCJ3ZXQiOjAuMTV9LCJjb21wcmVzc29yIjp7InRocmVzaG9sZCI6LTI0LCJyYXRpbyI6MiwiYXR0YWNrIjowLjAwMywicmVsZWFzZSI6MC4yNSwia25lZSI6Nn0sImVxMyI6eyJsb3ciOjAsIm1pZCI6MCwiaGlnaCI6MH0sImZpbHRlckxQRiI6eyJ0eXBlIjoibG93cGFzcyIsImZyZXF1ZW5jeSI6MjAwMDAsIlEiOjF9LCJmaWx0ZXJIUEYiOnsidHlwZSI6ImhpZ2hwYXNzIiwiZnJlcXVlbmN5IjoyMCwiUSI6MX0sImxpbWl0ZXIiOnsidGhyZXNob2xkIjotMTJ9fX0=';
const COLOUR_KEYS = ['distortion', 'chebyshev', 'bitCrusher'] as const;
const LOUD_COLOUR = {
  distortion: { amount: 0.77, wet: 0.41 },
  chebyshev: { order: 5, wet: 0.22 },
  bitCrusher: { bits: 3, wet: 0.6 },
};

/** The recorded 50.2 baseline link's `g`: the eight pre-colour blocks and nothing else. */
function preColourG(): Record<string, unknown> {
  return (decodeRawWire(PRE_COLOUR_BASELINE_LINK) as { g: Record<string, unknown> }).g;
}

/** A seed whose blocks the fills below fall back to; any name works, this one is the plan's fixture. */
const SEED_NAME = 'n40dh8p8';
const SEED = generateWorldSeedBaseline(SEED_NAME);

/** A diff filled to a whole payload over SEED. */
function fill(diff: WorldDiff | null): SessionPayload {
  return fillWorldFromSeed({ attenuationStyleName: SEED_NAME, coordinates: { x: 0, y: 0 } }, diff ?? {}, SEED);
}

describe('colour blocks in g (Global Colour T10, on the world link)', () => {
  it('the recorded 50.2 baseline link really lacks the three colour keys (the fixture proves what it claims)', () => {
    for (const key of COLOUR_KEYS) expect(key in preColourG(), key).toBe(false);
  });

  it('a g with the eight pre-colour blocks decodes to exactly those eight, untouched, and the fill takes the seed colour blocks', () => {
    const g = preColourG();
    const decoded = fromCompactWorldDiff(asWire({ g }))!;
    expect(Object.keys(decoded.globalAudio!).sort()).toEqual(Object.keys(g).sort());
    for (const [key, value] of Object.entries(g)) {
      expect(decoded.globalAudio![key as keyof typeof decoded.globalAudio], key).toEqual(value);
    }
    const filled = fill(decoded);
    for (const key of COLOUR_KEYS) expect(filled.globalAudio[key], key).toEqual(SEED.globalAudio[key]);
  });

  it('a diff that carries non-default colour blocks round-trips exactly, each block whole on the wire', () => {
    const payload = makeDiff({ version: 2, globalAudio: { ...DEFAULT_GLOBAL_AUDIO_SETTINGS, ...LOUD_COLOUR } });
    const encoded = wireOf(payload);
    expect(fromCompactWorldDiff(encoded)).toEqual(payload);
    const wire = encoded as { g: Record<string, unknown> };
    for (const key of COLOUR_KEYS) expect(wire.g[key], key).toEqual(LOUD_COLOUR[key]);
  });

  it('a g with only some colour blocks keeps those byte for byte; the others are not carried and fill from the seed', () => {
    const decoded = fromCompactWorldDiff(asWire({ g: { bitCrusher: LOUD_COLOUR.bitCrusher } }))!;
    expect(decoded.globalAudio).toEqual({ bitCrusher: LOUD_COLOUR.bitCrusher });
    const filled = fill(decoded);
    expect(filled.globalAudio.bitCrusher).toEqual(LOUD_COLOUR.bitCrusher);
    expect(filled.globalAudio.distortion).toEqual(SEED.globalAudio.distortion);
    expect(filled.globalAudio.chebyshev).toEqual(SEED.globalAudio.chebyshev);
  });

  it('a present block is kept whole, never deep-merged: a bitCrusher with only a wet stays without bits, on decode and on the fill', () => {
    const decoded = fromCompactWorldDiff(asWire({ g: { bitCrusher: { wet: 0.5 } } }))!;
    expect(decoded.globalAudio!.bitCrusher).toEqual({ wet: 0.5 });
    expect(fill(decoded).globalAudio.bitCrusher).toEqual({ wet: 0.5 });
  });

  it('a null colour block is not carried: it fills from the seed', () => {
    const decoded = fromCompactWorldDiff(asWire({ g: { ...LOUD_COLOUR, chebyshev: null } }))!;
    expect(Object.keys(decoded.globalAudio!).sort()).toEqual(['bitCrusher', 'distortion']);
    expect(fill(decoded).globalAudio.chebyshev).toEqual(SEED.globalAudio.chebyshev);
  });

  it('an empty g decodes to no globalAudio key at all, and the fill is the whole seed rig (never left partial)', () => {
    const decoded = fromCompactWorldDiff(asWire({ g: {} }))!;
    expect(decoded).toEqual({});
    expect(fill(decoded).globalAudio).toEqual(SEED.globalAudio);
  });

  it('an unknown key in g is dropped, not carried into the store', () => {
    const decoded = fromCompactWorldDiff(asWire({ g: { ringMod: { wet: 1 }, reverb: { decay: 3, preDelay: 0.01, wet: 1 } } }))!;
    expect(decoded.globalAudio).toEqual({ reverb: { decay: 3, preDelay: 0.01, wet: 1 } });
    expect('ringMod' in fill(decoded).globalAudio).toBe(false);
  });
});

// ----------------------------------------
// GLOBAL MODULATION PEDALS IN `g` (docs/specs/GLOBAL_MODULATION_COLOUR.md; ported to the world link)
// ----------------------------------------
// The AutoWah and Phaser travel inside `g` whole, the Phaser's `sync` with them (the Delay's convention, above). A
// pedal the blob does not carry fills from the seed.

const PEDAL_KEYS = ['autoWah', 'phaser'] as const;
const LIT_PEDALS = {
  autoWah: { baseFrequency: 220, octaves: 3, sensitivity: -20, Q: 5, gain: 9, follower: 0.4, wet: 0.5 },
  phaser: { rate: 0.8, octaves: 4, baseFrequency: 420, stages: 7, Q: 6, wet: 0.3 },
};

describe('pedals and Phaser sync in g (Global Modulation T12, on the world link)', () => {
  it('the recorded 50.2 baseline link really lacks both pedal keys (the fixture proves what it claims)', () => {
    for (const key of PEDAL_KEYS) expect(key in preColourG(), key).toBe(false);
  });

  it('a g without the pedals decodes with no pedal keys and its blocks untouched; the fill takes the seed pedals, sync included', () => {
    const g = preColourG();
    const decoded = fromCompactWorldDiff(asWire({ g }))!;
    for (const key of PEDAL_KEYS) expect(key in decoded.globalAudio!, key).toBe(false);
    for (const [key, value] of Object.entries(g)) {
      expect(decoded.globalAudio![key as keyof typeof decoded.globalAudio], key).toEqual(value);
    }
    const filled = fill(decoded);
    for (const key of PEDAL_KEYS) expect(filled.globalAudio[key], key).toEqual(SEED.globalAudio[key]);
  });

  it('a diff with a synced Phaser decodes with the same sync, whole, and the pedals ride in g with no codec of their own', () => {
    const sync: NoteValue = { division: '1/4', modifier: 'dotted' };
    const payload = makeDiff({ version: 2, globalAudio: { ...DEFAULT_GLOBAL_AUDIO_SETTINGS, autoWah: LIT_PEDALS.autoWah, phaser: { ...LIT_PEDALS.phaser, sync } } });
    const encoded = wireOf(payload);
    expect(fromCompactWorldDiff(encoded)).toEqual(payload);
    const wire = encoded as { g: Record<string, unknown> };
    expect(wire.g.phaser).toEqual({ ...LIT_PEDALS.phaser, sync });
    expect(wire.g.autoWah).toEqual(LIT_PEDALS.autoWah);
    expect(Object.keys(wire.g).sort()).toEqual(Object.keys(payload.globalAudio!).sort());
  });

  it('a Free Phaser stays Free on the wire and after the round trip: no `sync` key appears', () => {
    const payload = makeDiff({ version: 2, globalAudio: { ...DEFAULT_GLOBAL_AUDIO_SETTINGS, phaser: LIT_PEDALS.phaser } });
    const encoded = wireOf(payload);
    expect('sync' in (encoded as { g: { phaser: object } }).g.phaser).toBe(false);
    expect('sync' in fromCompactWorldDiff(encoded)!.globalAudio!.phaser!).toBe(false);
  });

  it('a g with only the Phaser keeps it byte for byte and the AutoWah fills from the seed (and the reverse)', () => {
    const onlyPhaser = fill(fromCompactWorldDiff(asWire({ g: { phaser: LIT_PEDALS.phaser } })));
    expect(onlyPhaser.globalAudio.phaser).toEqual(LIT_PEDALS.phaser);
    expect(onlyPhaser.globalAudio.autoWah).toEqual(SEED.globalAudio.autoWah);

    const onlyWah = fill(fromCompactWorldDiff(asWire({ g: { autoWah: LIT_PEDALS.autoWah } })));
    expect(onlyWah.globalAudio.autoWah).toEqual(LIT_PEDALS.autoWah);
    expect(onlyWah.globalAudio.phaser).toEqual(SEED.globalAudio.phaser);
  });

  it('a null pedal block is not carried: it fills from the seed', () => {
    const decoded = fromCompactWorldDiff(asWire({ g: { phaser: null, autoWah: null, reverb: { decay: 3, preDelay: 0.01, wet: 1 } } }))!;
    expect(Object.keys(decoded.globalAudio!)).toEqual(['reverb']);
    const filled = fill(decoded);
    expect(filled.globalAudio.phaser).toEqual(SEED.globalAudio.phaser);
    expect(filled.globalAudio.autoWah).toEqual(SEED.globalAudio.autoWah);
  });
});

// ----------------------------------------
// GLOBAL PEDALS IN `g` (docs/specs/GLOBAL_PEDALS.md; ported to the world link)
// ----------------------------------------
// The five blocks travel inside `g` whole, a synced Rate's `sync` with them. Two fixtures without them: the recorded
// 50.2 baseline's `g` (before the colour blocks too) and one with the full 50.4 set (AutoWah and a synced Phaser).

const NEW_PEDAL_KEYS = ['chorus', 'tremolo', 'vibrato', 'frequencyShifter', 'stereoWidener'] as const;
const LIT_NEW_PEDALS = {
  chorus: { rate: 2.2, delayTime: 4, depth: 0.6, spread: 90, feedback: 0.2, wet: 0.35, sync: { division: '1/4', modifier: 'dotted' } as NoteValue },
  tremolo: { rate: 6, depth: 0.4, spread: 120, wet: 0.25 },
  vibrato: { rate: 3.5, depth: 0.3, wet: 0.15 },
  frequencyShifter: { shift: -7, wet: 0.2 },
  stereoWidener: { width: 0.2 },
};

/** A `g` as the 50.4 build wrote it: every block it knew, a lit synced Phaser among them, none of the five. */
function pre506G(): Record<string, unknown> {
  const { chorus: _c, tremolo: _t, vibrato: _v, frequencyShifter: _f, stereoWidener: _w, ...old } = DEFAULT_GLOBAL_AUDIO_SETTINGS;
  const phaser = { rate: 0.8, octaves: 4, baseFrequency: 420, stages: 7, Q: 6, wet: 0.3, sync: { division: '1/2', modifier: 'straight' } };
  return asWire({ ...old, phaser }) as Record<string, unknown>;
}

describe('Global Pedals and synced Rates in g (Global Pedals T12, on the world link)', () => {
  it('both fixtures really lack the five keys (the fixtures prove what they claim)', () => {
    for (const g of [preColourG(), pre506G()]) {
      for (const key of NEW_PEDAL_KEYS) expect(key in g, key).toBe(false);
    }
  });

  it.each([
    ['the recorded 50.2 baseline g', preColourG()],
    ['a 50.4 g with a synced Phaser', pre506G()],
  ])('decodes %s with none of the five carried and its blocks untouched; the fill takes the seed five', (_label, g) => {
    const decoded = fromCompactWorldDiff(asWire({ g }))!;
    expect(decoded).not.toBeNull();
    for (const key of NEW_PEDAL_KEYS) expect(key in decoded.globalAudio!, key).toBe(false);
    for (const [key, value] of Object.entries(g)) {
      expect(decoded.globalAudio![key as keyof typeof decoded.globalAudio], key).toEqual(value);
    }
    const filled = fill(decoded);
    for (const key of NEW_PEDAL_KEYS) expect(filled.globalAudio[key], key).toEqual(SEED.globalAudio[key]);
  });

  it('a diff with a synced Chorus and Width 0.2 decodes exactly, the five riding in g with no codec of their own', () => {
    const payload = makeDiff({ version: 2, globalAudio: { ...DEFAULT_GLOBAL_AUDIO_SETTINGS, ...LIT_NEW_PEDALS } });
    const encoded = wireOf(payload);
    expect(fromCompactWorldDiff(encoded)).toEqual(payload);
    const wire = encoded as { g: Record<string, unknown> };
    for (const key of NEW_PEDAL_KEYS) expect(wire.g[key], key).toEqual(LIT_NEW_PEDALS[key]);
    expect(Object.keys(wire.g).sort()).toEqual(Object.keys(payload.globalAudio!).sort());
  });

  it('a Free Tremolo and Vibrato stay Free on the wire and after the round trip: no `sync` key appears', () => {
    const payload = makeDiff({ version: 2, globalAudio: { ...DEFAULT_GLOBAL_AUDIO_SETTINGS, ...LIT_NEW_PEDALS } });
    const encoded = wireOf(payload);
    const wire = encoded as { g: Record<string, object> };
    const decoded = fromCompactWorldDiff(encoded)!;
    for (const key of ['tremolo', 'vibrato'] as const) {
      expect('sync' in wire.g[key], key).toBe(false);
      expect('sync' in decoded.globalAudio![key]!, key).toBe(false);
    }
  });

  it('a null block is not carried: it fills from the seed', () => {
    const decoded = fromCompactWorldDiff(asWire({ g: { ...LIT_NEW_PEDALS, tremolo: null, stereoWidener: null } }))!;
    expect(Object.keys(decoded.globalAudio!).sort()).toEqual(['chorus', 'frequencyShifter', 'vibrato']);
    const filled = fill(decoded);
    expect(filled.globalAudio.tremolo).toEqual(SEED.globalAudio.tremolo);
    expect(filled.globalAudio.stereoWidener).toEqual(SEED.globalAudio.stereoWidener);
  });

  it('a block that is not an object is not carried: g.chorus: 1, phaser: "x", delay: true fill from the seed instead of throwing', () => {
    const decoded = fromCompactWorldDiff(asWire({ g: { chorus: 1, phaser: 'x', delay: true, vibrato: LIT_NEW_PEDALS.vibrato } }))!;
    expect(decoded.globalAudio).toEqual({ vibrato: LIT_NEW_PEDALS.vibrato });
    const filled = fill(decoded);
    expect(filled.globalAudio.chorus).toEqual(SEED.globalAudio.chorus);
    expect(filled.globalAudio.phaser).toEqual(SEED.globalAudio.phaser);
    expect(filled.globalAudio.delay).toEqual(SEED.globalAudio.delay);
  });

  it('compressorBeforeDelay of the wrong kind is not carried; a boolean of either value is', () => {
    expect(fromCompactWorldDiff(asWire({ g: { compressorBeforeDelay: 'yes' } }))).toEqual({});
    expect(fromCompactWorldDiff(asWire({ g: { compressorBeforeDelay: true } }))).toEqual({ globalAudio: { compressorBeforeDelay: true } });
    expect(fromCompactWorldDiff(asWire({ g: { compressorBeforeDelay: false } }))).toEqual({ globalAudio: { compressorBeforeDelay: false } });
  });
});
