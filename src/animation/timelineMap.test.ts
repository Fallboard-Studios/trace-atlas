import { describe, it, expect, vi, afterEach } from 'vitest';
import gsap from 'gsap';
import {
  setTimeline,
  getTimeline,
  getTimelineScope,
  killTimeline,
  killAllTimelines,
  pauseWorldTimelines,
  resumeWorldTimelines,
  timelineMap,
} from './timelineMap';

// Power is a pause (docs/specs/OFF_SCREEN.md assumption 3, docs/tasks/OFF_SCREEN.md Task 2): every registered timeline
// carries a scope, and the world's pause and play as one set while the UI's keep running.
describe('timeline scope', () => {
  afterEach(() => killAllTimelines());

  it('registers as ui by default, reports world when asked, and undefined for an unknown id', () => {
    setTimeline('ui-thing', gsap.timeline());
    setTimeline('world-thing', gsap.timeline(), 'world');

    expect(getTimelineScope('ui-thing')).toBe('ui');
    expect(getTimelineScope('world-thing')).toBe('world');
    expect(getTimelineScope('nothing-here')).toBeUndefined();
  });

  it('pauseWorldTimelines pauses every world timeline and no ui one; resumeWorldTimelines plays the world ones again', () => {
    const swim = gsap.timeline();
    const rocker = gsap.timeline();
    setTimeline('swim-r1', swim, 'world');
    setTimeline('power-rocker', rocker);

    pauseWorldTimelines();
    expect(swim.paused()).toBe(true);
    expect(rocker.paused()).toBe(false);

    resumeWorldTimelines();
    expect(swim.paused()).toBe(false);
    expect(rocker.paused()).toBe(false);
  });

  it('pauses a world timeline registered while the world is paused, and plays it on resume', () => {
    pauseWorldTimelines();
    const late = gsap.timeline();
    setTimeline('swim-late', late, 'world');
    expect(late.paused()).toBe(true);

    resumeWorldTimelines();
    expect(late.paused()).toBe(false);
  });

  it('leaves a world timeline that was already paused before the world pause paused after the resume', () => {
    const held = gsap.timeline({ paused: true });
    setTimeline('bob-wait-r2', held, 'world');

    pauseWorldTimelines();
    resumeWorldTimelines();

    expect(held.paused()).toBe(true);
  });

  // docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R27: the paused span's edges.
  it('the resume ends the paused span: a world timeline registered after resumeWorldTimelines() plays', () => {
    pauseWorldTimelines();
    resumeWorldTimelines();

    const after = gsap.timeline();
    setTimeline('swim-after', after, 'world');
    expect(after.paused()).toBe(false);
  });

  it('a world timeline built paused and registered during the pause is its owner to play: it stays paused after the resume', () => {
    pauseWorldTimelines();
    const held = gsap.timeline({ paused: true });
    setTimeline('bob-wait-late', held, 'world');

    resumeWorldTimelines();
    expect(held.paused()).toBe(true);
  });

  it('a re-registered id drops the world pause of the timeline it replaced: a replacement built paused is not played on resume', () => {
    setTimeline('swim-r6', gsap.timeline(), 'world');
    pauseWorldTimelines();
    const replacement = gsap.timeline({ paused: true });
    setTimeline('swim-r6', replacement, 'world');

    resumeWorldTimelines();
    expect(replacement.paused()).toBe(true);
  });

  it('killTimeline forgets the scope with the timeline', () => {
    setTimeline('swim-r3', gsap.timeline(), 'world');
    killTimeline('swim-r3');
    expect(getTimelineScope('swim-r3')).toBeUndefined();
  });

  it('killAllTimelines empties the map and ends the world pause, so a later world timeline plays', () => {
    setTimeline('swim-r4', gsap.timeline(), 'world');
    pauseWorldTimelines();
    killAllTimelines();
    expect(timelineMap.size).toBe(0);

    const fresh = gsap.timeline();
    setTimeline('swim-r5', fresh, 'world');
    expect(fresh.paused()).toBe(false);
  });
});

afterEach(() => {
  timelineMap.clear();
  vi.restoreAllMocks();
});

describe('setTimeline / getTimeline', () => {
  it('round-trips a timeline for a given id', () => {
    const tl = gsap.timeline();
    setTimeline('id-1', tl);
    expect(getTimeline('id-1')).toBe(tl);
  });

  it('kills the previous timeline before overwriting an id already in use', () => {
    const first = gsap.timeline();
    const killSpy = vi.spyOn(first, 'kill');
    setTimeline('id-1', first);

    const second = gsap.timeline();
    setTimeline('id-1', second);

    expect(killSpy).toHaveBeenCalled();
    expect(getTimeline('id-1')).toBe(second);
  });
});

describe('killTimeline', () => {
  it('kills and removes a present id', () => {
    const tl = gsap.timeline();
    const killSpy = vi.spyOn(tl, 'kill');
    setTimeline('id-1', tl);

    killTimeline('id-1');

    expect(killSpy).toHaveBeenCalled();
    expect(getTimeline('id-1')).toBeUndefined();
  });

  it('is a safe no-op for an absent id', () => {
    expect(() => killTimeline('never-set')).not.toThrow();
  });
});

describe('killAllTimelines', () => {
  it('kills every entry and empties the map', () => {
    const a = gsap.timeline();
    const b = gsap.timeline();
    const killSpyA = vi.spyOn(a, 'kill');
    const killSpyB = vi.spyOn(b, 'kill');
    setTimeline('a', a);
    setTimeline('b', b);

    killAllTimelines();

    expect(killSpyA).toHaveBeenCalled();
    expect(killSpyB).toHaveBeenCalled();
    expect(timelineMap.size).toBe(0);
    expect(getTimeline('a')).toBeUndefined();
    expect(getTimeline('b')).toBeUndefined();
  });
});
