import { describe, it, expect } from 'vitest';

import { getAudibilityState, isRobotAudible, isRobotSounding } from './robotAudibility';

describe('isRobotAudible', () => {
  it('returns false when audioMode is mute, regardless of anySolo', () => {
    expect(isRobotAudible('mute', false)).toBe(false);
    expect(isRobotAudible('mute', true)).toBe(false);
  });

  it('returns true when audioMode is none/undefined/highlight and no robot is solo', () => {
    expect(isRobotAudible('none', false)).toBe(true);
    expect(isRobotAudible(undefined, false)).toBe(true);
    expect(isRobotAudible('highlight', false)).toBe(true);
  });

  it('returns false when anySolo is true and this audioMode is not solo', () => {
    expect(isRobotAudible('none', true)).toBe(false);
    expect(isRobotAudible(undefined, true)).toBe(false);
    expect(isRobotAudible('highlight', true)).toBe(false);
  });

  it('returns true when audioMode is solo, even when anySolo is true', () => {
    expect(isRobotAudible('solo', true)).toBe(true);
  });

  it('returns true when anySolo is false, unless audioMode is itself mute', () => {
    expect(isRobotAudible('none', false)).toBe(true);
    expect(isRobotAudible('solo', false)).toBe(true);
    expect(isRobotAudible('mute', false)).toBe(false);
  });
});

describe('getAudibilityState', () => {
  it('is disabled for a muted robot, whatever the budget or solo says', () => {
    for (const anySolo of [false, true]) {
      for (const isSounding of [false, true]) {
        expect(getAudibilityState('mute', anySolo, isSounding)).toBe('disabled');
      }
    }
  });

  it("is disabled for a robot another robot's solo excludes, whether or not it was in the sounding set", () => {
    for (const audioMode of ['none', 'highlight', undefined] as const) {
      expect(getAudibilityState(audioMode, true, true)).toBe('disabled');
      expect(getAudibilityState(audioMode, true, false)).toBe('disabled');
    }
  });

  it('is emitting for an eligible robot that is in the sounding set', () => {
    for (const audioMode of ['none', 'highlight', undefined] as const) {
      expect(getAudibilityState(audioMode, false, true)).toBe('emitting');
    }
  });

  it('is limited ("Standing by") for an eligible robot the budget is holding back', () => {
    for (const audioMode of ['none', 'highlight', undefined] as const) {
      expect(getAudibilityState(audioMode, false, false)).toBe('limited');
    }
  });

  it('treats a soloed robot as eligible, so it is emitting or limited but never disabled', () => {
    expect(getAudibilityState('solo', true, true)).toBe('emitting');
    expect(getAudibilityState('solo', true, false)).toBe('limited');
    expect(getAudibilityState('solo', false, true)).toBe('emitting');
  });

  it('is disabled exactly when isRobotAudible is false, for every combination (the two never disagree)', () => {
    for (const audioMode of ['none', 'solo', 'mute', 'highlight', undefined] as const) {
      for (const anySolo of [false, true]) {
        for (const isSounding of [false, true]) {
          expect(getAudibilityState(audioMode, anySolo, isSounding) === 'disabled', `${audioMode}/${anySolo}/${isSounding}`)
            .toBe(!isRobotAudible(audioMode, anySolo));
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
