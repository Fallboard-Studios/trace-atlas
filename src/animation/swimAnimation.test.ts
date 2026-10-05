import { describe, it, expect, vi, afterEach } from 'vitest';
import gsap from 'gsap';
import type { Robot } from '../types/Robot';
import { setRef, clearRefs } from '../utils/refs';
import { setTimeline, getTimeline } from './timelineMap';
import { createSwimTimeline } from './swimAnimation';
import swimAnimationSource from './swimAnimation.ts?raw';
import robotSource from '../components/robot/Robot.tsx?raw';

function fakeRobot(overrides: Partial<Robot> = {}): Robot {
  return {
    id: 'robot-1',
    position: { x: 0, y: 0 },
    direction: 'right',
    ...overrides,
  } as unknown as Robot;
}

afterEach(() => {
  clearRefs();
  vi.restoreAllMocks();
});

describe('createSwimTimeline — no ref registered', () => {
  it('does not throw and returns a timeline when no ref is registered for the robot', () => {
    const robot = fakeRobot({ id: 'no-ref-robot' });
    expect(() => createSwimTimeline(robot, { x: 100, y: 0 })).not.toThrow();
    const tl = createSwimTimeline(robot, { x: 100, y: 0 });
    expect(tl).toBeDefined();
  });

  it('schedules onComplete via gsap.delayedCall (not fired synchronously) when no ref exists', () => {
    const delayedCallSpy = vi.spyOn(gsap, 'delayedCall');
    const robot = fakeRobot({ id: 'no-ref-robot', position: { x: 0, y: 0 } });
    const onComplete = vi.fn();

    createSwimTimeline(robot, { x: 120, y: 0 }, onComplete);

    expect(delayedCallSpy).toHaveBeenCalledTimes(1);
    const [estimatedDuration, scheduledFn] = delayedCallSpy.mock.calls[0];
    expect(estimatedDuration).toBeCloseTo(120 / 120); // distance 120 / SWIM_SPEED 120
    // Per vitest.setup.ts's mock, delayedCall does NOT auto-fire — assert it
    // was merely scheduled, not that onComplete has already run.
    expect(onComplete).not.toHaveBeenCalled();
    expect(typeof scheduledFn).toBe('function');
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
    // The map now holds a different (new) timeline under the same key.
    expect(getTimeline('swim-r1')).not.toBe(priorTimeline);
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
  // more, so the orientation (flip) phase is gone — propulsion always starts at position 0,
  // regardless of the robot's stored `direction`.
  it.each(['left', 'right'] as const)('propulsion starts at position 0 regardless of direction (%s)', (direction) => {
    const robot = fakeRobot({ id: `r-${direction}`, direction });
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
    const robot = fakeRobot({ id: 'r-no-flip', direction: 'left' });
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

describe('flip removal — no scaleX anywhere in the two files that used to own it (spec §1.6)', () => {
  it('Robot.tsx and swimAnimation.ts no longer mention scaleX', () => {
    expect(robotSource).not.toMatch(/scaleX/i);
    expect(swimAnimationSource).not.toMatch(/scaleX/i);
  });
});
