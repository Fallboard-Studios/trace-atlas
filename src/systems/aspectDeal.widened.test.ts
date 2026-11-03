// ========================================
// MOCKS
// ========================================
import { describe, it, expect, afterEach, vi } from 'vitest';

// docs/tasks/THEME_AND_ASPECTS_REFINEMENT.md T6: a theme column may name any robot key once its field is compared and
// pushed on a live world. Proved on an injected column, whatever the real columns hold: Calm's column is whatever the
// case sets (a getter, so each case installs its own), every other theme the real one. Its own file, so
// aspectDeal.test.ts's real-column cases (final fixes F7, F16, F20) run unmodified.
const injected = vi.hoisted(() => ({ column: {} as Record<string, unknown> }));

vi.mock('../data/bands/themes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../data/bands/themes')>();
  return {
    ...actual,
    THEMES: {
      ...actual.THEMES,
      get calm() {
        return injected.column;
      },
    },
  };
});

// ========================================
// IMPORTS
// ========================================
import type { Robot } from '../types/Robot';
import type { ThemeColumn } from '../data/bands/themes';
import { spawnInitialRoster, spawnInitialCompanies } from './spawnSystem';
import { applyAspectDeal, rederiveLoading } from './aspectDeal';
import { DEFAULT_LOADING, useLoadingStore, type LoadingIdentity } from '../stores/loadingStore';
import { useLocaleStore, DEFAULT_LOCALE } from '../stores/localeStore';
import { AudioEngine } from '../engine/AudioEngine';
import { lfoEngine } from '../engine/lfoEngine';
import { ROBOT_LFO_TARGET_IDS, type RobotLfoTargetId } from '../types/lfo';
import { deriveGlobalHalfMoves, useAudioStore } from '../stores/audioStore';
import { withLoading } from '../data/bands/loadingContext';
import { generateGlobalLfoLinks, generateHumanize } from '../utils/globalAudioSeed';

// ========================================
// HELPERS
// ========================================

const COORDS = { x: 23, y: 41 };
const CLASSIC_PLAIN: LoadingIdentity = { theme: 'classic', aspects: {} };
const CALM_PLAIN: LoadingIdentity = { theme: 'calm', aspects: {} };
let worlds = 0;

/** A live world at COORDS, spawned and dealt under `loading` as initializeLocale builds one. */
function buildWorld(loading: LoadingIdentity): string {
  useLoadingStore.getState().setLoading(loading);
  const localeId = `themes-58-t6-${worlds++}`;
  useLocaleStore.setState((state) => ({
    locales: { ...state.locales, [localeId]: { ...DEFAULT_LOCALE, id: localeId, coordinates: COORDS, robots: [], companies: [] } },
  }));
  spawnInitialRoster(localeId);
  spawnInitialCompanies(localeId);
  applyAspectDeal(localeId);
  return localeId;
}

const robotsOf = (localeId: string) => useLocaleStore.getState().getLocaleById(localeId)!.robots;

/** Robots comparable whole: a melody event's id is a fresh UUID per generation, never seeded. */
const comparable = (robots: readonly Robot[]) =>
  robots.map(({ melody, ...rest }) => ({ ...rest, melody: melody.map(({ id: _id, ...event }) => event) }));

const ids = (robots: readonly Robot[]) => robots.map((r) => r.id).sort();

/**
 * One theme change from Classic to Calm under `column`, on a world built under Classic: the robots before, after, and as
 * a fresh build under the column draws them, and every swell dropped. Every engine push is spied and silenced.
 */
function changeTheme(column: ThemeColumn) {
  injected.column = {};
  const live = buildWorld(CLASSIC_PLAIN);
  injected.column = column;
  const fresh = robotsOf(buildWorld(CALM_PLAIN));
  const before = robotsOf(live);
  const spies = {
    register: vi.spyOn(AudioEngine, 'registerRobotMelody').mockImplementation(() => {}),
    envelope: vi.spyOn(AudioEngine, 'updateVoiceEnvelope').mockImplementation(() => {}),
    portamento: vi.spyOn(AudioEngine, 'updateVoicePortamento').mockImplementation(() => {}),
    sends: vi.spyOn(AudioEngine, 'updateRobotSends').mockImplementation(() => {}),
    rebuild: vi.spyOn(AudioEngine, 'reReserveVoice').mockImplementation(() => true),
    link: vi.spyOn(lfoEngine, 'linkTarget').mockImplementation(() => true),
  };
  const dropped: string[] = [];
  useLoadingStore.getState().setLoading(CALM_PLAIN);
  rederiveLoading(live, CLASSIC_PLAIN, (id, attribute) => dropped.push(`${id}:${attribute}`));
  return { before, after: robotsOf(live), fresh, spies, dropped };
}

/** The robots whose `pick` differs between the two rosters, by index. */
const movedBy = (before: readonly Robot[], fresh: readonly Robot[], pick: (r: Robot) => unknown) =>
  before.filter((r, i) => JSON.stringify(pick(r)) !== JSON.stringify(pick(fresh[i])));

/**
 * The write is the field alone: every robot after is the robot before with `take` laid over it from the fresh draw
 * where the field moved, the same object where it did not (no write at all), and the moved set is not empty.
 */
function expectFieldAlone(
  result: ReturnType<typeof changeTheme>,
  pick: (r: Robot) => unknown,
  take: (before: Robot, fresh: Robot) => Partial<Robot>,
) {
  const { before, after, fresh } = result;
  const moved = movedBy(before, fresh, pick);
  expect(moved.length, 'a robot the column moves').toBeGreaterThan(0);
  before.forEach((robot, i) => {
    if (!moved.includes(robot)) {
      expect(after[i], `${robot.id} not written`).toBe(robot);
      return;
    }
    const expected = { ...robot, ...take(robot, fresh[i]) };
    expect(comparable([after[i]])[0], robot.id).toEqual(comparable([expected])[0]);
  });
  return moved;
}

afterEach(() => {
  injected.column = {};
  useLoadingStore.getState().setLoading(DEFAULT_LOADING);
  vi.restoreAllMocks();
});

// ========================================
// TESTS
// ========================================

describe('rederiveLoading: every widened robot key is compared and pushed (themes-58 T6)', () => {
  it('robot.dynamics: the field alone, no engine call (a playback scale read on every note, as the Dynamics edit)', () => {
    const result = changeTheme({ 'robot.dynamics': { min: 90, max: 100 } });
    expectFieldAlone(result, (r) => r.dynamics, (_, f) => ({ dynamics: f.dynamics }));
    for (const spy of Object.values(result.spies)) expect(spy).not.toHaveBeenCalled();
    expect(result.dropped).toEqual([]);
  });

  it('robot.accents: the field and the melody it bakes in, regenerated once per moved robot, as the Accents edit', () => {
    const result = changeTheme({ 'robot.accents': { min: 95, max: 100 } });
    const moved = expectFieldAlone(result, (r) => r.accents, (_, f) => ({ accents: f.accents, melody: f.melody }));
    expect(result.spies.register.mock.calls.map(([id]) => id).sort()).toEqual(ids(moved));
    for (const [id, melody] of result.spies.register.mock.calls) expect(melody).toEqual(result.after.find((r) => r.id === id)!.melody);
    expect(result.dropped).toEqual([]);
  });

  it('robot.portamento: the glide alone, written live once per moved robot (the Portamento edit), no rebuild', () => {
    const result = changeTheme({ 'robot.portamento': { min: 1, max: 1.5, lit: 0.125 } });
    const moved = expectFieldAlone(
      result,
      (r) => r.audioAttributes.portamento,
      (b, f) => ({ audioAttributes: { ...b.audioAttributes, portamento: f.audioAttributes.portamento } }),
    );
    // The glider share is unchanged, so most robots keep a glide of 0 and are not written.
    expect(moved.length).toBeLessThan(result.before.length);
    const calls = result.spies.portamento.mock.calls.filter(([id]) => moved.some((r) => r.id === id));
    expect(calls.map(([id]) => id).sort()).toEqual(ids(moved));
    for (const [id, seconds] of calls) expect(seconds).toBe(result.after.find((r) => r.id === id)!.audioAttributes.portamento);
    expect(result.spies.portamento.mock.calls.every(([id]) => moved.some((r) => r.id === id))).toBe(true);
    expect(result.spies.rebuild).not.toHaveBeenCalled();
    expect(result.dropped).toEqual([]);
  });

  it.each([
    ['robot.lfoGainDepth', (t: RobotLfoTargetId) => t.endsWith('.gain')],
    ['robot.lfoDetuneDepth', (t: RobotLfoTargetId) => t.endsWith('.detune')],
    ['robot.lfoBusDepth', (t: RobotLfoTargetId) => t === 'bus.frequency'],
  ] as const)('%s: the moved link targets, each re-primed to the engine with its new link', (key, ownTarget) => {
    // A lit share of 1 lights the key's own targets; the lane tally then moves some robots' other lanes too (the draw is
    // roster-aware), so every target the draw moved takes the new link, as a fresh build has it.
    const result = changeTheme({ [key]: { min: 70, max: 80, lit: 1 } });
    const moved = expectFieldAlone(result, (r) => r.lfoLinks, (_, f) => ({ lfoLinks: f.lfoLinks }));
    const ownMoved = moved.some((robot) =>
      ROBOT_LFO_TARGET_IDS.filter(ownTarget).some(
        (t) => JSON.stringify(robot.lfoLinks![t]) !== JSON.stringify(result.after.find((r) => r.id === robot.id)!.lfoLinks![t]),
      ),
    );
    expect(ownMoved, 'a target of the key itself moved').toBe(true);
    for (const robot of moved) {
      const after = result.after.find((r) => r.id === robot.id)!;
      for (const target of ROBOT_LFO_TARGET_IDS) {
        if (JSON.stringify(robot.lfoLinks![target]) === JSON.stringify(after.lfoLinks![target])) continue;
        expect(result.spies.link, `${robot.id} ${target}`).toHaveBeenCalledWith(target, after.lfoLinks![target], robot.id);
      }
    }
    const linked = new Set(result.spies.link.mock.calls.map(([, , id]) => id));
    expect([...linked].sort()).toEqual(ids(moved));
    expect(result.dropped).toEqual([]);
  });

  it('a hand-set link on a target the column does not move stands, per target', () => {
    injected.column = {};
    const live = buildWorld(CLASSIC_PLAIN);
    const robot = robotsOf(live)[0];
    const tweak = { lane: 'c' as const, depth: 33 };
    useLocaleStore.getState().updateRobot(live, robot.id, { lfoLinks: { ...robot.lfoLinks!, 'bus.frequency': tweak } });
    injected.column = { 'robot.lfoGainDepth': { min: 70, max: 80, lit: 1 } };
    const fresh = robotsOf(buildWorld(CALM_PLAIN))[0];
    vi.spyOn(lfoEngine, 'linkTarget').mockImplementation(() => true);
    vi.spyOn(AudioEngine, 'reReserveVoice').mockImplementation(() => true);
    useLoadingStore.getState().setLoading(CALM_PLAIN);
    rederiveLoading(live, CLASSIC_PLAIN, vi.fn());
    const after = robotsOf(live)[0];
    expect(after.lfoLinks!['bus.frequency']).toEqual(tweak);
    expect(after.lfoLinks!['layer0.gain']).toEqual(fresh.lfoLinks!['layer0.gain']);
    expect(fresh.lfoLinks!['layer0.gain']).not.toEqual(robot.lfoLinks!['layer0.gain']); // precondition
  });

  it('robot.masterVolume: the field alone, the voice rebuilt once per moved robot at its new volume, the volume swell dropped', () => {
    const result = changeTheme({ 'robot.masterVolume': { min: 0.3, max: 0.35 } });
    const moved = expectFieldAlone(result, (r) => r.masterVolume, (_, f) => ({ masterVolume: f.masterVolume }));
    expect(result.spies.rebuild.mock.calls.map(([id]) => id).sort()).toEqual(ids(moved));
    for (const [id, robot] of result.spies.rebuild.mock.calls) {
      expect(robot!.masterVolume).toBe(result.after.find((r) => r.id === id)!.masterVolume);
    }
    expect(result.dropped.sort()).toEqual(moved.map((r) => `${r.id}:volume`).sort());
  });

  it('robot.octaveRegister: the register (and the volume its bias moves) with the melody, regenerated once per moved robot', () => {
    const result = changeTheme({ 'robot.octaveRegister': { weights: { bass: 0, low: 0, mid: 0, high: 0, treble: 1 } } });
    const moved = expectFieldAlone(
      result,
      (r) => r.octaveRange,
      (b, f) => ({
        octaveRange: f.octaveRange,
        audioAttributes: { ...b.audioAttributes, octaveRange: f.audioAttributes.octaveRange },
        masterVolume: f.masterVolume,
        melody: f.melody,
      }),
    );
    for (const robot of result.after) expect(robot.octaveRange, robot.id).toEqual([5, 7]);
    expect(result.spies.register.mock.calls.map(([id]) => id).sort()).toEqual(ids(moved));
    for (const [id, melody] of result.spies.register.mock.calls) expect(melody).toEqual(result.after.find((r) => r.id === id)!.melody);
  });

  it('robot.detune: the layer detunes alone, the voice rebuilt once per moved robot, each moved detune swell dropped', () => {
    const result = changeTheme({ 'robot.detune': { min: 15, max: 20 } });
    const moved = expectFieldAlone(
      result,
      (r) => r.audioAttributes.layers!.map((l) => l.detune),
      (b, f) => ({
        audioAttributes: {
          ...b.audioAttributes,
          layers: b.audioAttributes.layers!.map((l, j) => ({ ...l, detune: f.audioAttributes.layers![j].detune })),
        },
      }),
    );
    expect(result.spies.rebuild.mock.calls.map(([id]) => id).sort()).toEqual(ids(moved));
    const swells = moved.flatMap((robot) => {
      const i = result.before.indexOf(robot);
      return robot.audioAttributes.layers!
        .map((l, j) => (l.detune !== result.fresh[i].audioAttributes.layers![j].detune ? `${robot.id}:layer${j}.detune` : null))
        .filter((s): s is string => s !== null);
    });
    expect(result.dropped.sort()).toEqual(swells.sort());
  });

  it('an untweaked world after a change on every widened key at once is the fresh build, robot for robot', () => {
    const column: ThemeColumn = {
      'robot.dynamics': { min: 90, max: 100 },
      'robot.accents': { min: 95, max: 100 },
      'robot.portamento': { min: 1, max: 1.5, lit: 0.5 },
      'robot.lfoGainDepth': { min: 70, max: 80, lit: 1 },
      'robot.lfoDetuneDepth': { min: 5, max: 9, lit: 0.6 },
      'robot.lfoBusDepth': { min: 50, max: 60, lit: 0.9 },
      'robot.masterVolume': { min: 0.3, max: 0.35 },
      'robot.octaveRegister': { weights: { bass: 1, low: 0, mid: 0, high: 0, treble: 0 } },
      'robot.detune': { min: 15, max: 20 },
    };
    const { after, fresh } = changeTheme(column);
    expect(comparable(after)).toEqual(comparable(fresh));
  });
});

describe('deriveGlobalHalfMoves: the two world keys new at T6 (themes-58 T6)', () => {
  const STYLE = ['pelagos', 'Pelagos'] as const;
  const halfMoves = (column: ThemeColumn) => {
    injected.column = column;
    return deriveGlobalHalfMoves(...STYLE, CLASSIC_PLAIN, CALM_PLAIN);
  };

  it('humanize: a theme band moves the scatter, and the write reaches the engine through setHumanize', () => {
    const moves = halfMoves({ humanize: { min: 15, max: 15 } });
    expect(moves.humanize).toBe(15);
    const setHumanize = vi.spyOn(AudioEngine, 'setHumanize').mockImplementation(() => {});
    useAudioStore.getState().applyGlobalHalfMoves(moves);
    expect(useAudioStore.getState().humanize).toBe(15);
    expect(setHumanize).toHaveBeenCalledWith(15);
  });

  it('humanize: a theme whose draw lands where Classic did moves nothing, and nothing reaches the engine', () => {
    const classic = withLoading(CLASSIC_PLAIN, () => generateHumanize(...STYLE));
    const moves = halfMoves({ humanize: { min: classic, max: classic } });
    expect('humanize' in moves).toBe(false);
    const setHumanize = vi.spyOn(AudioEngine, 'setHumanize').mockImplementation(() => {});
    useAudioStore.getState().applyGlobalHalfMoves(moves);
    expect(setHumanize).not.toHaveBeenCalled();
  });

  it('lfoLink.lpf.frequency: a lit share of 1 ties the master low-pass live at the band depth, every other link standing', () => {
    const moves = halfMoves({ 'lfoLink.lpf.frequency': { min: 70, max: 70, lit: 1 } });
    const after = withLoading(CALM_PLAIN, () => generateGlobalLfoLinks(...STYLE));
    expect(after['lpf.frequency'].lane).not.toBeNull();
    expect(after['lpf.frequency'].depth).toBe(70);
    expect(moves.globalLfoLinks['lpf.frequency']).toMatchObject({ depth: 70 });
    expect(Object.keys(moves.globalLfoLinks)).toEqual(['lpf.frequency']);
  });

  it('lfoLink.lpf.frequency: a theme band moves the tie in every world it is lit in, and only there', () => {
    // Over many styles: under Classic about a third of worlds draw the tie quiet; a lit share of 1 lights every one.
    const names = Array.from({ length: 60 }, (_, i) => `t6-style-${i}`);
    injected.column = { 'lfoLink.lpf.frequency': { min: 70, max: 70, lit: 1 } };
    const quietUnderClassic = names.filter(
      (name) => withLoading(CLASSIC_PLAIN, () => generateGlobalLfoLinks(name, name))['lpf.frequency'].lane === null,
    );
    expect(quietUnderClassic.length).toBeGreaterThan(5);
    for (const name of names) expect(withLoading(CALM_PLAIN, () => generateGlobalLfoLinks(name, name))['lpf.frequency'].lane, name).not.toBeNull();
  });
});
