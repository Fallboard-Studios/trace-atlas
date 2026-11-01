// ========================================
// IMPORTS
// ========================================
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { Robot } from '../types/Robot';
import { JobType } from '../types/Robot';
import { spawnInitialRoster, spawnInitialCompanies } from './spawnSystem';
import { applyAspectDeal, rederiveLoading } from './aspectDeal';
import { DEFAULT_LOADING, useLoadingStore, type LoadingIdentity } from '../stores/loadingStore';
import { useLocaleStore, DEFAULT_LOCALE } from '../stores/localeStore';
import { AudioEngine } from '../engine/AudioEngine';
import { robotSendLevels } from '../data/robotSends';
import type { ThemeId } from '../data/bands/themes';

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
    ['classic', 'calm'],
    ['classic', 'bold'],
    ['classic', 'adventurous'],
    ['classic', 'perilous'],
    ['perilous', 'calm'],
    ['calm', 'classic'],
  ])('%s to %s leaves the roster what a fresh build under the new theme gives, robot for robot, Melody and Envelope dealt', (from, to) => {
    const live = buildWorld({ theme: from, aspects: ASPECTS });
    const fresh = robotsOf(buildWorld({ theme: to, aspects: ASPECTS }));
    expect(comparable(robotsOf(live))).not.toEqual(comparable(fresh)); // precondition: the theme moves the roster

    rederive(live, { theme: from, aspects: ASPECTS }, { theme: to, aspects: ASPECTS });

    expect(comparable(robotsOf(live))).toEqual(comparable(fresh));
  });

  it('a theme and aspects at once: the moved families and the new loadedUnder, as a fresh build under both', () => {
    const live = buildWorld({ theme: 'classic', aspects: {} });
    const next: LoadingIdentity = { theme: 'calm', aspects: { envelope: ['held'], voice: ['hollow'] } };
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

    rederive(live, CLASSIC_PLAIN, { theme: 'perilous', aspects: {} });

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
    const fresh = robotsOf(buildWorld({ theme: 'perilous', aspects: {} }))[0];
    const { adsr } = robot.audioAttributes;
    useLocaleStore.getState().updateRobot(live, robot.id, {
      // Perilous moves these four...
      rhythmicDensity: 3,
      rests: 97,
      reverbSend: 0.123,
      // ...and not these.
      pitchRepeat: 41,
      gritSend: 0.456,
      accents: 88,
      audioAttributes: { ...robot.audioAttributes, filterFreq: 1234, adsr: { ...adsr, attack: 1.987, decay: 1.654 } },
    });

    rederive(live, CLASSIC_PLAIN, { theme: 'perilous', aspects: {} });

    const after = robotsOf(live)[0];
    expect(after.rhythmicDensity).toBe(fresh.rhythmicDensity);
    expect(after.rests).toBe(fresh.rests);
    expect(after.reverbSend).toBe(fresh.reverbSend);
    expect(after.audioAttributes.adsr.attack).toBe(fresh.audioAttributes.adsr.attack);
    expect(after.pitchRepeat).toBe(41);
    expect(after.gritSend).toBe(0.456);
    expect(after.accents).toBe(88);
    expect(after.audioAttributes.filterFreq).toBe(1234);
    expect(after.audioAttributes.adsr.decay).toBe(1.654);
    // Preconditions: each reset is visible.
    expect(fresh.rhythmicDensity).not.toBe(3);
    expect(fresh.rests).not.toBe(97);
    expect(fresh.reverbSend).not.toBe(0.123);
    expect(fresh.audioAttributes.adsr.attack).not.toBe(1.987);
  });

  it('pushes each moved family once per robot it moved for, with the value written, and never Voice', () => {
    const live = buildWorld({ theme: 'classic', aspects: ASPECTS });
    const before = robotsOf(live);
    const fresh = robotsOf(buildWorld({ theme: 'perilous', aspects: ASPECTS }));
    const movedBy = (pick: (r: Robot) => unknown) =>
      before.filter((r, i) => JSON.stringify(pick(r)) !== JSON.stringify(pick(fresh[i]))).map((r) => r.id).sort();
    const melodyMoved = movedBy((r) => [r.rhythmicDensity, r.rhythmicMotifLength, r.noteVariance, r.pitchRepeat, r.rests]);
    const envelopeMoved = movedBy((r) => r.audioAttributes.adsr);
    const sendsMoved = movedBy((r) => robotSendLevels(r));
    // Preconditions: each family moves for some robot, so a skipped push is seen.
    expect(melodyMoved.length).toBeGreaterThan(0);
    expect(envelopeMoved.length).toBeGreaterThan(0);
    expect(sendsMoved.length).toBeGreaterThan(0);
    const register = vi.spyOn(AudioEngine, 'registerRobotMelody').mockImplementation(() => {});
    const envelope = vi.spyOn(AudioEngine, 'updateVoiceEnvelope').mockImplementation(() => {});
    const sends = vi.spyOn(AudioEngine, 'updateRobotSends').mockImplementation(() => {});
    const rebuild = vi.spyOn(AudioEngine, 'reReserveVoice').mockImplementation(() => true);

    rederive(live, { theme: 'classic', aspects: ASPECTS }, { theme: 'perilous', aspects: ASPECTS });

    const stored = (id: unknown) => robotsOf(live).find((r) => r.id === id)!;
    expect(idsCalled(register)).toEqual(melodyMoved);
    for (const [id, melody] of register.mock.calls) expect(melody).toEqual(stored(id).melody);
    expect(idsCalled(envelope)).toEqual(envelopeMoved);
    for (const [id, adsr] of envelope.mock.calls) expect(adsr).toEqual(stored(id).audioAttributes.adsr);
    expect(idsCalled(sends)).toEqual(sendsMoved);
    for (const [id, levels] of sends.mock.calls) expect(levels).toEqual(robotSendLevels(stored(id)));
    expect(rebuild).not.toHaveBeenCalled();
  });

  it('a rests move alone regenerates the melody: the notes take the new rests, as a hand edit of Rests does', () => {
    const live = buildWorld({ theme: 'classic', aspects: {} });
    const robot = robotsOf(live)[0];
    const fresh = robotsOf(buildWorld({ theme: 'calm', aspects: {} }))[0];
    // Every Melody field but rests held at the new theme's values, so rests is the one field the change moves.
    const { rhythmicDensity, rhythmicMotifLength, noteVariance, pitchRepeat } = fresh;
    useLocaleStore.getState().updateRobot(live, robot.id, { rhythmicDensity, rhythmicMotifLength, noteVariance, pitchRepeat });
    expect(robot.rests).not.toBe(fresh.rests); // precondition
    const register = vi.spyOn(AudioEngine, 'registerRobotMelody').mockImplementation(() => {});

    rederive(live, CLASSIC_PLAIN, { theme: 'calm', aspects: {} });

    expect(robotsOf(live)[0].rests).toBe(fresh.rests);
    expect(comparable([robotsOf(live)[0]])[0].melody).toEqual(comparable([fresh])[0].melody);
    expect(register.mock.calls.filter(([id]) => id === robot.id)).toHaveLength(1);
  });

  it('drops the swell riding each moved field before its write, and none on a field that stays', () => {
    const live = buildWorld({ theme: 'classic', aspects: {} });
    const before = robotsOf(live);
    const fresh = robotsOf(buildWorld({ theme: 'perilous', aspects: {} }));
    const dropped: string[] = [];
    const dropSwell = (id: string, attribute: string) => {
      const written = JSON.stringify(robotsOf(live).find((r) => r.id === id)) !== JSON.stringify(before.find((r) => r.id === id));
      dropped.push(id + ':' + attribute + (written ? ' after the write' : ''));
    };

    rederive(live, CLASSIC_PLAIN, { theme: 'perilous', aspects: {} }, dropSwell);

    const expected = before.flatMap((r, i) => {
      const adsr = (['attack', 'decay', 'sustain', 'release'] as const)
        .filter((k) => r.audioAttributes.adsr[k] !== fresh[i].audioAttributes.adsr[k])
        .map((k) => `adsr.${k}`);
      const sendFields = (['reverbSend', 'delaySend', 'gritSend', 'shimmerSend', 'doubleSend'] as const).filter((k) => r[k] !== fresh[i][k]);
      return [...adsr, ...sendFields].map((attribute) => r.id + ':' + attribute);
    });
    expect(expected.length).toBeGreaterThan(0); // precondition
    expect(dropped.sort()).toEqual(expected.sort());
  });

  it('the same loading again touches nothing: no write, no push, no swell dropped', () => {
    const live = buildWorld({ theme: 'bold', aspects: ASPECTS });
    const before = robotsOf(live);
    const register = vi.spyOn(AudioEngine, 'registerRobotMelody').mockImplementation(() => {});
    const sends = vi.spyOn(AudioEngine, 'updateRobotSends').mockImplementation(() => {});
    const envelope = vi.spyOn(AudioEngine, 'updateVoiceEnvelope').mockImplementation(() => {});
    const cancel = vi.fn();

    rederive(live, { theme: 'bold', aspects: ASPECTS }, { theme: 'bold', aspects: ASPECTS }, cancel);

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
});
