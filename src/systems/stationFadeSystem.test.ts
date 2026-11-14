// ========================================
// IMPORTS
// ========================================
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { startStationFades, stopStationFades } from './stationFadeSystem';
import { enterOnBar } from './workLoop';
import { AudioEngine } from '../engine/AudioEngine';
import { cancelSchedule, getTickSeconds, positionAt, scheduleRepeat } from '../engine/beatClock';
import { DEFAULT_LOCALE_ID } from '../stores/attenuationStyleStore';
import { DEFAULT_LOCALE, useLocaleStore } from '../stores/localeStore';
import { BEATS_PER_MEASURE, STATION_FADE_MIN_STEPS } from '../constants';
import { DockingState } from '../types/Robot';
import type { Robot, RobotActivity } from '../types/Robot';

// ========================================
// MOCKS
// ========================================

// The grid: scheduleRepeat hands back its callback (tick() below runs it); the position and the tick length are
// whatever each test sets, so a tick's step is chosen, not counted.
vi.mock('../engine/beatClock', () => ({
  scheduleRepeat: vi.fn(() => 'fade-schedule'),
  cancelSchedule: vi.fn(),
  positionAt: vi.fn(),
  getTickSeconds: vi.fn(),
}));

// The loop's side is its own suite's (workLoop.test.ts); here only the call is read.
vi.mock('./workLoop', () => ({ enterOnBar: vi.fn() }));

// ========================================
// HELPERS
// ========================================

/** One sixteenth's length at the mocked tempo: 0.125 s is 120 BPM. */
const TICK = 0.125;
const SIXTEENTHS = BEATS_PER_MEASURE * 4;

function makeRobot(id: string, overrides: Partial<Robot> = {}): Robot {
  return {
    id,
    name: id,
    identityColor: '#428d95',
    gemSeed: 1,
    position: { x: 100, y: 100 },
    docking: DockingState.Docked,
    activity: 'entering',
    batteryLevel: 10,
    audioMode: 'none',
    ...overrides,
  } as Robot;
}

const setRoster = (robots: Robot[]): void =>
  useLocaleStore.setState({ locales: { [DEFAULT_LOCALE_ID]: { ...DEFAULT_LOCALE, robots } } });

const update = (id: string, patch: Partial<Robot>): void =>
  useLocaleStore.getState().updateRobot(DEFAULT_LOCALE_ID, id, patch);

const activity = (id: string, a: RobotActivity) => update(id, { activity: a });

const fade = vi.spyOn(AudioEngine, 'scheduleStationFade').mockImplementation(() => {});
const cancel = vi.spyOn(AudioEngine, 'cancelStationFade').mockImplementation(() => {});
/** The lead from the context clock to a tick's time leaving the speakers; 0 unless a test sets one. */
const heard = vi.spyOn(AudioEngine, 'secondsUntilHeard');

/** Run the system's '16n' callback for a tick on `step` (1..16) at audio time `time`. */
function tick(step: number, time = 10 + step * TICK): number {
  vi.mocked(positionAt).mockReturnValue({ step, sixteenth: 64 + step - 1, measure: 4 });
  const onTick = vi.mocked(scheduleRepeat).mock.calls.at(-1)![1];
  onTick(time);
  return time;
}

// ========================================
// SETUP
// ========================================

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getTickSeconds).mockReturnValue(TICK);
  heard.mockReturnValue(0);
  setRoster([makeRobot('r1')]);
});

afterEach(() => {
  stopStationFades();
});

// ========================================
// TESTS
// ========================================

describe('stationFadeSystem — the grid starts each entry on the half-measure rule (backlog 84 Task 11, spec §1.4)', () => {
  it("runs on the sixteenth grid: one '16n' repeat", () => {
    startStationFades(DEFAULT_LOCALE_ID);
    expect(scheduleRepeat).toHaveBeenCalledTimes(1);
    expect(vi.mocked(scheduleRepeat).mock.calls[0][0]).toBe('16n');
  });

  it('half a measure is eight sixteenths', () => {
    expect(STATION_FADE_MIN_STEPS).toBe(8);
    expect(SIXTEENTHS).toBe(16);
  });

  it.each([
    [1, 16],
    [5, 12],
    [9, 8], // exactly half a measure left: inclusive, it fades at once
  ])("an 'entering' robot seen on step %i fades at once over the %i sixteenths to the bar, the arc with it", (step, left) => {
    startStationFades(DEFAULT_LOCALE_ID);
    const time = tick(step);
    expect(fade).toHaveBeenCalledTimes(1);
    expect(fade).toHaveBeenCalledWith('r1', time, left * TICK);
    expect(enterOnBar).toHaveBeenCalledTimes(1);
    expect(enterOnBar).toHaveBeenCalledWith('r1', left * TICK);
  });

  it.each([10, 12, 16])('on step %i (under half a measure left) it holds until the bar-line tick, then takes the whole measure', (step) => {
    startStationFades(DEFAULT_LOCALE_ID);
    for (let s = step; s <= SIXTEENTHS; s += 1) tick(s);
    expect(fade).not.toHaveBeenCalled();
    expect(enterOnBar).not.toHaveBeenCalled();

    const bar = tick(1, 42);
    expect(fade).toHaveBeenCalledTimes(1);
    expect(fade).toHaveBeenCalledWith('r1', bar, SIXTEENTHS * TICK);
    expect(enterOnBar).toHaveBeenCalledWith('r1', SIXTEENTHS * TICK);
  });

  it('the arc ends when the fade is heard: longer by the lead from the context clock to the tick, the fade unchanged', () => {
    heard.mockReturnValue(0.09); // the tick runs a lookahead ahead of the audio, plus the output latency
    startStationFades(DEFAULT_LOCALE_ID);
    const time = tick(5);
    expect(heard).toHaveBeenCalledWith(time);
    expect(fade).toHaveBeenCalledWith('r1', time, 12 * TICK);
    expect(enterOnBar).toHaveBeenCalledWith('r1', 12 * TICK + 0.09);
  });

  it('a soloed robot (an arc, no fade) gets the same lead', () => {
    heard.mockReturnValue(0.09);
    setRoster([makeRobot('r1', { audioMode: 'solo' })]);
    startStationFades(DEFAULT_LOCALE_ID);
    tick(1);
    expect(enterOnBar).toHaveBeenCalledWith('r1', SIXTEENTHS * TICK + 0.09);
  });

  it("the fade's length is read at the tick that starts it (a tempo change reaches the next fade)", () => {
    vi.mocked(getTickSeconds).mockReturnValue(0.2);
    startStationFades(DEFAULT_LOCALE_ID);
    const time = tick(5);
    expect(getTickSeconds).toHaveBeenCalledWith(time);
    expect(fade).toHaveBeenCalledWith('r1', time, 12 * 0.2);
  });

  it('a started robot is not started again on later ticks', () => {
    startStationFades(DEFAULT_LOCALE_ID);
    tick(3);
    for (let s = 4; s <= SIXTEENTHS; s += 1) tick(s);
    tick(1);
    tick(2);
    expect(fade).toHaveBeenCalledTimes(1);
    expect(enterOnBar).toHaveBeenCalledTimes(1);
  });

  it.each(['returning', 'charging', 'exiting', 'transit', 'working', 'waiting'] as const)('a %s robot gets nothing', (a) => {
    setRoster([makeRobot('r1', { activity: a })]);
    startStationFades(DEFAULT_LOCALE_ID);
    tick(1);
    expect(fade).not.toHaveBeenCalled();
    expect(enterOnBar).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
  });

  it("each 'entering' robot is started once, on its own tick", () => {
    setRoster([makeRobot('r1'), makeRobot('r2', { activity: 'returning' }), makeRobot('r3')]);
    startStationFades(DEFAULT_LOCALE_ID);
    const first = tick(2);
    activity('r2', 'entering');
    const second = tick(3);
    expect(fade.mock.calls).toEqual([
      ['r1', first, 15 * TICK],
      ['r3', first, 15 * TICK],
      ['r2', second, 14 * TICK],
    ]);
  });

  it('a robot that left entering and comes back later is started again', () => {
    startStationFades(DEFAULT_LOCALE_ID);
    tick(1);
    activity('r1', 'charging');
    tick(2);
    activity('r1', 'exiting');
    tick(3);
    activity('r1', 'entering');
    const again = tick(4);
    expect(fade).toHaveBeenCalledTimes(2);
    expect(fade).toHaveBeenLastCalledWith('r1', again, 13 * TICK);
    expect(enterOnBar).toHaveBeenCalledTimes(2);
  });

  describe('Solo beats the fade (spec §1.5, A8)', () => {
    it("a soloed 'entering' robot gets the arc on the same timing and no fade", () => {
      setRoster([makeRobot('r1', { audioMode: 'solo' })]);
      startStationFades(DEFAULT_LOCALE_ID);
      tick(12);
      expect(enterOnBar).not.toHaveBeenCalled();
      tick(1);
      expect(fade).not.toHaveBeenCalled();
      expect(enterOnBar).toHaveBeenCalledTimes(1);
      expect(enterOnBar).toHaveBeenCalledWith('r1', SIXTEENTHS * TICK);
    });

    it.each(['mute', 'highlight'] as const)('a %s robot still fades', (audioMode) => {
      setRoster([makeRobot('r1', { audioMode })]);
      startStationFades(DEFAULT_LOCALE_ID);
      tick(1);
      expect(fade).toHaveBeenCalledTimes(1);
    });

    it('a started robot that becomes soloed is cancelled on the next tick, once', () => {
      startStationFades(DEFAULT_LOCALE_ID);
      tick(1);
      tick(2);
      expect(cancel).not.toHaveBeenCalled();
      update('r1', { audioMode: 'solo' });
      const at = tick(3);
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(cancel).toHaveBeenCalledWith('r1', at); // timed at the tick: no untimed ramp inside a Transport callback
      tick(4);
      tick(5);
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(fade).toHaveBeenCalledTimes(1);
      expect(enterOnBar).toHaveBeenCalledTimes(1);
    });

    it('a robot started soloed is never cancelled (it has no fade)', () => {
      setRoster([makeRobot('r1', { audioMode: 'solo' })]);
      startStationFades(DEFAULT_LOCALE_ID);
      tick(1);
      tick(2);
      expect(cancel).not.toHaveBeenCalled();
    });
  });

  describe('the edges', () => {
    it('no position (no transport) does nothing', () => {
      startStationFades(DEFAULT_LOCALE_ID);
      vi.mocked(positionAt).mockReturnValue(undefined);
      vi.mocked(scheduleRepeat).mock.calls[0][1](10);
      expect(fade).not.toHaveBeenCalled();
      expect(enterOnBar).not.toHaveBeenCalled();
    });

    it('no tick length does nothing, and the robot is started on the first tick that has one', () => {
      startStationFades(DEFAULT_LOCALE_ID);
      vi.mocked(getTickSeconds).mockReturnValue(undefined);
      tick(1);
      expect(fade).not.toHaveBeenCalled();
      expect(enterOnBar).not.toHaveBeenCalled();
      vi.mocked(getTickSeconds).mockReturnValue(TICK);
      tick(2);
      expect(fade).toHaveBeenCalledTimes(1);
    });

    it('another locale, or an unknown one, is not read', () => {
      startStationFades('elsewhere');
      tick(1);
      expect(fade).not.toHaveBeenCalled();
      expect(enterOnBar).not.toHaveBeenCalled();
    });

    it('stop cancels the repeat, is idempotent, and a restart starts a fresh record', () => {
      startStationFades(DEFAULT_LOCALE_ID);
      tick(1);
      stopStationFades();
      expect(cancelSchedule).toHaveBeenCalledTimes(1);
      expect(cancelSchedule).toHaveBeenCalledWith('fade-schedule');
      stopStationFades();
      expect(cancelSchedule).toHaveBeenCalledTimes(1);

      startStationFades(DEFAULT_LOCALE_ID);
      tick(2);
      expect(fade).toHaveBeenCalledTimes(2); // the restart forgot r1, which is still entering
    });

    it('start while running does not schedule a second repeat', () => {
      startStationFades(DEFAULT_LOCALE_ID);
      startStationFades(DEFAULT_LOCALE_ID);
      expect(scheduleRepeat).toHaveBeenCalledTimes(1);
    });
  });
});
