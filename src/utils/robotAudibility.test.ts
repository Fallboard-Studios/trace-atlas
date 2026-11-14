import { describe, it, expect } from 'vitest';

import { isDockMuted, isRobotAudible, isRobotEmitting, isRobotSounding } from './robotAudibility';
import { DockingState, type RobotActivity } from '@/types/Robot';

const OUT = DockingState.Active;
/** An Active robot's activity in these cases: out at work. */
const OUT_ACT = 'transit' as const;
const AUDIO_MODES = ['none', 'solo', 'mute', 'highlight', undefined] as const;
const DOCKINGS = [DockingState.Active, DockingState.Recalled, DockingState.Docked, DockingState.Undocking, undefined] as const;
/** The activity a robot with this docking state rests in: in its station when Docked or Undocking, swimming home when
 *  Recalled, out otherwise. */
const activityOf = (docking: DockingState | undefined): RobotActivity =>
  docking === DockingState.Docked || docking === DockingState.Undocking ? 'charging' : docking === DockingState.Recalled ? 'returning' : OUT_ACT;

describe('isDockMuted', () => {
  it('mutes a robot in the station, Docked or Undocking, and no other', () => {
    expect(isDockMuted(DockingState.Docked, 'charging')).toBe(true);
    expect(isDockMuted(DockingState.Undocking, 'charging')).toBe(true);
    expect(isDockMuted(DockingState.Active, OUT_ACT)).toBe(false);
    expect(isDockMuted(DockingState.Recalled, 'returning')).toBe(false); // heard on its way home, as before
    expect(isDockMuted(undefined, undefined)).toBe(false);
  });
});

describe('isDockMuted reads whether the robot is in its station (backlog 84, spec §1.3)', () => {
  const IN_STATION = [DockingState.Docked, DockingState.Undocking] as const;
  const NOT_IN = ['exiting', 'transit', 'working', 'waiting', 'returning', 'entering'] as const;

  it('a Docked robot still on its way home, swimming or at its port, is not dock-muted', () => {
    expect(isDockMuted(DockingState.Docked, 'returning')).toBe(false);
    expect(isDockMuted(DockingState.Docked, 'entering')).toBe(false);
  });

  it('a Docked or Undocking robot that is charging is dock-muted', () => {
    expect(isDockMuted(DockingState.Docked, 'charging')).toBe(true);
    expect(isDockMuted(DockingState.Undocking, 'charging')).toBe(true);
  });

  it('an undefined activity (a robot not yet in the store) is not in the station (plan Task 5)', () => {
    expect(isDockMuted(DockingState.Docked, undefined)).toBe(false);
    expect(isDockMuted(DockingState.Undocking, undefined)).toBe(false);
    expect(isRobotAudible('none', false, DockingState.Docked, undefined)).toBe(true);
  });

  it('every reader must pass the activity: it is a required argument', () => {
    // @ts-expect-error activity is required (plan Task 5)
    expect(isDockMuted(DockingState.Docked)).toBe(false);
    // @ts-expect-error activity is required
    expect(isRobotAudible('none', false, DockingState.Docked)).toBe(true);
    // @ts-expect-error activity is required, and isSounding after it
    expect(isRobotEmitting('none', false, DockingState.Docked)).toBeFalsy(); // audible, but no sounding set given
  });

  it('only charging mutes a Docked or Undocking robot; every other activity is heard', () => {
    for (const docking of IN_STATION) {
      for (const activity of NOT_IN) expect(isDockMuted(docking, activity), `${docking}/${activity}`).toBe(false);
    }
  });

  it('a robot out of the station is never dock-muted, whatever its activity', () => {
    for (const docking of [DockingState.Active, DockingState.Recalled, undefined]) {
      for (const activity of [...NOT_IN, 'charging', undefined] as const) {
        expect(isDockMuted(docking, activity), `${docking}/${activity}`).toBe(false);
      }
    }
  });

  it('isRobotAudible passes it through: a homebound Docked robot is heard, a charging one is not', () => {
    expect(isRobotAudible('none', false, DockingState.Docked, 'returning')).toBe(true);
    expect(isRobotAudible('highlight', false, DockingState.Docked, 'entering')).toBe(true);
    expect(isRobotAudible('none', false, DockingState.Docked, 'charging')).toBe(false);
    expect(isRobotAudible('none', false, DockingState.Undocking, 'charging')).toBe(false);
  });

  it('isRobotAudible: Mute still wins and Solo still beats the dock, with an activity given', () => {
    expect(isRobotAudible('mute', false, DockingState.Docked, 'returning')).toBe(false);
    expect(isRobotAudible('mute', false, DockingState.Active, 'transit')).toBe(false);
    expect(isRobotAudible('solo', true, DockingState.Docked, 'charging')).toBe(true);
    expect(isRobotAudible('none', true, DockingState.Docked, 'returning')).toBe(false); // another robot's Solo
  });

  it('isRobotEmitting passes it through, and still needs the sounding set', () => {
    expect(isRobotEmitting('none', false, DockingState.Docked, 'returning', true)).toBe(true);
    expect(isRobotEmitting('none', false, DockingState.Docked, 'returning', false)).toBe(false);
    expect(isRobotEmitting('none', false, DockingState.Docked, 'charging', true)).toBe(false);
    expect(isRobotEmitting('solo', true, DockingState.Docked, 'charging', true)).toBe(true);
  });
});

describe('isRobotAudible', () => {
  it('returns false when audioMode is mute, regardless of anySolo', () => {
    expect(isRobotAudible('mute', false, OUT, OUT_ACT)).toBe(false);
    expect(isRobotAudible('mute', true, OUT, OUT_ACT)).toBe(false);
  });

  it('returns true when audioMode is none/undefined/highlight and no robot is solo', () => {
    expect(isRobotAudible('none', false, OUT, OUT_ACT)).toBe(true);
    expect(isRobotAudible(undefined, false, OUT, OUT_ACT)).toBe(true);
    expect(isRobotAudible('highlight', false, OUT, OUT_ACT)).toBe(true);
  });

  it('returns false when anySolo is true and this audioMode is not solo', () => {
    expect(isRobotAudible('none', true, OUT, OUT_ACT)).toBe(false);
    expect(isRobotAudible(undefined, true, OUT, OUT_ACT)).toBe(false);
    expect(isRobotAudible('highlight', true, OUT, OUT_ACT)).toBe(false);
  });

  it('returns true when audioMode is solo, even when anySolo is true', () => {
    expect(isRobotAudible('solo', true, OUT, OUT_ACT)).toBe(true);
  });

  it('returns true when anySolo is false, unless audioMode is itself mute', () => {
    expect(isRobotAudible('none', false, OUT, OUT_ACT)).toBe(true);
    expect(isRobotAudible('solo', false, OUT, OUT_ACT)).toBe(true);
    expect(isRobotAudible('mute', false, OUT, OUT_ACT)).toBe(false);
  });

  describe('the dock mutes on its own; Solo beats it (no-silence follow-up, Crawford 2026-11-11)', () => {
    it('a Docked or Undocking robot is silent with Off, Highlight or no mode, solo or not', () => {
      for (const docking of [DockingState.Docked, DockingState.Undocking]) {
        for (const audioMode of ['none', 'highlight', undefined] as const) {
          expect(isRobotAudible(audioMode, false, docking, 'charging'), `${audioMode}/${docking}`).toBe(false);
          expect(isRobotAudible(audioMode, true, docking, 'charging'), `${audioMode}/${docking}/solo`).toBe(false);
        }
      }
    });

    it('a soloed robot is heard in the station', () => {
      expect(isRobotAudible('solo', true, DockingState.Docked, 'charging')).toBe(true);
      expect(isRobotAudible('solo', true, DockingState.Undocking, 'charging')).toBe(true);
    });

    it('a muted robot stays silent anywhere', () => {
      for (const docking of DOCKINGS) expect(isRobotAudible('mute', false, docking, activityOf(docking))).toBe(false);
    });

    it('a Recalled robot is heard on its way home, as an Active one is', () => {
      expect(isRobotAudible('none', false, DockingState.Recalled, 'returning')).toBe(true);
      expect(isRobotAudible('highlight', false, DockingState.Recalled, 'returning')).toBe(true);
    });
  });
});

describe('isRobotEmitting (monitor mode spec §1.5: the light is lit only while the robot is heard)', () => {
  it('is true for an audible robot in the sounding set, whatever its own mode but Mute', () => {
    for (const audioMode of ['none', 'highlight', undefined] as const) {
      expect(isRobotEmitting(audioMode, false, OUT, OUT_ACT, true), String(audioMode)).toBe(true);
    }
    expect(isRobotEmitting('solo', true, OUT, OUT_ACT, true)).toBe(true);
    expect(isRobotEmitting('solo', false, OUT, OUT_ACT, true)).toBe(true);
  });

  it('is false for a muted robot, sounding or not, under a Solo or not', () => {
    for (const anySolo of [false, true]) {
      for (const isSounding of [false, true]) expect(isRobotEmitting('mute', anySolo, OUT, OUT_ACT, isSounding)).toBe(false);
    }
  });

  it('is false for a robot silenced by another robot Solo, even in the sounding set', () => {
    for (const audioMode of ['none', 'highlight', undefined] as const) {
      expect(isRobotEmitting(audioMode, true, OUT, OUT_ACT, true), String(audioMode)).toBe(false);
    }
  });

  it('is false in the station unless soloed; a soloed robot in its station that is sounding is true', () => {
    for (const docking of [DockingState.Docked, DockingState.Undocking]) {
      expect(isRobotEmitting('none', false, docking, 'charging', true)).toBe(false);
      expect(isRobotEmitting('highlight', false, docking, 'charging', true)).toBe(false);
      expect(isRobotEmitting('solo', true, docking, 'charging', true)).toBe(true);
    }
    expect(isRobotEmitting('none', false, DockingState.Recalled, 'returning', true)).toBe(true); // heard on its way home
  });

  it('is false for an audible robot the budget holds standing by', () => {
    expect(isRobotEmitting('none', false, OUT, OUT_ACT, false)).toBe(false);
    expect(isRobotEmitting('highlight', false, OUT, OUT_ACT, false)).toBe(false);
    expect(isRobotEmitting('solo', true, DockingState.Docked, 'charging', false)).toBe(false);
  });

  it('is isRobotAudible && isSounding for every combination', () => {
    for (const audioMode of AUDIO_MODES) {
      for (const anySolo of [false, true]) {
        for (const docking of DOCKINGS) {
          for (const activity of ['charging', 'returning', 'entering', OUT_ACT, undefined] as const) {
            for (const isSounding of [false, true]) {
              expect(isRobotEmitting(audioMode, anySolo, docking, activity, isSounding), `${audioMode}/${anySolo}/${docking}/${activity}/${isSounding}`)
                .toBe(isRobotAudible(audioMode, anySolo, docking, activity) && isSounding);
            }
          }
        }
      }
    }
  });
});

describe('isRobotSounding', () => {
  it('reads every robot as sounding while the sounding list is empty (the budget system has not run, so Full is a no-op)', () => {
    expect(isRobotSounding([], 'r1')).toBe(true);
    expect(isRobotSounding([], 'anything')).toBe(true);
  });

  it('is true only for robots in a non-empty list', () => {
    expect(isRobotSounding(['r1', 'r2'], 'r1')).toBe(true);
    expect(isRobotSounding(['r1', 'r2'], 'r3')).toBe(false);
  });

  it('does not treat a partial id match as membership', () => {
    expect(isRobotSounding(['robot-12'], 'robot-1')).toBe(false);
  });
});
