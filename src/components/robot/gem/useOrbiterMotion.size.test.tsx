// ========================================
// useOrbiterMotion — the Size dial never pops (CLAUDE.md "Visual Mapping": each dial continuous or
// animated, never a pop)
// ========================================
// Real GSAP. What is checked is the scale a local group holds at the instant of an edit, which only a
// real tween has: the recording mock in useOrbiterMotion.test.tsx never renders a value. The size
// tween is finished or parked by hand through its registered key, so no test waits on a frame.
//
// Every read is of a hidden corner's local group. The size tween covers all four locals, and a
// hidden one has no attach hop to tween its scale as well.
import { createRef } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';

vi.unmock('gsap');
// One GSAP, as in the built app. Under Vitest `@gsap/react` loads its own copy of gsap, so its
// context would never see the tweens the hook makes; registering hands it this file's copy.
gsap.registerPlugin(useGSAP);

import { useOrbiterMotion } from './useOrbiterMotion';
import { RobotGem } from './RobotGem';
import { getRobotGem } from './polygon';
import { gemPalette } from './gemPalette';
import { orbiterPlan } from './orbiterMotion';
import type { OrbiterDials } from './orbiterDials';
import { getTimeline, killAllTimelines, timelineMap } from '../../../animation/timelineMap';

// ========================================
// FIXTURES
// ========================================
const GEM_SEED = 20261004;
const GEM = getRobotGem(GEM_SEED);
const PLAN = orbiterPlan(GEM_SEED);
const PALETTE = gemPalette(GEM, '#41ad9f', 1, [1, 0.15], 20);
const ORBITER_CORNERS = ['tl', 'tr', 'bl', 'br'] as const;
const SIZE_KEY = 'orbiter-size-world-r1';

function dials(size: number): OrbiterDials {
  return { count: 1, size, lineWidth: 0.5, stripOpacity: 0.4 };
}

function Harness({ size }: { size: number }) {
  const ref = createRef<SVGGElement>();
  const d = dials(size);
  useOrbiterMotion({ root: ref, robotId: 'r1', context: 'world', gem: GEM, plan: PLAN, dials: d, enabled: true });
  return (
    <svg>
      <RobotGem
        ref={ref}
        gem={GEM}
        palette={PALETTE}
        lightOpacity={0.7}
        scale={1}
        orbiters={{ lineWidth: d.lineWidth, stripOpacity: d.stripOpacity, size: d.size, count: d.count, cornerOrder: PLAN.cornerOrder, motion: true }}
        bodyLines={{ top: 0.8, midLeft: 0.8, midRight: 0.8, stripOpacity: 0 }}
        halo={{ color: '#41ad9f', gradientId: 'halo-world-r1' }}
      />
    </svg>
  );
}

/** The local group of a corner the count leaves hidden: sized by the dial, never hopped. */
function hiddenLocal(container: HTMLElement): Element {
  const corner = PLAN.cornerOrder[3];
  const el = container.querySelector(`.gem__orbiter--${ORBITER_CORNERS[corner]} .gem__orbiter-local`);
  if (!el) throw new Error('no hidden local group');
  return el;
}

const scaleOf = (el: Element) => Number(gsap.getProperty(el, 'scale'));

/** The registered size tween, moved to `progress` (1 = finished). */
function sizeTweenTo(progress: number): void {
  const tween = getTimeline(SIZE_KEY);
  if (!tween) throw new Error('no size tween registered');
  tween.progress(progress);
}

// ========================================
// TESTS
// ========================================
describe('useOrbiterMotion — a Size edit starts from the size on screen', () => {
  beforeEach(() => {
    killAllTimelines();
  });

  afterEach(() => {
    cleanup();
    killAllTimelines();
  });

  it('a second edit leaves the orbiters at the first edit’s size until its own tween moves them', () => {
    const { container, rerender } = render(<Harness size={1} />);
    const local = hiddenLocal(container);
    sizeTweenTo(1);
    expect(scaleOf(local)).toBeCloseTo(1, 5);

    rerender(<Harness size={1.1} />);
    sizeTweenTo(1);
    expect(scaleOf(local)).toBeCloseTo(1.1, 5);

    rerender(<Harness size={1.2} />);
    expect(scaleOf(local)).toBeCloseTo(1.1, 5); // not back at the mount size
    sizeTweenTo(1);
    expect(scaleOf(local)).toBeCloseTo(1.2, 5);
  });

  it('a third edit starts from the second, however far the dial has travelled from the mount size', () => {
    const { container, rerender } = render(<Harness size={0.75} />);
    const local = hiddenLocal(container);
    sizeTweenTo(1);
    for (const size of [1, 1.25]) {
      rerender(<Harness size={size} />);
      sizeTweenTo(1);
    }

    rerender(<Harness size={1.1} />);

    expect(scaleOf(local)).toBeCloseTo(1.25, 5);
  });

  it('an edit made while the last one is still easing carries on from where the orbiters are', () => {
    const { container, rerender } = render(<Harness size={1} />);
    const local = hiddenLocal(container);
    sizeTweenTo(1);
    rerender(<Harness size={1.2} />);
    sizeTweenTo(0.5);
    const midway = scaleOf(local);
    expect(midway).toBeGreaterThan(1);
    expect(midway).toBeLessThan(1.2);

    rerender(<Harness size={0.8} />);

    expect(scaleOf(local)).toBeCloseTo(midway, 5);
    sizeTweenTo(1);
    expect(scaleOf(local)).toBeCloseTo(0.8, 5);
  });

  it('unmount drops the size tween’s key, with an edit still easing', () => {
    const { rerender, unmount } = render(<Harness size={1} />);
    rerender(<Harness size={1.2} />);
    expect(timelineMap.has(SIZE_KEY)).toBe(true);

    unmount();

    expect(timelineMap.has(SIZE_KEY)).toBe(false);
  });
});
