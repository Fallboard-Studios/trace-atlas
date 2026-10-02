import { describe, it, expect } from 'vitest';

import { resolveCompanyOptions, diffCompoundField, diffLayerField } from './companyOptions';
import type { Company } from '@/types/Company';
import type { Robot } from '@/types/Robot';
import type { OscillatorLayer } from '@/types/layeredAudio';

function makeRobot(overrides: Partial<Robot> = {}): Robot {
  return {
    id: 'r1',
    name: 'Test Robot',
    state: 'idle',
    position: { x: 0, y: 0 },
    destination: null,
    direction: 'right',
    melody: [],
    audioAttributes: {
      adsr: { attack: 0.2, decay: 0.3, sustain: 0.8, release: 1.5 },
      filterFreq: 0,
      waveform: 'sine',
      layers: [{ type: 'sine', gain: 1, detune: 0, phase: 0 }],
    },
    octaveRange: [3, 5],
    createdAt: Date.now(),
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
