import { describe, it, expect } from 'vitest';

import { resolveCompanyOptions, diffCompoundField, diffLayerField } from './companyOptions';
import type { Company } from '@/types/Company';
import type { Robot } from '@/types/Robot';
import type { OscillatorLayer } from '@/types/layeredAudio';

function makeRobot(overrides: Partial<Robot> = {}): Robot {
  return {
    id: 'r1',
    name: 'Test Robot',
    position: { x: 0, y: 0 },
    melody: [],
    audioAttributes: {
      adsr: { attack: 0.2, decay: 0.3, sustain: 0.8, release: 1.5 },
      filterFreq: 0,
      waveform: 'sine',
      layers: [{ type: 'sine', gain: 1, detune: 0, phase: 0 }],
    },
    octaveRange: [3, 5],
    masterVolume: 0.6,
    docking: 'active',
    batteryLevel: 100,
    rhythmicDensity: 42,
    rhythmicMotifLength: { active: true, value: 6 },
    noteVariance: { active: true, value: 2 },
    pitchRepeat: 65,
    audioMode: 'solo',
    ...overrides,
  } as Robot;
}

function makeCompany(overrides: Partial<Company> = {}): Company {
  return { id: 'c1', name: 'Iron Consortium', color: '#4f6d7a', robotIds: ['r1'], ...overrides };
}

describe('resolveCompanyOptions', () => {
  it('with no lastEditedOptions, every field equals the first member\'s current value', () => {
    const firstMember = makeRobot();
    const company = makeCompany();

    const resolved = resolveCompanyOptions(company.lastEditedOptions, firstMember);

    expect(resolved.audioMode).toBe('solo');
    expect(resolved.masterVolume).toBe(0.6);
    expect(resolved.rhythmicDensity).toBe(42);
    expect(resolved.rhythmicMotifLength).toEqual({ active: true, value: 6 });
    expect(resolved.noteVariance).toEqual({ active: true, value: 2 });
    expect(resolved.pitchRepeat).toBe(65);
    expect(resolved.octaveRange).toEqual([3, 5]);
    expect(resolved.adsr).toEqual({ attack: 0.2, decay: 0.3, sustain: 0.8, release: 1.5 });
    expect(resolved.layers).toEqual(firstMember.audioAttributes.layers);
    expect(resolved.clickTrackActive).toBe(false);
  });

  it('pan and panAuto resolve from the first member\'s own values when the snapshot has neither', () => {
    const firstMember = makeRobot({ pan: 0.2, panAuto: false });

    const resolved = resolveCompanyOptions(undefined, firstMember);

    expect(resolved.pan).toBe(0.2);
    expect(resolved.panAuto).toBe(false);
  });

  it('pan and panAuto fall back to 0 and true for a member that has neither field (an older robot)', () => {
    const resolved = resolveCompanyOptions(undefined, makeRobot());

    expect(resolved.pan).toBe(0);
    expect(resolved.panAuto).toBe(true);
  });

  it('a recorded panAuto: true wins over a manual first member, and a recorded pan wins over its pan', () => {
    const firstMember = makeRobot({ pan: 0.2, panAuto: false });

    expect(resolveCompanyOptions({ panAuto: true }, firstMember).panAuto).toBe(true);
    expect(resolveCompanyOptions({ pan: -0.7 }, firstMember).pan).toBe(-0.7);
  });

  it('a recorded pan of 0 is a real value, not a missing one (it must not fall through to the member)', () => {
    const resolved = resolveCompanyOptions({ pan: 0 }, makeRobot({ pan: 0.5 }));

    expect(resolved.pan).toBe(0);
  });

  // docs/tasks/ROBOT_SENDS.md Task 14 - the sends resolve like Pan: the recorded field, else the first member's.
  describe('reverbSend and delaySend', () => {
    it('resolve to the first member\'s own sends when the snapshot has neither', () => {
      const resolved = resolveCompanyOptions(undefined, makeRobot({ reverbSend: 0.35, delaySend: 0.2 }));

      expect(resolved.reverbSend).toBe(0.35);
      expect(resolved.delaySend).toBe(0.2);
    });

    it('fall back to 0 for a member that carries neither field (an older robot)', () => {
      const resolved = resolveCompanyOptions(undefined, makeRobot());

      expect(resolved.reverbSend).toBe(0);
      expect(resolved.delaySend).toBe(0);
    });

    it('a recorded value wins over the first member', () => {
      const firstMember = makeRobot({ reverbSend: 0.35, delaySend: 0.2 });

      expect(resolveCompanyOptions({ reverbSend: 0.9 }, firstMember).reverbSend).toBe(0.9);
      expect(resolveCompanyOptions({ delaySend: 0.6 }, firstMember).delaySend).toBe(0.6);
    });

    it('a recorded 0 is a real value, not a missing one (a fully dry company must not fall through to the member)', () => {
      const firstMember = makeRobot({ reverbSend: 0.35, delaySend: 0.2 });

      const resolved = resolveCompanyOptions({ reverbSend: 0, delaySend: 0 }, firstMember);

      expect(resolved.reverbSend).toBe(0);
      expect(resolved.delaySend).toBe(0);
    });

    it('record independently: a recorded reverbSend leaves delaySend on the member, and the reverse', () => {
      const firstMember = makeRobot({ reverbSend: 0.35, delaySend: 0.2 });

      expect(resolveCompanyOptions({ reverbSend: 0.9 }, firstMember).delaySend).toBe(0.2);
      expect(resolveCompanyOptions({ delaySend: 0.6 }, firstMember).reverbSend).toBe(0.35);
    });
  });

  // docs/tasks/ROBOT_EFFECT_SENDS.md Task 14 - Grit, Shimmer and Double resolve like the Reverb send. The member's three
  // are distinct so a crossed field cannot pass by coincidence.
  describe.each(['gritSend', 'shimmerSend', 'doubleSend'] as const)('%s', (field) => {
    const member = () => makeRobot({ gritSend: 0.4, shimmerSend: 0.25, doubleSend: 0.15 });

    it('resolves to the first member\'s own value when the snapshot has none', () => {
      expect(resolveCompanyOptions(undefined, member())[field]).toBe(member()[field]);
      expect(resolveCompanyOptions({}, member())[field]).toBe(member()[field]);
    });

    it('falls back to 0 for a member that carries no such field', () => {
      expect(resolveCompanyOptions(undefined, makeRobot())[field]).toBe(0);
    });

    it('a recorded value wins over the first member, and a recorded 0 is a real value', () => {
      expect(resolveCompanyOptions({ [field]: 0.9 }, member())[field]).toBe(0.9);
      expect(resolveCompanyOptions({ [field]: 0 }, member())[field]).toBe(0);
    });

    it('records independently: a recorded value leaves every other send on the member', () => {
      const resolved = resolveCompanyOptions({ [field]: 0.9 }, member());
      for (const other of ['gritSend', 'shimmerSend', 'doubleSend'] as const) {
        if (other !== field) expect(resolved[other], other).toBe(member()[other]);
      }
    });
  });

  it('lfoLinks resolves from the first member\'s current value, falling back to an empty object when unset', () => {
    const withLinks = makeRobot({ lfoLinks: { 'layer0.gain': { lane: 'a', depth: 40 } } as unknown as Robot['lfoLinks'] });
    expect(resolveCompanyOptions(undefined, withLinks).lfoLinks).toEqual({ 'layer0.gain': { lane: 'a', depth: 40 } });

    const withoutLinks = makeRobot({ lfoLinks: undefined });
    expect(resolveCompanyOptions(undefined, withoutLinks).lfoLinks).toEqual({});
  });

  // The Volume LFO target was removed (docs/specs/LFO_LOAD_FIX.md assumption 9, Task 3): the
  // snapshot no longer carries a volumeLfo field, so the resolver must not synthesise one.
  it('never resolves a volumeLfo field', () => {
    const resolved = resolveCompanyOptions(undefined, makeRobot());

    expect('volumeLfo' in resolved).toBe(false);
  });

  it('a legacy lastEditedOptions.volumeLfo (an old saved session) is passed through inert, not re-typed or stripped here', () => {
    // The resolver is a plain spread; the loader (sessionDiff) is where legacy keys are tolerated.
    // This pins that the spread does not throw and does not invent the field when it is absent.
    const resolved = resolveCompanyOptions({ masterVolume: 0.3 }, makeRobot());
    expect(resolved.masterVolume).toBe(0.3);
    expect('volumeLfo' in resolved).toBe(false);
  });

  it('falls back to documented defaults for fields the first member has never had set', () => {
    const firstMember = makeRobot({
      audioMode: undefined,
      rhythmicDensity: undefined,
      rhythmicMotifLength: undefined,
      noteVariance: undefined,
      pitchRepeat: undefined,
    });
    const company = makeCompany();

    const resolved = resolveCompanyOptions(company.lastEditedOptions, firstMember);

    expect(resolved.audioMode).toBe('none');
    expect(resolved.rhythmicDensity).toBe(50);
    expect(resolved.rhythmicMotifLength).toEqual({ active: true, value: 8 });
    expect(resolved.noteVariance).toEqual({ active: false, value: 0 }); // DEFAULT_NOTE_VARIANCE
    expect(resolved.pitchRepeat).toBe(0); // DEFAULT_PITCH_REPEAT
  });

  it('with lastEditedOptions partially populated, only the recorded fields override — everything else still falls back to the first member', () => {
    const firstMember = makeRobot({ masterVolume: 0.6, rhythmicDensity: 42 });
    const company = makeCompany({ lastEditedOptions: { masterVolume: 0.9 } });

    const resolved = resolveCompanyOptions(company.lastEditedOptions, firstMember);

    expect(resolved.masterVolume).toBe(0.9); // recorded override wins
    expect(resolved.rhythmicDensity).toBe(42); // untouched field still falls back live
  });

  it('clickTrackActive falls back to the first member\'s own live value when true, not just its false default', () => {
    const firstMember = makeRobot({ clickTrackActive: true });
    const company = makeCompany();

    const resolved = resolveCompanyOptions(company.lastEditedOptions, firstMember);

    expect(resolved.clickTrackActive).toBe(true);
  });

  it('the first member\'s own subsequent live changes are reflected for any field the snapshot does not cover — never frozen at first-selection time', () => {
    const company = makeCompany({ lastEditedOptions: { masterVolume: 0.9 } });

    const before = resolveCompanyOptions(company.lastEditedOptions, makeRobot({ rhythmicDensity: 10 }));
    expect(before.rhythmicDensity).toBe(10);

    // The "first member" robot object drifted (e.g. edited individually) between two calls —
    // resolveCompanyOptions has no memory of its own; it re-reads whatever is passed in.
    const after = resolveCompanyOptions(company.lastEditedOptions, makeRobot({ rhythmicDensity: 77 }));
    expect(after.rhythmicDensity).toBe(77);
    // The recorded override is unaffected by the drift.
    expect(after.masterVolume).toBe(0.9);
  });
});

describe('resolveCompanyOptions: the articulation fields (Robot Articulation Task 10)', () => {
  const withAudio = (extra: Partial<Robot['audioAttributes']>) =>
    makeRobot({ audioAttributes: { ...makeRobot().audioAttributes, ...extra } });

  it('falls back to the first member for the cutoff, resonance, type and portamento', () => {
    const resolved = resolveCompanyOptions(undefined, withAudio({ filterFreq: 900, filterQ: 4, filterType: 'bandpass', portamento: 0.3 }));

    expect(resolved.filterFreq).toBe(900);
    expect(resolved.filterQ).toBe(4);
    expect(resolved.filterType).toBe('bandpass');
    expect(resolved.portamento).toBe(0.3);
  });

  it('resolves a first member with none of them to Q 1, lowpass, no glide and the open band (filterFreq 0)', () => {
    const resolved = resolveCompanyOptions(undefined, withAudio({}));

    expect(resolved.filterQ).toBe(1);
    expect(resolved.filterType).toBe('lowpass');
    expect(resolved.portamento).toBe(0);
    expect(resolved.filterFreq).toBe(20000);
  });

  it('gives a first member with a stored cutoff of 0 the open band, and one with no cutoff at all the 1200 Hz default', () => {
    expect(resolveCompanyOptions(undefined, withAudio({ filterFreq: 0 })).filterFreq).toBe(20000);
    expect(resolveCompanyOptions(undefined, withAudio({ filterFreq: undefined as unknown as number })).filterFreq).toBe(1200);
  });

  it('a recorded value wins over the first member, field by field', () => {
    const firstMember = withAudio({ filterFreq: 900, filterQ: 4, filterType: 'bandpass', portamento: 0.3 });

    const resolved = resolveCompanyOptions({ filterQ: 9, filterType: 'highpass' }, firstMember);

    expect(resolved.filterQ).toBe(9);
    expect(resolved.filterType).toBe('highpass');
    expect(resolved.filterFreq).toBe(900); // untouched: still the first member's
    expect(resolved.portamento).toBe(0.3);
  });

  it('a recorded portamento of 0 is a real value, not a missing one', () => {
    expect(resolveCompanyOptions({ portamento: 0 }, withAudio({ portamento: 0.3 })).portamento).toBe(0);
  });

  it('a recorded cutoff is passed through as it is', () => {
    expect(resolveCompanyOptions({ filterFreq: 640 }, withAudio({ filterFreq: 900 })).filterFreq).toBe(640);
  });

  it('follows the first member live for a field the snapshot does not cover', () => {
    const snapshot = { filterQ: 9 };
    expect(resolveCompanyOptions(snapshot, withAudio({ filterFreq: 500 })).filterFreq).toBe(500);
    expect(resolveCompanyOptions(snapshot, withAudio({ filterFreq: 1500 })).filterFreq).toBe(1500);
  });
});

// docs/tasks/ROBOT_PERFORMANCE.md Task 14 - Dynamics, Rests and Accents resolve like the sends: the recorded field,
// else the first member's own, else the documented default (50 / 0 / 0).
describe('resolveCompanyOptions: the performance fields (Robot Performance Task 14)', () => {
  it('resolve to the first member\'s own dynamics, rests and accents when the snapshot has none', () => {
    const resolved = resolveCompanyOptions(undefined, makeRobot({ dynamics: 72, rests: 35, accents: 80 }));

    expect(resolved.dynamics).toBe(72);
    expect(resolved.rests).toBe(35);
    expect(resolved.accents).toBe(80);
  });

  it('fall back to 50, 0 and 0 for a member that carries none of the fields (an older robot)', () => {
    const resolved = resolveCompanyOptions(undefined, makeRobot());

    expect(resolved.dynamics).toBe(50);
    expect(resolved.rests).toBe(0);
    expect(resolved.accents).toBe(0);
  });

  it('a recorded value wins over the first member, field by field', () => {
    const firstMember = makeRobot({ dynamics: 72, rests: 35, accents: 80 });

    expect(resolveCompanyOptions({ dynamics: 20 }, firstMember).dynamics).toBe(20);
    expect(resolveCompanyOptions({ rests: 60 }, firstMember).rests).toBe(60);
    expect(resolveCompanyOptions({ accents: 5 }, firstMember).accents).toBe(5);
  });

  it('a recorded 0 is a real value, not a missing one (a company with Dynamics flattened to 0 must not fall through)', () => {
    const resolved = resolveCompanyOptions({ dynamics: 0, rests: 0, accents: 0 }, makeRobot({ dynamics: 72, rests: 35, accents: 80 }));

    expect(resolved.dynamics).toBe(0);
    expect(resolved.rests).toBe(0);
    expect(resolved.accents).toBe(0);
  });

  it('record independently: a recorded rests leaves dynamics and accents on the member', () => {
    const resolved = resolveCompanyOptions({ rests: 60 }, makeRobot({ dynamics: 72, rests: 35, accents: 80 }));

    expect(resolved.dynamics).toBe(72);
    expect(resolved.accents).toBe(80);
  });

  it('follow the first member live for a field the snapshot does not cover', () => {
    const snapshot = { accents: 5 };

    expect(resolveCompanyOptions(snapshot, makeRobot({ rests: 10 })).rests).toBe(10);
    expect(resolveCompanyOptions(snapshot, makeRobot({ rests: 90 })).rests).toBe(90);
  });
});

describe('diffCompoundField', () => {
  it('returns a patch with just the one field that changed', () => {
    const prev = { attack: 0.2, decay: 0.3, sustain: 0.8, release: 1.5 };
    const next = { attack: 0.9, decay: 0.3, sustain: 0.8, release: 1.5 };

    expect(diffCompoundField(prev, next)).toEqual({ attack: 0.9 });
  });

  it('returns an empty patch when nothing differs', () => {
    const value = { shape: 'sine' as const, rate: 1, depth: 20 };

    expect(diffCompoundField(value, { ...value })).toEqual({});
  });

  it('only reports the first differing key when multiple differ (defensive — real callers never do this)', () => {
    const prev = { active: false, value: 1 };
    const next = { active: true, value: 5 };

    const patch = diffCompoundField(prev, next);
    expect(Object.keys(patch)).toHaveLength(1);
  });
});

describe('diffLayerField', () => {
  const layers: OscillatorLayer[] = [
    { type: 'sine', gain: 1, detune: 0, phase: 0 },
    { type: 'square', gain: 0.8, detune: 5, phase: 10 },
    { type: 'triangle', gain: 0.6, detune: -5, phase: 20 },
  ];

  it('finds the one layer index and field that changed', () => {
    const next = layers.map((l, i) => (i === 1 ? { ...l, gain: 0.4 } : l));

    expect(diffLayerField(layers, next)).toEqual({ idx: 1, patch: { gain: 0.4 } });
  });

  it('finds a structural change (type) the same way as a continuous change (gain)', () => {
    const next = layers.map((l, i) => (i === 2 ? { ...l, type: 'pulse' as const } : l));

    expect(diffLayerField(layers, next)).toEqual({ idx: 2, patch: { type: 'pulse' } });
  });

  it('returns null when no layer differs', () => {
    expect(diffLayerField(layers, layers.map((l) => ({ ...l })))).toBeNull();
  });
});
