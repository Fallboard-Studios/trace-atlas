// ========================================
// IMPORTS
// ========================================
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  diffWorldAgainstSeed,
  fillWorldFromSeed,
  generateWorldSeedBaseline,
  type WorldIdentity,
} from './seedBaseline';
import * as globalAudioSeed from './globalAudioSeed';
import { generateAttenuationStyleBpm } from './bpmSeed';
import { evictAttenuationStyleNoiseMap, getAttenuationStyleNoiseMap } from './noiseMaps';
import {
  EDITED_USER_COMPANY,
  FIXTURE_COORDINATES,
  fullyEditedWorld,
  untouchedWorld,
} from '../testUtils/worldLinkFixtures';
import { GLOBAL_LFO_TARGET_IDS, LFO_LANE_IDS } from '../types/lfo';
import type { SessionPayload } from '../types/session';

// ========================================
// FIXTURES
// ========================================

const NAME = 'n40dh8p8';
const SCRATCH_ID = '__world-link__';

/** The eight generators called directly, under an id of the test's own choosing. */
function directBaseline(id: string, name: string) {
  return {
    globalAudio: globalAudioSeed.generateGlobalAudioSettings(id, name),
    lfoBank: globalAudioSeed.generateLfoBankSettings(id, name),
    globalLfoLinks: globalAudioSeed.generateGlobalLfoLinks(id, name),
    bpm: generateAttenuationStyleBpm(id, name),
    swellFrequency: globalAudioSeed.generateSwellFrequency(id, name),
    swellDuration: globalAudioSeed.generateSwellDuration(id, name),
    humanize: globalAudioSeed.generateHumanize(id, name),
    pingVarianceAutomation: globalAudioSeed.generatePingVarianceAutomation(id, name),
  };
}

/** One sample off the map the cache holds for `id`, built under `name` only if `id` is not cached. */
function firstSample(id: string, name: string): number {
  return getAttenuationStyleNoiseMap(id, name)(0.37, 0.61);
}

// ========================================
// TEST SUITE
// ========================================

describe('generateWorldSeedBaseline', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    for (const id of [SCRATCH_ID, 'any-id', 'ref-n40', 'ref-other'])
      evictAttenuationStyleNoiseMap(id);
  });

  it('equals the eight generators called directly with any id and the same name, field for field', () => {
    const baseline = generateWorldSeedBaseline(NAME);
    expect(baseline).toEqual(directBaseline('any-id', NAME));
    expect(Object.keys(baseline).sort()).toEqual(
      [
        'bpm',
        'globalAudio',
        'globalLfoLinks',
        'humanize',
        'lfoBank',
        'pingVarianceAutomation',
        'swellDuration',
        'swellFrequency',
      ].sort()
    );
  });

  it('returns an equal value on a second consecutive call', () => {
    expect(generateWorldSeedBaseline(NAME)).toEqual(generateWorldSeedBaseline(NAME));
  });

  it('reads the exact name: a different name gives a different baseline', () => {
    expect(generateWorldSeedBaseline('Pelagos 7!')).toEqual(directBaseline('any-id', 'Pelagos 7!'));
    expect(generateWorldSeedBaseline('Pelagos 7!')).not.toEqual(generateWorldSeedBaseline(NAME));
  });

  it('leaves compressorBeforeDelay at whatever the generator returns (false)', () => {
    expect(generateWorldSeedBaseline(NAME).globalAudio.compressorBeforeDelay).toBe(false);
  });

  it('evicts its scratch noise map: the scratch id builds a fresh map for another name afterwards', () => {
    generateWorldSeedBaseline(NAME);
    const underScratch = firstSample(SCRATCH_ID, 'OTHER');
    expect(underScratch).not.toBe(firstSample('ref-n40', NAME));
    expect(underScratch).toBe(firstSample('ref-other', 'OTHER'));
  });

  it('still evicts the scratch map when a generator throws', () => {
    vi.spyOn(globalAudioSeed, 'generateHumanize').mockImplementationOnce(() => {
      throw new Error('generator failed');
    });
    expect(() => generateWorldSeedBaseline(NAME)).toThrow('generator failed');
    expect(firstSample(SCRATCH_ID, 'OTHER')).toBe(firstSample('ref-other', 'OTHER'));
  });
});

describe('diffWorldAgainstSeed / fillWorldFromSeed', () => {
  const identity: WorldIdentity = { attenuationStyleName: NAME, coordinates: FIXTURE_COORDINATES };
  const baseline = generateWorldSeedBaseline(NAME);

  it('fixture precondition: the seed puts a sync on lane b and the Delay, none on lane c', () => {
    expect(baseline.lfoBank.b.sync).toBeDefined();
    expect(baseline.globalAudio.delay.sync).toBeDefined();
    expect('sync' in baseline.lfoBank.c).toBe(false);
  });

  it('fills an empty diff to the untouched world, and that world diffs back to {}', () => {
    const filled = fillWorldFromSeed(identity, {}, baseline);
    expect(filled).toEqual(untouchedWorld());
    expect(diffWorldAgainstSeed(filled, baseline)).toEqual({});
    expect(Object.keys(diffWorldAgainstSeed(filled, baseline))).toEqual([]);
  });

  it('fills the identity exactly and stamps version 2', () => {
    const filled = fillWorldFromSeed(
      { attenuationStyleName: ' Pelagos 7! ', coordinates: { x: -3, y: 0 } },
      {},
      baseline
    );
    expect(filled.version).toBe(2);
    expect(filled.attenuationStyleName).toBe(' Pelagos 7! ');
    expect(filled.coordinates).toEqual({ x: -3, y: 0 });
  });

  it('a delay.feedback change carries the whole delay block and nothing else', () => {
    const p = untouchedWorld();
    p.globalAudio.delay = { ...p.globalAudio.delay, feedback: p.globalAudio.delay.feedback + 0.3 };
    const diff = diffWorldAgainstSeed(p, baseline);
    expect(Object.keys(diff)).toEqual(['globalAudio']);
    expect(Object.keys(diff.globalAudio!)).toEqual(['delay']);
    expect(diff.globalAudio!.delay).toEqual(p.globalAudio.delay);
    expect(diff.globalAudio!.delay!.sync).toEqual(baseline.globalAudio.delay.sync);
  });

  it('a lane that lost its seeded sync travels whole, and fills back without a sync key', () => {
    const p = untouchedWorld();
    const { sync: _sync, ...free } = p.lfoBank!.b;
    p.lfoBank!.b = free;
    const diff = diffWorldAgainstSeed(p, baseline);
    expect(Object.keys(diff)).toEqual(['lfoBank']);
    expect(Object.keys(diff.lfoBank!)).toEqual(['b']);
    expect(diff.lfoBank!.b).toEqual(free);
    const filled = fillWorldFromSeed(identity, diff, baseline);
    expect('sync' in filled.lfoBank!.b).toBe(false);
    expect(filled).toEqual(p);
  });

  it('a Delay block that lost its seeded sync fills back without one (no deep merge inside a block)', () => {
    const p = untouchedWorld();
    const { sync: _sync, ...free } = p.globalAudio.delay;
    p.globalAudio.delay = free;
    const filled = fillWorldFromSeed(identity, diffWorldAgainstSeed(p, baseline), baseline);
    expect('sync' in filled.globalAudio.delay).toBe(false);
    expect(filled).toEqual(p);
  });

  it('compressorBeforeDelay: true travels as that one key', () => {
    const p = untouchedWorld();
    p.globalAudio.compressorBeforeDelay = true;
    const diff = diffWorldAgainstSeed(p, baseline);
    expect(diff).toEqual({ globalAudio: { compressorBeforeDelay: true } });
  });

  it('one changed global link travels whole, keyed by its target', () => {
    const p = untouchedWorld();
    p.globalLfoLinks!['eq3.low'] = { lane: 'c', depth: 40 };
    expect(diffWorldAgainstSeed(p, baseline)).toEqual({
      globalLfoLinks: { 'eq3.low': { lane: 'c', depth: 40 } },
    });
  });

  it('bpm equal to the seed is absent, and bpm + 1 is present', () => {
    const p = untouchedWorld();
    expect('bpm' in diffWorldAgainstSeed(p, baseline)).toBe(false);
    p.bpm = baseline.bpm + 1;
    expect(diffWorldAgainstSeed(p, baseline)).toEqual({ bpm: baseline.bpm + 1 });
  });

  it('a swellFrequency carried forward from another style is a diff', () => {
    const other = generateWorldSeedBaseline('Pelagos 7!');
    expect(other.swellFrequency).not.toBe(baseline.swellFrequency);
    const p = untouchedWorld();
    p.swellFrequency = other.swellFrequency;
    expect(diffWorldAgainstSeed(p, baseline)).toEqual({ swellFrequency: other.swellFrequency });
  });

  it('each pacing scalar is compared on its own', () => {
    const p = untouchedWorld();
    p.humanize = baseline.humanize + 2;
    p.pingVarianceAutomation = baseline.pingVarianceAutomation === 0.9 ? 0.1 : 0.9;
    p.swellDuration = baseline.swellDuration + 3;
    expect(diffWorldAgainstSeed(p, baseline)).toEqual({
      humanize: p.humanize,
      pingVarianceAutomation: p.pingVarianceAutomation,
      swellDuration: p.swellDuration,
    });
  });

  it('a pacing scalar or record the payload lacks writes no key (never an undefined value)', () => {
    const p: SessionPayload = untouchedWorld();
    p.globalAudio.reverb = { ...p.globalAudio.reverb, decay: p.globalAudio.reverb.decay + 1 };
    delete p.bpm;
    delete p.humanize;
    delete p.lfoBank;
    delete p.globalLfoLinks;
    const diff = diffWorldAgainstSeed(p, baseline);
    expect(Object.keys(diff)).toEqual(['globalAudio']);
    expect(Object.keys(diff.globalAudio!)).toEqual(['reverb']);
  });

  it('copies a robot override map with one entry, and writes no key for empty robots or companies', () => {
    const p = untouchedWorld();
    p.robotOverrides = { 'robot-3': { pan: -0.4 } };
    expect(diffWorldAgainstSeed(p, baseline)).toEqual({
      robotOverrides: { 'robot-3': { pan: -0.4 } },
    });
    expect(Object.keys(diffWorldAgainstSeed(untouchedWorld(), baseline))).toEqual([]);
  });

  it('copies company diffs and user companies when present', () => {
    const p = untouchedWorld();
    p.companyDiffs = { 'company-2': { name: 'Night Shift' } };
    p.userCreatedCompanies = [EDITED_USER_COMPANY];
    expect(diffWorldAgainstSeed(p, baseline)).toEqual({
      companyDiffs: { 'company-2': { name: 'Night Shift' } },
      userCreatedCompanies: [EDITED_USER_COMPANY],
    });
  });

  it('fills only the blocks, lanes and targets a diff carries; the rest stay the seed', () => {
    const reverb = { ...baseline.globalAudio.reverb, decay: 9 };
    const laneB = { ...baseline.lfoBank.b, rate: 0 };
    const filled = fillWorldFromSeed(
      identity,
      { globalAudio: { reverb }, lfoBank: { b: laneB } },
      baseline
    );
    expect(filled.globalAudio).toEqual({ ...baseline.globalAudio, reverb });
    expect(filled.lfoBank).toEqual({ ...baseline.lfoBank, b: laneB });
    expect(filled.globalLfoLinks).toEqual(baseline.globalLfoLinks);
    expect(filled.bpm).toBe(baseline.bpm);
    expect(filled.robotOverrides).toEqual({});
    expect(filled.companyDiffs).toEqual({});
    expect(filled.userCreatedCompanies).toEqual([]);
  });

  describe('the fully edited world', () => {
    const edited = fullyEditedWorld();
    const diff = diffWorldAgainstSeed(edited, baseline);

    it('carries every Audio Rig key, every lane, the two moved targets and every scalar', () => {
      expect(Object.keys(diff).sort()).toEqual(
        [
          'bpm',
          'companyDiffs',
          'globalAudio',
          'globalLfoLinks',
          'humanize',
          'lfoBank',
          'pingVarianceAutomation',
          'robotOverrides',
          'swellDuration',
          'swellFrequency',
          'userCreatedCompanies',
        ].sort()
      );
      expect(Object.keys(diff.globalAudio!).sort()).toEqual(
        Object.keys(baseline.globalAudio).sort()
      );
      expect(Object.keys(diff.lfoBank!).sort()).toEqual([...LFO_LANE_IDS].sort());
      expect(Object.keys(diff.globalLfoLinks!).sort()).toEqual(['eq3.low', 'hpf.Q']);
      expect(Object.keys(diff.robotOverrides!)).toHaveLength(12);
    });

    it('round-trips: the fill of its diff deep-equals it', () => {
      expect(fillWorldFromSeed(identity, diff, baseline)).toEqual(edited);
    });

    it('never writes a key with an undefined value at any level it owns', () => {
      for (const value of Object.values(diff)) expect(value).not.toBeUndefined();
      for (const value of Object.values(diff.globalAudio!)) expect(value).not.toBeUndefined();
      for (const value of Object.values(diff.lfoBank!)) expect(value).not.toBeUndefined();
      for (const target of GLOBAL_LFO_TARGET_IDS) {
        if (target in diff.globalLfoLinks!) expect(diff.globalLfoLinks![target]).toBeDefined();
      }
    });
  });
});
