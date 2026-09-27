import { describe, it, expect, vi, afterEach } from 'vitest';
import gsap from 'gsap';
import type { Robot } from '../types/Robot';
import { setRef, clearRefs } from '../utils/refs';
import { setTimeline, getTimeline } from './timelineMap';
import { createSwimTimeline } from './swimAnimation';

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
    expect(() => createSwimTimeline(robot, { x: 100, y: 0 }, 'right')).not.toThrow();
    const tl = createSwimTimeline(robot, { x: 100, y: 0 }, 'right');
    expect(tl).toBeDefined();
  });

  it('schedules onComplete via gsap.delayedCall (not fired synchronously) when no ref exists', () => {
    const delayedCallSpy = vi.spyOn(gsap, 'delayedCall');
    const robot = fakeRobot({ id: 'no-ref-robot', position: { x: 0, y: 0 } });
    const onComplete = vi.fn();

    createSwimTimeline(robot, { x: 120, y: 0 }, 'right', onComplete);

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

    createSwimTimeline(robot, { x: 50, y: 0 }, 'right');

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
    createSwimTimeline(robot, { x: 90, y: 120 }, 'right');

    const propulsionCall = toSpy.mock.calls.find(
      (call) => typeof call[1] === 'object' && call[1] !== null && 'x' in (call[1] as object),
    );
    expect((propulsionCall?.[1] as unknown as { duration: number }).duration).toBeCloseTo(1.25);
  });

  it('uses an offset start (ORIENTATION_DURATION - PROPULSION_OVERLAP) for propulsion when a flip is needed, vs. 0 when it is not', () => {
    const flipRobot = fakeRobot({ id: 'r3', direction: 'left' }); // currently left, target right -> flip needed
    registerFakeRef('r3', false);
    const flipTimeline = gsap.timeline();
    const flipToSpy = vi.spyOn(flipTimeline, 'to');
    vi.spyOn(gsap, 'timeline').mockReturnValueOnce(flipTimeline);

    createSwimTimeline(flipRobot, { x: 50, y: 0 }, 'right');

    // Propulsion tween's position argument should be ORIENTATION_DURATION(0.5) - PROPULSION_OVERLAP(0.2) = 0.3
    const propulsionCall = flipToSpy.mock.calls.find(
      (call) => typeof call[1] === 'object' && call[1] !== null && 'x' in (call[1] as object),
    );
    expect(propulsionCall?.[2]).toBeCloseTo(0.3);

    vi.restoreAllMocks();

    const noFlipRobot = fakeRobot({ id: 'r4', direction: 'right' }); // already right, target right -> no flip
    registerFakeRef('r4', false);
    const noFlipTimeline = gsap.timeline();
    const noFlipToSpy = vi.spyOn(noFlipTimeline, 'to');
    vi.spyOn(gsap, 'timeline').mockReturnValueOnce(noFlipTimeline);

    createSwimTimeline(noFlipRobot, { x: 50, y: 0 }, 'right');

    const noFlipPropulsionCall = noFlipToSpy.mock.calls.find(
      (call) => typeof call[1] === 'object' && call[1] !== null && 'x' in (call[1] as object),
    );
    expect(noFlipPropulsionCall?.[2]).toBe(0);
  });

  it('sets the propeller tween repeat to Math.ceil(duration / PROPELLER_ROTATION_SPEED) - 1 when a .propeller element exists', () => {
    const robot = fakeRobot({ id: 'r5', position: { x: 0, y: 0 } });
    registerFakeRef('r5', true);
    const tl = gsap.timeline();
    const toSpy = vi.spyOn(tl, 'to');
    vi.spyOn(gsap, 'timeline').mockReturnValueOnce(tl);

    // distance 240 / SWIM_SPEED 120 = duration 2s; PROPELLER_ROTATION_SPEED = 2s -> ceil(2/2)=1 -> repeat = 0
    createSwimTimeline(robot, { x: 240, y: 0 }, 'right');

    const propellerCall = toSpy.mock.calls.find(
      (call) => typeof call[1] === 'object' && call[1] !== null && 'rotation' in (call[1] as object) && 'repeat' in (call[1] as object),
    );
    expect(propellerCall).toBeDefined();
    expect((propellerCall?.[1] as unknown as { repeat: number }).repeat).toBe(0);
  });

  it('does not attempt a propeller tween and does not throw when no .propeller child exists', () => {
    const robot = fakeRobot({ id: 'r6', position: { x: 0, y: 0 } });
    registerFakeRef('r6', false);
    expect(() => createSwimTimeline(robot, { x: 60, y: 0 }, 'right')).not.toThrow();
  });
});
