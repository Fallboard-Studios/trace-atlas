import { describe, it, expect, vi, afterEach } from 'vitest';
import gsap from 'gsap';
import { setTimeline, getTimeline, killTimeline, killAllTimelines, timelineMap } from './timelineMap';

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
