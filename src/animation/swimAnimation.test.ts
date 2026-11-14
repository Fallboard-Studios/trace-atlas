import { describe, it, expect, vi, afterEach } from 'vitest';
import gsap from 'gsap';
import type { Robot } from '../types/Robot';
import { setRef, clearRefs } from '../utils/refs';
import { setTimeline, getTimeline, getTimelineScope } from './timelineMap';
import { createSwimTimeline } from './swimAnimation';

function fakeRobot(overrides: Partial<Robot> = {}): Robot {
  return {
    id: 'robot-1',
    position: { x: 0, y: 0 },
    ...overrides,
  } as unknown as Robot;
}

afterEach(() => {
  clearRefs();
  vi.restoreAllMocks();
});

// A robot with no mounted body has nothing to swim. The work loop, the one caller, times that leg
// itself under the swim key, where `stopWorkLoop` can kill it; an arrival scheduled here would be
// an unkeyed `delayedCall` nothing could cancel.
describe('createSwimTimeline — no ref registered', () => {
  it('returns null', () => {
    const robot = fakeRobot({ id: 'no-ref-robot' });

    expect(createSwimTimeline(robot, { x: 100, y: 0 })).toBeNull();
  });

  it('builds, schedules and registers nothing, and never calls onComplete', async () => {
    const delayedCallSpy = vi.spyOn(gsap, 'delayedCall');
    const timelineSpy = vi.spyOn(gsap, 'timeline');
    const robot = fakeRobot({ id: 'no-ref-robot', position: { x: 0, y: 0 } });
    const onComplete = vi.fn();

    createSwimTimeline(robot, { x: 120, y: 0 }, onComplete);
    await Promise.resolve(); // the mock fires a timeline's onComplete on a microtask

    expect(delayedCallSpy).not.toHaveBeenCalled();
    expect(timelineSpy).not.toHaveBeenCalled();
    expect(getTimeline('swim-no-ref-robot')).toBeUndefined();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('leaves a timeline already registered under the swim key alone', () => {
    const robot = fakeRobot({ id: 'no-ref-robot' });
    const prior = gsap.timeline();
    const killSpy = vi.spyOn(prior, 'kill');
    setTimeline('swim-no-ref-robot', prior);

    createSwimTimeline(robot, { x: 100, y: 0 });

    expect(killSpy).not.toHaveBeenCalled();
    expect(getTimeline('swim-no-ref-robot')).toBe(prior);
  });
});

describe('createSwimTimeline — with a registered ref', () => {
  function registerFakeRef(robotId: string, withPropeller: boolean): SVGGElement {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g') as SVGGElement;
    if (withPropeller) {
      const propeller = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      propeller.setAttribute('class', 'propeller');
      g.appendChild(propeller);
    }
    setRef(`robot-${robotId}`, g);
    return g;
  }

  it('kills the prior timeline registered under swim-<id> before building the new one', () => {
    const robot = fakeRobot({ id: 'r1' });
    registerFakeRef('r1', false);

    const priorTimeline = gsap.timeline();
    const killSpy = vi.spyOn(priorTimeline, 'kill');
    setTimeline('swim-r1', priorTimeline);

    createSwimTimeline(robot, { x: 50, y: 0 });

    expect(killSpy).toHaveBeenCalled();
    // The map now holds a different (new) timeline under the same key — registered as a world mover, so the power
    // rocker's pause freezes it (docs/specs/OFF_SCREEN.md assumption 3).
    expect(getTimeline('swim-r1')).not.toBe(priorTimeline);
    expect(getTimelineScope('swim-r1')).toBe('world');
  });

  it('computes duration as distance / SWIM_SPEED for a known (diagonal) from/to pair', () => {
    const robot = fakeRobot({ id: 'r2', position: { x: 0, y: 0 } });
    registerFakeRef('r2', false);
    const tl = gsap.timeline();
    const toSpy = vi.spyOn(tl, 'to');
    vi.spyOn(gsap, 'timeline').mockReturnValueOnce(tl);

    // distance = sqrt(90^2 + 120^2) = 150; SWIM_SPEED = 120 -> duration = 1.25
    createSwimTimeline(robot, { x: 90, y: 120 });

    const propulsionCall = toSpy.mock.calls.find(
      (call) => typeof call[1] === 'object' && call[1] !== null && 'x' in (call[1] as object),
    );
    expect((propulsionCall?.[1] as unknown as { duration: number }).duration).toBeCloseTo(1.25);
  });

  // Phase 40 Task 7b (docs/specs/ORBITING_POLYGONS.md §1.6): robots have no discernible front any
  // more, so the orientation (flip) phase is gone — propulsion always starts at position 0. (The
  // stored `direction` itself went with the wandering code, Phase 43 Task 24.)
  it('propulsion starts at position 0 — no orientation phase', () => {
    const robot = fakeRobot({ id: 'r-propulsion' });
    registerFakeRef(robot.id, false);
    const tl = gsap.timeline();
    const toSpy = vi.spyOn(tl, 'to');
    vi.spyOn(gsap, 'timeline').mockReturnValueOnce(tl);

    createSwimTimeline(robot, { x: 50, y: 0 });

    const propulsionCall = toSpy.mock.calls.find(
      (call) => typeof call[1] === 'object' && call[1] !== null && 'x' in (call[1] as object),
    );
    expect(propulsionCall?.[2]).toBe(0);
  });

  it('adds no scaleX tween — robots no longer flip on direction change', () => {
    const robot = fakeRobot({ id: 'r-no-flip' });
    registerFakeRef(robot.id, false);
    const tl = gsap.timeline();
    const toSpy = vi.spyOn(tl, 'to');
    const setSpy = vi.spyOn(tl, 'set');
    vi.spyOn(gsap, 'timeline').mockReturnValueOnce(tl);

    createSwimTimeline(robot, { x: 50, y: 0 });

    const scaleXTo = toSpy.mock.calls.find((call) => typeof call[1] === 'object' && call[1] !== null && 'scaleX' in (call[1] as object));
    const scaleXSet = setSpy.mock.calls.find((call) => typeof call[1] === 'object' && call[1] !== null && 'scaleX' in (call[1] as object));
    expect(scaleXTo).toBeUndefined();
    expect(scaleXSet).toBeUndefined();
    // The tilt still needs the centred origin.
    const originSet = setSpy.mock.calls.find((call) => typeof call[1] === 'object' && call[1] !== null && 'transformOrigin' in (call[1] as object));
    expect(originSet?.[1]).toMatchObject({ transformOrigin: '50% 50%' });
  });

  it('adds no spin tween, even if a .propeller element is present', () => {
    const robot = fakeRobot({ id: 'r5', position: { x: 0, y: 0 } });
    registerFakeRef('r5', true);
    const tl = gsap.timeline();
    const toSpy = vi.spyOn(tl, 'to');
    vi.spyOn(gsap, 'timeline').mockReturnValueOnce(tl);

    createSwimTimeline(robot, { x: 240, y: 0 });

    const spinCall = toSpy.mock.calls.find(
      (call) => typeof call[1] === 'object' && call[1] !== null && 'repeat' in (call[1] as object),
    );
    expect(spinCall).toBeUndefined();
  });

  it('does not throw without a .propeller child', () => {
    const robot = fakeRobot({ id: 'r6', position: { x: 0, y: 0 } });
    registerFakeRef('r6', false);
    expect(() => createSwimTimeline(robot, { x: 60, y: 0 })).not.toThrow();
  });
});
