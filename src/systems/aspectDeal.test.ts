// ========================================
// IMPORTS
// ========================================
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { Robot } from '../types/Robot';
import { JobType } from '../types/Robot';
import { spawnInitialRoster, spawnInitialCompanies } from './spawnSystem';
import { applyAspectDeal, generateDealtRosterBaseline, rederiveLoading } from './aspectDeal';
import { DEFAULT_LOADING, useLoadingStore, type LoadingIdentity } from '../stores/loadingStore';
import { useLocaleStore, DEFAULT_LOCALE } from '../stores/localeStore';
import { AudioEngine } from '../engine/AudioEngine';
import { ROBOT_SEND_FIELDS, robotSendLevels, type RobotSendField } from '../data/robotSends';
import type { ThemeId } from '../data/bands/themes';
import { CLASSIC } from '../data/bands/classic';
import { dealAspects } from '../data/bands/dealAspects';
import { resolveBands } from '../data/bands/resolveBands';
import { audibleDensityBand, deriveMelodyFields } from './robotFieldDerivation';
import { SIM_SEED_COORDS } from './lifecycleSim';
import { getLocaleNoiseMap } from '../utils/noiseMaps';

// ========================================
// TESTS
// ========================================

// docs/tasks/OFF_SCREEN_FINAL_FIXES.md F7 (Crawford, answer 2b): a theme change re-derives the live roster in place.
// Over the REAL theme columns, which move a robot's rhythmicDensity, rests, attack and release (their curves too) and its
// Reverb and Delay sends, and nothing else (the verify-first dump, 2026-11-01): per robot, every field whose seeded value
// moves between the old loading and the new takes the new one, and every other field - a tweak included - stands.
describe('rederiveLoading: a loading change re-derives the live roster in place (final fixes F7)', () => {
  const COORDS = { x: 23, y: 41 };
  let worlds = 0;
  /** A live world at COORDS, spawned and dealt under `loading` as initializeLocale builds one: a new id each call, so its
   *  spawn count starts at 0 and its robots are the plot's own. */
  const buildWorld = (loading: LoadingIdentity) => {
    useLoadingStore.getState().setLoading(loading);
    const localeId = `final-f7-${worlds++}`;
    useLocaleStore.setState((state) => ({
      locales: { ...state.locales, [localeId]: { ...DEFAULT_LOCALE, id: localeId, coordinates: COORDS, robots: [], companies: [] } },
    }));
    spawnInitialRoster(localeId);
    spawnInitialCompanies(localeId);
    applyAspectDeal(localeId);
    return localeId;
  };
  const robotsOf = (localeId: string) => useLocaleStore.getState().getLocaleById(localeId)!.robots;
  /** Two worlds' robots, comparable whole: a melody event's id is a fresh UUID per generation, never seeded. */
  const comparable = (robots: readonly Robot[]) =>
    robots.map(({ melody, ...rest }) => ({ ...rest, melody: melody.map(({ id: _id, ...event }) => event) }));
  /** The loading change as retransmitWorld runs it: the store set to `to` first, then the re-derive from `from`, the
   *  loading the live world was built under (named, since building the comparison world moves the store). */
  const rederive = (
    localeId: string,
    from: LoadingIdentity,
    to: LoadingIdentity,
    dropSwell: (id: string, attribute: string) => void = vi.fn(),
  ) => {
    useLoadingStore.getState().setLoading(to);
    rederiveLoading(localeId, from, dropSwell);
  };
  const idsCalled = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.map((call) => call[0] as string).sort();
  const ASPECTS: LoadingIdentity['aspects'] = { melody: ['hypnotic', 'mechanical'], envelope: ['held'] };
  const CLASSIC_PLAIN: LoadingIdentity = { theme: 'classic', aspects: {} };

  afterEach(() => {
    useLoadingStore.getState().setLoading(DEFAULT_LOADING);
    vi.restoreAllMocks();
  });

  it.each<[ThemeId, ThemeId]>([
    ['classic', 'float'],
    ['classic', 'anchor'],
    ['classic', 'undertow'],
    ['classic', 'shatter'],
    ['shatter', 'float'],
    ['float', 'classic'],
  ])('%s to %s leaves the roster what a fresh build under the new theme gives, robot for robot, Melody and Envelope dealt', (from, to) => {
    const live = buildWorld({ theme: from, aspects: ASPECTS });
    const fresh = robotsOf(buildWorld({ theme: to, aspects: ASPECTS }));
    expect(comparable(robotsOf(live))).not.toEqual(comparable(fresh)); // precondition: the theme moves the roster

    rederive(live, { theme: from, aspects: ASPECTS }, { theme: to, aspects: ASPECTS });

    expect(comparable(robotsOf(live))).toEqual(comparable(fresh));
  });

  it('a theme and aspects at once: the moved families and the new loadedUnder, as a fresh build under both', () => {
    const live = buildWorld({ theme: 'classic', aspects: {} });
    const next: LoadingIdentity = { theme: 'float', aspects: { envelope: ['held'], voice: ['hollow'] } };
    const fresh = robotsOf(buildWorld(next));

    rederive(live, { theme: 'classic', aspects: {} }, next);

    expect(comparable(robotsOf(live))).toEqual(comparable(fresh));
    for (const robot of robotsOf(live)) expect(robot.loadedUnder, robot.id).toEqual({ envelope: 'held', voice: 'hollow' });
  });

  it('keeps every robot where it stands: the ids, places, batteries, activities, jobs and the companies', () => {
    const live = buildWorld({ theme: 'classic', aspects: {} });
    const moved = robotsOf(live).map((robot, i) => ({
      ...robot,
      position: { x: 100 + i, y: 200 + i },
      batteryLevel: 37 + i,
      activity: 'working' as const,
      job: JobType.Salvage,
    }));
    useLocaleStore.getState().setLocaleData(live, { robots: moved });
    const companies = useLocaleStore.getState().getLocaleById(live)!.companies;

    rederive(live, CLASSIC_PLAIN, { theme: 'shatter', aspects: {} });

    const after = robotsOf(live);
    expect(after.map((r) => r.id)).toEqual(moved.map((r) => r.id));
    after.forEach((robot, i) => {
      expect(robot.position, robot.id).toEqual(moved[i].position);
      expect(robot.batteryLevel, robot.id).toBe(moved[i].batteryLevel);
      expect(robot.activity, robot.id).toBe('working');
      expect(robot.job, robot.id).toBe(JobType.Salvage);
      expect(robot.identityColor, robot.id).toBe(moved[i].identityColor);
      expect(robot.gemSeed, robot.id).toBe(moved[i].gemSeed);
    });
    expect(useLocaleStore.getState().getLocaleById(live)!.companies).toEqual(companies);
  });

  it('a tweak on a field the theme does not move survives; one on a field it moves resets to the new draw', () => {
    const live = buildWorld({ theme: 'classic', aspects: {} });
    const robot = robotsOf(live)[0];
    const fresh = robotsOf(buildWorld({ theme: 'trench', aspects: {} }))[0];
    const { adsr } = robot.audioAttributes;
    useLocaleStore.getState().updateRobot(live, robot.id, {
      // Trench moves these four (its sheet: seldom, long gaps, sunk deep in the cavern, notes fading long)...
      rhythmicDensity: 3,
      rests: 97,
      reverbSend: 0.123,
      // ...and not these.
      pitchRepeat: 41,
      gritSend: 0.456,
      accents: 88,
      audioAttributes: { ...robot.audioAttributes, filterFreq: 1234, adsr: { ...adsr, release: 0.012, attack: 1.987, decay: 1.654 } },
    });

    rederive(live, CLASSIC_PLAIN, { theme: 'trench', aspects: {} });

    const after = robotsOf(live)[0];
    expect(after.rhythmicDensity).toBe(fresh.rhythmicDensity);
    expect(after.rests).toBe(fresh.rests);
    expect(after.reverbSend).toBe(fresh.reverbSend);
    expect(after.audioAttributes.adsr.release).toBe(fresh.audioAttributes.adsr.release);
    expect(after.pitchRepeat).toBe(41);
    expect(after.gritSend).toBe(0.456);
    expect(after.accents).toBe(88);
    expect(after.audioAttributes.filterFreq).toBe(1234);
    expect(after.audioAttributes.adsr.attack).toBe(1.987);
    expect(after.audioAttributes.adsr.decay).toBe(1.654);
    // Preconditions: each reset is visible.
    expect(fresh.rhythmicDensity).not.toBe(3);
    expect(fresh.rests).not.toBe(97);
    expect(fresh.reverbSend).not.toBe(0.123);
    expect(fresh.audioAttributes.adsr.release).not.toBe(0.012);
  });

  it('pushes each moved family once per robot it moved for, with the value written, Voice only where the voice moved', () => {
    const live = buildWorld({ theme: 'classic', aspects: ASPECTS });
    const before = robotsOf(live);
    const fresh = robotsOf(buildWorld({ theme: 'shatter', aspects: ASPECTS }));
    const movedBy = (pick: (r: Robot) => unknown) =>
      before.filter((r, i) => JSON.stringify(pick(r)) !== JSON.stringify(pick(fresh[i]))).map((r) => r.id).sort();
    const melodyMoved = movedBy((r) => [r.rhythmicDensity, r.rhythmicMotifLength, r.noteVariance, r.pitchRepeat, r.rests, r.octaveRange]);
    const envelopeMoved = movedBy((r) => r.audioAttributes.adsr);
    const sendsMoved = movedBy((r) => robotSendLevels(r));
    // Shatter's sheet moves the voice (the saw and the pulse, the layers apart, the accent filter off most probes).
    const voiceMoved = movedBy((r) => {
      const a = r.audioAttributes;
      return [a.waveform, a.layers, a.filterFreq, a.filterQ, a.filterType, r.masterVolume];
    });
    // Preconditions: each family moves for some robot, so a skipped push is seen.
    expect(melodyMoved.length).toBeGreaterThan(0);
    expect(envelopeMoved.length).toBeGreaterThan(0);
    expect(sendsMoved.length).toBeGreaterThan(0);
    expect(voiceMoved.length).toBeGreaterThan(0);
    const register = vi.spyOn(AudioEngine, 'registerRobotMelody').mockImplementation(() => {});
    const envelope = vi.spyOn(AudioEngine, 'updateVoiceEnvelope').mockImplementation(() => {});
    const sends = vi.spyOn(AudioEngine, 'updateRobotSends').mockImplementation(() => {});
    const rebuild = vi.spyOn(AudioEngine, 'reReserveVoice').mockImplementation(() => true);

    rederive(live, { theme: 'classic', aspects: ASPECTS }, { theme: 'shatter', aspects: ASPECTS });

    const stored = (id: unknown) => robotsOf(live).find((r) => r.id === id)!;
    expect(idsCalled(register)).toEqual(melodyMoved);
    for (const [id, melody] of register.mock.calls) expect(melody).toEqual(stored(id).melody);
    expect(idsCalled(envelope)).toEqual(envelopeMoved);
    for (const [id, adsr] of envelope.mock.calls) expect(adsr).toEqual(stored(id).audioAttributes.adsr);
    expect(idsCalled(sends)).toEqual(sendsMoved);
    for (const [id, levels] of sends.mock.calls) expect(levels).toEqual(robotSendLevels(stored(id)));
    expect(idsCalled(rebuild)).toEqual(voiceMoved);
    for (const [id, robot] of rebuild.mock.calls) expect(robot?.audioAttributes).toEqual(stored(id).audioAttributes);
  });

  it('a rests move alone regenerates the melody: the notes take the new rests, as a hand edit of Rests does', () => {
    const live = buildWorld({ theme: 'classic', aspects: {} });
    const robot = robotsOf(live)[0];
    const fresh = robotsOf(buildWorld({ theme: 'float', aspects: {} }))[0];
    // Every Melody field but rests held at the new theme's values, so rests is the one field the change moves.
    const { rhythmicDensity, rhythmicMotifLength, noteVariance, pitchRepeat } = fresh;
    useLocaleStore.getState().updateRobot(live, robot.id, { rhythmicDensity, rhythmicMotifLength, noteVariance, pitchRepeat });
    expect(robot.rests).not.toBe(fresh.rests); // precondition
    const register = vi.spyOn(AudioEngine, 'registerRobotMelody').mockImplementation(() => {});

    rederive(live, CLASSIC_PLAIN, { theme: 'float', aspects: {} });

    expect(robotsOf(live)[0].rests).toBe(fresh.rests);
    expect(comparable([robotsOf(live)[0]])[0].melody).toEqual(comparable([fresh])[0].melody);
    expect(register.mock.calls.filter(([id]) => id === robot.id)).toHaveLength(1);
  });

  it('drops the swell riding each moved field before its write, and none on a field that stays', () => {
    const live = buildWorld({ theme: 'classic', aspects: {} });
    const before = robotsOf(live);
    const fresh = robotsOf(buildWorld({ theme: 'shatter', aspects: {} }));
    const dropped: string[] = [];
    const dropSwell = (id: string, attribute: string) => {
      const written = JSON.stringify(robotsOf(live).find((r) => r.id === id)) !== JSON.stringify(before.find((r) => r.id === id));
      dropped.push(id + ':' + attribute + (written ? ' after the write' : ''));
    };

    rederive(live, CLASSIC_PLAIN, { theme: 'shatter', aspects: {} }, dropSwell);

    // Every swellable field (SWELL_ROBOT_ATTRIBUTE_IDS): the volume, the layers' gain and detune, the adsr and the sends.
    const expected = before.flatMap((r, i) => {
      const volume = r.masterVolume !== fresh[i].masterVolume ? ['volume'] : [];
      const layers = [0, 1, 2].flatMap((n) =>
        (['gain', 'detune'] as const)
          .filter((k) => r.audioAttributes.layers?.[n]?.[k] !== fresh[i].audioAttributes.layers?.[n]?.[k])
          .map((k) => `layer${n}.${k}`),
      );
      const adsr = (['attack', 'decay', 'sustain', 'release'] as const)
        .filter((k) => r.audioAttributes.adsr[k] !== fresh[i].audioAttributes.adsr[k])
        .map((k) => `adsr.${k}`);
      const sendFields = (['reverbSend', 'delaySend', 'gritSend', 'shimmerSend', 'doubleSend'] as const).filter((k) => r[k] !== fresh[i][k]);
      return [...volume, ...layers, ...adsr, ...sendFields].map((attribute) => r.id + ':' + attribute);
    });
    expect(expected.length).toBeGreaterThan(0); // precondition
    expect(dropped.sort()).toEqual(expected.sort());
  });

  it('the same loading again touches nothing: no write, no push, no swell dropped', () => {
    const live = buildWorld({ theme: 'anchor', aspects: ASPECTS });
    const before = robotsOf(live);
    const register = vi.spyOn(AudioEngine, 'registerRobotMelody').mockImplementation(() => {});
    const sends = vi.spyOn(AudioEngine, 'updateRobotSends').mockImplementation(() => {});
    const envelope = vi.spyOn(AudioEngine, 'updateVoiceEnvelope').mockImplementation(() => {});
    const cancel = vi.fn();

    rederive(live, { theme: 'anchor', aspects: ASPECTS }, { theme: 'anchor', aspects: ASPECTS }, cancel);

    expect(robotsOf(live)).toBe(before);
    expect(register).not.toHaveBeenCalled();
    expect(sends).not.toHaveBeenCalled();
    expect(envelope).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
  });

  // docs/tasks/OFF_SCREEN_FINAL_FIXES.md F16 (Crawford's rule: a theme or aspect change writes only what it moves): the
  // layers are compared per layer, per key, so a moved gain leaves a tweaked type alone and drops only its own swell.
  describe('layers, per layer and per key (final fixes F16)', () => {
    const LAYER_KEYS = ['type', 'gain', 'detune', 'phase'] as const;
    /** The first robot and layer whose gain the Voice pick moves while its type stays, from an untweaked pair of worlds. */
    const findMovedGain = (before: readonly Robot[], fresh: readonly Robot[]) => {
      for (let r = 0; r < before.length; r++) {
        const from = before[r].audioAttributes.layers!;
        const to = fresh[r].audioAttributes.layers!;
        for (let i = 0; i < from.length; i++) {
          if (from[i].gain !== to[i].gain && from[i].type === to[i].type) return { r, i };
        }
      }
      throw new Error('no robot with a moved gain under a standing type');
    };

    it('a Voice pick that moves a layer gain keeps a tweaked type on that layer, and drops only that layer\'s gain swell', () => {
      const live = buildWorld(CLASSIC_PLAIN);
      const before = robotsOf(live);
      const fresh = robotsOf(buildWorld({ theme: 'classic', aspects: { voice: ['woody'] } }));
      const { r, i } = findMovedGain(before, fresh);
      const robot = before[r];
      const otherType = robot.audioAttributes.layers![i].type === 'sine' ? ('square' as const) : ('sine' as const);
      const tweakedLayers = robot.audioAttributes.layers!.map((layer, j) => (j === i ? { ...layer, type: otherType } : layer));
      useLocaleStore.getState().updateRobot(live, robot.id, { audioAttributes: { ...robot.audioAttributes, layers: tweakedLayers } });
      const dropped: string[] = [];

      rederive(live, CLASSIC_PLAIN, { theme: 'classic', aspects: { voice: ['woody'] } }, (id, attribute) => {
        if (id === robot.id) dropped.push(attribute);
      });

      const after = robotsOf(live)[r].audioAttributes.layers!;
      expect(after[i].type).toBe(otherType);
      expect(after[i].gain).toBe(fresh[r].audioAttributes.layers![i].gain);
      // Every other layer key is the new draw where it moved and the robot's own where it did not.
      after.forEach((layer, j) => {
        for (const key of LAYER_KEYS) {
          if (j === i && key === 'type') continue;
          const moved = before[r].audioAttributes.layers![j][key] !== fresh[r].audioAttributes.layers![j][key];
          expect(layer[key], `layer ${j} ${key}`).toBe(moved ? fresh[r].audioAttributes.layers![j][key] : before[r].audioAttributes.layers![j][key]);
        }
      });
      // The swells: exactly the moved gains and detunes of this robot's layers, so this layer's gain and never its detune.
      const movedSwells = before[r].audioAttributes.layers!.flatMap((layer, j) =>
        (['gain', 'detune'] as const)
          .filter((key) => layer[key] !== fresh[r].audioAttributes.layers![j][key])
          .map((key) => `layer${j}.${key}`),
      );
      expect(dropped.filter((a) => a.startsWith('layer')).sort()).toEqual(movedSwells.sort());
      expect(dropped).toContain(`layer${i}.gain`);
      expect(dropped).not.toContain(`layer${i}.detune`);
    });

    it('an untweaked world after a Voice pick is the fresh build, layer for layer', () => {
      const live = buildWorld(CLASSIC_PLAIN);
      const fresh = robotsOf(buildWorld({ theme: 'classic', aspects: { voice: ['hollow'] } }));
      rederive(live, CLASSIC_PLAIN, { theme: 'classic', aspects: { voice: ['hollow'] } });
      expect(comparable(robotsOf(live))).toEqual(comparable(fresh));
    });
  });

  it('does nothing, and does not throw, for an unknown locale', () => {
    expect(() => rederiveLoading('no-such-locale', DEFAULT_LOADING, vi.fn())).not.toThrow();
  });

  it('an Envelope pick alone, as a change: the fresh build, its narrowed densities regenerating the melody', () => {
    const live = buildWorld(CLASSIC_PLAIN);
    const before = robotsOf(live);
    const to: LoadingIdentity = { theme: 'classic', aspects: { envelope: ['bowed'] } };
    const fresh = robotsOf(buildWorld(to));
    const narrowed = fresh.filter((r, i) => r.rhythmicDensity !== before[i].rhythmicDensity).map((r) => r.id);
    expect(narrowed.length).toBeGreaterThan(0); // precondition: Bowed's attacks narrow some robot's density
    const register = vi.spyOn(AudioEngine, 'registerRobotMelody').mockImplementation(() => {});

    rederive(live, CLASSIC_PLAIN, to);

    expect(comparable(robotsOf(live))).toEqual(comparable(fresh));
    const registered = new Set(register.mock.calls.map(([id]) => id as string));
    for (const id of narrowed) expect(registered.has(id), id).toBe(true);
  });
});

// The attack rail (a slow attack thins the density band): the deal honours it as spawn does. An Envelope pick re-draws
// the density under the theme's band against the dealt attack; a Melody pick dealt with it draws against that attack too.
describe('applyAspectDeal: the attack rail', () => {
  const COORDS = { x: 23, y: 41 };
  let worlds = 0;
  const buildWorld = (loading: LoadingIdentity) => {
    useLoadingStore.getState().setLoading(loading);
    const localeId = `attack-rail-${worlds++}`;
    useLocaleStore.setState((state) => ({
      locales: { ...state.locales, [localeId]: { ...DEFAULT_LOCALE, id: localeId, coordinates: COORDS, robots: [], companies: [] } },
    }));
    spawnInitialRoster(localeId);
    spawnInitialCompanies(localeId);
    applyAspectDeal(localeId);
    return useLocaleStore.getState().getLocaleById(localeId)!.robots;
  };
  /** The densest a robot's attack allows under Classic's tempo. */
  const capOf = (robot: Robot) => Math.ceil(audibleDensityBand({ min: 0, max: 100 }, robot.audioAttributes.adsr.attack, CLASSIC.bpm).max);

  afterEach(() => {
    useLoadingStore.getState().setLoading(DEFAULT_LOADING);
    vi.restoreAllMocks();
  });

  it('Tumbling dealt with Bowed: every robot dealt both draws its attack\'s cap, Tumbling\'s 85-100 collapsed onto it', () => {
    const robots = buildWorld({ theme: 'classic', aspects: { melody: ['tumbling'], envelope: ['bowed'] } });
    const both = robots.filter((r) => r.loadedUnder?.melody === 'tumbling' && r.loadedUnder?.envelope === 'bowed');
    expect(both.length).toBeGreaterThan(0);
    for (const robot of both) {
      expect(capOf(robot)).toBeLessThan(85); // precondition: Bowed's slowest attack sits under Tumbling's band
      // Tumbling's band collapses onto the cap, so the draw is the cap itself: a re-draw under Classic's band (the
      // theme's, the Envelope-only path) would land anywhere below it.
      const cap = audibleDensityBand({ min: 0, max: 100 }, robot.audioAttributes.adsr.attack, CLASSIC.bpm).max;
      expect(robot.rhythmicDensity, robot.name).toBe(Math.round(cap));
    }
  });

  it('Bowed alone: a dealt robot re-draws only its density, and every dealt robot keeps under its cap', () => {
    const plain = buildWorld({ theme: 'classic', aspects: {} });
    const robots = buildWorld({ theme: 'classic', aspects: { envelope: ['bowed'] } });
    const dealt = robots.filter((r) => r.loadedUnder?.envelope === 'bowed');
    expect(dealt.length).toBeGreaterThan(0);
    expect(dealt.some((r) => r.rhythmicDensity !== plain[robots.indexOf(r)].rhythmicDensity)).toBe(true);
    for (const robot of dealt) {
      const was = plain[robots.indexOf(robot)];
      expect(robot.rhythmicDensity, robot.name).toBeLessThanOrEqual(capOf(robot));
      expect([robot.rhythmicMotifLength, robot.noteVariance, robot.pitchRepeat]).toEqual([was.rhythmicMotifLength, was.noteVariance, was.pitchRepeat]);
    }
  });

  it('Bowed alone: a robot whose density the deal narrows has its melody regenerated', () => {
    const plain = buildWorld({ theme: 'classic', aspects: {} });
    // Spawned by hand, so the spy sees the deal's registrations and not the spawn's.
    useLoadingStore.getState().setLoading({ theme: 'classic', aspects: { envelope: ['bowed'] } });
    const localeId = `attack-rail-${worlds++}`;
    useLocaleStore.setState((state) => ({
      locales: { ...state.locales, [localeId]: { ...DEFAULT_LOCALE, id: localeId, coordinates: COORDS, robots: [], companies: [] } },
    }));
    spawnInitialRoster(localeId);
    spawnInitialCompanies(localeId);
    const register = vi.spyOn(AudioEngine, 'registerRobotMelody').mockImplementation(() => {});
    applyAspectDeal(localeId);
    const robots = useLocaleStore.getState().getLocaleById(localeId)!.robots;
    const narrowed = robots.filter((r, i) => r.rhythmicDensity !== plain[i].rhythmicDensity);
    expect(narrowed.length).toBeGreaterThan(0);
    const registered = new Set(register.mock.calls.map(([id]) => id as string));
    for (const robot of narrowed) {
      expect(registered.has(robot.id), robot.name).toBe(true);
    }
  });
});

// Company Families Task 6 (docs/tasks/COMPANY_FAMILIES.md; spec §1.11, case 8): the deal derives a company member's
// dealt fields from its founder's index (`lineage.founderIndex`), so an aspect keeps a company one voice: live, in the
// baseline and on an aspect change. A member moved by hand into another company is dealt that company's pick, still
// from its own lineage (B15).
describe('the deal by founder (Company Families Task 6)', () => {
  let worlds = 0;
  /** Every family dealt two picks, so companies differ. */
  const ALL: LoadingIdentity = {
    theme: 'classic',
    aspects: {
      melody: ['hypnotic', 'mechanical'], envelope: ['plucked', 'held'], distance: ['near', 'echoing'],
      voice: ['glassy', 'woody'], motion: ['gliding', 'trembling'], performance: ['steady', 'dramatic'],
    },
  };
  const ALL_AGAIN: LoadingIdentity = {
    theme: 'classic',
    aspects: {
      melody: ['wandering', 'chanting'], envelope: ['swelling', 'bowed'], distance: ['halfHeard', 'near'],
      voice: ['hollow', 'brassy'], motion: ['sweeping', 'gliding'], performance: ['halting', 'steady'],
    },
  };
  /** A world at (x, y) under `loading`, as initializeLocale builds one, under a new id. */
  const buildWorld = (loading: LoadingIdentity, x: number, y: number) => {
    useLoadingStore.getState().setLoading(loading);
    const localeId = `deal-by-founder-${worlds++}`;
    useLocaleStore.setState((state) => ({
      locales: { ...state.locales, [localeId]: { ...DEFAULT_LOCALE, id: localeId, coordinates: { x, y }, robots: [], companies: [] } },
    }));
    spawnInitialRoster(localeId);
    spawnInitialCompanies(localeId);
    applyAspectDeal(localeId);
    return localeId;
  };
  const robotsOf = (localeId: string) => useLocaleStore.getState().getLocaleById(localeId)!.robots;
  /** Everything the deal writes: what a member shares with its founder. */
  const dealtOf = (robot: Pick<Robot, 'audioAttributes' | 'lfoLinks' | 'loadedUnder' | 'rhythmicDensity' | 'rhythmicMotifLength'
    | 'noteVariance' | 'pitchRepeat' | 'dynamics' | 'rests' | 'accents' | RobotSendField>) => ({
    audioAttributes: robot.audioAttributes,
    lfoLinks: robot.lfoLinks,
    loadedUnder: robot.loadedUnder,
    melody: [robot.rhythmicDensity, robot.rhythmicMotifLength, robot.noteVariance, robot.pitchRepeat],
    performance: [robot.dynamics, robot.rests, robot.accents],
    sends: ROBOT_SEND_FIELDS.map((field) => robot[field]),
  });
  /** The rhythm the melody regenerates with: onsets, lengths and the rest and accent stamps. */
  const rhythmOf = (robot: Robot) => robot.melody.map((e) => [e.startStep, e.length, e.rest, e.mark]);
  /** Stubs the engine pushes, so a grid of worlds deals quickly; no draw is stubbed. */
  const stubEngine = () => {
    vi.spyOn(AudioEngine, 'reserveVoice').mockReturnValue(true);
    vi.spyOn(AudioEngine, 'registerRobotMelody').mockImplementation(() => {});
    vi.spyOn(AudioEngine, 'updateRobotSends').mockImplementation(() => {});
    vi.spyOn(AudioEngine, 'updateVoiceEnvelope').mockImplementation(() => {});
    vi.spyOn(AudioEngine, 'reReserveVoice').mockImplementation(() => true);
    vi.spyOn(AudioEngine, 'updateVoicePortamento').mockImplementation(() => {});
    vi.spyOn(AudioEngine, 'updateRobotMasterVolume').mockImplementation(() => {});
  };
  const GRID = SIM_SEED_COORDS.filter((_, i) => i % 4 === 0); // 31 worlds

  afterEach(() => {
    useLoadingStore.getState().setLoading(DEFAULT_LOADING);
    vi.restoreAllMocks();
  });

  it('after applyAspectDeal, every member carries its founder\'s dealt fields and rhythm, every family dealt', () => {
    stubEngine();
    let members = 0;
    for (const { x, y } of GRID) {
      const robots = robotsOf(buildWorld(ALL, x, y));
      for (const robot of robots) {
        if (!robot.lineage) continue;
        members++;
        const founder = robots[robot.lineage.founderIndex];
        expect(robot.loadedUnder, `${x}:${y} ${robot.name}`).toBeDefined();
        expect(dealtOf(robot), `${x}:${y} ${robot.name}`).toEqual(dealtOf(founder));
        expect(rhythmOf(robot), `${x}:${y} ${robot.name}`).toEqual(rhythmOf(founder));
      }
    }
    expect(members).toBeGreaterThanOrEqual(GRID.length * 4);
  });

  it('the live deal agrees with generateDealtRosterBaseline robot for robot, members included (an untouched dealt world saves nothing)', () => {
    stubEngine();
    for (const { x, y } of GRID.slice(0, 8)) {
      const localeId = buildWorld(ALL, x, y);
      const robots = robotsOf(localeId);
      const { robots: baselines } = generateDealtRosterBaseline(getLocaleNoiseMap(localeId, x, y), robots.map((r) => r.id), ALL);
      robots.forEach((robot, i) => {
        expect(dealtOf(robot), `${x}:${y} robot ${i}`).toEqual(dealtOf(baselines[i]));
      });
    }
  });

  it('after an aspect change through rederiveLoading, every member still carries its founder\'s dealt fields and rhythm', () => {
    stubEngine();
    for (const { x, y } of GRID.slice(0, 12)) {
      const localeId = buildWorld(ALL, x, y);
      useLoadingStore.getState().setLoading(ALL_AGAIN);
      rederiveLoading(localeId, ALL, vi.fn());
      const robots = robotsOf(localeId);
      // Precondition: every robot was re-dealt.
      expect(robots.every((r) => r.loadedUnder?.melody === 'wandering' || r.loadedUnder?.melody === 'chanting')).toBe(true);
      for (const robot of robots) {
        if (!robot.lineage) continue;
        const founder = robots[robot.lineage.founderIndex];
        expect(dealtOf(robot), `${x}:${y} ${robot.name}`).toEqual(dealtOf(founder));
        expect(rhythmOf(robot), `${x}:${y} ${robot.name}`).toEqual(rhythmOf(founder));
      }
    }
  });

  it('a member moved by hand and then re-dealt takes its new company\'s pick, derived from its own lineage (B15)', () => {
    stubEngine();
    const FROM: LoadingIdentity = { theme: 'classic', aspects: { melody: ['hypnotic', 'mechanical'] } };
    const TO: LoadingIdentity = { theme: 'classic', aspects: { melody: ['wandering', 'chanting'] } };
    const [x, y] = [-200, 80]; // three companies (Task 4's Results)
    const localeId = buildWorld(FROM, x, y);
    const noiseMap = getLocaleNoiseMap(localeId, x, y);
    const { robots, companies } = useLocaleStore.getState().getLocaleById(localeId)!;
    const member = robots.find((r) => r.lineage !== undefined && r.companyId === companies[0].id)!;
    expect(member, 'a member of the first company').toBeDefined();
    const founderIndex = member.lineage!.founderIndex;
    const memberIndex = robots.indexOf(member);

    // A company whose pick under TO differs from the founder's, once the member stands in it.
    const target = companies.slice(1).find((company) => {
      const moved = companies.map((c) => ({
        robotIds: c.id === company.id ? [...c.robotIds, member.id] : c.robotIds.filter((id) => id !== member.id),
      }));
      const deal = dealAspects(TO, moved, robots, noiseMap);
      return deal.get(member.id)?.melody !== deal.get(robots[founderIndex].id)?.melody;
    })!;
    expect(target, 'a company dealt another pick').toBeDefined();
    useLocaleStore.getState().assignRobotToCompany(localeId, member.id, target.id);

    useLoadingStore.getState().setLoading(TO);
    rederiveLoading(localeId, FROM, vi.fn());

    const after = robotsOf(localeId);
    const moved = after[memberIndex];
    const pick = after.find((r) => r.companyId === target.id && r.id !== member.id)!.loadedUnder!.melody!;
    expect(moved.lineage).toEqual({ founderIndex });
    expect(moved.loadedUnder?.melody).toBe(pick);
    expect(after[founderIndex].loadedUnder?.melody).not.toBe(pick);
    const bands = resolveBands('classic', { melody: pick });
    const attack = moved.audioAttributes.adsr.attack;
    const fromLineage = deriveMelodyFields(noiseMap, founderIndex, bands, attack);
    expect(fromLineage).not.toEqual(deriveMelodyFields(noiseMap, memberIndex, bands, attack)); // precondition
    expect([moved.rhythmicDensity, moved.rhythmicMotifLength, moved.noteVariance, moved.pitchRepeat])
      .toEqual([fromLineage.rhythmicDensity, fromLineage.rhythmicMotifLength, fromLineage.noteVariance, fromLineage.pitchRepeat]);
  });
});
